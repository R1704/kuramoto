function setDisabled(getEl, id, disabled) {
    const el = getEl(id);
    if (el) el.disabled = !!disabled;
}

export function applyGaugePrismaticAudioGating({ state, getEl }) {
    const gaugeMode = state.gaugeMode || 'static';
    const gaugeEnabled = !!state.gaugeEnabled && state.manifoldMode === 's1';

    setDisabled(getEl, 'gauge-mode-select', state.manifoldMode !== 's1');
    setDisabled(getEl, 'apply-gauge-init-btn', !gaugeEnabled);

    const gaugeControlIds = [
        'gauge-charge-slider',
        'gauge-matter-coupling-slider',
        'gauge-stiffness-slider',
        'gauge-damping-slider',
        'gauge-noise-slider',
        'gauge-dt-scale-slider',
        'gauge-init-pattern-select',
        'gauge-init-amplitude-slider',
        'gauge-flux-bias-slider',
        'gauge-graph-seed-input'
    ];
    const dynamicOnlyGaugeIds = new Set([
        'gauge-matter-coupling-slider',
        'gauge-stiffness-slider',
        'gauge-damping-slider',
        'gauge-noise-slider',
        'gauge-dt-scale-slider'
    ]);
    for (const id of gaugeControlIds) {
        const needsDynamic = dynamicOnlyGaugeIds.has(id);
        const disabled = needsDynamic
            ? (!gaugeEnabled || gaugeMode !== 'dynamic' || state.topologyMode !== 'grid')
            : !gaugeEnabled;
        setDisabled(getEl, id, disabled);
    }

    setDisabled(getEl, 'phase-lag-enabled-toggle', state.manifoldMode !== 's1');
    setDisabled(getEl, 'phase-lag-eta-slider', state.manifoldMode !== 's1' || !state.phaseLagEnabled);
    setDisabled(getEl, 'prismatic-style-enabled-toggle', state.manifoldMode !== 's1');
    setDisabled(getEl, 'prismatic-dynamics-enabled-toggle', state.manifoldMode !== 's1' || state.topologyMode !== 'grid');
    setDisabled(getEl, 'interaction-force-enabled-toggle', state.manifoldMode !== 's1' || state.topologyMode !== 'grid');

    for (const id of ['prismatic-k-slider', 'prismatic-friction-slider', 'prismatic-energy-decay-slider', 'prismatic-energy-mix-slider']) {
        setDisabled(getEl, id, state.manifoldMode !== 's1' || !state.prismaticDynamicsEnabled || state.topologyMode !== 'grid');
    }
    for (const id of ['prismatic-drag-radius-px-slider', 'prismatic-drag-peak-force-slider', 'prismatic-target-phase-slider', 'interaction-force-falloff-slider']) {
        setDisabled(getEl, id, state.manifoldMode !== 's1' || !state.interactionForceEnabled || state.topologyMode !== 'grid');
    }
    for (const id of ['prismatic-style-blend-slider', 'prismatic-style-base-select', 'prismatic-trail-fade-slider', 'prismatic-glow-scale-slider', 'prismatic-core-threshold-slider', 'prismatic-core-scale-slider']) {
        setDisabled(getEl, id, state.manifoldMode !== 's1' || !state.prismaticStyleEnabled);
    }

    const audioDisabled = state.manifoldMode !== 's1' || state.topologyMode !== 'grid';
    setDisabled(getEl, 'audio-empyrean-enabled-toggle', audioDisabled);
    setDisabled(getEl, 'audio-empyrean-start-stop-btn', audioDisabled);
    for (const id of [
        'audio-empyrean-master-slider',
        'audio-empyrean-bells-slider',
        'audio-empyrean-bass-slider',
        'audio-empyrean-reverb-mix-slider',
        'audio-empyrean-reverb-time-slider',
        'audio-empyrean-mode-select',
        'audio-coherence-lock-toggle'
    ]) {
        setDisabled(getEl, id, audioDisabled || !state.audioEmpyreanEnabled);
    }
}
