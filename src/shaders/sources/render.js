/**
 * Render shader source exports.
 * Auto-partitioned from legacy monolithic shaders.js for maintainability.
 */

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
@group(0) @binding(0) var theta_tex: texture_2d_array<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<uniform> viewProj: mat4x4<f32>;
@group(0) @binding(3) var<storage, read> order: array<f32>;
@group(0) @binding(4) var textureSampler: sampler;
@group(0) @binding(5) var externalTexture: texture_2d<f32>;
@group(0) @binding(6) var<uniform> render_layer: vec4<f32>;
@group(0) @binding(7) var gauge_x_tex: texture_2d_array<f32>;
@group(0) @binding(8) var gauge_y_tex: texture_2d_array<f32>;
@group(0) @binding(9) var<uniform> gauge_params: GaugeParams;
@group(0) @binding(10) var<uniform> interaction_params: InteractionParams;
@group(0) @binding(11) var prismatic_state_tex: texture_2d_array<f32>;

// Helper to load theta from texture
fn loadThetaRender(col: u32, row: u32, layer: u32) -> f32 {
    return textureLoad(theta_tex, vec2<i32>(i32(col), i32(row)), i32(layer), 0).r;
}

fn loadVecRender(col: u32, row: u32, layer: u32) -> vec3<f32> {
    return textureLoad(theta_tex, vec2<i32>(i32(col), i32(row)), i32(layer), 0).xyz;
}

fn loadQuatRender(col: u32, row: u32, layer: u32) -> vec4<f32> {
    return textureLoad(theta_tex, vec2<i32>(i32(col), i32(row)), i32(layer), 0);
}

fn loadGaugeXRender(col: i32, row: i32, layer: u32, cols: i32, rows: i32) -> f32 {
    let c = (col + cols) % cols;
    let r = (row + rows) % rows;
    return textureLoad(gauge_x_tex, vec2<i32>(c, r), i32(layer), 0).r;
}

fn loadGaugeYRender(col: i32, row: i32, layer: u32, cols: i32, rows: i32) -> f32 {
    let c = (col + cols) % cols;
    let r = (row + rows) % rows;
    return textureLoad(gauge_y_tex, vec2<i32>(c, r), i32(layer), 0).r;
}

fn loadPrismaticRender(col: i32, row: i32, layer: u32, cols: i32, rows: i32) -> vec2<f32> {
    let c = (col + cols) % cols;
    let r = (row + rows) % rows;
    return textureLoad(prismatic_state_tex, vec2<i32>(c, r), i32(layer), 0).rg;
}

fn wrapPhaseDiff(d: f32) -> f32 {
    var x = d;
    if (x > 3.14159) { x = x - 6.28318; }
    if (x < -3.14159) { x = x + 6.28318; }
    return x;
}

