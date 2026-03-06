/**
 * Legacy compatibility barrel for shader source exports.
 * Keep imports stable while sources live in domain files under ./sources.
 */

export { COMPUTE_SHADER, S2_COMPUTE_SHADER, S3_COMPUTE_SHADER } from './sources/compute.js';
export { GAUGE_UPDATE_SHADER } from './sources/gauge.js';
export {
    REDUCTION_SHADER,
    REDUCTION_CONVERT_SHADER,
    GLOBAL_ORDER_REDUCTION_SHADER,
    GLOBAL_ORDER_NORMALIZE_SHADER,
    LOCAL_ORDER_STATS_SHADER,
    LOCAL_ORDER_STATS_NORMALIZE_SHADER,
    S2_GLOBAL_ORDER_REDUCTION_SHADER,
    S2_GLOBAL_ORDER_NORMALIZE_SHADER,
    S2_LOCAL_ORDER_STATS_SHADER,
    S3_GLOBAL_ORDER_REDUCTION_SHADER,
    S3_GLOBAL_ORDER_NORMALIZE_SHADER,
    S3_LOCAL_ORDER_STATS_SHADER,
} from './sources/reductions.js';
export { RENDER_SHADER, RENDER_2D_SHADER } from './sources/render.js';
export { PRISMATIC_METRICS_REDUCTION_SHADER, PRISMATIC_METRICS_NORMALIZE_SHADER } from './sources/prismatic.js';
