import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
import { Camera } from './common.js';
import { UIManager } from './ui.js';
import { Presets } from './presets.js';
import { drawKernel } from './kernel.js';
import { loadStateFromURL, updateURLFromState } from './urlstate.js';
import { StatisticsTracker, TimeSeriesPlot, PhaseDiagramPlot, PhaseSpacePlot, LyapunovCalculator } from './statistics.js';
import { ReservoirComputer } from './reservoir.js';
import { generateTopology, MAX_GRAPH_DEGREE } from './topology.js';

const STATE = {
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

    // Visualization toggles
    phaseSpaceEnabled: true
};


const makeLayerParamsFromState = (state) => ({
    ruleMode: state.ruleMode,
    K0: state.K0,
    range: state.range,
    harmonicA: state.harmonicA,
    harmonicB: state.harmonicB,
    delaySteps: state.delaySteps,
    sigma: state.sigma,
    sigma2: state.sigma2,
    beta: state.beta,
    noiseStrength: state.noiseStrength,
    leak: state.leak,
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
    // Interaction modifiers (per-layer)
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
    // Inter-layer coupling (per-layer)
    layerCouplingUp: state.layerCouplingUp ?? 0.0,
    layerCouplingDown: state.layerCouplingDown ?? 0.0,
});

const applyLayerParamsToState = (idx) => {
    const lp = STATE.layerParams?.[idx];
    if (!lp) {
        console.warn(`applyLayerParamsToState: No params for layer ${idx}`);
        return;
    }
    STATE.ruleMode = lp.ruleMode;
    STATE.K0 = lp.K0;
    STATE.range = lp.range;
    STATE.harmonicA = lp.harmonicA;
    STATE.harmonicB = lp.harmonicB;
    STATE.delaySteps = lp.delaySteps;
    STATE.sigma = lp.sigma;
    STATE.sigma2 = lp.sigma2;
    STATE.beta = lp.beta;
    STATE.noiseStrength = lp.noiseStrength;
    STATE.leak = lp.leak;
    STATE.kernelShape = lp.kernelShape;
    STATE.kernelOrientation = lp.kernelOrientation;
    STATE.kernelAsymmetricOrientation = lp.kernelAsymmetricOrientation;
    STATE.kernelAspect = lp.kernelAspect;
    STATE.kernelScale2Weight = lp.kernelScale2Weight;
    STATE.kernelScale3Weight = lp.kernelScale3Weight;
    STATE.kernelAsymmetry = lp.kernelAsymmetry;
    STATE.kernelRings = lp.kernelRings;
    STATE.kernelRingWidths = [...lp.kernelRingWidths];
    STATE.kernelRingWeights = [...lp.kernelRingWeights];
    STATE.kernelCompositionEnabled = lp.kernelCompositionEnabled;
    STATE.kernelSecondary = lp.kernelSecondary;
    STATE.kernelMixRatio = lp.kernelMixRatio;
    STATE.kernelSpatialFreqMag = lp.kernelSpatialFreqMag;
    STATE.kernelSpatialFreqAngle = lp.kernelSpatialFreqAngle;
    STATE.kernelGaborPhase = lp.kernelGaborPhase;
    // Interaction modifiers (per-layer)
    STATE.scaleBase = lp.scaleBase ?? 1.0;
    STATE.scaleRadial = lp.scaleRadial ?? 0.0;
    STATE.scaleRandom = lp.scaleRandom ?? 0.0;
    STATE.scaleRing = lp.scaleRing ?? 0.0;
    STATE.flowRadial = lp.flowRadial ?? 0.0;
    STATE.flowRotate = lp.flowRotate ?? 0.0;
    STATE.flowSwirl = lp.flowSwirl ?? 0.0;
    STATE.flowBubble = lp.flowBubble ?? 0.0;
    STATE.flowRing = lp.flowRing ?? 0.0;
    STATE.flowVortex = lp.flowVortex ?? 0.0;
    STATE.flowVertical = lp.flowVertical ?? 0.0;
    STATE.orientRadial = lp.orientRadial ?? 0.0;
    STATE.orientCircles = lp.orientCircles ?? 0.0;
    STATE.orientSwirl = lp.orientSwirl ?? 0.0;
    STATE.orientBubble = lp.orientBubble ?? 0.0;
    STATE.orientLinear = lp.orientLinear ?? 0.0;
    // Inter-layer coupling (per-layer)
    STATE.layerCouplingUp = lp.layerCouplingUp ?? 0.0;
    STATE.layerCouplingDown = lp.layerCouplingDown ?? 0.0;
};

const syncStateToLayerParams = (indices) => {
    const targets = Array.isArray(indices) ? indices : [indices];
    const lp = makeLayerParamsFromState(STATE);
    targets.forEach(idx => {
        if (idx == null) return;
        STATE.layerParams[idx] = {
            ...lp,
            kernelRingWidths: [...lp.kernelRingWidths],
            kernelRingWeights: [...lp.kernelRingWeights],
        };
    });
};

const ensureLayerParams = (count) => {
    const target = Math.max(1, count);
    if (!Array.isArray(STATE.layerParams) || STATE.layerParams.length === 0) {
        STATE.layerParams = [makeLayerParamsFromState(STATE)];
    }
    if (STATE.layerParams.length < target) {
        const template = STATE.layerParams[STATE.layerParams.length - 1] || makeLayerParamsFromState(STATE);
        while (STATE.layerParams.length < target) {
            STATE.layerParams.push({
                ...template,
                kernelRingWidths: [...template.kernelRingWidths],
                kernelRingWeights: [...template.kernelRingWeights],
            });
        }
    } else if (STATE.layerParams.length > target) {
        STATE.layerParams = STATE.layerParams.slice(0, target);
    }
};

const normalizeSelectedLayers = (count) => {
    const maxIdx = Math.max(0, count - 1);
    let selected = Array.isArray(STATE.selectedLayers) ? STATE.selectedLayers : [];
    selected = selected
        .map(idx => Math.min(maxIdx, Math.max(0, Math.floor(idx))))
        .filter((v, i, arr) => arr.indexOf(v) === i);
    if (selected.length === 0) {
        selected = [Math.min(maxIdx, Math.max(0, STATE.activeLayer ?? 0))];
    }
    if (!selected.includes(STATE.activeLayer ?? 0)) {
        selected.push(Math.min(maxIdx, Math.max(0, STATE.activeLayer ?? 0)));
    }
    STATE.selectedLayers = selected.sort((a, b) => a - b);
};

// Store the last external input canvas for pattern initialization
let lastExternalCanvas = null;
let drawPending = false;
let gridResizeInProgress = false;
let drawSim = null;

