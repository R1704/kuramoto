/**
 * Reductions shader source exports.
 * Auto-partitioned from legacy monolithic shaders.js for maintainability.
 */

export const REDUCTION_SHADER = `
@group(0) @binding(0) var<storage, read> theta: array<f32>;
@group(0) @binding(1) var<storage, read_write> global_order_atomic: array<atomic<i32>, 2>; // Scaled integer sums

var<workgroup> shared_sum: array<vec2<f32>, 256>; // Shared memory for reduction

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let local_id = lid.x;
    let global_id = gid.x;
    let N = arrayLength(&theta);
    
    // Each thread processes one oscillator (or zero if out of bounds)
    var sum = vec2<f32>(0.0, 0.0);
    if (global_id < N) {
        let t = theta[global_id];
        sum.x = cos(t);
        sum.y = sin(t);
    }
    
    // Store in shared memory
    shared_sum[local_id] = sum;
    workgroupBarrier();
    
    // Tree reduction in shared memory
    for (var offset = 128u; offset > 0u; offset = offset / 2u) {
        if (local_id < offset) {
            shared_sum[local_id] = shared_sum[local_id] + shared_sum[local_id + offset];
        }
        workgroupBarrier();
    }
    
    // First thread of each workgroup atomically adds to global result
    // Scale by 10000 to preserve precision with integers
    if (local_id == 0u) {
        atomicAdd(&global_order_atomic[0], i32(shared_sum[0].x * 10000.0));
        atomicAdd(&global_order_atomic[1], i32(shared_sum[0].y * 10000.0));
    }
}
`;

export const REDUCTION_CONVERT_SHADER = `
@group(0) @binding(0) var<storage, read> global_order_atomic: array<atomic<i32>, 2>;
@group(0) @binding(1) var<storage, read_write> global_order: vec2<f32>;

@compute @workgroup_size(1)
fn main() {
    let x = atomicLoad(&global_order_atomic[0]);
    let y = atomicLoad(&global_order_atomic[1]);
    global_order = vec2<f32>(f32(x) / 10000.0, f32(y) / 10000.0);
}
`;

export const GLOBAL_ORDER_REDUCTION_SHADER = `
@group(0) @binding(0) var<storage, read> theta: array<f32>;
@group(0) @binding(1) var<storage, read_write> global_order_atomic: array<atomic<i32>, 2>;

var<workgroup> shared_sum: array<vec2<f32>, 256>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let local_id = lid.x;
    let global_id = gid.x;
    let N = arrayLength(&theta);
    
    // Each thread processes one oscillator
    var sum = vec2<f32>(0.0, 0.0);
    if (global_id < N) {
        let t = theta[global_id];
        sum.x = cos(t);
        sum.y = sin(t);
    }
    
    // Store in shared memory
    shared_sum[local_id] = sum;
    workgroupBarrier();
    
    // Tree reduction in shared memory (parallel sum)
    for (var offset = 128u; offset > 0u; offset = offset / 2u) {
        if (local_id < offset) {
            shared_sum[local_id] = shared_sum[local_id] + shared_sum[local_id + offset];
        }
        workgroupBarrier();
    }
    
    // First thread of each workgroup atomically adds to global result
    // Scale by 10000 to preserve precision with integers
    if (local_id == 0u) {
        atomicAdd(&global_order_atomic[0], i32(shared_sum[0].x * 10000.0));
        atomicAdd(&global_order_atomic[1], i32(shared_sum[0].y * 10000.0));
    }
}
`;

