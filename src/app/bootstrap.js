import { Simulation } from '../simulation/index.js';
import { UIManager } from '../ui/index.js';
import { drawKernel } from '../patterns/index.js';
import { loadStateFromURL } from '../utils/index.js';
import { TimeSeriesPlot, PhaseDiagramPlot, PhaseSpacePlot } from '../statistics/index.js';
import { generateTopology, MAX_GRAPH_DEGREE } from '../topology/index.js';
import { makeRng, normalizeSeed, cryptoSeedFallback } from '../utils/index.js';
import { RCCriticalitySweepRunner, RCInjectionModeCompareRunner } from '../experiments/index.js';
import { encodeFloat32ToBase64, decodeBase64ToFloat32, estimateBase64SizeBytes } from '../utils/index.js';
import { applyLayerParamsToState, syncStateToLayerParams, ensureLayerParams, normalizeSelectedLayers } from '../state/layerParams.js';
import { resizeSparkCanvas, showError, downloadCSV, downloadJSON, formatBytes } from '../utils/index.js';
import {
    resetSimulation,
    applyThetaPattern,
    applyOmegaPattern,
    randomizeTheta,
    applyS2Pattern,
    applyOmegaVecPattern,
    applyS3Pattern,
    applyOmega3Pattern,
    applyExternalInput,
    applyGaugePattern
} from '../patterns/index.js';
import { createStateAdapter } from './stateAdapter.js';
import { createInitialState, createInitialSparklineState } from './defaultState.js';
import { loadPreset } from './presets/loadPreset.js';
import { createStatsViewUpdater } from './view/updateStatsView.js';
import { initDrawing } from './view/initDrawing.js';
import { createFrameLoop } from './render/frameLoop.js';
import { extrapolateKc, createDiscoverySweepController } from './controllers/analysisController.js';
import { createSnapshotController } from './controllers/snapshotController.js';
import { drawRCPlot as drawRCPredictions, renderRCKSweepPlot as renderRCKSweepChart, renderRCModeComparePlot as renderRCModeCompareChart } from './controllers/rcController.js';
import { canShowGaugeLayers } from '../utils/gaugeSupport.js';
import { initWebGPU } from './runtime/initWebGPU.js';
import { initEventWiring } from './runtime/initEventWiring.js';
import { initOverlayDiagnostics } from './runtime/initOverlayDiagnostics.js';
import { initSimulationRuntime } from './runtime/initSimulation.js';
import { initExperimentControllers } from './runtime/initControllers.js';

const STATE = createInitialState();

const stateAdapter = createStateAdapter(STATE);

let SPARKLINE = createInitialSparklineState();

// Store the last external input canvas for pattern initialization
let lastExternalCanvas = null;
let gridResizeInProgress = false;
let APP_RUNTIME = null;

function clampGaugeLayerSelection(state) {
    if (!canShowGaugeLayers(state) && state.colormap >= 7) {
        state.colormap = 0;
    }
}

