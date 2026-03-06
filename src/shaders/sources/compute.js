/**
 * Compute shader source exports.
 * Auto-partitioned from legacy monolithic shaders.js for maintainability.
 */

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
    mesh_mode: f32, manifold_mode: f32, pad5: f32, pad6: f32,
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
    // Lenia growth function parameters (indices 52-54)
    growth_mu: f32,
    growth_sigma: f32,
    growth_mode: f32,
    _pad3: f32,
}

struct GaugeParams {
    enabled: f32,
    mode_dynamic: f32,
    charge: f32,
    matter_coupling: f32,
    stiffness: f32,
    damping: f32,
    noise: f32,
    dt_scale: f32,
    viz_flux_gain: f32,
    viz_cov_grad_gain: f32,
    viz_auto_normalize: f32,
    viz_signed_flux: f32,
}

struct InteractionParams {
    phase_lag_enabled: f32,
    phase_lag_eta: f32,
    prismatic_style_enabled: f32,
    prismatic_dynamics_enabled: f32,
    interaction_force_enabled: f32,
    mouse_u: f32,
    mouse_v: f32,
    mouse_force_active: f32,
    mouse_force_strength: f32,
    mouse_force_radius: f32,
    force_target_phase: f32,
    mouse_falloff: f32,
    prismatic_k: f32,
    prismatic_friction: f32,
    prismatic_energy_decay: f32,
    prismatic_energy_mix: f32,
    prismatic_cell_px: f32,
    prismatic_trail_fade: f32,
    prismatic_glow_scale: f32,
    prismatic_core_threshold: f32,
    prismatic_core_scale: f32,
    prismatic_style_blend: f32,
    prismatic_style_base_mode: f32,
    audio_coherence_lock: f32,
    prismatic_drag_radius_px: f32,
    prismatic_drag_peak_force: f32,
    prismatic_target_phase: f32,
    pad0: f32,
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
@group(0) @binding(13) var gauge_x: texture_2d_array<f32>;
@group(0) @binding(14) var gauge_y: texture_2d_array<f32>;
@group(0) @binding(15) var<storage, read> graph_gauge: array<f32>;
@group(0) @binding(16) var<uniform> gauge_params: GaugeParams;
@group(0) @binding(17) var<uniform> interaction_params: InteractionParams;
@group(0) @binding(18) var prismatic_state_in: texture_2d_array<f32>;
@group(0) @binding(19) var prismatic_state_out: texture_storage_2d_array<rg32float, write>;

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

fn loadGaugeXGlobal(col: i32, row: i32, layer: i32, cols: i32, rows: i32) -> f32 {
    var c = col % cols;
    var r = row % rows;
    if (c < 0) { c = c + cols; }
    if (r < 0) { r = r + rows; }
    return textureLoad(gauge_x, vec2<i32>(c, r), layer, 0).r;
}

fn loadGaugeYGlobal(col: i32, row: i32, layer: i32, cols: i32, rows: i32) -> f32 {
    var c = col % cols;
    var r = row % rows;
    if (c < 0) { c = c + cols; }
    if (r < 0) { r = r + rows; }
    return textureLoad(gauge_y, vec2<i32>(c, r), layer, 0).r;
}

fn loadPrismaticState(col: i32, row: i32, layer: i32, cols: i32, rows: i32) -> vec2<f32> {
    var c = col % cols;
    var r = row % rows;
    if (c < 0) { c = c + cols; }
    if (r < 0) { r = r + rows; }
    return textureLoad(prismatic_state_in, vec2<i32>(c, r), layer, 0).rg;
}

fn gaugePath(col: i32, row: i32, dc: i32, dr: i32, layer: i32, cols: i32, rows: i32) -> f32 {
    if (gauge_params.enabled < 0.5) { return 0.0; }
    var sum = 0.0;
    var x = col;
    var y = row;
    if (dc > 0) {
        for (var sx = 0; sx < dc; sx = sx + 1) {
            sum = sum + loadGaugeXGlobal(x, y, layer, cols, rows);
            x = x + 1;
        }
    } else if (dc < 0) {
        for (var sx = 0; sx < -dc; sx = sx + 1) {
            x = x - 1;
            sum = sum - loadGaugeXGlobal(x, y, layer, cols, rows);
        }
    }
    if (dr > 0) {
        for (var sy = 0; sy < dr; sy = sy + 1) {
            sum = sum + loadGaugeYGlobal(x, y, layer, cols, rows);
            y = y + 1;
        }
    } else if (dr < 0) {
        for (var sy = 0; sy < -dr; sy = sy + 1) {
            y = y - 1;
            sum = sum - loadGaugeYGlobal(x, y, layer, cols, rows);
        }
    }
    return sum;
}

fn phaseLag() -> f32 {
    return select(0.0, interaction_params.phase_lag_eta, interaction_params.phase_lag_enabled > 0.5);
}

fn covSin(theta_j: f32, theta_i: f32, link_phase: f32) -> f32 {
    let lag = phaseLag();
    if (gauge_params.enabled < 0.5) {
        return sin(theta_j - theta_i - lag);
    }
    return sin(theta_j - theta_i - gauge_params.charge * link_phase - lag);
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
        let a_ij = select(0.0, graph_gauge[base + j], gauge_params.enabled > 0.5);
        sum = sum + w * covSin(theta_j, t, a_ij);
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
        let a_ij = select(0.0, graph_gauge[base + j], gauge_params.enabled > 0.5);
        sum = sum + w * covSin(theta_j, t, a_ij);
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
        let a_ij = select(0.0, graph_gauge[base + j], gauge_params.enabled > 0.5);
        let d = theta_j - t - gauge_params.charge * a_ij - phaseLag();
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
fn spatialCoupling(local_c: i32, local_r: i32, global_c: i32, global_r: i32, layer: i32, cols: i32, rows: i32, rng: i32, t: f32) -> vec2<f32> {
    var sum = 0.0; var cnt = 0.0;
    for (var dr = -rng; dr <= rng; dr = dr + 1) {
        for (var dc = -rng; dc <= rng; dc = dc + 1) {
            if (dr == 0 && dc == 0) { continue; }
            let theta_j = loadThetaShared(local_c + dc, local_r + dr);
            let a_ij = gaugePath(global_c, global_r, dc, dr, layer, cols, rows);
            sum = sum + covSin(theta_j, t, a_ij);
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
            sum = sum + w * sin(theta_j - t - phaseLag());
            wtotal = wtotal + abs(w);
        }
    }
    if (wtotal < 0.0001) { return 0.0; }
    return sum / wtotal;
}

fn rule_classic(local_c: i32, local_r: i32, global_c: i32, global_r: i32, layer: i32, rng: i32, t: f32, i: u32, cols: u32, rows: u32, lp: LayerParams) -> f32 {
    var sum = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field: Z = (cos_avg, sin_avg)
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        let tp = t + phaseLag();
        sum = Z_sin * cos(tp) - Z_cos * sin(tp);
        cnt = 1.0;
    } else if (params.topology_mode > 0.5) {
        let res = graphCoupling(i, t, cols, rows);
        sum = res.x;
        cnt = res.y;
    } else {
        let res = spatialCoupling(local_c, local_r, global_c, global_r, layer, i32(cols), i32(rows), rng, t);
        sum = res.x;
        cnt = res.y;
    }
    return lp.K0 * (sum / max(cnt, 1e-5));
}

fn rule_coherence(local_c: i32, local_r: i32, global_c: i32, global_r: i32, layer: i32, rng: i32, t: f32, i: u32, cols: u32, rows: u32, ri: f32, lp: LayerParams) -> f32 {
    var sum = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        let tp = t + phaseLag();
        sum = Z_sin * cos(tp) - Z_cos * sin(tp);
        cnt = 1.0;
    } else if (params.topology_mode > 0.5) {
        let res = graphCoupling(i, t, cols, rows);
        sum = res.x;
        cnt = res.y;
    } else {
        let res = spatialCoupling(local_c, local_r, global_c, global_r, layer, i32(cols), i32(rows), rng, t);
        sum = res.x;
        cnt = res.y;
    }
    let Ki = lp.K0 * (1.0 - 0.8 * ri);
    return Ki * (sum / max(cnt, 1e-5));
}

