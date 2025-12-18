import { RENDER_SHADER, RENDER_2D_SHADER } from './shaders.js';

export class Renderer {
    constructor(device, format, canvas, gridSize = 256) {
        this.device = device;
        this.format = format;
        this.canvas = canvas;
        this.gridSize = gridSize;
        this.meshMode = 'mesh'; // 'mesh' or 'instanced'
        
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
        this.init2DPipeline();
        this.bindGroup = null; // Cache bind group
        this.bindGroup2D = null; // Cache 2D bind group
        this.lastThetaTexture = null;
        this.drawOverlayTex = null;

        // Mesh buffers for continuous grid rendering in 3D
        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.indexCount = 0;
        this.rebuildMesh(this.gridSize);
        // Quad buffer for instanced mode
        this.quadVertexBuffer = null;
        this.initQuadBuffer();
    }

    initPipeline() {
        const module = this.device.createShaderModule({ code: RENDER_SHADER });
        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 8, // vec2<f32> for mesh mode; ignored for instanced mode
                    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
                }],
            },
            fragment: { module, entryPoint: 'fs_main', targets: [{ format: this.format }] },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
            depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
        });
    }
    
    init2DPipeline() {
        try {
            const module = this.device.createShaderModule({ code: RENDER_2D_SHADER });
            this.pipeline2D = this.device.createRenderPipeline({
                layout: 'auto',
                vertex: { module, entryPoint: 'vs_main' },
                fragment: { module, entryPoint: 'fs_main', targets: [{ format: this.format }] },
                primitive: { topology: 'triangle-list', cullMode: 'none' },
                // No depth buffer needed for 2D
            });
        } catch (e) {
            console.error('Failed to create 2D pipeline:', e);
            this.pipeline2D = null;
        }
    }

    resize(width, height) {
        this.depthTexture.destroy();
        this.depthTexture = this.device.createTexture({
            size: [width, height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }
    
    // Call this when simulation textures change
    invalidateBindGroup() {
        this.bindGroup = null;
        this.bindGroup2D = null;
        this.bindGroups2D = null; // Clear 2D bind group cache
        this.lastSim = null;
        this.lastThetaTexture = null;
    }

    draw(commandEncoder, sim, viewProjMatrix, N, viewMode = '3d', renderAllLayers = false, activeLayer = 0) {
        // Use fast 2D renderer when in 2D mode (if available)
        if (viewMode === '2d' && this.pipeline2D) {
            this.draw2D(commandEncoder, sim);
            return;
        }
        
        const drawOne = (layerIdx) => {
            // Update camera uniform
            this.device.queue.writeBuffer(this.cameraBuf, 0, viewProjMatrix);
            // Ensure mesh flag in params matches current draw mode (mesh_mode is float index 68)
            const meshFlag = this.meshMode === 'mesh' ? 1.0 : 0.0;
            this.device.queue.writeBuffer(sim.paramsBuf, 68 * 4, new Float32Array([meshFlag]));
            // Update active layer (index 79)
            this.device.queue.writeBuffer(sim.paramsBuf, 79 * 4, new Float32Array([layerIdx]));

            // Create bind group only if it doesn't exist or textures changed
            if (!this.bindGroup || this.lastSim !== sim || this.lastThetaTexture !== sim.thetaTexture) {
                this.bindGroup = this.device.createBindGroup({
                    layout: this.pipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: sim.thetaTexture.createView({ dimension: '2d-array' }) },
                        { binding: 1, resource: { buffer: sim.paramsBuf } },
                        { binding: 2, resource: { buffer: this.cameraBuf } },
                        { binding: 3, resource: { buffer: sim.orderBuf } },
                        { binding: 4, resource: this.externalSampler },
                        { binding: 5, resource: this.externalTexture.createView() },
                    ],
                });
                this.lastSim = sim;
                this.lastThetaTexture = sim.thetaTexture;
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
            if (this.meshMode === 'mesh' && this.vertexBuffer && this.indexBuffer) {
                pass.setVertexBuffer(0, this.vertexBuffer);
                pass.setIndexBuffer(this.indexBuffer, 'uint32');
                pass.drawIndexed(this.indexCount, 1, 0, 0, 0);
            } else {
                // Instanced quad path - ensure quad buffer exists
                if (!this.quadVertexBuffer) {
                    this.initQuadBuffer();
                }
                const instanceCount = sim.layerSize ?? N;
                pass.setVertexBuffer(0, this.quadVertexBuffer);
                pass.draw(6, instanceCount); // 6 verts per quad, one layer of instances
            }
            pass.end();
        };

        if (renderAllLayers && viewMode === '3d') {
            for (let layer = 0; layer < (sim.layers || 1); layer++) {
                drawOne(layer);
            }
        } else {
            const layerIdx = Math.min(Math.max(0, activeLayer ?? 0), (sim.layers || 1) - 1);
            drawOne(layerIdx);
        }
    }
    
    draw2D(commandEncoder, sim) {
        // Fast 2D rendering with full-screen quad
        if (!this.pipeline2D) {
            // Fallback: pipeline creation failed, skip 2D rendering
            console.warn('2D pipeline not available, skipping 2D render');
            return;
        }
        
        // Cache bind groups per theta texture (we have 2 textures for double buffering)
        if (!this.bindGroups2D) {
            this.bindGroups2D = new Map();
        }
        
        // Get or create bind group for current theta texture
        let bindGroup = this.bindGroups2D.get(sim.thetaTexture);
        if (!bindGroup) {
            bindGroup = this.device.createBindGroup({
                layout: this.pipeline2D.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: sim.thetaTexture.createView({ dimension: '2d-array' }) },
                    { binding: 1, resource: { buffer: sim.paramsBuf } },
                    { binding: 2, resource: { buffer: sim.orderBuf } },
                    { binding: 3, resource: this.externalSampler },
                    { binding: 4, resource: this.externalTexture.createView() },
                ],
            });
            this.bindGroups2D.set(sim.thetaTexture, bindGroup);
        }

        const pass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0.02, g: 0.02, b: 0.05, a: 1 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
        });
        pass.setPipeline(this.pipeline2D);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3); // Single triangle covering the screen
        pass.end();
    }
    
    setContext(ctx) {
        this.context = ctx;
    }

    clearDrawOverlay() {
        // no-op placeholder; draw/erase currently writes directly to theta
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

    rebuildMesh(gridSize) {
        this.gridSize = gridSize;
        const vertsPerSide = gridSize + 1;
        const vertexCount = vertsPerSide * vertsPerSide;
        const positions = new Float32Array(vertexCount * 2);
        let idx = 0;
        for (let z = 0; z < vertsPerSide; z++) {
            for (let x = 0; x < vertsPerSide; x++) {
                positions[idx++] = x;
                positions[idx++] = z;
            }
        }
        if (this.vertexBuffer) this.vertexBuffer.destroy();
        this.vertexBuffer = this.device.createBuffer({
            size: positions.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.vertexBuffer, 0, positions);

        const quads = gridSize * gridSize;
        const indices = new Uint32Array(quads * 6);
        let ii = 0;
        for (let z = 0; z < gridSize; z++) {
            for (let x = 0; x < gridSize; x++) {
                const v0 = z * vertsPerSide + x;
                const v1 = v0 + 1;
                const v2 = v0 + vertsPerSide;
                const v3 = v2 + 1;
                indices[ii++] = v0; indices[ii++] = v2; indices[ii++] = v1;
                indices[ii++] = v1; indices[ii++] = v2; indices[ii++] = v3;
            }
        }
        this.indexCount = indices.length;
        if (this.indexBuffer) this.indexBuffer.destroy();
        this.indexBuffer = this.device.createBuffer({
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.indexBuffer, 0, indices);

        this.invalidateBindGroup();
    }

    setMeshMode(mode) {
        this.meshMode = mode;
    }

    initQuadBuffer() {
        const verts = new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            1, 0,
            1, 1,
            0, 1,
        ]);
        if (this.quadVertexBuffer) this.quadVertexBuffer.destroy?.();
        this.quadVertexBuffer = this.device.createBuffer({
            size: verts.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.quadVertexBuffer, 0, verts);
    }
}
