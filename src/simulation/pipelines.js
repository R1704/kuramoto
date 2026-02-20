import {
    COMPUTE_SHADER,
    GLOBAL_ORDER_REDUCTION_SHADER,
    GLOBAL_ORDER_NORMALIZE_SHADER,
    LOCAL_ORDER_STATS_SHADER,
    LOCAL_ORDER_STATS_NORMALIZE_SHADER,
    S2_COMPUTE_SHADER,
    S2_GLOBAL_ORDER_REDUCTION_SHADER,
    S2_GLOBAL_ORDER_NORMALIZE_SHADER,
    S2_LOCAL_ORDER_STATS_SHADER,
    S3_COMPUTE_SHADER,
    S3_GLOBAL_ORDER_REDUCTION_SHADER,
    S3_GLOBAL_ORDER_NORMALIZE_SHADER,
    S3_LOCAL_ORDER_STATS_SHADER,
    GAUGE_UPDATE_SHADER,
    PRISMATIC_METRICS_REDUCTION_SHADER,
    PRISMATIC_METRICS_NORMALIZE_SHADER
} from '../shaders/index.js';

export function initPipeline() {
        const module = this.device.createShaderModule({ code: COMPUTE_SHADER });
        this.pipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module, entryPoint: 'main' }
        });

        const s2Module = this.device.createShaderModule({ code: S2_COMPUTE_SHADER });
        this.s2Pipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: s2Module, entryPoint: 'main' }
        });

        const s3Module = this.device.createShaderModule({ code: S3_COMPUTE_SHADER });
        this.s3Pipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: s3Module, entryPoint: 'main' }
        });

        const gaugeUpdateModule = this.device.createShaderModule({ code: GAUGE_UPDATE_SHADER });
        this.gaugeUpdatePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: gaugeUpdateModule, entryPoint: 'main' }
        });

        // Cache bind groups for each delay step
        this.bindGroupCache = new Map();
        this.s2BindGroupCache = new Map();
        this.s3BindGroupCache = new Map();
        this.gaugeUpdateBindGroupCache = new Map();
        this.prismaticMetricsBindGroupCache = new Map();
}

export function initReductionPipeline() {
        // Stage 1: Parallel reduction with atomic accumulation
        const reductionModule = this.device.createShaderModule({ code: GLOBAL_ORDER_REDUCTION_SHADER });
        this.reductionPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: reductionModule, entryPoint: 'main' }
        });

        const s2ReductionModule = this.device.createShaderModule({ code: S2_GLOBAL_ORDER_REDUCTION_SHADER });
        this.s2ReductionPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: s2ReductionModule, entryPoint: 'main' }
        });

        const s3ReductionModule = this.device.createShaderModule({ code: S3_GLOBAL_ORDER_REDUCTION_SHADER });
        this.s3ReductionPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: s3ReductionModule, entryPoint: 'main' }
        });

        // Stage 2: Normalize the accumulated sum
        const normalizeModule = this.device.createShaderModule({ code: GLOBAL_ORDER_NORMALIZE_SHADER });
        this.normalizePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: normalizeModule, entryPoint: 'main' }
        });

        const s2NormalizeModule = this.device.createShaderModule({ code: S2_GLOBAL_ORDER_NORMALIZE_SHADER });
        this.s2NormalizePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: s2NormalizeModule, entryPoint: 'main' }
        });

        const s3NormalizeModule = this.device.createShaderModule({ code: S3_GLOBAL_ORDER_NORMALIZE_SHADER });
        this.s3NormalizePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: s3NormalizeModule, entryPoint: 'main' }
        });

        // Bind groups for reduction stage (per theta buffer)
        this.reductionBindGroups = [null, null];
        this.s2ReductionBindGroups = [null, null];
        this.s3ReductionBindGroups = [null, null];
        
        // Bind group for normalize stage
        this.normalizeBindGroup = this.device.createBindGroup({
            layout: this.normalizePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.globalOrderAtomicBuf } },
                { binding: 1, resource: { buffer: this.globalOrderBuf } },
                { binding: 2, resource: { buffer: this.paramsBuf } }, // For N
            ],
        });

        this.s2NormalizeBindGroup = this.device.createBindGroup({
            layout: this.s2NormalizePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.globalOrderAtomicBuf } },
                { binding: 1, resource: { buffer: this.globalOrderBuf } },
                { binding: 2, resource: { buffer: this.paramsBuf } },
            ],
        });

        this.s3NormalizeBindGroup = this.device.createBindGroup({
            layout: this.s3NormalizePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.globalOrderAtomicBuf } },
                { binding: 1, resource: { buffer: this.globalOrderBuf } },
                { binding: 2, resource: { buffer: this.paramsBuf } },
            ],
        });

        // ============= LOCAL ORDER STATISTICS PIPELINES =============
        const localStatsModule = this.device.createShaderModule({ code: LOCAL_ORDER_STATS_SHADER });
        this.localStatsPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: localStatsModule, entryPoint: 'main' }
        });

        const s2LocalStatsModule = this.device.createShaderModule({ code: S2_LOCAL_ORDER_STATS_SHADER });
        this.s2LocalStatsPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: s2LocalStatsModule, entryPoint: 'main' }
        });

        const s3LocalStatsModule = this.device.createShaderModule({ code: S3_LOCAL_ORDER_STATS_SHADER });
        this.s3LocalStatsPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: s3LocalStatsModule, entryPoint: 'main' }
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

        this.s2LocalStatsBindGroup = this.device.createBindGroup({
            layout: this.s2LocalStatsPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.orderBuf } },
                { binding: 1, resource: { buffer: this.localStatsAtomicBuf } },
                { binding: 2, resource: { buffer: this.localHistAtomicBuf } },
                { binding: 3, resource: { buffer: this.s2StagingBuf } },  // S² vectors for gradient
                { binding: 4, resource: { buffer: this.gridSizeUniformBuf } },
            ],
        });

        // S³ uses same staging buffer as S² (same rgba32float format)
        this.s3LocalStatsBindGroup = this.device.createBindGroup({
            layout: this.s3LocalStatsPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.orderBuf } },
                { binding: 1, resource: { buffer: this.localStatsAtomicBuf } },
                { binding: 2, resource: { buffer: this.localHistAtomicBuf } },
                { binding: 3, resource: { buffer: this.s2StagingBuf } },  // S³ quaternions for gradient
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

        const prismaticReductionModule = this.device.createShaderModule({ code: PRISMATIC_METRICS_REDUCTION_SHADER });
        this.prismaticMetricsReductionPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: prismaticReductionModule, entryPoint: 'main' }
        });

        const prismaticNormalizeModule = this.device.createShaderModule({ code: PRISMATIC_METRICS_NORMALIZE_SHADER });
        this.prismaticMetricsNormalizePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: prismaticNormalizeModule, entryPoint: 'main' }
        });

        this.prismaticMetricsNormalizeBindGroup = this.device.createBindGroup({
            layout: this.prismaticMetricsNormalizePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.prismaticMetricsAtomicBuf } },
                { binding: 1, resource: { buffer: this.prismaticMetricsBuf } },
            ],
        });

}

