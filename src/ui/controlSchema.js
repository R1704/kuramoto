/**
 * Canonical UI control mapping used for both binding and display sync.
 * Keep this list aligned with index.html control IDs and state keys.
 */
const CORE_CONTROL_SCHEMA_RAW = [
    { id: 'k0-slider', key: 'K0', type: 'float', fallback: 1.0 },
    { id: 'range-slider', key: 'range', type: 'int', fallback: 2 },
    { id: 'dt-slider', key: 'dt', type: 'float', fallback: 0.03 },
    { id: 'harmonic-slider', key: 'harmonicA', type: 'float', fallback: 0.4 },
    { id: 'harmonic3-slider', key: 'harmonicB', type: 'float', fallback: 0.0 },
    { id: 'sigma-slider', key: 'sigma', type: 'float', fallback: 1.2 },
    { id: 'sigma2-slider', key: 'sigma2', type: 'float', fallback: 1.2 },
    { id: 'beta-slider', key: 'beta', type: 'float', fallback: 0.6 },
    { id: 'delay-slider', key: 'delaySteps', type: 'int', fallback: 10 },
    { id: 'noise-slider', key: 'noiseStrength', type: 'float', fallback: 0.0 },
    { id: 'leak-slider', key: 'leak', type: 'float', fallback: 0.0 },
    { id: 'omega-amplitude-slider', key: 'omegaAmplitude', type: 'float', fallback: 0.4 },
    { id: 'gauge-charge-slider', key: 'gaugeCharge', type: 'float', fallback: 1.0 },
    { id: 'gauge-matter-coupling-slider', key: 'gaugeMatterCoupling', type: 'float', fallback: 1.0 },
    { id: 'gauge-stiffness-slider', key: 'gaugeStiffness', type: 'float', fallback: 0.2 },
    { id: 'gauge-damping-slider', key: 'gaugeDamping', type: 'float', fallback: 0.05 },
    { id: 'gauge-noise-slider', key: 'gaugeNoise', type: 'float', fallback: 0.0 },
    { id: 'gauge-dt-scale-slider', key: 'gaugeDtScale', type: 'float', fallback: 1.0 },
    { id: 'gauge-init-amplitude-slider', key: 'gaugeInitAmplitude', type: 'float', fallback: 0.5 },
    { id: 'gauge-flux-bias-slider', key: 'gaugeFluxBias', type: 'float', fallback: 0.0 },
    { id: 'phase-lag-eta-slider', key: 'phaseLagEta', type: 'float', fallback: 0.0 },
    { id: 'prismatic-k-slider', key: 'prismaticK', type: 'float', fallback: 0.1 },
    { id: 'prismatic-friction-slider', key: 'prismaticFriction', type: 'float', fallback: 0.92 },
    { id: 'prismatic-energy-decay-slider', key: 'prismaticEnergyDecay', type: 'float', fallback: 0.88 },
    { id: 'prismatic-energy-mix-slider', key: 'prismaticEnergyMix', type: 'float', fallback: 0.12 },
    { id: 'prismatic-drag-radius-px-slider', key: 'prismaticDragRadiusPx', type: 'int', fallback: 120 },
    { id: 'prismatic-drag-peak-force-slider', key: 'prismaticDragPeakForce', type: 'float', fallback: 4.0 },
    { id: 'prismatic-target-phase-slider', key: 'prismaticTargetPhase', type: 'float', fallback: 0.0 },
    { id: 'prismatic-trail-fade-slider', key: 'prismaticTrailFade', type: 'float', fallback: 0.15 },
    { id: 'prismatic-glow-scale-slider', key: 'prismaticGlowScale', type: 'int', fallback: 50 },
    { id: 'prismatic-core-threshold-slider', key: 'prismaticCoreThreshold', type: 'float', fallback: 0.4 },
    { id: 'prismatic-core-scale-slider', key: 'prismaticCoreScale', type: 'float', fallback: 0.3 },
    { id: 'prismatic-style-blend-slider', key: 'prismaticStyleBlend', type: 'float', fallback: 1.0 },
    { id: 'interaction-force-falloff-slider', key: 'interactionForceFalloff', type: 'float', fallback: 1.0 },
    { id: 'viz-flux-gain-slider', key: 'vizFluxGain', type: 'float', fallback: 1.0 },
    { id: 'viz-cov-grad-gain-slider', key: 'vizCovGradGain', type: 'float', fallback: 1.0 },
    { id: 'audio-empyrean-master-slider', key: 'audioEmpyreanMaster', type: 'float', fallback: 0.55 },
    { id: 'audio-empyrean-bells-slider', key: 'audioEmpyreanBells', type: 'float', fallback: 0.45 },
    { id: 'audio-empyrean-bass-slider', key: 'audioEmpyreanBass', type: 'float', fallback: 0.5 },
    { id: 'audio-empyrean-reverb-mix-slider', key: 'audioEmpyreanReverbMix', type: 'float', fallback: 0.45 },
    { id: 'audio-empyrean-reverb-time-slider', key: 'audioEmpyreanReverbTime', type: 'float', fallback: 8.0 },
    { id: 'layer-coupling-up-slider', key: 'layerCouplingUp', type: 'float', fallback: 0.0 },
    { id: 'layer-coupling-down-slider', key: 'layerCouplingDown', type: 'float', fallback: 0.0 },
    { id: 'layer-z-offset-slider', key: 'layerZOffset', type: 'float', fallback: 0.15 },
];

const S1_ONLY_CONTROL_IDS = new Set([
    'gauge-charge-slider',
    'gauge-matter-coupling-slider',
    'gauge-stiffness-slider',
    'gauge-damping-slider',
    'gauge-noise-slider',
    'gauge-dt-scale-slider',
    'gauge-init-amplitude-slider',
    'gauge-flux-bias-slider',
    'phase-lag-eta-slider',
    'prismatic-style-blend-slider',
    'prismatic-trail-fade-slider',
    'prismatic-glow-scale-slider',
    'prismatic-core-threshold-slider',
    'prismatic-core-scale-slider',
    'viz-flux-gain-slider',
    'viz-cov-grad-gain-slider'
]);

const S1_GRID_ONLY_CONTROL_IDS = new Set([
    'prismatic-k-slider',
    'prismatic-friction-slider',
    'prismatic-energy-decay-slider',
    'prismatic-energy-mix-slider',
    'prismatic-drag-radius-px-slider',
    'prismatic-drag-peak-force-slider',
    'prismatic-target-phase-slider',
    'interaction-force-falloff-slider',
    'audio-empyrean-master-slider',
    'audio-empyrean-bells-slider',
    'audio-empyrean-bass-slider',
    'audio-empyrean-reverb-mix-slider',
    'audio-empyrean-reverb-time-slider'
]);

export const CORE_CONTROL_SCHEMA = CORE_CONTROL_SCHEMA_RAW.map((control) => {
    const format = (control.type || 'float') === 'int' ? 'int' : 'float2';
    const gating = S1_GRID_ONLY_CONTROL_IDS.has(control.id)
        ? 's1_grid_only'
        : (S1_ONLY_CONTROL_IDS.has(control.id) ? 's1_only' : 'always');
    return { ...control, format, gating };
});

export function formatControlValue(control, value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${value}`;
    if ((control?.format || 'float2') === 'int') return `${Math.round(value)}`;
    return value.toFixed(2);
}
