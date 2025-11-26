import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
import { Camera } from './common.js';
import { UIManager } from './ui.js';
import { Presets } from './presets.js';
import { drawKernel } from './kernel.js';

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
    kernelGaborPhase: 0.0 // phase offset (radians)
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
        onResizeGrid: (newSize) => {
            STATE.gridSize = newSize;
            sim.resize(newSize);
            renderer.invalidateBindGroup(); // Buffers changed, need new bind group
            resetSimulation(sim);
            sim.updateFullParams(STATE);
            drawKernel(STATE);
        }
    });
    
    // Initialize display
    ui.updateDisplay();
    sim.updateFullParams(STATE); // Initialize params buffer
    drawKernel(STATE);

    function frame() {
        if (!STATE.paused) STATE.frameTime += STATE.dt * STATE.timeScale;
        
        // Update camera view mode
        camera.viewMode = STATE.viewMode;
        
        sim.updateParams(STATE); // Only update dynamic params (dt, time)
        
        const encoder = device.createCommandEncoder();
        
        sim.step(encoder, STATE.delaySteps, STATE.globalCoupling);
        
        const viewProj = camera.getMatrix(canvas.width / canvas.height, STATE.gridSize);
        const viewModeStr = STATE.viewMode === 0 ? '3d' : '2d';
        renderer.draw(encoder, sim, viewProj, STATE.gridSize * STATE.gridSize, viewModeStr);
        
        device.queue.submit([encoder.finish()]);
        
        updateStats(sim);
        requestAnimationFrame(frame);
    }
    
    frame();
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

function updateStats(sim) {
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
