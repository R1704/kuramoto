import { MAX_GRAPH_DEGREE } from '../topology/index.js';
import {
    initBuffers as initBuffersFn,
    writeLayerParams as writeLayerParamsFn,
    writeTopology as writeTopologyFn,
    writeTheta as writeThetaFn,
    writeS2 as writeS2Fn,
    writeS3 as writeS3Fn,
    writeOmega as writeOmegaFn,
    writeOmegaVec as writeOmegaVecFn,
    writeGaugeField as writeGaugeFieldFn,
    writeGraphGauge as writeGraphGaugeFn,
    writeInputWeights as writeInputWeightsFn,
    setInputSignal as setInputSignalFn,
    writePrismaticState as writePrismaticStateFn,
    setGaugeParams as setGaugeParamsFn,
    setInteractionParams as setInteractionParamsFn
} from './buffers.js';
import {
    initPipeline as initPipelineFn,
    initReductionPipeline as initReductionPipelineFn,
    getBindGroup as getBindGroupFn,
    getS2BindGroup as getS2BindGroupFn,
    getS3BindGroup as getS3BindGroupFn,
    getGaugeUpdateBindGroup as getGaugeUpdateBindGroupFn,
    getPrismaticMetricsBindGroup as getPrismaticMetricsBindGroupFn
} from './pipelines.js';
import {
    requestGlobalOrderReadback as requestGlobalOrderReadbackFn,
    processReadback as processReadbackFn,
    getLastGlobalOrder as getLastGlobalOrderFn,
    getLastLocalStats as getLastLocalStatsFn,
    readTheta as readThetaFn,
    readS2 as readS2Fn,
    readS3 as readS3Fn,
    readGaugeField as readGaugeFieldFn,
    readGaugeFieldDecimated as readGaugeFieldDecimatedFn,
    readThetaNeighborhood as readThetaNeighborhoodFn,
    requestPrismaticMetricsReadback as requestPrismaticMetricsReadbackFn,
    processPrismaticMetricsReadback as processPrismaticMetricsReadbackFn,
    getOmega as getOmegaFn,
    storeOmega as storeOmegaFn
} from './readback.js';
import {
    interpolateScalar as interpolateScalarFn,
    interpolateTheta as interpolateThetaFn,
    interpolateThetaLayers as interpolateThetaLayersFn,
    resizePreservingState as resizePreservingStateFn,
    waitForIdle as waitForIdleFn,
    destroy as destroyFn,
    resize as resizeFn
} from './resize.js';

export class Simulation {
    constructor(device, gridSize, layerCount = 1) {
        this.device = device;
        this.gridSize = gridSize;
        this.layers = Math.max(1, Math.floor(layerCount));
        this.layerSize = gridSize * gridSize;
        this.N = this.layerSize * this.layers;
        this.maxGraphDegree = MAX_GRAPH_DEGREE;
        this.delayBufferSize = 32;
        this.delayBufferIndex = 0;
        this.delayBuffers = [];
        this.paramsManifoldMode = 's1';
        this.paramsColormap = 0;
        this.topologyModeValue = 0;
        this.gaugeEnabled = false;
        this.gaugeDynamic = false;

        this.initBuffers();
        this.initPipeline();
        this.initReductionPipeline();
    }

    initBuffers() {
        return initBuffersFn.call(this);
    }

    initPipeline() {
        return initPipelineFn.call(this);
    }

    initReductionPipeline() {
        return initReductionPipelineFn.call(this);
    }

    getBindGroup(delaySteps) {
        return getBindGroupFn.call(this, delaySteps);
    }

    getS2BindGroup() {
        return getS2BindGroupFn.call(this);
    }

    getS3BindGroup() {
        return getS3BindGroupFn.call(this);
    }

    getGaugeUpdateBindGroup() {
        return getGaugeUpdateBindGroupFn.call(this);
    }

    getPrismaticMetricsBindGroup(thetaIdx = this.thetaIndex, prismaticIdx = this.prismaticIndex) {
        return getPrismaticMetricsBindGroupFn.call(this, thetaIdx, prismaticIdx);
    }

    writeLayerParams(layers) {
        return writeLayerParamsFn.call(this, layers);
    }

