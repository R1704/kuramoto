import { COMPUTE_SHADER, GLOBAL_ORDER_REDUCTION_SHADER, GLOBAL_ORDER_NORMALIZE_SHADER } from './shaders.js';

export class Simulation {
    constructor(device, gridSize) {
        this.device = device;
        this.gridSize = gridSize;
        this.N = gridSize * gridSize;
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
        // Params buffer: 43 floats = 172 bytes (rounded to 176 for alignment)
        this.paramsBuf = this.device.createBuffer({ size: 192, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

        // Global order parameter buffer (stores complex mean field Z = (cos, sin) as vec2)
        this.globalOrderBuf = this.device.createBuffer({ 
            size: 8, // vec2<f32> = 2 * 4 bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST 
        });
        
        // Atomic accumulator for reduction (scaled integers for thread safety)
        this.globalOrderAtomicBuf = this.device.createBuffer({
            size: 8, // 2 * i32 = 2 * 4 bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        this.device.queue.writeBuffer(this.globalOrderBuf, 0, new Float32Array([0, 0]));

        // Initialize order buffer
        this.device.queue.writeBuffer(this.orderBuf, 0, new Float32Array(this.N).fill(0.5));

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
                ],
            }));
        }
        return this.bindGroupCache.get(cacheKey);
    }

    updateParams(p) {
        // Only update frequently changing parameters to reduce bandwidth
        // Write dt and time at their offsets (0 and 15*4 bytes)
        const dtData = new Float32Array([p.dt * p.timeScale * (p.paused ? 0 : 1)]);
        this.device.queue.writeBuffer(this.paramsBuf, 0, dtData);
        
        const timeData = new Float32Array([p.frameTime]);
        this.device.queue.writeBuffer(this.paramsBuf, 15 * 4, timeData);
        
        // Only write full params if something other than dt/time changed
        // (This will be called explicitly when params change via updateFullParams)
    }
    
    updateFullParams(p) {
        // Pack all parameters - called only when user changes settings
        // 28 base params + 5 ring widths + 5 ring weights + 3 composition + 1 asymmetric orientation + 3 Gabor + 3 zoom/pan + 3 pad = 51 floats
        const data = new Float32Array([
            p.dt * p.timeScale * (p.paused ? 0 : 1), p.K0, p.range, p.ruleMode,
            this.gridSize, this.gridSize, p.harmonicA, p.globalCoupling ? 1.0 : 0.0,
            p.delaySteps, p.sigma, p.sigma2, p.beta,
            p.showOrder ? 1.0 : 0.0, p.colormap, p.noiseStrength, p.frameTime,
            p.harmonicB, p.viewMode, p.kernelShape, p.kernelOrientation,
            p.kernelAspect, p.kernelScale2Weight, p.kernelScale3Weight, p.kernelAsymmetry,
            p.kernelRings, 
            // Ring widths (5 individual fields)
            p.kernelRingWidths[0], p.kernelRingWidths[1], p.kernelRingWidths[2],
            p.kernelRingWidths[3], p.kernelRingWidths[4],
            // Ring weights (5 individual fields)
            p.kernelRingWeights[0], p.kernelRingWeights[1], p.kernelRingWeights[2],
            p.kernelRingWeights[3], p.kernelRingWeights[4],
            // Composition parameters
            p.kernelCompositionEnabled ? 1.0 : 0.0, p.kernelSecondary, p.kernelMixRatio,
            p.kernelAsymmetricOrientation,
            // Gabor parameters
            p.kernelSpatialFreqMag, p.kernelSpatialFreqAngle, p.kernelGaborPhase,
            // Zoom/pan parameters
            p.zoom || 1.0, p.panX || 0.0, p.panY || 0.0,
            p.bilinearInterpolation ? 1.0 : 0.0, // bilinear interpolation toggle
            0, 0 // pad
        ]);
        this.device.queue.writeBuffer(this.paramsBuf, 0, data);
    }

    step(commandEncoder, delaySteps, globalCoupling) {
        const currentIdx = this.thetaIndex;
        const nextIdx = currentIdx ^ 1;
        const currentThetaTex = this.thetaTextures[currentIdx];
        
        // If global coupling is enabled, compute the global order parameter first
        if (globalCoupling) {
            // Reset atomic accumulators to zero
            commandEncoder.clearBuffer(this.globalOrderAtomicBuf, 0, 8);
            
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
        }
        
        // Copy current theta texture to delay buffer history (via staging buffer)
        commandEncoder.copyTextureToBuffer(
            { texture: currentThetaTex },
            { buffer: this.thetaStagingBuf, bytesPerRow: this.gridSize * 4 },
            [this.gridSize, this.gridSize]
        );
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
    
    // Resize the simulation grid
    resize(newGridSize) {
        // Destroy old textures and buffers
        for (const tex of this.thetaTextures) {
            tex.destroy();
        }
        if (this.thetaStagingBuf) {
            this.thetaStagingBuf.destroy();
        }
        this.omegaBuf.destroy();
        this.orderBuf.destroy();
        this.paramsBuf.destroy();
        this.globalOrderBuf.destroy();
        this.globalOrderAtomicBuf.destroy();
        for (let buf of this.delayBuffers) {
            buf.destroy();
        }
        this.delayBuffers = [];
        
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
        
        // Note: Pipeline doesn't need to be recreated as it's size-independent
    }
}
