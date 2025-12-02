import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
import { Camera } from './common.js';
import { UIManager } from './ui.js';
import { Presets } from './presets.js';
import { drawKernel } from './kernel.js';
import { StatisticsTracker, TimeSeriesPlot, PhaseDiagramPlot, LyapunovCalculator } from './statistics.js';
import { ReservoirComputer } from './reservoir.js';

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
    delaySteps: 10,
    sigma: 1.2,
    sigma2: 1.2,
    beta: 0.6,
    showOrder: false,
    colormap: 0,
    noiseStrength: 0.0,
    frameTime: 0,
    thetaPattern: 'random',
    omegaPattern: 'random',
    omegaAmplitude: 0.4,
    viewMode: 0, // 0 = 3D, 1 = 2D
    gridSize: 256, // Adjustable grid size
    smoothingMode: 0, // 0=nearest (none), 1=bilinear, 2=bicubic, 3=gaussian
    showStatistics: true, // Enable/disable statistics computation and display
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
    rcHistoryLength: 20, // Number of timesteps to store for temporal features
    rcTask: 'sine', // 'sine', 'narma10', 'memory'
    rcTraining: false, // Currently collecting training data
    rcInference: false, // Running trained model
    rcTrainingSamples: 0, // Number of samples collected
    rcNRMSE: null // Performance metric after training
};

// Store the last external input canvas for pattern initialization
let lastExternalCanvas = null;