fn rule_curvature(local_c: i32, local_r: i32, global_c: i32, global_r: i32, layer: i32, rng: i32, t: f32, i: u32, cols: u32, rows: u32, lp: LayerParams) -> f32 {
    var sum = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        let tp = t + phaseLag();
        sum = Z_sin * cos(tp) - Z_cos * sin(tp);
        cnt = 1.0;
    } else if (params.topology_mode > 0.5) {
        let res = graphCoupling(i, t, cols, rows);
        sum = res.x;
        cnt = res.y;
    } else {
        let res = spatialCoupling(local_c, local_r, global_c, global_r, layer, i32(cols), i32(rows), rng, t);
        sum = res.x;
        cnt = res.y;
    }
    let lap = sum / max(cnt, 1e-5);
    return lp.K0 * min(1.0, abs(lap) * 2.0) * lap;
}

fn rule_harmonics(local_c: i32, local_r: i32, global_c: i32, global_r: i32, layer: i32, rng: i32, t: f32, i: u32, cols: u32, rows: u32, lp: LayerParams) -> f32 {
    var s1 = 0.0; var s2 = 0.0; var s3 = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field for fundamental
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        let tp = t + phaseLag();
        s1 = Z_sin * cos(tp) - Z_cos * sin(tp);
        
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
                let a_ij = gaugePath(global_c, global_r, dc, dr, layer, i32(cols), i32(rows));
                let d = theta_j - t - gauge_params.charge * a_ij - phaseLag();
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
                let a_ij = gaugePath(global_c, global_r, dc, dr, layer, cols, rows);
                sum = sum + w * covSin(theta_j, t, a_ij);
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
                let a_ij = gaugePath(global_c, global_r, dc, dr, layer, cols, rows);
                sum = sum + w * covSin(theta_j, t, a_ij);
                wtotal = wtotal + abs(w);
            }
        }
    }
    
    if (wtotal > 0.0) {
        return lp.K0 * (sum / wtotal);
    }
    return 0.0;
}

