export const COMPUTE_SHADER = `
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
    // Interaction modifiers
    scale_base: f32, scale_radial: f32, scale_random: f32, scale_ring: f32,
    flow_radial: f32, flow_rotate: f32, flow_swirl: f32, flow_bubble: f32,
    flow_ring: f32, flow_vortex: f32, flow_vertical: f32, orient_radial: f32,
    orient_circles: f32, orient_swirl: f32, orient_bubble: f32, orient_linear: f32,
    mesh_mode: f32, pad4: f32, pad5: f32, pad6: f32,
    topology_mode: f32, topology_max_degree: f32, topology_avg_degree: f32, topology_pad: f32,
    layer_count: f32, pad7: f32, pad8: f32, active_layer: f32,
}

struct LayerParams {
    rule_mode: f32,
    K0: f32,
    range: f32,
    harmonic_a: f32,
    harmonic_b: f32,
    sigma: f32,
    sigma2: f32,
    beta: f32,
    noise_strength: f32,
    leak: f32,
    kernel_shape: f32,
    kernel_orientation: f32,
    kernel_aspect: f32,
    kernel_scale2_weight: f32,
    kernel_scale3_weight: f32,
    kernel_asymmetry: f32,
    kernel_rings: f32,
    ring_width_1: f32,
    ring_width_2: f32,
    ring_width_3: f32,
    ring_width_4: f32,
    ring_width_5: f32,
    ring_weight_1: f32,
    ring_weight_2: f32,
    ring_weight_3: f32,
    ring_weight_4: f32,
    ring_weight_5: f32,
    kernel_composition_enabled: f32,
    kernel_secondary: f32,
    kernel_mix_ratio: f32,
    kernel_asymmetric_orientation: f32,
    kernel_spatial_freq_mag: f32,
    kernel_spatial_freq_angle: f32,
    kernel_gabor_phase: f32,
    // Interaction modifiers (per-layer)
    scale_base: f32,
    scale_radial: f32,
    scale_random: f32,
    scale_ring: f32,
    flow_radial: f32,
    flow_rotate: f32,
    flow_swirl: f32,
    flow_bubble: f32,
    flow_ring: f32,
    flow_vortex: f32,
    flow_vertical: f32,
    orient_radial: f32,
    orient_circles: f32,
    orient_swirl: f32,
    orient_bubble: f32,
    orient_linear: f32,
    // Inter-layer coupling (per-layer)
    layer_coupling_up: f32,
    layer_coupling_down: f32,
    // Padding to 56 floats (224 bytes, multiple of 16)
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
}

// Textures for theta state (array layers = hierarchical levels)
@group(0) @binding(0) var theta_in: texture_2d_array<f32>;
@group(0) @binding(1) var<storage, read> omega: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read_write> order: array<f32>;
@group(0) @binding(4) var<storage, read> theta_delayed: array<f32>;
@group(0) @binding(5) var<storage, read> global_order: vec2<f32>;
@group(0) @binding(6) var theta_out: texture_storage_2d_array<r32float, write>;
@group(0) @binding(7) var<storage, read> input_weights: array<f32>;
@group(0) @binding(8) var<uniform> input_signal: f32;
@group(0) @binding(9) var<storage, read> graph_neighbors: array<u32>;
@group(0) @binding(10) var<storage, read> graph_weights: array<f32>;
@group(0) @binding(11) var<storage, read> graph_counts: array<u32>;
@group(0) @binding(12) var<uniform> layer_params: array<LayerParams, 8>;

// ============================================================================
// SHARED MEMORY TILE for fast neighbor access
// Tile size: 16x16 workgroup + 8 pixel border on each side = 32x32
// This covers neighborhood range up to 8
// ============================================================================
const TILE_SIZE: u32 = 16u;
const HALO: u32 = 8u;
const SHARED_SIZE: u32 = 32u; // TILE_SIZE + 2 * HALO
const MAX_GRAPH_DEGREE: u32 = 16u; // Keep in sync with topology.js

var<workgroup> shared_theta: array<f32, 1024>; // 32 * 32 = 1024

fn flattenIndex(col: u32, row: u32, layer: u32, cols: u32, rows: u32) -> u32 {
    return layer * cols * rows + row * cols + col;
}

// Helper to load from theta texture with 2D coordinates (for initial tile load)
fn loadThetaGlobal(col: i32, row: i32, layer: i32, cols: i32, rows: i32) -> f32 {
    // Wrap coordinates for periodic boundary
    var c = col % cols;
    var r = row % rows;
    if (c < 0) { c = c + cols; }
    if (r < 0) { r = r + rows; }
    return textureLoad(theta_in, vec2<i32>(c, r), layer, 0).r;
}

// Helper to read from shared memory tile
fn loadThetaShared(local_c: i32, local_r: i32) -> f32 {
    // Offset by HALO since shared memory includes border
    let sc = u32(local_c + i32(HALO));
    let sr = u32(local_r + i32(HALO));
    return shared_theta[sr * SHARED_SIZE + sc];
}

// Simple hash for pseudo-random modulation
fn hash21(p: vec2<f32>) -> f32 {
    let h = dot(p, vec2<f32>(12.9898, 78.233));
    return fract(sin(h) * 43758.5453);
}

// Cooperative tile loading - each thread loads multiple values to fill shared memory
fn loadTile(
    local_id: vec2<u32>,
    tile_origin: vec2<i32>,
    cols: i32,
    rows: i32,
    layer: i32
) {
    let lid_x = i32(local_id.x);
    let lid_y = i32(local_id.y);
    
    // Each thread in 16x16 workgroup loads 4 values to cover 32x32 tile
    // Thread (lx, ly) loads positions:
    //   (lx*2, ly*2), (lx*2+1, ly*2), (lx*2, ly*2+1), (lx*2+1, ly*2+1)
    for (var dy = 0; dy < 2; dy = dy + 1) {
        for (var dx = 0; dx < 2; dx = dx + 1) {
            let shared_x = u32(lid_x * 2 + dx);
            let shared_y = u32(lid_y * 2 + dy);
            
            if (shared_x < SHARED_SIZE && shared_y < SHARED_SIZE) {
                let global_x = tile_origin.x - i32(HALO) + i32(shared_x);
                let global_y = tile_origin.y - i32(HALO) + i32(shared_y);
                
                shared_theta[shared_y * SHARED_SIZE + shared_x] = loadThetaGlobal(global_x, global_y, layer, cols, rows);
            }
        }
    }
}

fn hash(n: u32) -> f32 {
    var x = (n ^ 61u) ^ (n >> 16u);
    x = x + (x << 3u);
    x = x ^ (x >> 4u);
    x = x * 0x27d4eb2du;
    x = x ^ (x >> 15u);
    return f32(x) / 4294967296.0;
}

fn noise(i: u32, strength: f32) -> f32 {
    let seed = u32(params.time * 1000.0) + i * 12345u;
    return (hash(seed) - 0.5) * strength * 2.0;
}

// Load theta using linear index (graph mode helper)
fn loadThetaByIndex(idx: u32, cols: u32, rows: u32) -> f32 {
    let layer_stride = cols * rows;
    let layer = i32(idx / layer_stride);
    let rem = idx - layer_stride * u32(layer);
    let col = i32(rem % cols);
    let row = i32(rem / cols);
    return textureLoad(theta_in, vec2<i32>(col, row), layer, 0).r;
}

// Local order for graph topology (degree-limited adjacency)
fn localOrderGraph(i: u32, cols: u32, rows: u32) -> f32 {
    let count = min(graph_counts[i], MAX_GRAPH_DEGREE);
    if (count == 0u) { return 0.0; }
    let base = i * MAX_GRAPH_DEGREE;
    var sx = 0.0; var sy = 0.0; var norm = 0.0;
    for (var j = 0u; j < MAX_GRAPH_DEGREE; j = j + 1u) {
        if (j >= count) { break; }
        let idx = graph_neighbors[base + j];
        let theta_j = loadThetaByIndex(idx, cols, rows);
        let w = abs(graph_weights[base + j]);
        sx = sx + cos(theta_j) * w;
        sy = sy + sin(theta_j) * w;
        norm = norm + max(w, 0.0001);
    }
    let inv = 1.0 / norm;
    let cx = sx * inv;
    let cy = sy * inv;
    return sqrt(cx * cx + cy * cy);
}

// Coupling sum for graph mode (returns sum, norm)
fn graphCoupling(i: u32, t: f32, cols: u32, rows: u32) -> vec2<f32> {
    let count = min(graph_counts[i], MAX_GRAPH_DEGREE);
    if (count == 0u) { return vec2<f32>(0.0, 1.0); }
    let base = i * MAX_GRAPH_DEGREE;
    var sum = 0.0; var norm = 0.0;
    for (var j = 0u; j < MAX_GRAPH_DEGREE; j = j + 1u) {
        if (j >= count) { break; }
        let idx = graph_neighbors[base + j];
        let theta_j = loadThetaByIndex(idx, cols, rows);
        let w = graph_weights[base + j];
        sum = sum + w * sin(theta_j - t);
        norm = norm + abs(w);
    }
    if (norm < 0.0001) { norm = f32(count); }
    return vec2<f32>(sum, norm);
}

// Coupling sum using delayed theta (graph mode)
fn graphCouplingDelayed(i: u32, t: f32, cols: u32, rows: u32) -> vec2<f32> {
    let count = min(graph_counts[i], MAX_GRAPH_DEGREE);
    if (count == 0u) { return vec2<f32>(0.0, 1.0); }
    let base = i * MAX_GRAPH_DEGREE;
    var sum = 0.0; var norm = 0.0;
    for (var j = 0u; j < MAX_GRAPH_DEGREE; j = j + 1u) {
        if (j >= count) { break; }
        let idx = graph_neighbors[base + j];
        let theta_j = theta_delayed[idx];
        let w = graph_weights[base + j];
        sum = sum + w * sin(theta_j - t);
        norm = norm + abs(w);
    }
    if (norm < 0.0001) { norm = f32(count); }
    return vec2<f32>(sum, norm);
}

// Harmonics coupling for graph mode (returns s1, s2, s3, norm)
fn graphHarmonics(i: u32, t: f32, cols: u32, rows: u32) -> vec4<f32> {
    let count = min(graph_counts[i], MAX_GRAPH_DEGREE);
    if (count == 0u) { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }
    let base = i * MAX_GRAPH_DEGREE;
    var s1 = 0.0; var s2 = 0.0; var s3 = 0.0; var norm = 0.0;
    for (var j = 0u; j < MAX_GRAPH_DEGREE; j = j + 1u) {
        if (j >= count) { break; }
        let idx = graph_neighbors[base + j];
        let theta_j = loadThetaByIndex(idx, cols, rows);
        let w = graph_weights[base + j];
        let d = theta_j - t;
        s1 = s1 + w * sin(d);
        s2 = s2 + w * sin(2.0 * d);
        s3 = s3 + w * sin(3.0 * d);
        norm = norm + abs(w);
    }
    if (norm < 0.0001) { norm = f32(count); }
    return vec4<f32>(s1, s2, s3, norm);
}

// Local order using shared memory - reads from pre-loaded tile
fn localOrderShared(local_c: i32, local_r: i32, rng: i32) -> f32 {
    var sx = 0.0; var sy = 0.0; var cnt = 0.0;
    
    for (var dr = -rng; dr <= rng; dr = dr + 1) {
        for (var dc = -rng; dc <= rng; dc = dc + 1) {
            if (dr == 0 && dc == 0) { continue; }
            let theta_j = loadThetaShared(local_c + dc, local_r + dr);
            sx = sx + cos(theta_j);
            sy = sy + sin(theta_j);
            cnt = cnt + 1.0;
        }
    }
    return sqrt((sx/cnt)*(sx/cnt) + (sy/cnt)*(sy/cnt));
}

// Local order for global coupling mode (needs global access)
fn localOrderGlobal(i: u32, cols: u32, rows: u32, layer: u32) -> f32 {
    var sx = 0.0; var sy = 0.0; var cnt = 0.0;
    let layer_stride = cols * rows;
    let base = layer * layer_stride;
    
    for (var j = 0u; j < layer_stride; j = j + 1u) {
        let idx = base + j;
        if (idx == i) { continue; }
        let jc = i32(j % cols);
        let jr = i32(j / cols);
        let theta_j = loadThetaGlobal(jc, jr, i32(layer), i32(cols), i32(rows));
        sx = sx + cos(theta_j);
        sy = sy + sin(theta_j);
        cnt = cnt + 1.0;
    }
    return sqrt((sx/cnt)*(sx/cnt) + (sy/cnt)*(sy/cnt));
}

// Spatial coupling helper (shared-memory neighborhood)
fn spatialCoupling(local_c: i32, local_r: i32, rng: i32, t: f32) -> vec2<f32> {
    var sum = 0.0; var cnt = 0.0;
    for (var dr = -rng; dr <= rng; dr = dr + 1) {
        for (var dc = -rng; dc <= rng; dc = dc + 1) {
            if (dr == 0 && dc == 0) { continue; }
            let theta_j = loadThetaShared(local_c + dc, local_r + dr);
            sum = sum + sin(theta_j - t);
            cnt = cnt + 1.0;
        }
    }
    return vec2<f32>(sum, cnt);
}

// Helper function to compute kernel weight for a specific shape
fn mexhat_weight_for_shape_scaled(dx: f32, dy: f32, shape: i32, scale: f32, lp: LayerParams) -> f32 {
    let s1 = lp.sigma * scale;
    let s2 = lp.sigma2 * scale;
    
    var dist_sq = 0.0;
    var base_weight = 0.0;
    
    // Shape 0: Isotropic (circular) - original Mexican-hat
    if (shape == 0) {
        dist_sq = dx * dx + dy * dy;
        let w1 = exp(-dist_sq / (2.0 * s1 * s1));
        let w2 = exp(-dist_sq / (2.0 * s2 * s2));
        base_weight = w1 - lp.beta * w2;
    }
    
    // Shape 1: Anisotropic (elliptical) - rotate and scale
    else if (shape == 1) {
        let angle = lp.kernel_orientation;
        let aspect = lp.kernel_aspect;
        
        // Rotate coordinates
        let cos_a = cos(angle);
        let sin_a = sin(angle);
        let dx_rot = dx * cos_a + dy * sin_a;
        let dy_rot = -dx * sin_a + dy * cos_a;
        
        // Apply anisotropic scaling
        dist_sq = (dx_rot * dx_rot) + (dy_rot * dy_rot) / (aspect * aspect);
        let w1 = exp(-dist_sq / (2.0 * s1 * s1));
        let w2 = exp(-dist_sq / (2.0 * s2 * s2));
        base_weight = w1 - lp.beta * w2;
    }
    
    // Shape 2: Multi-scale (sum of Gaussians at different scales)
    else if (shape == 2) {
        dist_sq = dx * dx + dy * dy;
        
        // Base scale
        let w1 = exp(-dist_sq / (2.0 * s1 * s1));
        let w2 = exp(-dist_sq / (2.0 * s2 * s2));
        base_weight = w1 - lp.beta * w2;
        
        // Second scale at 2× size
        let s1_2 = s1 * 2.0;
        let s2_2 = s2 * 2.0;
        let w1_2 = exp(-dist_sq / (2.0 * s1_2 * s1_2));
        let w2_2 = exp(-dist_sq / (2.0 * s2_2 * s2_2));
        base_weight = base_weight + lp.kernel_scale2_weight * (w1_2 - lp.beta * w2_2);
        
        // Third scale at 3× size
        let s1_3 = s1 * 3.0;
        let s2_3 = s2 * 3.0;
        let w1_3 = exp(-dist_sq / (2.0 * s1_3 * s1_3));
        let w2_3 = exp(-dist_sq / (2.0 * s2_3 * s2_3));
        base_weight = base_weight + lp.kernel_scale3_weight * (w1_3 - lp.beta * w2_3);
    }
    
    // Shape 3: Asymmetric (different forward/backward coupling)
    else if (shape == 3) {
        let angle = lp.kernel_asymmetric_orientation;
        let asymmetry = lp.kernel_asymmetry; // -1 to 1
        
        // Compute angle from center to point
        // Negate dx to match visual X-axis (column indices increase left-to-right visually)
        let point_angle = atan2(dy, -dx);
        
        // Directional modulation: 1.0 along orientation, varies with angle difference
        let angle_diff = point_angle - angle;
        let directional_factor = 1.0 + asymmetry * cos(angle_diff);
        
        dist_sq = dx * dx + dy * dy;
        let w1 = exp(-dist_sq / (2.0 * s1 * s1));
        let w2 = exp(-dist_sq / (2.0 * s2 * s2));
        base_weight = directional_factor * (w1 - lp.beta * w2);
    }
    
    // Shape 4: Step/Rectangular (constant within sigma, zero outside)
    else if (shape == 4) {
        let dist = sqrt(dx * dx + dy * dy);
        if (dist < s1) {
            base_weight = 1.0;
        } else if (dist < s2) {
            base_weight = -lp.beta;
        } else {
            base_weight = 0.0;
        }
    }
    
    // Shape 5: Multi-ring (customizable ring widths and weights)
    else if (shape == 5) {
        let r = sqrt(dx * dx + dy * dy);
        let r_norm = r / s2; // normalize to [0, 1] range (sigma2 = max radius)
        let num_rings = i32(lp.kernel_rings);
        
        base_weight = 0.0; // outside all rings
        
        // Check each ring (unrolled for efficiency)
        if (num_rings >= 1 && r_norm < lp.ring_width_1) {
            let ring_center = lp.ring_width_1 * 0.5 * s2;
            let dist_from_center = abs(r - ring_center);
            let gaussian = exp(-dist_from_center * dist_from_center / (2.0 * s1 * s1));
            base_weight = lp.ring_weight_1 * gaussian;
        }
        else if (num_rings >= 2 && r_norm < lp.ring_width_2) {
            let ring_inner = lp.ring_width_1;
            let ring_center = (ring_inner + lp.ring_width_2) * 0.5 * s2;
            let dist_from_center = abs(r - ring_center);
            let gaussian = exp(-dist_from_center * dist_from_center / (2.0 * s1 * s1));
            base_weight = lp.ring_weight_2 * gaussian;
        }
        else if (num_rings >= 3 && r_norm < lp.ring_width_3) {
            let ring_inner = lp.ring_width_2;
            let ring_center = (ring_inner + lp.ring_width_3) * 0.5 * s2;
            let dist_from_center = abs(r - ring_center);
            let gaussian = exp(-dist_from_center * dist_from_center / (2.0 * s1 * s1));
            base_weight = lp.ring_weight_3 * gaussian;
        }
        else if (num_rings >= 4 && r_norm < lp.ring_width_4) {
            let ring_inner = lp.ring_width_3;
            let ring_center = (ring_inner + lp.ring_width_4) * 0.5 * s2;
            let dist_from_center = abs(r - ring_center);
            let gaussian = exp(-dist_from_center * dist_from_center / (2.0 * s1 * s1));
            base_weight = lp.ring_weight_4 * gaussian;
        }
        else if (num_rings >= 5 && r_norm < lp.ring_width_5) {
            let ring_inner = lp.ring_width_4;
            let ring_center = (ring_inner + lp.ring_width_5) * 0.5 * s2;
            let dist_from_center = abs(r - ring_center);
            let gaussian = exp(-dist_from_center * dist_from_center / (2.0 * s1 * s1));
            base_weight = lp.ring_weight_5 * gaussian;
        }
    }
    
    // Shape 6: Gabor (Gaussian envelope × sinusoidal carrier)
    else if (shape == 6) {
        // Gabor with Mexican-hat structure: (w1 - β·w2) · cos(k·r + φ)
        // This allows inhibitory surround while maintaining oscillatory pattern
        // where k_x = k·cos(θ), k_y = k·sin(θ)
        
        let dist_sq = dx * dx + dy * dy;
        let w1 = exp(-dist_sq / (2.0 * s1 * s1)); // excitatory envelope
        let w2 = exp(-dist_sq / (2.0 * s2 * s2)); // inhibitory envelope
        let envelope = w1 - lp.beta * w2; // Mexican-hat envelope
        
        // Spatial frequency components
        let k = lp.kernel_spatial_freq_mag;
        let theta = lp.kernel_spatial_freq_angle;
        let k_x = k * cos(theta);
        let k_y = k * sin(theta);
        
        // Sinusoidal carrier with phase offset
        let phase = k_x * dx + k_y * dy + lp.kernel_gabor_phase;
        let carrier = cos(phase);
        
        base_weight = envelope * carrier;
    }
    
    else {
        // Default to isotropic
        dist_sq = dx * dx + dy * dy;
        let w1 = exp(-dist_sq / (2.0 * s1 * s1));
        let w2 = exp(-dist_sq / (2.0 * s2 * s2));
        base_weight = w1 - lp.beta * w2;
    }
    
    return base_weight;
}

fn mexhat_weight_scaled(dx: f32, dy: f32, scale: f32, lp: LayerParams) -> f32 {
    let primary_shape = i32(lp.kernel_shape);
    
    // Check if composition is enabled
    if (lp.kernel_composition_enabled > 0.5) {
        let secondary_shape = i32(lp.kernel_secondary);
        let mix_ratio = lp.kernel_mix_ratio;
        
        // Evaluate both kernels
        let primary_weight = mexhat_weight_for_shape_scaled(dx, dy, primary_shape, scale, lp);
        let secondary_weight = mexhat_weight_for_shape_scaled(dx, dy, secondary_shape, scale, lp);
        
        // Mix: 0 = all secondary, 1 = all primary
        return mix(secondary_weight, primary_weight, mix_ratio);
    } else {
        // Single kernel mode
        return mexhat_weight_for_shape_scaled(dx, dy, primary_shape, scale, lp);
    }
}

fn mexhat_weight(dx: f32, dy: f32, lp: LayerParams) -> f32 {
    return mexhat_weight_scaled(dx, dy, 1.0, lp);
}

fn kernelCouplingLayer(global_c: u32, global_r: u32, cols: u32, rows: u32, source_layer: u32, t: f32, lp: LayerParams) -> f32 {
    let rng_ext = i32(clamp(lp.sigma2 * 3.0, 1.0, 8.0));
    var sum = 0.0; var wtotal = 0.0;
    for (var dr = -rng_ext; dr <= rng_ext; dr = dr + 1) {
        for (var dc = -rng_ext; dc <= rng_ext; dc = dc + 1) {
            if (dr == 0 && dc == 0) { continue; }
            let w = mexhat_weight_scaled(f32(dc), f32(dr), 1.0, lp);
            if (abs(w) < 0.0001) { continue; }
            let theta_j = loadThetaGlobal(i32(global_c) + dc, i32(global_r) + dr, i32(source_layer), i32(cols), i32(rows));
            sum = sum + w * sin(theta_j - t);
            wtotal = wtotal + abs(w);
        }
    }
    if (wtotal < 0.0001) { return 0.0; }
    return sum / wtotal;
}

fn rule_classic(local_c: i32, local_r: i32, rng: i32, t: f32, i: u32, cols: u32, rows: u32, lp: LayerParams) -> f32 {
    var sum = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field: Z = (cos_avg, sin_avg)
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        sum = Z_sin * cos(t) - Z_cos * sin(t);
        cnt = 1.0;
    } else if (params.topology_mode > 0.5) {
        let res = graphCoupling(i, t, cols, rows);
        sum = res.x;
        cnt = res.y;
    } else {
        let res = spatialCoupling(local_c, local_r, rng, t);
        sum = res.x;
        cnt = res.y;
    }
    return lp.K0 * (sum / max(cnt, 1e-5));
}

fn rule_coherence(local_c: i32, local_r: i32, rng: i32, t: f32, i: u32, cols: u32, rows: u32, ri: f32, lp: LayerParams) -> f32 {
    var sum = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        sum = Z_sin * cos(t) - Z_cos * sin(t);
        cnt = 1.0;
    } else if (params.topology_mode > 0.5) {
        let res = graphCoupling(i, t, cols, rows);
        sum = res.x;
        cnt = res.y;
    } else {
        let res = spatialCoupling(local_c, local_r, rng, t);
        sum = res.x;
        cnt = res.y;
    }
    let Ki = lp.K0 * (1.0 - 0.8 * ri);
    return Ki * (sum / max(cnt, 1e-5));
}

fn rule_curvature(local_c: i32, local_r: i32, rng: i32, t: f32, i: u32, cols: u32, rows: u32, lp: LayerParams) -> f32 {
    var sum = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        sum = Z_sin * cos(t) - Z_cos * sin(t);
        cnt = 1.0;
    } else if (params.topology_mode > 0.5) {
        let res = graphCoupling(i, t, cols, rows);
        sum = res.x;
        cnt = res.y;
    } else {
        let res = spatialCoupling(local_c, local_r, rng, t);
        sum = res.x;
        cnt = res.y;
    }
    let lap = sum / max(cnt, 1e-5);
    return lp.K0 * min(1.0, abs(lap) * 2.0) * lap;
}

fn rule_harmonics(local_c: i32, local_r: i32, rng: i32, t: f32, i: u32, cols: u32, rows: u32, lp: LayerParams) -> f32 {
    var s1 = 0.0; var s2 = 0.0; var s3 = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field for fundamental
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        s1 = Z_sin * cos(t) - Z_cos * sin(t);
        
        // For harmonics, use fundamental with harmonic coefficients
        let Z_mag = sqrt(Z_cos * Z_cos + Z_sin * Z_sin);
        s2 = s1 * lp.harmonic_a * Z_mag;
        s3 = s1 * lp.harmonic_b * Z_mag;
        cnt = 1.0;
    } else if (params.topology_mode > 0.5) {
        let res = graphHarmonics(i, t, cols, rows);
        s1 = res.x; s2 = res.y; s3 = res.z; cnt = res.w;
    } else {
        // Use shared memory for local coupling
        for (var dr = -rng; dr <= rng; dr = dr + 1) {
            for (var dc = -rng; dc <= rng; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                let theta_j = loadThetaShared(local_c + dc, local_r + dr);
                let d = theta_j - t;
                s1 = s1 + sin(d);
                s2 = s2 + sin(2.0 * d);
                s3 = s3 + sin(3.0 * d);
                cnt = cnt + 1.0;
            }
        }
    }
    return lp.K0 * ((s1 + lp.harmonic_a * s2 + lp.harmonic_b * s3) / max(cnt, 1e-5));
}

// rule_kernel needs larger range - use shared memory when possible, fall back to global
fn rule_kernel(local_c: i32, local_r: i32, global_c: i32, global_r: i32, cols: i32, rows: i32, layer: i32, t: f32, i: u32, lp: LayerParams) -> f32 {
    if (params.topology_mode > 0.5) {
        let res = graphCoupling(i, t, u32(cols), u32(rows));
        return lp.K0 * (res.x / max(res.y, 1e-5));
    }

    var sum = 0.0; var wtotal = 0.0;
    
    let rng_ext = i32(lp.sigma2 * 3.0);
    
    // If range fits in shared memory (halo = 8), use it
    if (rng_ext <= i32(HALO)) {
        for (var dr = -rng_ext; dr <= rng_ext; dr = dr + 1) {
            for (var dc = -rng_ext; dc <= rng_ext; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                let theta_j = loadThetaShared(local_c + dc, local_r + dr);
                let w = mexhat_weight(f32(dc), f32(dr), lp);
                sum = sum + w * sin(theta_j - t);
                wtotal = wtotal + abs(w);
            }
        }
    } else {
        // Fall back to global texture access for large kernels
        for (var dr = -rng_ext; dr <= rng_ext; dr = dr + 1) {
            for (var dc = -rng_ext; dc <= rng_ext; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                let theta_j = loadThetaGlobal(global_c + dc, global_r + dr, layer, cols, rows);
                let w = mexhat_weight(f32(dc), f32(dr), lp);
                sum = sum + w * sin(theta_j - t);
                wtotal = wtotal + abs(w);
            }
        }
    }
    
    if (wtotal > 0.0) {
        return lp.K0 * (sum / wtotal);
    }
    return 0.0;
}

fn rule_delay(local_c: i32, local_r: i32, global_c: u32, global_r: u32, cols: u32, rows: u32, rng: i32, t: f32, i: u32, lp: LayerParams) -> f32 {
    // Delay mode uses storage buffer for delayed theta values, not shared memory
    var sum = 0.0; var cnt = 0.0;
    
    if (params.topology_mode > 0.5) {
        let res = graphCouplingDelayed(i, t, cols, rows);
        sum = res.x;
        cnt = res.y;
        return lp.K0 * (sum / max(cnt, 1e-5));
    }
    
    for (var dr = -rng; dr <= rng; dr = dr + 1) {
        for (var dc = -rng; dc <= rng; dc = dc + 1) {
            if (dr == 0 && dc == 0) { continue; }
            var rr = (i32(global_r) + dr) % i32(rows);
            var cc = (i32(global_c) + dc) % i32(cols);
            if (rr < 0) { rr = rr + i32(rows); }
            if (cc < 0) { cc = cc + i32(cols); }
            let j = u32(rr) * cols + u32(cc);
            sum = sum + sin(theta_delayed[j] - t);
            cnt = cnt + 1.0;
        }
    }
    return lp.K0 * (sum / max(cnt, 1e-5));
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wg_id: vec3<u32>) {
    let cols = u32(params.cols); let rows = u32(params.rows);
    let layer = wg_id.z;
    if (layer >= u32(params.layer_count)) { return; }
    
    // Local coordinates within workgroup (0-15)
    let local_c = i32(lid.x);
    let local_r = i32(lid.y);
    
    // Global coordinates
    let global_c = id.x;
    let global_r = id.y;
    
    // Tile origin in global coordinates (top-left of the 16x16 output area)
    let tile_origin = vec2<i32>(i32(wg_id.x) * i32(TILE_SIZE), i32(wg_id.y) * i32(TILE_SIZE));
    
    // Cooperative tile loading using helper function
    loadTile(lid.xy, tile_origin, i32(cols), i32(rows), i32(layer));
    
    // Synchronize: ensure all threads have loaded their data
    workgroupBarrier();
    
    // Early exit for out-of-bounds threads (after loading!)
    if (global_c >= cols || global_r >= rows) { return; }
    
    let layer_stride = cols * rows;
    let i = layer * layer_stride + global_r * cols + global_c;
    let t = loadThetaShared(local_c, local_r);  // Center value from shared memory
    let lp = layer_params[min(layer, 7u)];
    let rng = i32(lp.range);
    // Compute local order (graph vs spatial)
    var ri = 0.0;
    if (params.topology_mode > 0.5) {
        ri = localOrderGraph(i, cols, rows);
    } else {
        ri = localOrderShared(local_c, local_r, rng);
    }
    order[i] = ri;
    
    var dtheta = 0.0;
    let mode = i32(lp.rule_mode);
    if (mode == 0) { dtheta = rule_classic(local_c, local_r, rng, t, i, cols, rows, lp); }
    else if (mode == 1) { dtheta = rule_coherence(local_c, local_r, rng, t, i, cols, rows, ri, lp); }
    else if (mode == 2) { dtheta = rule_curvature(local_c, local_r, rng, t, i, cols, rows, lp); }
    else if (mode == 3) { dtheta = rule_harmonics(local_c, local_r, rng, t, i, cols, rows, lp); }
    else if (mode == 4) { dtheta = rule_kernel(local_c, local_r, i32(global_c), i32(global_r), i32(cols), i32(rows), i32(layer), t, i, lp); }
    else if (mode == 5) { dtheta = rule_delay(local_c, local_r, global_c, global_r, cols, rows, rng, t, i, lp); }

    // Inter-layer coupling (same-cell or kernel-based)
    var inter_sum = 0.0;
    let use_kernel = params.layer_kernel_enabled > 0.5;
    if (layer > 0u && abs(lp.layer_coupling_up) > 0.0001) {
        let src_layer = layer - 1u;
        if (use_kernel) {
            let src_lp = layer_params[min(src_layer, 7u)];
            let ksum = kernelCouplingLayer(global_c, global_r, cols, rows, src_layer, t, src_lp);
            inter_sum = inter_sum + lp.layer_coupling_up * ksum;
        } else {
            let t_up = loadThetaGlobal(i32(global_c), i32(global_r), i32(src_layer), i32(cols), i32(rows));
            inter_sum = inter_sum + lp.layer_coupling_up * sin(t_up - t);
        }
    }
    if (layer + 1u < u32(params.layer_count) && abs(lp.layer_coupling_down) > 0.0001) {
        let src_layer = layer + 1u;
        if (use_kernel) {
            let src_lp = layer_params[min(src_layer, 7u)];
            let ksum = kernelCouplingLayer(global_c, global_r, cols, rows, src_layer, t, src_lp);
            inter_sum = inter_sum + lp.layer_coupling_down * ksum;
        } else {
            let t_down = loadThetaGlobal(i32(global_c), i32(global_r), i32(src_layer), i32(cols), i32(rows));
            inter_sum = inter_sum + lp.layer_coupling_down * sin(t_down - t);
        }
    }
    let dtheta_base = dtheta;
    
    // Add noise perturbation
    if (lp.noise_strength > 0.001) {
        dtheta = dtheta + noise(i, lp.noise_strength);
    }
    
    // Reservoir computing input: selectable injection mode
    // mode 0: frequency modulation (default)
    // mode 1: additive phase drive (torque)
    // mode 2: coupling modulation (scales dtheta locally)
    let input_drive = input_weights[i] * input_signal;
    var omega_eff = omega[i];
    var dtheta_input = 0.0;
    let inj_mode = i32(params.input_mode + 0.5);
    if (inj_mode == 0) {
        omega_eff = omega_eff + input_drive * 5.0;
    } else if (inj_mode == 1) {
        dtheta_input = input_drive * 5.0;
    } else if (inj_mode == 2) {
        dtheta = dtheta * (1.0 + input_drive * 0.5);
    }
    
    // Apply flow/orientation modulation (phase advection proxy)
    // Simple additive bias based on position normalized to [-0.5, 0.5]
    // Now uses per-layer interaction params from lp
    let norm_x = (f32(global_c) / params.cols) - 0.5;
    let norm_y = (f32(global_r) / params.rows) - 0.5;

    // Flow contributions (per-layer)
    let flow =
        (lp.flow_radial * norm_x +
        lp.flow_rotate * (-norm_y) +
        lp.flow_swirl * (norm_x * norm_y) +
        lp.flow_bubble * (norm_x * norm_x - norm_y * norm_y) +
        lp.flow_ring * (norm_x * norm_x + norm_y * norm_y) +
        lp.flow_vortex * (norm_x * -norm_y) +
        lp.flow_vertical * norm_y) * 2.0;
    // Orientation modulation (per-layer, acts as anisotropic scaling of dtheta)
    var orient = 1.0 +
        lp.orient_radial * abs(norm_x) * 4.0 +
        lp.orient_circles * abs(norm_y) * 4.0 +
        lp.orient_swirl * (norm_x * norm_y) * 4.0 +
        lp.orient_bubble * (norm_x * norm_x - norm_y * norm_y) * 4.0 +
        lp.orient_linear * norm_y * 4.0;
    orient = clamp(orient, 0.05, 8.0);

    // Scale modulation of K0 (per-layer) - clamp to avoid negative/huge values
    let rand = hash21(vec2<f32>(f32(global_c), f32(global_r))) - 0.5;
    let scale_mod = lp.scale_base
        + lp.scale_radial * (abs(norm_x) + abs(norm_y)) * 2.0
        + lp.scale_random * rand * 2.0
        + lp.scale_ring * (norm_x * norm_x + norm_y * norm_y) * 4.0;
    let K_scaled = lp.K0 * clamp(scale_mod, 0.1, 5.0);
    // Adjust dtheta by new K (approximate): rescale by ratio of K_scaled / K0
    let dtheta_scaled = dtheta_base * (K_scaled / max(lp.K0, 1e-6));

    var dyn = omega_eff + dtheta_scaled * orient + inter_sum + dtheta_input + flow;
    dyn = dyn * (1.0 - lp.leak);
    var newTheta = t + dyn * params.dt;
    
    let TWO_PI = 6.28318530718;
    if (newTheta < 0.0) { newTheta = newTheta + TWO_PI; }
    if (newTheta > TWO_PI) { newTheta = newTheta - TWO_PI; }
    textureStore(theta_out, vec2<i32>(i32(global_c), i32(global_r)), i32(layer), vec4<f32>(newTheta, 0.0, 0.0, 1.0));
}
`;

