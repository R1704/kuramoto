import { CORE_CONTROL_SCHEMA } from '../controlSchema.js';

export function updateCoreSliderSection(state, updateOne) {
    for (const control of CORE_CONTROL_SCHEMA) {
        updateOne(control, state[control.key] ?? control.fallback);
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
