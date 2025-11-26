export const COMPUTE_SHADER = `
struct Params {
    dt: f32, K0: f32, range: f32, rule_mode: f32,
    cols: f32, rows: f32, harmonic_a: f32, global_coupling: f32,
    delay_steps: f32, sigma: f32, sigma2: f32, beta: f32,
    show_order: f32, colormap: f32, noise_strength: f32, time: f32,
    harmonic_b: f32, view_mode: f32, kernel_shape: f32, kernel_orientation: f32,
    kernel_aspect: f32, kernel_scale2_weight: f32, kernel_scale3_weight: f32, kernel_asymmetry: f32,
    kernel_rings: f32, ring_width_1: f32, ring_width_2: f32, ring_width_3: f32,
    ring_width_4: f32, ring_width_5: f32, ring_weight_1: f32, ring_weight_2: f32,
    ring_weight_3: f32, ring_weight_4: f32, ring_weight_5: f32, kernel_composition_enabled: f32,
    kernel_secondary: f32, kernel_mix_ratio: f32, kernel_asymmetric_orientation: f32, kernel_spatial_freq_mag: f32,
    kernel_spatial_freq_angle: f32, kernel_gabor_phase: f32, pad1: f32, pad2: f32,
}

// Textures for theta state (better 2D spatial cache locality)
@group(0) @binding(0) var theta_in: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> omega: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read_write> order: array<f32>;
@group(0) @binding(4) var<storage, read> theta_delayed: array<f32>;
@group(0) @binding(5) var<storage, read> global_order: vec2<f32>;
@group(0) @binding(6) var theta_out: texture_storage_2d<r32float, write>;

// ============================================================================
// SHARED MEMORY TILE for fast neighbor access
// Tile size: 16x16 workgroup + 8 pixel border on each side = 32x32
// This covers neighborhood range up to 8
// ============================================================================
const TILE_SIZE: u32 = 16u;
const HALO: u32 = 8u;
const SHARED_SIZE: u32 = 32u; // TILE_SIZE + 2 * HALO

var<workgroup> shared_theta: array<f32, 1024>; // 32 * 32 = 1024

// Helper to load from theta texture with 2D coordinates (for initial tile load)
fn loadThetaGlobal(col: i32, row: i32, cols: i32, rows: i32) -> f32 {
    // Wrap coordinates for periodic boundary
    var c = col % cols;
    var r = row % rows;
    if (c < 0) { c = c + cols; }
    if (r < 0) { r = r + rows; }
    return textureLoad(theta_in, vec2<i32>(c, r), 0).r;
}

// Helper to read from shared memory tile
fn loadThetaShared(local_c: i32, local_r: i32) -> f32 {
    // Offset by HALO since shared memory includes border
    let sc = u32(local_c + i32(HALO));
    let sr = u32(local_r + i32(HALO));
    return shared_theta[sr * SHARED_SIZE + sc];
}

// Cooperative tile loading - each thread loads multiple values to fill shared memory
fn loadTile(
    local_id: vec2<u32>,
    tile_origin: vec2<i32>,
    cols: i32,
    rows: i32
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
                
                shared_theta[shared_y * SHARED_SIZE + shared_x] = loadThetaGlobal(global_x, global_y, cols, rows);
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

fn noise(i: u32) -> f32 {
    let seed = u32(params.time * 1000.0) + i * 12345u;
    return (hash(seed) - 0.5) * params.noise_strength * 2.0;
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
fn localOrderGlobal(i: u32, cols: u32, rows: u32) -> f32 {
    var sx = 0.0; var sy = 0.0; var cnt = 0.0;
    
    for (var j = 0u; j < cols * rows; j = j + 1u) {
        if (j == i) { continue; }
        let jc = i32(j % cols);
        let jr = i32(j / cols);
        let theta_j = loadThetaGlobal(jc, jr, i32(cols), i32(rows));
        sx = sx + cos(theta_j);
        sy = sy + sin(theta_j);
        cnt = cnt + 1.0;
    }
    return sqrt((sx/cnt)*(sx/cnt) + (sy/cnt)*(sy/cnt));
}

// Helper function to compute kernel weight for a specific shape
fn mexhat_weight_for_shape(dx: f32, dy: f32, shape: i32) -> f32 {
    let s1 = params.sigma;
    let s2 = params.sigma2;
    
    var dist_sq = 0.0;
    var base_weight = 0.0;
    
    // Shape 0: Isotropic (circular) - original Mexican-hat
    if (shape == 0) {
        dist_sq = dx * dx + dy * dy;
        let w1 = exp(-dist_sq / (2.0 * s1 * s1));
        let w2 = exp(-dist_sq / (2.0 * s2 * s2));
        base_weight = w1 - params.beta * w2;
    }
    
    // Shape 1: Anisotropic (elliptical) - rotate and scale
    else if (shape == 1) {
        let angle = params.kernel_orientation;
        let aspect = params.kernel_aspect;
        
        // Rotate coordinates
        let cos_a = cos(angle);
        let sin_a = sin(angle);
        let dx_rot = dx * cos_a + dy * sin_a;
        let dy_rot = -dx * sin_a + dy * cos_a;
        
        // Apply anisotropic scaling
        dist_sq = (dx_rot * dx_rot) + (dy_rot * dy_rot) / (aspect * aspect);
        let w1 = exp(-dist_sq / (2.0 * s1 * s1));
        let w2 = exp(-dist_sq / (2.0 * s2 * s2));
        base_weight = w1 - params.beta * w2;
    }
    
    // Shape 2: Multi-scale (sum of Gaussians at different scales)
    else if (shape == 2) {
        dist_sq = dx * dx + dy * dy;
        
        // Base scale
        let w1 = exp(-dist_sq / (2.0 * s1 * s1));
        let w2 = exp(-dist_sq / (2.0 * s2 * s2));
        base_weight = w1 - params.beta * w2;
        
        // Second scale at 2× size
        let s1_2 = s1 * 2.0;
        let s2_2 = s2 * 2.0;
        let w1_2 = exp(-dist_sq / (2.0 * s1_2 * s1_2));
        let w2_2 = exp(-dist_sq / (2.0 * s2_2 * s2_2));
        base_weight = base_weight + params.kernel_scale2_weight * (w1_2 - params.beta * w2_2);
        
        // Third scale at 3× size
        let s1_3 = s1 * 3.0;
        let s2_3 = s2 * 3.0;
        let w1_3 = exp(-dist_sq / (2.0 * s1_3 * s1_3));
        let w2_3 = exp(-dist_sq / (2.0 * s2_3 * s2_3));
        base_weight = base_weight + params.kernel_scale3_weight * (w1_3 - params.beta * w2_3);
    }
    
    // Shape 3: Asymmetric (different forward/backward coupling)
    else if (shape == 3) {
        let angle = params.kernel_asymmetric_orientation;
        let asymmetry = params.kernel_asymmetry; // -1 to 1
        
        // Compute angle from center to point
        // Negate dx to match visual X-axis (column indices increase left-to-right visually)
        let point_angle = atan2(dy, -dx);
        
        // Directional modulation: 1.0 along orientation, varies with angle difference
        let angle_diff = point_angle - angle;
        let directional_factor = 1.0 + asymmetry * cos(angle_diff);
        
        dist_sq = dx * dx + dy * dy;
        let w1 = exp(-dist_sq / (2.0 * s1 * s1));
        let w2 = exp(-dist_sq / (2.0 * s2 * s2));
        base_weight = directional_factor * (w1 - params.beta * w2);
    }
    
    // Shape 4: Step/Rectangular (constant within sigma, zero outside)
    else if (shape == 4) {
        let dist = sqrt(dx * dx + dy * dy);
        if (dist < s1) {
            base_weight = 1.0;
        } else if (dist < s2) {
            base_weight = -params.beta;
        } else {
            base_weight = 0.0;
        }
    }
    
    // Shape 5: Multi-ring (customizable ring widths and weights)
    else if (shape == 5) {
        let r = sqrt(dx * dx + dy * dy);
        let r_norm = r / s2; // normalize to [0, 1] range (sigma2 = max radius)
        let num_rings = i32(params.kernel_rings);
        
        base_weight = 0.0; // outside all rings
        
        // Check each ring (unrolled for efficiency)
        if (num_rings >= 1 && r_norm < params.ring_width_1) {
            let ring_center = params.ring_width_1 * 0.5 * s2;
            let dist_from_center = abs(r - ring_center);
            let gaussian = exp(-dist_from_center * dist_from_center / (2.0 * s1 * s1));
            base_weight = params.ring_weight_1 * gaussian;
        }
        else if (num_rings >= 2 && r_norm < params.ring_width_2) {
            let ring_inner = params.ring_width_1;
            let ring_center = (ring_inner + params.ring_width_2) * 0.5 * s2;
            let dist_from_center = abs(r - ring_center);
            let gaussian = exp(-dist_from_center * dist_from_center / (2.0 * s1 * s1));
            base_weight = params.ring_weight_2 * gaussian;
        }
        else if (num_rings >= 3 && r_norm < params.ring_width_3) {
            let ring_inner = params.ring_width_2;
            let ring_center = (ring_inner + params.ring_width_3) * 0.5 * s2;
            let dist_from_center = abs(r - ring_center);
            let gaussian = exp(-dist_from_center * dist_from_center / (2.0 * s1 * s1));
            base_weight = params.ring_weight_3 * gaussian;
        }
        else if (num_rings >= 4 && r_norm < params.ring_width_4) {
            let ring_inner = params.ring_width_3;
            let ring_center = (ring_inner + params.ring_width_4) * 0.5 * s2;
            let dist_from_center = abs(r - ring_center);
            let gaussian = exp(-dist_from_center * dist_from_center / (2.0 * s1 * s1));
            base_weight = params.ring_weight_4 * gaussian;
        }
        else if (num_rings >= 5 && r_norm < params.ring_width_5) {
            let ring_inner = params.ring_width_4;
            let ring_center = (ring_inner + params.ring_width_5) * 0.5 * s2;
            let dist_from_center = abs(r - ring_center);
            let gaussian = exp(-dist_from_center * dist_from_center / (2.0 * s1 * s1));
            base_weight = params.ring_weight_5 * gaussian;
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
        let envelope = w1 - params.beta * w2; // Mexican-hat envelope
        
        // Spatial frequency components
        let k = params.kernel_spatial_freq_mag;
        let theta = params.kernel_spatial_freq_angle;
        let k_x = k * cos(theta);
        let k_y = k * sin(theta);
        
        // Sinusoidal carrier with phase offset
        let phase = k_x * dx + k_y * dy + params.kernel_gabor_phase;
        let carrier = cos(phase);
        
        base_weight = envelope * carrier;
    }
    
    else {
        // Default to isotropic
        dist_sq = dx * dx + dy * dy;
        let w1 = exp(-dist_sq / (2.0 * s1 * s1));
        let w2 = exp(-dist_sq / (2.0 * s2 * s2));
        base_weight = w1 - params.beta * w2;
    }
    
    return base_weight;
}

fn mexhat_weight(dx: f32, dy: f32) -> f32 {
    let primary_shape = i32(params.kernel_shape);
    
    // Check if composition is enabled
    if (params.kernel_composition_enabled > 0.5) {
        let secondary_shape = i32(params.kernel_secondary);
        let mix_ratio = params.kernel_mix_ratio;
        
        // Evaluate both kernels
        let primary_weight = mexhat_weight_for_shape(dx, dy, primary_shape);
        let secondary_weight = mexhat_weight_for_shape(dx, dy, secondary_shape);
        
        // Mix: 0 = all secondary, 1 = all primary
        return mix(secondary_weight, primary_weight, mix_ratio);
    } else {
        // Single kernel mode
        return mexhat_weight_for_shape(dx, dy, primary_shape);
    }
}

fn rule_classic(local_c: i32, local_r: i32, rng: i32, t: f32) -> f32 {
    var sum = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field: Z = (cos_avg, sin_avg)
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        sum = Z_sin * cos(t) - Z_cos * sin(t);
        cnt = 1.0;
    } else {
        // Use shared memory for local coupling
        for (var dr = -rng; dr <= rng; dr = dr + 1) {
            for (var dc = -rng; dc <= rng; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                let theta_j = loadThetaShared(local_c + dc, local_r + dr);
                sum = sum + sin(theta_j - t);
                cnt = cnt + 1.0;
            }
        }
    }
    return params.K0 * (sum / cnt);
}

fn rule_coherence(local_c: i32, local_r: i32, rng: i32, t: f32) -> f32 {
    var sum = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        sum = Z_sin * cos(t) - Z_cos * sin(t);
        cnt = 1.0;
    } else {
        // Use shared memory for local coupling
        for (var dr = -rng; dr <= rng; dr = dr + 1) {
            for (var dc = -rng; dc <= rng; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                let theta_j = loadThetaShared(local_c + dc, local_r + dr);
                sum = sum + sin(theta_j - t);
                cnt = cnt + 1.0;
            }
        }
    }
    let ri = localOrderShared(local_c, local_r, rng);
    let Ki = params.K0 * (1.0 - 0.8 * ri);
    return Ki * (sum / cnt);
}

fn rule_curvature(local_c: i32, local_r: i32, rng: i32, t: f32) -> f32 {
    var sum = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        sum = Z_sin * cos(t) - Z_cos * sin(t);
        cnt = 1.0;
    } else {
        // Use shared memory for local coupling
        for (var dr = -rng; dr <= rng; dr = dr + 1) {
            for (var dc = -rng; dc <= rng; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                let theta_j = loadThetaShared(local_c + dc, local_r + dr);
                sum = sum + sin(theta_j - t);
                cnt = cnt + 1.0;
            }
        }
    }
    let lap = sum / cnt;
    return params.K0 * min(1.0, abs(lap) * 2.0) * lap;
}

fn rule_harmonics(local_c: i32, local_r: i32, rng: i32, t: f32) -> f32 {
    var s1 = 0.0; var s2 = 0.0; var s3 = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field for fundamental
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        s1 = Z_sin * cos(t) - Z_cos * sin(t);
        
        // For harmonics, use fundamental with harmonic coefficients
        let Z_mag = sqrt(Z_cos * Z_cos + Z_sin * Z_sin);
        s2 = s1 * params.harmonic_a * Z_mag;
        s3 = s1 * params.harmonic_b * Z_mag;
        cnt = 1.0;
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
    return params.K0 * ((s1 + params.harmonic_a * s2 + params.harmonic_b * s3) / cnt);
}

// rule_kernel needs larger range - use shared memory when possible, fall back to global
fn rule_kernel(local_c: i32, local_r: i32, global_c: i32, global_r: i32, cols: i32, rows: i32, t: f32) -> f32 {
    var sum = 0.0; var wtotal = 0.0;
    
    let rng_ext = i32(params.sigma2 * 3.0);
    
    // If range fits in shared memory (halo = 8), use it
    if (rng_ext <= i32(HALO)) {
        for (var dr = -rng_ext; dr <= rng_ext; dr = dr + 1) {
            for (var dc = -rng_ext; dc <= rng_ext; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                let theta_j = loadThetaShared(local_c + dc, local_r + dr);
                let w = mexhat_weight(f32(dc), f32(dr));
                sum = sum + w * sin(theta_j - t);
                wtotal = wtotal + abs(w);
            }
        }
    } else {
        // Fall back to global texture access for large kernels
        for (var dr = -rng_ext; dr <= rng_ext; dr = dr + 1) {
            for (var dc = -rng_ext; dc <= rng_ext; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                let theta_j = loadThetaGlobal(global_c + dc, global_r + dr, cols, rows);
                let w = mexhat_weight(f32(dc), f32(dr));
                sum = sum + w * sin(theta_j - t);
                wtotal = wtotal + abs(w);
            }
        }
    }
    
    if (wtotal > 0.0) {
        return params.K0 * (sum / wtotal);
    }
    return 0.0;
}

fn rule_delay(local_c: i32, local_r: i32, global_c: u32, global_r: u32, cols: u32, rows: u32, rng: i32, t: f32) -> f32 {
    // Delay mode uses storage buffer for delayed theta values, not shared memory
    var sum = 0.0; var cnt = 0.0;
    
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
    return params.K0 * (sum / cnt);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wg_id: vec3<u32>) {
    let cols = u32(params.cols); let rows = u32(params.rows);
    
    // Local coordinates within workgroup (0-15)
    let local_c = i32(lid.x);
    let local_r = i32(lid.y);
    
    // Global coordinates
    let global_c = id.x;
    let global_r = id.y;
    
    // Tile origin in global coordinates (top-left of the 16x16 output area)
    let tile_origin = vec2<i32>(i32(wg_id.x) * i32(TILE_SIZE), i32(wg_id.y) * i32(TILE_SIZE));
    
    // Cooperative tile loading using helper function
    loadTile(lid.xy, tile_origin, i32(cols), i32(rows));
    
    // Synchronize: ensure all threads have loaded their data
    workgroupBarrier();
    
    // Early exit for out-of-bounds threads (after loading!)
    if (global_c >= cols || global_r >= rows) { return; }
    
    let i = global_r * cols + global_c;
    let t = loadThetaShared(local_c, local_r);  // Center value from shared memory
    let rng = i32(params.range);
    
    // Compute order parameter using shared memory
    order[i] = localOrderShared(local_c, local_r, rng);
    
    var dtheta = 0.0;
    let mode = i32(params.rule_mode);
    if (mode == 0) { dtheta = rule_classic(local_c, local_r, rng, t); }
    else if (mode == 1) { dtheta = rule_coherence(local_c, local_r, rng, t); }
    else if (mode == 2) { dtheta = rule_curvature(local_c, local_r, rng, t); }
    else if (mode == 3) { dtheta = rule_harmonics(local_c, local_r, rng, t); }
    else if (mode == 4) { dtheta = rule_kernel(local_c, local_r, i32(global_c), i32(global_r), i32(cols), i32(rows), t); }
    else if (mode == 5) { dtheta = rule_delay(local_c, local_r, global_c, global_r, cols, rows, rng, t); }
    
    // Add noise perturbation
    if (params.noise_strength > 0.001) {
        dtheta = dtheta + noise(i);
    }
    
    var newTheta = t + (omega[i] + dtheta) * params.dt;
    let TWO_PI = 6.28318530718;
    if (newTheta < 0.0) { newTheta = newTheta + TWO_PI; }
    if (newTheta > TWO_PI) { newTheta = newTheta - TWO_PI; }
    textureStore(theta_out, vec2<i32>(i32(global_c), i32(global_r)), vec4<f32>(newTheta, 0.0, 0.0, 1.0));
}
`;

