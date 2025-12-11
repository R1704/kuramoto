import { COMPUTE_SHADER, GLOBAL_ORDER_REDUCTION_SHADER, GLOBAL_ORDER_NORMALIZE_SHADER, LOCAL_ORDER_STATS_SHADER, LOCAL_ORDER_STATS_NORMALIZE_SHADER } from './shaders.js';
import { MAX_GRAPH_DEGREE } from './topology.js';

export class Simulation {
    constructor(device, gridSize) {
        this.device = device;
        this.gridSize = gridSize;
        this.N = gridSize * gridSize;
        this.maxGraphDegree = MAX_GRAPH_DEGREE;
        this.delayBufferSize = 32;
        this.delayBufferIndex = 0;
        this.delayBuffers = [];
        
        this.initBuffers();
        this.initPipeline();
        this.initReductionPipeline();
    }

    initBuffers() {
        const bufferUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
        
        // Using textures for theta (better 2D spatial cache locality)
        this.thetaTextures = [
            this.device.createTexture({
                size: [this.gridSize, this.gridSize],
                format: 'r32float',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
            }),
            this.device.createTexture({
                size: [this.gridSize, this.gridSize],
                format: 'r32float',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
            })
        ];
        this.thetaIndex = 0;
        this.thetaTexture = this.thetaTextures[this.thetaIndex];
        
        // Staging buffer for reading back texture data (for delay buffers and reduction)
        this.thetaStagingBuf = this.device.createBuffer({
            size: this.N * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });
        
        this.omegaBuf = this.device.createBuffer({ size: this.N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.orderBuf = this.device.createBuffer({ size: this.N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        // Params buffer: padded to 304 bytes (76 floats, 16-byte aligned)
        this.paramsBuf = this.device.createBuffer({ size: 304, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

        // Global order parameter buffer (stores complex mean field Z = (cos, sin) as vec2)
        this.globalOrderBuf = this.device.createBuffer({ 
            size: 8, // vec2<f32> = 2 * 4 bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });
        
        // Atomic accumulator for reduction (scaled integers for thread safety)
        this.globalOrderAtomicBuf = this.device.createBuffer({
            size: 8, // 2 * i32 = 2 * 4 bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        // Staging buffer for reading back global order parameter (for statistics)
        this.globalOrderReadbackBuf = this.device.createBuffer({
            size: 8,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        });
        
        // Track if readback is pending
        this.readbackPending = false;
        this.mappingInProgress = false;  // Guard against concurrent mapAsync calls
        this.thetaReadPending = false; // Guard for RC theta reads
        this.lastGlobalOrder = { cos: 0, sin: 0, R: 0, Psi: 0 };
        this.lastLocalStats = { meanR: 0, syncFraction: 0, gradient: 0, variance: 0 };
        
        this.device.queue.writeBuffer(this.globalOrderBuf, 0, new Float32Array([0, 0]));

        // Initialize order buffer
        this.device.queue.writeBuffer(this.orderBuf, 0, new Float32Array(this.N).fill(0.5));

        // ============= LOCAL ORDER STATISTICS BUFFERS =============
        // Atomic accumulator for local order stats (4 values: sum_r, sync_count, sum_grad, sum_r2)
        this.localStatsAtomicBuf = this.device.createBuffer({
            size: 4 * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        // Histogram atomic buffer (16 bins)
        this.localHistAtomicBuf = this.device.createBuffer({
            size: 16 * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        // Output buffer for normalized statistics (5 floats + 16-bin histogram)
        this.localStatsBuf = this.device.createBuffer({
            size: (5 + 16) * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });
        
        // Staging buffer for reading back local stats
        this.localStatsReadbackBuf = this.device.createBuffer({
            size: (5 + 16) * 4,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        });
        
        // Uniform for grid size (needed by local stats shader)
        this.gridSizeUniformBuf = this.device.createBuffer({
            size: 4, // u32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(this.gridSizeUniformBuf, 0, new Uint32Array([this.gridSize]));
        
        // Uniform for N (needed by normalize shader)
        this.nUniformBuf = this.device.createBuffer({
            size: 4, // u32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(this.nUniformBuf, 0, new Uint32Array([this.N]));

        // ============= GRAPH TOPOLOGY BUFFERS =============
        const neighborSlots = this.N * this.maxGraphDegree;
        this.graphNeighborsBuf = this.device.createBuffer({
            size: neighborSlots * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.graphWeightsBuf = this.device.createBuffer({
            size: neighborSlots * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.graphCountsBuf = this.device.createBuffer({
            size: this.N * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        // ============= RESERVOIR COMPUTING BUFFERS =============
        // Input weights: how strongly each oscillator receives input signal
        this.inputWeightsBuf = this.device.createBuffer({
            size: this.N * 4, // N * f32
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        // Initialize to zero (no input by default)
        this.device.queue.writeBuffer(this.inputWeightsBuf, 0, new Float32Array(this.N));
        
        // Current input signal value (scalar uniform)
        this.inputSignalBuf = this.device.createBuffer({
            size: 4, // f32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(this.inputSignalBuf, 0, new Float32Array([0]));

        // Delay buffers (still use storage buffers - not on critical path)
        for (let i = 0; i < this.delayBufferSize; i++) {
            this.delayBuffers.push(this.device.createBuffer({ size: this.N * 4, usage: bufferUsage }));
        }
    }

    initPipeline() {
        const module = this.device.createShaderModule({ code: COMPUTE_SHADER });
        this.pipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module, entryPoint: 'main' }
        });
        
        // Cache bind groups for each delay step
        this.bindGroupCache = new Map();
    }

    initReductionPipeline() {
        // Stage 1: Parallel reduction with atomic accumulation
        const reductionModule = this.device.createShaderModule({ code: GLOBAL_ORDER_REDUCTION_SHADER });
        this.reductionPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: reductionModule, entryPoint: 'main' }
        });
        
        // Stage 2: Normalize the accumulated sum
        const normalizeModule = this.device.createShaderModule({ code: GLOBAL_ORDER_NORMALIZE_SHADER });
        this.normalizePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: normalizeModule, entryPoint: 'main' }
        });
        
        // Bind groups for reduction stage (per theta buffer)
        this.reductionBindGroups = [null, null];
        
        // Bind group for normalize stage
        this.normalizeBindGroup = this.device.createBindGroup({
            layout: this.normalizePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.globalOrderAtomicBuf } },
                { binding: 1, resource: { buffer: this.globalOrderBuf } },
                { binding: 2, resource: { buffer: this.paramsBuf } }, // For N
            ],
        });
        
        // ============= LOCAL ORDER STATISTICS PIPELINES =============
        const localStatsModule = this.device.createShaderModule({ code: LOCAL_ORDER_STATS_SHADER });
        this.localStatsPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: localStatsModule, entryPoint: 'main' }
        });
        
        const localStatsNormalizeModule = this.device.createShaderModule({ code: LOCAL_ORDER_STATS_NORMALIZE_SHADER });
        this.localStatsNormalizePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: localStatsNormalizeModule, entryPoint: 'main' }
        });
        
        // Create bind groups for local stats
        this.localStatsBindGroup = this.device.createBindGroup({
            layout: this.localStatsPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.orderBuf } },          // local order values
                { binding: 1, resource: { buffer: this.thetaStagingBuf } },   // theta for gradient
                { binding: 2, resource: { buffer: this.localStatsAtomicBuf } },
                { binding: 3, resource: { buffer: this.localHistAtomicBuf } },
                { binding: 4, resource: { buffer: this.gridSizeUniformBuf } },
            ],
        });
        
        this.localStatsNormalizeBindGroup = this.device.createBindGroup({
            layout: this.localStatsNormalizePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.localStatsAtomicBuf } },
                { binding: 1, resource: { buffer: this.localHistAtomicBuf } },
                { binding: 2, resource: { buffer: this.localStatsBuf } },
                { binding: 3, resource: { buffer: this.nUniformBuf } },
            ],
        });
    }

    getBindGroup(delaySteps) {
        const delayIdx = (this.delayBufferIndex - delaySteps + this.delayBufferSize) % this.delayBufferSize;
        const currentIdx = this.thetaIndex;
        const nextIdx = currentIdx ^ 1;
        
        // Cache key based on delay index and active theta texture
        const cacheKey = `${delayIdx}:${currentIdx}`;
        if (!this.bindGroupCache.has(cacheKey)) {
            this.bindGroupCache.set(cacheKey, this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: this.thetaTextures[currentIdx].createView() },
                    { binding: 1, resource: { buffer: this.omegaBuf } },
                    { binding: 2, resource: { buffer: this.paramsBuf } },
                    { binding: 3, resource: { buffer: this.orderBuf } },
                    { binding: 4, resource: { buffer: this.delayBuffers[delayIdx] } },
                    { binding: 5, resource: { buffer: this.globalOrderBuf } },
                    { binding: 6, resource: this.thetaTextures[nextIdx].createView() },
                    { binding: 7, resource: { buffer: this.inputWeightsBuf } },
                    { binding: 8, resource: { buffer: this.inputSignalBuf } },
                    { binding: 9, resource: { buffer: this.graphNeighborsBuf } },
                    { binding: 10, resource: { buffer: this.graphWeightsBuf } },
                    { binding: 11, resource: { buffer: this.graphCountsBuf } },
                ],
            }));
        }
        return this.bindGroupCache.get(cacheKey);
    }