    writeTopology(topology) {
        return writeTopologyFn.call(this, topology);
    }
    updateParams(p) {
        // Only update frequently changing parameters to reduce bandwidth
        // Write dt and time at their offsets (0 and 15*4 bytes)
        const dtData = new Float32Array([p.dt * p.timeScale * (p.paused ? 0 : 1)]);
        this.device.queue.writeBuffer(this.paramsBuf, 0, dtData);
        
        const timeData = new Float32Array([p.frameTime]);
        this.device.queue.writeBuffer(this.paramsBuf, 16 * 4, timeData);

        this.paramsManifoldMode = p.manifoldMode || 's1';
        setInteractionParamsFn.call(this, p);
        
        // Only write full params if something other than dt/time changed
        // (This will be called explicitly when params change via updateFullParams)
    }

    updateFullParams(p) {
        // Pack all parameters - called only when user changes settings
        // Layout matches shader structs (80 floats = 320 bytes)
        const injMode = (() => {
            if (typeof p.rcInjectionMode === 'string') {
                if (p.rcInjectionMode === 'phase_drive') return 1;
                if (p.rcInjectionMode === 'coupling_mod') return 2;
                return 0;
            }
            return p.rcInjectionMode || 0;
        })();
        const topoMode = (() => {
            if (p.topologyMode === 'ws' || p.topologyMode === 'watts_strogatz') return 1;
            if (p.topologyMode === 'ba' || p.topologyMode === 'barabasi_albert') return 2;
            return 0;
        })();
        const layerCount = this.layers || 1;
        const activeLayer = Math.min(layerCount - 1, Math.max(0, Math.floor(p.activeLayer ?? 0)));
        const globalCouplingEnabled = !!p.globalCoupling && !(p.manifoldMode === 's1' && p.gaugeEnabled);
        this.paramsManifoldMode = p.manifoldMode || 's1';
        const data = new Float32Array([
            // 0-3
            p.dt * p.timeScale * (p.paused ? 0 : 1), p.K0, p.range, p.ruleMode,
            // 4-7
            this.gridSize, this.gridSize, p.harmonicA, globalCouplingEnabled ? 1.0 : 0.0,
            // 8-11
            p.delaySteps, p.sigma, p.sigma2, p.beta,
            // 12-15
            p.showOrder ? 1.0 : 0.0, p.colormap, p.colormapPalette ?? 0, p.noiseStrength,
            // 16-19
            p.frameTime, p.harmonicB, p.viewMode, p.kernelShape,
            // 20-23
            p.kernelOrientation, p.kernelAspect, p.kernelScale2Weight, p.kernelScale3Weight,
            // 24-27
            p.kernelAsymmetry, p.kernelRings, p.kernelRingWidths[0], p.kernelRingWidths[1],
            // 28-31
            p.kernelRingWidths[2], p.kernelRingWidths[3], p.kernelRingWidths[4], p.kernelRingWeights[0],
            // 32-35
            p.kernelRingWeights[1], p.kernelRingWeights[2], p.kernelRingWeights[3], p.kernelRingWeights[4],
            // 36-39
            p.kernelCompositionEnabled ? 1.0 : 0.0, p.kernelSecondary, p.kernelMixRatio, p.kernelAsymmetricOrientation,
            // 40-42
            p.kernelSpatialFreqMag, p.kernelSpatialFreqAngle, p.kernelGaborPhase,
            // 43-45
            p.zoom || 1.0, p.panX || 0.0, p.panY || 0.0,
            // 46-49
            (p.smoothingMode ?? 0) > 0 ? 1.0 : 0.0, p.smoothingMode ?? 0, injMode, p.leak ?? 0.0,
            // 50-51 layer Z offset + pad
            p.layerZOffset ?? 0.0, p.layerKernelEnabled ? 1.0 : 0.0,
            // 52-55 interaction scale
            p.scaleBase ?? 1.0, p.scaleRadial ?? 0.0, p.scaleRandom ?? 0.0, p.scaleRing ?? 0.0,
            // 56-59 flow
            p.flowRadial ?? 0.0, p.flowRotate ?? 0.0, p.flowSwirl ?? 0.0, p.flowBubble ?? 0.0,
            // 60-62 more flow
            p.flowRing ?? 0.0, p.flowVortex ?? 0.0, p.flowVertical ?? 0.0,
            // 63-66 orientation
            p.orientRadial ?? 0.0, p.orientCircles ?? 0.0, p.orientSwirl ?? 0.0, p.orientBubble ?? 0.0,
            // 67
            p.orientLinear ?? 0.0,
            // 68-71 mesh flag + manifold mode + pads
            (p.surfaceMode === 'mesh' ? 1.0 : 0.0), (p.manifoldMode === 's2' ? 1.0 : (p.manifoldMode === 's3' ? 2.0 : 0.0)), 0, 0,
            // 72-75 topology mode/meta
            topoMode, this.maxGraphDegree, p.topologyAvgDegree ?? 0, 0,
            // 76-79 layer meta (coupling removed - now per-layer)
            layerCount, 0, 0, activeLayer
        ]);
        this.device.queue.writeBuffer(this.paramsBuf, 0, data);
        this.topologyModeValue = topoMode;
        this.paramsColormap = p.colormap ?? 0;
        const gaugeState = (p.manifoldMode === 's1')
            ? p
            : { ...p, gaugeEnabled: false, gaugeMode: 'static' };
        setGaugeParamsFn.call(this, gaugeState);
        setInteractionParamsFn.call(this, p);
    }

