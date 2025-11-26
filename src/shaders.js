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

@group(0) @binding(0) var<storage, read> theta_in: array<f32>;
@group(0) @binding(1) var<storage, read> omega: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read_write> order: array<f32>;
@group(0) @binding(4) var<storage, read> theta_delayed: array<f32>;
@group(0) @binding(5) var<storage, read> global_order: vec2<f32>;
@group(0) @binding(6) var<storage, read_write> theta_out: array<f32>;

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

fn localOrder(i: u32, cols: u32, rows: u32, rng: i32) -> f32 {
    let c = i % cols;
    let r = i / cols;
    var sx = 0.0; var sy = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Global coupling: couple to ALL oscillators
        for (var j = 0u; j < cols * rows; j = j + 1u) {
            if (j == i) { continue; }
            sx = sx + cos(theta_in[j]);
            sy = sy + sin(theta_in[j]);
            cnt = cnt + 1.0;
        }
    } else {
        for (var dr = -rng; dr <= rng; dr = dr + 1) {
            for (var dc = -rng; dc <= rng; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                var rr = (i32(r) + dr) % i32(rows);
                var cc = (i32(c) + dc) % i32(cols);
                if (rr < 0) { rr = rr + i32(rows); }
                if (cc < 0) { cc = cc + i32(cols); }
                let j = u32(rr) * cols + u32(cc);
                sx = sx + cos(theta_in[j]);
                sy = sy + sin(theta_in[j]);
                cnt = cnt + 1.0;
            }
        }
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
        let point_angle = atan2(dy, dx);
        
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

fn rule_classic(i: u32, cols: u32, rows: u32, rng: i32, t: f32) -> f32 {
    let c = i % cols; let r = i / cols;
    var sum = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field: Z = (cos_avg, sin_avg)
        // Coupling = K * Im(Z * e^(-iθ)) = K * sin(arg(Z) - θ)
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        
        // Convert to phase difference: sin(θ_mean - θ_i)
        // Z * e^(-iθ) = (Z_cos + i*Z_sin) * (cos(-θ) + i*sin(-θ))
        //             = Z_cos*cos(θ) + Z_sin*sin(θ) + i*(Z_sin*cos(θ) - Z_cos*sin(θ))
        // Im part = Z_sin*cos(θ) - Z_cos*sin(θ) = sin(atan2(Z_sin, Z_cos) - θ)
        sum = Z_sin * cos(t) - Z_cos * sin(t);
        cnt = 1.0;
    } else {
        for (var dr = -rng; dr <= rng; dr = dr + 1) {
            for (var dc = -rng; dc <= rng; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                var rr = (i32(r) + dr) % i32(rows);
                var cc = (i32(c) + dc) % i32(cols);
                if (rr < 0) { rr = rr + i32(rows); }
                if (cc < 0) { cc = cc + i32(cols); }
                let j = u32(rr) * cols + u32(cc);
                sum = sum + sin(theta_in[j] - t);
                cnt = cnt + 1.0;
            }
        }
    }
    return params.K0 * (sum / cnt);
}

fn rule_coherence(i: u32, cols: u32, rows: u32, rng: i32, t: f32) -> f32 {
    let c = i % cols; let r = i / cols;
    var sum = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        sum = Z_sin * cos(t) - Z_cos * sin(t);
        cnt = 1.0;
    } else {
        for (var dr = -rng; dr <= rng; dr = dr + 1) {
            for (var dc = -rng; dc <= rng; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                var rr = (i32(r) + dr) % i32(rows);
                var cc = (i32(c) + dc) % i32(cols);
                if (rr < 0) { rr = rr + i32(rows); }
                if (cc < 0) { cc = cc + i32(cols); }
                let j = u32(rr) * cols + u32(cc);
                sum = sum + sin(theta_in[j] - t);
                cnt = cnt + 1.0;
            }
        }
    }
    let ri = localOrder(i, cols, rows, rng);
    let Ki = params.K0 * (1.0 - 0.8 * ri);
    return Ki * (sum / cnt);
}