fn rule_delay(local_c: i32, local_r: i32, global_c: u32, global_r: u32, layer: i32, cols: u32, rows: u32, rng: i32, t: f32, i: u32, lp: LayerParams) -> f32 {
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
            let a_ij = gaugePath(i32(global_c), i32(global_r), dc, dr, layer, i32(cols), i32(rows));
            sum = sum + covSin(theta_delayed[j], t, a_ij);
            cnt = cnt + 1.0;
        }
    }
    return lp.K0 * (sum / max(cnt, 1e-5));
}

// Lenia growth functions
fn growth_gaussian(u: f32, mu: f32, sigma: f32) -> f32 {
    let d = u - mu;
    return 2.0 * exp(-(d * d) / (2.0 * sigma * sigma)) - 1.0;
}

fn growth_step(u: f32, mu: f32, sigma: f32) -> f32 {
    let d = abs(u - mu);
    return select(-1.0, 1.0, d < sigma);
}

fn growth_double(u: f32, mu: f32, sigma: f32) -> f32 {
    // Double-Gaussian: excitation at mu, inhibition at 2*mu
    let d1 = u - mu;
    let d2 = u - 2.0 * mu;
    let g1 = exp(-(d1 * d1) / (2.0 * sigma * sigma));
    let g2 = exp(-(d2 * d2) / (2.0 * sigma * sigma));
    return 2.0 * (g1 - 0.5 * g2) - 1.0;
}

fn growth_select(u: f32, mu: f32, sigma: f32, mode: i32) -> f32 {
    if (mode == 1) { return growth_step(u, mu, sigma); }
    if (mode == 2) { return growth_double(u, mu, sigma); }
    return growth_gaussian(u, mu, sigma);
}