export function getBindGroup(delaySteps) {
        const delayIdx = (this.delayBufferIndex - delaySteps + this.delayBufferSize) % this.delayBufferSize;
        const currentIdx = this.thetaIndex;
        const nextIdx = currentIdx ^ 1;
        const currentPrismaticIdx = this.prismaticIndex;
        const nextPrismaticIdx = currentPrismaticIdx ^ 1;
        
        // Cache key based on delay index and active theta texture
        const cacheKey = `${delayIdx}:${currentIdx}:${this.gaugeIndex}:${this.prismaticIndex}`;
        if (!this.bindGroupCache.has(cacheKey)) {
            this.bindGroupCache.set(cacheKey, this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: this.thetaTextures[currentIdx].createView({ dimension: '2d-array' }) },
                    { binding: 1, resource: { buffer: this.omegaBuf } },
                    { binding: 2, resource: { buffer: this.paramsBuf } },
                    { binding: 3, resource: { buffer: this.orderBuf } },
                    { binding: 4, resource: { buffer: this.delayBuffers[delayIdx] } },
                    { binding: 5, resource: { buffer: this.globalOrderBuf } },
                    { binding: 6, resource: this.thetaTextures[nextIdx].createView({ dimension: '2d-array' }) },
                    { binding: 7, resource: { buffer: this.inputWeightsBuf } },
                    { binding: 8, resource: { buffer: this.inputSignalBuf } },
                    { binding: 9, resource: { buffer: this.graphNeighborsBuf } },
                    { binding: 10, resource: { buffer: this.graphWeightsBuf } },
                    { binding: 11, resource: { buffer: this.graphCountsBuf } },
                    { binding: 12, resource: { buffer: this.layerParamsBuf } },
                    { binding: 13, resource: this.gaugeXTextures[this.gaugeIndex].createView({ dimension: '2d-array' }) },
                    { binding: 14, resource: this.gaugeYTextures[this.gaugeIndex].createView({ dimension: '2d-array' }) },
                    { binding: 15, resource: { buffer: this.graphGaugeBuf } },
                    { binding: 16, resource: { buffer: this.gaugeParamsBuf } },
                    { binding: 17, resource: { buffer: this.interactionParamsBuf } },
                    { binding: 18, resource: this.prismaticStateTextures[currentPrismaticIdx].createView({ dimension: '2d-array' }) },
                    { binding: 19, resource: this.prismaticStateTextures[nextPrismaticIdx].createView({ dimension: '2d-array' }) },
                ],
            }));
        }
        return this.bindGroupCache.get(cacheKey);
}

