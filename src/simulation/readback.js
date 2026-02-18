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

export function getOmega() {
        return this.omegaData; // Will be set during initialization
}

export function storeOmega(data) {
        this.omegaData = new Float32Array(data);
}
