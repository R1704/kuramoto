const CORE_SLIDER_KEYS = [
    ['k0-slider', 'K0', 1.0],
    ['range-slider', 'range', 2],
    ['dt-slider', 'dt', 0.03],
    ['harmonic-slider', 'harmonicA', 0.4],
    ['harmonic3-slider', 'harmonicB', 0.0],
    ['sigma-slider', 'sigma', 1.2],
    ['sigma2-slider', 'sigma2', 1.2],
    ['beta-slider', 'beta', 0.6],
    ['delay-slider', 'delaySteps', 10],
    ['noise-slider', 'noiseStrength', 0.0],
    ['leak-slider', 'leak', 0.0],
    ['gauge-charge-slider', 'gaugeCharge', 1.0],
    ['gauge-matter-coupling-slider', 'gaugeMatterCoupling', 1.0],
    ['gauge-stiffness-slider', 'gaugeStiffness', 0.2],
    ['gauge-damping-slider', 'gaugeDamping', 0.05],
    ['gauge-noise-slider', 'gaugeNoise', 0.0],
    ['gauge-dt-scale-slider', 'gaugeDtScale', 1.0],
    ['gauge-init-amplitude-slider', 'gaugeInitAmplitude', 0.5],
    ['gauge-flux-bias-slider', 'gaugeFluxBias', 0.0],
    ['phase-lag-eta-slider', 'phaseLagEta', 0.0],
    ['prismatic-k-slider', 'prismaticK', 0.1],
    ['prismatic-friction-slider', 'prismaticFriction', 0.92],
    ['prismatic-energy-decay-slider', 'prismaticEnergyDecay', 0.88],
    ['prismatic-energy-mix-slider', 'prismaticEnergyMix', 0.12],
    ['prismatic-drag-radius-px-slider', 'prismaticDragRadiusPx', 120],
    ['prismatic-drag-peak-force-slider', 'prismaticDragPeakForce', 4.0],
    ['prismatic-target-phase-slider', 'prismaticTargetPhase', 0.0],
    ['prismatic-trail-fade-slider', 'prismaticTrailFade', 0.15],
    ['prismatic-glow-scale-slider', 'prismaticGlowScale', 50],
    ['prismatic-core-threshold-slider', 'prismaticCoreThreshold', 0.4],
    ['prismatic-core-scale-slider', 'prismaticCoreScale', 0.3],
    ['prismatic-style-blend-slider', 'prismaticStyleBlend', 1.0],
    ['interaction-force-falloff-slider', 'interactionForceFalloff', 1.0],
    ['viz-flux-gain-slider', 'vizFluxGain', 1.0],
    ['viz-cov-grad-gain-slider', 'vizCovGradGain', 1.0],
    ['audio-empyrean-master-slider', 'audioEmpyreanMaster', 0.55],
    ['audio-empyrean-bells-slider', 'audioEmpyreanBells', 0.45],
    ['audio-empyrean-bass-slider', 'audioEmpyreanBass', 0.5],
    ['audio-empyrean-reverb-mix-slider', 'audioEmpyreanReverbMix', 0.45],
    ['audio-empyrean-reverb-time-slider', 'audioEmpyreanReverbTime', 8.0],
    ['layer-coupling-up-slider', 'layerCouplingUp', 0.0],
    ['layer-coupling-down-slider', 'layerCouplingDown', 0.0],
    ['omega-amplitude-slider', 'omegaAmplitude', 0.4]
];

export function updateCoreSliderSection(state, updateOne) {
    for (const [id, key, fallback] of CORE_SLIDER_KEYS) {
        updateOne(id, state[key] ?? fallback);
    }
}

export function updateTopologySection({ state, getEl }) {
    const topoSelect = getEl('topology-select');
    if (topoSelect) topoSelect.value = state.topologyMode || 'grid';
    const isWS = state.topologyMode === 'ws' || state.topologyMode === 'watts_strogatz';
    const isBA = state.topologyMode === 'ba' || state.topologyMode === 'barabasi_albert';
    const wsControls = getEl('ws-controls');
    if (wsControls) wsControls.style.display = isWS ? 'block' : 'none';
    const baControls = getEl('ba-controls');
    if (baControls) baControls.style.display = isBA ? 'block' : 'none';
}
