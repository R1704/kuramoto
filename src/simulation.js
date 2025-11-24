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
        const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
        
        this.thetaBufs = [
            this.device.createBuffer({ size: this.N * 4, usage }),
            this.device.createBuffer({ size: this.N * 4, usage })
        ];
        this.thetaIndex = 0;
        this.thetaBuf = this.thetaBufs[this.thetaIndex];
        this.omegaBuf = this.device.createBuffer({ size: this.N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.orderBuf = this.device.createBuffer({ size: this.N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.paramsBuf = this.device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

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

        // Delay buffers
        for (let i = 0; i < this.delayBufferSize; i++) {
            this.delayBuffers.push(this.device.createBuffer({ size: this.N * 4, usage }));
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
        
        // Cache key based on delay index and active theta buffer
        const cacheKey = `${delayIdx}:${currentIdx}`;
        if (!this.bindGroupCache.has(cacheKey)) {
            this.bindGroupCache.set(cacheKey, this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.thetaBufs[currentIdx] } },
                    { binding: 1, resource: { buffer: this.omegaBuf } },
                    { binding: 2, resource: { buffer: this.paramsBuf } },
                    { binding: 3, resource: { buffer: this.orderBuf } },
                    { binding: 4, resource: { buffer: this.delayBuffers[delayIdx] } },
                    { binding: 5, resource: { buffer: this.globalOrderBuf } },
                    { binding: 6, resource: { buffer: this.thetaBufs[nextIdx] } },
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
        const data = new Float32Array([
            p.dt * p.timeScale * (p.paused ? 0 : 1), p.K0, p.range, p.ruleMode,
            this.gridSize, this.gridSize, p.harmonicA, p.globalCoupling ? 1.0 : 0.0,
            p.delaySteps, p.sigma, p.sigma2, p.beta,
            p.showOrder ? 1.0 : 0.0, p.colormap, p.noiseStrength, p.frameTime,
            p.harmonicB, p.viewMode, 0, 0
        ]);
        this.device.queue.writeBuffer(this.paramsBuf, 0, data);
    }

    step(commandEncoder, delaySteps, globalCoupling) {
        const currentIdx = this.thetaIndex;
        const nextIdx = currentIdx ^ 1;
        const currentTheta = this.thetaBufs[currentIdx];
        
        // If global coupling is enabled, compute the global order parameter first
        if (globalCoupling) {
            // Reset atomic accumulators to zero
            commandEncoder.clearBuffer(this.globalOrderAtomicBuf, 0, 8);
            
            // Stage 1: Parallel reduction with atomic accumulation
            if (!this.reductionBindGroups[currentIdx]) {
                this.reductionBindGroups[currentIdx] = this.device.createBindGroup({
                    layout: this.reductionPipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: { buffer: currentTheta } },
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
        
        // Copy current theta to delay buffer history
        commandEncoder.copyBufferToBuffer(currentTheta, 0, this.delayBuffers[this.delayBufferIndex], 0, this.N * 4);
        this.delayBufferIndex = (this.delayBufferIndex + 1) % this.delayBufferSize;

        const pass = commandEncoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.getBindGroup(delaySteps));
        const wgCount = Math.ceil(this.gridSize / 16); // Changed from 8 to 16
        pass.dispatchWorkgroups(wgCount, wgCount);
        pass.end();

        // Swap buffers
        this.thetaIndex = nextIdx;
        this.thetaBuf = this.thetaBufs[this.thetaIndex];
    }

    // Helper to write data directly
    writeTheta(data) {
        for (const buf of this.thetaBufs) {
            this.device.queue.writeBuffer(buf, 0, data);
        }
        this.thetaBuf = this.thetaBufs[this.thetaIndex];
        // Sync delay buffers
        for (let buf of this.delayBuffers) {
            this.device.queue.writeBuffer(buf, 0, data);
        }
    }
    
    writeOmega(data) {
        this.device.queue.writeBuffer(this.omegaBuf, 0, data);
    }
    
    // Resize the simulation grid
    resize(newGridSize) {
        // Destroy old buffers
        for (const buf of this.thetaBufs) {
            buf.destroy();
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
        
        // Clear bind group cache since buffers changed
        this.bindGroupCache.clear();
        
        // Update size
        this.gridSize = newGridSize;
        this.N = newGridSize * newGridSize;
        this.delayBufferIndex = 0;
        
        // Recreate buffers
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