export const RENDER_SHADER = `
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
    mesh_mode: f32, pad4: f32, pad5: f32, pad6: f32,
    topology_mode: f32, topology_max_degree: f32, topology_avg_degree: f32, topology_pad: f32,
    layer_count: f32, pad7: f32, pad8: f32, active_layer: f32,
}
@group(0) @binding(0) var theta_tex: texture_2d_array<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<uniform> viewProj: mat4x4<f32>;
@group(0) @binding(3) var<storage, read> order: array<f32>;
@group(0) @binding(4) var textureSampler: sampler;
@group(0) @binding(5) var externalTexture: texture_2d<f32>;
@group(0) @binding(6) var<uniform> render_layer: vec4<f32>;

// Helper to load theta from texture
fn loadThetaRender(col: u32, row: u32, layer: u32) -> f32 {
    return textureLoad(theta_tex, vec2<i32>(i32(col), i32(row)), i32(layer), 0).r;
}

fn compute_gradient(ii: u32, cols: u32, rows: u32, layer: u32) -> f32 {
    let c = ii % cols;
    let r = ii / cols;
    
    var cr = (c + 1u) % cols;
    var cl = (c + cols - 1u) % cols;
    var ru = (r + 1u) % rows;
    var rd = (r + rows - 1u) % rows;
    
    let right = loadThetaRender(cr, r, layer);
    let left = loadThetaRender(cl, r, layer);
    let up = loadThetaRender(c, ru, layer);
    let down = loadThetaRender(c, rd, layer);
    
    var dx = right - left;
    var dy = up - down;
    
    // Unwrap phase differences
    if (dx > 3.14159) { dx = dx - 6.28318; }
    if (dx < -3.14159) { dx = dx + 6.28318; }
    if (dy > 3.14159) { dy = dy - 6.28318; }
    if (dy < -3.14159) { dy = dy + 6.28318; }
    
    return sqrt(dx * dx + dy * dy) * 0.5;
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) height: f32,
    @location(1) order_val: f32,
    @location(2) gradient: f32,
    @location(3) texcoord: vec2<f32>,
}
@vertex
fn vs_main(@location(0) pos: vec2<f32>, @builtin(instance_index) ii: u32) -> VertexOutput {
    let cols = params.cols;
    let rows = params.rows;
    let use_mesh = params.mesh_mode > 0.5;
    let total_layers = max(1u, u32(params.layer_count));
    let active_layer = min(u32(render_layer.x + 0.5), total_layers - 1u);
    let layer_stride = u32(cols) * u32(rows);

    // Grid coordinates (float)
    var gx = pos.x;
    var gy = pos.y;
    // Cell indices used for sampling
    var c_i: i32 = 0;
    var r_i: i32 = 0;
    if (!use_mesh) {
        // Quad verts are 0..1, instance supplies cell index
        let c = i32(ii % u32(cols));
        let r = i32(ii / u32(cols));
        gx = f32(c) + pos.x;
        gy = f32(r) + pos.y;
        c_i = c;
        r_i = r;
    } else {
        c_i = clamp(i32(gx), 0, i32(cols) - 1);
        r_i = clamp(i32(gy), 0, i32(rows) - 1);
    }

    // Sample theta/order at the cell (flat per-instance when instanced)
    let theta_val = loadThetaRender(u32(c_i), u32(r_i), active_layer);
    let height_3d = sin(theta_val) * 2.0;
    let is_3d = params.view_mode < 0.5;
    let height_2d = f32(r_i) * 0.0001; // tiny offset to avoid Z-fight in 2D
    let h = select(height_2d, height_3d, is_3d);

    // World coords centered
    let x = gx * 0.5 - cols * 0.25;
    let z = gy * 0.5 - rows * 0.25;

    var output: VertexOutput;
    let layer_offset = select(0.0, params.layer_z_offset * f32(active_layer), is_3d);
    output.position = viewProj * vec4<f32>(x, h + layer_offset, z, 1.0);
    output.height = height_3d;
    let idx = active_layer * layer_stride + u32(r_i) * u32(cols) + u32(c_i);
    output.order_val = order[idx];
    output.gradient = compute_gradient(idx, u32(cols), u32(rows), active_layer);
    output.texcoord = vec2<f32>(gx / cols, gy / rows);
    return output;
}

// Colormap helper functions for 3D shader
fn colormap3d_viridis(t: f32) -> vec3<f32> {
    let c0 = vec3<f32>(0.267004, 0.004874, 0.329415);
    let c1 = vec3<f32>(0.282327, 0.140926, 0.457517);
    let c2 = vec3<f32>(0.253935, 0.265254, 0.529983);
    let c3 = vec3<f32>(0.206756, 0.371758, 0.553117);
    let c4 = vec3<f32>(0.163625, 0.471133, 0.558148);
    let c5 = vec3<f32>(0.127568, 0.566949, 0.550556);
    let c6 = vec3<f32>(0.134692, 0.658636, 0.517649);
    let c7 = vec3<f32>(0.266941, 0.748751, 0.440573);
    let c8 = vec3<f32>(0.477504, 0.821444, 0.318195);
    let c9 = vec3<f32>(0.741388, 0.873449, 0.149561);
    let c10 = vec3<f32>(0.993248, 0.906157, 0.143936);
    let idx = clamp(t, 0.0, 1.0) * 10.0;
    let i = i32(floor(idx));
    let f = fract(idx);
    var colors = array<vec3<f32>, 11>(c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10);
    if (i >= 10) { return c10; }
    return mix(colors[i], colors[i + 1], f);
}

fn colormap3d_plasma(t: f32) -> vec3<f32> {
    let c0 = vec3<f32>(0.050383, 0.029803, 0.527975);
    let c1 = vec3<f32>(0.254627, 0.013882, 0.615419);
    let c2 = vec3<f32>(0.417642, 0.000564, 0.658390);
    let c3 = vec3<f32>(0.562738, 0.051545, 0.641509);
    let c4 = vec3<f32>(0.692840, 0.165141, 0.564522);
    let c5 = vec3<f32>(0.798216, 0.280197, 0.469538);
    let c6 = vec3<f32>(0.881443, 0.392529, 0.383229);
    let c7 = vec3<f32>(0.949217, 0.517763, 0.295662);
    let c8 = vec3<f32>(0.988648, 0.652325, 0.211364);
    let c9 = vec3<f32>(0.988648, 0.809579, 0.145357);
    let c10 = vec3<f32>(0.940015, 0.975158, 0.131326);
    let idx = clamp(t, 0.0, 1.0) * 10.0;
    let i = i32(floor(idx));
    let f = fract(idx);
    var colors = array<vec3<f32>, 11>(c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10);
    if (i >= 10) { return c10; }
    return mix(colors[i], colors[i + 1], f);
}

fn colormap3d_twilight(t: f32) -> vec3<f32> {
    let c0 = vec3<f32>(0.886, 0.851, 0.906);
    let c1 = vec3<f32>(0.816, 0.576, 0.678);
    let c2 = vec3<f32>(0.659, 0.318, 0.459);
    let c3 = vec3<f32>(0.420, 0.180, 0.357);
    let c4 = vec3<f32>(0.184, 0.165, 0.329);
    let c5 = vec3<f32>(0.184, 0.165, 0.329);
    let c6 = vec3<f32>(0.125, 0.278, 0.353);
    let c7 = vec3<f32>(0.192, 0.431, 0.427);
    let c8 = vec3<f32>(0.388, 0.588, 0.529);
    let c9 = vec3<f32>(0.663, 0.757, 0.690);
    let c10 = vec3<f32>(0.886, 0.851, 0.906);
    let idx = clamp(t, 0.0, 1.0) * 10.0;
    let i = i32(floor(idx));
    let f = fract(idx);
    var colors = array<vec3<f32>, 11>(c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10);
    if (i >= 10) { return c10; }
    return mix(colors[i], colors[i + 1], f);
}

fn colormap3d_inferno(t: f32) -> vec3<f32> {
    let c0 = vec3<f32>(0.001, 0.000, 0.014);
    let c1 = vec3<f32>(0.122, 0.047, 0.224);
    let c2 = vec3<f32>(0.281, 0.073, 0.382);
    let c3 = vec3<f32>(0.448, 0.096, 0.397);
    let c4 = vec3<f32>(0.610, 0.134, 0.345);
    let c5 = vec3<f32>(0.761, 0.214, 0.235);
    let c6 = vec3<f32>(0.876, 0.337, 0.123);
    let c7 = vec3<f32>(0.949, 0.493, 0.020);
    let c8 = vec3<f32>(0.976, 0.667, 0.117);
    let c9 = vec3<f32>(0.964, 0.843, 0.354);
    let c10 = vec3<f32>(0.988, 0.998, 0.645);
    let idx = clamp(t, 0.0, 1.0) * 10.0;
    let i = i32(floor(idx));
    let f = fract(idx);
    var colors = array<vec3<f32>, 11>(c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10);
    if (i >= 10) { return c10; }
    return mix(colors[i], colors[i + 1], f);
}

// Cosine phase map to match 2D default palette
fn colormap_phase(t: f32) -> vec3<f32> {
    let phase = t * 6.28318530718;
    return vec3<f32>(
        0.5 + 0.5 * cos(phase),
        0.5 + 0.5 * cos(phase - 2.094),
        0.5 + 0.5 * cos(phase + 2.094)
    );
}

fn palette_rainbow(t: f32) -> vec3<f32> {
    // Match 2D default (cosine-based phase map)
    return colormap_phase(t);
}

fn sample_palette(t: f32, palette: i32) -> vec3<f32> {
    let tt = clamp(t, 0.0, 1.0);
    switch palette {
        case 1: { return colormap3d_viridis(tt); }
        case 2: { return colormap3d_plasma(tt); }
        case 3: { return colormap3d_inferno(tt); }
        case 4: { return colormap3d_twilight(tt); }
        case 5: { return vec3<f32>(tt, tt, tt); }
        default: { return palette_rainbow(tt); }
    }
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Re-sample theta/order in fragment so colors match 2D path exactly
    var uv = clamp(input.texcoord, vec2<f32>(0.0), vec2<f32>(0.9999));
    let cols = i32(params.cols);
    let rows = i32(params.rows);
    let total_layers = max(1u, u32(params.layer_count));
    let active_layer = min(u32(render_layer.x + 0.5), total_layers - 1u);
    let layer_stride = u32(cols) * u32(rows);
    let c = clamp(i32(uv.x * params.cols), 0, cols - 1);
    let r = clamp(i32(uv.y * params.rows), 0, rows - 1);

    let theta = textureLoad(theta_tex, vec2<i32>(c, r), i32(active_layer), 0).r;
    let order_idx = layer_stride * active_layer + u32(r) * u32(cols) + u32(c);
    let order_val = order[order_idx];

    // Gradient (finite diff) to mirror 2D shader
    let right = textureLoad(theta_tex, vec2<i32>((c + 1) % cols, r), i32(active_layer), 0).r;
    let left  = textureLoad(theta_tex, vec2<i32>((c + cols - 1) % cols, r), i32(active_layer), 0).r;
    let up    = textureLoad(theta_tex, vec2<i32>(c, (r + 1) % rows), i32(active_layer), 0).r;
    let down  = textureLoad(theta_tex, vec2<i32>(c, (r + rows - 1) % rows), i32(active_layer), 0).r;
    var dx = right - left;
    var dy = up - down;
    if (dx > 3.14159) { dx -= 6.28318; }
    if (dx < -3.14159) { dx += 6.28318; }
    if (dy > 3.14159) { dy -= 6.28318; }
    if (dy < -3.14159) { dy += 6.28318; }
    let gradient = sqrt(dx * dx + dy * dy) * 0.5;

    let height = sin(theta) * 2.0;
    let t_phase = clamp((height / 2.0 + 1.0) * 0.5, 0.0, 1.0);

    let layer_choice = i32(params.colormap);
    let palette = i32(params.colormap_palette);
    var color: vec3<f32>;

    if (layer_choice == 0) {
        color = sample_palette(t_phase, palette);
    } else if (layer_choice == 1) {
        let vel = clamp(gradient * 2.0, 0.0, 1.0);
        color = sample_palette(vel, palette);
    } else if (layer_choice == 2) {
        let curv = clamp(gradient, 0.0, 1.0);
        color = sample_palette(curv, palette);
    } else if (layer_choice == 3) {
        color = sample_palette(order_val, palette);
    } else if (layer_choice == 4) {
        let chirality = clamp((gradient - 0.5) * 2.0, -1.0, 1.0);
        let val = 0.5 + 0.5 * chirality;
        color = sample_palette(val, palette);
    } else if (layer_choice == 5) {
        let brightness = 0.3 + 0.7 * clamp(gradient * 3.0, 0.0, 1.0);
        color = sample_palette(t_phase, palette) * brightness;
    } else if (layer_choice == 6) {
        let texColor = textureSample(externalTexture, textureSampler, vec2<f32>(uv.x, 1.0 - uv.y)).rgb;
        let phaseMod = 0.5 + 0.5 * sin(theta);
        color = texColor * (0.7 + 0.3 * phaseMod);
    } else {
        color = sample_palette(t_phase, palette);
    }

    if (params.show_order > 0.5) {
        let brightness = 0.4 + 0.6 * order_val;
        color = color * brightness;
    }

    var layer_alpha = render_layer.y;
    if (layer_alpha <= 0.0) {
        layer_alpha = 1.0;
    }
    return vec4<f32>(color, layer_alpha);
}
`;

