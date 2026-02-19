import { Simulation } from '../../simulation/index.js';
import { Renderer } from '../../rendering/index.js';
import { Camera } from '../../utils/index.js';
import { StatisticsTracker, LyapunovCalculator } from '../../statistics/index.js';
import { ReservoirComputer } from '../../reservoir/index.js';
import { ensureLayerParams, normalizeSelectedLayers, applyLayerParamsToState } from '../../state/layerParams.js';

export function initSimulationRuntime({ device, format, canvas, state }) {
    ensureLayerParams(state, state.layerCount);
    const sim = new Simulation(device, state.gridSize, state.layerCount);
    state.layerCount = sim.layers;
    state.activeLayer = Math.min(state.activeLayer || 0, state.layerCount - 1);
    normalizeSelectedLayers(state, state.layerCount);
    applyLayerParamsToState(state, state.activeLayer);
    sim.updateFullParams(state);
    sim.setManifoldMode(state.manifoldMode);
    sim.writeLayerParams(state.layerParams);

    const renderer = new Renderer(device, format, canvas, state.gridSize);
    renderer.setMeshMode(state.surfaceMode);

    const camera = new Camera(canvas);

    const graphOverlay = document.getElementById('graph-overlay');
    const graphOverlayCtx = graphOverlay ? graphOverlay.getContext('2d') : null;
    const rcOverlay = document.getElementById('rc-task-overlay');
    const rcOverlayCtx = rcOverlay ? rcOverlay.getContext('2d') : null;

    const runtime = {
        overlayDirty: true,
        overlayMouseNorm: { x: 0.5, y: 0.5, inside: false },
        gaugeOverlayData: null,
        gaugeOverlayReadPending: false,
        lastGaugeOverlayReadMs: 0,
        lastGaugeOverlayDurationMs: 0,
        gaugeProbeData: null,
        probeReadPending: false,
        lastProbeReadMs: 0,
        lastProbeDurationMs: 0,
        rcReadPending: false,
        lastRCReadMs: 0,
        rcTestRemaining: 0,
        rcActiveLayerSeen: 0,
        rcOverlayLastThetaLayer: null,
        statsFrameCounter: 0,
        lastStatsReadbackMs: 0,
        kScanner: null,
        phaseSpaceCounter: 0,
        phaseSpacePending: false,
        frameDurationMs: 0,
        lastReadbackDurationMs: 0,
        frameErrorCount: 0,
        frameErrorShown: false,
    };

    const stats = new StatisticsTracker(state.gridSize * state.gridSize * state.layerCount);
    const lyapunovCalc = new LyapunovCalculator(state.gridSize * state.gridSize * state.layerCount);
    const reservoir = new ReservoirComputer(state.gridSize);

    return {
        sim,
        renderer,
        camera,
        graphOverlay,
        graphOverlayCtx,
        rcOverlay,
        rcOverlayCtx,
        runtime,
        stats,
        lyapunovCalc,
        reservoir,
    };
}