export const S2_GLOBAL_ORDER_REDUCTION_SHADER = `
@group(0) @binding(0) var<storage, read> state: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> global_order_atomic: array<atomic<i32>, 3>;

var<workgroup> shared_sum: array<vec3<f32>, 256>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let local_id = lid.x;
    let global_id = gid.x;
    let N = arrayLength(&state);

    var sum = vec3<f32>(0.0, 0.0, 0.0);
    if (global_id < N) {
        let v = state[global_id].xyz;
        sum = v;
    }

    shared_sum[local_id] = sum;
    workgroupBarrier();

    for (var offset = 128u; offset > 0u; offset = offset / 2u) {
        if (local_id < offset) {
            shared_sum[local_id] = shared_sum[local_id] + shared_sum[local_id + offset];
        }
        workgroupBarrier();
    }

    if (local_id == 0u) {
        atomicAdd(&global_order_atomic[0], i32(shared_sum[0].x * 10000.0));
        atomicAdd(&global_order_atomic[1], i32(shared_sum[0].y * 10000.0));
        atomicAdd(&global_order_atomic[2], i32(shared_sum[0].z * 10000.0));
    }
}
`;

export const S2_GLOBAL_ORDER_NORMALIZE_SHADER = `
struct Params {
    dt: f32, K0: f32, range: f32, rule_mode: f32,
    cols: f32, rows: f32, harmonic_a: f32, global_coupling: f32,
    delay_steps: f32, sigma: f32, sigma2: f32, beta: f32,
    show_order: f32, colormap: f32, colormap_palette: f32, noise_strength: f32,
    time: f32, harmonic_b: f32, view_mode: f32, kernel_shape: f32, kernel_orientation: f32,
    kernel_aspect: f32, kernel_scale2_weight: f32, kernel_scale3_weight: f32, kernel_asymmetry: f32,
    kernel_rings: f32, ring_width_1: f32, ring_width_2: f32, ring_width_3: f32,
    ring_width_4: f32, ring_width_5: f32, ring_weight_1: f32, ring_weight_2: f32,
    ring_weight_3: f32, ring_weight_4: f32, ring_weight_5: f32, kernel_composition_enabled: f32,
    kernel_secondary: f32, kernel_mix_ratio: f32, kernel_asymmetric_orientation: f32, kernel_spatial_freq_mag: f32,
    kernel_spatial_freq_angle: f32, kernel_gabor_phase: f32,
    zoom: f32, pan_x: f32, pan_y: f32,
    smoothing_enabled: f32, smoothing_mode: f32, input_mode: f32,
    leak: f32, layer_z_offset: f32, layer_kernel_enabled: f32,
    scale_base: f32, scale_radial: f32, scale_random: f32, scale_ring: f32,
    flow_radial: f32, flow_rotate: f32, flow_swirl: f32, flow_bubble: f32,
    flow_ring: f32, flow_vortex: f32, flow_vertical: f32, orient_radial: f32,
    orient_circles: f32, orient_swirl: f32, orient_bubble: f32, orient_linear: f32,
    mesh_mode: f32, manifold_mode: f32, pad5: f32, pad6: f32,
    topology_mode: f32, topology_max_degree: f32, topology_avg_degree: f32, topology_pad: f32,
    layer_count: f32, pad7: f32, pad8: f32, active_layer: f32,
}

@group(0) @binding(0) var<storage, read_write> global_order_atomic: array<atomic<i32>, 3>;
@group(0) @binding(1) var<storage, read_write> global_order: vec2<f32>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(1)
fn main() {
    let x = atomicLoad(&global_order_atomic[0]);
    let y = atomicLoad(&global_order_atomic[1]);
    let z = atomicLoad(&global_order_atomic[2]);

    let N = params.cols * params.rows * max(1.0, params.layer_count);
    let vx = (f32(x) / 10000.0) / N;
    let vy = (f32(y) / 10000.0) / N;
    let vz = (f32(z) / 10000.0) / N;
    let R = length(vec3<f32>(vx, vy, vz));
    global_order.x = R;
    global_order.y = 0.0;
}
`;

