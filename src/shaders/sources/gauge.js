/**
 * Gauge shader source exports.
 * Auto-partitioned from legacy monolithic shaders.js for maintainability.
 */

export const GAUGE_UPDATE_SHADER = `
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

@group(0) @binding(0) var theta_in: texture_2d_array<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<uniform> gauge_params: GaugeParams;
@group(0) @binding(3) var gauge_x_in: texture_2d_array<f32>;
@group(0) @binding(4) var gauge_y_in: texture_2d_array<f32>;
@group(0) @binding(5) var gauge_x_out: texture_storage_2d_array<r32float, write>;
@group(0) @binding(6) var gauge_y_out: texture_storage_2d_array<r32float, write>;

fn wrap_pi(v: f32) -> f32 {
    var x = v;
    let two_pi = 6.28318530718;
    while (x <= -3.14159265359) { x = x + two_pi; }
    while (x > 3.14159265359) { x = x - two_pi; }
    return x;
}

fn hash11(n: u32) -> f32 {
    var x = (n ^ 61u) ^ (n >> 16u);
    x = x + (x << 3u);
    x = x ^ (x >> 4u);
    x = x * 0x27d4eb2du;
    x = x ^ (x >> 15u);
    return f32(x) / 4294967296.0;
}

fn loadTheta(c: i32, r: i32, layer: i32, cols: i32, rows: i32) -> f32 {
    var x = c % cols;
    var y = r % rows;
    if (x < 0) { x = x + cols; }
    if (y < 0) { y = y + rows; }
    return textureLoad(theta_in, vec2<i32>(x, y), layer, 0).r;
}

fn loadAx(c: i32, r: i32, layer: i32, cols: i32, rows: i32) -> f32 {
    var x = c % cols;
    var y = r % rows;
    if (x < 0) { x = x + cols; }
    if (y < 0) { y = y + rows; }
    return textureLoad(gauge_x_in, vec2<i32>(x, y), layer, 0).r;
}

fn loadAy(c: i32, r: i32, layer: i32, cols: i32, rows: i32) -> f32 {
    var x = c % cols;
    var y = r % rows;
    if (x < 0) { x = x + cols; }
    if (y < 0) { y = y + rows; }
    return textureLoad(gauge_y_in, vec2<i32>(x, y), layer, 0).r;
}

fn plaquette(c: i32, r: i32, layer: i32, cols: i32, rows: i32) -> f32 {
    let ax = loadAx(c, r, layer, cols, rows);
    let ay_right = loadAy(c + 1, r, layer, cols, rows);
    let ax_up = loadAx(c, r + 1, layer, cols, rows);
    let ay = loadAy(c, r, layer, cols, rows);
    return wrap_pi(ax + ay_right - ax_up - ay);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>,
        @builtin(workgroup_id) wg_id: vec3<u32>) {
    let cols = i32(params.cols);
    let rows = i32(params.rows);
    let layer = i32(wg_id.z);
    if (layer >= i32(params.layer_count)) { return; }
    if (i32(id.x) >= cols || i32(id.y) >= rows) { return; }

    let c = i32(id.x);
    let r = i32(id.y);
    let ax = loadAx(c, r, layer, cols, rows);
    let ay = loadAy(c, r, layer, cols, rows);

    if (gauge_params.enabled < 0.5 || gauge_params.mode_dynamic < 0.5 || params.topology_mode > 0.5) {
        textureStore(gauge_x_out, vec2<i32>(c, r), layer, vec4<f32>(ax, 0.0, 0.0, 1.0));
        textureStore(gauge_y_out, vec2<i32>(c, r), layer, vec4<f32>(ay, 0.0, 0.0, 1.0));
        return;
    }

    let th = loadTheta(c, r, layer, cols, rows);
    let th_right = loadTheta(c + 1, r, layer, cols, rows);
    let th_up = loadTheta(c, r + 1, layer, cols, rows);
    let q = gauge_params.charge;

    let jx = sin(th_right - th - q * ax);
    let jy = sin(th_up - th - q * ay);

    let f_here = plaquette(c, r, layer, cols, rows);
    let f_down = plaquette(c, r - 1, layer, cols, rows);
    let f_left = plaquette(c - 1, r, layer, cols, rows);

    let dE_dAx = sin(f_here) - sin(f_down);
    let dE_dAy = -sin(f_here) + sin(f_left);

    let dt = params.dt * gauge_params.dt_scale;
    let noiseScale = gauge_params.noise;
    let seedBase = u32(layer * cols * rows + r * cols + c) + u32(params.time * 1000.0);
    let noiseX = (hash11(seedBase * 17u + 3u) * 2.0 - 1.0) * noiseScale;
    let noiseY = (hash11(seedBase * 31u + 7u) * 2.0 - 1.0) * noiseScale;

    let dax = gauge_params.matter_coupling * jx
        - gauge_params.stiffness * dE_dAx
        - gauge_params.damping * ax
        + noiseX;
    let day = gauge_params.matter_coupling * jy
        - gauge_params.stiffness * dE_dAy
        - gauge_params.damping * ay
        + noiseY;

    let ax_next = wrap_pi(ax + dt * dax);
    let ay_next = wrap_pi(ay + dt * day);

    textureStore(gauge_x_out, vec2<i32>(c, r), layer, vec4<f32>(ax_next, 0.0, 0.0, 1.0));
    textureStore(gauge_y_out, vec2<i32>(c, r), layer, vec4<f32>(ay_next, 0.0, 0.0, 1.0));
}
`;