// Rule 6: Lenia-style growth
// Convolve raw field values first, then apply growth function to the aggregate
fn rule_lenia(local_c: i32, local_r: i32, global_c: i32, global_r: i32, cols: i32, rows: i32, layer: i32, t: f32, i: u32, lp: LayerParams) -> f32 {
    var sum = 0.0; var wtotal = 0.0;

    let rng_ext = i32(lp.sigma2 * 3.0);
    let mu = lp.growth_mu;
    let sigma_g = lp.growth_sigma;
    let gmode = i32(lp.growth_mode);

    // Convolve raw theta values (not phase differences) with kernel
    if (rng_ext <= i32(HALO)) {
        for (var dr = -rng_ext; dr <= rng_ext; dr = dr + 1) {
            for (var dc = -rng_ext; dc <= rng_ext; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                let theta_j = loadThetaShared(local_c + dc, local_r + dr);
                let w = mexhat_weight(f32(dc), f32(dr), lp);
                // Use raw theta value (normalized to 0-1 range)
                sum = sum + w * (theta_j / (2.0 * 3.14159265));
                wtotal = wtotal + abs(w);
            }
        }
    } else {
        for (var dr = -rng_ext; dr <= rng_ext; dr = dr + 1) {
            for (var dc = -rng_ext; dc <= rng_ext; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                let theta_j = loadThetaGlobal(global_c + dc, global_r + dr, layer, cols, rows);
                let w = mexhat_weight(f32(dc), f32(dr), lp);
                sum = sum + w * (theta_j / (2.0 * 3.14159265));
                wtotal = wtotal + abs(w);
            }
        }
    }

    // Normalize convolution result
    var u = 0.0;
    if (wtotal > 0.0) {
        u = sum / wtotal;
    }

    // Apply growth function to aggregate
    let g = growth_select(u, mu, sigma_g, gmode);

    return lp.K0 * g;
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
    let pr_state = loadPrismaticState(i32(global_c), i32(global_r), i32(layer), i32(cols), i32(rows));
    var vel = pr_state.x;
    var energy = max(0.0, pr_state.y);
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
    if (mode == 0) { dtheta = rule_classic(local_c, local_r, i32(global_c), i32(global_r), i32(layer), rng, t, i, cols, rows, lp); }
    else if (mode == 1) { dtheta = rule_coherence(local_c, local_r, i32(global_c), i32(global_r), i32(layer), rng, t, i, cols, rows, ri, lp); }
    else if (mode == 2) { dtheta = rule_curvature(local_c, local_r, i32(global_c), i32(global_r), i32(layer), rng, t, i, cols, rows, lp); }
    else if (mode == 3) { dtheta = rule_harmonics(local_c, local_r, i32(global_c), i32(global_r), i32(layer), rng, t, i, cols, rows, lp); }
    else if (mode == 4) { dtheta = rule_kernel(local_c, local_r, i32(global_c), i32(global_r), i32(cols), i32(rows), i32(layer), t, i, lp); }
    else if (mode == 5) { dtheta = rule_delay(local_c, local_r, global_c, global_r, i32(layer), cols, rows, rng, t, i, lp); }
    else if (mode == 6) { dtheta = rule_lenia(local_c, local_r, i32(global_c), i32(global_r), i32(cols), i32(rows), i32(layer), t, i, lp); }

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
            inter_sum = inter_sum + lp.layer_coupling_up * sin(t_up - t - phaseLag());
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
            inter_sum = inter_sum + lp.layer_coupling_down * sin(t_down - t - phaseLag());
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

    var mouse_drive = 0.0;
    if (interaction_params.interaction_force_enabled > 0.5
        && interaction_params.mouse_force_active > 0.5
        && params.topology_mode < 0.5) {
        let u = (f32(global_c) + 0.5) / params.cols;
        let v = (f32(global_r) + 0.5) / params.rows;
        var du = abs(u - interaction_params.mouse_u);
        var dv = abs(v - interaction_params.mouse_v);
        du = min(du, 1.0 - du);
        dv = min(dv, 1.0 - dv);
        let dist = sqrt(du * du + dv * dv);
        let radius = max(0.001, interaction_params.mouse_force_radius);
        if (dist < radius) {
            let shape = clamp(1.0 - dist / radius, 0.0, 1.0);
            let shaped = pow(shape, max(0.2, interaction_params.mouse_falloff));
            mouse_drive = interaction_params.mouse_force_strength * shaped * sin(interaction_params.force_target_phase - t);
        }
    }

    let prismatic_active = interaction_params.prismatic_dynamics_enabled > 0.5
        && params.manifold_mode < 0.5
        && params.topology_mode < 0.5;

    var newTheta = t;
    if (prismatic_active) {
        let theta_r = loadThetaShared(local_c + 1, local_r);
        let theta_l = loadThetaShared(local_c - 1, local_r);
        let theta_u = loadThetaShared(local_c, local_r + 1);
        let theta_d = loadThetaShared(local_c, local_r - 1);
        let a_r = gaugePath(i32(global_c), i32(global_r), 1, 0, i32(layer), i32(cols), i32(rows));
        let a_l = gaugePath(i32(global_c), i32(global_r), -1, 0, i32(layer), i32(cols), i32(rows));
        let a_u = gaugePath(i32(global_c), i32(global_r), 0, 1, i32(layer), i32(cols), i32(rows));
        let a_d = gaugePath(i32(global_c), i32(global_r), 0, -1, i32(layer), i32(cols), i32(rows));
        let force_cardinal =
            covSin(theta_r, t, a_r) +
            covSin(theta_l, t, a_l) +
            covSin(theta_u, t, a_u) +
            covSin(theta_d, t, a_d);
        let force_total = force_cardinal + mouse_drive;
        vel = (vel + interaction_params.prismatic_k * force_total) * interaction_params.prismatic_friction;
        energy = energy * interaction_params.prismatic_energy_decay + abs(vel) * interaction_params.prismatic_energy_mix;
        newTheta = t + omega_eff + vel;
    } else {
        var dyn = omega_eff + dtheta_scaled * orient + inter_sum + dtheta_input + mouse_drive + flow;
        dyn = dyn * (1.0 - lp.leak);
        newTheta = t + dyn * params.dt;
        // Passive decay when prismatic branch is disabled.
        vel = vel * 0.95;
        energy = energy * 0.98;
    }

    let TWO_PI = 6.28318530718;
    if (newTheta < 0.0) { newTheta = newTheta + TWO_PI; }
    if (newTheta > TWO_PI) { newTheta = newTheta - TWO_PI; }
    textureStore(theta_out, vec2<i32>(i32(global_c), i32(global_r)), i32(layer), vec4<f32>(newTheta, 0.0, 0.0, 1.0));
    textureStore(prismatic_state_out, vec2<i32>(i32(global_c), i32(global_r)), i32(layer), vec4<f32>(vel, max(0.0, energy), 0.0, 1.0));
}
`;

export const S2_COMPUTE_SHADER = `
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
    layer_coupling_up: f32,
    layer_coupling_down: f32,
    growth_mu: f32,
    growth_sigma: f32,
    growth_mode: f32,
    _pad3: f32,
}