// Global order reduction shader - computes sum of exp(i*theta) for all oscillators
// Uses atomic integers for final accumulation across workgroups
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

// Convert atomic integer sums back to float
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

// Fast global order parameter reduction using workgroup shared memory
// Stage 1: Computes partial sums using atomic operations on integers
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

// Stage 2: Convert atomic integer sums to normalized float vector
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
    mesh_mode: f32, pad4: f32, pad5: f32, pad6: f32,
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

// ============================================================================
// LOCAL ORDER STATISTICS REDUCTION
// Computes mean local R, fraction synchronized, and gradient magnitude
// This gives a better picture of spatially-organized patterns
// ============================================================================
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

// Normalize local order statistics
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
    stats_out[3] = (sum_r2 / n) - (mean_r * mean_r); // Var(R) = E[R^2] - E[R]^2
    stats_out[4] = n;
    
    // Histogram normalize
    for (var i = 0u; i < 16u; i = i + 1u) {
        let count = f32(atomicLoad(&hist_atomic[i]));
        stats_out[5u + i] = count / n;
    }
}
`;

// ============================================================================
// FAST 2D RENDER SHADER - Full-screen quad with texture sampling
// Much faster than instanced rendering for 2D mode
// ============================================================================
export const RENDER_2D_SHADER = `
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
    mesh_mode: f32, pad4: f32, pad5: f32, pad6: f32,
    topology_mode: f32, topology_max_degree: f32, topology_avg_degree: f32, topology_pad: f32,
    layer_count: f32, pad7: f32, pad8: f32, active_layer: f32,
}