    writeTopology(topology) {
        if (!topology) return;
        const expectedSlots = this.N * this.maxGraphDegree;
        if (topology.neighbors?.length !== expectedSlots ||
            topology.weights?.length !== expectedSlots ||
            topology.counts?.length !== this.N) {
            console.warn('Topology buffers have unexpected length; skipping upload');
            return;
        }
        this.device.queue.writeBuffer(this.graphNeighborsBuf, 0, topology.neighbors);
        this.device.queue.writeBuffer(this.graphWeightsBuf, 0, topology.weights);
        this.device.queue.writeBuffer(this.graphCountsBuf, 0, topology.counts);
        this.topologyInfo = topology;
    }

    updateParams(p) {
        // Only update frequently changing parameters to reduce bandwidth
        // Write dt and time at their offsets (0 and 15*4 bytes)
        const dtData = new Float32Array([p.dt * p.timeScale * (p.paused ? 0 : 1)]);
        this.device.queue.writeBuffer(this.paramsBuf, 0, dtData);
        
        const timeData = new Float32Array([p.frameTime]);
        this.device.queue.writeBuffer(this.paramsBuf, 16 * 4, timeData);
        
        // Only write full params if something other than dt/time changed
        // (This will be called explicitly when params change via updateFullParams)
    }
    
