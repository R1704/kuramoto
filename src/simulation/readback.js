export function requestGlobalOrderReadback(commandEncoder) {
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

export function requestPrismaticMetricsReadback(commandEncoder) {
        if (this.prismaticMetricsPending) return;
        const bytes = (this.prismaticMetricsFloatCount || 20) * 4;
        commandEncoder.copyBufferToBuffer(
            this.prismaticMetricsBuf, 0,
            this.prismaticMetricsReadbackBuf, 0,
            bytes
        );
        this.prismaticMetricsPending = true;
}

function alignTo(value, alignment) {
        return Math.ceil(value / alignment) * alignment;
}

export async function processReadback() {
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

export async function processPrismaticMetricsReadback() {
        if (!this.prismaticMetricsPending || this.prismaticMetricsMapping) return null;
        this.prismaticMetricsMapping = true;
        try {
            await this.prismaticMetricsReadbackBuf.mapAsync(GPUMapMode.READ);
            const raw = new Float32Array(this.prismaticMetricsReadbackBuf.getMappedRange().slice(0));
            this.prismaticMetricsReadbackBuf.unmap();
            const bins = raw.subarray(0, 8);
            const pans = raw.subarray(8, 16);
            const intensity = Number.isFinite(raw[16]) ? raw[16] : 0;
            const coherence = Number.isFinite(raw[17]) ? raw[17] : 0;
            const gradient = Number.isFinite(raw[18]) ? raw[18] : 0;
            const order = Number.isFinite(raw[19]) ? raw[19] : 0;
            if (!this.prismaticMetricsScratch) {
                this.prismaticMetricsScratch = {
                    phaseBins: new Float32Array(8),
                    phasePans: new Float32Array(8),
                    out: {
                        phaseBins: null,
                        phasePans: null,
                        intensity: 0,
                        coherence: 0,
                        gradient: 0,
                        order: 0
                    }
                };
                this.prismaticMetricsScratch.out.phaseBins = this.prismaticMetricsScratch.phaseBins;
                this.prismaticMetricsScratch.out.phasePans = this.prismaticMetricsScratch.phasePans;
            }
            const phaseBins = this.prismaticMetricsScratch.phaseBins;
            const phasePans = this.prismaticMetricsScratch.phasePans;
            for (let i = 0; i < 8; i++) {
                phaseBins[i] = Number.isFinite(bins[i]) ? bins[i] : 0;
                const p = Number.isFinite(pans[i]) ? pans[i] : 0;
                phasePans[i] = Math.max(-1, Math.min(1, p));
            }
            this.prismaticMetricsPending = false;
            this.prismaticMetricsMapping = false;
            this.prismaticMetricsScratch.out.intensity = Math.max(0, Math.min(1, intensity));
            this.prismaticMetricsScratch.out.coherence = Math.max(0, Math.min(1, coherence));
            this.prismaticMetricsScratch.out.gradient = Math.max(0, Math.min(1, gradient));
            this.prismaticMetricsScratch.out.order = Math.max(0, Math.min(1, order));
            return this.prismaticMetricsScratch.out;
        } catch (e) {
            console.warn('processPrismaticMetricsReadback failed:', e);
            this.prismaticMetricsPending = false;
            this.prismaticMetricsMapping = false;
            return null;
        }
}

export async function readOrderField() {
        if (this.thetaReadPending) return null;
        this.thetaReadPending = true;

        try {
            // orderBuf is a STORAGE buffer with one f32 per cell
            const byteSize = this.N * 4;
            if (!this.orderReadbackBuf || this.orderReadbackBuf.size !== byteSize) {
                if (this.orderReadbackBuf) this.orderReadbackBuf.destroy();
                this.orderReadbackBuf = this.device.createBuffer({
                    size: byteSize,
                    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
                });
            }

            const encoder = this.device.createCommandEncoder();
            encoder.copyBufferToBuffer(this.orderBuf, 0, this.orderReadbackBuf, 0, byteSize);
            this.device.queue.submit([encoder.finish()]);

            await this.orderReadbackBuf.mapAsync(GPUMapMode.READ);
            const data = new Float32Array(this.orderReadbackBuf.getMappedRange().slice(0));
            this.orderReadbackBuf.unmap();

            return data;
        } catch (e) {
            console.warn('readOrderField failed:', e);
            return null;
        } finally {
            this.thetaReadPending = false;
        }
}

export function getLastGlobalOrder() {
        return this.lastGlobalOrder;
}

export function getLastLocalStats() {
        return this.lastLocalStats;
}

export async function readTheta() {
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
                { buffer: this.thetaStagingBuf, bytesPerRow: this.gridSize * 4, rowsPerImage: this.gridSize },
                [this.gridSize, this.gridSize, this.layers]
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

export async function readS2() {
        if (this.thetaReadPending) {
            return null;
        }
        this.thetaReadPending = true;

        try {
            const encoder = this.device.createCommandEncoder();
            encoder.copyTextureToBuffer(
                { texture: this.s2Texture },
                { buffer: this.s2StagingBuf, bytesPerRow: this.gridSize * 16, rowsPerImage: this.gridSize },
                [this.gridSize, this.gridSize, this.layers]
            );
            this.device.queue.submit([encoder.finish()]);

            if (!this.s2ReadbackBuf || this.s2ReadbackBuf.size !== this.N * 16) {
                if (this.s2ReadbackBuf) {
                    this.s2ReadbackBuf.destroy();
                }
                this.s2ReadbackBuf = this.device.createBuffer({
                    size: this.N * 16,
                    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
                });
            }

            const encoder2 = this.device.createCommandEncoder();
            encoder2.copyBufferToBuffer(this.s2StagingBuf, 0, this.s2ReadbackBuf, 0, this.N * 16);
            this.device.queue.submit([encoder2.finish()]);

            await this.s2ReadbackBuf.mapAsync(GPUMapMode.READ);
            const data = new Float32Array(this.s2ReadbackBuf.getMappedRange().slice(0));
            this.s2ReadbackBuf.unmap();

            return data;
        } catch (e) {
            console.warn('readS2 failed:', e);
            return null;
        } finally {
            this.thetaReadPending = false;
        }
}

export async function readS3() {
        return this.readS2();
}

export async function readGaugeField() {
        if (this.thetaReadPending) {
            return null;
        }
        this.thetaReadPending = true;

        try {
            if (!this.gaugeReadbackXBuf || this.gaugeReadbackXBuf.size !== this.N * 4) {
                if (this.gaugeReadbackXBuf) this.gaugeReadbackXBuf.destroy();
                this.gaugeReadbackXBuf = this.device.createBuffer({
                    size: this.N * 4,
                    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
                });
            }
            if (!this.gaugeReadbackYBuf || this.gaugeReadbackYBuf.size !== this.N * 4) {
                if (this.gaugeReadbackYBuf) this.gaugeReadbackYBuf.destroy();
                this.gaugeReadbackYBuf = this.device.createBuffer({
                    size: this.N * 4,
                    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
                });
            }

            const encoder = this.device.createCommandEncoder();
            encoder.copyTextureToBuffer(
                { texture: this.gaugeXTexture },
                { buffer: this.gaugeReadbackXBuf, bytesPerRow: this.gridSize * 4, rowsPerImage: this.gridSize },
                [this.gridSize, this.gridSize, this.layers]
            );
            encoder.copyTextureToBuffer(
                { texture: this.gaugeYTexture },
                { buffer: this.gaugeReadbackYBuf, bytesPerRow: this.gridSize * 4, rowsPerImage: this.gridSize },
                [this.gridSize, this.gridSize, this.layers]
            );
            this.device.queue.submit([encoder.finish()]);

            await this.gaugeReadbackXBuf.mapAsync(GPUMapMode.READ);
            const ax = new Float32Array(this.gaugeReadbackXBuf.getMappedRange().slice(0));
            this.gaugeReadbackXBuf.unmap();

            await this.gaugeReadbackYBuf.mapAsync(GPUMapMode.READ);
            const ay = new Float32Array(this.gaugeReadbackYBuf.getMappedRange().slice(0));
            this.gaugeReadbackYBuf.unmap();

            return {
                ax,
                ay,
                graph: this.graphGaugeData ? new Float32Array(this.graphGaugeData) : null
            };
        } catch (e) {
            console.warn('readGaugeField failed:', e);
            return null;
        } finally {
            this.thetaReadPending = false;
        }
}

export async function readGaugeFieldDecimated(layer = 0, stride = 1) {
        if (this.thetaReadPending) {
            return null;
        }
        this.thetaReadPending = true;

        try {
            const grid = this.gridSize;
            const layerIndex = Math.min(Math.max(0, Math.floor(layer)), Math.max(0, this.layers - 1));
            const layerBytes = grid * grid * 4;

            if (!this.gaugeLayerReadbackXBuf || this.gaugeLayerReadbackXBuf.size !== layerBytes) {
                if (this.gaugeLayerReadbackXBuf) this.gaugeLayerReadbackXBuf.destroy();
                this.gaugeLayerReadbackXBuf = this.device.createBuffer({
                    size: layerBytes,
                    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
                });
            }
            if (!this.gaugeLayerReadbackYBuf || this.gaugeLayerReadbackYBuf.size !== layerBytes) {
                if (this.gaugeLayerReadbackYBuf) this.gaugeLayerReadbackYBuf.destroy();
                this.gaugeLayerReadbackYBuf = this.device.createBuffer({
                    size: layerBytes,
                    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
                });
            }

            const encoder = this.device.createCommandEncoder();
            encoder.copyTextureToBuffer(
                { texture: this.gaugeXTexture, origin: { x: 0, y: 0, z: layerIndex } },
                { buffer: this.gaugeLayerReadbackXBuf, bytesPerRow: grid * 4, rowsPerImage: grid },
                [grid, grid, 1]
            );
            encoder.copyTextureToBuffer(
                { texture: this.gaugeYTexture, origin: { x: 0, y: 0, z: layerIndex } },
                { buffer: this.gaugeLayerReadbackYBuf, bytesPerRow: grid * 4, rowsPerImage: grid },
                [grid, grid, 1]
            );
            this.device.queue.submit([encoder.finish()]);

            await this.gaugeLayerReadbackXBuf.mapAsync(GPUMapMode.READ);
            const axLayer = new Float32Array(this.gaugeLayerReadbackXBuf.getMappedRange().slice(0));
            this.gaugeLayerReadbackXBuf.unmap();

            await this.gaugeLayerReadbackYBuf.mapAsync(GPUMapMode.READ);
            const ayLayer = new Float32Array(this.gaugeLayerReadbackYBuf.getMappedRange().slice(0));
            this.gaugeLayerReadbackYBuf.unmap();

            const step = Math.max(1, Math.floor(stride));
            if (step <= 1) {
                return {
                    layer: layerIndex,
                    grid,
                    stride: 1,
                    sampleGrid: grid,
                    ax: axLayer,
                    ay: ayLayer
                };
            }

            const sampleGrid = Math.max(1, Math.ceil(grid / step));
            const ax = new Float32Array(sampleGrid * sampleGrid);
            const ay = new Float32Array(sampleGrid * sampleGrid);
            for (let sr = 0; sr < sampleGrid; sr++) {
                const r = Math.min(grid - 1, sr * step);
                const rowBase = r * grid;
                const outRowBase = sr * sampleGrid;
                for (let sc = 0; sc < sampleGrid; sc++) {
                    const c = Math.min(grid - 1, sc * step);
                    const srcIdx = rowBase + c;
                    const dstIdx = outRowBase + sc;
                    ax[dstIdx] = axLayer[srcIdx];
                    ay[dstIdx] = ayLayer[srcIdx];
                }
            }

            return {
                layer: layerIndex,
                grid,
                stride: step,
                sampleGrid,
                ax,
                ay
            };
        } catch (e) {
            console.warn('readGaugeFieldDecimated failed:', e);
            return null;
        } finally {
            this.thetaReadPending = false;
        }
}

export async function readThetaNeighborhood(layer = 0, c = 0, r = 0, radius = 1) {
        if (this.thetaReadPending) {
            return null;
        }
        this.thetaReadPending = true;

        try {
            const grid = this.gridSize;
            const layerIndex = Math.min(Math.max(0, Math.floor(layer)), Math.max(0, this.layers - 1));
            const rr = Math.max(1, Math.floor(radius));
            const width = Math.max(1, rr * 2 + 1);
            const height = width;
            const centerC = Math.min(grid - 1, Math.max(0, Math.floor(c)));
            const centerR = Math.min(grid - 1, Math.max(0, Math.floor(r)));
            const startX = centerC - rr;
            const startY = centerR - rr;
            const needsWrap = startX < 0 || startY < 0 || (startX + width) > grid || (startY + height) > grid;

            // Fast path: read only small neighborhood when fully in-bounds.
            if (!needsWrap) {
                const bytesPerRow = alignTo(width * 4, 256);
                const sizeBytes = bytesPerRow * height;
                if (!this.thetaNeighborhoodReadbackBuf || this.thetaNeighborhoodReadbackBuf.size < sizeBytes) {
                    if (this.thetaNeighborhoodReadbackBuf) this.thetaNeighborhoodReadbackBuf.destroy();
                    this.thetaNeighborhoodReadbackBuf = this.device.createBuffer({
                        size: sizeBytes,
                        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
                    });
                }

                const encoder = this.device.createCommandEncoder();
                encoder.copyTextureToBuffer(
                    {
                        texture: this.thetaTexture,
                        origin: { x: startX, y: startY, z: layerIndex }
                    },
                    {
                        buffer: this.thetaNeighborhoodReadbackBuf,
                        bytesPerRow,
                        rowsPerImage: height
                    },
                    [width, height, 1]
                );
                this.device.queue.submit([encoder.finish()]);

                await this.thetaNeighborhoodReadbackBuf.mapAsync(GPUMapMode.READ);
                const raw = new Float32Array(this.thetaNeighborhoodReadbackBuf.getMappedRange().slice(0));
                this.thetaNeighborhoodReadbackBuf.unmap();
                const strideFloats = bytesPerRow / 4;
                const lc = rr;
                const lr = rr;
                const idx = (x, y) => y * strideFloats + x;
                return {
                    layer: layerIndex,
                    c: centerC,
                    r: centerR,
                    center: raw[idx(lc, lr)],
                    right: raw[idx(Math.min(width - 1, lc + 1), lr)],
                    left: raw[idx(Math.max(0, lc - 1), lr)],
                    up: raw[idx(lc, Math.min(height - 1, lr + 1))],
                    down: raw[idx(lc, Math.max(0, lr - 1))]
                };
            }

            // Boundary path: read full active layer once, then wrap sample.
            const layerBytes = grid * grid * 4;
            if (!this.thetaLayerReadbackBuf || this.thetaLayerReadbackBuf.size !== layerBytes) {
                if (this.thetaLayerReadbackBuf) this.thetaLayerReadbackBuf.destroy();
                this.thetaLayerReadbackBuf = this.device.createBuffer({
                    size: layerBytes,
                    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
                });
            }

            const encoder = this.device.createCommandEncoder();
            encoder.copyTextureToBuffer(
                { texture: this.thetaTexture, origin: { x: 0, y: 0, z: layerIndex } },
                { buffer: this.thetaLayerReadbackBuf, bytesPerRow: grid * 4, rowsPerImage: grid },
                [grid, grid, 1]
            );
            this.device.queue.submit([encoder.finish()]);

            await this.thetaLayerReadbackBuf.mapAsync(GPUMapMode.READ);
            const layerData = new Float32Array(this.thetaLayerReadbackBuf.getMappedRange().slice(0));
            this.thetaLayerReadbackBuf.unmap();

            const wrap = (v) => {
                let x = v % grid;
                if (x < 0) x += grid;
                return x;
            };
            const at = (x, y) => layerData[wrap(y) * grid + wrap(x)];
            return {
                layer: layerIndex,
                c: centerC,
                r: centerR,
                center: at(centerC, centerR),
                right: at(centerC + 1, centerR),
                left: at(centerC - 1, centerR),
                up: at(centerC, centerR + 1),
                down: at(centerC, centerR - 1)
            };
        } catch (e) {
            console.warn('readThetaNeighborhood failed:', e);
            return null;
        } finally {
            this.thetaReadPending = false;
        }
}

export function getOmega() {
        return this.omegaData; // Will be set during initialization
}

export function storeOmega(data) {
        this.omegaData = new Float32Array(data);
}
