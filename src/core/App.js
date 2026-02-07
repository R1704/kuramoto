/**
 * App.js
 * 
 * Main application orchestrator. Coordinates WebGPU initialization,
 * simulation, rendering, and event handling.
 */

import { Simulation } from '../simulation/index.js';
import { Renderer } from '../rendering/index.js';
import { Camera } from '../utils/index.js';
import { getStateManager } from '../state/index.js';
import { UIManager } from '../ui/index.js';
import { drawKernel } from '../patterns/index.js';
import { loadStateFromURL } from '../utils/index.js';
import { StatisticsTracker } from '../statistics/index.js';
import { ReservoirComputer } from '../reservoir/index.js';
import { generateTopology } from '../topology/index.js';
import { makeRng, normalizeSeed, cryptoSeedFallback } from '../utils/index.js';
import { ExperimentRunner, RCCriticalitySweepRunner, RCInjectionModeCompareRunner } from '../experiments/index.js';
import { encodeFloat32ToBase64 } from '../utils/index.js';

export class App {
    constructor() {
        this.state = getStateManager();
        this.device = null;
        this.adapter = null;
        this.canvas = null;
        this.context = null;
        this.format = null;
        
        this.sim = null;
        this.renderer = null;
        this.camera = null;
        this.ui = null;
        
        this.stats = null;
        this.lyapunovCalc = null;
        this.reservoir = null;
        
        this.experimentRunner = null;
        this.rcCritSweepRunner = null;
        this.rcModeCompareRunner = null;
        this.kScanner = null;
        
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.running = false;
        
        // Sparkline state
        this.sparkline = {
            rCanvas: null,
            chiCanvas: null,
            rCtx: null,
            chiCtx: null,
            rBuf: null,
            chiBuf: null,
            lastDrawMs: 0,
            minMs: 180,
        };
        
        // Bind methods for callbacks
        this.onParamChange = this.onParamChange.bind(this);
        this.onTopologyChange = this.onTopologyChange.bind(this);
        this.onReset = this.onReset.bind(this);
        this.onResizeGrid = this.onResizeGrid.bind(this);
    }
    
    /**
     * Initialize the application
     */
    async init() {
        // Check WebGPU support
        if (!navigator.gpu) {
            this.showError('WebGPU is not supported. Please use Chrome 113+, Edge 113+, or Safari 17+ with WebGPU enabled.');
            return false;
        }
        
        this.adapter = await navigator.gpu.requestAdapter();
        if (!this.adapter) {
            this.showError('Failed to get WebGPU adapter. Your GPU may not be supported.');
            return false;
        }
        
        try {
            const requiredFeatures = [];
            if (this.adapter.features.has('float32-filterable')) {
                requiredFeatures.push('float32-filterable');
            }
            this.device = await this.adapter.requestDevice({ requiredFeatures });
        } catch (e) {
            this.showError('Failed to get WebGPU device: ' + e.message);
            return false;
        }
        
        // Handle device loss
        this.device.lost.then((info) => {
            console.error('WebGPU device lost:', info.message);
            if (info.reason !== 'destroyed') {
                this.showError('WebGPU device was lost. Please refresh the page.');
            }
        });
        
        // Setup canvas
        this.canvas = document.getElementById('canvas');
        this.context = this.canvas.getContext('webgpu');
        if (!this.context) {
            this.showError('Failed to get WebGPU context from canvas.');
            return false;
        }
        
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
        
        // Load state from URL
        loadStateFromURL(this.state.get());
        
        // Initialize seed
        if (this.state.getValue('seed') === undefined) {
            this.state.set('seed', cryptoSeedFallback());
        }
        this.state.set('seed', normalizeSeed(this.state.getValue('seed')));
        
        // Initialize layer params
        this.state.ensureLayerParams(this.state.getValue('layerCount'));
        
        // Create simulation
        const gridSize = this.state.getValue('gridSize');
        const layerCount = this.state.getValue('layerCount');
        this.sim = new Simulation(this.device, gridSize, layerCount);
        
        // Update state with actual layer count
        this.state.set('layerCount', this.sim.layers);
        this.state.set('activeLayer', Math.min(this.state.getValue('activeLayer'), this.sim.layers - 1));
        this.state.normalizeSelectedLayers(this.sim.layers);
        this.state.applyLayerParams(this.state.getValue('activeLayer'));
        
        // Initialize simulation
        this.sim.updateFullParams(this.state.get());
        this.sim.setManifoldMode(this.state.getValue('manifoldMode'));
        this.sim.writeLayerParams(this.state.getValue('layerParams'));
        
        // Create renderer
        this.renderer = new Renderer(this.device, this.format, this.canvas, gridSize);
        this.renderer.setMeshMode(this.state.getValue('surfaceMode'));
        this.renderer.setContext(this.context);
        
        // Create camera
        this.camera = new Camera(this.canvas);
        
        // Initialize statistics
        const totalOscillators = gridSize * gridSize * this.sim.layers;
        this.stats = new StatisticsTracker(totalOscillators);
        
        // Initialize Lyapunov calculator
        // this.lyapunovCalc = new LyapunovCalculator(totalOscillators);
        
        // Initialize reservoir
        this.reservoir = new ReservoirComputer(gridSize);
        this.reservoir.setSeed?.(this.state.getValue('seed'));
        
        // Initialize experiment runners
        this.experimentRunner = new ExperimentRunner({
            device: this.device,
            sim: this.sim,
            stats: this.stats,
            getState: () => this.state.get(),
            onUpdate: (data) => this.onExperimentUpdate(data)
        });
        
        this.rcCritSweepRunner = new RCCriticalitySweepRunner({
            device: this.device,
            sim: this.sim,
            stats: this.stats,
            getState: () => this.state.get(),
            onUpdate: (data) => this.onRCCritSweepUpdate(data)
        });
        
        this.rcModeCompareRunner = new RCInjectionModeCompareRunner({
            device: this.device,
            sim: this.sim,
            stats: this.stats,
            getState: () => this.state.get(),
            onUpdate: (data) => this.onRCModeCompareUpdate(data)
        });
        
        // Setup UI
        this.ui = new UIManager(this.state.get(), {
            onParamChange: this.onParamChange,
            onTopologyChange: this.onTopologyChange,
            onReset: this.onReset,
            onResizeGrid: this.onResizeGrid,
            // Add more callbacks as needed
        });
        
        // Initialize sparklines
        this.initSparklines();
        
        // Setup resize handler
        this.setupResizeHandler();
        
        // Generate initial topology
        this.regenerateTopology();
        
        // Initialize simulation state
        this.initializeSimulation();
        
        // Start render loop
        this.running = true;
        this.lastFrameTime = performance.now();
        requestAnimationFrame(() => this.loop());
        
        return true;
    }
    