    updateFullParams(p) {
        // Pack all parameters - called only when user changes settings
        // Layout matches shader structs (76 floats = 304 bytes)
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
        const data = new Float32Array([
            // 0-3
            p.dt * p.timeScale * (p.paused ? 0 : 1), p.K0, p.range, p.ruleMode,
            // 4-7
            this.gridSize, this.gridSize, p.harmonicA, p.globalCoupling ? 1.0 : 0.0,
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
            // 50-51 pad
            0, 0,
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
            // 68-71 mesh flag + pads
            (p.surfaceMode === 'mesh' ? 1.0 : 0.0), 0, 0, 0,
            // 72-75 topology mode/meta
            topoMode, this.maxGraphDegree, p.topologyAvgDegree ?? 0, 0
        ]);
        this.device.queue.writeBuffer(this.paramsBuf, 0, data);
    }

    /**
     * Run one simulation step
     * @param {GPUCommandEncoder} commandEncoder
     * @param {number} delaySteps
     * @param {boolean} globalCoupling
     * @param {boolean} computeStats - If true, compute statistics this frame (can be throttled)
     */
    step(commandEncoder, delaySteps, globalCoupling, computeStats = true) {
        const currentIdx = this.thetaIndex;
        const nextIdx = currentIdx ^ 1;
        const currentThetaTex = this.thetaTextures[currentIdx];
        
        // Only compute statistics if requested (allows throttling for performance)
        if (computeStats) {
            // Reset atomic accumulators to zero
            commandEncoder.clearBuffer(this.globalOrderAtomicBuf, 0, 8);
            commandEncoder.clearBuffer(this.localStatsAtomicBuf, 0, 16);
            commandEncoder.clearBuffer(this.localHistAtomicBuf, 0, 64);
            
            // Copy current theta texture to staging buffer for reduction shader
            commandEncoder.copyTextureToBuffer(
                { texture: currentThetaTex },
                { buffer: this.thetaStagingBuf, bytesPerRow: this.gridSize * 4 },
                [this.gridSize, this.gridSize]
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
            const workgroups = Math.ceil(this.N / 256);
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
        }
        
        // Copy current theta texture to delay buffer history (via staging buffer)
        // Only do this if we haven't already copied for stats, or if stats were skipped
        if (!computeStats) {
            commandEncoder.copyTextureToBuffer(
                { texture: currentThetaTex },
                { buffer: this.thetaStagingBuf, bytesPerRow: this.gridSize * 4 },
                [this.gridSize, this.gridSize]
            );
        }
        commandEncoder.copyBufferToBuffer(this.thetaStagingBuf, 0, this.delayBuffers[this.delayBufferIndex], 0, this.N * 4);
        this.delayBufferIndex = (this.delayBufferIndex + 1) % this.delayBufferSize;

        const pass = commandEncoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.getBindGroup(delaySteps));
        const wgCount = Math.ceil(this.gridSize / 16);
        pass.dispatchWorkgroups(wgCount, wgCount);
        pass.end();

        // Swap textures
        this.thetaIndex = nextIdx;
        this.thetaTexture = this.thetaTextures[this.thetaIndex];
    }