export const S3_GLOBAL_ORDER_REDUCTION_SHADER = `
@group(0) @binding(0) var<storage, read> state: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> global_order_atomic: array<atomic<i32>, 4>;

var<workgroup> shared_sum: array<vec4<f32>, 256>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let local_id = lid.x;
    let global_id = gid.x;
    let N = arrayLength(&state);

    var sum = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    if (global_id < N) {
        sum = state[global_id];
    }

    shared_sum[local_id] = sum;
    workgroupBarrier();

    for (var offset = 128u; offset > 0u; offset = offset / 2u) {
        if (local_id < offset) {
            shared_sum[local_id] = shared_sum[local_id] + shared_sum[local_id + offset];
        }
        workgroupBarrier();
    }

    if (local_id == 0u) {
        atomicAdd(&global_order_atomic[0], i32(shared_sum[0].x * 10000.0));
        atomicAdd(&global_order_atomic[1], i32(shared_sum[0].y * 10000.0));
        atomicAdd(&global_order_atomic[2], i32(shared_sum[0].z * 10000.0));
        atomicAdd(&global_order_atomic[3], i32(shared_sum[0].w * 10000.0));
    }
}
`;

export const S3_GLOBAL_ORDER_NORMALIZE_SHADER = `
struct Params {
    dt: f32, K0: f32, range: f32, rule_mode: f32,
    cols: f32, rows: f32, harmonic_a: f32, global_coupling: f32,
    delay_steps: f32, sigma: f32, sigma2: f32, beta: f32,
    show_order: f32, colormap: f32, colormap_palette: f32, noise_strength: f32,
    time: f32, harmonic_b: f32, view_mode: f32, kernel_shape: f32, kernel_orientation: f32,
    kernel_aspect: f32, kernel_scale2_weight: f32, kernel_scale3_weight: f32, kernel_asymmetry: f32,
    kernel_rings: f32, ring_width_1: f32, ring_width_2: f32, ring_width_3: f32,
    ring_width_4: f32, ring_width_5: f32, ring_weight_1: f32, ring_weight_2: f32,
    ring_weight_3: f32, ring_weight_4: f32, ring_weight_5: f32, kernel_composition_enabled: f32,
    kernel_secondary: f32, kernel_mix_ratio: f32, kernel_asymmetric_orientation: f32, kernel_spatial_freq_mag: f32,
    kernel_spatial_freq_angle: f32, kernel_gabor_phase: f32,
    zoom: f32, pan_x: f32, pan_y: f32,
    smoothing_enabled: f32, smoothing_mode: f32, input_mode: f32,
    leak: f32, layer_z_offset: f32, layer_kernel_enabled: f32,
    scale_base: f32, scale_radial: f32, scale_random: f32, scale_ring: f32,
    flow_radial: f32, flow_rotate: f32, flow_swirl: f32, flow_bubble: f32,
    flow_ring: f32, flow_vortex: f32, flow_vertical: f32, orient_radial: f32,
    orient_circles: f32, orient_swirl: f32, orient_bubble: f32, orient_linear: f32,
    mesh_mode: f32, manifold_mode: f32, pad5: f32, pad6: f32,
    topology_mode: f32, topology_max_degree: f32, topology_avg_degree: f32, topology_pad: f32,
    layer_count: f32, pad7: f32, pad8: f32, active_layer: f32,
}

@group(0) @binding(0) var<storage, read_write> global_order_atomic: array<atomic<i32>, 4>;
@group(0) @binding(1) var<storage, read_write> global_order: vec2<f32>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(1)
fn main() {
    let x = atomicLoad(&global_order_atomic[0]);
    let y = atomicLoad(&global_order_atomic[1]);
    let z = atomicLoad(&global_order_atomic[2]);
    let w = atomicLoad(&global_order_atomic[3]);

    let N = params.cols * params.rows * max(1.0, params.layer_count);
    let qx = (f32(x) / 10000.0) / N;
    let qy = (f32(y) / 10000.0) / N;
    let qz = (f32(z) / 10000.0) / N;
    let qw = (f32(w) / 10000.0) / N;
    let R = length(vec4<f32>(qx, qy, qz, qw));
    global_order.x = R;
    global_order.y = 0.0;
}
`;

