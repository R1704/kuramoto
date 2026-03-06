/**
 * Prismatic shader source exports.
 * Auto-partitioned from legacy monolithic shaders.js for maintainability.
 */

export const PRISMATIC_METRICS_REDUCTION_SHADER = `
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
@group(0) @binding(1) var prismatic_tex: texture_2d_array<f32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read_write> metrics_atomic: array<atomic<u32>, 20>;
@group(0) @binding(4) var<storage, read> order: array<f32>;
@group(0) @binding(5) var<uniform> interaction_params: InteractionParams;

fn wrap_phase(theta: f32) -> f32 {
    var x = theta - floor(theta / 6.28318530718) * 6.28318530718;
    if (x < 0.0) { x = x + 6.28318530718; }
    return x;
}

fn wrap_diff(theta_b: f32, theta_a: f32) -> f32 {
    var d = theta_b - theta_a;
    if (d > 3.14159265359) { d = d - 6.28318530718; }
    if (d < -3.14159265359) { d = d + 6.28318530718; }
    return d;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let cols = u32(params.cols);
    let rows = u32(params.rows);
    let layers = max(1u, u32(params.layer_count));
    if (gid.x >= cols || gid.y >= rows || gid.z >= layers) { return; }
    if (params.manifold_mode > 0.5) { return; }
    let active_layer = min(layers - 1u, u32(params.active_layer + 0.5));
    if (gid.z != active_layer) { return; }

    let theta = textureLoad(theta_tex, vec2<i32>(i32(gid.x), i32(gid.y)), i32(gid.z), 0).r;
    let pr = textureLoad(prismatic_tex, vec2<i32>(i32(gid.x), i32(gid.y)), i32(gid.z), 0).rg;
    let phase = wrap_phase(theta);
    let bin = min(7u, u32(floor((phase / 6.28318530718) * 8.0)));
    let xp = (gid.x + 1u) % cols;
    let yp = (gid.y + 1u) % rows;
    let theta_r = textureLoad(theta_tex, vec2<i32>(i32(xp), i32(gid.y)), i32(gid.z), 0).r;
    let theta_u = textureLoad(theta_tex, vec2<i32>(i32(gid.x), i32(yp)), i32(gid.z), 0).r;
    let grad_e = clamp(abs(wrap_diff(theta_r, theta)) + abs(wrap_diff(theta_u, theta)), 0.0, 6.28318530718) * 0.15915494309;
    let idx = gid.z * cols * rows + gid.y * cols + gid.x;
    let order_val = clamp(order[idx], 0.0, 1.0);
    let layer_choice = i32(params.colormap + 0.5);
    var mass = grad_e;
    if (layer_choice == 3) {
        mass = order_val;
    }
    if (layer_choice == 9 && interaction_params.prismatic_style_enabled > 0.5) {
        mass = select(max(max(0.0, pr.y), grad_e), max(0.0, pr.y), interaction_params.prismatic_dynamics_enabled > 0.5);
    }
    mass = clamp(mass, 0.0, 1.0);
    let mass_scaled = u32(clamp(mass * 10000.0, 0.0, 4294967000.0));
    let xnorm = (f32(gid.x) + 0.5) / max(1.0, params.cols);
    let pan = xnorm * 2.0 - 1.0;
    let xmass_scaled = u32(clamp(mass * (pan + 1.0) * 5000.0, 0.0, 4294967000.0));
    atomicAdd(&metrics_atomic[bin], mass_scaled);
    atomicAdd(&metrics_atomic[8u + bin], xmass_scaled);
    atomicAdd(&metrics_atomic[16u], mass_scaled);
    atomicAdd(&metrics_atomic[17u], u32(clamp(grad_e * 10000.0, 0.0, 4294967000.0)));
    atomicAdd(&metrics_atomic[18u], u32(clamp(order_val * 10000.0, 0.0, 4294967000.0)));
    atomicAdd(&metrics_atomic[19u], 10000u);
}
`;

export const PRISMATIC_METRICS_NORMALIZE_SHADER = `
@group(0) @binding(0) var<storage, read_write> metrics_atomic: array<atomic<u32>, 20>;
@group(0) @binding(1) var<storage, read_write> metrics_out: array<f32, 20>;

@compute @workgroup_size(1)
fn main() {
    let total_mass = max(1e-6, f32(atomicLoad(&metrics_atomic[16u])) / 10000.0);
    let grad_sum = f32(atomicLoad(&metrics_atomic[17u])) / 10000.0;
    let order_sum = f32(atomicLoad(&metrics_atomic[18u])) / 10000.0;
    let sample_count = max(1e-6, f32(atomicLoad(&metrics_atomic[19u])) / 10000.0);

    for (var i = 0u; i < 8u; i = i + 1u) {
        let mass = f32(atomicLoad(&metrics_atomic[i])) / 10000.0;
        let xmass = f32(atomicLoad(&metrics_atomic[8u + i])) / 5000.0;
        metrics_out[i] = clamp(mass / total_mass, 0.0, 1.0);
        let pan01 = select(0.5, xmass / mass, mass > 1e-6);
        metrics_out[8u + i] = clamp(pan01 * 2.0 - 1.0, -1.0, 1.0);
    }
    let intensity = clamp(total_mass / sample_count, 0.0, 1.0);
    let grad_mean = clamp(grad_sum / sample_count, 0.0, 1.0);
    let order_mean = clamp(order_sum / sample_count, 0.0, 1.0);
    metrics_out[16u] = intensity;
    metrics_out[17u] = clamp(1.0 - grad_mean, 0.0, 1.0);
    metrics_out[18u] = grad_mean;
    metrics_out[19u] = order_mean;
}
`;
