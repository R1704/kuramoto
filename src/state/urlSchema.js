import { createInitialState } from '../app/defaultState.js';

const DEFAULTS = createInitialState();

export const URL_STATE_DEFAULTS = {
    ...DEFAULTS,
    kernelRingWidths: [...(DEFAULTS.kernelRingWidths || [0.2, 0.4, 0.6, 0.8, 1.0])],
    kernelRingWeights: [...(DEFAULTS.kernelRingWeights || [1.0, -0.6, 0.8, -0.4, 0.5])]
};

export const URL_STATE_SCHEMA = {
    seed: 'int',
    dt: 'float', timeScale: 'float', paused: 'bool', K0: 'float', range: 'int', ruleMode: 'int',
    harmonicA: 'float', harmonicB: 'float', globalCoupling: 'bool',
    topologyMode: 'str', topologySeed: 'int', topologyWSK: 'int', topologyWSRewire: 'float', topologyBAM0: 'int', topologyBAM: 'int',
    delaySteps: 'int', sigma: 'float', sigma2: 'float', beta: 'float', showOrder: 'bool',
    colormap: 'int', colormapPalette: 'int', noiseStrength: 'float',
    gaugeEnabled: 'bool', gaugeMode: 'str', gaugeCharge: 'float', gaugeMatterCoupling: 'float',
    gaugeStiffness: 'float', gaugeDamping: 'float', gaugeNoise: 'float', gaugeDtScale: 'float',
    gaugeInitPattern: 'str', gaugeInitAmplitude: 'float', gaugeFluxBias: 'float', gaugeGraphSeed: 'int',
    vizFluxGain: 'float', vizCovGradGain: 'float', vizGaugeAutoNormalize: 'bool', vizGaugeSignedFlux: 'bool',
    sweepParam: 'str', sweepFrom: 'float', sweepTo: 'float', sweepSteps: 'int', sweepSettleFrames: 'int',
    overlayGaugeLinks: 'bool', overlayPlaquetteSign: 'bool', overlayProbeEnabled: 'bool',
    phaseLagEnabled: 'bool', phaseLagEta: 'float',
    prismaticStyleEnabled: 'bool', prismaticStyleBlend: 'float', prismaticStyleBaseLayerMode: 'str',
    prismaticDynamicsEnabled: 'bool', interactionForceEnabled: 'bool', interactionForceFalloff: 'float',
    audioEmpyreanEnabled: 'bool', audioEmpyreanMaster: 'float', audioEmpyreanBells: 'float', audioEmpyreanBass: 'float',
    audioEmpyreanReverbMix: 'float', audioEmpyreanReverbTime: 'float', audioEmpyreanMode: 'str', audioCoherenceLock: 'bool',
    prismaticK: 'float', prismaticFriction: 'float', prismaticEnergyDecay: 'float', prismaticEnergyMix: 'float',
    prismaticDragRadiusPx: 'float', prismaticDragPeakForce: 'float', prismaticTargetPhase: 'float',
    prismaticTrailFade: 'float', prismaticGlowScale: 'float',
    prismaticCoreThreshold: 'float', prismaticCoreScale: 'float',
    thetaPattern: 'str', omegaPattern: 'str', omegaAmplitude: 'float',
    manifoldMode: 'str',
    viewMode: 'int', surfaceMode: 'str', gridSize: 'int', smoothingMode: 'int',
    zoom: 'float', panX: 'float', panY: 'float',
    layerCount: 'int', activeLayer: 'int', layerCouplingUp: 'float', layerCouplingDown: 'float',
    layerKernelEnabled: 'bool', renderAllLayers: 'bool', layerZOffset: 'float',
    kernelShape: 'int', kernelOrientation: 'float', kernelAsymmetricOrientation: 'float', kernelAspect: 'float',
    kernelScale2Weight: 'float', kernelScale3Weight: 'float', kernelAsymmetry: 'float', kernelRings: 'int',
    kernelRingWidths: 'arrayFloat', kernelRingWeights: 'arrayFloat',
    kernelCompositionEnabled: 'bool', kernelSecondary: 'int', kernelMixRatio: 'float',
    kernelSpatialFreqMag: 'float', kernelSpatialFreqAngle: 'float', kernelGaborPhase: 'float',
    rcEnabled: 'bool', rcInputRegion: 'str', rcOutputRegion: 'str', rcInputWidth: 'float', rcOutputWidth: 'float', rcInputStrength: 'float',
    rcInjectionMode: 'str', rcHistoryLength: 'int', rcMaxFeatures: 'int', rcTask: 'str',
    phaseSpaceEnabled: 'bool',
    leak: 'float',
    scaleBase: 'float', scaleRadial: 'float', scaleRandom: 'float', scaleRing: 'float',
    flowRadial: 'float', flowRotate: 'float', flowSwirl: 'float', flowBubble: 'float', flowRing: 'float', flowVortex: 'float', flowVertical: 'float',
    orientRadial: 'float', orientCircles: 'float', orientSwirl: 'float', orientBubble: 'float', orientLinear: 'float',
    graphOverlayEnabled: 'bool', showStatistics: 'bool',
    expResetAtStart: 'bool', expWarmupSteps: 'int', expMeasureSteps: 'int', expStepsPerFrame: 'int', expReadbackEvery: 'int',
    sparklinePaused: 'bool'
};

export function alignUrlGridSize(size) {
    const aligned = Math.round(size / 64) * 64;
    return Math.max(64, Math.min(1024, aligned));
}