@group(0) @binding(0) var theta_tex: texture_2d_array<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> order: array<f32>;
@group(0) @binding(3) var textureSampler: sampler;
@group(0) @binding(4) var externalTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
    // Full-screen triangle (more efficient than quad - only 3 vertices)
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );
    
    // UV coordinates: (0,0) is top-left, (1,1) is bottom-right
    // Map to match 3D shader orientation
    var uv = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(2.0, 0.0),
        vec2<f32>(0.0, 2.0)
    );
    
    var output: VertexOutput;
    output.position = vec4<f32>(pos[vi], 0.0, 1.0);
    output.uv = uv[vi];
    return output;
}

// ============================================================================
// COLORMAP FUNCTIONS
// ============================================================================

// Bilinear interpolation for smooth theta sampling
fn sample_theta_bilinear(uv: vec2<f32>, cols: f32, rows: f32, layer: u32) -> f32 {
    // Convert UV to floating-point grid coordinates
    let gx = uv.x * cols - 0.5;
    let gy = uv.y * rows - 0.5;
    
    // Get integer coordinates
    let x0 = i32(floor(gx));
    let y0 = i32(floor(gy));
    let x1 = x0 + 1;
    let y1 = y0 + 1;
    
    // Fractional parts for interpolation
    let fx = fract(gx);
    let fy = fract(gy);
    
    // Wrap coordinates for periodic boundaries
    let cols_i = i32(cols);
    let rows_i = i32(rows);
    let x0w = (x0 + cols_i) % cols_i;
    let x1w = x1 % cols_i;
    let y0w = (y0 + rows_i) % rows_i;
    let y1w = y1 % rows_i;
    
    // Sample 4 corners
    let t00 = textureLoad(theta_tex, vec2<i32>(x0w, y0w), i32(layer), 0).r;
    let t10 = textureLoad(theta_tex, vec2<i32>(x1w, y0w), i32(layer), 0).r;
    let t01 = textureLoad(theta_tex, vec2<i32>(x0w, y1w), i32(layer), 0).r;
    let t11 = textureLoad(theta_tex, vec2<i32>(x1w, y1w), i32(layer), 0).r;
    
    // Handle phase wrapping for interpolation
    // (phase can wrap from 2π to 0, need to interpolate correctly)
    var d10 = t10 - t00;
    var d01 = t01 - t00;
    var d11 = t11 - t00;
    
    // Wrap differences to [-π, π]
    if (d10 > 3.14159) { d10 -= 6.28318; }
    if (d10 < -3.14159) { d10 += 6.28318; }
    if (d01 > 3.14159) { d01 -= 6.28318; }
    if (d01 < -3.14159) { d01 += 6.28318; }
    if (d11 > 3.14159) { d11 -= 6.28318; }
    if (d11 < -3.14159) { d11 += 6.28318; }
    
    // Bilinear interpolation of differences
    let interp_diff = d10 * fx * (1.0 - fy) + 
                      d01 * (1.0 - fx) * fy + 
                      d11 * fx * fy;
    
    // Add back the base value
    var result = t00 + interp_diff;
    
    // Wrap to [0, 2π]
    if (result < 0.0) { result += 6.28318; }
    if (result >= 6.28318) { result -= 6.28318; }
    
    return result;
}