    setManifoldMode(mode) {
        const next = mode || 's1';
        if (this.paramsManifoldMode === next) return;
        this.paramsManifoldMode = next;
        if (next === 's2' || next === 's3') {
            this.thetaTexture = null;
        }
    }

    step(commandEncoder, delaySteps, globalCoupling, computeStats = true) {
        const useS2 = this.paramsManifoldMode === 's2';
        const useS3 = this.paramsManifoldMode === 's3';
        const useVectorManifold = useS2 || useS3;
        const currentIdx = this.thetaIndex;
        const nextIdx = currentIdx ^ 1;
        const currentThetaTex = this.thetaTextures[currentIdx];
        const currentPrismaticIdx = this.prismaticIndex;
        const nextPrismaticIdx = currentPrismaticIdx ^ 1;
        const gaugeDynamic = (!useVectorManifold) && this.gaugeEnabled && this.gaugeDynamic && (this.topologyModeValue === 0);

        if (gaugeDynamic) {
            const gaugePass = commandEncoder.beginComputePass();
            gaugePass.setPipeline(this.gaugeUpdatePipeline);
            gaugePass.setBindGroup(0, this.getGaugeUpdateBindGroup());
            const gaugeWg = Math.ceil(this.gridSize / 16);
            gaugePass.dispatchWorkgroups(gaugeWg, gaugeWg, this.layers);
            gaugePass.end();

            this.gaugeIndex = this.gaugeIndex ^ 1;
            this.gaugeXTexture = this.gaugeXTextures[this.gaugeIndex];
            this.gaugeYTexture = this.gaugeYTextures[this.gaugeIndex];
        }

        // Only compute statistics if requested (allows throttling for performance)
        if (computeStats) {
            // Reset atomic accumulators to zero
            if (!useVectorManifold) {
                commandEncoder.clearBuffer(this.globalOrderAtomicBuf, 0, 8);
            } else if (useS2) {
                commandEncoder.clearBuffer(this.globalOrderAtomicBuf, 0, 12);  // 3 atomics for S²
            } else {
                commandEncoder.clearBuffer(this.globalOrderAtomicBuf, 0, 16);  // 4 atomics for S³
            }
            commandEncoder.clearBuffer(this.localStatsAtomicBuf, 0, 16);
            commandEncoder.clearBuffer(this.localHistAtomicBuf, 0, 64);

            const workgroups = Math.ceil(this.N / 256);
            if (!useVectorManifold) {
                // Copy current theta texture to staging buffer for reduction shader
                commandEncoder.copyTextureToBuffer(
                    { texture: currentThetaTex },
                    { buffer: this.thetaStagingBuf, bytesPerRow: this.gridSize * 4, rowsPerImage: this.gridSize },
                    [this.gridSize, this.gridSize, this.layers]
                );
                
                // Stage 1: Parallel reduction with atomic accumulation (uses staging buffer)
                if (!this.reductionBindGroups[currentIdx]) {
                    this.reductionBindGroups[currentIdx] = this.device.createBindGroup({
                        layout: this.reductionPipeline.getBindGroupLayout(0),
                        entries: [
                            { binding: 0, resource: { buffer: this.thetaStagingBuf } },
                            { binding: 1, resource: { buffer: this.globalOrderAtomicBuf } },
                        ],
                    });
                }
                const reductionBindGroup = this.reductionBindGroups[currentIdx];
                const reductionPass = commandEncoder.beginComputePass();
                reductionPass.setPipeline(this.reductionPipeline);
                reductionPass.setBindGroup(0, reductionBindGroup);
                reductionPass.dispatchWorkgroups(workgroups);
                reductionPass.end();
                
                // Stage 2: Normalize by N and convert to float
                const normalizePass = commandEncoder.beginComputePass();
                normalizePass.setPipeline(this.normalizePipeline);
                normalizePass.setBindGroup(0, this.normalizeBindGroup);
                normalizePass.dispatchWorkgroups(1);
                normalizePass.end();
                
                // ============= LOCAL ORDER STATISTICS =============
                // Stage 1: Parallel reduction of local R values
                const localStatsPass = commandEncoder.beginComputePass();
                localStatsPass.setPipeline(this.localStatsPipeline);
                localStatsPass.setBindGroup(0, this.localStatsBindGroup);
                localStatsPass.dispatchWorkgroups(workgroups);
                localStatsPass.end();
                
                // Stage 2: Normalize local stats
                const localStatsNormalizePass = commandEncoder.beginComputePass();
                localStatsNormalizePass.setPipeline(this.localStatsNormalizePipeline);
                localStatsNormalizePass.setBindGroup(0, this.localStatsNormalizeBindGroup);
                localStatsNormalizePass.dispatchWorkgroups(1);
                localStatsNormalizePass.end();
            } else {
                // S² or S³: use vector manifold statistics
                commandEncoder.copyTextureToBuffer(
                    { texture: this.s2Texture },
                    { buffer: this.s2StagingBuf, bytesPerRow: this.gridSize * 16, rowsPerImage: this.gridSize },
                    [this.gridSize, this.gridSize, this.layers]
                );

                if (useS3) {
                    // S³: 4-component quaternion reduction
                    if (!this.s3ReductionBindGroups[this.s2Index]) {
                        this.s3ReductionBindGroups[this.s2Index] = this.device.createBindGroup({
                            layout: this.s3ReductionPipeline.getBindGroupLayout(0),
                            entries: [
                                { binding: 0, resource: { buffer: this.s2StagingBuf } },
                                { binding: 1, resource: { buffer: this.globalOrderAtomicBuf } },
                            ],
                        });
                    }
                    const s3ReductionPass = commandEncoder.beginComputePass();
                    s3ReductionPass.setPipeline(this.s3ReductionPipeline);
                    s3ReductionPass.setBindGroup(0, this.s3ReductionBindGroups[this.s2Index]);
                    s3ReductionPass.dispatchWorkgroups(workgroups);
                    s3ReductionPass.end();

                    const s3NormalizePass = commandEncoder.beginComputePass();
                    s3NormalizePass.setPipeline(this.s3NormalizePipeline);
                    s3NormalizePass.setBindGroup(0, this.s3NormalizeBindGroup);
                    s3NormalizePass.dispatchWorkgroups(1);
                    s3NormalizePass.end();

                    const s3LocalPass = commandEncoder.beginComputePass();
                    s3LocalPass.setPipeline(this.s3LocalStatsPipeline);
                    s3LocalPass.setBindGroup(0, this.s3LocalStatsBindGroup);
                    s3LocalPass.dispatchWorkgroups(workgroups);
                    s3LocalPass.end();
                } else {
                    // S²: 3-component vector reduction
                    if (!this.s2ReductionBindGroups[this.s2Index]) {
                        this.s2ReductionBindGroups[this.s2Index] = this.device.createBindGroup({
                            layout: this.s2ReductionPipeline.getBindGroupLayout(0),
                            entries: [
                                { binding: 0, resource: { buffer: this.s2StagingBuf } },
                                { binding: 1, resource: { buffer: this.globalOrderAtomicBuf } },
                            ],
                        });
                    }
                    const s2ReductionPass = commandEncoder.beginComputePass();
                    s2ReductionPass.setPipeline(this.s2ReductionPipeline);
                    s2ReductionPass.setBindGroup(0, this.s2ReductionBindGroups[this.s2Index]);
                    s2ReductionPass.dispatchWorkgroups(workgroups);
                    s2ReductionPass.end();

                    const s2NormalizePass = commandEncoder.beginComputePass();
                    s2NormalizePass.setPipeline(this.s2NormalizePipeline);
                    s2NormalizePass.setBindGroup(0, this.s2NormalizeBindGroup);
                    s2NormalizePass.dispatchWorkgroups(1);
                    s2NormalizePass.end();

                    const s2LocalPass = commandEncoder.beginComputePass();
                    s2LocalPass.setPipeline(this.s2LocalStatsPipeline);
                    s2LocalPass.setBindGroup(0, this.s2LocalStatsBindGroup);
                    s2LocalPass.dispatchWorkgroups(workgroups);
                    s2LocalPass.end();
                }

                const localNormPass = commandEncoder.beginComputePass();
                localNormPass.setPipeline(this.localStatsNormalizePipeline);
                localNormPass.setBindGroup(0, this.localStatsNormalizeBindGroup);
                localNormPass.dispatchWorkgroups(1);
                localNormPass.end();
            }
        }

        if (!useVectorManifold) {
            // Copy current theta texture to delay buffer history (via staging buffer)
            // Only do this if we haven't already copied for stats, or if stats were skipped
            if (!computeStats) {
                commandEncoder.copyTextureToBuffer(
                    { texture: currentThetaTex },
                    { buffer: this.thetaStagingBuf, bytesPerRow: this.gridSize * 4, rowsPerImage: this.gridSize },
                    [this.gridSize, this.gridSize, this.layers]
                );
            }
            commandEncoder.copyBufferToBuffer(this.thetaStagingBuf, 0, this.delayBuffers[this.delayBufferIndex], 0, this.N * 4);
            this.delayBufferIndex = (this.delayBufferIndex + 1) % this.delayBufferSize;

            const pass = commandEncoder.beginComputePass();
            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, this.getBindGroup(delaySteps));
            const wgCount = Math.ceil(this.gridSize / 16);
            pass.dispatchWorkgroups(wgCount, wgCount, this.layers);
            pass.end();

            // Swap textures
            this.thetaIndex = nextIdx;
            this.thetaTexture = this.thetaTextures[this.thetaIndex];
            this.prismaticIndex = nextPrismaticIdx;
            this.prismaticStateTexture = this.prismaticStateTextures[this.prismaticIndex];

            if (this.paramsManifoldMode === 's1' && this.topologyModeValue === 0 && this.audioFeatureEnabled) {
                const atomicBytes = (this.prismaticMetricsAtomicCount || 20) * 4;
                commandEncoder.clearBuffer(this.prismaticMetricsAtomicBuf, 0, atomicBytes);
                const metricsPass = commandEncoder.beginComputePass();
                metricsPass.setPipeline(this.prismaticMetricsReductionPipeline);
                metricsPass.setBindGroup(0, this.getPrismaticMetricsBindGroup(this.thetaIndex, this.prismaticIndex));
                const metricsWg = Math.ceil(this.gridSize / 16);
                metricsPass.dispatchWorkgroups(metricsWg, metricsWg, this.layers);
                metricsPass.end();

                const metricsNormalizePass = commandEncoder.beginComputePass();
                metricsNormalizePass.setPipeline(this.prismaticMetricsNormalizePipeline);
                metricsNormalizePass.setBindGroup(0, this.prismaticMetricsNormalizeBindGroup);
                metricsNormalizePass.dispatchWorkgroups(1);
                metricsNormalizePass.end();
            }
        } else if (useS3) {
            // S³ compute pass
            const pass = commandEncoder.beginComputePass();
            pass.setPipeline(this.s3Pipeline);
            pass.setBindGroup(0, this.getS3BindGroup());
            const wgCount = Math.ceil(this.gridSize / 16);
            pass.dispatchWorkgroups(wgCount, wgCount, this.layers);
            pass.end();

            this.s2Index = this.s2Index ^ 1;
            this.s2Texture = this.s2Textures[this.s2Index];
        } else {
            // S² compute pass
            const pass = commandEncoder.beginComputePass();
            pass.setPipeline(this.s2Pipeline);
            pass.setBindGroup(0, this.getS2BindGroup());
            const wgCount = Math.ceil(this.gridSize / 16);
            pass.dispatchWorkgroups(wgCount, wgCount, this.layers);
            pass.end();

            this.s2Index = this.s2Index ^ 1;
            this.s2Texture = this.s2Textures[this.s2Index];
        }
    }

    writeTheta(data) {
        return writeThetaFn.call(this, data);
    }

    writeS2(data) {
        return writeS2Fn.call(this, data);
    }

    writeS3(data) {
        return writeS3Fn.call(this, data);
    }

    writeOmega(data) {
        return writeOmegaFn.call(this, data);
    }

    writeOmegaVec(data) {
        return writeOmegaVecFn.call(this, data);
    }

    writeGaugeField(ax, ay) {
        return writeGaugeFieldFn.call(this, ax, ay);
    }

    writeGraphGauge(data) {
        return writeGraphGaugeFn.call(this, data);
    }

    setGaugeParams(state) {
        return setGaugeParamsFn.call(this, state);
    }

    setInteractionParams(state) {
        return setInteractionParamsFn.call(this, state);
    }

    writeInputWeights(weights) {
        return writeInputWeightsFn.call(this, weights);
    }

    setInputSignal(signal) {
        return setInputSignalFn.call(this, signal);
    }

    writePrismaticState(data = null) {
        return writePrismaticStateFn.call(this, data);
    }

    requestGlobalOrderReadback(commandEncoder) {
        return requestGlobalOrderReadbackFn.call(this, commandEncoder);
    }

    async processReadback() {
        return processReadbackFn.call(this);
    }

    getLastGlobalOrder() {
        return getLastGlobalOrderFn.call(this);
    }

    getLastLocalStats() {
        return getLastLocalStatsFn.call(this);
    }

    async readTheta() {
        return readThetaFn.call(this);
    }

    async readS2() {
        return readS2Fn.call(this);
    }

    async readS3() {
        return readS3Fn.call(this);
    }

    async readGaugeField() {
        return readGaugeFieldFn.call(this);
    }

    async readGaugeFieldDecimated(layer = 0, stride = 1) {
        return readGaugeFieldDecimatedFn.call(this, layer, stride);
    }

    async readThetaNeighborhood(layer = 0, c = 0, r = 0, radius = 1) {
        return readThetaNeighborhoodFn.call(this, layer, c, r, radius);
    }

    requestPrismaticMetricsReadback(commandEncoder) {
        return requestPrismaticMetricsReadbackFn.call(this, commandEncoder);
    }

    async processPrismaticMetricsReadback() {
        return processPrismaticMetricsReadbackFn.call(this);
    }

    getOmega() {
        return getOmegaFn.call(this);
    }

    storeOmega(data) {
        return storeOmegaFn.call(this, data);
    }

    static interpolateScalar(data, srcSize, dstSize, layers = 1) {
        return interpolateScalarFn(data, srcSize, dstSize, layers);
    }

    static interpolateTheta(theta, srcSize, dstSize) {
        return interpolateThetaFn(theta, srcSize, dstSize);
    }

    static interpolateThetaLayers(theta, srcSize, dstSize, layers) {
        return interpolateThetaLayersFn(theta, srcSize, dstSize, layers);
    }

    async resizePreservingState(newGridSize) {
        return resizePreservingStateFn.call(this, newGridSize);
    }

    async waitForIdle(maxMs = 200) {
        return waitForIdleFn.call(this, maxMs);
    }

    destroy() {
        return destroyFn.call(this);
    }

    resize(newGridSize) {
        return resizeFn.call(this, newGridSize);
    }
}
