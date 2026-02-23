export function applyLayerStateToSimulation({
    state,
    sim,
    normalizeSelectedLayers,
    syncStateToLayerParams
}) {
    normalizeSelectedLayers?.(state, state.layerCount);
    syncStateToLayerParams?.(state, state.selectedLayers);
    sim.writeLayerParams(state.layerParams);
}

export function applyStateToSimulation({
    state,
    sim,
    renderer = null,
    drawKernel = null,
    ui = null,
    runtime = null,
    syncURL = null,
    updateDisplay = false,
    markOverlayDirty = true,
}) {
    sim.updateFullParams(state);
    sim.setManifoldMode(state.manifoldMode);
    renderer?.invalidateBindGroup?.();
    if (drawKernel) drawKernel(state);
    if (markOverlayDirty && runtime) runtime.overlayDirty = true;
    if (updateDisplay) ui?.updateDisplay?.();
    if (syncURL) syncURL();
}
