// Utilities to read/write a compact representation of important STATE fields to the URL
// so the app can be shared via link and restored exactly.

const DEFAULTS = {
    dt: 0.03,
    timeScale: 1.0,
    paused: false,
    K0: 1.0,
    range: 2,
    ruleMode: 0,
    harmonicA: 0.4,
    harmonicB: 0.0,
    globalCoupling: false,
    topologyMode: 'grid',
    topologySeed: 1,
    topologyWSK: 4,
    topologyWSRewire: 0.2,
    topologyBAM0: 5,
    topologyBAM: 3,
    delaySteps: 10,
    sigma: 1.2,
    sigma2: 1.2,
    beta: 0.6,
    showOrder: false,
    colormap: 0,
    colormapPalette: 0,
    noiseStrength: 0.0,
    thetaPattern: 'random',
    omegaPattern: 'random',
    omegaAmplitude: 0.4,
    viewMode: 0,
    surfaceMode: 'mesh',
    gridSize: 256,
    smoothingMode: 0,
    zoom: 1.0,
    panX: 0.0,
    panY: 0.0,
    kernelShape: 0,
    kernelOrientation: 0.0,
    kernelAsymmetricOrientation: 0.0,
    kernelAspect: 1.0,
    kernelScale2Weight: 0.0,
    kernelScale3Weight: 0.0,
    kernelAsymmetry: 0.0,
    kernelRings: 3,
    kernelRingWidths: [0.2,0.4,0.6,0.8,1.0],
    kernelRingWeights: [1.0,-0.6,0.8,-0.4,0.5],
    kernelCompositionEnabled: false,
    kernelSecondary: 0,
    kernelMixRatio: 0.5,
    kernelSpatialFreqMag: 2.0,
    kernelSpatialFreqAngle: 0.0,
    kernelGaborPhase: 0.0,
    rcEnabled: false,
    rcInputRegion: 'center',
    rcOutputRegion: 'random',
    rcInputWidth: 0.1,
    rcOutputWidth: 0.1,
    rcInputStrength: 2.0,
    rcInjectionMode: 'freq_mod',
    rcHistoryLength: 20,
    rcMaxFeatures: 512,
    rcTask: 'sine',
    phaseSpaceEnabled: true
    ,
    // Interaction & visualization extras
    leak: 0.0,
    drawMode: 'draw',
    scaleBase: 1.0,
    scaleRadial: 0.0,
    scaleRandom: 0.0,
    scaleRing: 0.0,
    flowRadial: 0.0,
    flowRotate: 0.0,
    flowSwirl: 0.0,
    flowBubble: 0.0,
    flowRing: 0.0,
    flowVortex: 0.0,
    flowVertical: 0.0,
    orientRadial: 0.0,
    orientCircles: 0.0,
    orientSwirl: 0.0,
    orientBubble: 0.0,
    orientLinear: 0.0,
    graphOverlayEnabled: false,
    showStatistics: true
};

