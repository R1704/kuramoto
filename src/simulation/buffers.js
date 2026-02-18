export function initBuffers() {
        const bufferUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
        
        const makeThetaTexture = () => this.device.createTexture({
            size: [this.gridSize, this.gridSize, this.layers],
            format: 'r32float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
        });

        // Using array textures for theta to support multiple layers
        this.thetaTextures = [makeThetaTexture(), makeThetaTexture()];
        this.thetaIndex = 0;
        this.thetaTexture = this.thetaTextures[this.thetaIndex];
        
        // Staging buffer for reading back texture data (for delay buffers and reduction)
        this.thetaStagingBuf = this.device.createBuffer({
            size: this.N * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });
        
        this.omegaBuf = this.device.createBuffer({ size: this.N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.orderBuf = this.device.createBuffer({ size: this.N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        // Params buffer: padded to 320 bytes (80 floats, 16-byte aligned)
        this.paramsBuf = this.device.createBuffer({ size: 320, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        // Gauge params buffer (8 floats, 32 bytes)
        this.gaugeParamsBuf = this.device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        this.device.queue.writeBuffer(this.gaugeParamsBuf, 0, new Float32Array([0, 0, 1, 1, 0.2, 0.05, 0, 1]));

        const makeGaugeTexture = () => this.device.createTexture({
            size: [this.gridSize, this.gridSize, this.layers],
            format: 'r32float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
        });
        this.gaugeXTextures = [makeGaugeTexture(), makeGaugeTexture()];
        this.gaugeYTextures = [makeGaugeTexture(), makeGaugeTexture()];
        this.gaugeIndex = 0;
        this.gaugeXTexture = this.gaugeXTextures[this.gaugeIndex];
        this.gaugeYTexture = this.gaugeYTextures[this.gaugeIndex];
        this.gaugeReadbackXBuf = null;
        this.gaugeReadbackYBuf = null;

        // Global order parameter buffer (stores complex mean field Z = (cos, sin) as vec2)
        this.globalOrderBuf = this.device.createBuffer({ 
            size: 8, // vec2<f32> = 2 * 4 bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });
        
        // Atomic accumulator for reduction (scaled integers for thread safety)
        this.globalOrderAtomicBuf = this.device.createBuffer({
            size: 16, // 4 * i32 = 4 * 4 bytes (S3 needs xyzw)
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

        const makeS2Texture = () => this.device.createTexture({
            size: [this.gridSize, this.gridSize, this.layers],
            format: 'rgba32float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
        });

        this.s2Textures = [makeS2Texture(), makeS2Texture()];
        this.s2Index = 0;
        this.s2Texture = this.s2Textures[this.s2Index];
        this.s2StagingBuf = this.device.createBuffer({
            size: this.N * 16,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });
        this.s2ReadbackBuf = null;

        this.omegaVecBuf = this.device.createBuffer({ size: this.N * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.omegaVecData = null;

        // Initialize S2 textures to +Z
        const s2Init = new Float32Array(this.N * 4);
        for (let i = 0; i < this.N; i++) {
            const base = i * 4;
            s2Init[base] = 0;
            s2Init[base + 1] = 0;
            s2Init[base + 2] = 1;
            s2Init[base + 3] = 1;
        }
        this.writeS2(s2Init);

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
        this.graphGaugeBuf = this.device.createBuffer({
            size: neighborSlots * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.layerParamsBuf = this.device.createBuffer({
            size: 56 * 4 * 8,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(this.layerParamsBuf, 0, new Float32Array(56 * 8).fill(0));
        
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

        this.writeGaugeField(new Float32Array(this.N), new Float32Array(this.N));
        this.writeGraphGauge(new Float32Array(this.N * this.maxGraphDegree));
}

export function writeLayerParams(layers) {
        const count = Math.max(1, this.layers || 1);
        const stride = 56;  // Must match WGSL struct size (56 floats = 224 bytes, 16-byte aligned)
        const data = new Float32Array(stride * 8);
        for (let i = 0; i < Math.min(8, count); i++) {
            const lp = Array.isArray(layers) ? layers[i] : null;
            const base = i * stride;
            data[base] = lp?.ruleMode ?? 0;
            data[base + 1] = lp?.K0 ?? 1.0;
            data[base + 2] = lp?.range ?? 2;
            data[base + 3] = lp?.harmonicA ?? 0.4;
            data[base + 4] = lp?.harmonicB ?? 0.0;
            data[base + 5] = lp?.sigma ?? 1.2;
            data[base + 6] = lp?.sigma2 ?? 1.2;
            data[base + 7] = lp?.beta ?? 0.6;
            data[base + 8] = lp?.noiseStrength ?? 0.0;
            data[base + 9] = lp?.leak ?? 0.0;
            data[base + 10] = lp?.kernelShape ?? 0;
            data[base + 11] = lp?.kernelOrientation ?? 0.0;
            data[base + 12] = lp?.kernelAspect ?? 1.0;
            data[base + 13] = lp?.kernelScale2Weight ?? 0.0;
            data[base + 14] = lp?.kernelScale3Weight ?? 0.0;
            data[base + 15] = lp?.kernelAsymmetry ?? 0.0;
            data[base + 16] = lp?.kernelRings ?? 3;
            data[base + 17] = lp?.kernelRingWidths?.[0] ?? 0.2;
            data[base + 18] = lp?.kernelRingWidths?.[1] ?? 0.4;
            data[base + 19] = lp?.kernelRingWidths?.[2] ?? 0.6;
            data[base + 20] = lp?.kernelRingWidths?.[3] ?? 0.8;
            data[base + 21] = lp?.kernelRingWidths?.[4] ?? 1.0;
            data[base + 22] = lp?.kernelRingWeights?.[0] ?? 1.0;
            data[base + 23] = lp?.kernelRingWeights?.[1] ?? -0.6;
            data[base + 24] = lp?.kernelRingWeights?.[2] ?? 0.8;
            data[base + 25] = lp?.kernelRingWeights?.[3] ?? -0.4;
            data[base + 26] = lp?.kernelRingWeights?.[4] ?? 0.5;
            data[base + 27] = lp?.kernelCompositionEnabled ? 1.0 : 0.0;
            data[base + 28] = lp?.kernelSecondary ?? 0;
            data[base + 29] = lp?.kernelMixRatio ?? 0.5;
            data[base + 30] = lp?.kernelAsymmetricOrientation ?? 0.0;
            data[base + 31] = lp?.kernelSpatialFreqMag ?? 2.0;
            data[base + 32] = lp?.kernelSpatialFreqAngle ?? 0.0;
            data[base + 33] = lp?.kernelGaborPhase ?? 0.0;
            // Interaction modifiers (per-layer)
            data[base + 34] = lp?.scaleBase ?? 1.0;
            data[base + 35] = lp?.scaleRadial ?? 0.0;
            data[base + 36] = lp?.scaleRandom ?? 0.0;
            data[base + 37] = lp?.scaleRing ?? 0.0;
            data[base + 38] = lp?.flowRadial ?? 0.0;
            data[base + 39] = lp?.flowRotate ?? 0.0;
            data[base + 40] = lp?.flowSwirl ?? 0.0;
            data[base + 41] = lp?.flowBubble ?? 0.0;
            data[base + 42] = lp?.flowRing ?? 0.0;
            data[base + 43] = lp?.flowVortex ?? 0.0;
            data[base + 44] = lp?.flowVertical ?? 0.0;
            data[base + 45] = lp?.orientRadial ?? 0.0;
            data[base + 46] = lp?.orientCircles ?? 0.0;
            data[base + 47] = lp?.orientSwirl ?? 0.0;
            data[base + 48] = lp?.orientBubble ?? 0.0;
            data[base + 49] = lp?.orientLinear ?? 0.0;
            data[base + 50] = lp?.layerCouplingUp ?? 0.0;
            data[base + 51] = lp?.layerCouplingDown ?? 0.0;
            // Padding to 56 floats (224 bytes, 16-byte aligned for WGSL array)
            data[base + 52] = 0;
            data[base + 53] = 0;
            data[base + 54] = 0;
            data[base + 55] = 0;
        }
        this.device.queue.writeBuffer(this.layerParamsBuf, 0, data);
}

export function setGaugeParams(state) {
        const enabled = state?.gaugeEnabled ? 1.0 : 0.0;
        const modeDynamic = state?.gaugeMode === 'dynamic' ? 1.0 : 0.0;
        const charge = state?.gaugeCharge ?? 1.0;
        const matter = state?.gaugeMatterCoupling ?? 1.0;
        const stiffness = state?.gaugeStiffness ?? 0.2;
        const damping = state?.gaugeDamping ?? 0.05;
        const noise = state?.gaugeNoise ?? 0.0;
        const dtScale = state?.gaugeDtScale ?? 1.0;
        this.device.queue.writeBuffer(
            this.gaugeParamsBuf,
            0,
            new Float32Array([enabled, modeDynamic, charge, matter, stiffness, damping, noise, dtScale])
        );
        this.gaugeEnabled = enabled > 0.5;
        this.gaugeDynamic = this.gaugeEnabled && modeDynamic > 0.5;
}

export function writeTopology(topology) {
        if (!topology) return;
        const expectedSlots = this.N * this.maxGraphDegree;
        const singleLayerSlots = this.layerSize * this.maxGraphDegree;
        let neighbors = topology.neighbors;
        let weights = topology.weights;
        let counts = topology.counts;

        // If a single-layer topology is provided but we have multiple layers,
        // replicate it across layers so graph mode still works.
        if (this.layers > 1 &&
            neighbors?.length === singleLayerSlots &&
            weights?.length === singleLayerSlots &&
            counts?.length === this.layerSize) {
            const tiledNeighbors = new Uint32Array(expectedSlots);
            const tiledWeights = new Float32Array(expectedSlots);
            const tiledCounts = new Uint32Array(this.N);
            for (let layer = 0; layer < this.layers; layer++) {
                const dstNodeOffset = layer * this.layerSize;
                const dstEdgeOffset = layer * singleLayerSlots;
                tiledNeighbors.set(neighbors, dstEdgeOffset);
                tiledWeights.set(weights, dstEdgeOffset);
                tiledCounts.set(counts, dstNodeOffset);
            }
            neighbors = tiledNeighbors;
            weights = tiledWeights;
            counts = tiledCounts;
        }

        if (neighbors?.length !== expectedSlots ||
            weights?.length !== expectedSlots ||
            counts?.length !== this.N) {
            console.warn('Topology buffers have unexpected length; skipping upload');
            return;
        }
        this.device.queue.writeBuffer(this.graphNeighborsBuf, 0, neighbors);
        this.device.queue.writeBuffer(this.graphWeightsBuf, 0, weights);
        this.device.queue.writeBuffer(this.graphCountsBuf, 0, counts);
        this.graphGaugeData = new Float32Array(expectedSlots);
        this.device.queue.writeBuffer(this.graphGaugeBuf, 0, this.graphGaugeData);
        this.topologyInfo = { ...topology, neighbors, weights, counts };
}

export function writeTheta(data) {
        this.thetaData = new Float32Array(data);
        const layout = { bytesPerRow: this.gridSize * 4, rowsPerImage: this.gridSize };
        const size = [this.gridSize, this.gridSize, this.layers];
        for (const tex of this.thetaTextures) {
            this.device.queue.writeTexture(
                { texture: tex },
                data,
                layout,
                size
            );
        }
        this.thetaTexture = this.thetaTextures[this.thetaIndex];
        // Sync delay buffers (storage buffers)
        for (let buf of this.delayBuffers) {
            this.device.queue.writeBuffer(buf, 0, data);
        }
}

export function writeS2(data) {
        this.s2Data = new Float32Array(data);
        const layout = { bytesPerRow: this.gridSize * 16, rowsPerImage: this.gridSize };
        const size = [this.gridSize, this.gridSize, this.layers];
        for (const tex of this.s2Textures) {
            this.device.queue.writeTexture(
                { texture: tex },
                data,
                layout,
                size
            );
        }
        this.s2Texture = this.s2Textures[this.s2Index];
}

export function writeS3(data) {
        this.writeS2(data);
}

export function writeOmega(data) {
        this.omegaData = new Float32Array(data);
        this.device.queue.writeBuffer(this.omegaBuf, 0, data);
}

export function writeOmegaVec(data) {
        this.omegaVecData = new Float32Array(data);
        this.device.queue.writeBuffer(this.omegaVecBuf, 0, data);
}

export function writeGaugeField(ax, ay) {
        const axData = new Float32Array(ax);
        const ayData = new Float32Array(ay);
        this.gaugeXData = axData;
        this.gaugeYData = ayData;
        const layout = { bytesPerRow: this.gridSize * 4, rowsPerImage: this.gridSize };
        const size = [this.gridSize, this.gridSize, this.layers];
        for (const tex of this.gaugeXTextures) {
            this.device.queue.writeTexture(
                { texture: tex },
                axData,
                layout,
                size
            );
        }
        for (const tex of this.gaugeYTextures) {
            this.device.queue.writeTexture(
                { texture: tex },
                ayData,
                layout,
                size
            );
        }
        this.gaugeXTexture = this.gaugeXTextures[this.gaugeIndex];
        this.gaugeYTexture = this.gaugeYTextures[this.gaugeIndex];
}

export function writeGraphGauge(data) {
        const expected = this.N * this.maxGraphDegree;
        if (!data || data.length !== expected) {
            console.warn('Graph gauge length mismatch', data?.length, 'expected', expected);
            return;
        }
        this.graphGaugeData = new Float32Array(data);
        this.device.queue.writeBuffer(this.graphGaugeBuf, 0, this.graphGaugeData);
}

export function writeInputWeights(weights) {
        this.device.queue.writeBuffer(this.inputWeightsBuf, 0, weights);
}

export function setInputSignal(signal) {
        this.device.queue.writeBuffer(this.inputSignalBuf, 0, new Float32Array([signal]));
}