@group(0) @binding(0) var s2_in: texture_2d_array<f32>;
@group(0) @binding(1) var<storage, read> omega_vec: array<vec4<f32>>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read_write> order: array<f32>;
@group(0) @binding(4) var s2_out: texture_storage_2d_array<rgba32float, write>;
@group(0) @binding(5) var<storage, read> graph_neighbors: array<u32>;
@group(0) @binding(6) var<storage, read> graph_weights: array<f32>;
@group(0) @binding(7) var<storage, read> graph_counts: array<u32>;
@group(0) @binding(8) var<uniform> layer_params: array<LayerParams, 8>;

const MAX_GRAPH_DEGREE: u32 = 16u;

fn loadVecGlobal(col: i32, row: i32, layer: i32, cols: i32, rows: i32) -> vec3<f32> {
    var c = col % cols;
    var r = row % rows;
    if (c < 0) { c = c + cols; }
    if (r < 0) { r = r + rows; }
    return textureLoad(s2_in, vec2<i32>(c, r), layer, 0).xyz;
}

fn loadVecByIndex(idx: u32, cols: u32, rows: u32) -> vec3<f32> {
    let layer_stride = cols * rows;
    let layer = i32(idx / layer_stride);
    let rem = idx - layer_stride * u32(layer);
    let col = i32(rem % cols);
    let row = i32(rem / cols);
    return textureLoad(s2_in, vec2<i32>(col, row), layer, 0).xyz;
}

fn meanGraph(i: u32, cols: u32, rows: u32) -> vec3<f32> {
    let count = min(graph_counts[i], MAX_GRAPH_DEGREE);
    if (count == 0u) { return vec3<f32>(0.0); }
    let base = i * MAX_GRAPH_DEGREE;
    var sum = vec3<f32>(0.0);
    var norm = 0.0;
    for (var j = 0u; j < MAX_GRAPH_DEGREE; j = j + 1u) {
        if (j >= count) { break; }
        let idx = graph_neighbors[base + j];
        let w = abs(graph_weights[base + j]);
        sum = sum + loadVecByIndex(idx, cols, rows) * w;
        norm = norm + max(w, 0.0001);
    }
    return sum / norm;
}