export const RENDER_SHADER = `
struct Params {
    dt: f32, K0: f32, range: f32, rule_mode: f32,
    cols: f32, rows: f32, harmonic_a: f32, global_coupling: f32,
    delay_steps: f32, sigma: f32, sigma2: f32, beta: f32,
    show_order: f32, colormap: f32, noise_strength: f32, time: f32,
    harmonic_b: f32, view_mode: f32, kernel_shape: f32, kernel_orientation: f32,
    kernel_aspect: f32, kernel_scale2_weight: f32, kernel_scale3_weight: f32, kernel_asymmetry: f32,
    kernel_rings: f32, ring_width_1: f32, ring_width_2: f32, ring_width_3: f32,
    ring_width_4: f32, ring_width_5: f32, ring_weight_1: f32, ring_weight_2: f32,
    ring_weight_3: f32, ring_weight_4: f32, ring_weight_5: f32, kernel_composition_enabled: f32,
    kernel_secondary: f32, kernel_mix_ratio: f32, kernel_asymmetric_orientation: f32, kernel_spatial_freq_mag: f32,
    kernel_spatial_freq_angle: f32, kernel_gabor_phase: f32, pad1: f32, pad2: f32,
}
@group(0) @binding(0) var theta_tex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<uniform> viewProj: mat4x4<f32>;
@group(0) @binding(3) var<storage, read> order: array<f32>;
@group(0) @binding(4) var textureSampler: sampler;
@group(0) @binding(5) var externalTexture: texture_2d<f32>;

// Helper to load theta from texture
fn loadThetaRender(col: u32, row: u32) -> f32 {
    return textureLoad(theta_tex, vec2<i32>(i32(col), i32(row)), 0).r;
}

fn compute_gradient(ii: u32, cols: u32, rows: u32) -> f32 {
    let c = ii % cols;
    let r = ii / cols;
    
    var cr = (c + 1u) % cols;
    var cl = (c + cols - 1u) % cols;
    var ru = (r + 1u) % rows;
    var rd = (r + rows - 1u) % rows;
    
    let right = loadThetaRender(cr, r);
    let left = loadThetaRender(cl, r);
    let up = loadThetaRender(c, ru);
    let down = loadThetaRender(c, rd);
    
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
fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VertexOutput {
    let cols = u32(params.cols);
    let rows = u32(params.rows);
    let c = ii % cols; let r = ii / cols;
    let qx = f32(vi & 1u); let qz = f32((vi >> 1u) & 1u);
    
    // Use view_mode to control 2D vs 3D: 0.0 = 3D, 1.0 = 2D
    let is_3d = params.view_mode < 0.5;
    let theta_val = loadThetaRender(c, r);
    let height_3d = sin(theta_val) * 2.0;
    // In 2D mode, use a small offset per oscillator to prevent Z-fighting
    let height_2d = f32(ii) * 0.0001;
    let h = select(height_2d, height_3d, is_3d);
    
    let x = (f32(c) + qx) * 0.5 - params.cols * 0.5 * 0.5;
    let z = (f32(r) + qz) * 0.5 - params.rows * 0.5 * 0.5;
    var output: VertexOutput;
    output.position = viewProj * vec4<f32>(x, h, z, 1.0);
    // Always pass the actual height value for coloring, not the flattened one
    output.height = height_3d;
    output.order_val = order[ii];
    output.gradient = compute_gradient(ii, cols, rows);
    
    // Calculate texture coordinates (normalized grid position)
    output.texcoord = vec2<f32>((f32(c) + qx) / params.cols, 1.0 - (f32(r) + qz) / params.rows);
    
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

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    var col: vec3<f32>;
    let mode = i32(params.colormap);
    let t = clamp((input.height / 2.0 + 1.0) * 0.5, 0.0, 1.0); // Normalized phase
    
    if (mode == 0) {
        // Phase (original rainbow)
        if (t < 0.25) { col = vec3<f32>(0.0, t * 4.0, 1.0); }
        else if (t < 0.5) { let s = (t - 0.25) * 4.0; col = vec3<f32>(0.0, 1.0, 1.0 - s); }
        else if (t < 0.75) { let s = (t - 0.5) * 4.0; col = vec3<f32>(s, 1.0, 0.0); }
        else { let s = (t - 0.75) * 4.0; col = vec3<f32>(1.0, 1.0 - s, 0.0); }
    } else if (mode == 1) {
        // Velocity (gradient magnitude)
        let vel = clamp(input.gradient * 2.0, 0.0, 1.0);
        col = mix(vec3<f32>(0.0, 0.0, 0.5), vec3<f32>(1.0, 0.5, 0.0), vel);
    } else if (mode == 2) {
        // Curvature
        let curv = clamp(input.gradient, 0.0, 1.0);
        col = mix(vec3<f32>(0.2, 0.0, 0.5), vec3<f32>(1.0, 0.8, 0.0), curv);
    } else if (mode == 3) {
        // Order parameter
        col = mix(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), input.order_val);
    } else if (mode == 4) {
        // Image texture modulated by phase
        let texColor = textureSample(externalTexture, textureSampler, input.texcoord).rgb;
        let phaseMod = 0.5 + 0.5 * sin(input.height);
        col = texColor * (0.7 + 0.3 * phaseMod);
    } else if (mode == 5) {
        // Viridis
        col = colormap3d_viridis(t);
    } else if (mode == 6) {
        // Plasma
        col = colormap3d_plasma(t);
    } else if (mode == 7) {
        // Twilight (cyclic)
        col = colormap3d_twilight(t);
    } else if (mode == 8) {
        // Inferno
        col = colormap3d_inferno(t);
    } else if (mode == 9) {
        // Chirality - use gradient as proxy (3D doesn't have curl computed)
        let chirality = clamp((input.gradient - 0.5) * 2.0, -1.0, 1.0);
        if (chirality > 0.0) {
            col = mix(vec3<f32>(0.5, 0.5, 0.5), vec3<f32>(1.0, 0.2, 0.1), chirality);
        } else {
            col = mix(vec3<f32>(0.5, 0.5, 0.5), vec3<f32>(0.1, 0.4, 1.0), -chirality);
        }
    } else if (mode == 10) {
        // Phase + gradient brightness
        if (t < 0.25) { col = vec3<f32>(0.0, t * 4.0, 1.0); }
        else if (t < 0.5) { let s = (t - 0.25) * 4.0; col = vec3<f32>(0.0, 1.0, 1.0 - s); }
        else if (t < 0.75) { let s = (t - 0.5) * 4.0; col = vec3<f32>(s, 1.0, 0.0); }
        else { let s = (t - 0.75) * 4.0; col = vec3<f32>(1.0, 1.0 - s, 0.0); }
        let brightness = 0.3 + 0.7 * clamp(input.gradient * 3.0, 0.0, 1.0);
        col = col * brightness;
    } else {
        // Default to phase
        if (t < 0.25) { col = vec3<f32>(0.0, t * 4.0, 1.0); }
        else if (t < 0.5) { let s = (t - 0.25) * 4.0; col = vec3<f32>(0.0, 1.0, 1.0 - s); }
        else if (t < 0.75) { let s = (t - 0.5) * 4.0; col = vec3<f32>(s, 1.0, 0.0); }
        else { let s = (t - 0.75) * 4.0; col = vec3<f32>(1.0, 1.0 - s, 0.0); }
    }
    
    // Apply order overlay
    if (params.show_order > 0.5) {
        let brightness = 0.4 + 0.6 * input.order_val;
        col = col * brightness;
    }
    
    return vec4<f32>(col, 1.0);
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
    show_order: f32, colormap: f32, noise_strength: f32, time: f32,
    harmonic_b: f32, view_mode: f32, kernel_shape: f32, kernel_orientation: f32,
    kernel_aspect: f32, kernel_scale2_weight: f32, kernel_scale3_weight: f32, kernel_asymmetry: f32,
    kernel_rings: f32, ring_width_1: f32, ring_width_2: f32, ring_width_3: f32,
    ring_width_4: f32, ring_width_5: f32, ring_weight_1: f32, ring_weight_2: f32,
    ring_weight_3: f32, ring_weight_4: f32, ring_weight_5: f32, kernel_composition_enabled: f32,
    kernel_secondary: f32, kernel_mix_ratio: f32, kernel_asymmetric_orientation: f32, kernel_spatial_freq_mag: f32,
    kernel_spatial_freq_angle: f32, kernel_gabor_phase: f32, pad1: f32, pad2: f32,
}

@group(0) @binding(0) var<storage, read_write> global_order_atomic: array<atomic<i32>, 2>;
@group(0) @binding(1) var<storage, read_write> global_order: vec2<f32>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(1)
fn main() {
    // Load atomic sums (these are scaled by 10000)
    let x = atomicLoad(&global_order_atomic[0]);
    let y = atomicLoad(&global_order_atomic[1]);
    
    // Convert to float, unscale, and normalize by N
    let N = params.cols * params.rows;
    global_order.x = (f32(x) / 10000.0) / N;
    global_order.y = (f32(y) / 10000.0) / N;
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
    show_order: f32, colormap: f32, noise_strength: f32, time: f32,
    harmonic_b: f32, view_mode: f32, kernel_shape: f32, kernel_orientation: f32,
    kernel_aspect: f32, kernel_scale2_weight: f32, kernel_scale3_weight: f32, kernel_asymmetry: f32,
    kernel_rings: f32, ring_width_1: f32, ring_width_2: f32, ring_width_3: f32,
    ring_width_4: f32, ring_width_5: f32, ring_weight_1: f32, ring_weight_2: f32,
    ring_weight_3: f32, ring_weight_4: f32, ring_weight_5: f32, kernel_composition_enabled: f32,
    kernel_secondary: f32, kernel_mix_ratio: f32, kernel_asymmetric_orientation: f32, kernel_spatial_freq_mag: f32,
    kernel_spatial_freq_angle: f32, kernel_gabor_phase: f32, zoom: f32, panX: f32,
    panY: f32, bilinear: f32, pad2: f32, pad3: f32,
}

@group(0) @binding(0) var theta_tex: texture_2d<f32>;
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
fn sample_theta_bilinear(uv: vec2<f32>, cols: f32, rows: f32) -> f32 {
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
    let t00 = textureLoad(theta_tex, vec2<i32>(x0w, y0w), 0).r;
    let t10 = textureLoad(theta_tex, vec2<i32>(x1w, y0w), 0).r;
    let t01 = textureLoad(theta_tex, vec2<i32>(x0w, y1w), 0).r;
    let t11 = textureLoad(theta_tex, vec2<i32>(x1w, y1w), 0).r;
    
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

// ============================================================================
// FRAGMENT SHADER
// ============================================================================

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let zoom = select(1.0, params.zoom, params.zoom > 0.0);
    
    // Apply zoom and pan
    var uv = input.uv;
    uv = (uv - 0.5) / zoom + vec2<f32>(params.panX, params.panY) + 0.5;
    
    // Check bounds (for when zoomed/panned outside grid)
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        return vec4<f32>(0.08, 0.08, 0.1, 1.0);
    }
    
    // Convert UV to grid coordinates (integer for discrete lookups)
    let cols = i32(params.cols);
    let rows = i32(params.rows);
    let c = clamp(i32(uv.x * params.cols), 0, cols - 1);
    let r = clamp(i32(uv.y * params.rows), 0, rows - 1);
    
    // Load theta value - use bilinear interpolation if enabled, otherwise nearest neighbor
    var theta: f32;
    if (params.bilinear > 0.5) {
        theta = sample_theta_bilinear(uv, params.cols, params.rows);
    } else {
        theta = textureLoad(theta_tex, vec2<i32>(c, r), 0).r;
    }
    
    // Load order parameter (no interpolation needed - it's already smooth)
    let idx = u32(r) * u32(cols) + u32(c);
    let order_val = order[idx];
    
    // Compute gradient for velocity/curvature modes (use discrete samples for accuracy)
    let right = textureLoad(theta_tex, vec2<i32>((c + 1) % cols, r), 0).r;
    let left = textureLoad(theta_tex, vec2<i32>((c + cols - 1) % cols, r), 0).r;
    let up = textureLoad(theta_tex, vec2<i32>(c, (r + 1) % rows), 0).r;
    let down = textureLoad(theta_tex, vec2<i32>(c, (r + rows - 1) % rows), 0).r;
    
    var dx = right - left;
    var dy = up - down;
    if (dx > 3.14159) { dx -= 6.28318; }
    if (dx < -3.14159) { dx += 6.28318; }
    if (dy > 3.14159) { dy -= 6.28318; }
    if (dy < -3.14159) { dy += 6.28318; }
    let gradient = sqrt(dx * dx + dy * dy) * 0.5;
    
    // Compute chirality (curl) for spiral detection
    let tr = textureLoad(theta_tex, vec2<i32>((c + 1) % cols, (r + 1) % rows), 0).r;
    let tl = textureLoad(theta_tex, vec2<i32>((c + cols - 1) % cols, (r + 1) % rows), 0).r;
    let br = textureLoad(theta_tex, vec2<i32>((c + 1) % cols, (r + rows - 1) % rows), 0).r;
    let bl = textureLoad(theta_tex, vec2<i32>((c + cols - 1) % cols, (r + rows - 1) % rows), 0).r;
    
    var curl = (tr - tl - br + bl) * 0.25;
    if (curl > 3.14159) { curl -= 6.28318; }
    if (curl < -3.14159) { curl += 6.28318; }
    // Negate curl to match 3D coordinate system (UV Y is inverted)
    curl = -curl;
    
    // Select colormap based on mode
    var col3: vec3<f32>;
    let mode = i32(params.colormap);
    
    // Use sin(theta) mapping to match 3D shader's height-based coloring
    let height = sin(theta) * 2.0;
    let t_height = clamp((height / 2.0 + 1.0) * 0.5, 0.0, 1.0);
    // Also keep linear theta mapping for some colormaps
    let t_linear = theta / 6.28318530718;
    
    if (mode == 0) {
        // Phase - classic rainbow (matches 3D exactly)
        let phase_t = t_height;
        if (phase_t < 0.25) { col3 = vec3<f32>(0.0, phase_t * 4.0, 1.0); }
        else if (phase_t < 0.5) { let s = (phase_t - 0.25) * 4.0; col3 = vec3<f32>(0.0, 1.0, 1.0 - s); }
        else if (phase_t < 0.75) { let s = (phase_t - 0.5) * 4.0; col3 = vec3<f32>(s, 1.0, 0.0); }
        else { let s = (phase_t - 0.75) * 4.0; col3 = vec3<f32>(1.0, 1.0 - s, 0.0); }
    } else if (mode == 1) {
        // Velocity (gradient magnitude) - blue to orange
        let vel = clamp(gradient * 2.0, 0.0, 1.0);
        col3 = mix(vec3<f32>(0.0, 0.0, 0.5), vec3<f32>(1.0, 0.5, 0.0), vel);
    } else if (mode == 2) {
        // Curvature - purple to yellow
        let curv = clamp(gradient, 0.0, 1.0);
        col3 = mix(vec3<f32>(0.2, 0.0, 0.5), vec3<f32>(1.0, 0.8, 0.0), curv);
    } else if (mode == 3) {
        // Order parameter - red (chaos) to green (sync)
        col3 = mix(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), order_val);
    } else if (mode == 4) {
        // Image texture modulated by phase (matches 3D)
        // Flip Y to match 3D texcoord orientation, flip X for webcam mirror
        let tex_uv = vec2<f32>(uv.x, 1.0 - uv.y);
        let texColor = textureSample(externalTexture, textureSampler, tex_uv).rgb;
        let phaseMod = 0.5 + 0.5 * sin(theta);
        col3 = texColor * (0.7 + 0.3 * phaseMod);
    } else if (mode == 5) {
        // Viridis - perceptually uniform (use sin-based mapping like 3D)
        col3 = colormap_viridis(t_height);
    } else if (mode == 6) {
        // Plasma - hot magenta to yellow (use sin-based mapping like 3D)
        col3 = colormap_plasma(t_height);
    } else if (mode == 7) {
        // Twilight - cyclic, good for phase (use linear for full cycle)
        col3 = colormap_twilight(t_linear);
    } else if (mode == 8) {
        // Inferno - black to yellow (use sin-based mapping like 3D)
        col3 = colormap_inferno(t_height);
    } else if (mode == 9) {
        // Chirality - spiral rotation direction
        // Blue = clockwise, Red = counterclockwise, Gray = no rotation
        let chirality = clamp(curl * 5.0, -1.0, 1.0);
        if (chirality > 0.0) {
            col3 = mix(vec3<f32>(0.5, 0.5, 0.5), vec3<f32>(1.0, 0.2, 0.1), chirality);
        } else {
            col3 = mix(vec3<f32>(0.5, 0.5, 0.5), vec3<f32>(0.1, 0.4, 1.0), -chirality);
        }
    } else if (mode == 10) {
        // Combined: phase hue + gradient brightness (matches 3D exactly)
        var hue_col: vec3<f32>;
        let pt = t_height;
        if (pt < 0.25) { hue_col = vec3<f32>(0.0, pt * 4.0, 1.0); }
        else if (pt < 0.5) { let s = (pt - 0.25) * 4.0; hue_col = vec3<f32>(0.0, 1.0, 1.0 - s); }
        else if (pt < 0.75) { let s = (pt - 0.5) * 4.0; hue_col = vec3<f32>(s, 1.0, 0.0); }
        else { let s = (pt - 0.75) * 4.0; hue_col = vec3<f32>(1.0, 1.0 - s, 0.0); }
        let brightness = 0.3 + 0.7 * clamp(gradient * 3.0, 0.0, 1.0);
        col3 = hue_col * brightness;
    } else {
        // Default to phase (matches 3D exactly)
        let pt = t_height;
        if (pt < 0.25) { col3 = vec3<f32>(0.0, pt * 4.0, 1.0); }
        else if (pt < 0.5) { let s = (pt - 0.25) * 4.0; col3 = vec3<f32>(0.0, 1.0, 1.0 - s); }
        else if (pt < 0.75) { let s = (pt - 0.5) * 4.0; col3 = vec3<f32>(s, 1.0, 0.0); }
        else { let s = (pt - 0.75) * 4.0; col3 = vec3<f32>(1.0, 1.0 - s, 0.0); }
    }
    
    // Apply order overlay if enabled
    if (params.show_order > 0.5) {
        let brightness = 0.3 + 0.7 * order_val;
        col3 = col3 * brightness;
    }
    
    return vec4<f32>(col3, 1.0);
}
`;
