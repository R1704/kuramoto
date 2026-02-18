/**
 * Initial State Configuration
 * 
 * Single source of truth for all application state defaults.
 * This eliminates magic numbers and scattered defaults across the codebase.
 */

export const INITIAL_STATE = {
    // Simulation timing
    seed: 1,
    dt: 0.03,
    timeScale: 1.0,
    paused: false,
    frameTime: 0,
    
    // Coupling parameters
    K0: 1.0,
    range: 2,
    ruleMode: 0,
    harmonicA: 0.4,
    harmonicB: 0.0,
    globalCoupling: false,
    delaySteps: 10,
    
    // Kernel parameters
    sigma: 1.2,
    sigma2: 1.2,
    beta: 0.6,
    kernelShape: 0,
    kernelOrientation: 0.0,
    kernelAsymmetricOrientation: 0.0,
    kernelAspect: 1.0,
    kernelScale2Weight: 0.0,
    kernelScale3Weight: 0.0,
    kernelAsymmetry: 0.0,
    kernelRings: 3,
    kernelRingWidths: [0.2, 0.4, 0.6, 0.8, 1.0],
    kernelRingWeights: [1.0, -0.6, 0.8, -0.4, 0.5],
    kernelCompositionEnabled: false,
    kernelSecondary: 0,
    kernelMixRatio: 0.5,
    kernelSpatialFreqMag: 2.0,
    kernelSpatialFreqAngle: 0.0,
    kernelGaborPhase: 0.0,
    
    // Topology parameters
    topologyMode: 'grid',
    topologySeed: 1,
    topologyWSK: 4,
    topologyWSRewire: 0.2,
    topologyBAM0: 5,
    topologyBAM: 3,
    topologyAvgDegree: 0,
    topologyMaxDegree: 16, // MAX_GRAPH_DEGREE
    topologyClamped: false,
    
    // Layer parameters
    gridSize: 256,
    layerCount: 1,
    activeLayer: 0,
    layerCouplingUp: 0.0,
    layerCouplingDown: 0.0,
    layerKernelEnabled: false,
    renderAllLayers: false,
    layerZOffset: 0.15,
    selectedLayers: [0],
    layerParams: null, // Will be initialized on demand
    
    // Initialization patterns
    thetaPattern: 'random',
    omegaPattern: 'random',
    omegaAmplitude: 0.4,
    
    // Manifold and view
    manifoldMode: 's1',
    viewMode: 0, // 0 = 3D, 1 = 2D
    surfaceMode: 'mesh', // 'mesh' or 'instanced'
    
    // Visualization
    showOrder: false,
    colormap: 0,
    colormapPalette: 0,
    smoothingMode: 0,
    noiseStrength: 0.0,
    leak: 0.0,
    
    // Gauge-field (U(1), S1 only)
    gaugeEnabled: false,
    gaugeMode: 'static',
    gaugeCharge: 1.0,
    gaugeMatterCoupling: 1.0,
    gaugeStiffness: 0.2,
    gaugeDamping: 0.05,
    gaugeNoise: 0.0,
    gaugeDtScale: 1.0,
    gaugeInitPattern: 'zero',
    gaugeInitAmplitude: 0.5,
    gaugeFluxBias: 0.0,
    gaugeGraphSeed: 1,
    
    // Interaction modifiers
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
    
    // 2D view
    zoom: 1.0,
    panX: 0.0,
    panY: 0.0,
    
    // Overlays
    graphOverlayEnabled: false,
    phaseSpaceEnabled: true,
    
    // Statistics
    showStatistics: true,
    sparklinePaused: false,
    
    // Reservoir computing
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
    rcTraining: false,
    rcInference: false,
    rcTrainingSamples: 0,
    rcNRMSE: null,
    rcTestNRMSE: null,
    
    // Experiments
    expResetAtStart: true,
    expWarmupSteps: 200,
    expMeasureSteps: 600,
    expStepsPerFrame: 2,
    expReadbackEvery: 4,
};

/**
 * Deep clone the initial state to create a fresh instance.
 * This ensures each app instance starts with independent state.
 */
export function createInitialState() {
    return JSON.parse(JSON.stringify(INITIAL_STATE));
}
