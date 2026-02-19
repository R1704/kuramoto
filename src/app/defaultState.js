import { MAX_GRAPH_DEGREE } from '../topology/index.js';

export function createInitialState() {
    return {
        seed: 1,
        dt: 0.03,
        timeScale: 1.0,
        paused: false,
        K0: 1.0,
        range: 2,
        ruleMode: 0,
        harmonicA: 0.4,
        harmonicB: 0.0,
        globalCoupling: false,
        topologyMode: 'grid', // 'grid', 'ws', 'ba'
        topologySeed: 1,
        topologyWSK: 4,
        topologyWSRewire: 0.2,
        topologyBAM0: 5,
        topologyBAM: 3,
        topologyAvgDegree: 0,
        topologyMaxDegree: MAX_GRAPH_DEGREE,
        topologyClamped: false,
        delaySteps: 10,
        sigma: 1.2,
        sigma2: 1.2,
        beta: 0.6,
        showOrder: false,
        colormap: 0, // analytic layer
        colormapPalette: 0, // visual palette
        noiseStrength: 0.0,
        frameTime: 0,
        thetaPattern: 'random',
        omegaPattern: 'random',
        omegaAmplitude: 0.4,
        manifoldMode: 's1',
        viewMode: 0, // 0 = 3D, 1 = 2D
        surfaceMode: 'mesh', // 'mesh' or 'instanced'
        gridSize: 256, // Adjustable grid size
        layerCount: 1, // Number of stacked layers (same resolution)
        activeLayer: 0, // Which layer to visualize
        layerCouplingUp: 0.0, // coupling from lower layer to this layer
        layerCouplingDown: 0.0, // coupling from upper layer to this layer
        layerKernelEnabled: false,
        renderAllLayers: false,
        layerZOffset: 0.15,
        selectedLayers: [0],
        smoothingMode: 0, // 0=nearest (none), 1=bilinear, 2=bicubic, 3=gaussian
        showStatistics: true, // Enable/disable statistics computation and display
        leak: 0.0, // simple leak/damping on dynamics (0 = none)
        // Gauge-field (U(1), S1 only)
        gaugeEnabled: false,
        gaugeMode: 'static', // 'static' | 'dynamic'
        gaugeCharge: 1.0,
        gaugeMatterCoupling: 1.0,
        gaugeStiffness: 0.2,
        gaugeDamping: 0.05,
        gaugeNoise: 0.0,
        gaugeDtScale: 1.0,
        gaugeInitPattern: 'zero', // 'zero' | 'uniform_flux' | 'random_link' | 'pure_gauge'
        gaugeInitAmplitude: 0.5,
        gaugeFluxBias: 0.0,
        gaugeGraphSeed: 1,
        vizFluxGain: 1.0,
        vizCovGradGain: 1.0,
        vizGaugeAutoNormalize: true,
        vizGaugeSignedFlux: false,
        sweepParam: 'gaugeCharge',
        sweepFrom: 0,
        sweepTo: 2,
        sweepSteps: 5,
        sweepSettleFrames: 180,
        overlayGaugeLinks: false,
        overlayPlaquetteSign: false,
        overlayProbeEnabled: true,
        phaseLagEnabled: false,
        phaseLagEta: 0.0,
        // Interaction primer controls
        drawMode: 'draw', // 'draw' or 'erase'
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
        // Zoom/pan for 2D mode
        zoom: 1.0,
        panX: 0.0,
        panY: 0.0,
        // Kernel shape parameters
        kernelShape: 0, // 0=isotropic, 1=anisotropic, 2=multi-scale, 3=asymmetric, 4=step, 5=multi-ring
        kernelOrientation: 0.0, // radians, 0-2π (for anisotropic)
        kernelAsymmetricOrientation: 0.0, // radians, 0-2π (for asymmetric - separate from anisotropic)
        kernelAspect: 1.0, // aspect ratio for anisotropic, 1.0 = circular
        kernelScale2Weight: 0.0, // weight for second scale (multi-scale)
        kernelScale3Weight: 0.0, // weight for third scale (multi-scale)
        kernelAsymmetry: 0.0, // forward/backward strength difference (-1 to 1)
        kernelRings: 3, // number of rings for multi-ring (1-5)
        // Multi-ring individual controls (cumulative radii 0-1, weights -1 to 1)
        kernelRingWidths: [0.2, 0.4, 0.6, 0.8, 1.0],
        kernelRingWeights: [1.0, -0.6, 0.8, -0.4, 0.5],
        // Kernel composition (mixing two shapes)
        kernelCompositionEnabled: false, // enable mixing of primary + secondary
        kernelSecondary: 0, // secondary kernel shape (0-6)
        kernelMixRatio: 0.5, // 0 = all secondary, 1 = all primary
        // Gabor kernel parameters
        kernelSpatialFreqMag: 2.0, // spatial frequency magnitude (k)
        kernelSpatialFreqAngle: 0.0, // spatial frequency direction (radians)
        kernelGaborPhase: 0.0, // phase offset (radians)

        // Reservoir Computing parameters
        rcEnabled: false, // Master toggle for RC mode
        rcInputRegion: 'center', // 'left', 'top', 'center', 'random', 'gradient' - center works best with periodic boundaries
        rcOutputRegion: 'random', // 'right', 'bottom', 'random' - random samples from non-input region
        rcInputWidth: 0.1, // Fraction of grid for input region (0-0.5)
        rcOutputWidth: 0.1, // Fraction of grid for output region (0-0.5)
        rcInputStrength: 2.0, // Scaling factor for input signal (higher = more visible effect)
        rcInjectionMode: 'freq_mod', // 'freq_mod', 'phase_drive', 'coupling_mod'
        rcHistoryLength: 20, // Number of timesteps to store for temporal features
        rcMaxFeatures: 512, // Feature budget after history stacking (stride downsample)
        rcTask: 'sine', // 'sine', 'narma10', 'memory'
        rcTraining: false, // Currently collecting training data
        rcInference: false, // Running trained model
        rcTrainingSamples: 0, // Number of samples collected
        rcNRMSE: null, // Performance metric after training
        rcTestNRMSE: null,

        // Visualization toggles
        phaseSpaceEnabled: true,

        // Experiments
        expResetAtStart: true,
        expWarmupSteps: 200,
        expMeasureSteps: 600,
        expStepsPerFrame: 2,
        expReadbackEvery: 4,

        // History strip
        sparklinePaused: false,
    };
}

export function createInitialSparklineState() {
    return {
        rCanvas: null,
        chiCanvas: null,
        rCtx: null,
        chiCtx: null,
        rBuf: null,
        chiBuf: null,
        statusEl: null,
        pauseBtn: null,
        exportBtn: null,
        lastDrawMs: 0,
        minMs: 180,
    };
}