export function getPrismaticMetricsBindGroup(thetaIdx = this.thetaIndex, prismaticIdx = this.prismaticIndex) {
        const cacheKey = `${thetaIdx}:${prismaticIdx}`;
        if (!this.prismaticMetricsBindGroupCache.has(cacheKey)) {
            this.prismaticMetricsBindGroupCache.set(cacheKey, this.device.createBindGroup({
                layout: this.prismaticMetricsReductionPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: this.thetaTextures[thetaIdx].createView({ dimension: '2d-array' }) },
                    { binding: 1, resource: this.prismaticStateTextures[prismaticIdx].createView({ dimension: '2d-array' }) },
                    { binding: 2, resource: { buffer: this.paramsBuf } },
                    { binding: 3, resource: { buffer: this.prismaticMetricsAtomicBuf } },
                    { binding: 4, resource: { buffer: this.orderBuf } },
                    { binding: 5, resource: { buffer: this.interactionParamsBuf } },
                ],
            }));
        }
        return this.prismaticMetricsBindGroupCache.get(cacheKey);
}

export function getGaugeUpdateBindGroup() {
        const currentGaugeIdx = this.gaugeIndex;
        const nextGaugeIdx = currentGaugeIdx ^ 1;
        const cacheKey = `${this.thetaIndex}:${currentGaugeIdx}`;
        if (!this.gaugeUpdateBindGroupCache.has(cacheKey)) {
            this.gaugeUpdateBindGroupCache.set(cacheKey, this.device.createBindGroup({
                layout: this.gaugeUpdatePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: this.thetaTextures[this.thetaIndex].createView({ dimension: '2d-array' }) },
                    { binding: 1, resource: { buffer: this.paramsBuf } },
                    { binding: 2, resource: { buffer: this.gaugeParamsBuf } },
                    { binding: 3, resource: this.gaugeXTextures[currentGaugeIdx].createView({ dimension: '2d-array' }) },
                    { binding: 4, resource: this.gaugeYTextures[currentGaugeIdx].createView({ dimension: '2d-array' }) },
                    { binding: 5, resource: this.gaugeXTextures[nextGaugeIdx].createView({ dimension: '2d-array' }) },
                    { binding: 6, resource: this.gaugeYTextures[nextGaugeIdx].createView({ dimension: '2d-array' }) },
                ],
            }));
        }
        return this.gaugeUpdateBindGroupCache.get(cacheKey);
}

export function getS2BindGroup() {
        const currentIdx = this.s2Index;
        const nextIdx = currentIdx ^ 1;
        const cacheKey = `${currentIdx}:${nextIdx}`;
        if (!this.s2BindGroupCache.has(cacheKey)) {
            this.s2BindGroupCache.set(cacheKey, this.device.createBindGroup({
                layout: this.s2Pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: this.s2Textures[currentIdx].createView({ dimension: '2d-array' }) },
                    { binding: 1, resource: { buffer: this.omegaVecBuf } },
                    { binding: 2, resource: { buffer: this.paramsBuf } },
                    { binding: 3, resource: { buffer: this.orderBuf } },
                    { binding: 4, resource: this.s2Textures[nextIdx].createView({ dimension: '2d-array' }) },
                    { binding: 5, resource: { buffer: this.graphNeighborsBuf } },
                    { binding: 6, resource: { buffer: this.graphWeightsBuf } },
                    { binding: 7, resource: { buffer: this.graphCountsBuf } },
                    { binding: 8, resource: { buffer: this.layerParamsBuf } },
                ],
            }));
        }
        return this.s2BindGroupCache.get(cacheKey);
}

export function getS3BindGroup() {
        const currentIdx = this.s2Index;
        const nextIdx = currentIdx ^ 1;
        const cacheKey = `${currentIdx}:${nextIdx}`;
        if (!this.s3BindGroupCache.has(cacheKey)) {
            this.s3BindGroupCache.set(cacheKey, this.device.createBindGroup({
                layout: this.s3Pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: this.s2Textures[currentIdx].createView({ dimension: '2d-array' }) },
                    { binding: 1, resource: { buffer: this.omegaVecBuf } },
                    { binding: 2, resource: { buffer: this.paramsBuf } },
                    { binding: 3, resource: { buffer: this.orderBuf } },
                    { binding: 4, resource: this.s2Textures[nextIdx].createView({ dimension: '2d-array' }) },
                    { binding: 5, resource: { buffer: this.graphNeighborsBuf } },
                    { binding: 6, resource: { buffer: this.graphWeightsBuf } },
                    { binding: 7, resource: { buffer: this.graphCountsBuf } },
                    { binding: 8, resource: { buffer: this.layerParamsBuf } },
                ],
            }));
        }
        return this.s3BindGroupCache.get(cacheKey);
}