export const S3_LOCAL_ORDER_STATS_SHADER = `
@group(0) @binding(0) var<storage, read> local_order: array<f32>;
@group(0) @binding(1) var<storage, read_write> stats_atomic: array<atomic<i32>, 4>;
@group(0) @binding(2) var<storage, read_write> hist_atomic: array<atomic<i32>, 16>;
@group(0) @binding(3) var<storage, read> s3_quats: array<vec4<f32>>;  // S³ quaternions for gradient
@group(0) @binding(4) var<uniform> grid_size: u32;

var<workgroup> shared_sums: array<vec4<f32>, 256>;

// Compute quaternion gradient magnitude at a point.
// For S³, gradient = angular distance to neighbors (using 4D dot product)
fn quat_gradient(global_idx: u32, grid: u32) -> f32 {
    let layer_size = grid * grid;
    let layer = global_idx / layer_size;
    let local = global_idx - layer * layer_size;
    let col = local % grid;
    let row = local / grid;
    let base = layer * layer_size;

    // Periodic boundaries (within layer)
    let left_col = (col + grid - 1u) % grid;
    let right_col = (col + 1u) % grid;
    let up_row = (row + grid - 1u) % grid;
    let down_row = (row + 1u) % grid;

    let idx_center = base + row * grid + col;
    let idx_left = base + row * grid + left_col;
    let idx_right = base + row * grid + right_col;
    let idx_up = base + up_row * grid + col;
    let idx_down = base + down_row * grid + col;

    let q_center = s3_quats[idx_center];
    let q_left = s3_quats[idx_left];
    let q_right = s3_quats[idx_right];
    let q_up = s3_quats[idx_up];
    let q_down = s3_quats[idx_down];

    // For quaternions, angular distance = 1 - |dot(q1, q2)|
    // Using absolute value because q and -q represent the same rotation
    let dx = (1.0 - abs(dot(q_center, q_left))) + (1.0 - abs(dot(q_center, q_right)));
    let dy = (1.0 - abs(dot(q_center, q_up))) + (1.0 - abs(dot(q_center, q_down)));

    // Normalize: max value per direction is 2 (two orthogonal neighbors), so /2 gives [0,1]
    return sqrt(dx * dx + dy * dy) * 0.5;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let local_id = lid.x;
    let global_id = gid.x;
    let N = arrayLength(&local_order);

    var sums = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    if (global_id < N) {
        let r = local_order[global_id];
        let grad = quat_gradient(global_id, grid_size);
        sums.x = r;
        sums.y = select(0.0, 1.0, r > 0.7);
        sums.z = grad;
        sums.w = r * r;

        var bin = i32(floor(r * 16.0));
        if (bin < 0) { bin = 0; }
        if (bin > 15) { bin = 15; }
        atomicAdd(&hist_atomic[bin], 1);
    }

    shared_sums[local_id] = sums;
    workgroupBarrier();

    for (var offset = 128u; offset > 0u; offset = offset / 2u) {
        if (local_id < offset) {
            shared_sums[local_id] = shared_sums[local_id] + shared_sums[local_id + offset];
        }
        workgroupBarrier();
    }

    if (local_id == 0u) {
        atomicAdd(&stats_atomic[0], i32(shared_sums[0].x * 10000.0));
        atomicAdd(&stats_atomic[1], i32(shared_sums[0].y * 10000.0));
        atomicAdd(&stats_atomic[2], i32(shared_sums[0].z * 10000.0));
        atomicAdd(&stats_atomic[3], i32(shared_sums[0].w * 10000.0));
    }
}
`;