    // Helper to write data directly to theta textures
    writeTheta(data) {
        for (const tex of this.thetaTextures) {
            this.device.queue.writeTexture(
                { texture: tex },
                data,
                { bytesPerRow: this.gridSize * 4 },
                [this.gridSize, this.gridSize]
            );
        }
        this.thetaTexture = this.thetaTextures[this.thetaIndex];
        // Sync delay buffers (storage buffers)
        for (let buf of this.delayBuffers) {
            this.device.queue.writeBuffer(buf, 0, data);
        }
    }
    
    writeOmega(data) {
        this.device.queue.writeBuffer(this.omegaBuf, 0, data);
    }
    
    /**
     * Write input weights for reservoir computing
     * @param {Float32Array} weights - Input weight for each oscillator
     */
    writeInputWeights(weights) {
        this.device.queue.writeBuffer(this.inputWeightsBuf, 0, weights);
        console.log('Input weights written, sum:', weights.reduce((a,b) => a+b, 0));
    }
    
    /**
     * Set current input signal value for reservoir computing
     * @param {number} signal - Input signal value
     */
    setInputSignal(signal) {
        this.device.queue.writeBuffer(this.inputSignalBuf, 0, new Float32Array([signal]));
        // Log periodically to avoid spam
        if (Math.random() < 0.02) {
            console.log('Input signal:', signal.toFixed(3));
        }
    }
    
    /**
     * Request readback of global order parameter (async, non-blocking)
     * Call this after step() and the result will be available via getLastGlobalOrder()
     */
    requestGlobalOrderReadback(commandEncoder) {
        if (this.readbackPending) return; // Don't queue multiple readbacks
        
        // Copy global order to staging buffer
        commandEncoder.copyBufferToBuffer(
            this.globalOrderBuf, 0,
            this.globalOrderReadbackBuf, 0,
            8
        );
        
        // Also copy local stats to staging buffer
        commandEncoder.copyBufferToBuffer(
            this.localStatsBuf, 0,
            this.localStatsReadbackBuf, 0,
            (5 + 16) * 4
        );
        
        this.readbackPending = true;
    }
    