// Cubic interpolation helper (Catmull-Rom)
fn cubic_weight(t: f32) -> vec4<f32> {
    let t2 = t * t;
    let t3 = t2 * t;
    return vec4<f32>(
        -0.5 * t3 + t2 - 0.5 * t,
        1.5 * t3 - 2.5 * t2 + 1.0,
        -1.5 * t3 + 2.0 * t2 + 0.5 * t,
        0.5 * t3 - 0.5 * t2
    );
}

// Wrap phase difference to [-π, π]
fn wrap_diff(d: f32) -> f32 {
    var result = d;
    if (result > 3.14159) { result -= 6.28318; }
    if (result < -3.14159) { result += 6.28318; }
    return result;
}

// Sample theta with wrapping
fn sample_theta_wrapped(x: i32, y: i32, cols: i32, rows: i32, layer: u32) -> f32 {
    let xw = ((x % cols) + cols) % cols;
    let yw = ((y % rows) + rows) % rows;
    return textureLoad(theta_tex, vec2<i32>(xw, yw), i32(layer), 0).r;
}

// Bicubic interpolation for smoother theta sampling
fn sample_theta_bicubic(uv: vec2<f32>, cols: f32, rows: f32, layer: u32) -> f32 {
    let gx = uv.x * cols - 0.5;
    let gy = uv.y * rows - 0.5;
    
    let x0 = i32(floor(gx));
    let y0 = i32(floor(gy));
    let fx = fract(gx);
    let fy = fract(gy);
    
    let cols_i = i32(cols);
    let rows_i = i32(rows);
    
    // Get cubic weights
    let wx = cubic_weight(fx);
    let wy = cubic_weight(fy);
    
    // Sample 4x4 grid and use base point as reference for phase-aware interpolation
    let base = sample_theta_wrapped(x0, y0, cols_i, rows_i, layer);
    
    var sum = 0.0;
    for (var dy = -1; dy <= 2; dy++) {
        let y = y0 + dy;
        let wY = select(select(select(wy.w, wy.z, dy == 1), wy.y, dy == 0), wy.x, dy == -1);
        
        for (var dx = -1; dx <= 2; dx++) {
            let x = x0 + dx;
            let wX = select(select(select(wx.w, wx.z, dx == 1), wx.y, dx == 0), wx.x, dx == -1);
            
            let t = sample_theta_wrapped(x, y, cols_i, rows_i, layer);
            let d = wrap_diff(t - base);
            sum += wX * wY * d;
        }
    }
    
    var result = base + sum;
    if (result < 0.0) { result += 6.28318; }
    if (result >= 6.28318) { result -= 6.28318; }
    
    return result;
}

