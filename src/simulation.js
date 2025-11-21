import { COMPUTE_SHADER } from './shaders.js';

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
    }

    initBuffers() {
        const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
        
        this.thetaBuf = this.device.createBuffer({ size: this.N * 4, usage });
        this.omegaBuf = this.device.createBuffer({ size: this.N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.orderBuf = this.device.createBuffer({ size: this.N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.paramsBuf = this.device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

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

    getBindGroup(delaySteps) {
        const delayIdx = (this.delayBufferIndex - delaySteps + this.delayBufferSize) % this.delayBufferSize;
        
        // Cache key based on delay index
        const cacheKey = delayIdx;
        if (!this.bindGroupCache.has(cacheKey)) {
            this.bindGroupCache.set(cacheKey, this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.thetaBuf } },
                    { binding: 1, resource: { buffer: this.omegaBuf } },
                    { binding: 2, resource: { buffer: this.paramsBuf } },
                    { binding: 3, resource: { buffer: this.orderBuf } },
                    { binding: 4, resource: { buffer: this.delayBuffers[delayIdx] } },
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

    step(commandEncoder, delaySteps) {
        // Copy current theta to delay buffer history
        commandEncoder.copyBufferToBuffer(this.thetaBuf, 0, this.delayBuffers[this.delayBufferIndex], 0, this.N * 4);
        this.delayBufferIndex = (this.delayBufferIndex + 1) % this.delayBufferSize;

        const pass = commandEncoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.getBindGroup(delaySteps));
        const wgCount = Math.ceil(this.gridSize / 16); // Changed from 8 to 16
        pass.dispatchWorkgroups(wgCount, wgCount);
        pass.end();
    }

    // Helper to write data directly
    writeTheta(data) {
        this.device.queue.writeBuffer(this.thetaBuf, 0, data);
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
        this.thetaBuf.destroy();
        this.omegaBuf.destroy();
        this.orderBuf.destroy();
        this.paramsBuf.destroy();
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
        
        // Note: Pipeline doesn't need to be recreated as it's size-independent
    }
}