export const GLOBAL_ORDER_NORMALIZE_SHADER = `
struct Params {
    dt: f32, K0: f32, range: f32, rule_mode: f32,
    cols: f32, rows: f32, harmonic_a: f32, global_coupling: f32,
    delay_steps: f32, sigma: f32, sigma2: f32, beta: f32,
    show_order: f32, colormap: f32, colormap_palette: f32, noise_strength: f32,
    time: f32, harmonic_b: f32, view_mode: f32, kernel_shape: f32, kernel_orientation: f32,
    kernel_aspect: f32, kernel_scale2_weight: f32, kernel_scale3_weight: f32, kernel_asymmetry: f32,
    kernel_rings: f32, ring_width_1: f32, ring_width_2: f32, ring_width_3: f32,
    ring_width_4: f32, ring_width_5: f32, ring_weight_1: f32, ring_weight_2: f32,
    ring_weight_3: f32, ring_weight_4: f32, ring_weight_5: f32, kernel_composition_enabled: f32,
    kernel_secondary: f32, kernel_mix_ratio: f32, kernel_asymmetric_orientation: f32, kernel_spatial_freq_mag: f32,
    kernel_spatial_freq_angle: f32, kernel_gabor_phase: f32,
    zoom: f32, pan_x: f32, pan_y: f32,
    smoothing_enabled: f32, smoothing_mode: f32, input_mode: f32,
    leak: f32, layer_z_offset: f32, layer_kernel_enabled: f32,
    scale_base: f32, scale_radial: f32, scale_random: f32, scale_ring: f32,
    flow_radial: f32, flow_rotate: f32, flow_swirl: f32, flow_bubble: f32,
    flow_ring: f32, flow_vortex: f32, flow_vertical: f32, orient_radial: f32,
    orient_circles: f32, orient_swirl: f32, orient_bubble: f32, orient_linear: f32,
    mesh_mode: f32, manifold_mode: f32, pad5: f32, pad6: f32,
    topology_mode: f32, topology_max_degree: f32, topology_avg_degree: f32, topology_pad: f32,
    layer_count: f32, pad7: f32, pad8: f32, active_layer: f32,
}

@group(0) @binding(0) var<storage, read_write> global_order_atomic: array<atomic<i32>, 2>;
@group(0) @binding(1) var<storage, read_write> global_order: vec2<f32>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(1)
fn main() {
    // Load atomic sums (these are scaled by 10000)
    let x = atomicLoad(&global_order_atomic[0]);
    let y = atomicLoad(&global_order_atomic[1]);
    
    // Convert to float, unscale, and normalize by N (accounts for layered grids)
    let N = params.cols * params.rows * max(1.0, params.layer_count);
    global_order.x = (f32(x) / 10000.0) / N;
    global_order.y = (f32(y) / 10000.0) / N;
}
`;