// Gaussian blur sampling (3x3 kernel)
fn sample_theta_gaussian(uv: vec2<f32>, cols: f32, rows: f32, layer: u32) -> f32 {
    let gx = uv.x * cols;
    let gy = uv.y * rows;
    
    let x0 = i32(floor(gx));
    let y0 = i32(floor(gy));
    
    let cols_i = i32(cols);
    let rows_i = i32(rows);
    
    // Gaussian 3x3 kernel weights (normalized, sigma ≈ 0.85)
    let w = array<f32, 9>(
        0.0625, 0.125, 0.0625,
        0.125,  0.25,  0.125,
        0.0625, 0.125, 0.0625
    );
    
    // Use center as reference for phase-aware blurring
    let base = sample_theta_wrapped(x0, y0, cols_i, rows_i, layer);
    
    var sum = 0.0;
    var idx = 0;
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let t = sample_theta_wrapped(x0 + dx, y0 + dy, cols_i, rows_i, layer);
            let d = wrap_diff(t - base);
            sum += w[idx] * d;
            idx++;
        }
    }
    
    var result = base + sum;
    if (result < 0.0) { result += 6.28318; }
    if (result >= 6.28318) { result -= 6.28318; }
    
    return result;
}

// Main sampling function that dispatches based on smoothing mode
// mode 0: nearest, 1: bilinear, 2: bicubic, 3: gaussian
fn sample_theta_smooth(uv: vec2<f32>, cols: f32, rows: f32, mode: f32, layer: u32) -> f32 {
    if (mode < 0.5) {
        // Nearest neighbor
        let gx = i32(uv.x * cols);
        let gy = i32(uv.y * rows);
        return textureLoad(theta_tex, vec2<i32>(gx, gy), i32(layer), 0).r;
    } else if (mode < 1.5) {
        return sample_theta_bilinear(uv, cols, rows, layer);
    } else if (mode < 2.5) {
        return sample_theta_bicubic(uv, cols, rows, layer);
    } else {
        return sample_theta_gaussian(uv, cols, rows, layer);
    }
}