async function init() {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });

    const sim = new Simulation(device, STATE.gridSize);
    const renderer = new Renderer(device, format, canvas);
    renderer.setContext(context);
    const camera = new Camera(canvas);
    
    // Initialize statistics tracking
    const stats = new StatisticsTracker(STATE.gridSize * STATE.gridSize);
    
    // Initialize Lyapunov calculator
    let lyapunovCalc = new LyapunovCalculator(STATE.gridSize * STATE.gridSize);
    let lleUpdateInterval = null;
    
    // Initialize Reservoir Computer
    let reservoir = new ReservoirComputer(STATE.gridSize);
    let rcPlot = null;
    
    // Initialize plots (will be created when DOM is ready)
    let R_plot = null;
    let chi_plot = null;
    let phaseDiagramPlot = null;
    
    // K-scan state
    let kScanner = null;

    // Initial State
    resetSimulation(sim);

    const ui = new UIManager(STATE, {
        onParamChange: () => { 
            sim.updateFullParams(STATE);
            drawKernel(STATE); 
        },
        onDrawKernel: () => { drawKernel(STATE); },
        onPause: () => { 
            STATE.paused = !STATE.paused; 
            document.getElementById('pause-btn').textContent = STATE.paused ? 'Resume' : 'Pause';
        },
        onReset: () => resetSimulation(sim),
        onRandomize: () => randomizeTheta(sim),
        onPreset: (name) => loadPreset(name, sim, ui),
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
            const oldSize = STATE.gridSize;
            STATE.gridSize = newSize;
            
            try {
                // Use state-preserving resize to interpolate theta
                const interpolatedTheta = await sim.resizePreservingState(newSize);
                
                // Apply interpolated theta
                sim.writeTheta(interpolatedTheta);
                
                // Interpolate omega as well (using scalar interpolation, NOT phase interpolation)
                if (sim.omegaData) {
                    const interpolatedOmega = Simulation.interpolateScalar(sim.omegaData, oldSize, newSize);
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
            }
            
            stats.resize(newSize * newSize);
            lyapunovCalc.resize(newSize * newSize);
            reservoir.resize(newSize);
            renderer.invalidateBindGroup(); // Buffers changed, need new bind group
            sim.updateFullParams(STATE);
            drawKernel(STATE);
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
                sim.writeInputWeights(weights);
            } else {
                // Clear input signal when disabling RC
                sim.setInputSignal(0);
                console.log('RC disabled');
            }
        },
        onRCConfigure: () => {
            reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
            reservoir.setTask(STATE.rcTask);
            // Write input weights to GPU
            sim.writeInputWeights(reservoir.getInputWeights());
        },
        onRCStartTraining: () => {
            if (!STATE.rcEnabled) {
                alert('Enable Reservoir Computing first');
                return;
            }
            reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
            reservoir.setTask(STATE.rcTask);
            // Write input weights to GPU
            sim.writeInputWeights(reservoir.getInputWeights());
            reservoir.startTraining();
            STATE.rcTraining = true;
            STATE.rcInference = false;
            updateRCDisplay();
        },
        onRCStopTraining: () => {
            STATE.rcTraining = false;
            const nrmse = reservoir.stopTraining();
            STATE.rcNRMSE = nrmse;
            updateRCDisplay();
        },
        onRCStartInference: () => {
            if (reservoir.startInference()) {
                STATE.rcInference = true;
                STATE.rcTraining = false;
                updateRCDisplay();
            }
        },
        onRCStopInference: () => {
            reservoir.stopInference();
            STATE.rcInference = false;
            updateRCDisplay();
        }
    });
    
    // Initialize plots after DOM is ready
    setTimeout(() => {
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
            stats.resize(gridSize * gridSize);
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
        stats.resize(originalGridSize * originalGridSize);
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
        const inputRegion = document.getElementById('rc-input-region');
        const outputRegion = document.getElementById('rc-output-region');
        const inputStrength = document.getElementById('rc-input-strength');
        const inputStrengthVal = document.getElementById('rc-input-strength-val');
        const trainBtn = document.getElementById('rc-train-btn');
        const stopBtn = document.getElementById('rc-stop-btn');
        const testBtn = document.getElementById('rc-test-btn');
        
        if (enabledCheck) {
            enabledCheck.addEventListener('change', () => {
                STATE.rcEnabled = enabledCheck.checked;
                const content = document.getElementById('rc-content');
                if (content) content.style.opacity = STATE.rcEnabled ? '1' : '0.5';
                if (STATE.rcEnabled) {
                    reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
                    sim.writeInputWeights(reservoir.getInputWeights());
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
        
        if (inputRegion) {
            inputRegion.addEventListener('change', () => {
                STATE.rcInputRegion = inputRegion.value;
                if (STATE.rcEnabled) {
                    reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
                    sim.writeInputWeights(reservoir.getInputWeights());
                }
            });
        }
        
        if (outputRegion) {
            outputRegion.addEventListener('change', () => {
                STATE.rcOutputRegion = outputRegion.value;
                if (STATE.rcEnabled) {
                    reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
                    sim.writeInputWeights(reservoir.getInputWeights());
                }
            });
        }
        
        if (inputStrength) {
            inputStrength.addEventListener('input', () => {
                STATE.rcInputStrength = parseFloat(inputStrength.value);
                if (inputStrengthVal) inputStrengthVal.textContent = STATE.rcInputStrength.toFixed(1);
                if (STATE.rcEnabled) {
                    reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
                    sim.writeInputWeights(reservoir.getInputWeights());
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
                sim.writeInputWeights(reservoir.getInputWeights());
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
    }
    
    function updateRCDisplay() {
        const statusEl = document.getElementById('rc-status');
        const samplesEl = document.getElementById('rc-samples');
        const nrmseEl = document.getElementById('rc-nrmse');
        
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
    
    // Initialize display
    ui.updateDisplay();
    sim.updateFullParams(STATE); // Initialize params buffer
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

    function frame() {
        try {
            if (!STATE.paused) STATE.frameTime += STATE.dt * STATE.timeScale;
            
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
            renderer.draw(encoder, sim, viewProj, STATE.gridSize * STATE.gridSize, viewModeStr);
            
            device.queue.submit([encoder.finish()]);
            
            // Reservoir Computing: Always inject input signal when RC is enabled (for visualization)
            // Full RC step (training/inference) only when active
            if (STATE.rcEnabled && !STATE.paused) {
                if (STATE.rcTraining || STATE.rcInference) {
                    // Full RC step with training/inference
                    sim.readTheta().then(theta => {
                        if (theta) {
                            try {
                                reservoir.step(theta);
                                // Write the new input signal to GPU for next simulation step
                                sim.setInputSignal(reservoir.getInputSignal());
                                updateRCDisplay();
                                drawRCPlot();
                            } catch (e) {
                                console.error('RC step error:', e);
                            }
                        }
                    }).catch(e => {
                        console.error('RC readTheta error:', e);
                    });
                } else {
                    // Just inject input for visualization (no training)
                    // Generate a simple oscillating signal so user can see dynamics
                    const demoSignal = Math.sin(performance.now() * 0.002) * STATE.rcInputStrength;
                    sim.setInputSignal(demoSignal);
                }
            }
        
        // Process readback and update statistics (async) - only if statistics enabled
        if (STATE.showStatistics) {
            sim.processReadback().then(result => {
                if (result && !STATE.paused) {
                    // Pass both global order and local stats to statistics tracker
                    stats.update(result.cos, result.sin, result.localStats);
                }
                
                // Update K-scanner if running (even when paused, for scan progress)
                if (kScanner && kScanner.phase !== 'done' && kScanner.phase !== 'idle') {
                    // Use the scanner's step method with the existing scanner state
                    const scanner = stats.createKScanner(sim, STATE);
                    kScanner = scanner.step(kScanner);
                    
                    // Update progress UI
                    const progress = document.getElementById('kscan-progress');
                    if (progress) {
                        progress.textContent = `${Math.round(stats.scanProgress * 100)}%`;
                    }
                    
                    if (kScanner.phase === 'done') {
                        document.getElementById('kscan-btn')?.classList.remove('active');
                        const progress = document.getElementById('kscan-progress');
                        if (progress) progress.textContent = 'Done!';
                        
                        // Update K slider display
                        ui.updateDisplay();
                    }
                }
                
                // Step Lyapunov calculation if running
                if (lyapunovCalc.isRunning && shouldComputeStats) {
                    stepLLE();
                }
            });
            
            updateStats(sim, stats, R_plot, chi_plot, phaseDiagramPlot);
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

function applyThetaPattern(sim, pattern) {
    const N = sim.N;
    const GRID = sim.gridSize;
    const theta = new Float32Array(N);
    const TWO_PI = 6.28318;

    if (pattern === 'random') {
        for(let i=0; i<N; i++) theta[i] = Math.random() * TWO_PI;
    } else if (pattern === 'gradient') {
        const k = TWO_PI / (GRID * 1.414);
        for(let r=0; r<GRID; r++) {
            for(let c=0; c<GRID; c++) {
                theta[r*GRID+c] = k * (c + r);
            }
        }
    } else if (pattern === 'spiral') {
        const cx = GRID/2, cy = GRID/2;
        for(let r=0; r<GRID; r++) {
            for(let c=0; c<GRID; c++) {
                theta[r*GRID+c] = Math.atan2(r-cy, c-cx);
            }
        }
    } else if (pattern === 'checkerboard') {
        for(let r=0; r<GRID; r++) {
            for(let c=0; c<GRID; c++) {
                theta[r*GRID+c] = ((r+c)%2) * Math.PI;
            }
        }
    } else if (pattern === 'synchronized') {
        theta.fill(0);
    } else if (pattern === 'image' && lastExternalCanvas) {
        // Initialize theta from image brightness/hue
        const ctx = lastExternalCanvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, lastExternalCanvas.width, lastExternalCanvas.height);
        const pixels = imageData.data;
        const TWO_PI = 6.28318;
        
        for (let i = 0; i < N; i++) {
            const row = Math.floor(i / GRID);
            const col = i % GRID;
            
            // Map grid position to image position (flip Y)
            const imgX = Math.floor(col * lastExternalCanvas.width / GRID);
            const imgY = Math.floor((GRID - 1 - row) * lastExternalCanvas.height / GRID);
            const pixelIndex = (imgY * lastExternalCanvas.width + imgX) * 4;
            
            const r = pixels[pixelIndex] / 255;
            const g = pixels[pixelIndex + 1] / 255;
            const b = pixels[pixelIndex + 2] / 255;
            
            // Map brightness to phase
            const brightness = (r + g + b) / 3;
            theta[i] = brightness * TWO_PI;
        }
    }
    sim.writeTheta(theta);
}

function applyOmegaPattern(sim, pattern, amp) {
    const N = sim.N;
    const GRID = sim.gridSize;
    const omega = new Float32Array(N);

    if (pattern === 'random') {
        for(let i=0; i<N; i++) {
            const u1 = Math.random(), u2 = Math.random();
            const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            omega[i] = z * amp;
        }
    } else if (pattern === 'uniform') {
        omega.fill(amp);
    } else if (pattern === 'gradient') {
        for(let r=0; r<GRID; r++) {
            for(let c=0; c<GRID; c++) {
                omega[r*GRID+c] = (r/(GRID-1) * 2 - 1) * amp;
            }
        }
    } else if (pattern === 'checkerboard') {
        for(let r=0; r<GRID; r++) {
            for(let c=0; c<GRID; c++) {
                omega[r*GRID+c] = ((r+c)%2 ? 1 : -1) * amp;
            }
        }
    } else if (pattern === 'center_fast') {
        const cx = GRID/2, cy = GRID/2, sigma = GRID/4;
        for(let r=0; r<GRID; r++) {
            for(let c=0; c<GRID; c++) {
                const d2 = (c-cx)**2 + (r-cy)**2;
                omega[r*GRID+c] = amp * Math.exp(-d2 / (2*sigma*sigma));
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

function loadPreset(name, sim, ui) {
    console.log("Loading preset:", name);
    
    if (Presets[name]) {
        Presets[name](STATE, sim);
        ui.updateDisplay();
        sim.updateFullParams(STATE); // Update all params after preset
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
        
        // Update phase diagram
        if (phaseDiagramPlot && phaseDiagramPlot.canvas && stats.phaseDiagramData.length > 0) {
            phaseDiagramPlot.setCurrentK(sim.lastGlobalOrder ? STATE.K0 : STATE.K0);
            phaseDiagramPlot.render(stats.phaseDiagramData, stats.estimatedKc);
        }
    }
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

init();