export const LOCAL_ORDER_STATS_SHADER = `
@group(0) @binding(0) var<storage, read> local_order: array<f32>;  // Per-oscillator local R
@group(0) @binding(1) var<storage, read> theta: array<f32>;         // Phases for gradient
@group(0) @binding(2) var<storage, read_write> stats_atomic: array<atomic<i32>, 4>;
// stats_atomic[0] = sum of local R (scaled by 10000)
// stats_atomic[1] = count of R > 0.7 (sync fraction numerator, scaled by 10000)
// stats_atomic[2] = sum of gradient magnitude (scaled by 10000)
// stats_atomic[3] = sum of R^2 for variance (scaled by 10000)
@group(0) @binding(3) var<storage, read_write> hist_atomic: array<atomic<i32>, 16>;
@group(0) @binding(4) var<uniform> grid_size: u32;

var<workgroup> shared_sums: array<vec4<f32>, 256>;

// Compute phase gradient magnitude at a point.
// NOTE: In multi-layer mode, theta is flattened as [layer][row][col].
// We compute gradients within each layer (never across layer boundaries).
fn phase_gradient(global_idx: u32, grid: u32) -> f32 {
    let layer_size = grid * grid;
    let layer = global_idx / layer_size;
    let local = global_idx - layer * layer_size;
    let col = local % grid;
    let row = local / grid;
    let base = layer * layer_size;

    // Periodic boundaries (within layer)
    let left_col = (col + grid - 1u) % grid;
    let right_col = (col + 1u) % grid;
    let up_row = (row + grid - 1u) % grid;
    let down_row = (row + 1u) % grid;

    let idx_center = base + row * grid + col;
    let idx_left = base + row * grid + left_col;
    let idx_right = base + row * grid + right_col;
    let idx_up = base + up_row * grid + col;
    let idx_down = base + down_row * grid + col;

    let t_center = theta[idx_center];
    let t_left = theta[idx_left];
    let t_right = theta[idx_right];
    let t_up = theta[idx_up];
    let t_down = theta[idx_down];

    // Compute phase differences (wrap-safe via sin)
    let dx = sin(t_right - t_center) + sin(t_center - t_left);
    let dy = sin(t_down - t_center) + sin(t_center - t_up);

    return sqrt(dx * dx + dy * dy) * 0.5;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let local_id = lid.x;
    let global_id = gid.x;
    let N = arrayLength(&local_order);
    let cols = grid_size;
    
    // Each thread processes one oscillator
    var sums = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    if (global_id < N) {
        let r = local_order[global_id];
        sums.x = r;                                    // Local R
        sums.y = select(0.0, 1.0, r > 0.7);           // Sync count (R > 0.7)
        sums.z = phase_gradient(global_id, cols); // Gradient magnitude
        sums.w = r * r;                               // R^2 for variance

        // Histogram bin
        var bin = i32(floor(r * 16.0));
        if (bin < 0) { bin = 0; }
        if (bin > 15) { bin = 15; }
        atomicAdd(&hist_atomic[bin], 1);
    }
    
    // Store in shared memory
    shared_sums[local_id] = sums;
    workgroupBarrier();
    
    // Tree reduction
    for (var offset = 128u; offset > 0u; offset = offset / 2u) {
        if (local_id < offset) {
            shared_sums[local_id] = shared_sums[local_id] + shared_sums[local_id + offset];
        }
        workgroupBarrier();
    }
    
    // First thread atomically adds to global result
    if (local_id == 0u) {
        atomicAdd(&stats_atomic[0], i32(shared_sums[0].x * 10000.0));
        atomicAdd(&stats_atomic[1], i32(shared_sums[0].y * 10000.0));
        atomicAdd(&stats_atomic[2], i32(shared_sums[0].z * 10000.0));
        atomicAdd(&stats_atomic[3], i32(shared_sums[0].w * 10000.0));
    }
}
`;