fn colormap_phase(t: f32) -> vec3<f32> {
    // Classic rainbow phase colormap
    let phase = t * 6.28318530718;
    return vec3<f32>(
        0.5 + 0.5 * cos(phase),
        0.5 + 0.5 * cos(phase - 2.094),
        0.5 + 0.5 * cos(phase + 2.094)
    );
}

fn colormap_viridis(t: f32) -> vec3<f32> {
    // Perceptually uniform colormap
    let c0 = vec3<f32>(0.267004, 0.004874, 0.329415);
    let c1 = vec3<f32>(0.282327, 0.140926, 0.457517);
    let c2 = vec3<f32>(0.253935, 0.265254, 0.529983);
    let c3 = vec3<f32>(0.206756, 0.371758, 0.553117);
    let c4 = vec3<f32>(0.163625, 0.471133, 0.558148);
    let c5 = vec3<f32>(0.127568, 0.566949, 0.550556);
    let c6 = vec3<f32>(0.134692, 0.658636, 0.517649);
    let c7 = vec3<f32>(0.266941, 0.748751, 0.440573);
    let c8 = vec3<f32>(0.477504, 0.821444, 0.318195);
    let c9 = vec3<f32>(0.741388, 0.873449, 0.149561);
    let c10 = vec3<f32>(0.993248, 0.906157, 0.143936);
    
    let idx = clamp(t, 0.0, 1.0) * 10.0;
    let i = i32(floor(idx));
    let f = fract(idx);
    
    var colors = array<vec3<f32>, 11>(c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10);
    if (i >= 10) { return c10; }
    return mix(colors[i], colors[i + 1], f);
}

fn colormap_plasma(t: f32) -> vec3<f32> {
    // Plasma colormap - hot magenta to yellow
    let c0 = vec3<f32>(0.050383, 0.029803, 0.527975);
    let c1 = vec3<f32>(0.254627, 0.013882, 0.615419);
    let c2 = vec3<f32>(0.417642, 0.000564, 0.658390);
    let c3 = vec3<f32>(0.562738, 0.051545, 0.641509);
    let c4 = vec3<f32>(0.692840, 0.165141, 0.564522);
    let c5 = vec3<f32>(0.798216, 0.280197, 0.469538);
    let c6 = vec3<f32>(0.881443, 0.392529, 0.383229);
    let c7 = vec3<f32>(0.949217, 0.517763, 0.295662);
    let c8 = vec3<f32>(0.988648, 0.652325, 0.211364);
    let c9 = vec3<f32>(0.988648, 0.809579, 0.145357);
    let c10 = vec3<f32>(0.940015, 0.975158, 0.131326);
    
    let idx = clamp(t, 0.0, 1.0) * 10.0;
    let i = i32(floor(idx));
    let f = fract(idx);
    
    var colors = array<vec3<f32>, 11>(c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10);
    if (i >= 10) { return c10; }
    return mix(colors[i], colors[i + 1], f);
}