    /**
     * Process any pending readback (call once per frame after queue.submit)
     * Returns promise that resolves with {cos, sin, R, Psi, localStats} or null if no readback pending
     */
    async processReadback() {
        if (!this.readbackPending) return null;
        if (this.mappingInProgress) return null;  // Don't start new mapping while one is in progress
        
        this.mappingInProgress = true;
        
        try {
            // Read global order
            await this.globalOrderReadbackBuf.mapAsync(GPUMapMode.READ);
            const globalData = new Float32Array(this.globalOrderReadbackBuf.getMappedRange().slice(0));
            this.globalOrderReadbackBuf.unmap();
            
            const cosSum = globalData[0];
            const sinSum = globalData[1];
            const R = Math.sqrt(cosSum * cosSum + sinSum * sinSum);
            const Psi = Math.atan2(sinSum, cosSum);
            
            this.lastGlobalOrder = { cos: cosSum, sin: sinSum, R, Psi };
            
            // Read local stats
            await this.localStatsReadbackBuf.mapAsync(GPUMapMode.READ);
            const localData = new Float32Array(this.localStatsReadbackBuf.getMappedRange().slice(0));
            this.localStatsReadbackBuf.unmap();
            
            const hist = localData.slice(5, 21);
            this.lastLocalStats = {
                meanR: localData[0],        // Mean local R - better measure of organization
                syncFraction: localData[1], // Fraction with R > 0.7
                gradient: localData[2],     // Mean phase gradient - high = waves/spirals
                variance: localData[3],     // Variance of local R
                histogram: hist,
            };
            
            this.readbackPending = false;
            this.mappingInProgress = false;
            
            return { ...this.lastGlobalOrder, localStats: this.lastLocalStats };
        } catch (e) {
            console.warn('Readback failed:', e);
            this.readbackPending = false;
            this.mappingInProgress = false;
            return null;
        }
    }
    
    /**
     * Get the most recent global order parameter (synchronous)
     */
    getLastGlobalOrder() {
        return this.lastGlobalOrder;
    }
    
    /**
     * Get the most recent local order statistics (synchronous)
     */
    getLastLocalStats() {
        return this.lastLocalStats;
    }
    
    /**
     * Read theta values from GPU (async)
     * This reads directly from the theta texture, ensuring we get current values
     * @returns {Promise<Float32Array>} Current theta values
     */
    async readTheta() {
        // Guard against overlapping reads
        if (this.thetaReadPending) {
            return null;
        }
        this.thetaReadPending = true;
        
        try {
            // First, copy from texture to staging buffer to ensure we have latest data
            const encoder = this.device.createCommandEncoder();
            encoder.copyTextureToBuffer(
                { texture: this.thetaTexture },
                { buffer: this.thetaStagingBuf, bytesPerRow: this.gridSize * 4 },
                [this.gridSize, this.gridSize]
            );
            this.device.queue.submit([encoder.finish()]);
            
            // Create readback buffer if needed (or if size changed)
            if (!this.thetaReadbackBuf || this.thetaReadbackBuf.size !== this.N * 4) {
                if (this.thetaReadbackBuf) {
                    this.thetaReadbackBuf.destroy();
                }
                this.thetaReadbackBuf = this.device.createBuffer({
                    size: this.N * 4,
                    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
                });
            }
            
            // Copy from staging buffer to readback buffer
            const encoder2 = this.device.createCommandEncoder();
            encoder2.copyBufferToBuffer(this.thetaStagingBuf, 0, this.thetaReadbackBuf, 0, this.N * 4);
            this.device.queue.submit([encoder2.finish()]);
            
            // Map and read
            await this.thetaReadbackBuf.mapAsync(GPUMapMode.READ);
            const data = new Float32Array(this.thetaReadbackBuf.getMappedRange().slice(0));
            this.thetaReadbackBuf.unmap();
            
            return data;
        } catch (e) {
            console.warn('readTheta failed:', e);
            return null;
        } finally {
            this.thetaReadPending = false;
        }
    }
    
    /**
     * Get the current omega (natural frequency) values
     * Note: This requires storing omega on CPU side since we only have GPU buffer
     */
    getOmega() {
        return this.omegaData; // Will be set during initialization
    }
    
    /**
     * Store omega data for CPU-side access
     */
    storeOmega(data) {
        this.omegaData = new Float32Array(data);
    }