export const S2_LOCAL_ORDER_STATS_SHADER = `
@group(0) @binding(0) var<storage, read> local_order: array<f32>;
@group(0) @binding(1) var<storage, read_write> stats_atomic: array<atomic<i32>, 4>;
@group(0) @binding(2) var<storage, read_write> hist_atomic: array<atomic<i32>, 16>;
@group(0) @binding(3) var<storage, read> s2_vectors: array<vec4<f32>>;  // S² unit vectors for gradient
@group(0) @binding(4) var<uniform> grid_size: u32;

var<workgroup> shared_sums: array<vec4<f32>, 256>;

// Compute vector gradient magnitude at a point.
// For S², gradient = angular distance to neighbors
fn vector_gradient(global_idx: u32, grid: u32) -> f32 {
    let layer_size = grid * grid;
    let layer = global_idx / layer_size;
    let local = global_idx - layer * layer_size;
    let col = local % grid;
    let row = local / grid;
    let base = layer * layer_size;

    // Periodic boundaries (within layer)
    let left_col = (col + grid - 1u) % grid;
    let right_col = (col + 1u) % grid;
    let up_row = (row + grid - 1u) % grid;
    let down_row = (row + 1u) % grid;

    let idx_center = base + row * grid + col;
    let idx_left = base + row * grid + left_col;
    let idx_right = base + row * grid + right_col;
    let idx_up = base + up_row * grid + col;
    let idx_down = base + down_row * grid + col;

    let v_center = s2_vectors[idx_center].xyz;
    let v_left = s2_vectors[idx_left].xyz;
    let v_right = s2_vectors[idx_right].xyz;
    let v_up = s2_vectors[idx_up].xyz;
    let v_down = s2_vectors[idx_down].xyz;

    // Angular distance = acos(dot(v1, v2)), but use 1 - dot for gradient-like measure
    // This gives 0 for aligned vectors, 2 for opposite vectors
    let dx = (1.0 - dot(v_center, v_left)) + (1.0 - dot(v_center, v_right));
    let dy = (1.0 - dot(v_center, v_up)) + (1.0 - dot(v_center, v_down));

    // Normalize: max value per direction is 4 (two opposite neighbors), so /4 gives [0,1]
    return sqrt(dx * dx + dy * dy) * 0.25;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let local_id = lid.x;
    let global_id = gid.x;
    let N = arrayLength(&local_order);

    var sums = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    if (global_id < N) {
        let r = local_order[global_id];
        let grad = vector_gradient(global_id, grid_size);
        sums.x = r;
        sums.y = select(0.0, 1.0, r > 0.7);
        sums.z = grad;
        sums.w = r * r;

        var bin = i32(floor(r * 16.0));
        if (bin < 0) { bin = 0; }
        if (bin > 15) { bin = 15; }
        atomicAdd(&hist_atomic[bin], 1);
    }

    shared_sums[local_id] = sums;
    workgroupBarrier();

    for (var offset = 128u; offset > 0u; offset = offset / 2u) {
        if (local_id < offset) {
            shared_sums[local_id] = shared_sums[local_id] + shared_sums[local_id + offset];
        }
        workgroupBarrier();
    }

    if (local_id == 0u) {
        atomicAdd(&stats_atomic[0], i32(shared_sums[0].x * 10000.0));
        atomicAdd(&stats_atomic[1], i32(shared_sums[0].y * 10000.0));
        atomicAdd(&stats_atomic[2], i32(shared_sums[0].z * 10000.0));
        atomicAdd(&stats_atomic[3], i32(shared_sums[0].w * 10000.0));
    }
}
`;

export const LOCAL_ORDER_STATS_NORMALIZE_SHADER = `
@group(0) @binding(0) var<storage, read_write> stats_atomic: array<atomic<i32>, 4>;
@group(0) @binding(1) var<storage, read_write> hist_atomic: array<atomic<i32>, 16>;
@group(0) @binding(2) var<storage, read_write> stats_out: array<f32, 21>;
// stats_out[0] = mean local R
// stats_out[1] = sync fraction (R > 0.7)
// stats_out[2] = mean gradient magnitude
// stats_out[3] = variance of local R
// stats_out[4] = N (for reference)
// stats_out[5..20] = histogram bins normalized to [0,1]
@group(0) @binding(3) var<uniform> N: u32;

@compute @workgroup_size(1)
fn main() {
    let sum_r = f32(atomicLoad(&stats_atomic[0])) / 10000.0;
    let sync_count = f32(atomicLoad(&stats_atomic[1])) / 10000.0;
    let sum_grad = f32(atomicLoad(&stats_atomic[2])) / 10000.0;
    let sum_r2 = f32(atomicLoad(&stats_atomic[3])) / 10000.0;
    
    let n = f32(N);
    let mean_r = sum_r / n;
    
    stats_out[0] = mean_r;                           // Mean local R
    stats_out[1] = sync_count / n;                   // Sync fraction
    stats_out[2] = sum_grad / n;                     // Mean gradient (indicates waves)
    stats_out[3] = (sum_r2 / n) - (mean_r * mean_r); // Var(local R) = E[R^2] - E[R]^2
    stats_out[4] = n;
    
    // Histogram normalize
    for (var i = 0u; i < 16u; i = i + 1u) {
        let count = f32(atomicLoad(&hist_atomic[i]));
        stats_out[5u + i] = count / n;
    }
}
`;