    /**
     * Main render loop
     */
    loop() {
        if (!this.running) return;
        
        const now = performance.now();
        const dt = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        
        // Update simulation
        if (!this.state.getValue('paused')) {
            this.stepSimulation();
        }
        
        // Render
        this.render();
        
        // Update statistics
        this.updateStatistics();
        
        // Update UI
        this.ui.updateDisplay();
        
        requestAnimationFrame(() => this.loop());
    }
    
    /**
     * Step the simulation one frame
     */
    stepSimulation() {
        const state = this.state.get();
        const delaySteps = state.delaySteps;
        const globalCoupling = state.globalCoupling;
        
        const encoder = this.device.createCommandEncoder();
        this.sim.step(encoder, delaySteps, globalCoupling, true);
        this.device.queue.submit([encoder.finish()]);
    }
    
    /**
     * Render the current frame
     */
    render() {
        const state = this.state.get();
        const aspect = this.canvas.width / this.canvas.height;
        const viewProj = this.camera.getMatrix(aspect, state.gridSize);
        
        const encoder = this.device.createCommandEncoder();
        this.renderer.draw(
            encoder,
            this.sim,
            viewProj,
            this.sim.N,
            state.viewMode === 0 ? '3d' : '2d',
            state.renderAllLayers,
            state.activeLayer,
            state.selectedLayers
        );
        this.device.queue.submit([encoder.finish()]);
    }
    
    /**
     * Update statistics displays
     */
    updateStatistics() {
        const globalOrder = this.sim.getLastGlobalOrder();
        const localStats = this.sim.getLastLocalStats();
        
        if (globalOrder) {
            this.stats.update(globalOrder.cos, globalOrder.sin, localStats);
            this.updateSparklines();
        }
    }
    
    /**
     * Handle parameter changes from UI
     */
    onParamChange() {
        const state = this.state.get();
        
        // Handle manifold mode restrictions
        if (state.manifoldMode !== 's1') {
            if (state.ruleMode !== 0) this.state.set('ruleMode', 0);
            if (state.harmonicA !== 0.0) this.state.set('harmonicA', 0.0);
            if (state.harmonicB !== 0.0) this.state.set('harmonicB', 0.0);
            if (state.delaySteps !== 0) this.state.set('delaySteps', 0);
            if (state.globalCoupling !== false) this.state.set('globalCoupling', false);
            if (state.rcEnabled) {
                this.state.set('rcEnabled', false);
                this.sim.setInputSignal(0);
            }
        }
        
        // Sync and update
        this.state.normalizeSelectedLayers(this.state.getValue('layerCount'));
        this.state.syncToLayerParams(this.state.getValue('selectedLayers'));
        this.sim.writeLayerParams(this.state.getValue('layerParams'));
        this.sim.updateFullParams(this.state.get());
        this.sim.setManifoldMode(this.state.getValue('manifoldMode'));
        this.renderer.invalidateBindGroup();
        
        // Redraw kernel visualization
        drawKernel(this.state.get());
    }
    