fn colormap_twilight(t: f32) -> vec3<f32> {
    // Cyclic twilight colormap - perfect for periodic phase data
    // Goes purple -> pink -> white -> teal -> purple
    let c0 = vec3<f32>(0.886, 0.851, 0.906);  // Light lavender
    let c1 = vec3<f32>(0.816, 0.576, 0.678);  // Pink
    let c2 = vec3<f32>(0.659, 0.318, 0.459);  // Magenta
    let c3 = vec3<f32>(0.420, 0.180, 0.357);  // Dark purple
    let c4 = vec3<f32>(0.184, 0.165, 0.329);  // Deep blue
    let c5 = vec3<f32>(0.184, 0.165, 0.329);  // Deep blue (center)
    let c6 = vec3<f32>(0.125, 0.278, 0.353);  // Dark teal
    let c7 = vec3<f32>(0.192, 0.431, 0.427);  // Teal
    let c8 = vec3<f32>(0.388, 0.588, 0.529);  // Green-teal
    let c9 = vec3<f32>(0.663, 0.757, 0.690);  // Light sage
    let c10 = vec3<f32>(0.886, 0.851, 0.906); // Back to lavender (cyclic)
    
    let idx = clamp(t, 0.0, 1.0) * 10.0;
    let i = i32(floor(idx));
    let f = fract(idx);
    
    var colors = array<vec3<f32>, 11>(c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10);
    if (i >= 10) { return c10; }
    return mix(colors[i], colors[i + 1], f);
}

fn colormap_inferno(t: f32) -> vec3<f32> {
    // Inferno - black to yellow through red
    let c0 = vec3<f32>(0.001, 0.000, 0.014);
    let c1 = vec3<f32>(0.122, 0.047, 0.224);
    let c2 = vec3<f32>(0.281, 0.073, 0.382);
    let c3 = vec3<f32>(0.448, 0.096, 0.397);
    let c4 = vec3<f32>(0.610, 0.134, 0.345);
    let c5 = vec3<f32>(0.761, 0.214, 0.235);
    let c6 = vec3<f32>(0.876, 0.337, 0.123);
    let c7 = vec3<f32>(0.949, 0.493, 0.020);
    let c8 = vec3<f32>(0.976, 0.667, 0.117);
    let c9 = vec3<f32>(0.964, 0.843, 0.354);
    let c10 = vec3<f32>(0.988, 0.998, 0.645);
    
    let idx = clamp(t, 0.0, 1.0) * 10.0;
    let i = i32(floor(idx));
    let f = fract(idx);
    
    var colors = array<vec3<f32>, 11>(c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10);
    if (i >= 10) { return c10; }
    return mix(colors[i], colors[i + 1], f);
}

fn sample_palette_2d(t: f32, palette: i32) -> vec3<f32> {
    let tt = clamp(t, 0.0, 1.0);
    switch palette {
        case 1: { return colormap_viridis(tt); }
        case 2: { return colormap_plasma(tt); }
        case 3: { return colormap_inferno(tt); }
        case 4: { return colormap_twilight(tt); }
        case 5: { return vec3<f32>(tt, tt, tt); }
        default: { return colormap_phase(tt); }
    }
}

// ============================================================================
// FRAGMENT SHADER
// ============================================================================

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let zoom = select(1.0, params.zoom, params.zoom > 0.0);
    
    // Apply zoom and pan
    var uv = input.uv;
    uv = (uv - 0.5) / zoom + vec2<f32>(params.pan_x, params.pan_y) + 0.5;
    
    // Sample external texture BEFORE any early returns to satisfy WGSL uniform control flow
    // requirement for textureSample. We clamp UVs and sample unconditionally.
    let tex_uv_clamped = clamp(vec2<f32>(uv.x, 1.0 - uv.y), vec2<f32>(0.0), vec2<f32>(1.0));
    let presampled_tex_color = textureSample(externalTexture, textureSampler, tex_uv_clamped).rgb;
    
    // Check bounds (for when zoomed/panned outside grid)
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        return vec4<f32>(0.08, 0.08, 0.1, 1.0);
    }
    
    // Convert UV to grid coordinates (integer for discrete lookups)
    let cols = i32(params.cols);
    let rows = i32(params.rows);
    let total_layers = max(1u, u32(params.layer_count));
    let active_layer = min(u32(params.active_layer + 0.5), total_layers - 1u);
    let layer_stride = u32(cols) * u32(rows);
    let c = clamp(i32(uv.x * params.cols), 0, cols - 1);
    let r = clamp(i32(uv.y * params.rows), 0, rows - 1);
    
    // Load theta value - use smoothing based on mode
    // smoothingMode: 0=nearest, 1=bilinear, 2=bicubic, 3=gaussian
    var theta: f32;
    if (params.smoothing_enabled > 0.5) {
        theta = sample_theta_smooth(uv, params.cols, params.rows, params.smoothing_mode, active_layer);
    } else {
        theta = textureLoad(theta_tex, vec2<i32>(c, r), i32(active_layer), 0).r;
    }
    
    // Load order parameter (no interpolation needed - it's already smooth)
    let idx = layer_stride * active_layer + u32(r) * u32(cols) + u32(c);
    let order_val = order[idx];
    
    // Compute gradient for velocity/curvature modes (use discrete samples for accuracy)
    let right = textureLoad(theta_tex, vec2<i32>((c + 1) % cols, r), i32(active_layer), 0).r;
    let left = textureLoad(theta_tex, vec2<i32>((c + cols - 1) % cols, r), i32(active_layer), 0).r;
    let up = textureLoad(theta_tex, vec2<i32>(c, (r + 1) % rows), i32(active_layer), 0).r;
    let down = textureLoad(theta_tex, vec2<i32>(c, (r + rows - 1) % rows), i32(active_layer), 0).r;
    
    var dx = right - left;
    var dy = up - down;
    if (dx > 3.14159) { dx -= 6.28318; }
    if (dx < -3.14159) { dx += 6.28318; }
    if (dy > 3.14159) { dy -= 6.28318; }
    if (dy < -3.14159) { dy += 6.28318; }
    let gradient = sqrt(dx * dx + dy * dy) * 0.5;
    
    // Compute chirality (curl) for spiral detection
    let tr = textureLoad(theta_tex, vec2<i32>((c + 1) % cols, (r + 1) % rows), i32(active_layer), 0).r;
    let tl = textureLoad(theta_tex, vec2<i32>((c + cols - 1) % cols, (r + 1) % rows), i32(active_layer), 0).r;
    let br = textureLoad(theta_tex, vec2<i32>((c + 1) % cols, (r + rows - 1) % rows), i32(active_layer), 0).r;
    let bl = textureLoad(theta_tex, vec2<i32>((c + cols - 1) % cols, (r + rows - 1) % rows), i32(active_layer), 0).r;
    
    var curl = (tr - tl - br + bl) * 0.25;
    if (curl > 3.14159) { curl -= 6.28318; }
    if (curl < -3.14159) { curl += 6.28318; }
    // Negate curl to match 3D coordinate system (UV Y is inverted)
    curl = -curl;
    
    // Use sin(theta) mapping to match 3D shader's height-based coloring
    let height = sin(theta) * 2.0;
    let t_height = clamp((height / 2.0 + 1.0) * 0.5, 0.0, 1.0);
    
    let layer_choice = i32(params.colormap);
    let palette = i32(params.colormap_palette);
    var col3: vec3<f32>;

    if (layer_choice == 0) {
        // Phase
        col3 = sample_palette_2d(t_height, palette);
    } else if (layer_choice == 1) {
        // Velocity (gradient magnitude)
        let vel = clamp(gradient * 2.0, 0.0, 1.0);
        col3 = sample_palette_2d(vel, palette);
    } else if (layer_choice == 2) {
        // Curvature proxy
        let curv = clamp(gradient, 0.0, 1.0);
        col3 = sample_palette_2d(curv, palette);
    } else if (layer_choice == 3) {
        // Order parameter
        col3 = sample_palette_2d(order_val, palette);
    } else if (layer_choice == 4) {
        // Chirality / curl
        let chi = clamp(curl * 5.0, -1.0, 1.0);
        let val = 0.5 + 0.5 * chi;
        col3 = sample_palette_2d(val, palette);
    } else if (layer_choice == 5) {
        // Phase + gradient brightness
        let brightness = 0.3 + 0.7 * clamp(gradient * 3.0, 0.0, 1.0);
        col3 = sample_palette_2d(t_height, palette) * brightness;
    } else if (layer_choice == 6) {
        // Image texture modulated by phase (matches 3D)
        let texColor = presampled_tex_color;
        let phaseMod = 0.5 + 0.5 * sin(theta);
        col3 = texColor * (0.7 + 0.3 * phaseMod);
    } else {
        col3 = sample_palette_2d(t_height, palette);
    }
    
    // Apply order overlay if enabled
    if (params.show_order > 0.5) {
        let brightness = 0.3 + 0.7 * order_val;
        col3 = col3 * brightness;
    }
    
    return vec4<f32>(col3, 1.0);
}
`;