fn meanGrid(global_c: u32, global_r: u32, layer: u32, rng: i32, cols: u32, rows: u32) -> vec3<f32> {
    var sum = vec3<f32>(0.0);
    var cnt = 0.0;
    for (var dr = -rng; dr <= rng; dr = dr + 1) {
        for (var dc = -rng; dc <= rng; dc = dc + 1) {
            if (dr == 0 && dc == 0) { continue; }
            let rr = i32(global_r) + dr;
            let cc = i32(global_c) + dc;
            sum = sum + loadVecGlobal(cc, rr, i32(layer), i32(cols), i32(rows));
            cnt = cnt + 1.0;
        }
    }
    return sum / max(cnt, 1.0);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>,
        @builtin(workgroup_id) wg_id: vec3<u32>) {
    let cols = u32(params.cols);
    let rows = u32(params.rows);
    let layer = wg_id.z;
    if (layer >= u32(params.layer_count)) { return; }
    if (id.x >= cols || id.y >= rows) { return; }

    let layer_stride = cols * rows;
    let i = layer * layer_stride + id.y * cols + id.x;
    let lp = layer_params[min(layer, 7u)];
    let rng = i32(lp.range);

    let x = textureLoad(s2_in, vec2<i32>(i32(id.x), i32(id.y)), i32(layer), 0).xyz;

    var m = vec3<f32>(0.0);
    if (params.topology_mode > 0.5) {
        m = meanGraph(i, cols, rows);
    } else {
        m = meanGrid(id.x, id.y, layer, rng, cols, rows);
    }
    let local_r = length(m);
    order[i] = clamp(local_r, 0.0, 1.0);

    var y = m * lp.K0;

    if (layer > 0u && abs(lp.layer_coupling_up) > 0.0001) {
        let v = loadVecGlobal(i32(id.x), i32(id.y), i32(layer - 1u), i32(cols), i32(rows));
        y = y + v * lp.layer_coupling_up;
    }
    if (layer + 1u < u32(params.layer_count) && abs(lp.layer_coupling_down) > 0.0001) {
        let v = loadVecGlobal(i32(id.x), i32(id.y), i32(layer + 1u), i32(cols), i32(rows));
        y = y + v * lp.layer_coupling_down;
    }

    let omega = omega_vec[i].xyz;
    let cross_term = cross(omega, x);
    y = y + cross_term;

    var dx = y - dot(x, y) * x;
    dx = dx * (1.0 - lp.leak);
    let x_next = x + dx * params.dt;
    let n = length(x_next);
    let x_norm = select(vec3<f32>(1.0, 0.0, 0.0), x_next / n, n > 1e-6);

    textureStore(s2_out, vec2<i32>(i32(id.x), i32(id.y)), i32(layer), vec4<f32>(x_norm, 1.0));
}
`;

export const S3_COMPUTE_SHADER = `
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
    layer_coupling_up: f32,
    layer_coupling_down: f32,
    growth_mu: f32,
    growth_sigma: f32,
    growth_mode: f32,
    _pad3: f32,
}

@group(0) @binding(0) var s3_in: texture_2d_array<f32>;
@group(0) @binding(1) var<storage, read> omega_vec: array<vec4<f32>>;  // (wx, wy, wz, 0) rotation axis
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read_write> order: array<f32>;
@group(0) @binding(4) var s3_out: texture_storage_2d_array<rgba32float, write>;
@group(0) @binding(5) var<storage, read> graph_neighbors: array<u32>;
@group(0) @binding(6) var<storage, read> graph_weights: array<f32>;
@group(0) @binding(7) var<storage, read> graph_counts: array<u32>;
@group(0) @binding(8) var<uniform> layer_params: array<LayerParams, 8>;

const MAX_GRAPH_DEGREE: u32 = 16u;

// Hamilton product: quaternion multiplication
// q = (x, y, z, w) where w is scalar part
fn quat_mult(a: vec4<f32>, b: vec4<f32>) -> vec4<f32> {
    return vec4<f32>(
        a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,  // x
        a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,  // y
        a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,  // z
        a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z   // w
    );
}

// Project vector v onto tangent space of unit quaternion q
// Tangent space is orthogonal to q in R^4
fn tangent_project_s3(q: vec4<f32>, v: vec4<f32>) -> vec4<f32> {
    return v - dot(q, v) * q;
}

fn loadQuatGlobal(col: i32, row: i32, layer: i32, cols: i32, rows: i32) -> vec4<f32> {
    var c = col % cols;
    var r = row % rows;
    if (c < 0) { c = c + cols; }
    if (r < 0) { r = r + rows; }
    return textureLoad(s3_in, vec2<i32>(c, r), layer, 0);
}