    /**
     * Regenerate network topology
     */
    regenerateTopology() {
        const state = this.state.get();
        const maxDegree = state.topologyMaxDegree || 16;
        
        const topology = generateTopology({
            mode: state.topologyMode,
            gridSize: state.gridSize,
            maxDegree,
            seed: state.topologySeed,
            wsK: state.topologyWSK,
            wsRewire: state.topologyWSRewire,
            baM0: state.topologyBAM0,
            baM: state.topologyBAM,
        });
        
        this.sim.writeTopology(topology);
        this.state.set('topologyAvgDegree', state.topologyMode === 'grid' ? 0 : (topology.avgDegree ?? 0));
        this.state.set('topologyClamped', topology.clamped || false);
    }
    
    /**
     * Initialize simulation with initial conditions
     */
    initializeSimulation() {
        // TODO: Extract pattern initialization logic
        // For now, use presets or random initialization
        this.onReset();
    }
    
    /**
     * Reset simulation to initial state
     */
    onReset() {
        // TODO: Implement reset logic
        // This should apply the current theta/omega patterns
    }
    
    /**
     * Handle topology changes
     */
    onTopologyChange() {
        if (this.experimentRunner?.isRunning() || 
            this.rcCritSweepRunner?.isRunning() ||
            this.rcModeCompareRunner?.isRunning()) {
            return;
        }
        this.regenerateTopology();
    }
    
    /**
     * Handle grid resize
     */
    async onResizeGrid(newSize) {
        // Cancel any running experiments
        this.experimentRunner?.cancel();
        this.rcCritSweepRunner?.cancel();
        this.rcModeCompareRunner?.cancel();
        
        const oldSize = this.state.getValue('gridSize');
        this.state.set('gridSize', newSize);
        
        try {
            const interpolatedTheta = await this.sim.resizePreservingState(newSize);
            this.sim.writeTheta(interpolatedTheta);
            
            if (this.sim.omegaData) {
                const interpolatedOmega = Simulation.interpolateScalar(
                    this.sim.omegaData, oldSize, newSize, this.sim.layers || 1
                );
                this.sim.writeOmega(interpolatedOmega);
                this.sim.storeOmega(interpolatedOmega);
            } else {
                this.onReset();
            }
        } catch (e) {
            console.warn('State-preserving resize failed, falling back to reset:', e);
            this.sim.resize(newSize);
            this.onReset();
        }
        
        this.renderer.rebuildMesh(newSize);
        this.stats.resize(newSize * newSize * this.state.getValue('layerCount'));
        this.reservoir.resize(newSize);
        this.renderer.invalidateBindGroup();
        this.regenerateTopology();
        drawKernel(this.state.get());
        this.sim.setManifoldMode(this.state.getValue('manifoldMode'));
    }
    
    /**
     * Initialize sparkline canvases
     */
    initSparklines() {
        this.sparkline.rCanvas = document.getElementById('spark-r');
        this.sparkline.chiCanvas = document.getElementById('spark-chi');
        this.sparkline.rCtx = this.sparkline.rCanvas?.getContext('2d');
        this.sparkline.chiCtx = this.sparkline.chiCanvas?.getContext('2d');
        this.sparkline.rBuf = new Float32Array(160);
        this.sparkline.chiBuf = new Float32Array(160);
    }
    
    /**
     * Update sparkline displays
     */
    updateSparklines() {
        // TODO: Implement sparkline rendering
    }
    
    /**
     * Setup window resize handler
     */
    setupResizeHandler() {
        const resize = () => {
            if (!this.canvas) return;
            const dpr = window.devicePixelRatio || 1;
            const rect = this.canvas.getBoundingClientRect();
            const w = Math.max(1, Math.round(rect.width * dpr));
            const h = Math.max(1, Math.round(rect.height * dpr));
            
            if (this.canvas.width !== w || this.canvas.height !== h) {
                this.canvas.width = w;
                this.canvas.height = h;
                this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
                this.renderer.resize(w, h);
            }
        };
        
        window.addEventListener('resize', resize, { passive: true });
        resize();
    }
    
    /**
     * Show error message
     */
    showError(message) {
        const container = document.getElementById('canvas-container');
        if (container) {
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
                ">
                    <h2 style="margin-bottom: 20px;">⚠️ WebGPU Error</h2>
                    <p>${message}</p>
                    ${safariNote}
                </div>
            `;
        }
        console.error('WebGPU Error:', message);
    }
    
    // Experiment callbacks
    onExperimentUpdate(data) {
        // TODO: Handle experiment updates
    }
    
    onRCCritSweepUpdate(data) {
        // TODO: Handle RC criticality sweep updates
    }
    
    onRCModeCompareUpdate(data) {
        // TODO: Handle RC mode comparison updates
    }
}