    /**
     * Interpolate a scalar array from one grid size to another using bilinear interpolation
     * This is for non-phase values like omega (no phase wrapping)
     * @param {Float32Array} data - Source values
     * @param {number} srcSize - Source grid dimension
     * @param {number} dstSize - Destination grid dimension
     * @returns {Float32Array} Interpolated values
     */
    static interpolateScalar(data, srcSize, dstSize) {
        const result = new Float32Array(dstSize * dstSize);
        
        for (let dstY = 0; dstY < dstSize; dstY++) {
            for (let dstX = 0; dstX < dstSize; dstX++) {
                // Map destination coords to source coords
                const srcXf = (dstX + 0.5) * srcSize / dstSize - 0.5;
                const srcYf = (dstY + 0.5) * srcSize / dstSize - 0.5;
                
                // Get integer coordinates and fractions
                const x0 = Math.floor(srcXf);
                const y0 = Math.floor(srcYf);
                const fx = srcXf - x0;
                const fy = srcYf - y0;
                
                // Wrap for periodic boundaries
                const x0w = ((x0 % srcSize) + srcSize) % srcSize;
                const x1w = ((x0 + 1) % srcSize + srcSize) % srcSize;
                const y0w = ((y0 % srcSize) + srcSize) % srcSize;
                const y1w = ((y0 + 1) % srcSize + srcSize) % srcSize;
                
                // Sample 4 corners
                const v00 = data[y0w * srcSize + x0w];
                const v10 = data[y0w * srcSize + x1w];
                const v01 = data[y1w * srcSize + x0w];
                const v11 = data[y1w * srcSize + x1w];
                
                // Standard bilinear interpolation (no phase wrapping)
                const value = v00 * (1 - fx) * (1 - fy) +
                              v10 * fx * (1 - fy) +
                              v01 * (1 - fx) * fy +
                              v11 * fx * fy;
                
                result[dstY * dstSize + dstX] = value;
            }
        }
        
        return result;
    }

    /**
     * Interpolate theta array from one grid size to another using bilinear interpolation
     * Handles phase wrapping correctly
     * @param {Float32Array} theta - Source theta values
     * @param {number} srcSize - Source grid dimension
     * @param {number} dstSize - Destination grid dimension
     * @returns {Float32Array} Interpolated theta values
     */
    static interpolateTheta(theta, srcSize, dstSize) {
        const result = new Float32Array(dstSize * dstSize);
        
        for (let dstY = 0; dstY < dstSize; dstY++) {
            for (let dstX = 0; dstX < dstSize; dstX++) {
                // Map destination coords to source coords (0 to srcSize)
                const srcXf = (dstX + 0.5) * srcSize / dstSize - 0.5;
                const srcYf = (dstY + 0.5) * srcSize / dstSize - 0.5;
                
                // Get integer coordinates and fractions
                const x0 = Math.floor(srcXf);
                const y0 = Math.floor(srcYf);
                const fx = srcXf - x0;
                const fy = srcYf - y0;
                
                // Wrap for periodic boundaries
                const x0w = ((x0 % srcSize) + srcSize) % srcSize;
                const x1w = ((x0 + 1) % srcSize + srcSize) % srcSize;
                const y0w = ((y0 % srcSize) + srcSize) % srcSize;
                const y1w = ((y0 + 1) % srcSize + srcSize) % srcSize;
                
                // Sample 4 corners
                const t00 = theta[y0w * srcSize + x0w];
                const t10 = theta[y0w * srcSize + x1w];
                const t01 = theta[y1w * srcSize + x0w];
                const t11 = theta[y1w * srcSize + x1w];
                
                // Phase-aware interpolation: compute differences relative to t00
                let d10 = t10 - t00;
                let d01 = t01 - t00;
                let d11 = t11 - t00;
                
                // Wrap differences to [-π, π]
                const PI = Math.PI;
                const TWO_PI = 2 * PI;
                if (d10 > PI) d10 -= TWO_PI;
                if (d10 < -PI) d10 += TWO_PI;
                if (d01 > PI) d01 -= TWO_PI;
                if (d01 < -PI) d01 += TWO_PI;
                if (d11 > PI) d11 -= TWO_PI;
                if (d11 < -PI) d11 += TWO_PI;
                
                // Bilinear interpolation of differences
                const interpDiff = d10 * fx * (1 - fy) + 
                                   d01 * (1 - fx) * fy + 
                                   d11 * fx * fy;
                
                // Add back base value and wrap to [0, 2π]
                let value = t00 + interpDiff;
                while (value < 0) value += TWO_PI;
                while (value >= TWO_PI) value -= TWO_PI;
                
                result[dstY * dstSize + dstX] = value;
            }
        }
        
        return result;
    }