fn rule_curvature(i: u32, cols: u32, rows: u32, rng: i32, t: f32) -> f32 {
    let c = i % cols; let r = i / cols;
    var sum = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        sum = Z_sin * cos(t) - Z_cos * sin(t);
        cnt = 1.0;
    } else {
        for (var dr = -rng; dr <= rng; dr = dr + 1) {
            for (var dc = -rng; dc <= rng; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                var rr = (i32(r) + dr) % i32(rows);
                var cc = (i32(c) + dc) % i32(cols);
                if (rr < 0) { rr = rr + i32(rows); }
                if (cc < 0) { cc = cc + i32(cols); }
                let j = u32(rr) * cols + u32(cc);
                sum = sum + sin(theta_in[j] - t);
                cnt = cnt + 1.0;
            }
        }
    }
    let lap = sum / cnt;
    return params.K0 * min(1.0, abs(lap) * 2.0) * lap;
}

fn rule_harmonics(i: u32, cols: u32, rows: u32, rng: i32, t: f32) -> f32 {
    let c = i % cols; let r = i / cols;
    var s1 = 0.0; var s2 = 0.0; var s3 = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        // Use precomputed mean field for fundamental
        let Z_cos = global_order.x;
        let Z_sin = global_order.y;
        s1 = Z_sin * cos(t) - Z_cos * sin(t);
        
        // For harmonics, we'd need additional reduction passes (not implemented here)
        // For now, just use the fundamental with harmonic coefficients applied to magnitude
        let Z_mag = sqrt(Z_cos * Z_cos + Z_sin * Z_sin);
        s2 = s1 * params.harmonic_a * Z_mag;
        s3 = s1 * params.harmonic_b * Z_mag;
        cnt = 1.0;
    } else {
        for (var dr = -rng; dr <= rng; dr = dr + 1) {
            for (var dc = -rng; dc <= rng; dc = dc + 1) {
                if (dr == 0 && dc == 0) { continue; }
                var rr = (i32(r) + dr) % i32(rows);
                var cc = (i32(c) + dc) % i32(cols);
                if (rr < 0) { rr = rr + i32(rows); }
                if (cc < 0) { cc = cc + i32(cols); }
                let j = u32(rr) * cols + u32(cc);
                let d = theta_in[j] - t;
                s1 = s1 + sin(d);
                s2 = s2 + sin(2.0 * d);
                s3 = s3 + sin(3.0 * d);
                cnt = cnt + 1.0;
            }
        }
    }
    return params.K0 * ((s1 + params.harmonic_a * s2 + params.harmonic_b * s3) / cnt);
}

fn rule_kernel(i: u32, cols: u32, rows: u32, rng: i32, t: f32) -> f32 {
    let c = i % cols; let r = i / cols;
    var sum = 0.0; var wtotal = 0.0;
    
    let rng_ext = i32(params.sigma2 * 3.0);
    for (var dr = -rng_ext; dr <= rng_ext; dr = dr + 1) {
        for (var dc = -rng_ext; dc <= rng_ext; dc = dc + 1) {
            if (dr == 0 && dc == 0) { continue; }
            var rr = (i32(r) + dr) % i32(rows);
            var cc = (i32(c) + dc) % i32(cols);
            if (rr < 0) { rr = rr + i32(rows); }
            if (cc < 0) { cc = cc + i32(cols); }
            let j = u32(rr) * cols + u32(cc);
            let w = mexhat_weight(f32(dc), f32(dr));
            sum = sum + w * sin(theta_in[j] - t);
            wtotal = wtotal + abs(w);
        }
    }
    if (wtotal > 0.0) {
        return params.K0 * (sum / wtotal);
    }
    return 0.0;
}