fn compute_gradient(ii: u32, cols: u32, rows: u32, layer: u32) -> f32 {
    let c = ii % cols;
    let r = ii / cols;

    var cr = (c + 1u) % cols;
    var cl = (c + cols - 1u) % cols;
    var ru = (r + 1u) % rows;
    var rd = (r + rows - 1u) % rows;

    if (params.manifold_mode > 0.5) {
        // S² or S³: compute angular distance gradient
        let v_center = loadVecRender(c, r, layer);
        let v_right = loadVecRender(cr, r, layer);
        let v_left = loadVecRender(cl, r, layer);
        let v_up = loadVecRender(c, ru, layer);
        let v_down = loadVecRender(c, rd, layer);

        // Angular distance = 1 - dot(v1, v2) gives 0 for aligned, 2 for opposite
        let dx = (1.0 - dot(v_center, v_left)) + (1.0 - dot(v_center, v_right));
        let dy = (1.0 - dot(v_center, v_up)) + (1.0 - dot(v_center, v_down));

        // Normalize: max value per direction is 4, so /4 gives [0,1]
        return sqrt(dx * dx + dy * dy) * 0.25;
    }

    // S¹: compute phase gradient
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
    let vec_val = loadVecRender(u32(c_i), u32(r_i), active_layer);
    let quat_val = loadQuatRender(u32(c_i), u32(r_i), active_layer);
    let use_s2 = params.manifold_mode > 0.5 && params.manifold_mode < 1.5;
    let use_s3 = params.manifold_mode > 1.5;
    // S¹: sin(θ), S²: z component, S³: w component
    var height_3d = sin(theta_val) * 2.0;
    if (use_s2) { height_3d = vec_val.z * 2.0; }
    if (use_s3) { height_3d = quat_val.w * 2.0; }
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

fn hsv_to_rgb(h: f32, s: f32, v: f32) -> vec3<f32> {
    let k = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p = abs(fract(vec3<f32>(h, h, h) + k.xyz) * 6.0 - vec3<f32>(k.w, k.w, k.w));
    return v * mix(vec3<f32>(k.x, k.x, k.x), clamp(p - vec3<f32>(k.x, k.x, k.x), vec3<f32>(0.0), vec3<f32>(1.0)), s);
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
    let v = textureLoad(theta_tex, vec2<i32>(c, r), i32(active_layer), 0).xyz;
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
    let ax = loadGaugeXRender(c, r, active_layer, cols, rows);
    let ay = loadGaugeYRender(c, r, active_layer, cols, rows);
    let ax_left = loadGaugeXRender(c - 1, r, active_layer, cols, rows);
    let ay_down = loadGaugeYRender(c, r - 1, active_layer, cols, rows);
    let ay_right = loadGaugeYRender(c + 1, r, active_layer, cols, rows);
    let ax_up = loadGaugeXRender(c, r + 1, active_layer, cols, rows);
    let q = gauge_params.charge;
    let cov_dx_f = wrapPhaseDiff(right - theta - q * ax);
    let cov_dx_b = wrapPhaseDiff(theta - left - q * ax_left);
    let cov_dy_f = wrapPhaseDiff(up - theta - q * ay);
    let cov_dy_b = wrapPhaseDiff(theta - down - q * ay_down);
    let cov_grad = sqrt((cov_dx_f + cov_dx_b) * (cov_dx_f + cov_dx_b) + (cov_dy_f + cov_dy_b) * (cov_dy_f + cov_dy_b)) * 0.25;
    let flux_raw = ax + ay_right - ax_up - ay;
    let use_auto_norm = gauge_params.viz_auto_normalize > 0.5;
    let flux_scale = max(1e-4, max(abs(flux_raw), max(abs(ax), max(abs(ay), max(abs(ax_left), max(abs(ay_down), max(abs(ay_right), abs(ax_up))))))));
    let flux_base = select(flux_raw / 3.14159, flux_raw / flux_scale, use_auto_norm);
    let flux_vis = clamp(flux_base * max(0.01, gauge_params.viz_flux_gain), -1.0, 1.0);
    let flux_unsigned = clamp(abs(flux_vis), 0.0, 1.0);
    let flux_signed = clamp(0.5 + 0.5 * flux_vis, 0.0, 1.0);
    let flux_norm = select(flux_unsigned, flux_signed, gauge_params.viz_signed_flux > 0.5);
    let cov_scale = max(
        1e-4,
        max(abs(cov_dx_f), max(abs(cov_dx_b), max(abs(cov_dy_f), abs(cov_dy_b))))
    );
    let cov_base = select(cov_grad / 3.14159, cov_grad / cov_scale, use_auto_norm);
    let cov_norm = clamp(cov_base * max(0.01, gauge_params.viz_cov_grad_gain), 0.0, 1.0);
    let tr = textureLoad(theta_tex, vec2<i32>((c + 1) % cols, (r + 1) % rows), i32(active_layer), 0).r;
    let tl = textureLoad(theta_tex, vec2<i32>((c + cols - 1) % cols, (r + 1) % rows), i32(active_layer), 0).r;
    let br = textureLoad(theta_tex, vec2<i32>((c + 1) % cols, (r + rows - 1) % rows), i32(active_layer), 0).r;
    let bl = textureLoad(theta_tex, vec2<i32>((c + cols - 1) % cols, (r + rows - 1) % rows), i32(active_layer), 0).r;
    var curl = (tr - tl - br + bl) * 0.25;
    if (curl > 3.14159) { curl -= 6.28318; }
    if (curl < -3.14159) { curl += 6.28318; }
    let chirality_norm = clamp(0.5 + 0.5 * clamp(curl * 5.0, -1.0, 1.0), 0.0, 1.0);

    let height = sin(theta) * 2.0;
    let t_phase = clamp((height / 2.0 + 1.0) * 0.5, 0.0, 1.0);
    let t_vec = clamp((v + vec3<f32>(1.0, 1.0, 1.0)) * 0.5, vec3<f32>(0.0), vec3<f32>(1.0));

    let layer_choice = i32(params.colormap);
    let palette = i32(params.colormap_palette);
    var color: vec3<f32>;

    if (layer_choice == 0) {
        color = select(sample_palette(t_phase, palette), t_vec, params.manifold_mode > 0.5);
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
    } else if (layer_choice == 7) {
        color = sample_palette(flux_norm, palette);
    } else if (layer_choice == 8) {
        color = sample_palette(cov_norm, palette);
    } else if (layer_choice == 9) {
        let mode = i32(interaction_params.prismatic_style_base_mode + 0.5);
        var base_scalar = select(t_phase, order_val, mode == 2);
        if (mode == 0) {
            base_scalar = clamp(0.55 * t_phase + 0.45 * clamp(gradient * 1.6, 0.0, 1.0), 0.0, 1.0);
        }
        let base_color = sample_palette(base_scalar, palette);
        if (interaction_params.prismatic_style_enabled < 0.5) {
            color = base_color;
        } else {
            let qc = c;
            let qr = r;
            let cell_theta = textureLoad(theta_tex, vec2<i32>(qc, qr), i32(active_layer), 0).r;
            let pr = loadPrismaticRender(qc, qr, active_layer, cols, rows);
            let e_dyn = max(0.0, pr.y);
            let e = select(clamp(gradient * 1.8, 0.0, 1.0), e_dyn, interaction_params.prismatic_dynamics_enabled > 0.5);
            let hue = fract(cell_theta / 6.28318530718);
            let cell_ux = (f32(qc) + 0.5) / params.cols;
            let cell_vy = (f32(qr) + 0.5) / params.rows;
            let dxp = abs(uv.x - cell_ux) * params.cols;
            let dyp = abs(uv.y - cell_vy) * params.rows;
            let dist_cell = sqrt(dxp * dxp + dyp * dyp);
            let radius = max(1.0, e * interaction_params.prismatic_glow_scale);
            let w = clamp(1.0 - dist_cell / radius, 0.0, 1.0);
            var base = hsv_to_rgb(hue, 0.8, 0.9);
            base = base * (0.15 + 0.85 * w);
            if (e > interaction_params.prismatic_core_threshold) {
                let core_radius = radius * max(0.05, interaction_params.prismatic_core_scale);
                let core = clamp(1.0 - dist_cell / max(0.001, core_radius), 0.0, 1.0);
                base = mix(base, vec3<f32>(1.0, 1.0, 1.0), core * 0.7);
            }
            let style = clamp(base, vec3<f32>(0.0), vec3<f32>(1.0));
            let blend = clamp(interaction_params.prismatic_style_blend, 0.0, 1.0);
            color = mix(base_color, style, blend);
        }
    } else {
        color = select(sample_palette(t_phase, palette), t_vec, params.manifold_mode > 0.5);
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

@group(0) @binding(0) var theta_tex: texture_2d_array<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> order: array<f32>;
@group(0) @binding(3) var textureSampler: sampler;
@group(0) @binding(4) var externalTexture: texture_2d<f32>;
@group(0) @binding(5) var gauge_x_tex_2d: texture_2d_array<f32>;
@group(0) @binding(6) var gauge_y_tex_2d: texture_2d_array<f32>;
@group(0) @binding(7) var<uniform> gauge_params_2d: GaugeParams;
@group(0) @binding(8) var<uniform> interaction_params_2d: InteractionParams;
@group(0) @binding(9) var prismatic_state_tex_2d: texture_2d_array<f32>;

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

fn sample_vec_nearest(uv: vec2<f32>, cols: f32, rows: f32, layer: u32) -> vec3<f32> {
    let gx = clamp(uv.x, 0.0, 0.9999) * cols;
    let gy = clamp(uv.y, 0.0, 0.9999) * rows;
    let x = clamp(i32(gx), 0, i32(cols) - 1);
    let y = clamp(i32(gy), 0, i32(rows) - 1);
    return textureLoad(theta_tex, vec2<i32>(x, y), i32(layer), 0).xyz;
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

fn sample_gauge_x_wrapped(x: i32, y: i32, cols: i32, rows: i32, layer: u32) -> f32 {
    let xw = ((x % cols) + cols) % cols;
    let yw = ((y % rows) + rows) % rows;
    return textureLoad(gauge_x_tex_2d, vec2<i32>(xw, yw), i32(layer), 0).r;
}

fn sample_gauge_y_wrapped(x: i32, y: i32, cols: i32, rows: i32, layer: u32) -> f32 {
    let xw = ((x % cols) + cols) % cols;
    let yw = ((y % rows) + rows) % rows;
    return textureLoad(gauge_y_tex_2d, vec2<i32>(xw, yw), i32(layer), 0).r;
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

fn hsv_to_rgb_2d(h: f32, s: f32, v: f32) -> vec3<f32> {
    let k = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p = abs(fract(vec3<f32>(h, h, h) + k.xyz) * 6.0 - vec3<f32>(k.w, k.w, k.w));
    return v * mix(vec3<f32>(k.x, k.x, k.x), clamp(p - vec3<f32>(k.x, k.x, k.x), vec3<f32>(0.0), vec3<f32>(1.0)), s);
}

fn sample_prismatic_wrapped(col: i32, row: i32, cols: i32, rows: i32, layer: u32) -> vec2<f32> {
    let c = ((col % cols) + cols) % cols;
    let r = ((row % rows) + rows) % rows;
    return textureLoad(prismatic_state_tex_2d, vec2<i32>(c, r), i32(layer), 0).rg;
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
    
    let use_s2 = params.manifold_mode > 0.5;
    // Load theta value - use smoothing based on mode
    // smoothingMode: 0=nearest, 1=bilinear, 2=bicubic, 3=gaussian
    var theta: f32;
    if (params.smoothing_enabled > 0.5) {
        theta = sample_theta_smooth(uv, params.cols, params.rows, params.smoothing_mode, active_layer);
    } else {
        theta = textureLoad(theta_tex, vec2<i32>(c, r), i32(active_layer), 0).r;
    }
    let vec_val = sample_vec_nearest(uv, params.cols, params.rows, active_layer);
    
    // Load order parameter (no interpolation needed - it's already smooth)
    let idx = layer_stride * active_layer + u32(r) * u32(cols) + u32(c);
    let order_val = order[idx];
    
    // Compute gradient for velocity/curvature modes (use discrete samples for accuracy)
    var gradient: f32;
    var curl: f32;

    if (use_s2) {
        // S² or S³: compute angular distance gradient
        let v_center = vec_val;
        let v_right = textureLoad(theta_tex, vec2<i32>((c + 1) % cols, r), i32(active_layer), 0).xyz;
        let v_left = textureLoad(theta_tex, vec2<i32>((c + cols - 1) % cols, r), i32(active_layer), 0).xyz;
        let v_up = textureLoad(theta_tex, vec2<i32>(c, (r + 1) % rows), i32(active_layer), 0).xyz;
        let v_down = textureLoad(theta_tex, vec2<i32>(c, (r + rows - 1) % rows), i32(active_layer), 0).xyz;

        // Angular distance = 1 - dot(v1, v2) gives 0 for aligned, 2 for opposite
        let dx = (1.0 - dot(v_center, v_left)) + (1.0 - dot(v_center, v_right));
        let dy = (1.0 - dot(v_center, v_up)) + (1.0 - dot(v_center, v_down));
        gradient = sqrt(dx * dx + dy * dy) * 0.25;

        // Compute curl for S² using cross product z-component
        let v_tr = textureLoad(theta_tex, vec2<i32>((c + 1) % cols, (r + 1) % rows), i32(active_layer), 0).xyz;
        let v_tl = textureLoad(theta_tex, vec2<i32>((c + cols - 1) % cols, (r + 1) % rows), i32(active_layer), 0).xyz;
        let v_br = textureLoad(theta_tex, vec2<i32>((c + 1) % cols, (r + rows - 1) % rows), i32(active_layer), 0).xyz;
        let v_bl = textureLoad(theta_tex, vec2<i32>((c + cols - 1) % cols, (r + rows - 1) % rows), i32(active_layer), 0).xyz;
        // Curl approximated by cross product orientations
        let cross_tr = cross(v_center, v_tr).z;
        let cross_tl = cross(v_center, v_tl).z;
        let cross_br = cross(v_center, v_br).z;
        let cross_bl = cross(v_center, v_bl).z;
        curl = -(cross_tr - cross_tl - cross_br + cross_bl) * 0.25;
    } else {
        // S¹: compute phase gradient
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
        gradient = sqrt(dx * dx + dy * dy) * 0.5;

        // Compute chirality (curl) for spiral detection
        let tr = textureLoad(theta_tex, vec2<i32>((c + 1) % cols, (r + 1) % rows), i32(active_layer), 0).r;
        let tl = textureLoad(theta_tex, vec2<i32>((c + cols - 1) % cols, (r + 1) % rows), i32(active_layer), 0).r;
        let br = textureLoad(theta_tex, vec2<i32>((c + 1) % cols, (r + rows - 1) % rows), i32(active_layer), 0).r;
        let bl = textureLoad(theta_tex, vec2<i32>((c + cols - 1) % cols, (r + rows - 1) % rows), i32(active_layer), 0).r;

        curl = (tr - tl - br + bl) * 0.25;
        if (curl > 3.14159) { curl -= 6.28318; }
        if (curl < -3.14159) { curl += 6.28318; }
        // Negate curl to match 3D coordinate system (UV Y is inverted)
        curl = -curl;
    }
    
    // Use sin(theta) mapping to match 3D shader's height-based coloring
    let height = sin(theta) * 2.0;
    let t_height = clamp((height / 2.0 + 1.0) * 0.5, 0.0, 1.0);
    let t_vec = clamp((vec_val + vec3<f32>(1.0, 1.0, 1.0)) * 0.5, vec3<f32>(0.0), vec3<f32>(1.0));
    
    let layer_choice = i32(params.colormap);
    let palette = i32(params.colormap_palette);
    var col3: vec3<f32>;
    var out_alpha = 1.0;
    let ax = sample_gauge_x_wrapped(c, r, cols, rows, active_layer);
    let ay = sample_gauge_y_wrapped(c, r, cols, rows, active_layer);
    let ax_left = sample_gauge_x_wrapped(c - 1, r, cols, rows, active_layer);
    let ay_down = sample_gauge_y_wrapped(c, r - 1, cols, rows, active_layer);
    let ay_right = sample_gauge_y_wrapped(c + 1, r, cols, rows, active_layer);
    let ax_up = sample_gauge_x_wrapped(c, r + 1, cols, rows, active_layer);
    let right_phase = sample_theta_wrapped(c + 1, r, cols, rows, active_layer);
    let left_phase = sample_theta_wrapped(c - 1, r, cols, rows, active_layer);
    let up_phase = sample_theta_wrapped(c, r + 1, cols, rows, active_layer);
    let down_phase = sample_theta_wrapped(c, r - 1, cols, rows, active_layer);
    let q = gauge_params_2d.charge;
    let cov_dx_f = wrap_diff(right_phase - theta - q * ax);
    let cov_dx_b = wrap_diff(theta - left_phase - q * ax_left);
    let cov_dy_f = wrap_diff(up_phase - theta - q * ay);
    let cov_dy_b = wrap_diff(theta - down_phase - q * ay_down);
    let cov_grad = sqrt((cov_dx_f + cov_dx_b) * (cov_dx_f + cov_dx_b) + (cov_dy_f + cov_dy_b) * (cov_dy_f + cov_dy_b)) * 0.25;
    let flux_raw = ax + ay_right - ax_up - ay;
    let use_auto_norm = gauge_params_2d.viz_auto_normalize > 0.5;
    let flux_scale = max(1e-4, max(abs(flux_raw), max(abs(ax), max(abs(ay), max(abs(ax_left), max(abs(ay_down), max(abs(ay_right), abs(ax_up))))))));
    let flux_base = select(flux_raw / 3.14159, flux_raw / flux_scale, use_auto_norm);
    let flux_vis = clamp(flux_base * max(0.01, gauge_params_2d.viz_flux_gain), -1.0, 1.0);
    let flux_unsigned = clamp(abs(flux_vis), 0.0, 1.0);
    let flux_signed = clamp(0.5 + 0.5 * flux_vis, 0.0, 1.0);
    let flux_norm = select(flux_unsigned, flux_signed, gauge_params_2d.viz_signed_flux > 0.5);
    let cov_scale = max(
        1e-4,
        max(abs(cov_dx_f), max(abs(cov_dx_b), max(abs(cov_dy_f), abs(cov_dy_b))))
    );
    let cov_base = select(cov_grad / 3.14159, cov_grad / cov_scale, use_auto_norm);
    let cov_norm = clamp(cov_base * max(0.01, gauge_params_2d.viz_cov_grad_gain), 0.0, 1.0);

    if (layer_choice == 0) {
        // Phase
        col3 = select(sample_palette_2d(t_height, palette), t_vec, use_s2);
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
    } else if (layer_choice == 7) {
        // Gauge flux (plaquette)
        col3 = sample_palette_2d(flux_norm, palette);
    } else if (layer_choice == 8) {
        // Covariant gradient magnitude
        col3 = sample_palette_2d(cov_norm, palette);
    } else if (layer_choice == 9) {
        let mode = i32(interaction_params_2d.prismatic_style_base_mode + 0.5);
        var base_scalar = select(t_height, order_val, mode == 2);
        if (mode == 0) {
            base_scalar = clamp(0.55 * t_height + 0.45 * clamp(gradient * 1.6, 0.0, 1.0), 0.0, 1.0);
        }
        let base_color = sample_palette_2d(base_scalar, palette);
        if (interaction_params_2d.prismatic_style_enabled < 0.5) {
            col3 = base_color;
        } else {
            let cell_c = c;
            let cell_r = r;
            let cell_ux = (f32(cell_c) + 0.5) / params.cols;
            let cell_vy = (f32(cell_r) + 0.5) / params.rows;
            let cell_theta = sample_theta_wrapped(cell_c, cell_r, cols, rows, active_layer);
            let pr = sample_prismatic_wrapped(cell_c, cell_r, cols, rows, active_layer);
            let e_dyn = max(0.0, pr.y);
            let e = select(clamp(gradient * 1.8, 0.0, 1.0), e_dyn, interaction_params_2d.prismatic_dynamics_enabled > 0.5);

            let dxp = abs(uv.x - cell_ux) * params.cols;
            let dyp = abs(uv.y - cell_vy) * params.rows;
            let dist_cell = sqrt(dxp * dxp + dyp * dyp);
            let radius = max(1.0, e * interaction_params_2d.prismatic_glow_scale);
            let w = clamp(1.0 - dist_cell / radius, 0.0, 1.0);

            var base = hsv_to_rgb_2d(fract(cell_theta / 6.28318530718), 0.8, 0.9);
            base = base * (0.15 + 0.85 * w);
            if (e > interaction_params_2d.prismatic_core_threshold) {
                let core_radius = radius * max(0.05, interaction_params_2d.prismatic_core_scale);
                let core = clamp(1.0 - dist_cell / max(0.001, core_radius), 0.0, 1.0);
                base = mix(base, vec3<f32>(1.0, 1.0, 1.0), core * 0.7);
            }
            let splat_alpha = clamp(e * 0.4 * w, 0.0, 1.0);
            let fade_alpha = clamp(interaction_params_2d.prismatic_trail_fade, 0.0, 1.0);
            out_alpha = max(splat_alpha, fade_alpha);
            let style = clamp(base * splat_alpha / max(1e-5, out_alpha), vec3<f32>(0.0), vec3<f32>(1.0));
            let blend = clamp(interaction_params_2d.prismatic_style_blend, 0.0, 1.0);
            col3 = mix(base_color, style, blend);
        }
    } else {
        col3 = select(sample_palette_2d(t_height, palette), t_vec, use_s2);
    }
    
    // Apply order overlay if enabled
    if (params.show_order > 0.5) {
        let brightness = 0.3 + 0.7 * order_val;
        col3 = col3 * brightness;
    }
    
    return vec4<f32>(col3, out_alpha);
}
`;
