/**
 * Layer Parameter Management
 * 
 * Centralizes the complex layer parameter syncing logic that was
 * previously scattered throughout main.js.
 */

/**
 * Create a layer parameters object from current state.
 * @param {Object} state - Current application state
 * @returns {Object} Layer parameters for a single layer
 */
export function makeLayerParamsFromState(state) {
    return {
        // Coupling parameters
        ruleMode: state.ruleMode,
        K0: state.K0,
        range: state.range,
        harmonicA: state.harmonicA,
        harmonicB: state.harmonicB,
        delaySteps: state.delaySteps,
        
        // Kernel parameters
        sigma: state.sigma,
        sigma2: state.sigma2,
        beta: state.beta,
        kernelShape: state.kernelShape,
        kernelOrientation: state.kernelOrientation,
        kernelAsymmetricOrientation: state.kernelAsymmetricOrientation,
        kernelAspect: state.kernelAspect,
        kernelScale2Weight: state.kernelScale2Weight,
        kernelScale3Weight: state.kernelScale3Weight,
        kernelAsymmetry: state.kernelAsymmetry,
        kernelRings: state.kernelRings,
        kernelRingWidths: [...state.kernelRingWidths],
        kernelRingWeights: [...state.kernelRingWeights],
        kernelCompositionEnabled: state.kernelCompositionEnabled,
        kernelSecondary: state.kernelSecondary,
        kernelMixRatio: state.kernelMixRatio,
        kernelSpatialFreqMag: state.kernelSpatialFreqMag,
        kernelSpatialFreqAngle: state.kernelSpatialFreqAngle,
        kernelGaborPhase: state.kernelGaborPhase,
        
        // Dynamics
        noiseStrength: state.noiseStrength,
        leak: state.leak,
        
        // Interaction modifiers
        scaleBase: state.scaleBase,
        scaleRadial: state.scaleRadial,
        scaleRandom: state.scaleRandom,
        scaleRing: state.scaleRing,
        flowRadial: state.flowRadial,
        flowRotate: state.flowRotate,
        flowSwirl: state.flowSwirl,
        flowBubble: state.flowBubble,
        flowRing: state.flowRing,
        flowVortex: state.flowVortex,
        flowVertical: state.flowVertical,
        orientRadial: state.orientRadial,
        orientCircles: state.orientCircles,
        orientSwirl: state.orientSwirl,
        orientBubble: state.orientBubble,
        orientLinear: state.orientLinear,
        
        // Inter-layer coupling
        layerCouplingUp: state.layerCouplingUp ?? 0.0,
        layerCouplingDown: state.layerCouplingDown ?? 0.0,
    };
}

/**
 * Apply layer parameters to state (when switching active layers).
 * @param {Object} state - Application state to modify
 * @param {number} layerIdx - Index of layer to apply
 * @returns {boolean} Success status
 */