async function init() {
    const webgpu = await initWebGPU({ showError, canvasId: 'canvas' });
    if (!webgpu) return;
    const { device, canvas, context, format } = webgpu;

    // Load state from URL (may modify STATE.gridSize before constructing Simulation)
    loadStateFromURL(STATE);
    clampGaugeLayerSelection(STATE);

    // Normalize/initialize seed for reproducible experiments
    if (STATE.seed === undefined || STATE.seed === null) {
        STATE.seed = cryptoSeedFallback();
    }
    STATE.seed = normalizeSeed(STATE.seed);

    const runtimeInit = initSimulationRuntime({
        device,
        format,
        canvas,
        state: STATE,
    });
    let sim = runtimeInit.sim;
    const renderer = runtimeInit.renderer;
    renderer.setContext(context);
    const camera = runtimeInit.camera;
    const graphOverlay = runtimeInit.graphOverlay;
    const graphOverlayCtx = runtimeInit.graphOverlayCtx;
    const rcOverlay = runtimeInit.rcOverlay;
    const rcOverlayCtx = runtimeInit.rcOverlayCtx;
    const runtime = runtimeInit.runtime;
    const stats = runtimeInit.stats;
    let lyapunovCalc = runtimeInit.lyapunovCalc;
    let reservoir = runtimeInit.reservoir;
    reservoir.setSeed?.(STATE.seed);
    let lastViewMode = STATE.viewMode;

    const updateRenderModeIndicator = () => {
        const el = document.getElementById('render-mode-indicator');
        if (!el) return;
        if (STATE.viewMode === 1) {
            el.textContent = '2D';
            el.style.opacity = '0.85';
            return;
        }
        const mode = STATE.surfaceMode === 'instanced' ? 'Instanced' : 'Mesh';
        el.textContent = `3D • ${mode}`;
        el.style.opacity = '1';
    };
    updateRenderModeIndicator();
    
    let lleUpdateInterval = null;
    let rcPlot = null;
    let rcKsweepPlot = null;
    const RC_TEST_STEPS = 200;
    let rcCritSweepInfo = { running: false, phase: 'idle', kIdx: 0, kTotal: 0, K: null, configHash: null, results: [] };
    let rcCritSweepPrevPaused = null;
    let rcWeightsFull = null;
    let rcWeightsLastLayer = null;
    let rcWeightsLayerSize = 0;

    const getActiveLayerIndex = () => {
        const layers = sim?.layers ?? STATE.layerCount ?? 1;
        const idx = STATE.activeLayer ?? 0;
        return Math.min(Math.max(0, idx), Math.max(0, layers - 1));
    };

    const getActiveLayerThetaForRC = (thetaFull) => {
        if (!thetaFull) return thetaFull;
        if (STATE.manifoldMode !== 's1') return null;
        const layers = sim?.layers ?? 1;
        if (layers <= 1) return thetaFull;
        const layerSize = sim.gridSize * sim.gridSize;
        const layer = getActiveLayerIndex();
        const offset = layer * layerSize;
        return thetaFull.subarray(offset, offset + layerSize);
    };

    const writeRCInputWeights = () => {
        const layerSize = sim.gridSize * sim.gridSize;
        const layer = getActiveLayerIndex();
        const baseWeights = reservoir.getInputWeights();
        if (!baseWeights || baseWeights.length !== layerSize) {
            console.warn('RC input weights size mismatch', baseWeights?.length, 'expected', layerSize);
            return;
        }

        if (!rcWeightsFull || rcWeightsFull.length !== sim.N || rcWeightsLayerSize !== layerSize) {
            rcWeightsFull = new Float32Array(sim.N);
            rcWeightsLastLayer = null;
            rcWeightsLayerSize = layerSize;
        }

        if (rcWeightsLastLayer !== null && rcWeightsLastLayer !== layer) {
            const prevOffset = rcWeightsLastLayer * layerSize;
            rcWeightsFull.fill(0, prevOffset, prevOffset + layerSize);
        }

        const offset = layer * layerSize;
        rcWeightsFull.set(baseWeights, offset);
        rcWeightsLastLayer = layer;

        sim.writeInputWeights(rcWeightsFull);
    };

    runtime.rcActiveLayerSeen = getActiveLayerIndex();
    
    // Initialize plots (will be created when DOM is ready)
    let R_plot = null;
    let chi_plot = null;
    let phaseDiagramPlot = null;
    let phaseSpacePlot = null;
    let ui = null;

    // History strip (sparklines)
    SPARKLINE.rCanvas = document.getElementById('spark-r');
    SPARKLINE.chiCanvas = document.getElementById('spark-chi');
    SPARKLINE.pauseBtn = document.getElementById('spark-pause-btn');
    SPARKLINE.exportBtn = document.getElementById('spark-export-btn');
    SPARKLINE.statusEl = document.getElementById('spark-status');
    SPARKLINE.rBuf = new Float32Array(160);
    SPARKLINE.chiBuf = new Float32Array(160);
    SPARKLINE.rCtx = SPARKLINE.rCanvas ? SPARKLINE.rCanvas.getContext('2d') : null;
    SPARKLINE.chiCtx = SPARKLINE.chiCanvas ? SPARKLINE.chiCanvas.getContext('2d') : null;

    let experimentRunner = null;
    let experimentController = null;
    let discoverySweepController = null;
    let discoverySweepLastExport = null;
    const compareSnapshots = { a: null, b: null };

    const regenerateTopology = () => {
        const maxDegree = STATE.topologyMaxDegree || MAX_GRAPH_DEGREE;
        STATE.topologySeed = Math.max(1, Math.floor(STATE.topologySeed || 1));
        const topology = generateTopology({
            mode: STATE.topologyMode,
            gridSize: STATE.gridSize,
            maxDegree,
            seed: STATE.topologySeed,
            wsK: STATE.topologyWSK,
            wsRewire: STATE.topologyWSRewire,
            baM0: STATE.topologyBAM0,
            baM: STATE.topologyBAM,
        });
        sim.writeTopology(topology);
        STATE.topologyAvgDegree = (STATE.topologyMode === 'grid') ? 0 : (topology.avgDegree ?? 0);
        STATE.topologyMaxDegree = maxDegree;
        const normalizeMode = (m) => {
            if (m === 'watts_strogatz' || m === 'ws') return 'ws';
            if (m === 'barabasi_albert' || m === 'ba') return 'ba';
            return 'grid';
        };
        STATE.topologyMode = normalizeMode(topology.mode || STATE.topologyMode);
        STATE.topologyClamped = topology.clamped || false;
        if (STATE.topologyClamped) {
            console.warn(`Topology clamped at degree ${maxDegree}`);
        }
        sim.updateFullParams(STATE);
        sim.setManifoldMode(STATE.manifoldMode);
        if (ui?.updateDisplay) ui.updateDisplay();
        runtime.overlayDirty = true;
        return topology;
    };

    const { resizeCanvasesToDisplay } = initEventWiring({
        canvas,
        context,
        device,
        format,
        renderer,
        graphOverlay,
        rcOverlay,
        runtime,
    });

    // Sparkline resizing
    const resizeSparklines = () => {
        resizeSparkCanvas(SPARKLINE.rCanvas, SPARKLINE.rCtx);
        resizeSparkCanvas(SPARKLINE.chiCanvas, SPARKLINE.chiCtx);
    };
    resizeSparklines();
    window.addEventListener('resize', resizeSparklines, { passive: true });
    if (SPARKLINE.rCanvas && 'ResizeObserver' in window) {
        const ro = new ResizeObserver(() => resizeSparklines());
        ro.observe(SPARKLINE.rCanvas);
    }

    if (SPARKLINE.pauseBtn) {
        SPARKLINE.pauseBtn.addEventListener('click', () => {
            STATE.sparklinePaused = !STATE.sparklinePaused;
            if (SPARKLINE.statusEl) SPARKLINE.statusEl.textContent = STATE.sparklinePaused ? 'paused' : '';
            if (SPARKLINE.pauseBtn) SPARKLINE.pauseBtn.textContent = STATE.sparklinePaused ? 'Resume' : 'Pause';
            stateAdapter.syncURL(true);
        });
        SPARKLINE.pauseBtn.textContent = STATE.sparklinePaused ? 'Resume' : 'Pause';
    }

    if (SPARKLINE.exportBtn) {
        SPARKLINE.exportBtn.addEventListener('click', () => {
            if (!stats) return;
            const csv = stats.exportCSV();
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            downloadCSV(csv, `kuramoto_stats_${ts}.csv`);
        });
    }

    // RC overlay state
    const rcDotTrail = [];
    const rcDotTrailMax = 120;

    // RC vs criticality sweep state
    let rcCritSweepRunner = null;
    let rcCritSweepLastExport = null;

    // RC injection mode compare state
    let rcModeCompareRunner = null;
    let rcModeCompareLastExport = null;
    let rcModeCompareInfo = { running: false, phase: 'idle', mode: null, modeIdx: 0, modeTotal: 0, configHash: null, results: [] };
    
    // K-scan state
    runtime.kScanner = null;

    // Initial State
    resetSimulation(sim, STATE, lastExternalCanvas);
    initDrawing({ canvas, state: STATE, getSimulation: () => sim });
    sim.writeLayerParams(STATE.layerParams);

    const rebuildLayerCount = async (newCount) => {
        const clamped = Math.max(1, Math.min(8, Math.floor(newCount)));
        if (clamped === STATE.layerCount) {
            return;
        }
        STATE.layerCount = clamped;
        ensureLayerParams(STATE, STATE.layerCount);
        normalizeSelectedLayers(STATE, STATE.layerCount);
        applyLayerParamsToState(STATE, STATE.activeLayer ?? 0);
        sim.updateFullParams(STATE);
        sim.setManifoldMode(STATE.manifoldMode);
        sim.writeLayerParams(STATE.layerParams);
        renderer.invalidateBindGroup();
        stats.resize(STATE.gridSize * STATE.gridSize * STATE.layerCount);
        lyapunovCalc.resize(STATE.gridSize * STATE.gridSize * STATE.layerCount);
        reservoir.resize(STATE.gridSize);
        regenerateTopology();
        resetSimulation(sim, STATE, lastExternalCanvas);
        if (ui?.updateDisplay) ui.updateDisplay();
        stateAdapter.syncURL(true);
    };

    ui = new UIManager(STATE, {
        onParamChange: () => { 
            if ((experimentRunner && experimentRunner.isRunning()) || (rcCritSweepRunner && rcCritSweepRunner.isRunning()) || (rcModeCompareRunner && rcModeCompareRunner.isRunning())) return;
            if (STATE.manifoldMode !== 's1') {
                if (STATE.ruleMode !== 0) STATE.ruleMode = 0;
                if (STATE.harmonicA !== 0.0) STATE.harmonicA = 0.0;
                if (STATE.harmonicB !== 0.0) STATE.harmonicB = 0.0;
                if (STATE.delaySteps !== 0) STATE.delaySteps = 0;
                if (STATE.globalCoupling !== false) STATE.globalCoupling = false;
                if (STATE.rcEnabled) {
                    STATE.rcEnabled = false;
                    sim.setInputSignal(0);
                }
                if (STATE.gaugeEnabled) {
                    STATE.gaugeEnabled = false;
                }
            }
            if (STATE.gaugeEnabled && STATE.globalCoupling) {
                STATE.globalCoupling = false;
            }
            clampGaugeLayerSelection(STATE);
            if (STATE.manifoldMode === 's2' || STATE.manifoldMode === 's3') {
                if (STATE.thetaPattern !== 'random' && STATE.thetaPattern !== 'synchronized') {
                    STATE.thetaPattern = 'random';
                }
                if (STATE.omegaPattern !== 'random' && STATE.omegaPattern !== 'uniform') {
                    STATE.omegaPattern = 'random';
                }
            }
            if (STATE.viewMode !== lastViewMode) {
                runtime.overlayDirty = true;
                lastViewMode = STATE.viewMode;
                updateRenderModeIndicator();
            }
            normalizeSelectedLayers(STATE, STATE.layerCount);
            syncStateToLayerParams(STATE, STATE.selectedLayers);
            sim.writeLayerParams(STATE.layerParams);
            sim.updateFullParams(STATE);
            sim.setManifoldMode(STATE.manifoldMode);
            renderer.invalidateBindGroup();
            // Update UI visibility and pattern options based on manifold
            if (ui?.updateManifoldVisibility) ui.updateManifoldVisibility(STATE.manifoldMode);
            if (ui?.updatePatternOptions) ui.updatePatternOptions(STATE.manifoldMode);
            if (STATE.manifoldMode === 's2' || STATE.manifoldMode === 's3') {
                resetSimulation(sim, STATE, lastExternalCanvas);
            }
            drawKernel(STATE);
            runtime.overlayDirty = true;
            // Reflect new parameter state into URL
            stateAdapter.syncURL(true);
        },
        onApplyGaugeInit: async () => {
            if ((experimentRunner && experimentRunner.isRunning()) || (rcCritSweepRunner && rcCritSweepRunner.isRunning()) || (rcModeCompareRunner && rcModeCompareRunner.isRunning())) return;
            if (STATE.manifoldMode !== 's1' || !STATE.gaugeEnabled) return;
            normalizeSelectedLayers(STATE, STATE.layerCount);
            const targets = STATE.selectedLayers;
            const allLayersSelected = targets.length >= STATE.layerCount;

            let baseGauge = null;
            if (!allLayersSelected && typeof sim.readGaugeField === 'function') {
                baseGauge = await sim.readGaugeField();
                if (!baseGauge && sim.gaugeXData && sim.gaugeYData) {
                    baseGauge = {
                        ax: new Float32Array(sim.gaugeXData),
                        ay: new Float32Array(sim.gaugeYData),
                        graph: sim.graphGaugeData ? new Float32Array(sim.graphGaugeData) : null
                    };
                }
            }

            const rng = makeRng(STATE.seed, `gauge:${STATE.gaugeInitPattern}`);
            applyGaugePattern(
                sim,
                STATE.gaugeInitPattern || 'zero',
                {
                    amplitude: STATE.gaugeInitAmplitude,
                    fluxBias: STATE.gaugeFluxBias,
                    graphSeed: STATE.gaugeGraphSeed
                },
                targets,
                baseGauge,
                rng
            );
            sim.updateFullParams(STATE);
            stateAdapter.syncURL(true);
        },
        onTopologyChange: () => {
            if ((experimentRunner && experimentRunner.isRunning()) || (rcCritSweepRunner && rcCritSweepRunner.isRunning()) || (rcModeCompareRunner && rcModeCompareRunner.isRunning())) return;
            regenerateTopology();
            stateAdapter.syncURL(true);
        },
        onTopologyRegenerate: () => {
            if ((experimentRunner && experimentRunner.isRunning()) || (rcCritSweepRunner && rcCritSweepRunner.isRunning()) || (rcModeCompareRunner && rcModeCompareRunner.isRunning())) return;
            STATE.topologySeed = (STATE.topologySeed || 1) + 1;
            regenerateTopology();
            stateAdapter.syncURL(true);
        },
        onApplyInit: async () => {
            if ((experimentRunner && experimentRunner.isRunning()) || (rcCritSweepRunner && rcCritSweepRunner.isRunning()) || (rcModeCompareRunner && rcModeCompareRunner.isRunning())) return;
            normalizeSelectedLayers(STATE, STATE.layerCount);
            const targets = STATE.selectedLayers;
            const thetaPattern = document.getElementById('theta-pattern-select')?.value || STATE.thetaPattern || 'random';
            const omegaPattern = document.getElementById('omega-pattern-select')?.value || STATE.omegaPattern || 'random';
            const omegaAmp = parseFloat(document.getElementById('omega-amplitude-slider')?.value || STATE.omegaAmplitude || 0.4);
            
            // For partial layer init, we need current state as base
            // For all layers, we can start fresh
            const allLayersSelected = targets.length >= STATE.layerCount;
            
            let thetaBase = null;
            let omegaBase = null;
            
            if (!allLayersSelected) {
                // Try to get current theta from GPU (with retry)
                for (let attempt = 0; attempt < 3 && !thetaBase; attempt++) {
                    thetaBase = (STATE.manifoldMode === 's2' || STATE.manifoldMode === 's3') ? await sim.readS2() : await sim.readTheta();
                    if (!thetaBase) await new Promise(r => setTimeout(r, 16)); // Wait a frame
                }
                // Fallback to CPU-side copy if GPU read fails
                if (STATE.manifoldMode === 's2' || STATE.manifoldMode === 's3') {
                    thetaBase = thetaBase || sim.s2Data || new Float32Array(sim.N * 4);
                    omegaBase = sim.omegaVecData || new Float32Array(sim.N * 4);
                } else {
                    thetaBase = thetaBase || sim.thetaData || new Float32Array(sim.N);
                    omegaBase = sim.getOmega() || new Float32Array(sim.N);
                }
            }

            if (STATE.manifoldMode === 's2' || STATE.manifoldMode === 's3') {
                const vecBase = thetaBase && thetaBase.length === sim.N * 4 ? new Float32Array(thetaBase) : null;
                const omegaVecBase = omegaBase && omegaBase.length === sim.N * 4 ? new Float32Array(omegaBase) : null;
                const thetaRng = makeRng(STATE.seed, `${STATE.manifoldMode}:${thetaPattern}`);
                const omegaRng = makeRng(STATE.seed, `${STATE.manifoldMode}omega:${omegaPattern}`);
                if (STATE.manifoldMode === 's3') {
                    applyS3Pattern(sim, thetaPattern, targets, vecBase, thetaRng);
                    applyOmega3Pattern(sim, omegaPattern, omegaAmp, targets, omegaVecBase, omegaRng);
                } else {
                    applyS2Pattern(sim, thetaPattern, targets, vecBase, thetaRng);
                    applyOmegaVecPattern(sim, omegaPattern, omegaAmp, targets, omegaVecBase, omegaRng);
                }
            } else {
                const thetaRng = makeRng(STATE.seed, `theta:${thetaPattern}`);
                const omegaRng = makeRng(STATE.seed, `omega:${omegaPattern}`);
                applyThetaPattern(sim, thetaPattern, targets, thetaBase, thetaRng, STATE, lastExternalCanvas);
                applyOmegaPattern(sim, omegaPattern, omegaAmp, targets, omegaBase, omegaRng, STATE);
            }
        },
        onOverlayToggle: (enabled) => {
            STATE.graphOverlayEnabled = enabled;
            runtime.overlayDirty = true;
        },
        onSurfaceModeChange: (mode) => {
            STATE.surfaceMode = mode;
            renderer.setMeshMode(mode);
            sim.updateFullParams(STATE);
            sim.setManifoldMode(STATE.manifoldMode);
            updateRenderModeIndicator();
            stateAdapter.syncURL(true);
        },
        onPhaseSpaceToggle: (enabled) => {
            STATE.phaseSpaceEnabled = enabled;
        },
        onSeedChange: (seed) => {
            if ((experimentRunner && experimentRunner.isRunning()) || (rcCritSweepRunner && rcCritSweepRunner.isRunning()) || (rcModeCompareRunner && rcModeCompareRunner.isRunning())) return;
            STATE.seed = normalizeSeed(seed);
            reservoir.setSeed?.(STATE.seed);
            if (STATE.manifoldMode === 's2') {
                applyOmegaVecPattern(sim, STATE.omegaPattern, STATE.omegaAmplitude, null, null, makeRng(STATE.seed, `s2omega:${STATE.omegaPattern}`), STATE);
            } else if (STATE.manifoldMode === 's3') {
                applyOmega3Pattern(sim, STATE.omegaPattern, STATE.omegaAmplitude, null, null, makeRng(STATE.seed, `s3omega:${STATE.omegaPattern}`));
            }
            stateAdapter.syncURL(true);
        },
        onReseed: () => {
            if ((experimentRunner && experimentRunner.isRunning()) || (rcCritSweepRunner && rcCritSweepRunner.isRunning()) || (rcModeCompareRunner && rcModeCompareRunner.isRunning())) return;
            STATE.seed = cryptoSeedFallback();
            reservoir.setSeed?.(STATE.seed);
            resetSimulation(sim, STATE, lastExternalCanvas);
            if (ui?.updateDisplay) ui.updateDisplay();
            stateAdapter.syncURL(true);
        },
        onExperimentConfigChange: () => {
            if ((experimentRunner && experimentRunner.isRunning()) || (rcCritSweepRunner && rcCritSweepRunner.isRunning()) || (rcModeCompareRunner && rcModeCompareRunner.isRunning())) return;
            stateAdapter.syncURL(true);
        },
        onSweepConfigChange: () => {
            stateAdapter.syncURL(true);
        },
        onRunSweep: async () => {
            if (!discoverySweepController || discoverySweepController.isRunning()) return;
            if ((experimentRunner && experimentRunner.isRunning()) || (rcCritSweepRunner && rcCritSweepRunner.isRunning()) || (rcModeCompareRunner && rcModeCompareRunner.isRunning())) return;
            if (!STATE.showStatistics) {
                alert('Enable statistics to run parameter sweep.');
                return;
            }
            const param = STATE.sweepParam || 'gaugeCharge';
            const from = Number.isFinite(STATE.sweepFrom) ? STATE.sweepFrom : 0;
            const to = Number.isFinite(STATE.sweepTo) ? STATE.sweepTo : 2;
            const steps = Number.isFinite(STATE.sweepSteps) ? STATE.sweepSteps : 5;
            const settleFrames = Number.isFinite(STATE.sweepSettleFrames) ? STATE.sweepSettleFrames : 180;
            setSweepUIState(true, 'running (0/0)');
            await discoverySweepController.run({ param, from, to, steps, settleFrames });
            stateAdapter.syncURL(true);
        },
        onCancelSweep: () => {
            if (!discoverySweepController || !discoverySweepController.isRunning()) return;
            discoverySweepController.cancel();
            setSweepUIState(true, 'canceling...');
        },
        onExportSweepJSON: () => {
            if (!discoverySweepLastExport) return;
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            downloadJSON(discoverySweepLastExport, `kuramoto_sweep_${ts}.json`);
        },
        onExportSweepCSV: () => {
            if (!discoverySweepController) return;
            const csv = discoverySweepController.exportCSV();
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            downloadCSV(csv, `kuramoto_sweep_${ts}.csv`);
        },
        onCompareCapture: (slot) => {
            if (slot !== 'a' && slot !== 'b') return;
            void captureCompareSnapshot(slot);
        },
        onCompareRestore: (slot) => {
            if (slot !== 'a' && slot !== 'b') return;
            void restoreCompareSnapshot(slot);
        },
        onURLSync: () => {
            stateAdapter.syncURL(true);
        },
        onExperimentRun: null,
        onExperimentCancel: null,
        onExperimentExport: null,
        onToggleStatistics: (enabled) => {
            STATE.showStatistics = enabled;
            if (!enabled) {
                if (experimentRunner && experimentRunner.isRunning()) {
                    experimentRunner.cancel();
                }
                if (rcCritSweepRunner && rcCritSweepRunner.isRunning()) {
                    rcCritSweepRunner.cancel();
                }
                if (rcModeCompareRunner && rcModeCompareRunner.isRunning()) {
                    rcModeCompareRunner.cancel();
                }
                // Stop K-scan
                if (stats.isScanning) {
                    stats.isScanning = false;
                    stats.scanProgress = 0;
                    runtime.kScanner = null;
                    document.getElementById('kscan-btn')?.classList.remove('active');
                    const progress = document.getElementById('kscan-progress');
                    if (progress) progress.textContent = '';
                }

                // Stop LLE
                if (lyapunovCalc.isRunning) {
                    lyapunovCalc.stop();
                    const startBtn = document.getElementById('lle-start-btn');
                    const stopBtn = document.getElementById('lle-stop-btn');
                    if (stopBtn) stopBtn.disabled = true;
                    if (startBtn) startBtn.disabled = true;
                    if (lleUpdateInterval) {
                        clearInterval(lleUpdateInterval);
                        lleUpdateInterval = null;
                    }
                    updateLLEDisplay();
                }

                // Cancel FSS if running
                if (fssRunning) {
                    fssAbort = true;
                }
            } else {
                fssAbort = false;
            }

            const setDisabled = (id, disabled) => {
                const el = document.getElementById(id);
                if (el) el.disabled = disabled;
            };
            setDisabled('kscan-btn', !enabled);
            setDisabled('findkc-btn', !enabled);
            setDisabled('lle-start-btn', !enabled || lyapunovCalc.isRunning);
            setDisabled('lle-stop-btn', !enabled || !lyapunovCalc.isRunning);
            setDisabled('fss-start-btn', !enabled || fssRunning);
            setDisabled('exp-run-btn', !enabled);
            setDisabled('exp-export-btn', !enabled || !(experimentController && experimentController.hasExport()));
            setDisabled('sweep-run-btn', !enabled || (discoverySweepController && discoverySweepController.isRunning()));
            setDisabled('sweep-cancel-btn', !enabled || !(discoverySweepController && discoverySweepController.isRunning()));
            setDisabled('sweep-export-json-btn', !enabled || !discoverySweepLastExport);
            setDisabled('sweep-export-csv-btn', !enabled || !discoverySweepLastExport);
            setDisabled('rc-ksweep-btn', !enabled);
            setDisabled('rc-ksweep-export-json', !enabled || !rcCritSweepLastExport);
            setDisabled('rc-ksweep-export-csv', !enabled || !(rcCritSweepInfo.results && rcCritSweepInfo.results.length > 0));
            setDisabled('rc-mode-compare-btn', !enabled);
            setDisabled('rc-mode-compare-export-json', !enabled || !rcModeCompareLastExport);
            setDisabled('rc-mode-compare-export-csv', !enabled || !(rcModeCompareInfo.results && rcModeCompareInfo.results.length > 0));

            stateAdapter.syncURL(true);
        },
        onDrawKernel: () => { drawKernel(STATE); },
        onPause: () => { 
            STATE.paused = !STATE.paused; 
            document.getElementById('pause-btn').textContent = STATE.paused ? 'Resume' : 'Pause';
        },
    onReset: () => { resetSimulation(sim); stateAdapter.syncURL(true); },
    onRandomize: () => { randomizeTheta(sim, STATE.seed, STATE.manifoldMode); stateAdapter.syncURL(true); },
        onPreset: (name) => {
            void loadPreset({ name, sim, ui, state: STATE, lastExternalCanvas }).then(() => {
                stateAdapter.syncURL(true);
            });
        },
        onPatternChange: (key) => {
            if(key === 'thetaPattern') applyThetaPattern(sim, STATE.thetaPattern, null, null, makeRng(STATE.seed, `theta:${STATE.thetaPattern}`), STATE, lastExternalCanvas);
            if(key === 'omegaPattern') applyOmegaPattern(sim, STATE.omegaPattern, STATE.omegaAmplitude, null, null, makeRng(STATE.seed, `omega:${STATE.omegaPattern}`), STATE);
        },
        onExternalInput: (canvas) => {
            lastExternalCanvas = canvas;
            applyExternalInput(device, sim, canvas, STATE.omegaAmplitude);
            // Also load texture for rendering if colormap is set to image mode
            renderer.loadTextureFromCanvas(canvas);
            // If theta pattern is set to image, reinitialize it
            if (STATE.thetaPattern === 'image') {
                applyThetaPattern(sim, 'image', null, null, makeRng(STATE.seed, 'theta:image'), STATE, lastExternalCanvas);
            }
        },
        onResizeGrid: async (newSize) => {
            if (experimentRunner && experimentRunner.isRunning()) {
                experimentRunner.cancel();
            }
            if (rcCritSweepRunner && rcCritSweepRunner.isRunning()) {
                rcCritSweepRunner.cancel();
            }
            if (rcModeCompareRunner && rcModeCompareRunner.isRunning()) {
                rcModeCompareRunner.cancel();
            }
            if (gridResizeInProgress) {
                return;
            }
            gridResizeInProgress = true;
            const oldSize = STATE.gridSize;
            STATE.gridSize = newSize;
            
            try {
                // Use state-preserving resize to interpolate theta
                const interpolatedTheta = await sim.resizePreservingState(newSize);
                
                // Apply interpolated theta
                sim.writeTheta(interpolatedTheta);
                
                // Interpolate omega as well (using scalar interpolation, NOT phase interpolation)
                if (sim.omegaData) {
                    const interpolatedOmega = Simulation.interpolateScalar(sim.omegaData, oldSize, newSize, sim.layers || 1);
                    sim.writeOmega(interpolatedOmega);
                    sim.storeOmega(interpolatedOmega);
                } else {
                    // No omega data - reinitialize
                    resetSimulation(sim, STATE, lastExternalCanvas);
                }
            } catch (e) {
                console.warn('State-preserving resize failed, falling back to reset:', e);
                sim.resize(newSize);
                resetSimulation(sim, STATE, lastExternalCanvas);
            } finally {
                gridResizeInProgress = false;
            }
            
            // Rebuild rendering buffers to match new grid
            renderer.rebuildMesh(newSize);
            
            stats.resize(newSize * newSize * STATE.layerCount);
            lyapunovCalc.resize(newSize * newSize * STATE.layerCount);
            reservoir.resize(newSize);
            renderer.invalidateBindGroup(); // Buffers changed, need new bind group
            regenerateTopology();
            drawKernel(STATE);
            sim.setManifoldMode(STATE.manifoldMode);
        },
        onLayerCountChange: (newCount) => {
            if (experimentRunner && experimentRunner.isRunning()) {
                experimentRunner.cancel();
            }
            if (rcCritSweepRunner && rcCritSweepRunner.isRunning()) {
                rcCritSweepRunner.cancel();
            }
            if (rcModeCompareRunner && rcModeCompareRunner.isRunning()) {
                rcModeCompareRunner.cancel();
            }
            void rebuildLayerCount(newCount);
        },
        onLayerSelect: (layerIdx, selected, prevSelected, prevActive) => {
            if ((experimentRunner && experimentRunner.isRunning()) || (rcCritSweepRunner && rcCritSweepRunner.isRunning()) || (rcModeCompareRunner && rcModeCompareRunner.isRunning())) return;
            // Use passed previous selection (UI already updated STATE before calling us)
            const prev = Array.isArray(prevSelected) && prevSelected.length > 0
                ? prevSelected
                : [prevActive ?? STATE.activeLayer ?? 0];
            syncStateToLayerParams(STATE, prev);
            STATE.activeLayer = layerIdx;
            STATE.selectedLayers = Array.isArray(selected) && selected.length > 0
                ? selected
                : [layerIdx];
            normalizeSelectedLayers(STATE, STATE.layerCount);
            applyLayerParamsToState(STATE, layerIdx);
            sim.writeLayerParams(STATE.layerParams);
            sim.updateFullParams(STATE);
            sim.setManifoldMode(STATE.manifoldMode);
            drawKernel(STATE);
            if (ui?.updateDisplay) ui.updateDisplay();
            stateAdapter.syncURL(true);
        },
        onStartKScan: () => {
            if (!STATE.showStatistics) return;
            if (stats.isScanning) return;
            runtime.kScanner = stats.createKScanner(sim, STATE, {
                K_min: 0.1,
                K_max: 2.5,
                K_steps: 20,
                warmupSteps: 150,
                measureSteps: 100
            }).start();
            document.getElementById('kscan-btn')?.classList.add('active');
        },
        onFindKc: async () => {
            if (!STATE.showStatistics) return;
            if (!stats.estimatedKc && stats.phaseDiagramData.length === 0) {
                alert('Run K-scan first to estimate Kc');
                return;
            }
            if (stats.estimatedKc) {
                STATE.K0 = stats.estimatedKc;
                sim.updateFullParams(STATE);
                sim.setManifoldMode(STATE.manifoldMode);
                ui.updateDisplay();
            }
        },
        onToggleLogScale: () => {
            // Toggle log scale on susceptibility plot
            if (chi_plot) {
                chi_plot.logScale = !chi_plot.logScale;
                console.log(`Susceptibility plot log scale: ${chi_plot.logScale ? 'ON' : 'OFF'}`);
            }
        },
        onExportStats: () => {
            const csv = stats.exportCSV();
            downloadCSV(csv, 'kuramoto_stats.csv');
        },
        onExportPhaseDiagram: () => {
            const csv = stats.exportPhaseDiagramCSV();
            downloadCSV(csv, 'kuramoto_phase_diagram.csv');
        },
        // Reservoir Computing callbacks
        onRCEnable: (enabled) => {
            STATE.rcEnabled = enabled;
            if (enabled) {
                reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
                // Write input weights to GPU
                const weights = reservoir.getInputWeights();
                const nonZero = weights.filter(w => w > 0).length;
                const maxWeight = Math.max(...weights);
                console.log(`RC enabled: ${nonZero} input neurons, max weight=${maxWeight.toFixed(3)}, region=${STATE.rcInputRegion}`);
                writeRCInputWeights();
            } else {
                // Clear input signal when disabling RC
                sim.setInputSignal(0);
                console.log('RC disabled');
            }
            stateAdapter.syncURL(true);
        },
        onRCConfigure: () => {
            reservoir.setFeatureBudget(STATE.rcMaxFeatures);
            reservoir.setHistoryLength(STATE.rcHistoryLength);
            reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
            reservoir.setTask(STATE.rcTask);
            // Write input weights to GPU
            writeRCInputWeights();
            stateAdapter.syncURL(true);
        },
        onRCStartTraining: () => {
            if (!STATE.rcEnabled) {
                alert('Enable Reservoir Computing first');
                return;
            }
            reservoir.setFeatureBudget(STATE.rcMaxFeatures);
            reservoir.setHistoryLength(STATE.rcHistoryLength);
            reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
            reservoir.setTask(STATE.rcTask);
            // Write input weights to GPU
            writeRCInputWeights();
            reservoir.startTraining();
            STATE.rcTraining = true;
            STATE.rcInference = false;
            updateRCDisplay();
            stateAdapter.syncURL(true);
        },
        onRCStopTraining: () => {
            STATE.rcTraining = false;
            const nrmse = reservoir.stopTraining();
            STATE.rcNRMSE = nrmse;
            updateRCDisplay();
            stateAdapter.syncURL(true);
        },
        onRCStartInference: () => {
            if (reservoir.startInference()) {
                STATE.rcInference = true;
                STATE.rcTraining = false;
                updateRCDisplay();
                stateAdapter.syncURL(true);
            }
        },
        onRCStopInference: () => {
            reservoir.stopInference();
            STATE.rcInference = false;
            updateRCDisplay();
            stateAdapter.syncURL(true);
        },
        onDrawMode: (mode) => {
            STATE.drawMode = mode;
        },
        onClearCanvas: () => {
            if (renderer.clearDrawOverlay) renderer.clearDrawOverlay();
        }
    });

    ({ experimentRunner, experimentController } = initExperimentControllers({
        device,
        sim,
        stats,
        state: STATE,
        ui,
        resetSimulation,
        getLastExternalCanvas: () => lastExternalCanvas,
        downloadJSON,
        onUpdate: (info) => experimentController?.handleRunnerUpdate(info),
    }));

    rcCritSweepRunner = new RCCriticalitySweepRunner({
        device,
        sim,
        stats,
        reservoir,
        writeRCInputWeights: () => writeRCInputWeights(),
        setInputSignal: (signal) => sim.setInputSignal(signal),
        getActiveLayerTheta: (thetaFull) => getActiveLayerThetaForRC(thetaFull),
        resetSimulation: () => resetSimulation(sim),
        setK: (K) => {
            STATE.K0 = K;
            STATE.frameTime = 0;
            sim.updateFullParams(STATE);
            sim.setManifoldMode(STATE.manifoldMode);
            if (ui?.updateDisplay) ui.updateDisplay();
        },
        onUpdate: (info) => {
            rcCritSweepInfo = info;
            if (!info.running && (info.phase === 'done' || info.phase === 'canceled')) {
                rcCritSweepLastExport = rcCritSweepRunner.exportJSON();
                if (rcCritSweepPrevPaused !== null) {
                    STATE.paused = rcCritSweepPrevPaused;
                    rcCritSweepPrevPaused = null;
                }
                // Restore current K0 in URL/UI now that sweep is finished.
                stateAdapter.syncURL(true);
            }
            updateRCDisplay();
        },
    });

    rcModeCompareRunner = new RCInjectionModeCompareRunner({
        device,
        sim,
        stats,
        reservoir,
        writeRCInputWeights: () => writeRCInputWeights(),
        setInputSignal: (signal) => sim.setInputSignal(signal),
        getActiveLayerTheta: (thetaFull) => getActiveLayerThetaForRC(thetaFull),
        setInjectionMode: (mode) => {
            STATE.rcInjectionMode = mode;
            sim.updateFullParams(STATE);
            sim.setManifoldMode(STATE.manifoldMode);
            if (ui?.updateDisplay) ui.updateDisplay();
        },
        resetSimulation: () => resetSimulation(sim),
        onUpdate: (info) => {
            rcModeCompareInfo = info;
            if (!info.running && (info.phase === 'done' || info.phase === 'canceled')) {
                rcModeCompareLastExport = rcModeCompareRunner.exportJSON();
                stateAdapter.syncURL(true);
            }
            updateRCDisplay();
        },
    });

    const snapshotController = createSnapshotController({
        state: STATE,
        sim,
        stats,
        renderer,
        lyapunovCalc,
        reservoir,
        getUI: () => ui,
        stateAdapter,
        drawKernel,
        regenerateTopology,
        normalizeSeed,
        ensureLayerParams,
        normalizeSelectedLayers,
        applyLayerParamsToState,
        syncStateToLayerParams,
        encodeFloat32ToBase64,
        decodeBase64ToFloat32,
        estimateBase64SizeBytes,
        downloadJSON,
        formatBytes,
        isExperimentRunning: () => !!(experimentRunner && experimentRunner.isRunning()),
        cancelExperiment: () => {
            if (experimentRunner) experimentRunner.cancel();
        },
        rebuildLayerCount,
        isGridResizeInProgress: () => gridResizeInProgress,
        setGridResizeInProgress: (value) => {
            gridResizeInProgress = !!value;
        },
    });
    snapshotController.bindControls();

    const captureMainThumbnail = () => {
        try {
            const thumb = document.createElement('canvas');
            thumb.width = 96;
            thumb.height = 96;
            const ctx = thumb.getContext('2d');
            if (!ctx) return null;
            ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
            return thumb.toDataURL('image/png');
        } catch (e) {
            return null;
        }
    };

    const renderSweepResults = (results = []) => {
        const root = document.getElementById('sweep-results');
        if (!root) return;
        root.innerHTML = '';
        results.forEach((row) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'sweep-row';
            const val = Number.isFinite(row.value) ? row.value : 0;
            const r = Number.isFinite(row.metrics?.R) ? row.metrics.R : 0;
            const localR = Number.isFinite(row.metrics?.localR) ? row.metrics.localR : 0;
            const chi = Number.isFinite(row.metrics?.chi) ? row.metrics.chi : 0;
            rowEl.innerHTML = `
                <img class="sweep-thumb" alt="sweep thumbnail" src="${row.thumbnail || ''}">
                <div>
                    <div style="font-size:11px; color:#ddd;">${row.param} = ${val.toFixed(3)}</div>
                    <div>R=${r.toFixed(3)} | localR=${localR.toFixed(3)}</div>
                    <div>chi=${chi.toFixed(4)}</div>
                </div>
            `;
            root.appendChild(rowEl);
        });
    };

    const setSweepUIState = (running, statusText = null) => {
        const runBtn = document.getElementById('sweep-run-btn');
        const cancelBtn = document.getElementById('sweep-cancel-btn');
        const exportJsonBtn = document.getElementById('sweep-export-json-btn');
        const exportCsvBtn = document.getElementById('sweep-export-csv-btn');
        const statusEl = document.getElementById('sweep-status');
        if (runBtn) runBtn.disabled = !!running;
        if (cancelBtn) cancelBtn.disabled = !running;
        if (exportJsonBtn) exportJsonBtn.disabled = running || !discoverySweepLastExport;
        if (exportCsvBtn) exportCsvBtn.disabled = running || !discoverySweepLastExport;
        if (statusEl && statusText !== null) statusEl.textContent = statusText;
    };

    const setCompareUIState = () => {
        const a = compareSnapshots.a;
        const b = compareSnapshots.b;
        const aThumb = document.getElementById('compare-a-thumb');
        const bThumb = document.getElementById('compare-b-thumb');
        const aMeta = document.getElementById('compare-a-meta');
        const bMeta = document.getElementById('compare-b-meta');
        const diffMeta = document.getElementById('compare-diff-meta');
        const restoreA = document.getElementById('compare-restore-a-btn');
        const restoreB = document.getElementById('compare-restore-b-btn');
        if (restoreA) restoreA.disabled = !a;
        if (restoreB) restoreB.disabled = !b;
        if (aThumb) aThumb.src = a?.thumbnail || '';
        if (bThumb) bThumb.src = b?.thumbnail || '';
        if (aMeta) {
            aMeta.textContent = a
                ? `${a.state.manifoldMode}/${a.state.topologyMode} R=${(a.metrics?.R ?? 0).toFixed(3)} χ=${(a.metrics?.chi ?? 0).toFixed(4)}`
                : 'empty';
        }
        if (bMeta) {
            bMeta.textContent = b
                ? `${b.state.manifoldMode}/${b.state.topologyMode} R=${(b.metrics?.R ?? 0).toFixed(3)} χ=${(b.metrics?.chi ?? 0).toFixed(4)}`
                : 'empty';
        }
        if (diffMeta) {
            if (a && b) {
                const dR = (b.metrics?.R ?? 0) - (a.metrics?.R ?? 0);
                const dChi = (b.metrics?.chi ?? 0) - (a.metrics?.chi ?? 0);
                diffMeta.textContent = `ΔR: ${dR.toFixed(4)} | Δχ: ${dChi.toFixed(5)}`;
            } else {
                diffMeta.textContent = 'ΔR: — | Δχ: —';
            }
        }
    };

    const captureCompareSnapshot = async (slot) => {
        const manifold = STATE.manifoldMode || 's1';
        const snapshot = {
            createdAt: new Date().toISOString(),
            state: JSON.parse(JSON.stringify({
                manifoldMode: STATE.manifoldMode,
                topologyMode: STATE.topologyMode,
                ruleMode: STATE.ruleMode,
                K0: STATE.K0,
                range: STATE.range,
                gaugeEnabled: STATE.gaugeEnabled,
                gaugeMode: STATE.gaugeMode,
                gaugeCharge: STATE.gaugeCharge,
                gaugeMatterCoupling: STATE.gaugeMatterCoupling,
                gaugeStiffness: STATE.gaugeStiffness,
                gaugeDamping: STATE.gaugeDamping,
                gaugeNoise: STATE.gaugeNoise,
                gaugeDtScale: STATE.gaugeDtScale,
                activeLayer: STATE.activeLayer,
                colormap: STATE.colormap,
            })),
            theta: null,
            vec: null,
            omega: null,
            omegaVec: null,
            gauge: null,
            thumbnail: captureMainThumbnail(),
            metrics: {
                R: Number.isFinite(stats.R) ? stats.R : 0,
                localR: Number.isFinite(stats.localR) ? stats.localR : 0,
                chi: Number.isFinite(stats.chi) ? stats.chi : 0,
            },
        };
        if (manifold === 's1') {
            snapshot.theta = await sim.readTheta();
            if (!snapshot.theta && sim.thetaData) snapshot.theta = new Float32Array(sim.thetaData);
            snapshot.omega = sim.getOmega() ? new Float32Array(sim.getOmega()) : null;
            snapshot.gauge = await sim.readGaugeField();
            if (!snapshot.gauge && sim.gaugeXData && sim.gaugeYData) {
                snapshot.gauge = {
                    ax: new Float32Array(sim.gaugeXData),
                    ay: new Float32Array(sim.gaugeYData),
                    graph: sim.graphGaugeData ? new Float32Array(sim.graphGaugeData) : null
                };
            }
        } else {
            snapshot.vec = await sim.readS2();
            if (!snapshot.vec && sim.s2Data) snapshot.vec = new Float32Array(sim.s2Data);
            snapshot.omegaVec = sim.omegaVecData ? new Float32Array(sim.omegaVecData) : null;
        }
        compareSnapshots[slot] = snapshot;
        setCompareUIState();
    };

    const restoreCompareSnapshot = async (slot) => {
        const snap = compareSnapshots[slot];
        if (!snap) return;
        Object.assign(STATE, snap.state || {});
        normalizeSelectedLayers(STATE, STATE.layerCount);
        syncStateToLayerParams(STATE, STATE.selectedLayers);
        if (snap.theta) sim.writeTheta(snap.theta);
        if (snap.vec) sim.writeS2(snap.vec);
        if (snap.omega) {
            sim.writeOmega(snap.omega);
            sim.storeOmega(snap.omega);
        }
        if (snap.omegaVec && typeof sim.writeOmegaVec === 'function') {
            sim.writeOmegaVec(snap.omegaVec);
        }
        if (snap.gauge?.ax && snap.gauge?.ay && typeof sim.writeGaugeField === 'function') {
            sim.writeGaugeField(snap.gauge.ax, snap.gauge.ay);
        }
        if (snap.gauge?.graph && typeof sim.writeGraphGauge === 'function') {
            sim.writeGraphGauge(snap.gauge.graph);
        }
        sim.updateFullParams(STATE);
        sim.setManifoldMode(STATE.manifoldMode);
        sim.writeLayerParams(STATE.layerParams);
        drawKernel(STATE);
        ui?.updateDisplay?.();
        stateAdapter.syncURL(true);
    };

    discoverySweepController = createDiscoverySweepController({
        state: STATE,
        sim,
        stats,
        ui,
        captureThumbnail: captureMainThumbnail,
        onStatus: (text) => setSweepUIState(discoverySweepController?.isRunning?.(), text),
        onResult: (_row, idx, total, results) => {
            renderSweepResults(results);
            setSweepUIState(true, `running (${idx + 1}/${total})`);
        },
        onDone: ({ canceled, results }) => {
            discoverySweepLastExport = {
                generatedAt: new Date().toISOString(),
                canceled,
                state: {
                    seed: STATE.seed,
                    manifoldMode: STATE.manifoldMode,
                    topologyMode: STATE.topologyMode,
                    gaugeEnabled: STATE.gaugeEnabled,
                    gaugeMode: STATE.gaugeMode,
                },
                sweep: {
                    param: STATE.sweepParam,
                    from: STATE.sweepFrom,
                    to: STATE.sweepTo,
                    steps: STATE.sweepSteps,
                    settleFrames: STATE.sweepSettleFrames,
                },
                results,
            };
            renderSweepResults(results);
            setSweepUIState(false, canceled ? 'canceled' : 'done');
        },
    });
    setSweepUIState(false, 'idle');
    setCompareUIState();
    
    // Initialize plots after DOM is ready
    setTimeout(() => {
        const initPlots = () => {
            R_plot = new TimeSeriesPlot('R-plot', {
                yMin: 0, yMax: 1,
                color: '#4CAF50',
                fillColor: 'rgba(76, 175, 80, 0.2)',
                label: 'Local R̄',
                showYAxis: true
            });
            
            chi_plot = new TimeSeriesPlot('chi-plot', {
                yMin: 0, yMax: 'auto',
                autoScale: true,
                color: '#FF9800',
                fillColor: 'rgba(255, 152, 0, 0.2)',
                label: 'χ(t)',
                showYAxis: true  // Show Y axis with values
            });
            
            phaseDiagramPlot = new PhaseDiagramPlot('phase-diagram');
            
            // Initialize RC plot
            rcPlot = new TimeSeriesPlot('rc-plot', {
                yMin: -1.5, yMax: 1.5,
                color: '#2196F3',
                fillColor: 'rgba(33, 150, 243, 0.2)',
                label: 'Prediction'
            });

            phaseSpacePlot = new PhaseSpacePlot('phase-space-canvas', {
                maxPoints: 2000,
                pointSize: 1.6,
                ringColor: '#2c2c3d',
                axisColor: '#1e1e2e',
                pointColor: 'rgba(74, 158, 255, 0.9)',
                bg: '#0f0f1a'
            });

            rcKsweepPlot = new TimeSeriesPlot('rc-ksweep-plot', {
                yMin: 0, yMax: 2,
                autoScale: true,
                color: '#FF9800',
                fillColor: 'rgba(255,152,0,0.2)',
                showGrid: true,
                showYAxis: true,
                label: 'Test NRMSE'
            });
        };

        initPlots();

        window.addEventListener('resize', () => {
            initPlots();
        }, { passive: true });
        
        // Initialize LLE controls
        initLLEControls();
        
        // Initialize FSS controls
        initFSSControls();
        
        // Initialize RC controls
        initRCControls();

        // Apply initial disabled state for analysis controls
        const statsEnabled = !!STATE.showStatistics;
        const kscanBtn = document.getElementById('kscan-btn');
        if (kscanBtn) kscanBtn.disabled = !statsEnabled;
        const findkcBtn = document.getElementById('findkc-btn');
        if (findkcBtn) findkcBtn.disabled = !statsEnabled;
        const lleStartBtn = document.getElementById('lle-start-btn');
        if (lleStartBtn) lleStartBtn.disabled = !statsEnabled;
        const fssBtn = document.getElementById('fss-start-btn');
        if (fssBtn) fssBtn.disabled = !statsEnabled;
        const sweepBtn = document.getElementById('sweep-run-btn');
        if (sweepBtn) sweepBtn.disabled = !statsEnabled;
    }, 100);
    
    // ============= LYAPUNOV EXPONENT =============
    
    function initLLEControls() {
        const startBtn = document.getElementById('lle-start-btn');
        const stopBtn = document.getElementById('lle-stop-btn');
        
        if (startBtn) {
            startBtn.addEventListener('click', async () => {
                if (!STATE.showStatistics) return;
                if (lyapunovCalc.isRunning) return;
                
                // Read current theta from GPU
                const theta = await sim.readTheta();
                lyapunovCalc.start(theta, makeRng(STATE.seed, 'lle'));
                
                startBtn.disabled = true;
                stopBtn.disabled = false;
                
                // Update display periodically
                lleUpdateInterval = setInterval(updateLLEDisplay, 200);
            });
        }
        
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                lyapunovCalc.stop();
                stopBtn.disabled = true;
                startBtn.disabled = false;
                if (lleUpdateInterval) {
                    clearInterval(lleUpdateInterval);
                    lleUpdateInterval = null;
                }
            });
        }
    }
    
    function updateLLEDisplay() {
        const lleEl = document.getElementById('stat-lle');
        const statusEl = document.getElementById('stat-lle-status');
        const iterEl = document.getElementById('lle-iterations');
        const marker = document.getElementById('lle-marker');
        
        if (lleEl) {
            if (STATE.manifoldMode !== 's1') {
                lleEl.textContent = '--';
            } else {
                lleEl.textContent = lyapunovCalc.lle.toFixed(4);
            }
        }
        if (statusEl) {
            statusEl.textContent = STATE.manifoldMode !== 's1' ? 'N/A (S¹ only)' : lyapunovCalc.getInterpretation();
        }
        if (iterEl) {
            iterEl.textContent = STATE.manifoldMode !== 's1' ? '--' : `${lyapunovCalc.renormCount} renorms`;
        }
        if (marker) {
            if (STATE.manifoldMode !== 's1') {
                marker.style.left = '50%';  // Center marker when N/A
            } else {
                // Map LLE from [-0.5, 0.5] to [0%, 100%]
                const pos = Math.min(100, Math.max(0, (lyapunovCalc.lle + 0.5) * 100));
                marker.style.left = `${pos}%`;
            }
        }
    }
    
    // Step LLE calculation when simulation runs
    async function stepLLE() {
        if (!lyapunovCalc.isRunning || STATE.paused) return;
        if (STATE.manifoldMode !== 's1') return;
        
        const theta = await sim.readTheta();
        const omega = sim.getOmega();
        
        if (theta && omega) {
            lyapunovCalc.step(theta, omega, STATE.K0, STATE.dt * STATE.timeScale, STATE.range, STATE.gridSize);
        }
    }
    
    // ============= FINITE-SIZE SCALING =============
    let fssData = [];  // Array of {N, Kc} pairs
    let fssRunning = false;
    let fssExtrapolatedKc = null;
    let fssAbort = false;
    
    function initFSSControls() {
        const startBtn = document.getElementById('fss-start-btn');
        
        if (startBtn) {
            startBtn.addEventListener('click', async () => {
                if (fssRunning) return;
                if (!STATE.showStatistics) return;
                await runFiniteSizeScaling();
            });
        }
    }
    
    async function runFiniteSizeScaling() {
        fssRunning = true;
        fssAbort = false;
        fssData = [];
        
        const progressEl = document.getElementById('fss-progress');
        const kcEl = document.getElementById('stat-kc-extrapolated');
        const startBtn = document.getElementById('fss-start-btn');
        
        if (startBtn) startBtn.disabled = true;
        
        // Grid sizes to test (must be multiples of 64)
        const gridSizes = [64, 128, 192, 256];
        const originalGridSize = STATE.gridSize;
        const originalK = STATE.K0;
        
        for (let i = 0; i < gridSizes.length; i++) {
            if (fssAbort || !STATE.showStatistics) break;
            const gridSize = gridSizes[i];
            
            if (progressEl) {
                progressEl.textContent = `${gridSize}×${gridSize} (${i+1}/${gridSizes.length})`;
            }
            
            // Resize simulation
            STATE.gridSize = gridSize;
            sim.resize(gridSize);
            stats.resize(gridSize * gridSize * STATE.layerCount);
            renderer.invalidateBindGroup();
            resetSimulation(sim, STATE, lastExternalCanvas);
            sim.updateFullParams(STATE);
            sim.setManifoldMode(STATE.manifoldMode);
            
            // Run K-scan at this size
            const scanner = stats.createKScanner(sim, STATE, {
                K_min: 0.1,
                K_max: 2.5,
                K_steps: 15,  // Fewer steps for faster FSS
                warmupSteps: 100,
                measureSteps: 80
            }).start();
            
            // Wait for scan to complete
            await new Promise(resolve => {
                const checkComplete = setInterval(() => {
                    if (fssAbort || !STATE.showStatistics) {
                        clearInterval(checkComplete);
                        resolve();
                        return;
                    }
                    // Step the simulation and scanner
                    const encoder = device.createCommandEncoder();
                    sim.step(encoder, STATE.delaySteps, STATE.globalCoupling, true);
                    sim.requestGlobalOrderReadback(encoder);
                    device.queue.submit([encoder.finish()]);
                    
                    sim.processReadback().then(result => {
                        if (result) {
                            stats.update(result.cos, result.sin, result.localStats);
                        }
                        
                        runtime.kScanner = stats.createKScanner(sim, STATE).step(runtime.kScanner || scanner);

                        if (!runtime.kScanner || runtime.kScanner.phase === 'done') {
                            clearInterval(checkComplete);
                            
                            // Record Kc for this grid size
                            if (stats.estimatedKc !== null) {
                                fssData.push({ N: gridSize, Kc: stats.estimatedKc });
                            }
                            resolve();
                        }
                    });
                }, 16);  // ~60fps
            });
            
            // Small delay between sizes
            await new Promise(r => setTimeout(r, 100));
        }
        
        // Restore original grid size
        STATE.gridSize = originalGridSize;
        STATE.K0 = originalK;
        sim.resize(originalGridSize);
        stats.resize(originalGridSize * originalGridSize * STATE.layerCount);
        renderer.invalidateBindGroup();
        resetSimulation(sim, STATE, lastExternalCanvas);
        sim.updateFullParams(STATE);
        sim.setManifoldMode(STATE.manifoldMode);
        ui.updateDisplay();
        
        if (fssAbort || !STATE.showStatistics) {
            if (progressEl) progressEl.textContent = 'Canceled';
        } else {
            // Extrapolate Kc to N→∞
            if (fssData.length >= 2) {
                fssExtrapolatedKc = extrapolateKc(fssData);
                if (kcEl) {
                    kcEl.textContent = fssExtrapolatedKc.toFixed(3);
                }
            }
            
            // Draw FSS plot
            drawFSSPlot();
            
            if (progressEl) progressEl.textContent = 'Done!';
        }

        if (startBtn) startBtn.disabled = !STATE.showStatistics;
        fssRunning = false;
    }
    
    function drawFSSPlot() {
        const canvas = document.getElementById('fss-plot');
        if (!canvas || fssData.length === 0) return;
        
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        
        // Clear
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, w, h);
        
        // Find data range
        const xValues = fssData.map(d => 1 / Math.sqrt(d.N * d.N));
        const yValues = fssData.map(d => d.Kc);
        
        const xMin = 0;
        const xMax = Math.max(...xValues) * 1.2;
        const yMin = Math.min(...yValues) * 0.9;
        const yMax = Math.max(...yValues) * 1.1;
        
        // Draw axes
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, 10);
        ctx.lineTo(40, h - 25);
        ctx.lineTo(w - 10, h - 25);
        ctx.stroke();
        
        // Draw data points
        ctx.fillStyle = '#4CAF50';
        for (const point of fssData) {
            const x = 40 + (1 / Math.sqrt(point.N * point.N) - xMin) / (xMax - xMin) * (w - 50);
            const y = h - 25 - (point.Kc - yMin) / (yMax - yMin) * (h - 35);
            
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Label with grid size
            ctx.fillStyle = '#888';
            ctx.font = '9px sans-serif';
            ctx.fillText(`${point.N}²`, x - 8, y - 10);
            ctx.fillStyle = '#4CAF50';
        }
        
        // Draw extrapolation line
        if (fssExtrapolatedKc !== null && fssData.length >= 2) {
            const n = fssData.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            for (const point of fssData) {
                const x = 1 / Math.sqrt(point.N * point.N);
                sumX += x;
                sumY += point.Kc;
                sumXY += x * point.Kc;
                sumX2 += x * x;
            }
            const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            const intercept = fssExtrapolatedKc;
            
            ctx.strokeStyle = '#FF9800';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            
            const x1 = 40;
            const y1 = h - 25 - (intercept - yMin) / (yMax - yMin) * (h - 35);
            const x2 = w - 10;
            const y2 = h - 25 - (intercept + slope * xMax - yMin) / (yMax - yMin) * (h - 35);
            
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Mark Kc(∞)
            ctx.fillStyle = '#FF9800';
            ctx.beginPath();
            ctx.arc(x1, y1, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '10px sans-serif';
            ctx.fillText(`Kc(∞)=${intercept.toFixed(2)}`, x1 + 10, y1 + 4);
        }
        
        // Axis labels
        ctx.fillStyle = '#666';
        ctx.font = '9px sans-serif';
        ctx.fillText('1/N', w - 25, h - 10);
        ctx.save();
        ctx.translate(12, h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Kc', 0, 0);
        ctx.restore();
    }
    
    // ============= RESERVOIR COMPUTING =============
    
    function initRCControls() {
        const enabledCheck = document.getElementById('rc-enabled');
        const taskSelect = document.getElementById('rc-task-select');
        const injectionMode = document.getElementById('rc-injection-mode');
        const featureBudget = document.getElementById('rc-feature-budget');
        const featureBudgetVal = document.getElementById('rc-feature-budget-val');
        const inputRegion = document.getElementById('rc-input-region');
        const outputRegion = document.getElementById('rc-output-region');
        const inputStrength = document.getElementById('rc-input-strength');
        const inputStrengthVal = document.getElementById('rc-input-strength-val');
        const trainBtn = document.getElementById('rc-train-btn');
        const stopBtn = document.getElementById('rc-stop-btn');
        const testBtn = document.getElementById('rc-test-btn');
        const kSweepBtn = document.getElementById('rc-ksweep-btn');
        const kSweepStatus = document.getElementById('rc-ksweep-status');
        
        if (enabledCheck) {
            enabledCheck.addEventListener('change', () => {
                STATE.rcEnabled = enabledCheck.checked;
                const content = document.getElementById('rc-content');
                if (content) content.style.opacity = STATE.rcEnabled ? '1' : '0.5';
                if (STATE.rcEnabled) {
                    reservoir.setFeatureBudget(STATE.rcMaxFeatures);
                    reservoir.setHistoryLength(STATE.rcHistoryLength);
                    reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
                    writeRCInputWeights();
                } else {
                    sim.setInputSignal(0);
                }
            });
        }
        
        if (taskSelect) {
            taskSelect.addEventListener('change', () => {
                STATE.rcTask = taskSelect.value;
                reservoir.setTask(STATE.rcTask);
            });
        }
        
        if (injectionMode) {
            injectionMode.addEventListener('change', () => {
                STATE.rcInjectionMode = injectionMode.value;
                sim.updateFullParams(STATE);
            });
        }
        
        if (featureBudget) {
            featureBudget.addEventListener('input', () => {
                STATE.rcMaxFeatures = parseInt(featureBudget.value);
                if (featureBudgetVal) featureBudgetVal.textContent = STATE.rcMaxFeatures;
                reservoir.setFeatureBudget(STATE.rcMaxFeatures);
            });
        }
        
        if (inputRegion) {
            inputRegion.addEventListener('change', () => {
                STATE.rcInputRegion = inputRegion.value;
                if (STATE.rcEnabled) {
                    reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
                    writeRCInputWeights();
                }
            });
        }
        
        if (outputRegion) {
            outputRegion.addEventListener('change', () => {
                STATE.rcOutputRegion = outputRegion.value;
                if (STATE.rcEnabled) {
                    reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
                    writeRCInputWeights();
                }
            });
        }
        
        if (inputStrength) {
            inputStrength.addEventListener('input', () => {
                STATE.rcInputStrength = parseFloat(inputStrength.value);
                if (inputStrengthVal) inputStrengthVal.textContent = STATE.rcInputStrength.toFixed(1);
                if (STATE.rcEnabled) {
                    reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
                    writeRCInputWeights();
                }
            });
        }
        
        if (trainBtn) {
            trainBtn.addEventListener('click', () => {
                if (!STATE.rcEnabled) {
                    alert('Enable Reservoir Computing first');
                    return;
                }
                reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
                reservoir.setTask(STATE.rcTask);
                writeRCInputWeights();
                reservoir.startTraining();
                STATE.rcTraining = true;
                STATE.rcInference = false;
                trainBtn.disabled = true;
                stopBtn.disabled = false;
                testBtn.disabled = true;
                updateRCDisplay();
            });
        }
        
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                if (STATE.rcTraining) {
                    STATE.rcTraining = false;
                    const nrmse = reservoir.stopTraining();
                    STATE.rcNRMSE = nrmse;
                    // Keep last test NRMSE until next test run.
                    trainBtn.disabled = false;
                    stopBtn.disabled = true;
                    testBtn.disabled = false;
                    updateRCDisplay();
                } else if (STATE.rcInference) {
                    STATE.rcInference = false;
                    reservoir.stopInference();
                    runtime.rcTestRemaining = 0;
                    trainBtn.disabled = false;
                    stopBtn.disabled = true;
                    testBtn.disabled = false;
                    updateRCDisplay();
                }
            });
        }
        
        if (testBtn) {
            testBtn.addEventListener('click', () => {
                // Stop & Test: ensure trained weights, then run a short test window.
                if (STATE.rcTraining) {
                    STATE.rcTraining = false;
                    STATE.rcNRMSE = reservoir.stopTraining();
                }

                if (reservoir.startInference()) {
                    STATE.rcInference = true;
                    STATE.rcTraining = false;
                    runtime.rcTestRemaining = RC_TEST_STEPS;
                    STATE.rcTestNRMSE = null;
                    trainBtn.disabled = true;
                    stopBtn.disabled = false;
                    testBtn.disabled = true;
                    updateRCDisplay();
                }
            });
        }

        if (kSweepBtn) {
            kSweepBtn.addEventListener('click', () => {
                if (!STATE.rcEnabled) {
                    alert('Enable Reservoir Computing first');
                    return;
                }
                if (!STATE.showStatistics) {
                    alert('Enable Statistics Compute to run sweep');
                    return;
                }
                if (!rcCritSweepRunner) {
                    alert('Sweep runner not initialized');
                    return;
                }
                if (rcCritSweepRunner.isRunning()) {
                    rcCritSweepRunner.cancel();
                    return;
                }

                if (STATE.rcTraining || STATE.rcInference) {
                    alert('Stop RC training/inference before running a sweep');
                    return;
                }

                rcCritSweepLastExport = null;
                rcCritSweepPrevPaused = STATE.paused;
                STATE.paused = false;

                const protocol = {
                    K_min: 0.2,
                    K_max: 2.4,
                    K_step: 0.2,
                    warmupSamples: Math.max(STATE.rcHistoryLength || 10, 20),
                    trainSamples: 400,
                    testSamples: 200,
                    statsEvery: 4,
                };

                const snapshot = JSON.parse(JSON.stringify(STATE));
                rcCritSweepInfo = { running: true, phase: 'starting', kIdx: 0, kTotal: 0, K: null, configHash: null, results: [] };
                updateRCDisplay();
                void rcCritSweepRunner.start(protocol, snapshot);
            });
        }

        const modeCompareBtn = document.getElementById('rc-mode-compare-btn');
        if (modeCompareBtn) {
            modeCompareBtn.addEventListener('click', async () => {
                if (!STATE.rcEnabled) {
                    alert('Enable Reservoir Computing first');
                    return;
                }
                if (!STATE.showStatistics) {
                    alert('Enable Statistics Compute to run comparison');
                    return;
                }
                if (!rcModeCompareRunner) {
                    alert('Compare runner not initialized');
                    return;
                }
                if (rcModeCompareRunner.isRunning()) {
                    rcModeCompareRunner.cancel();
                    return;
                }
                if (STATE.rcTraining || STATE.rcInference) {
                    alert('Stop RC training/inference before running compare');
                    return;
                }
                if (rcCritSweepRunner && rcCritSweepRunner.isRunning()) {
                    alert('Stop RC vs criticality sweep first');
                    return;
                }

                rcModeCompareLastExport = null;
                rcModeCompareInfo = { running: true, phase: 'starting', mode: null, modeIdx: 0, modeTotal: 3, configHash: null, results: [] };
                updateRCDisplay();

                const protocol = {
                    warmupSamples: Math.max(STATE.rcHistoryLength || 10, 20),
                    trainSamples: 400,
                    testSamples: 200,
                    statsEvery: 4,
                };
                const snapshot = JSON.parse(JSON.stringify(STATE));
                await rcModeCompareRunner.start(protocol, snapshot);
            });
        }

        const modeCompareCancel = document.getElementById('rc-mode-compare-cancel');
        if (modeCompareCancel) {
            modeCompareCancel.addEventListener('click', () => {
                if (rcModeCompareRunner) rcModeCompareRunner.cancel();
            });
        }

        const modeCompareExportJson = document.getElementById('rc-mode-compare-export-json');
        if (modeCompareExportJson) {
            modeCompareExportJson.addEventListener('click', () => {
                if (!rcModeCompareLastExport) return;
                const json = JSON.stringify(rcModeCompareLastExport, null, 2);
                downloadJSON(json, `rc_mode_compare_${rcModeCompareLastExport.configHash || 'compare'}.json`);
            });
        }

        const modeCompareExportCsv = document.getElementById('rc-mode-compare-export-csv');
        if (modeCompareExportCsv) {
            modeCompareExportCsv.addEventListener('click', () => {
                if (!rcModeCompareRunner) return;
                const csv = rcModeCompareRunner.exportCSV();
                downloadCSV(csv, `rc_mode_compare_${rcModeCompareRunner.configHash || 'compare'}.csv`);
            });
        }

        const exportJsonBtn = document.getElementById('rc-ksweep-export-json');
        if (exportJsonBtn) {
            exportJsonBtn.addEventListener('click', () => {
                if (!rcCritSweepLastExport) return;
                const json = JSON.stringify(rcCritSweepLastExport, null, 2);
                downloadJSON(json, `rc_vs_criticality_${rcCritSweepLastExport.configHash || 'sweep'}.json`);
            });
        }
        const exportCsvBtn = document.getElementById('rc-ksweep-export-csv');
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => {
                if (!rcCritSweepRunner) return;
                const csv = rcCritSweepRunner.exportCSV();
                downloadCSV(csv, `rc_vs_criticality_${rcCritSweepRunner.configHash || 'sweep'}.csv`);
            });
        }
    }
    
    function updateRCDisplay() {
        const statusEl = document.getElementById('rc-status');
        const samplesEl = document.getElementById('rc-samples');
        const nrmseEl = document.getElementById('rc-nrmse');
        const ksweepStatus = document.getElementById('rc-ksweep-status');
        const ksweepResults = document.getElementById('rc-ksweep-results');
        
        if (statusEl) {
            if (STATE.rcTraining) statusEl.textContent = 'training...';
            else if (STATE.rcInference) statusEl.textContent = 'inference';
            else statusEl.textContent = 'idle';
        }
        
        if (samplesEl) {
            samplesEl.textContent = reservoir.getSampleCount().toString();
        }
        
        if (nrmseEl) {
            // Show running NRMSE during training, or final NRMSE after
            const nrmse = STATE.rcTraining ? reservoir.getNRMSE() : STATE.rcNRMSE;
            if (nrmse !== null && isFinite(nrmse)) {
                nrmseEl.textContent = nrmse.toFixed(4);
                // Color code: green for good (<0.3), yellow for ok (<0.7), red for bad
                if (nrmse < 0.3) nrmseEl.style.color = '#4CAF50';
                else if (nrmse < 0.7) nrmseEl.style.color = '#FF9800';
                else nrmseEl.style.color = '#f44336';
            } else {
                nrmseEl.textContent = '—';
                nrmseEl.style.color = '#888';
            }
        }

        const testNrmseEl = document.getElementById('rc-test-nrmse');
        if (testNrmseEl) {
            if (STATE.rcInference && runtime.rcTestRemaining > 0) {
                testNrmseEl.textContent = `testing… (${runtime.rcTestRemaining})`;
                testNrmseEl.style.color = '#888';
            } else if (STATE.rcTestNRMSE !== null && isFinite(STATE.rcTestNRMSE)) {
                testNrmseEl.textContent = STATE.rcTestNRMSE.toFixed(4);
                if (STATE.rcTestNRMSE < 0.3) testNrmseEl.style.color = '#4CAF50';
                else if (STATE.rcTestNRMSE < 0.7) testNrmseEl.style.color = '#FF9800';
                else testNrmseEl.style.color = '#f44336';
            } else {
                testNrmseEl.textContent = '—';
                testNrmseEl.style.color = '#888';
            }
        }

        const condEl = document.getElementById('rc-cond');
        if (condEl) {
            const cond = reservoir.onlineLearner?.getConditionEstimate ? reservoir.onlineLearner.getConditionEstimate() : null;
            if (cond && isFinite(cond)) {
                condEl.textContent = cond.toExponential(2);
                if (cond > 1e8) condEl.style.color = '#f44336';
                else if (cond > 1e6) condEl.style.color = '#FF9800';
                else condEl.style.color = '#4CAF50';
            } else {
                condEl.textContent = '—';
                condEl.style.color = '#888';
            }
        }

        const taskStatusEl = document.getElementById('rc-task-status');
        if (taskStatusEl) {
            if (STATE.rcTask === 'moving_dot') {
                const x = reservoir.tasks?.currentDotX ?? null;
                const xNext = reservoir.tasks?.currentDotXNext ?? null;
                const pred = reservoir.lastPrediction;
                const target = reservoir.lastTarget;
                const parts = [];
                if (x !== null && Number.isFinite(x)) parts.push(`x=${x.toFixed(3)}`);
                if (xNext !== null && Number.isFinite(xNext)) parts.push(`x*=${xNext.toFixed(3)}`);
                if (pred !== null && Number.isFinite(pred)) parts.push(`pred=${pred.toFixed(3)}`);
                if (target !== null && Number.isFinite(target)) parts.push(`tgt=${target.toFixed(3)}`);
                taskStatusEl.textContent = parts.length ? parts.join(' ') : 'moving dot';
            } else {
                taskStatusEl.textContent = STATE.rcTask || '—';
            }
        }

        if (ksweepStatus) {
            if (rcCritSweepInfo.running) {
                const kLabel = rcCritSweepInfo.K !== null ? rcCritSweepInfo.K.toFixed(2) : '—';
                ksweepStatus.textContent = `${rcCritSweepInfo.phase} | K ${rcCritSweepInfo.kIdx + 1}/${rcCritSweepInfo.kTotal} @ ${kLabel}`;
            } else {
                ksweepStatus.textContent = 'idle';
            }
        }

        if (ksweepResults) {
            const results = rcCritSweepInfo.results || [];
            if (results.length === 0) {
                ksweepResults.textContent = '—';
            } else {
                const shown = results.slice(-8);
                ksweepResults.textContent = shown.map(r => `K=${r.K.toFixed(2)} test=${r.testNRMSE.toFixed(3)} localR=${r.localMeanR_mean.toFixed(3)} chiMax=${r.chi_max.toFixed(2)}`).join('\n');
            }
        }

        const exportJsonBtn = document.getElementById('rc-ksweep-export-json');
        if (exportJsonBtn) exportJsonBtn.disabled = !rcCritSweepLastExport;
        const exportCsvBtn = document.getElementById('rc-ksweep-export-csv');
        if (exportCsvBtn) exportCsvBtn.disabled = !(rcCritSweepInfo.results && rcCritSweepInfo.results.length > 0);

        renderRCKSweepPlot();

        const compareStatus = document.getElementById('rc-mode-compare-status');
        if (compareStatus) {
            if (rcModeCompareInfo.running) {
                compareStatus.textContent = `${rcModeCompareInfo.phase} | ${rcModeCompareInfo.modeIdx + 1}/${rcModeCompareInfo.modeTotal} ${rcModeCompareInfo.mode || ''}`;
            } else {
                compareStatus.textContent = 'idle';
            }
        }

        const compareResults = document.getElementById('rc-mode-compare-results');
        if (compareResults) {
            const results = rcModeCompareInfo.results || [];
            if (results.length === 0) {
                compareResults.textContent = '—';
            } else {
                compareResults.textContent = results.map(r => {
                    return `${r.mode.padEnd(12)} test=${r.testNRMSE.toFixed(3)} train=${r.trainNRMSE.toFixed(3)} localR=${r.localMeanR_mean.toFixed(3)} chiMax=${r.chi_max.toFixed(2)}`;
                }).join('\n');
            }
        }

        const compareExportJson = document.getElementById('rc-mode-compare-export-json');
        if (compareExportJson) compareExportJson.disabled = !rcModeCompareLastExport;
        const compareExportCsv = document.getElementById('rc-mode-compare-export-csv');
        if (compareExportCsv) compareExportCsv.disabled = !(rcModeCompareInfo.results && rcModeCompareInfo.results.length > 0);

        const compareCancelBtn = document.getElementById('rc-mode-compare-cancel');
        if (compareCancelBtn) compareCancelBtn.disabled = !rcModeCompareInfo.running;

        renderRCModeComparePlot();
    }

    function drawRCPlot() {
        drawRCPredictions(reservoir);
    }

    function renderRCKSweepPlot() {
        renderRCKSweepChart(rcKsweepPlot, rcCritSweepInfo);
    }

    function renderRCModeComparePlot() {
        renderRCModeCompareChart(rcModeCompareInfo);
    }

    function renderPhaseSpace(theta) {
        if (!phaseSpacePlot || !STATE.phaseSpaceEnabled || !theta) return;
        if (STATE.manifoldMode !== 's1') return;
        phaseSpacePlot.render(theta);
    }

    initOverlayDiagnostics({
        STATE,
        sim,
        runtime,
        getActiveLayerIndex,
    });
    
    // Initialize display
    regenerateTopology();
    ui.updateDisplay();
    if (ui.updateManifoldVisibility) ui.updateManifoldVisibility(STATE.manifoldMode);
    if (ui.updatePatternOptions) ui.updatePatternOptions(STATE.manifoldMode);
    drawKernel(STATE);
    
    // Statistics throttling - compute every N frames for better performance
    const getStatsInterval = () => {
        // GPU stats have overhead from readback - throttle more aggressively
        if (STATE.gridSize >= 512) return 2;   // Every 2 frames
        if (STATE.gridSize >= 256) return 4;   // Every 4 frames
        if (STATE.gridSize >= 128) return 6;   // Every 6 frames
        return 8;  // Every 8 frames for small grids
    };
    const updateStatsView = createStatsViewUpdater({ state: STATE, sparkline: SPARKLINE });

    const frame = createFrameLoop({
        STATE,
        device,
        sim,
        renderer,
        camera,
        canvas,
        stats,
        reservoir,
        ui,
        lyapunovCalc,
        experimentRunner,
        rcCritSweepRunner,
        rcModeCompareRunner,
        phaseSpacePlot,
        resizeCanvasesToDisplay,
        getStatsInterval,
        getActiveLayerIndex,
        getActiveLayerThetaForRC,
        writeRCInputWeights,
        stepLLE,
        drawRCPlot,
        renderPhaseSpace,
        updateRCDisplay,
        updateStatsView: () => updateStatsView({ sim, stats, R_plot, chi_plot, phaseDiagramPlot }),
        onFrameError: (error) => {
            const msg = error?.message ? error.message : String(error);
            showError(`Runtime frame error: ${msg}`);
        },
        rcOverlay,
        rcOverlayCtx,
        graphOverlay,
        graphOverlayCtx,
        rcDotTrail,
        rcDotTrailMax,
        runtime,
        config: {
            STATS_READBACK_MIN_MS: 40,
            PHASE_SAMPLE_INTERVAL: 10,
            RC_READ_MIN_MS: 40,
        }
    });

    APP_RUNTIME = {
        sim,
        ui,
        runtime,
    };
    frame();
}

function handlePopState() {
    try {
        loadStateFromURL(STATE);
        clampGaugeLayerSelection(STATE);
        if (APP_RUNTIME?.sim) {
            APP_RUNTIME.sim.updateFullParams(STATE);
            APP_RUNTIME.sim.setManifoldMode(STATE.manifoldMode);
        }
        if (APP_RUNTIME?.ui) {
            APP_RUNTIME.ui.updateDisplay();
        }
    } catch (e) {
        console.warn('Could not apply URL state in-place:', e);
        window.location.reload();
    }
}

export async function startApp() {
    window.addEventListener('popstate', handlePopState);
    await init();
}