fn rule_delay(i: u32, cols: u32, rows: u32, rng: i32, t: f32) -> f32 {
    let c = i % cols; let r = i / cols;
    var sum = 0.0; var cnt = 0.0;
    
    for (var dr = -rng; dr <= rng; dr = dr + 1) {
        for (var dc = -rng; dc <= rng; dc = dc + 1) {
            if (dr == 0 && dc == 0) { continue; }
            var rr = (i32(r) + dr) % i32(rows);
            var cc = (i32(c) + dc) % i32(cols);
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
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let c = id.x; let r = id.y;
    let cols = u32(params.cols); let rows = u32(params.rows);
    if (c >= cols || r >= rows) { return; }
    
    let i = r * cols + c;
    let t = theta_in[i];
    let rng = i32(params.range);
    
    // Compute order parameter
    order[i] = localOrder(i, cols, rows, rng);
    
    var dtheta = 0.0;
    let mode = i32(params.rule_mode);
    if (mode == 0) { dtheta = rule_classic(i, cols, rows, rng, t); }
    else if (mode == 1) { dtheta = rule_coherence(i, cols, rows, rng, t); }
    else if (mode == 2) { dtheta = rule_curvature(i, cols, rows, rng, t); }
    else if (mode == 3) { dtheta = rule_harmonics(i, cols, rows, rng, t); }
    else if (mode == 4) { dtheta = rule_kernel(i, cols, rows, rng, t); }
    else if (mode == 5) { dtheta = rule_delay(i, cols, rows, rng, t); }
    
    // Add noise perturbation
    if (params.noise_strength > 0.001) {
        dtheta = dtheta + noise(i);
    }
    
    var newTheta = t + (omega[i] + dtheta) * params.dt;
    let TWO_PI = 6.28318530718;
    if (newTheta < 0.0) { newTheta = newTheta + TWO_PI; }
    if (newTheta > TWO_PI) { newTheta = newTheta - TWO_PI; }
    theta_out[i] = newTheta;
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
@group(0) @binding(0) var<storage, read> theta: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<uniform> viewProj: mat4x4<f32>;
@group(0) @binding(3) var<storage, read> order: array<f32>;
@group(0) @binding(4) var textureSampler: sampler;
@group(0) @binding(5) var externalTexture: texture_2d<f32>;

fn compute_gradient(ii: u32, cols: u32, rows: u32) -> f32 {
    let c = ii % cols;
    let r = ii / cols;
    
    var cr = (c + 1u) % cols;
    var cl = (c + cols - 1u) % cols;
    var ru = (r + 1u) % rows;
    var rd = (r + rows - 1u) % rows;
    
    let right = theta[r * cols + cr];
    let left = theta[r * cols + cl];
    let up = theta[ru * cols + c];
    let down = theta[rd * cols + c];
    
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
    let c = f32(ii % cols); let r = f32(ii / cols);
    let qx = f32(vi & 1u); let qz = f32((vi >> 1u) & 1u);
    
    // Use view_mode to control 2D vs 3D: 0.0 = 3D, 1.0 = 2D
    let is_3d = params.view_mode < 0.5;
    let height_3d = sin(theta[ii]) * 2.0;
    // In 2D mode, use a small offset per oscillator to prevent Z-fighting
    let height_2d = f32(ii) * 0.0001;
    let h = select(height_2d, height_3d, is_3d);
    
    let x = (c + qx) * 0.5 - params.cols * 0.5 * 0.5;
    let z = (r + qz) * 0.5 - params.rows * 0.5 * 0.5;
    var output: VertexOutput;
    output.position = viewProj * vec4<f32>(x, h, z, 1.0);
    // Always pass the actual height value for coloring, not the flattened one
    output.height = height_3d;
    output.order_val = order[ii];
    output.gradient = compute_gradient(ii, cols, u32(params.rows));
    
    // Calculate texture coordinates (normalized grid position)
    output.texcoord = vec2<f32>((c + qx) / params.cols, 1.0 - (r + qz) / params.rows);
    
    return output;
}
@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    var col: vec3<f32>;
    let mode = i32(params.colormap);
    
    if (mode == 0) {
        // Phase (original)
        let t = clamp((input.height / 2.0 + 1.0) * 0.5, 0.0, 1.0);
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
    } else {
        // mode == 4: Image texture modulated by phase
        let texColor = textureSample(externalTexture, textureSampler, input.texcoord).rgb;
        // Modulate brightness by phase (height)
        let phaseMod = 0.5 + 0.5 * sin(input.height);
        col = texColor * (0.7 + 0.3 * phaseMod);
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