// Keys to include in the URL and their types
const SCHEMA = {
    // primitives
    dt: 'float', timeScale: 'float', paused: 'bool', K0: 'float', range: 'int', ruleMode: 'int',
    harmonicA: 'float', harmonicB: 'float', globalCoupling: 'bool',
    topologyMode: 'str', topologySeed: 'int', topologyWSK: 'int', topologyWSRewire: 'float', topologyBAM0: 'int', topologyBAM: 'int',
    delaySteps: 'int', sigma: 'float', sigma2: 'float', beta: 'float', showOrder: 'bool',
    colormap: 'int', colormapPalette: 'int', noiseStrength: 'float',
    thetaPattern: 'str', omegaPattern: 'str', omegaAmplitude: 'float',
    viewMode: 'int', surfaceMode: 'str', gridSize: 'int', smoothingMode: 'int',
    zoom: 'float', panX: 'float', panY: 'float',
    kernelShape: 'int', kernelOrientation: 'float', kernelAsymmetricOrientation: 'float', kernelAspect: 'float',
    kernelScale2Weight: 'float', kernelScale3Weight: 'float', kernelAsymmetry: 'float', kernelRings: 'int',
    kernelRingWidths: 'arrayFloat', kernelRingWeights: 'arrayFloat',
    kernelCompositionEnabled: 'bool', kernelSecondary: 'int', kernelMixRatio: 'float',
    kernelSpatialFreqMag: 'float', kernelSpatialFreqAngle: 'float', kernelGaborPhase: 'float',
    rcEnabled: 'bool', rcInputRegion: 'str', rcOutputRegion: 'str', rcInputWidth: 'float', rcOutputWidth: 'float', rcInputStrength: 'float',
    rcInjectionMode: 'str', rcHistoryLength: 'int', rcMaxFeatures: 'int', rcTask: 'str',
    phaseSpaceEnabled: 'bool'
    ,
    // Interaction & visualization extras
    leak: 'float', drawMode: 'str',
    scaleBase: 'float', scaleRadial: 'float', scaleRandom: 'float', scaleRing: 'float',
    flowRadial: 'float', flowRotate: 'float', flowSwirl: 'float', flowBubble: 'float', flowRing: 'float', flowVortex: 'float', flowVertical: 'float',
    orientRadial: 'float', orientCircles: 'float', orientSwirl: 'float', orientBubble: 'float', orientLinear: 'float',
    graphOverlayEnabled: 'bool', showStatistics: 'bool'
};

function encodeArray(arr) {
    if (!Array.isArray(arr)) return '';
    return arr.map(v => Number(v).toString()).join(',');
}

function decodeArray(s) {
    if (!s) return [];
    return s.split(',').map(v => parseFloat(v));
}

function alignGridSize(size) {
    // align to nearest multiple of 64 (WebGPU bytesPerRow requirement)
    const aligned = Math.round(size / 64) * 64;
    return Math.max(64, Math.min(1024, aligned));
}

export function loadStateFromURL(state) {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if ([...params.keys()].length === 0) return; // nothing to do

    for (const key of Object.keys(SCHEMA)) {
        if (!params.has(key)) continue;
        const type = SCHEMA[key];
        const raw = params.get(key);
        try {
            if (type === 'float') state[key] = parseFloat(raw);
            else if (type === 'int') state[key] = parseInt(raw);
            else if (type === 'bool') state[key] = (raw === '1' || raw === 'true');
            else if (type === 'str') state[key] = raw;
            else if (type === 'arrayFloat') state[key] = decodeArray(raw);
        } catch (e) {
            // ignore parse errors and leave default
        }
    }

    // Ensure arrays have expected length and defaults if missing
    if (!Array.isArray(state.kernelRingWidths) || state.kernelRingWidths.length < 5) {
        state.kernelRingWidths = (DEFAULTS.kernelRingWidths || []).slice();
    }
    if (!Array.isArray(state.kernelRingWeights) || state.kernelRingWeights.length < 5) {
        state.kernelRingWeights = (DEFAULTS.kernelRingWeights || []).slice();
    }

    // Align grid size to safe values
    if (state.gridSize) state.gridSize = alignGridSize(state.gridSize);
}

export function updateURLFromState(state, replace = true) {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();

    for (const [key, type] of Object.entries(SCHEMA)) {
        const val = state[key];
        if (val === undefined) continue;
        // Only include when different from default to keep URLs shorter
        if (DEFAULTS[key] !== undefined) {
            const def = DEFAULTS[key];
            // For arrays, do a simple string compare
            if (Array.isArray(def) && Array.isArray(val) && encodeArray(def) === encodeArray(val)) continue;
            if (!Array.isArray(def) && def === val) continue;
        }

        if (type === 'float' || type === 'int' || type === 'str') {
            params.set(key, String(val));
        } else if (type === 'bool') {
            params.set(key, val ? '1' : '0');
        } else if (type === 'arrayFloat') {
            params.set(key, encodeArray(val));
        }
    }

    const qs = params.toString();
    const newUrl = window.location.pathname + (qs ? `?${qs}` : '');
    try {
        if (replace) window.history.replaceState({}, '', newUrl);
        else window.history.pushState({}, '', newUrl);
    } catch (e) {
        // ignore history errors in odd contexts
    }
}