fn loadQuatByIndex(idx: u32, cols: u32, rows: u32) -> vec4<f32> {
    let layer_stride = cols * rows;
    let layer = i32(idx / layer_stride);
    let rem = idx - layer_stride * u32(layer);
    let col = i32(rem % cols);
    let row = i32(rem / cols);
    return textureLoad(s3_in, vec2<i32>(col, row), layer, 0);
}

fn meanQuatGraph(i: u32, cols: u32, rows: u32) -> vec4<f32> {
    let count = min(graph_counts[i], MAX_GRAPH_DEGREE);
    if (count == 0u) { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }
    let base = i * MAX_GRAPH_DEGREE;
    var sum = vec4<f32>(0.0);
    var norm = 0.0;
    for (var j = 0u; j < MAX_GRAPH_DEGREE; j = j + 1u) {
        if (j >= count) { break; }
        let idx = graph_neighbors[base + j];
        let w = abs(graph_weights[base + j]);
        sum = sum + loadQuatByIndex(idx, cols, rows) * w;
        norm = norm + max(w, 0.0001);
    }
    return sum / norm;
}

fn meanQuatGrid(global_c: u32, global_r: u32, layer: u32, rng: i32, cols: u32, rows: u32) -> vec4<f32> {
    var sum = vec4<f32>(0.0);
    var cnt = 0.0;
    for (var dr = -rng; dr <= rng; dr = dr + 1) {
        for (var dc = -rng; dc <= rng; dc = dc + 1) {
            if (dr == 0 && dc == 0) { continue; }
            let rr = i32(global_r) + dr;
            let cc = i32(global_c) + dc;
            sum = sum + loadQuatGlobal(cc, rr, i32(layer), i32(cols), i32(rows));
            cnt = cnt + 1.0;
        }
    }
    return sum / max(cnt, 1.0);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>,
        @builtin(workgroup_id) wg_id: vec3<u32>) {
    let cols = u32(params.cols);
    let rows = u32(params.rows);
    let layer = wg_id.z;
    if (layer >= u32(params.layer_count)) { return; }
    if (id.x >= cols || id.y >= rows) { return; }

    let layer_stride = cols * rows;
    let i = layer * layer_stride + id.y * cols + id.x;
    let lp = layer_params[min(layer, 7u)];
    let rng = i32(lp.range);

    // Load current quaternion state (x, y, z, w)
    let q = textureLoad(s3_in, vec2<i32>(i32(id.x), i32(id.y)), i32(layer), 0);

    // Compute mean quaternion of neighbors
    var m: vec4<f32>;
    if (params.topology_mode > 0.5) {
        m = meanQuatGraph(i, cols, rows);
    } else {
        m = meanQuatGrid(id.x, id.y, layer, rng, cols, rows);
    }

    // Local order = magnitude of mean quaternion
    let local_r = length(m);
    order[i] = clamp(local_r, 0.0, 1.0);

    // Coupling term: project mean onto tangent space of q, scale by K
    var y = tangent_project_s3(q, m) * lp.K0;

    // Layer coupling (if enabled)
    if (layer > 0u && abs(lp.layer_coupling_up) > 0.0001) {
        let v = loadQuatGlobal(i32(id.x), i32(id.y), i32(layer - 1u), i32(cols), i32(rows));
        y = y + tangent_project_s3(q, v) * lp.layer_coupling_up;
    }
    if (layer + 1u < u32(params.layer_count) && abs(lp.layer_coupling_down) > 0.0001) {
        let v = loadQuatGlobal(i32(id.x), i32(id.y), i32(layer + 1u), i32(cols), i32(rows));
        y = y + tangent_project_s3(q, v) * lp.layer_coupling_down;
    }

    // Intrinsic rotation: dq/dt = 0.5 * omega_quat * q
    // omega_quat = (wx, wy, wz, 0) is pure imaginary quaternion
    let omega = omega_vec[i];
    let omega_quat = vec4<f32>(omega.xyz, 0.0);
    let dq_intrinsic = quat_mult(omega_quat, q) * 0.5;

    // Total change in quaternion
    var dq = dq_intrinsic + y;
    dq = dq * (1.0 - lp.leak);

    // Euler integration + renormalization to stay on S³
    let q_next = q + dq * params.dt;
    let n = length(q_next);
    let q_norm = select(vec4<f32>(0.0, 0.0, 0.0, 1.0), q_next / n, n > 1e-6);

    textureStore(s3_out, vec2<i32>(i32(id.x), i32(id.y)), i32(layer), q_norm);
}
`;