// Show error message in the canvas area
function showError(message) {
    const container = document.getElementById('canvas-container');
    if (container) {
        // Detect Safari
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const safariNote = isSafari ? `
            <p style="margin-top: 15px; color: #ffaa00; font-size: 13px;">
                <strong>Safari Users:</strong><br>
                1. Open Safari → Settings → Advanced<br>
                2. Check "Show features for web developers"<br>
                3. Then: Develop → Feature Flags → Enable "WebGPU"<br>
                4. Restart Safari
            </p>
        ` : '';
        
        container.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: #ff6b6b;
                background: #1a1a2e;
                padding: 40px;
                text-align: center;
                font-family: system-ui, sans-serif;
            ">
                <h2 style="margin-bottom: 20px;">⚠️ WebGPU Error</h2>
                <p style="max-width: 500px; line-height: 1.6;">${message}</p>
                ${safariNote}
                <p style="margin-top: 20px; color: #888; font-size: 14px;">
                    WebGPU requires:<br>
                    • Chrome 113+ / Edge 113+ (Windows, macOS, ChromeOS)<br>
                    • Safari 17+ (macOS Sonoma / iOS 17) with WebGPU enabled<br>
                    • Firefox Nightly with dom.webgpu.enabled
                </p>
            </div>
        `;
    }
    console.error('WebGPU Error:', message);
}

async function init() {
    // Check WebGPU support
    if (!navigator.gpu) {
        showError('WebGPU is not supported in your browser. Please use Chrome 113+, Edge 113+, or Safari 17+ with WebGPU enabled.');
        return;
    }
    
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        showError('Failed to get WebGPU adapter. Your GPU may not be supported, or WebGPU may be disabled.');
        return;
    }
    
    // Log adapter info for debugging (if available)
    if (adapter.requestAdapterInfo) {
        try {
            const adapterInfo = await adapter.requestAdapterInfo();
            console.log('WebGPU Adapter:', adapterInfo.vendor, adapterInfo.architecture, adapterInfo.device);
        } catch (e) {
            console.log('Could not get adapter info:', e.message);
        }
    }
    console.log('Adapter features:', [...adapter.features]);
    
    let device;
    try {
        // Request features if available
        const requiredFeatures = [];
        if (adapter.features.has('float32-filterable')) {
            requiredFeatures.push('float32-filterable');
        }
        
        device = await adapter.requestDevice({
            requiredFeatures,
        });
    } catch (e) {
        showError('Failed to get WebGPU device: ' + e.message);
        return;
    }
    
    // Handle device loss
    device.lost.then((info) => {
        console.error('WebGPU device lost:', info.message);
        if (info.reason !== 'destroyed') {
            showError('WebGPU device was lost: ' + info.message + '. Please refresh the page.');
        }
    });
    
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('webgpu');
    if (!context) {
        showError('Failed to get WebGPU context from canvas.');
        return;
    }
    
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });

    // Load state from URL (may modify STATE.gridSize before constructing Simulation)
    loadStateFromURL(STATE);

    ensureLayerParams(STATE.layerCount);
    let sim = new Simulation(device, STATE.gridSize, STATE.layerCount);
    STATE.layerCount = sim.layers;
    STATE.activeLayer = Math.min(STATE.activeLayer || 0, STATE.layerCount - 1);
    normalizeSelectedLayers(STATE.layerCount);
    applyLayerParamsToState(STATE.activeLayer);
    const renderer = new Renderer(device, format, canvas, STATE.gridSize);
    renderer.setMeshMode(STATE.surfaceMode);
    renderer.setContext(context);
    const camera = new Camera(canvas);
    const graphOverlay = document.getElementById('graph-overlay');
    const graphOverlayCtx = graphOverlay ? graphOverlay.getContext('2d') : null;
    let overlayDirty = true;
    let lastViewMode = STATE.viewMode;
    
    // Initialize statistics tracking
    const stats = new StatisticsTracker(STATE.gridSize * STATE.gridSize * STATE.layerCount);
    
    // Initialize Lyapunov calculator
    let lyapunovCalc = new LyapunovCalculator(STATE.gridSize * STATE.gridSize * STATE.layerCount);
    let lleUpdateInterval = null;
    
    // Initialize Reservoir Computer
    let reservoir = new ReservoirComputer(STATE.gridSize);
    let rcPlot = null;
    let rcKsweepPlot = null;
    let rcReadPending = false;
    let lastRCReadMs = 0;
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

    let rcActiveLayerSeen = getActiveLayerIndex();
    
    // Initialize plots (will be created when DOM is ready)
    let R_plot = null;
    let chi_plot = null;
    let phaseDiagramPlot = null;
    let phaseSpacePlot = null;
    let ui = null;

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
        if (ui?.updateDisplay) ui.updateDisplay();
        overlayDirty = true;
        return topology;
    };

    const ensureOverlaySize = () => {
        if (!graphOverlay || !canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const displayW = canvas.clientWidth || canvas.width;
        const displayH = canvas.clientHeight || canvas.height;
        graphOverlay.width = Math.round(displayW * dpr);
        graphOverlay.height = Math.round(displayH * dpr);
        graphOverlay.style.width = `${displayW}px`;
        graphOverlay.style.height = `${displayH}px`;
    };

    const drawGraphOverlay = (topology) => {
        if (!graphOverlayCtx || !graphOverlay) return;
        ensureOverlaySize();
        graphOverlayCtx.clearRect(0, 0, graphOverlay.width, graphOverlay.height);
        graphOverlay.style.display = 'none';
        if (!STATE.graphOverlayEnabled || STATE.viewMode !== 1) return;
        if (!topology || !topology.counts || !topology.neighbors) return;
        if (STATE.topologyMode === 'grid') return;
        if (STATE.gridSize > 256) return; // keep overlay lightweight on huge grids

        const counts = topology.counts;
        const neighbors = topology.neighbors;
        const maxDeg = sim.maxGraphDegree;
        const grid = STATE.gridSize;
        const w = graphOverlay.width;
        const h = graphOverlay.height;

        let edges = 0;
        for (let i = 0; i < counts.length; i++) edges += counts[i];
        edges = Math.max(1, Math.floor(edges / 2));

        const maxEdges = 400;
        const prob = Math.min(1, maxEdges / edges);
        let drawn = 0;
        let rng = STATE.topologySeed || 1;
        const rand = () => {
            rng = (rng * 1664525 + 1013904223) >>> 0;
            return rng / 4294967296;
        };

        graphOverlayCtx.strokeStyle = 'rgba(255,255,255,0.35)';
        graphOverlayCtx.lineWidth = 1.0;
        graphOverlay.style.display = 'block';

        for (let i = 0; i < counts.length; i++) {
            const deg = Math.min(counts[i], maxDeg);
            if (!deg) continue;
            const base = i * maxDeg;
            const cx = ((i % grid) + 0.5) / grid * w;
            const cy = (Math.floor(i / grid) + 0.5) / grid * h;
            for (let j = 0; j < deg; j++) {
                const nbr = neighbors[base + j];
                if (nbr <= i) continue; // draw each undirected edge once
                if (rand() > prob) continue;
                const nx = ((nbr % grid) + 0.5) / grid * w;
                const ny = (Math.floor(nbr / grid) + 0.5) / grid * h;
                const jitter = 0.002;
                const jx = (rand() - 0.5) * w * jitter;
                const jy = (rand() - 0.5) * h * jitter;
                graphOverlayCtx.beginPath();
                graphOverlayCtx.moveTo(cx + jx, cy + jy);
                graphOverlayCtx.lineTo(nx - jx, ny - jy);
                graphOverlayCtx.stroke();
                drawn++;
                if (drawn >= maxEdges) return;
            }
        }
    };

    // RC K sweep state
    let rcSweep = {
        active: false,
        Ks: [],
        idx: 0,
        steps: 0,
        stepsPerK: 300,
        results: []
    };
    
    // K-scan state
    let kScanner = null;

    // Initial State
    resetSimulation(sim);
    drawSim = sim;
    initDrawing(canvas);
    sim.writeLayerParams(STATE.layerParams);

    const rebuildLayerCount = async (newCount) => {
        const clamped = Math.max(1, Math.min(8, Math.floor(newCount)));
        if (clamped === STATE.layerCount) {
            return;
        }
        STATE.layerCount = clamped;
        ensureLayerParams(STATE.layerCount);
        STATE.activeLayer = Math.min(Math.max(0, STATE.activeLayer ?? 0), STATE.layerCount - 1);
        normalizeSelectedLayers(STATE.layerCount);
        if (sim && sim.destroy) {
            await sim.waitForIdle();
            sim.destroy();
        }
        sim = new Simulation(device, STATE.gridSize, STATE.layerCount);
        drawSim = sim;
        applyLayerParamsToState(STATE.activeLayer ?? 0);
        sim.updateFullParams(STATE);
        sim.writeLayerParams(STATE.layerParams);
        renderer.invalidateBindGroup();
        stats.resize(STATE.gridSize * STATE.gridSize * STATE.layerCount);
        lyapunovCalc.resize(STATE.gridSize * STATE.gridSize * STATE.layerCount);
        reservoir.resize(STATE.gridSize);
        regenerateTopology();
        resetSimulation(sim);
        if (ui?.updateDisplay) ui.updateDisplay();
        updateURLFromState(STATE, true);
    };

    ui = new UIManager(STATE, {
        onParamChange: () => { 
            if (STATE.viewMode !== lastViewMode) {
                overlayDirty = true;
                lastViewMode = STATE.viewMode;
            }
            normalizeSelectedLayers(STATE.layerCount);
            syncStateToLayerParams(STATE.selectedLayers);
            sim.writeLayerParams(STATE.layerParams);
            sim.updateFullParams(STATE);
            drawKernel(STATE); 
            // Reflect new parameter state into URL
            updateURLFromState(STATE, true);
        },
        onTopologyChange: () => {
            regenerateTopology();
            updateURLFromState(STATE, true);
        },
        onTopologyRegenerate: () => {
            STATE.topologySeed = (STATE.topologySeed || 1) + 1;
            regenerateTopology();
            updateURLFromState(STATE, true);
        },
        onApplyInit: async () => {
            normalizeSelectedLayers(STATE.layerCount);
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
                    thetaBase = await sim.readTheta();
                    if (!thetaBase) await new Promise(r => setTimeout(r, 16)); // Wait a frame
                }
                // Fallback to CPU-side copy if GPU read fails
                thetaBase = thetaBase || sim.thetaData || new Float32Array(sim.N);
                omegaBase = sim.getOmega() || new Float32Array(sim.N);
            }
            
            applyThetaPattern(sim, thetaPattern, targets, thetaBase);
            applyOmegaPattern(sim, omegaPattern, omegaAmp, targets, omegaBase);
        },
        onOverlayToggle: (enabled) => {
            STATE.graphOverlayEnabled = enabled;
            overlayDirty = true;
        },
        onSurfaceModeChange: (mode) => {
            STATE.surfaceMode = mode;
            renderer.setMeshMode(mode);
            sim.updateFullParams(STATE);
        },
        onPhaseSpaceToggle: (enabled) => {
            STATE.phaseSpaceEnabled = enabled;
        },
        onDrawKernel: () => { drawKernel(STATE); },
        onPause: () => { 
            STATE.paused = !STATE.paused; 
            document.getElementById('pause-btn').textContent = STATE.paused ? 'Resume' : 'Pause';
        },
    onReset: () => { resetSimulation(sim); updateURLFromState(STATE, true); },
    onRandomize: () => { randomizeTheta(sim); updateURLFromState(STATE, true); },
        onPreset: (name) => {
            void loadPreset(name, sim, ui).then(() => {
                updateURLFromState(STATE, true);
            });
        },
        onPatternChange: (key) => {
            if(key === 'thetaPattern') applyThetaPattern(sim, STATE.thetaPattern);
            if(key === 'omegaPattern') applyOmegaPattern(sim, STATE.omegaPattern, STATE.omegaAmplitude);
        },
        onExternalInput: (canvas) => {
            lastExternalCanvas = canvas;
            applyExternalInput(device, sim, canvas, STATE.omegaAmplitude);
            // Also load texture for rendering if colormap is set to image mode
            renderer.loadTextureFromCanvas(canvas);
            // If theta pattern is set to image, reinitialize it
            if (STATE.thetaPattern === 'image') {
                applyThetaPattern(sim, 'image');
            }
        },
        onResizeGrid: async (newSize) => {
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
                    resetSimulation(sim);
                }
            } catch (e) {
                console.warn('State-preserving resize failed, falling back to reset:', e);
                sim.resize(newSize);
                resetSimulation(sim);
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
        },
        onLayerCountChange: (newCount) => {
            void rebuildLayerCount(newCount);
        },
        onLayerSelect: (layerIdx, selected, prevSelected, prevActive) => {
            // Use passed previous selection (UI already updated STATE before calling us)
            const prev = Array.isArray(prevSelected) && prevSelected.length > 0
                ? prevSelected
                : [prevActive ?? STATE.activeLayer ?? 0];
            syncStateToLayerParams(prev);
            STATE.activeLayer = layerIdx;
            STATE.selectedLayers = Array.isArray(selected) && selected.length > 0
                ? selected
                : [layerIdx];
            normalizeSelectedLayers(STATE.layerCount);
            applyLayerParamsToState(layerIdx);
            sim.writeLayerParams(STATE.layerParams);
            sim.updateFullParams(STATE);
            drawKernel(STATE);
            if (ui?.updateDisplay) ui.updateDisplay();
            updateURLFromState(STATE, true);
        },
        onStartKScan: () => {
            if (stats.isScanning) return;
            kScanner = stats.createKScanner(sim, STATE, {
                K_min: 0.1,
                K_max: 2.5,
                K_steps: 20,
                warmupSteps: 150,
                measureSteps: 100
            }).start();
            document.getElementById('kscan-btn')?.classList.add('active');
        },
        onFindKc: async () => {
            if (!stats.estimatedKc && stats.phaseDiagramData.length === 0) {
                alert('Run K-scan first to estimate Kc');
                return;
            }
            if (stats.estimatedKc) {
                STATE.K0 = stats.estimatedKc;
                sim.updateFullParams(STATE);
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
            updateURLFromState(STATE, true);
        },
        onRCConfigure: () => {
            reservoir.setFeatureBudget(STATE.rcMaxFeatures);
            reservoir.setHistoryLength(STATE.rcHistoryLength);
            reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
            reservoir.setTask(STATE.rcTask);
            // Write input weights to GPU
            writeRCInputWeights();
            updateURLFromState(STATE, true);
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
            updateURLFromState(STATE, true);
        },
        onRCStopTraining: () => {
            STATE.rcTraining = false;
            const nrmse = reservoir.stopTraining();
            STATE.rcNRMSE = nrmse;
            updateRCDisplay();
            updateURLFromState(STATE, true);
        },
        onRCStartInference: () => {
            if (reservoir.startInference()) {
                STATE.rcInference = true;
                STATE.rcTraining = false;
                updateRCDisplay();
                updateURLFromState(STATE, true);
            }
        },
        onRCStopInference: () => {
            reservoir.stopInference();
            STATE.rcInference = false;
            updateRCDisplay();
            updateURLFromState(STATE, true);
        },
        onDrawMode: (mode) => {
            STATE.drawMode = mode;
        },
        onClearCanvas: () => {
            if (renderer.clearDrawOverlay) renderer.clearDrawOverlay();
        }
    });
    
    // Initialize plots after DOM is ready
    setTimeout(() => {
        const initPlots = () => {
            R_plot = new TimeSeriesPlot('R-plot', {
                yMin: 0, yMax: 1,
                color: '#4CAF50',
                fillColor: 'rgba(76, 175, 80, 0.2)',
                label: 'R(t)'
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
                label: 'NRMSE'
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
    }, 100);
    
    // ============= LYAPUNOV EXPONENT =============
    
    function initLLEControls() {
        const startBtn = document.getElementById('lle-start-btn');
        const stopBtn = document.getElementById('lle-stop-btn');
        
        if (startBtn) {
            startBtn.addEventListener('click', async () => {
                if (lyapunovCalc.isRunning) return;
                
                // Read current theta from GPU
                const theta = await sim.readTheta();
                lyapunovCalc.start(theta);
                
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
            lleEl.textContent = lyapunovCalc.lle.toFixed(4);
        }
        if (statusEl) {
            statusEl.textContent = lyapunovCalc.getInterpretation();
        }
        if (iterEl) {
            iterEl.textContent = `${lyapunovCalc.renormCount} renorms`;
        }
        if (marker) {
            // Map LLE from [-0.5, 0.5] to [0%, 100%]
            const pos = Math.min(100, Math.max(0, (lyapunovCalc.lle + 0.5) * 100));
            marker.style.left = `${pos}%`;
        }
    }
    
    // Step LLE calculation when simulation runs
    async function stepLLE() {
        if (!lyapunovCalc.isRunning || STATE.paused) return;
        
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
    
    function initFSSControls() {
        const startBtn = document.getElementById('fss-start-btn');
        
        if (startBtn) {
            startBtn.addEventListener('click', async () => {
                if (fssRunning) return;
                await runFiniteSizeScaling();
            });
        }
    }
    
    async function runFiniteSizeScaling() {
        fssRunning = true;
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
            const gridSize = gridSizes[i];
            
            if (progressEl) {
                progressEl.textContent = `${gridSize}×${gridSize} (${i+1}/${gridSizes.length})`;
            }
            
            // Resize simulation
            STATE.gridSize = gridSize;
            sim.resize(gridSize);
            stats.resize(gridSize * gridSize * STATE.layerCount);
            renderer.invalidateBindGroup();
            resetSimulation(sim);
            sim.updateFullParams(STATE);
            
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
                    // Step the simulation and scanner
                    const encoder = device.createCommandEncoder();
                    sim.step(encoder, STATE.delaySteps, STATE.globalCoupling, true);
                    sim.requestGlobalOrderReadback(encoder);
                    device.queue.submit([encoder.finish()]);
                    
                    sim.processReadback().then(result => {
                        if (result) {
                            stats.update(result.cos, result.sin, result.localStats);
                        }
                        
                        kScanner = stats.createKScanner(sim, STATE).step(kScanner || scanner);
                        
                        if (!kScanner || kScanner.phase === 'done') {
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
        resetSimulation(sim);
        sim.updateFullParams(STATE);
        ui.updateDisplay();
        
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
        if (startBtn) startBtn.disabled = false;
        fssRunning = false;
    }
    
    function extrapolateKc(data) {
        // Linear regression of Kc vs 1/sqrt(N)
        // Kc(N) ≈ Kc(∞) + a/sqrt(N)
        
        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        
        for (const point of data) {
            const x = 1 / Math.sqrt(point.N * point.N);  // 1/N
            const y = point.Kc;
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        }
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        // Kc(∞) is the y-intercept
        return intercept;
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
                    trainBtn.disabled = false;
                    stopBtn.disabled = true;
                    testBtn.disabled = false;
                    updateRCDisplay();
                } else if (STATE.rcInference) {
                    STATE.rcInference = false;
                    reservoir.stopInference();
                    trainBtn.disabled = false;
                    stopBtn.disabled = true;
                    testBtn.disabled = false;
                    updateRCDisplay();
                }
            });
        }
        
        if (testBtn) {
            testBtn.addEventListener('click', () => {
                if (reservoir.startInference()) {
                    STATE.rcInference = true;
                    STATE.rcTraining = false;
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
                startRCKSweep();
                if (kSweepStatus) kSweepStatus.textContent = 'running...';
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

        const condEl = document.getElementById('rc-cond');
        if (condEl) {
            const cond = reservoir.onlineLearner.getConditionEstimate ? reservoir.onlineLearner.getConditionEstimate() : null;
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

        if (ksweepStatus) {
            ksweepStatus.textContent = rcSweep.active ? `K ${rcSweep.idx + 1}/${rcSweep.Ks.length}` : 'idle';
        }
        if (ksweepResults) {
            if (rcSweep.results.length === 0) {
                ksweepResults.textContent = '—';
            } else {
                ksweepResults.textContent = rcSweep.results.map(r => `K=${r.K.toFixed(2)} NRMSE=${r.nrmse.toFixed(3)}`).join('\n');
            }
        }

        renderRCKSweepPlot();
    }
    
    function drawRCPlot() {
        const canvas = document.getElementById('rc-plot');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        
        // Clear
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, w, h);
        
        const predictions = reservoir.predictions;
        const targets = reservoir.targets;
        
        if (targets.length < 2) return;
        
        // Find y range
        const allValues = [...predictions, ...targets].filter(v => isFinite(v));
        if (allValues.length === 0) return;
        
        const yMin = Math.min(...allValues) - 0.1;
        const yMax = Math.max(...allValues) + 0.1;
        const yRange = yMax - yMin || 1;
        
        // Draw zero line
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        const zeroY = h - (0 - yMin) / yRange * h;
        ctx.beginPath();
        ctx.moveTo(0, zeroY);
        ctx.lineTo(w, zeroY);
        ctx.stroke();
        
        // Draw target (orange)
        ctx.strokeStyle = '#FF9800';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < targets.length; i++) {
            const x = (i / (targets.length - 1)) * w;
            const y = h - (targets[i] - yMin) / yRange * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // Draw prediction (blue)
        if (predictions.length > 0) {
            ctx.strokeStyle = '#2196F3';
            ctx.lineWidth = 2;
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < predictions.length; i++) {
                if (!isFinite(predictions[i])) continue;
                const x = (i / (Math.max(predictions.length, targets.length) - 1)) * w;
                const y = h - (predictions[i] - yMin) / yRange * h;
                if (!started) { ctx.moveTo(x, y); started = true; }
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        
        // Legend
        ctx.fillStyle = '#FF9800';
        ctx.fillRect(w - 80, 5, 12, 3);
        ctx.fillStyle = '#888';
        ctx.font = '9px sans-serif';
        ctx.fillText('target', w - 65, 10);
        
        ctx.fillStyle = '#2196F3';
        ctx.fillRect(w - 80, 15, 12, 3);
        ctx.fillStyle = '#888';
        ctx.fillText('pred', w - 65, 20);
    }

    function renderRCKSweepPlot() {
        if (!rcKsweepPlot) return;
        if (!rcSweep.results || rcSweep.results.length === 0) {
            rcKsweepPlot.render(new Float32Array(0));
            return;
        }
        // Sort results by K
        const sorted = [...rcSweep.results].sort((a, b) => a.K - b.K);
        const data = new Float32Array(sorted.length);
        for (let i = 0; i < sorted.length; i++) {
            data[i] = sorted[i].nrmse;
        }
        // Temporarily set x-axis scaling by reusing TimeSeriesPlot (uniform spacing)
        rcKsweepPlot.render(data);

        // Draw simple x-axis labels for K
        const canvas = rcKsweepPlot.canvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const W = rect.width;
        const H = rect.height;
        const left = rcKsweepPlot.leftMargin || 0;
        const plotWidth = W - left;
        const yAxis = H - 4;

        ctx.save();
        ctx.translate(0, 0);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, yAxis);
        ctx.lineTo(W, yAxis);
        ctx.stroke();

        ctx.fillStyle = '#777';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const ticks = [sorted[0].K, sorted[Math.floor(sorted.length / 2)].K, sorted[sorted.length - 1].K];
        ticks.forEach((k, idx) => {
            const t = idx / (ticks.length - 1 || 1);
            const x = left + t * plotWidth;
            ctx.beginPath();
            ctx.moveTo(x, yAxis);
            ctx.lineTo(x, yAxis + 4);
            ctx.stroke();
            ctx.fillText(k.toFixed(2), x, yAxis + 6);
        });
        ctx.restore();
    }

    function startRCKSweep() {
        const Ks = [];
        const startK = 0.2;
        const endK = 2.4;
        const step = 0.2;
        for (let k = startK; k <= endK + 1e-6; k += step) {
            Ks.push(parseFloat(k.toFixed(2)));
        }
        rcSweep = {
            active: true,
            Ks,
            idx: 0,
            steps: 0,
            stepsPerK: 300,
            results: []
        };
        beginSweepK();
        updateRCDisplay();
    }

    function beginSweepK() {
        if (!rcSweep.active) return;
        if (rcSweep.idx >= rcSweep.Ks.length) {
            rcSweep.active = false;
            STATE.rcTraining = false;
            STATE.rcInference = false;
            updateRCDisplay();
            return;
        }
        const K = rcSweep.Ks[rcSweep.idx];
        STATE.K0 = K;
        ui.updateDisplay();
        sim.updateFullParams(STATE);
        resetSimulation(sim);
        reservoir.setFeatureBudget(STATE.rcMaxFeatures);
        reservoir.setHistoryLength(STATE.rcHistoryLength);
        reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
        writeRCInputWeights();
        reservoir.startTraining();
        STATE.rcTraining = true;
        STATE.rcInference = false;
        rcSweep.steps = 0;
        updateRCDisplay();
    }

    function renderPhaseSpace(theta) {
        if (!phaseSpacePlot || !STATE.phaseSpaceEnabled || !theta) return;
        phaseSpacePlot.render(theta);
    }
    
    // Initialize display
    regenerateTopology();
    ui.updateDisplay();
    drawKernel(STATE);
    
    // Statistics throttling - compute every N frames for better performance
    let statsFrameCounter = 0;
    const getStatsInterval = () => {
        // GPU stats have overhead from readback - throttle more aggressively
        if (STATE.gridSize >= 512) return 2;   // Every 2 frames
        if (STATE.gridSize >= 256) return 4;   // Every 4 frames
        if (STATE.gridSize >= 128) return 6;   // Every 6 frames
        return 8;  // Every 8 frames for small grids
    };
    let lastStatsReadbackMs = 0;
    const STATS_READBACK_MIN_MS = 40;
    // Phase-space sampling throttling
    let phaseSpaceCounter = 0;
    const PHASE_SAMPLE_INTERVAL = 10;
    let phaseSpacePending = false;
    const RC_READ_MIN_MS = 40;

    function frame() {
        try {
            const frameNow = performance.now();
            if (!STATE.paused) STATE.frameTime += STATE.dt * STATE.timeScale;

            if (STATE.rcEnabled) {
                const layerNow = getActiveLayerIndex();
                if (layerNow !== rcActiveLayerSeen) {
                    rcActiveLayerSeen = layerNow;
                    writeRCInputWeights();
                }
            }
            
            // Update camera view mode
            camera.viewMode = STATE.viewMode;
            
            sim.updateParams(STATE); // Only update dynamic params (dt, time)
            
            const encoder = device.createCommandEncoder();
            
            // Only compute statistics if enabled and throttled
            statsFrameCounter++;
            const shouldComputeStats = STATE.showStatistics && statsFrameCounter >= getStatsInterval();
            if (shouldComputeStats) statsFrameCounter = 0;
            
            sim.step(encoder, STATE.delaySteps, STATE.globalCoupling, shouldComputeStats);
            
            // Request global order parameter readback for statistics (only if we computed stats)
            if (shouldComputeStats) {
                sim.requestGlobalOrderReadback(encoder);
            }
            
            const viewProj = camera.getMatrix(canvas.width / canvas.height, STATE.gridSize);
            const viewModeStr = STATE.viewMode === 0 ? '3d' : '2d';
            renderer.draw(encoder, sim, viewProj, STATE.gridSize * STATE.gridSize, viewModeStr, STATE.renderAllLayers, STATE.activeLayer, STATE.selectedLayers);
            
            device.queue.submit([encoder.finish()]);

            if (overlayDirty) {
                drawGraphOverlay(sim.topologyInfo);
                overlayDirty = false;
            }
            
            // Reservoir Computing: Always inject input signal when RC is enabled (for visualization)
            // Full RC step (training/inference) only when active
            if (STATE.rcEnabled && !STATE.paused) {
                if (STATE.rcTraining || STATE.rcInference) {
                    const nowMs = performance.now();
                    if (!rcReadPending && (nowMs - lastRCReadMs) >= RC_READ_MIN_MS) {
                        rcReadPending = true;
                        sim.readTheta().then(theta => {
                            if (theta) {
                                try {
                                    const thetaLayer = getActiveLayerThetaForRC(theta);
                                    reservoir.step(thetaLayer);
                                    if (reservoir.tasks && reservoir.tasks.taskType === 'moving_dot') {
                                        writeRCInputWeights();
                                    }
                                    sim.setInputSignal(reservoir.getInputSignal());
                                    updateRCDisplay();
                                    drawRCPlot();
                                    renderPhaseSpace(theta);
                                } catch (e) {
                                    console.error('RC step error:', e);
                                }
                            }
                        }).catch(e => {
                            console.error('RC readTheta error:', e);
                        }).finally(() => {
                            rcReadPending = false;
                            lastRCReadMs = performance.now();
                        });
                    }
                } else {
                    const demoSignal = Math.sin(performance.now() * 0.002) * STATE.rcInputStrength;
                    sim.setInputSignal(demoSignal);
                }
            }

            // RC K sweep bookkeeping
            if (rcSweep.active && STATE.rcTraining && !STATE.paused) {
                rcSweep.steps++;
                if (rcSweep.steps >= rcSweep.stepsPerK) {
                    const nrmse = reservoir.getNRMSE();
                    rcSweep.results.push({ K: STATE.K0, nrmse: isFinite(nrmse) ? nrmse : Infinity });
                    rcSweep.idx++;
                    beginSweepK();
                }
            }
        
        // Process readback and update statistics (async) - only if statistics enabled
        if (STATE.showStatistics) {
            const canReadback = sim.readbackPending && (frameNow - lastStatsReadbackMs >= STATS_READBACK_MIN_MS);
            if (canReadback) {
                sim.processReadback().then(result => {
                    if (result && !STATE.paused) {
                        stats.update(result.cos, result.sin, result.localStats);
                        lastStatsReadbackMs = frameNow;
                    }
                    
                    if (kScanner && kScanner.phase !== 'done' && kScanner.phase !== 'idle') {
                        const scanner = stats.createKScanner(sim, STATE);
                        kScanner = scanner.step(kScanner);
                        const progress = document.getElementById('kscan-progress');
                        if (progress) {
                            progress.textContent = `${Math.round(stats.scanProgress * 100)}%`;
                        }
                        if (kScanner.phase === 'done') {
                            document.getElementById('kscan-btn')?.classList.remove('active');
                            const progress = document.getElementById('kscan-progress');
                            if (progress) progress.textContent = 'Done!';
                            ui.updateDisplay();
                        }
                    }
                    
                    if (lyapunovCalc.isRunning && shouldComputeStats) {
                        stepLLE();
                    }
                });
            }
            
            updateStats(sim, stats, R_plot, chi_plot, phaseDiagramPlot);
        }

        // Phase space sampling (throttled when RC is idle)
        if (phaseSpacePlot && STATE.phaseSpaceEnabled && !(STATE.rcTraining || STATE.rcInference)) {
            phaseSpaceCounter++;
            const interval = STATE.gridSize >= 512 ? PHASE_SAMPLE_INTERVAL * 2 : PHASE_SAMPLE_INTERVAL;
            if (phaseSpaceCounter >= interval && !phaseSpacePending) {
                phaseSpaceCounter = 0;
                phaseSpacePending = true;
                sim.readTheta().then(theta => {
                    phaseSpacePending = false;
                    renderPhaseSpace(theta);
                }).catch(() => {
                    phaseSpacePending = false;
                });
            }
        }
        } catch (e) {
            console.error('Frame error:', e);
        }
        
        requestAnimationFrame(frame);
    }
    
    frame();
}

// Helper to download CSV
function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function resetSimulation(sim) {
    const thetaPattern = document.getElementById('theta-pattern-select')?.value || 'random';
    const omegaPattern = document.getElementById('omega-pattern-select')?.value || 'random';
    const omegaAmp = parseFloat(document.getElementById('omega-amplitude-slider')?.value || 0.4);

    applyThetaPattern(sim, thetaPattern);
    applyOmegaPattern(sim, omegaPattern, omegaAmp);
}

function applyThetaPattern(sim, pattern, targetLayers = null, thetaBase = null) {
    const N = sim.N;
    const GRID = sim.gridSize;
    const layers = sim.layers || 1;
    const layerSize = GRID * GRID;
    const theta = thetaBase ? new Float32Array(thetaBase) : new Float32Array(N);
    const TWO_PI = 6.28318;
    const targets = Array.isArray(targetLayers) && targetLayers.length > 0
        ? targetLayers
        : Array.from({ length: layers }, (_, i) => i);

    if (pattern === 'random') {
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let i = 0; i < layerSize; i++) theta[offset + i] = Math.random() * TWO_PI;
        });
    } else if (pattern === 'gradient') {
        const k = TWO_PI / (GRID * 1.414);
        for (const layer of targets) {
            const offset = layer * layerSize;
            for(let r=0; r<GRID; r++) {
                for(let c=0; c<GRID; c++) {
                    theta[offset + r*GRID+c] = k * (c + r);
                }
            }
        }
    } else if (pattern === 'spiral') {
        const cx = GRID/2, cy = GRID/2;
        for (const layer of targets) {
            const offset = layer * layerSize;
            for(let r=0; r<GRID; r++) {
                for(let c=0; c<GRID; c++) {
                    theta[offset + r*GRID+c] = Math.atan2(r-cy, c-cx);
                }
            }
        }
    } else if (pattern === 'checkerboard') {
        for (const layer of targets) {
            const offset = layer * layerSize;
            for(let r=0; r<GRID; r++) {
                for(let c=0; c<GRID; c++) {
                    theta[offset + r*GRID+c] = ((r+c)%2) * Math.PI;
                }
            }
        }
    } else if (pattern === 'target') {
        const cx = GRID / 2;
        const cy = GRID / 2;
        for (const layer of targets) {
            const offset = layer * layerSize;
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    const dx = c - cx;
                    const dy = r - cy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    theta[offset + r * GRID + c] = (dist / GRID) * TWO_PI * 4.0;
                }
            }
        }
    } else if (pattern === 'synchronized') {
        targets.forEach(layer => {
            const offset = layer * layerSize;
            theta.fill(0, offset, offset + layerSize);
        });
    } else if (pattern === 'image' && lastExternalCanvas) {
        const ctx = lastExternalCanvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, lastExternalCanvas.width, lastExternalCanvas.height);
        const pixels = imageData.data;
        
        for (const layer of targets) {
            const offset = layer * layerSize;
            for (let i = 0; i < layerSize; i++) {
                const row = Math.floor(i / GRID);
                const col = i % GRID;
                const imgX = Math.floor(col * lastExternalCanvas.width / GRID);
                const imgY = Math.floor((GRID - 1 - row) * lastExternalCanvas.height / GRID);
                const pixelIndex = (imgY * lastExternalCanvas.width + imgX) * 4;
                const r = pixels[pixelIndex] / 255;
                const g = pixels[pixelIndex + 1] / 255;
                const b = pixels[pixelIndex + 2] / 255;
                const brightness = (r + g + b) / 3;
                theta[offset + i] = brightness * TWO_PI;
            }
        }
    }
    sim.writeTheta(theta);
}

function applyOmegaPattern(sim, pattern, amp, targetLayers = null, omegaBase = null) {
    const N = sim.N;
    const GRID = sim.gridSize;
    const layers = sim.layers || 1;
    const layerSize = GRID * GRID;
    const omega = omegaBase ? new Float32Array(omegaBase) : new Float32Array(N);
    const targets = Array.isArray(targetLayers) && targetLayers.length > 0
        ? targetLayers
        : Array.from({ length: layers }, (_, i) => i);

    if (pattern === 'random') {
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for(let i=0; i<layerSize; i++) {
                const u1 = Math.random(), u2 = Math.random();
                const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                omega[offset + i] = z * amp;
            }
        });
    } else if (pattern === 'uniform') {
        targets.forEach(layer => {
            const offset = layer * layerSize;
            omega.fill(amp, offset, offset + layerSize);
        });
    } else if (pattern === 'gradient') {
        for (const layer of targets) {
            const offset = layer * layerSize;
            for(let r=0; r<GRID; r++) {
                for(let c=0; c<GRID; c++) {
                    omega[offset + r*GRID+c] = (r/(GRID-1) * 2 - 1) * amp;
                }
            }
        }
    } else if (pattern === 'checkerboard') {
        for (const layer of targets) {
            const offset = layer * layerSize;
            for(let r=0; r<GRID; r++) {
                for(let c=0; c<GRID; c++) {
                    omega[offset + r*GRID+c] = ((r+c)%2 ? 1 : -1) * amp;
                }
            }
        }
    } else if (pattern === 'center_fast') {
        const cx = GRID/2, cy = GRID/2, sigma = GRID/4;
        for (const layer of targets) {
            const offset = layer * layerSize;
            for(let r=0; r<GRID; r++) {
                for(let c=0; c<GRID; c++) {
                    const d2 = (c-cx)**2 + (r-cy)**2;
                    omega[offset + r*GRID+c] = amp * Math.exp(-d2 / (2*sigma*sigma));
                }
            }
        }
    }
    sim.writeOmega(omega);
    sim.storeOmega(omega);  // Store for CPU-side access (Lyapunov calc)
}

function randomizeTheta(sim) {
    const theta = new Float32Array(sim.N);
    for(let i=0; i<sim.N; i++) theta[i] = Math.random() * 6.28;
    sim.writeTheta(theta);
}

async function loadPreset(name, sim, ui) {
    console.log("Loading preset:", name);
    
    if (Presets[name]) {
        normalizeSelectedLayers(STATE.layerCount);
        const targets = STATE.selectedLayers;
        const applyAll = targets.length >= STATE.layerCount;
        
        // IMPORTANT: Read current state BEFORE calling the preset
        // Presets overwrite sim.thetaData via writeTheta()
        let baseTheta = null;
        let baseOmega = null;
        if (!applyAll) {
            baseTheta = sim.thetaData ? new Float32Array(sim.thetaData) : await sim.readTheta();
            baseOmega = sim.getOmega() ? new Float32Array(sim.getOmega()) : null;
        }
        
        // Run the preset (this writes to sim.thetaData for all layers, but presets
        // typically only fill layer 0 with meaningful data, leaving others zero)
        Presets[name](STATE, sim);
        
        // Sync STATE params to selected layers
        syncStateToLayerParams(targets);
        sim.writeLayerParams(STATE.layerParams);
        
        // If partial selection, merge: keep non-target layers from base, use preset for targets
        if (!applyAll && baseTheta) {
            const presetTheta = sim.thetaData ? new Float32Array(sim.thetaData) : null;
            if (presetTheta) {
                const layerSize = sim.gridSize * sim.gridSize;
                // Start with the preserved base (all layers)
                const combined = new Float32Array(baseTheta);
                // Only overwrite target layers with preset data from layer 0
                // (since most presets only set layer 0)
                targets.forEach(layerIdx => {
                    const targetOffset = layerIdx * layerSize;
                    // Copy from layer 0 of preset to target layer
                    combined.set(presetTheta.subarray(0, layerSize), targetOffset);
                });
                sim.writeTheta(combined);
            }
        }
        if (!applyAll && baseOmega) {
            const presetOmega = sim.getOmega();
            if (presetOmega) {
                const layerSize = sim.gridSize * sim.gridSize;
                const combinedOmega = new Float32Array(baseOmega);
                targets.forEach(layerIdx => {
                    const targetOffset = layerIdx * layerSize;
                    // Copy from layer 0 of preset to target layer
                    combinedOmega.set(presetOmega.subarray(0, layerSize), targetOffset);
                });
                sim.writeOmega(combinedOmega);
                sim.storeOmega(combinedOmega);
            }
        }
        
        ui.updateDisplay();
        sim.updateFullParams(STATE);
        drawKernel(STATE);
    } else {
        console.warn("Preset not found:", name);
        resetSimulation(sim);
    }
}

let fps = 0, frameCount = 0, lastTime = performance.now();
let plotUpdateCounter = 0;

function updateStats(sim, stats, R_plot, chi_plot, phaseDiagramPlot) {
    // Update FPS counter
    frameCount++;
    const now = performance.now();
    if (now - lastTime > 1000) {
        fps = Math.round(frameCount * 1000 / (now - lastTime));
        document.getElementById('fps').textContent = fps;
        document.getElementById('count').textContent = sim.N.toLocaleString();
        document.getElementById('grid').textContent = `${sim.gridSize}×${sim.gridSize}`;
        frameCount = 0;
        lastTime = now;
    }
    
    // Update statistics display (throttled to every 3 frames for performance)
    plotUpdateCounter++;
    if (plotUpdateCounter >= 3 && stats) {
        plotUpdateCounter = 0;
        
        // Update numeric displays
        const R_el = document.getElementById('stat-R');
        const globalR_el = document.getElementById('stat-globalR');
        const chi_el = document.getElementById('stat-chi');
        const Kc_el = document.getElementById('stat-Kc');
        
        // Display both local R (primary) and global R (for comparison)
        if (R_el) R_el.textContent = stats.localR.toFixed(3);
        if (globalR_el) globalR_el.textContent = stats.R.toFixed(3);
        
        // Format chi with appropriate precision
        if (chi_el) {
            const chi = stats.chi;
            if (chi < 0.001) {
                chi_el.textContent = chi.toExponential(1);
            } else if (chi < 1) {
                chi_el.textContent = chi.toFixed(4);
            } else {
                chi_el.textContent = chi.toFixed(2);
            }
        }
        
        if (Kc_el && stats.estimatedKc !== null) {
            Kc_el.textContent = stats.estimatedKc.toFixed(2);
        }
        
        // Update criticality indicator position (0-100%) - use local R
        const critMarker = document.getElementById('crit-marker');
        if (critMarker) {
            const pos = Math.min(100, Math.max(0, stats.localR * 100));
            critMarker.style.left = `${pos}%`;
            critMarker.style.background = '#4a9eff';
            critMarker.title = `Local R̄ = ${stats.localR.toFixed(3)}, Global R = ${stats.R.toFixed(3)}`;
        }
        
        // Update R(t) bar indicator - use local R
        const R_bar = document.getElementById('stat-R-bar');
        if (R_bar) {
            R_bar.style.width = `${stats.localR * 100}%`;
        }
        
        // Update plots - use local R (better metric)
        if (R_plot && R_plot.canvas) {
            R_plot.render(stats.getRecentR(300, true)); // true = use local R
        }
        
        if (chi_plot && chi_plot.canvas) {
            chi_plot.render(stats.getRecentChi(300));
        }

        // Update local R histogram
        const histCanvas = document.getElementById('local-hist');
        if (histCanvas && stats.localHist) {
            renderLocalHistogram(histCanvas, stats.localHist);
        }
        
        // Update phase diagram
        if (phaseDiagramPlot && phaseDiagramPlot.canvas && stats.phaseDiagramData.length > 0) {
            phaseDiagramPlot.setCurrentK(sim.lastGlobalOrder ? STATE.K0 : STATE.K0);
            phaseDiagramPlot.render(stats.phaseDiagramData, stats.estimatedKc);
        }
    }
}

function renderLocalHistogram(canvas, bins) {
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const maxVal = Math.max(...bins, 1e-6);
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, W, H);
    const barW = W / bins.length;
    for (let i = 0; i < bins.length; i++) {
        const h = (bins[i] / maxVal) * (H - 6);
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(i * barW + 1, H - h - 2, barW - 2, h);
    }
    ctx.strokeStyle = '#333';
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    ctx.fillStyle = '#777';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('0', 8, H - 2);
    ctx.fillText('1', W - 8, H - 2);
}

// ================= DRAW / ERASE OVERLAY =================
    function initDrawing(canvas) {
        if (!canvas) return;
        let isDrawing = false;
        const radius = 3;
        let currentMode = 'draw';

        const applyStroke = (evt, mode) => {
            if (!evt.metaKey) { isDrawing = false; return; } // require Cmd (or meta) to avoid conflicts
            if (drawPending) return;
            drawPending = true;
        const rect = canvas.getBoundingClientRect();
        const nx = (evt.clientX - rect.left) / rect.width;
        const ny = (evt.clientY - rect.top) / rect.height;
        // consistent orientation: map canvas directly to grid
        const gx = Math.floor(nx * STATE.gridSize);
        const gy = Math.floor(ny * STATE.gridSize);

        if (!drawSim) { drawPending = false; return; }
        drawSim.readTheta().then(theta => {
            if (!theta) { drawPending = false; return; }
            const TWO_PI = 6.28318530718;
            const layerSize = STATE.gridSize * STATE.gridSize;
            normalizeSelectedLayers(STATE.layerCount);
            const targets = STATE.selectedLayers;
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const x = (gx + dx + STATE.gridSize) % STATE.gridSize;
                    const y = (gy + dy + STATE.gridSize) % STATE.gridSize;
                    const base = y * STATE.gridSize + x;
                    targets.forEach(layerIdx => {
                        const idx = layerIdx * layerSize + base;
                        if (mode === 'erase') {
                            theta[idx] = 0;
                        } else {
                            theta[idx] = Math.random() * TWO_PI;
                        }
                    });
                }
            }
            drawSim.writeTheta(theta);
        }).finally(() => { drawPending = false; });
    };

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (!e.metaKey) return; // require cmd
        currentMode = e.shiftKey ? 'erase' : 'draw';
        STATE.drawMode = currentMode;
        isDrawing = true;
        applyStroke(e, currentMode);
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        applyStroke(e, currentMode);
    });
    window.addEventListener('mouseup', () => { isDrawing = false; });
}

function applyExternalInput(device, sim, canvas, amplitude) {
    // Get image data from canvas
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    
    // Create omega values based on image brightness/color
    const omega = new Float32Array(sim.N);
    const gridSize = sim.gridSize;
    
    for (let i = 0; i < sim.N; i++) {
        const row = Math.floor(i / gridSize);
        const col = i % gridSize;
        
        // Map grid position to image position
        const imgX = Math.floor(col * canvas.width / gridSize);
        // Flip Y coordinate so image appears right-side up in 2D view
        const imgY = Math.floor((gridSize - 1 - row) * canvas.height / gridSize);
        const pixelIndex = (imgY * canvas.width + imgX) * 4;
        
        // Get RGB values
        const r = pixels[pixelIndex] / 255;
        const g = pixels[pixelIndex + 1] / 255;
        const b = pixels[pixelIndex + 2] / 255;
        
        // Map RGB to frequency: use hue or brightness
        // Option 1: Use brightness (grayscale)
        const brightness = (r + g + b) / 3;
        omega[i] = (brightness - 0.5) * amplitude * 2;
        
        // Option 2: Use hue (commented out, but you can switch)
        // const hue = rgbToHue(r, g, b);
        // omega[i] = (hue / 360 - 0.5) * amplitude * 2;
    }
    
    sim.writeOmega(omega);
    sim.storeOmega(omega);  // Store for CPU-side access (Lyapunov calc)
}

function rgbToHue(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    
    if (delta === 0) return 0;
    
    let hue;
    if (max === r) {
        hue = ((g - b) / delta) % 6;
    } else if (max === g) {
        hue = (b - r) / delta + 2;
    } else {
        hue = (r - g) / delta + 4;
    }
    
    return hue * 60;
}

// Wrap init in error handler
init().catch(e => {
    console.error('Fatal error during initialization:', e);
    showError('Failed to initialize: ' + e.message);
});

// Handle browser navigation (back/forward) to restore state from URL
window.addEventListener('popstate', () => {
    // Reload STATE from URL and apply
    import('./urlstate.js').then(m => {
        m.loadStateFromURL(STATE);
        // Apply grid size change requires a resize cycle; we'll request a page reload if grid size differs
        // For simplicity, if gridSize differs from current sim, reload page to reconstruct everything.
        const currentGrid = STATE.gridSize;
        // Try to update in-place if possible
        try {
            // update UI and simulation parameters
            if (typeof sim !== 'undefined' && sim) {
                sim.updateFullParams(STATE);
            }
            if (typeof ui !== 'undefined' && ui) ui.updateDisplay();
        } catch (e) {
            console.warn('Could not apply URL state in-place:', e);
            window.location.reload();
        }
    }).catch(() => { window.location.reload(); });
});
