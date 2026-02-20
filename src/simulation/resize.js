export function interpolateScalar(data, srcSize, dstSize, layers = 1) {
        const layerSizeSrc = srcSize * srcSize;
        const layerSizeDst = dstSize * dstSize;
        const result = new Float32Array(layerSizeDst * layers);
        
        for (let layer = 0; layer < layers; layer++) {
            const srcOffset = layer * layerSizeSrc;
            const dstOffset = layer * layerSizeDst;
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
                    const v00 = data[srcOffset + y0w * srcSize + x0w];
                    const v10 = data[srcOffset + y0w * srcSize + x1w];
                    const v01 = data[srcOffset + y1w * srcSize + x0w];
                    const v11 = data[srcOffset + y1w * srcSize + x1w];
                    
                    // Standard bilinear interpolation (no phase wrapping)
                    const value = v00 * (1 - fx) * (1 - fy) +
                                  v10 * fx * (1 - fy) +
                                  v01 * (1 - fx) * fy +
                                  v11 * fx * fy;
                    
                    result[dstOffset + dstY * dstSize + dstX] = value;
                }
            }
        }
        
        return result;
}

export function interpolateTheta(theta, srcSize, dstSize) {
        return interpolateThetaLayers(theta, srcSize, dstSize, 1);
}

export function interpolateThetaLayers(theta, srcSize, dstSize, layers) {
        const layerSizeSrc = srcSize * srcSize;
        const layerSizeDst = dstSize * dstSize;
        const result = new Float32Array(layerSizeDst * layers);
        const PI = Math.PI;
        const TWO_PI = 2 * PI;
        
        for (let layer = 0; layer < layers; layer++) {
            const srcOffset = layer * layerSizeSrc;
            const dstOffset = layer * layerSizeDst;
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
                    const t00 = theta[srcOffset + y0w * srcSize + x0w];
                    const t10 = theta[srcOffset + y0w * srcSize + x1w];
                    const t01 = theta[srcOffset + y1w * srcSize + x0w];
                    const t11 = theta[srcOffset + y1w * srcSize + x1w];
                    
                    // Phase-aware interpolation: compute differences relative to t00
                    let d10 = t10 - t00;
                    let d01 = t01 - t00;
                    let d11 = t11 - t00;
                    
                    // Wrap differences to [-π, π]
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
                    
                    result[dstOffset + dstY * dstSize + dstX] = value;
                }
            }
        }
        
        return result;
}

export async function resizePreservingState(newGridSize) {
        const oldSize = this.gridSize;

        while (this.thetaReadPending) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        
        // Read current theta
        const oldTheta = await this.readTheta();
        if (!oldTheta || oldTheta.length === 0) {
            throw new Error('Theta readback unavailable for resize');
        }
        
        // Interpolate to new size
        const newTheta = interpolateThetaLayers(oldTheta, oldSize, newGridSize, this.layers);
        
        // Do the resize (destroys old buffers, creates new)
        this.resize(newGridSize);
        
        // Return interpolated theta for caller to apply
        return newTheta;
}

export async function waitForIdle(maxMs = 200) {
        const start = performance.now();
        while (this.thetaReadPending || this.mappingInProgress) {
            if (performance.now() - start > maxMs) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 5));
        }
}

