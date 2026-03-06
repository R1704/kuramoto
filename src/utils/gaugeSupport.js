export function isGaugeS1(state) {
    return (state?.manifoldMode || 's1') === 's1';
}

export function isGaugeDynamicAllowed(state) {
    return isGaugeS1(state) && (state?.topologyMode || 'grid') === 'grid';
}

export function isGaugeDynamicActive(state) {
    return !!state?.gaugeEnabled && (state?.gaugeMode || 'static') === 'dynamic' && isGaugeDynamicAllowed(state);
}

export function canShowGaugeLayers(state) {
    return isGaugeS1(state);
}

export function canUseGaugeOverlay(state) {
    return (state?.viewMode === 1) && isGaugeS1(state) && (state?.topologyMode || 'grid') === 'grid';
}

export function isPhaseLagAllowed(state) {
    return isGaugeS1(state);
}

export function isPrismaticStyleAllowed(state) {
    return isGaugeS1(state);
}

export function isPrismaticDynamicsAllowed(state) {
    return isGaugeS1(state) && (state?.topologyMode || 'grid') === 'grid';
}

export function isInteractionForceAllowed(state) {
    return isGaugeS1(state) && (state?.topologyMode || 'grid') === 'grid';
}

export function isEmpyreanAudioAllowed(state) {
    return isGaugeS1(state) && (state?.topologyMode || 'grid') === 'grid';
}

export function isReservoirAllowed(state) {
    return isGaugeS1(state);
}

export function getGaugeStatusText(state) {
    if (!isGaugeS1(state)) {
        return 'Gauge disabled outside S1 manifold.';
    }
    if ((state?.gaugeMode || 'static') === 'dynamic' && !isGaugeDynamicAllowed(state)) {
        return 'Dynamic gauge requires grid topology (WS/BA uses static gauge links).';
    }
    return 'S1 only. Dynamic gauge requires grid topology.';
}