export function applyLayerParamsToState(state, layerIdx) {
    const lp = state.layerParams?.[layerIdx];
    if (!lp) {
        console.warn(`applyLayerParamsToState: No params for layer ${layerIdx}`);
        return false;
    }
    
    // Apply all coupling parameters
    state.ruleMode = lp.ruleMode;
    state.K0 = lp.K0;
    state.range = lp.range;
    state.harmonicA = lp.harmonicA;
    state.harmonicB = lp.harmonicB;
    state.delaySteps = lp.delaySteps;
    
    // Apply kernel parameters
    state.sigma = lp.sigma;
    state.sigma2 = lp.sigma2;
    state.beta = lp.beta;
    state.kernelShape = lp.kernelShape;
    state.kernelOrientation = lp.kernelOrientation;
    state.kernelAsymmetricOrientation = lp.kernelAsymmetricOrientation;
    state.kernelAspect = lp.kernelAspect;
    state.kernelScale2Weight = lp.kernelScale2Weight;
    state.kernelScale3Weight = lp.kernelScale3Weight;
    state.kernelAsymmetry = lp.kernelAsymmetry;
    state.kernelRings = lp.kernelRings;
    state.kernelRingWidths = [...lp.kernelRingWidths];
    state.kernelRingWeights = [...lp.kernelRingWeights];
    state.kernelCompositionEnabled = lp.kernelCompositionEnabled;
    state.kernelSecondary = lp.kernelSecondary;
    state.kernelMixRatio = lp.kernelMixRatio;
    state.kernelSpatialFreqMag = lp.kernelSpatialFreqMag;
    state.kernelSpatialFreqAngle = lp.kernelSpatialFreqAngle;
    state.kernelGaborPhase = lp.kernelGaborPhase;
    
    // Apply dynamics
    state.noiseStrength = lp.noiseStrength;
    state.leak = lp.leak;
    
    // Apply interaction modifiers with defaults
    state.scaleBase = lp.scaleBase ?? 1.0;
    state.scaleRadial = lp.scaleRadial ?? 0.0;
    state.scaleRandom = lp.scaleRandom ?? 0.0;
    state.scaleRing = lp.scaleRing ?? 0.0;
    state.flowRadial = lp.flowRadial ?? 0.0;
    state.flowRotate = lp.flowRotate ?? 0.0;
    state.flowSwirl = lp.flowSwirl ?? 0.0;
    state.flowBubble = lp.flowBubble ?? 0.0;
    state.flowRing = lp.flowRing ?? 0.0;
    state.flowVortex = lp.flowVortex ?? 0.0;
    state.flowVertical = lp.flowVertical ?? 0.0;
    state.orientRadial = lp.orientRadial ?? 0.0;
    state.orientCircles = lp.orientCircles ?? 0.0;
    state.orientSwirl = lp.orientSwirl ?? 0.0;
    state.orientBubble = lp.orientBubble ?? 0.0;
    state.orientLinear = lp.orientLinear ?? 0.0;
    
    // Apply inter-layer coupling with defaults
    state.layerCouplingUp = lp.layerCouplingUp ?? 0.0;
    state.layerCouplingDown = lp.layerCouplingDown ?? 0.0;
    
    return true;
}

/**
 * Sync current state to layer parameters for specified layer indices.
 * @param {Object} state - Application state
 * @param {number|number[]} indices - Layer index or array of indices to sync
 */
export function syncStateToLayerParams(state, indices) {
    const targets = Array.isArray(indices) ? indices : [indices];
    const lp = makeLayerParamsFromState(state);
    
    targets.forEach(idx => {
        if (idx == null) return;
        state.layerParams[idx] = {
            ...lp,
            kernelRingWidths: [...lp.kernelRingWidths],
            kernelRingWeights: [...lp.kernelRingWeights],
        };
    });
}

/**
 * Ensure layerParams array exists and has the correct number of entries.
 * @param {Object} state - Application state
 * @param {number} count - Target layer count
 */
export function ensureLayerParams(state, count) {
    const target = Math.max(1, count);
    
    // Initialize if needed
    if (!Array.isArray(state.layerParams) || state.layerParams.length === 0) {
        state.layerParams = [makeLayerParamsFromState(state)];
    }
    
    // Add layers if needed
    if (state.layerParams.length < target) {
        const template = state.layerParams[state.layerParams.length - 1] 
            || makeLayerParamsFromState(state);
        while (state.layerParams.length < target) {
            state.layerParams.push({
                ...template,
                kernelRingWidths: [...template.kernelRingWidths],
                kernelRingWeights: [...template.kernelRingWeights],
            });
        }
    } 
    // Remove excess layers if needed
    else if (state.layerParams.length > target) {
        state.layerParams = state.layerParams.slice(0, target);
    }
}

/**
 * Normalize selected layers array to valid indices.
 * @param {Object} state - Application state
 * @param {number} count - Total layer count
 */
export function normalizeSelectedLayers(state, count) {
    const maxIdx = Math.max(0, count - 1);
    let selected = Array.isArray(state.selectedLayers) 
        ? state.selectedLayers 
        : [];
    
    // Filter to valid range and remove duplicates
    selected = selected
        .map(idx => Math.min(maxIdx, Math.max(0, Math.floor(idx))))
        .filter((v, i, arr) => arr.indexOf(v) === i);
    
    // Ensure at least one layer is selected
    if (selected.length === 0) {
        selected = [Math.min(maxIdx, Math.max(0, state.activeLayer ?? 0))];
    }
    
    // Ensure active layer is in selection
    if (!selected.includes(state.activeLayer ?? 0)) {
        selected.push(Math.min(maxIdx, Math.max(0, state.activeLayer ?? 0)));
    }
    
    state.selectedLayers = selected.sort((a, b) => a - b);
}