export function destroy() {
        for (const tex of this.thetaTextures) {
            tex.destroy();
        }
        if (this.gaugeXTextures) {
            for (const tex of this.gaugeXTextures) tex.destroy();
        }
        if (this.gaugeYTextures) {
            for (const tex of this.gaugeYTextures) tex.destroy();
        }
        if (this.s2Textures) {
            for (const tex of this.s2Textures) {
                tex.destroy();
            }
        }
        if (this.prismaticStateTextures) {
            for (const tex of this.prismaticStateTextures) {
                tex.destroy();
            }
        }
        if (this.thetaStagingBuf) {
            this.thetaStagingBuf.destroy();
        }
        if (this.s2StagingBuf) {
            this.s2StagingBuf.destroy();
        }
        if (this.thetaReadbackBuf) {
            this.thetaReadbackBuf.destroy();
            this.thetaReadbackBuf = null;
        }
        if (this.s2ReadbackBuf) {
            this.s2ReadbackBuf.destroy();
            this.s2ReadbackBuf = null;
        }
        if (this.omegaBuf) this.omegaBuf.destroy();
        if (this.omegaVecBuf) this.omegaVecBuf.destroy();
        if (this.orderBuf) this.orderBuf.destroy();
        if (this.paramsBuf) this.paramsBuf.destroy();
        if (this.globalOrderBuf) this.globalOrderBuf.destroy();
        if (this.globalOrderAtomicBuf) this.globalOrderAtomicBuf.destroy();
        if (this.globalOrderReadbackBuf) this.globalOrderReadbackBuf.destroy();
        if (this.localStatsAtomicBuf) this.localStatsAtomicBuf.destroy();
        if (this.localHistAtomicBuf) this.localHistAtomicBuf.destroy();
        if (this.localStatsBuf) this.localStatsBuf.destroy();
        if (this.localStatsReadbackBuf) this.localStatsReadbackBuf.destroy();
        if (this.gridSizeUniformBuf) this.gridSizeUniformBuf.destroy();
        if (this.nUniformBuf) this.nUniformBuf.destroy();
        for (const buf of this.delayBuffers) {
            buf.destroy();
        }
        this.delayBuffers = [];
        if (this.gaugeParamsBuf) this.gaugeParamsBuf.destroy();
        if (this.interactionParamsBuf) this.interactionParamsBuf.destroy();
        if (this.prismaticMetricsAtomicBuf) this.prismaticMetricsAtomicBuf.destroy();
        if (this.prismaticMetricsBuf) this.prismaticMetricsBuf.destroy();
        if (this.prismaticMetricsReadbackBuf) this.prismaticMetricsReadbackBuf.destroy();
        if (this.prismaticStateReadbackBuf) this.prismaticStateReadbackBuf.destroy();
        if (this.graphGaugeBuf) this.graphGaugeBuf.destroy();
        if (this.gaugeReadbackXBuf) this.gaugeReadbackXBuf.destroy();
        if (this.gaugeReadbackYBuf) this.gaugeReadbackYBuf.destroy();
        if (this.gaugeLayerReadbackXBuf) this.gaugeLayerReadbackXBuf.destroy();
        if (this.gaugeLayerReadbackYBuf) this.gaugeLayerReadbackYBuf.destroy();
        if (this.thetaNeighborhoodReadbackBuf) this.thetaNeighborhoodReadbackBuf.destroy();
        if (this.thetaLayerReadbackBuf) this.thetaLayerReadbackBuf.destroy();
        if (this.inputWeightsBuf) this.inputWeightsBuf.destroy();
        if (this.inputSignalBuf) this.inputSignalBuf.destroy();
        if (this.graphNeighborsBuf) this.graphNeighborsBuf.destroy();
        if (this.graphWeightsBuf) this.graphWeightsBuf.destroy();
        if (this.graphCountsBuf) this.graphCountsBuf.destroy();
        if (this.layerParamsBuf) this.layerParamsBuf.destroy();
        this.bindGroupCache.clear();
        if (this.s2BindGroupCache) this.s2BindGroupCache.clear();
        if (this.s3BindGroupCache) this.s3BindGroupCache.clear();
        if (this.gaugeUpdateBindGroupCache) this.gaugeUpdateBindGroupCache.clear();
        if (this.prismaticMetricsBindGroupCache) this.prismaticMetricsBindGroupCache.clear();
}