    /**
     * Resize simulation while preserving theta state through interpolation
     * @param {number} newGridSize - New grid dimension
     * @returns {Promise<Float32Array>} The interpolated theta (for applying after resize)
     */
    async resizePreservingState(newGridSize) {
        const oldSize = this.gridSize;
        
        // Read current theta
        const oldTheta = await this.readTheta();
        
        // Interpolate to new size
        const newTheta = Simulation.interpolateTheta(oldTheta, oldSize, newGridSize);
        
        // Do the resize (destroys old buffers, creates new)
        this.resize(newGridSize);
        
        // Return interpolated theta for caller to apply
        return newTheta;
    }

    // Resize the simulation grid
    resize(newGridSize) {
        // Destroy old textures and buffers
        for (const tex of this.thetaTextures) {
            tex.destroy();
        }
        if (this.thetaStagingBuf) {
            this.thetaStagingBuf.destroy();
        }
        if (this.thetaReadbackBuf) {
            this.thetaReadbackBuf.destroy();
            this.thetaReadbackBuf = null;
        }
        this.omegaBuf.destroy();
        this.orderBuf.destroy();
        this.paramsBuf.destroy();
        this.globalOrderBuf.destroy();
        this.globalOrderAtomicBuf.destroy();
        if (this.globalOrderReadbackBuf) {
            this.globalOrderReadbackBuf.destroy();
        }
        // Destroy local stats buffers
        if (this.localStatsAtomicBuf) {
            this.localStatsAtomicBuf.destroy();
        }
        if (this.localHistAtomicBuf) {
            this.localHistAtomicBuf.destroy();
        }
        if (this.localStatsBuf) {
            this.localStatsBuf.destroy();
        }
        if (this.localStatsReadbackBuf) {
            this.localStatsReadbackBuf.destroy();
        }
        if (this.gridSizeUniformBuf) {
            this.gridSizeUniformBuf.destroy();
        }
        if (this.nUniformBuf) {
            this.nUniformBuf.destroy();
        }
        for (let buf of this.delayBuffers) {
            buf.destroy();
        }
        this.delayBuffers = [];
        
        // Destroy reservoir computing buffers
        if (this.inputWeightsBuf) {
            this.inputWeightsBuf.destroy();
        }
        if (this.inputSignalBuf) {
            this.inputSignalBuf.destroy();
        }
        if (this.graphNeighborsBuf) {
            this.graphNeighborsBuf.destroy();
        }
        if (this.graphWeightsBuf) {
            this.graphWeightsBuf.destroy();
        }
        if (this.graphCountsBuf) {
            this.graphCountsBuf.destroy();
        }
        
        // Clear bind group cache since textures/buffers changed
        this.bindGroupCache.clear();
        
        // Update size
        this.gridSize = newGridSize;
        this.N = newGridSize * newGridSize;
        this.delayBufferIndex = 0;
        
        // Recreate textures and buffers
        this.initBuffers();
        
        // Recreate reduction bind groups with new buffers
        this.reductionBindGroups = [null, null];
        
        this.normalizeBindGroup = this.device.createBindGroup({
            layout: this.normalizePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.globalOrderAtomicBuf } },
                { binding: 1, resource: { buffer: this.globalOrderBuf } },
                { binding: 2, resource: { buffer: this.paramsBuf } },
            ],
        });
        
        // Recreate local stats bind groups
        this.localStatsBindGroup = this.device.createBindGroup({
            layout: this.localStatsPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.orderBuf } },
                { binding: 1, resource: { buffer: this.thetaStagingBuf } },
                { binding: 2, resource: { buffer: this.localStatsAtomicBuf } },
                { binding: 3, resource: { buffer: this.localHistAtomicBuf } },
                { binding: 4, resource: { buffer: this.gridSizeUniformBuf } },
            ],
        });
        
        this.localStatsNormalizeBindGroup = this.device.createBindGroup({
            layout: this.localStatsNormalizePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.localStatsAtomicBuf } },
                { binding: 1, resource: { buffer: this.localHistAtomicBuf } },
                { binding: 2, resource: { buffer: this.localStatsBuf } },
                { binding: 3, resource: { buffer: this.nUniformBuf } },
            ],
        });
        
        // Note: Pipeline doesn't need to be recreated as it's size-independent
    }
}
