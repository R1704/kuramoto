import { RENDER_SHADER } from './shaders.js';

export class Renderer {
    constructor(device, format, canvas) {
        this.device = device;
        this.format = format;
        this.canvas = canvas;
        
        this.cameraBuf = device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        
        this.depthTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        
        // External texture for image-based rendering
        // Create a default 1x1 white texture
        this.externalTexture = device.createTexture({
            size: [1, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture(
            { texture: this.externalTexture },
            new Uint8Array([255, 255, 255, 255]),
            { bytesPerRow: 4 },
            [1, 1]
        );
        
        this.externalSampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });

        this.initPipeline();
        this.bindGroup = null; // Cache bind group
        this.lastThetaBuffer = null;
    }

    initPipeline() {
        const module = this.device.createShaderModule({ code: RENDER_SHADER });
        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: { module, entryPoint: 'vs_main' },
            fragment: { module, entryPoint: 'fs_main', targets: [{ format: this.format }] },
            primitive: { topology: 'triangle-strip', cullMode: 'none' },
            depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
        });
    }

    resize(width, height) {
        this.depthTexture.destroy();
        this.depthTexture = this.device.createTexture({
            size: [width, height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }
    
    // Call this when simulation buffers change
    invalidateBindGroup() {
        this.bindGroup = null;
        this.lastSim = null;
        this.lastThetaBuffer = null;
    }

    draw(commandEncoder, sim, viewProjMatrix, N) {
        // Update camera uniform
        this.device.queue.writeBuffer(this.cameraBuf, 0, viewProjMatrix);

        // Create bind group only if it doesn't exist or buffers changed
        if (!this.bindGroup || this.lastSim !== sim || this.lastThetaBuffer !== sim.thetaBuf) {
            this.bindGroup = this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: sim.thetaBuf } },
                    { binding: 1, resource: { buffer: sim.paramsBuf } },
                    { binding: 2, resource: { buffer: this.cameraBuf } },
                    { binding: 3, resource: { buffer: sim.orderBuf } },
                    { binding: 4, resource: this.externalSampler },
                    { binding: 5, resource: this.externalTexture.createView() },
                ],
            });
            this.lastSim = sim;
            this.lastThetaBuffer = sim.thetaBuf;
        }

        const pass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0.02, g: 0.02, b: 0.05, a: 1 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.draw(4, N);
        pass.end();
    }
    
    setContext(ctx) {
        this.context = ctx;
    }
    
    loadTextureFromCanvas(canvas) {
        // Destroy old texture if it's not the default 1x1
        if (this.externalTexture && this.externalTexture.width > 1) {
            this.externalTexture.destroy();
        }
        
        this.externalTexture = this.device.createTexture({
            size: [canvas.width, canvas.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        
        // Copy canvas data to texture
        this.device.queue.copyExternalImageToTexture(
            { source: canvas },
            { texture: this.externalTexture },
            [canvas.width, canvas.height]
        );
        
        // Invalidate bind group to recreate with new texture
        this.invalidateBindGroup();
    }
}
