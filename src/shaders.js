export const COMPUTE_SHADER = `
struct Params {
    dt: f32, K0: f32, range: f32, rule_mode: f32,
    cols: f32, rows: f32, harmonic_a: f32, global_coupling: f32,
    delay_steps: f32, sigma: f32, sigma2: f32, beta: f32,
    show_order: f32, colormap: f32, noise_strength: f32, time: f32,
    harmonic_b: f32, view_mode: f32, pad2: f32, pad3: f32,
}

@group(0) @binding(0) var<storage, read_write> theta: array<f32>;
@group(0) @binding(1) var<storage, read> omega: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read_write> order: array<f32>;
@group(0) @binding(4) var<storage, read> theta_delayed: array<f32>;

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
            sx = sx + cos(theta[j]);
            sy = sy + sin(theta[j]);
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
                sx = sx + cos(theta[j]);
                sy = sy + sin(theta[j]);
                cnt = cnt + 1.0;
            }
        }
    }
    return sqrt((sx/cnt)*(sx/cnt) + (sy/cnt)*(sy/cnt));
}

fn mexhat_weight(dist: f32) -> f32 {
    let s1 = params.sigma;
    let s2 = params.sigma2;
    let w1 = exp(-dist * dist / (2.0 * s1 * s1));
    let w2 = exp(-dist * dist / (2.0 * s2 * s2));
    return w1 - params.beta * w2;
}

fn rule_classic(i: u32, cols: u32, rows: u32, rng: i32, t: f32) -> f32 {
    let c = i % cols; let r = i / cols;
    var sum = 0.0; var cnt = 0.0;
    
    if (params.global_coupling > 0.5) {
        for (var j = 0u; j < cols * rows; j = j + 1u) {
            if (j == i) { continue; }
            sum = sum + sin(theta[j] - t);
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
                sum = sum + sin(theta[j] - t);
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
        for (var j = 0u; j < cols * rows; j = j + 1u) {
            if (j == i) { continue; }
            sum = sum + sin(theta[j] - t);
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
                sum = sum + sin(theta[j] - t);
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
        for (var j = 0u; j < cols * rows; j = j + 1u) {
            if (j == i) { continue; }
            sum = sum + sin(theta[j] - t);
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
                sum = sum + sin(theta[j] - t);
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
        for (var j = 0u; j < cols * rows; j = j + 1u) {
            if (j == i) { continue; }
            let d = theta[j] - t;
            s1 = s1 + sin(d);
            s2 = s2 + sin(2.0 * d);
            s3 = s3 + sin(3.0 * d);
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
                let d = theta[j] - t;
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
            let dist = sqrt(f32(dr * dr + dc * dc));
            let w = mexhat_weight(dist);
            sum = sum + w * sin(theta[j] - t);
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
    let t = theta[i];
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
    theta[i] = newTheta;
}
`;

export const RENDER_SHADER = `
struct Params {
    dt: f32, K0: f32, range: f32, rule_mode: f32,
    cols: f32, rows: f32, harmonic_a: f32, global_coupling: f32,
    delay_steps: f32, sigma: f32, sigma2: f32, beta: f32,
    show_order: f32, colormap: f32, noise_strength: f32, time: f32,
    harmonic_b: f32, view_mode: f32, pad2: f32, pad3: f32,
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