export function resize(newGridSize) {
        // Destroy old textures and buffers
        for (const tex of this.thetaTextures) {
            tex.destroy();
        }
        if (this.gaugeXTextures) {
            for (const tex of this.gaugeXTextures) tex.destroy();
        }
        if (this.gaugeYTextures) {
            for (const tex of this.gaugeYTextures) tex.destroy();
        }
        if (this.s2Textures) {
            for (const tex of this.s2Textures) {
                tex.destroy();
            }
        }
        if (this.prismaticStateTextures) {
            for (const tex of this.prismaticStateTextures) {
                tex.destroy();
            }
        }
        if (this.thetaStagingBuf) {
            this.thetaStagingBuf.destroy();
        }
        if (this.s2StagingBuf) {
            this.s2StagingBuf.destroy();
        }
        if (this.thetaReadbackBuf) {
            this.thetaReadbackBuf.destroy();
            this.thetaReadbackBuf = null;
        }
        if (this.s2ReadbackBuf) {
            this.s2ReadbackBuf.destroy();
            this.s2ReadbackBuf = null;
        }
        this.omegaBuf.destroy();
        this.omegaVecBuf.destroy();
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
        if (this.graphGaugeBuf) {
            this.graphGaugeBuf.destroy();
        }
        if (this.gaugeParamsBuf) {
            this.gaugeParamsBuf.destroy();
        }
        if (this.interactionParamsBuf) {
            this.interactionParamsBuf.destroy();
        }
        if (this.prismaticMetricsAtomicBuf) {
            this.prismaticMetricsAtomicBuf.destroy();
        }
        if (this.prismaticMetricsBuf) {
            this.prismaticMetricsBuf.destroy();
        }
        if (this.prismaticMetricsReadbackBuf) {
            this.prismaticMetricsReadbackBuf.destroy();
        }
        if (this.prismaticStateReadbackBuf) {
            this.prismaticStateReadbackBuf.destroy();
            this.prismaticStateReadbackBuf = null;
        }
        if (this.gaugeReadbackXBuf) {
            this.gaugeReadbackXBuf.destroy();
            this.gaugeReadbackXBuf = null;
        }
        if (this.gaugeReadbackYBuf) {
            this.gaugeReadbackYBuf.destroy();
            this.gaugeReadbackYBuf = null;
        }
        if (this.gaugeLayerReadbackXBuf) {
            this.gaugeLayerReadbackXBuf.destroy();
            this.gaugeLayerReadbackXBuf = null;
        }
        if (this.gaugeLayerReadbackYBuf) {
            this.gaugeLayerReadbackYBuf.destroy();
            this.gaugeLayerReadbackYBuf = null;
        }
        if (this.thetaNeighborhoodReadbackBuf) {
            this.thetaNeighborhoodReadbackBuf.destroy();
            this.thetaNeighborhoodReadbackBuf = null;
        }
        if (this.thetaLayerReadbackBuf) {
            this.thetaLayerReadbackBuf.destroy();
            this.thetaLayerReadbackBuf = null;
        }
        
        // Clear bind group cache since textures/buffers changed
        this.bindGroupCache.clear();
        if (this.s2BindGroupCache) this.s2BindGroupCache.clear();
        if (this.s3BindGroupCache) this.s3BindGroupCache.clear();
        if (this.gaugeUpdateBindGroupCache) this.gaugeUpdateBindGroupCache.clear();
        if (this.prismaticMetricsBindGroupCache) this.prismaticMetricsBindGroupCache.clear();
        
        // Update size
        this.gridSize = newGridSize;
        this.layerSize = newGridSize * newGridSize;
        this.N = this.layerSize * this.layers;
        this.delayBufferIndex = 0;
        this.gaugeIndex = 0;
        this.prismaticIndex = 0;
        
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

        this.prismaticMetricsNormalizeBindGroup = this.device.createBindGroup({
            layout: this.prismaticMetricsNormalizePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.prismaticMetricsAtomicBuf } },
                { binding: 1, resource: { buffer: this.prismaticMetricsBuf } },
            ],
        });
        
        // Note: Pipeline doesn't need to be recreated as it's size-independent
}
