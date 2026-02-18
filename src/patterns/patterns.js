/**
 * Pattern Application Module
 *
 * Functions for initializing oscillator phases and frequencies
 * with various spatial patterns (random, gradient, spiral, etc.)
 */

import { makeRng } from '../utils/index.js';

const TWO_PI = 6.28318;

function wrapToPi(value) {
    let v = value;
    while (v <= -Math.PI) v += 2 * Math.PI;
    while (v > Math.PI) v -= 2 * Math.PI;
    return v;
}

/**
 * Reset simulation to initial state based on current pattern selections.
 * @param {Object} sim - Simulation instance
 * @param {Object} STATE - Application state
 * @param {HTMLCanvasElement} lastExternalCanvas - External input canvas (for image pattern)
 */
export function resetSimulation(sim, STATE, lastExternalCanvas = null) {
    const thetaPattern = document.getElementById('theta-pattern-select')?.value || 'random';
    const omegaPattern = document.getElementById('omega-pattern-select')?.value || 'random';
    const omegaAmp = parseFloat(document.getElementById('omega-amplitude-slider')?.value || 0.4);

    if (STATE.manifoldMode === 's3') {
        applyS3Pattern(sim, thetaPattern, null, null, makeRng(STATE.seed, `s3:${thetaPattern}`));
        applyOmega3Pattern(sim, omegaPattern, omegaAmp, null, null, makeRng(STATE.seed, `s3omega:${omegaPattern}`));
        return;
    }
    if (STATE.manifoldMode === 's2') {
        applyS2Pattern(sim, thetaPattern, null, null, makeRng(STATE.seed, `s2:${thetaPattern}`));
        applyOmegaVecPattern(sim, omegaPattern, omegaAmp, null, null, makeRng(STATE.seed, `s2omega:${omegaPattern}`));
        return;
    }
    if (STATE.manifoldMode !== 's1') {
        return;
    }

    const thetaRng = makeRng(STATE.seed, `theta:${thetaPattern}`);
    const omegaRng = makeRng(STATE.seed, `omega:${omegaPattern}`);
    applyThetaPattern(sim, thetaPattern, null, null, thetaRng, STATE, lastExternalCanvas);
    applyOmegaPattern(sim, omegaPattern, omegaAmp, null, null, omegaRng, STATE);
}

/**
 * Apply theta (phase) pattern to S1 manifold oscillators.
 * @param {Object} sim - Simulation instance
 * @param {string} pattern - Pattern type ('random', 'gradient', 'spiral', 'checkerboard', 'target', 'synchronized', 'image')
 * @param {number[]|null} targetLayers - Array of layer indices to apply, or null for all
 * @param {Float32Array|null} thetaBase - Base theta values to modify, or null for new array
 * @param {Object|null} rng - Random number generator
 * @param {Object} STATE - Application state
 * @param {HTMLCanvasElement|null} lastExternalCanvas - External canvas for image pattern
 */
export function applyThetaPattern(sim, pattern, targetLayers = null, thetaBase = null, rng = null, STATE = null, lastExternalCanvas = null) {
    if (STATE && STATE.manifoldMode !== 's1') {
        if (STATE.manifoldMode === 's2') {
            applyS2Pattern(sim, pattern, targetLayers, null, rng);
        }
        return;
    }
    const N = sim.N;
    const GRID = sim.gridSize;
    const layers = sim.layers || 1;
    const layerSize = GRID * GRID;
    const theta = thetaBase ? new Float32Array(thetaBase) : new Float32Array(N);
    const targets = Array.isArray(targetLayers) && targetLayers.length > 0
        ? targetLayers
        : Array.from({ length: layers }, (_, i) => i);

    if (pattern === 'random') {
        const rand = rng ? rng.float : Math.random;
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let i = 0; i < layerSize; i++) theta[offset + i] = rand() * TWO_PI;
        });
    } else if (pattern === 'gradient') {
        const k = TWO_PI / (GRID * 1.414);
        for (const layer of targets) {
            const offset = layer * layerSize;
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    theta[offset + r * GRID + c] = k * (c + r);
                }
            }
        }
    } else if (pattern === 'spiral') {
        const cx = GRID / 2;
        const cy = GRID / 2;
        for (const layer of targets) {
            const offset = layer * layerSize;
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    theta[offset + r * GRID + c] = Math.atan2(r - cy, c - cx);
                }
            }
        }
    } else if (pattern === 'checkerboard') {
        for (const layer of targets) {
            const offset = layer * layerSize;
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    theta[offset + r * GRID + c] = ((r + c) % 2) * Math.PI;
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

/**
 * Apply omega (frequency) pattern to S1 manifold oscillators.
 * @param {Object} sim - Simulation instance
 * @param {string} pattern - Pattern type ('random', 'uniform', 'gradient', 'checkerboard', 'center_fast')
 * @param {number} amp - Amplitude/frequency scale
 * @param {number[]|null} targetLayers - Array of layer indices to apply, or null for all
 * @param {Float32Array|null} omegaBase - Base omega values to modify, or null for new array
 * @param {Object|null} rng - Random number generator
 * @param {Object} STATE - Application state
 */
export function applyOmegaPattern(sim, pattern, amp, targetLayers = null, omegaBase = null, rng = null, STATE = null) {
    if (STATE && STATE.manifoldMode !== 's1') {
        if (STATE.manifoldMode === 's2') {
            applyOmegaVecPattern(sim, pattern, amp, targetLayers, null, rng);
        }
        return;
    }
    const N = sim.N;
    const GRID = sim.gridSize;
    const layers = sim.layers || 1;
    const layerSize = GRID * GRID;
    const omega = omegaBase ? new Float32Array(omegaBase) : new Float32Array(N);
    const targets = Array.isArray(targetLayers) && targetLayers.length > 0
        ? targetLayers
        : Array.from({ length: layers }, (_, i) => i);

    if (pattern === 'random') {
        const normal = rng ? rng.normal : null;
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let i = 0; i < layerSize; i++) {
                if (normal) {
                    omega[offset + i] = normal(0, amp);
                } else {
                    const u1 = Math.random(), u2 = Math.random();
                    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                    omega[offset + i] = z * amp;
                }
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
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    omega[offset + r * GRID + c] = (r / (GRID - 1) * 2 - 1) * amp;
                }
            }
        }
    } else if (pattern === 'checkerboard') {
        for (const layer of targets) {
            const offset = layer * layerSize;
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    omega[offset + r * GRID + c] = ((r + c) % 2 ? 1 : -1) * amp;
                }
            }
        }
    } else if (pattern === 'center_fast') {
        const cx = GRID / 2;
        const cy = GRID / 2;
        const sigma = GRID / 4;
        for (const layer of targets) {
            const offset = layer * layerSize;
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    const d2 = (c - cx) ** 2 + (r - cy) ** 2;
                    omega[offset + r * GRID + c] = amp * Math.exp(-d2 / (2 * sigma * sigma));
                }
            }
        }
    }
    sim.writeOmega(omega);
    sim.storeOmega(omega);
}

/**
 * Apply gauge-link initialization pattern (U(1), S1 manifold).
 * Returns generated gauge arrays for callers that need them.
 * @param {Object} sim - Simulation instance
 * @param {string} pattern - 'zero' | 'uniform_flux' | 'random_link' | 'pure_gauge'
 * @param {Object} options - { amplitude, fluxBias, graphSeed }
 * @param {number[]|null} targetLayers - Layer indices to apply; null => all
 * @param {Object|null} baseGauge - Optional base fields { ax, ay, graph }
 * @param {Object|null} rng - Deterministic RNG
 * @returns {{ax: Float32Array, ay: Float32Array, graph: Float32Array|null}}
 */
export function applyGaugePattern(sim, pattern, options = {}, targetLayers = null, baseGauge = null, rng = null) {
    const grid = sim.gridSize;
    const layers = sim.layers || 1;
    const layerSize = grid * grid;
    const N = sim.N;
    const amp = Number.isFinite(options.amplitude) ? options.amplitude : 0.5;
    const fluxBias = Number.isFinite(options.fluxBias) ? options.fluxBias : 0.0;
    const targets = Array.isArray(targetLayers) && targetLayers.length > 0
        ? targetLayers
        : Array.from({ length: layers }, (_, i) => i);
    const rand = rng ? rng.float : Math.random;
    const graphSeed = Number.isFinite(options.graphSeed) ? Math.floor(options.graphSeed) : null;
    const graphRng = graphSeed !== null ? makeRng(graphSeed, `gauge-graph:${pattern}`) : null;
    const graphRand = graphRng ? graphRng.float : rand;

    const ax = baseGauge?.ax && baseGauge.ax.length === N ? new Float32Array(baseGauge.ax) : new Float32Array(N);
    const ay = baseGauge?.ay && baseGauge.ay.length === N ? new Float32Array(baseGauge.ay) : new Float32Array(N);

    if (pattern === 'uniform_flux') {
        const B0 = wrapToPi(fluxBias);
        for (const layer of targets) {
            const layerOffset = layer * layerSize;
            for (let r = 0; r < grid; r++) {
                for (let c = 0; c < grid; c++) {
                    const idx = layerOffset + r * grid + c;
                    ax[idx] = 0.0;
                    ay[idx] = wrapToPi(B0 * ((c / Math.max(1, grid - 1)) - 0.5));
                }
            }
        }
    } else if (pattern === 'random_link') {
        for (const layer of targets) {
            const layerOffset = layer * layerSize;
            for (let i = 0; i < layerSize; i++) {
                const idx = layerOffset + i;
                ax[idx] = (rand() * 2 - 1) * amp;
                ay[idx] = (rand() * 2 - 1) * amp;
            }
        }
    } else if (pattern === 'pure_gauge') {
        const chi = new Float32Array(N);
        for (const layer of targets) {
            const layerOffset = layer * layerSize;
            for (let i = 0; i < layerSize; i++) {
                chi[layerOffset + i] = (rand() * 2 - 1) * amp;
            }
            for (let r = 0; r < grid; r++) {
                for (let c = 0; c < grid; c++) {
                    const idx = layerOffset + r * grid + c;
                    const right = layerOffset + r * grid + ((c + 1) % grid);
                    const up = layerOffset + ((r + 1) % grid) * grid + c;
                    ax[idx] = wrapToPi(chi[right] - chi[idx]);
                    ay[idx] = wrapToPi(chi[up] - chi[idx]);
                }
            }
        }
    } else {
        // zero
        for (const layer of targets) {
            const layerOffset = layer * layerSize;
            ax.fill(0, layerOffset, layerOffset + layerSize);
            ay.fill(0, layerOffset, layerOffset + layerSize);
        }
    }

    let graphGauge = null;
    const topo = sim.topologyInfo;
    const maxDegree = sim.maxGraphDegree || 16;
    if (topo?.neighbors && topo?.counts) {
        const expected = N * maxDegree;
        graphGauge = baseGauge?.graph && baseGauge.graph.length === expected
            ? new Float32Array(baseGauge.graph)
            : new Float32Array(expected);
        const edgePhase = new Map();
        const nodePhase = pattern === 'pure_gauge' ? new Float32Array(N) : null;
        if (nodePhase) {
            for (let i = 0; i < N; i++) nodePhase[i] = (graphRand() * 2 - 1) * amp;
        }
        for (let i = 0; i < N; i++) {
            const count = Math.min(topo.counts[i], maxDegree);
            const base = i * maxDegree;
            for (let k = 0; k < count; k++) {
                const j = topo.neighbors[base + k];
                const key = i < j ? `${i}:${j}` : `${j}:${i}`;
                let phi = edgePhase.get(key);
                if (phi === undefined) {
                    if (pattern === 'random_link') {
                        phi = (graphRand() * 2 - 1) * amp;
                    } else if (pattern === 'uniform_flux') {
                        phi = wrapToPi(fluxBias);
                    } else if (pattern === 'pure_gauge' && nodePhase) {
                        phi = wrapToPi(nodePhase[j] - nodePhase[i]);
                    } else {
                        phi = 0.0;
                    }
                    edgePhase.set(key, phi);
                }
                graphGauge[base + k] = i < j ? phi : -phi;
            }
            for (let k = count; k < maxDegree; k++) {
                graphGauge[base + k] = 0.0;
            }
        }
    }

    if (typeof sim.writeGaugeField === 'function') {
        sim.writeGaugeField(ax, ay);
    }
    if (graphGauge && typeof sim.writeGraphGauge === 'function') {
        sim.writeGraphGauge(graphGauge);
    }

    return { ax, ay, graph: graphGauge };
}

/**
 * Randomize theta values.
 * @param {Object} sim - Simulation instance
 * @param {number} seed - Random seed
 * @param {string} manifoldMode - Current manifold mode ('s1', 's2', or 's3')
 */
export function randomizeTheta(sim, seed, manifoldMode = 's1') {
    if (manifoldMode === 's3') {
        applyS3Pattern(sim, 'random', null, null, makeRng(seed, 's3:randomize'));
        return;
    }
    if (manifoldMode === 's2') {
        applyS2Pattern(sim, 'random', null, null, makeRng(seed, 's2:randomize'));
        return;
    }
    const rng = makeRng(seed, 'theta:randomize');
    const theta = new Float32Array(sim.N);
    for (let i = 0; i < sim.N; i++) theta[i] = rng.float() * TWO_PI;
    sim.writeTheta(theta);
}

/**
 * Apply S2 (sphere) manifold pattern.
 * @param {Object} sim - Simulation instance
 * @param {string} pattern - Pattern type ('synchronized', 'gradient', 'checkerboard', 'random')
 * @param {number[]|null} targetLayers - Array of layer indices to apply, or null for all
 * @param {Float32Array|null} vecBase - Base vector values to modify, or null for new array
 * @param {Object|null} rng - Random number generator
 */
export function applyS2Pattern(sim, pattern, targetLayers = null, vecBase = null, rng = null) {
    const N = sim.N;
    const GRID = sim.gridSize;
    const layers = sim.layers || 1;
    const layerSize = GRID * GRID;
    const data = vecBase ? new Float32Array(vecBase) : new Float32Array(N * 4);
    const targets = Array.isArray(targetLayers) && targetLayers.length > 0
        ? targetLayers
        : Array.from({ length: layers }, (_, i) => i);

    const rand = rng ? rng.float : Math.random;

    if (pattern === 'synchronized') {
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let i = 0; i < layerSize; i++) {
                const base = (offset + i) * 4;
                data[base] = 0;
                data[base + 1] = 0;
                data[base + 2] = 1;
                data[base + 3] = 1;
            }
        });
    } else if (pattern === 'gradient') {
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    const t = (c + r) / Math.max(1, (GRID - 1) * 2);
                    const az = t * Math.PI * 2;
                    const el = (r / Math.max(1, GRID - 1) - 0.5) * Math.PI;
                    const x = Math.cos(el) * Math.cos(az);
                    const y = Math.cos(el) * Math.sin(az);
                    const z = Math.sin(el);
                    const base = (offset + r * GRID + c) * 4;
                    data[base] = x;
                    data[base + 1] = y;
                    data[base + 2] = z;
                    data[base + 3] = 1;
                }
            }
        });
    } else if (pattern === 'checkerboard') {
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    const up = (r + c) % 2 === 0 ? 1 : -1;
                    const base = (offset + r * GRID + c) * 4;
                    data[base] = 0;
                    data[base + 1] = 0;
                    data[base + 2] = up;
                    data[base + 3] = 1;
                }
            }
        });
    } else if (pattern === 'spiral') {
        // Vectors rotate around Z-axis based on angle from center
        const cx = GRID / 2;
        const cy = GRID / 2;
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    const angle = Math.atan2(r - cy, c - cx);
                    // Vector lies in XY plane, rotated by angle
                    const x = Math.cos(angle);
                    const y = Math.sin(angle);
                    const z = 0;
                    const base = (offset + r * GRID + c) * 4;
                    data[base] = x;
                    data[base + 1] = y;
                    data[base + 2] = z;
                    data[base + 3] = 1;
                }
            }
        });
    } else if (pattern === 'target') {
        // Latitude bands: z varies with radial distance from center
        const cx = GRID / 2;
        const cy = GRID / 2;
        const maxDist = Math.sqrt(cx * cx + cy * cy);
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    const dx = c - cx;
                    const dy = r - cy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    // Map distance to elevation: center is north pole, edges are south
                    const el = (1 - dist / maxDist) * Math.PI - Math.PI / 2;
                    // Azimuth from position angle
                    const az = Math.atan2(dy, dx);
                    const cosEl = Math.cos(el);
                    const x = cosEl * Math.cos(az);
                    const y = cosEl * Math.sin(az);
                    const z = Math.sin(el);
                    const base = (offset + r * GRID + c) * 4;
                    data[base] = x;
                    data[base + 1] = y;
                    data[base + 2] = z;
                    data[base + 3] = 1;
                }
            }
        });
    } else {
        // random / image -> random on sphere
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let i = 0; i < layerSize; i++) {
                const u = rand() * 2 - 1;
                const phi = rand() * Math.PI * 2;
                const t = Math.sqrt(1 - u * u);
                const base = (offset + i) * 4;
                data[base] = t * Math.cos(phi);
                data[base + 1] = t * Math.sin(phi);
                data[base + 2] = u;
                data[base + 3] = 1;
            }
        });
    }

    sim.writeS2(data);
}

/**
 * Apply omega vector pattern for S2 manifold.
 * @param {Object} sim - Simulation instance
 * @param {string} pattern - Pattern type ('uniform', 'random')
 * @param {number} amp - Amplitude
 * @param {number[]|null} targetLayers - Array of layer indices to apply, or null for all
 * @param {Float32Array|null} omegaBase - Base omega values to modify, or null for new array
 * @param {Object|null} rng - Random number generator
 */
export function applyOmegaVecPattern(sim, pattern, amp, targetLayers = null, omegaBase = null, rng = null) {
    const N = sim.N;
    const GRID = sim.gridSize;
    const layers = sim.layers || 1;
    const layerSize = GRID * GRID;
    const omega = omegaBase ? new Float32Array(omegaBase) : new Float32Array(N * 4);
    const targets = Array.isArray(targetLayers) && targetLayers.length > 0
        ? targetLayers
        : Array.from({ length: layers }, (_, i) => i);
    const normal = rng ? rng.normal : null;
    const rand = rng ? rng.float : Math.random;

    if (pattern === 'uniform') {
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let i = 0; i < layerSize; i++) {
                const base = (offset + i) * 4;
                omega[base] = 0;
                omega[base + 1] = 0;
                omega[base + 2] = amp;
                omega[base + 3] = 0;
            }
        });
    } else if (pattern === 'gradient') {
        // Rotation magnitude varies by row
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    const t = r / Math.max(1, GRID - 1);
                    const magnitude = (t * 2 - 1) * amp;
                    const base = (offset + r * GRID + c) * 4;
                    omega[base] = 0;
                    omega[base + 1] = 0;
                    omega[base + 2] = magnitude;
                    omega[base + 3] = 0;
                }
            }
        });
    } else if (pattern === 'checkerboard') {
        // Alternating ±Z rotation axes
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    const sign = ((r + c) % 2 === 0) ? 1 : -1;
                    const base = (offset + r * GRID + c) * 4;
                    omega[base] = 0;
                    omega[base + 1] = 0;
                    omega[base + 2] = sign * amp;
                    omega[base + 3] = 0;
                }
            }
        });
    } else if (pattern === 'center_fast') {
        // Gaussian-weighted rotation magnitude from center
        const cx = GRID / 2;
        const cy = GRID / 2;
        const sigma = GRID / 4;
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    const d2 = (c - cx) ** 2 + (r - cy) ** 2;
                    const magnitude = amp * Math.exp(-d2 / (2 * sigma * sigma));
                    const base = (offset + r * GRID + c) * 4;
                    omega[base] = 0;
                    omega[base + 1] = 0;
                    omega[base + 2] = magnitude;
                    omega[base + 3] = 0;
                }
            }
        });
    } else {
        // random pattern
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let i = 0; i < layerSize; i++) {
                let x = 0, y = 0, z = 0;
                if (normal) {
                    x = normal(0, amp);
                    y = normal(0, amp);
                    z = normal(0, amp);
                } else {
                    x = (rand() * 2 - 1) * amp;
                    y = (rand() * 2 - 1) * amp;
                    z = (rand() * 2 - 1) * amp;
                }
                const base = (offset + i) * 4;
                omega[base] = x;
                omega[base + 1] = y;
                omega[base + 2] = z;
                omega[base + 3] = 0;
            }
        });
    }

    sim.writeOmegaVec(omega);
}

/**
 * Apply S3 (3-sphere/quaternion) manifold pattern.
 * @param {Object} sim - Simulation instance
 * @param {string} pattern - Pattern type ('synchronized', 'gradient', 'random')
 * @param {number[]|null} targetLayers - Array of layer indices to apply, or null for all
 * @param {Float32Array|null} quatBase - Base quaternion values to modify, or null for new array
 * @param {Object|null} rng - Random number generator
 */
export function applyS3Pattern(sim, pattern, targetLayers = null, quatBase = null, rng = null) {
    const N = sim.N;
    const GRID = sim.gridSize;
    const layers = sim.layers || 1;
    const layerSize = GRID * GRID;
    const data = quatBase ? new Float32Array(quatBase) : new Float32Array(N * 4);
    const targets = Array.isArray(targetLayers) && targetLayers.length > 0
        ? targetLayers
        : Array.from({ length: layers }, (_, i) => i);

    const rand = rng ? rng.float : Math.random;
    const normal = rng ? rng.normal : null;

    if (pattern === 'synchronized') {
        // All quaternions = (0, 0, 0, 1) - identity rotation
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let i = 0; i < layerSize; i++) {
                const base = (offset + i) * 4;
                data[base] = 0;      // x
                data[base + 1] = 0;  // y
                data[base + 2] = 0;  // z
                data[base + 3] = 1;  // w
            }
        });
    } else if (pattern === 'gradient') {
        // Interpolate quaternions across grid using rotation around Z-axis
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let r = 0; r < GRID; r++) {
                for (let c = 0; c < GRID; c++) {
                    // Angle varies across grid
                    const t = (c + r) / Math.max(1, (GRID - 1) * 2);
                    const angle = t * Math.PI * 2;
                    // Quaternion for rotation around Z-axis: (0, 0, sin(θ/2), cos(θ/2))
                    const halfAngle = angle / 2;
                    const base = (offset + r * GRID + c) * 4;
                    data[base] = 0;                     // x
                    data[base + 1] = 0;                 // y
                    data[base + 2] = Math.sin(halfAngle);  // z
                    data[base + 3] = Math.cos(halfAngle);  // w
                }
            }
        });
    } else {
        // random pattern: uniform random on S³ using normalized 4D Gaussian
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let i = 0; i < layerSize; i++) {
                let x, y, z, w;
                if (normal) {
                    x = normal(0, 1);
                    y = normal(0, 1);
                    z = normal(0, 1);
                    w = normal(0, 1);
                } else {
                    // Box-Muller for 4 Gaussian samples
                    const u1 = rand(), u2 = rand(), u3 = rand(), u4 = rand();
                    const r1 = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10)));
                    const r2 = Math.sqrt(-2 * Math.log(Math.max(u3, 1e-10)));
                    x = r1 * Math.cos(2 * Math.PI * u2);
                    y = r1 * Math.sin(2 * Math.PI * u2);
                    z = r2 * Math.cos(2 * Math.PI * u4);
                    w = r2 * Math.sin(2 * Math.PI * u4);
                }
                // Normalize to unit quaternion
                const len = Math.sqrt(x * x + y * y + z * z + w * w);
                const base = (offset + i) * 4;
                data[base] = x / len;
                data[base + 1] = y / len;
                data[base + 2] = z / len;
                data[base + 3] = w / len;
            }
        });
    }

    sim.writeS3(data);
}

/**
 * Apply omega pattern for S3 manifold.
 * Omega is a 3D angular velocity vector (rotation axis × speed).
 * @param {Object} sim - Simulation instance
 * @param {string} pattern - Pattern type ('uniform', 'random')
 * @param {number} amp - Amplitude
 * @param {number[]|null} targetLayers - Array of layer indices to apply, or null for all
 * @param {Float32Array|null} omegaBase - Base omega values to modify, or null for new array
 * @param {Object|null} rng - Random number generator
 */
export function applyOmega3Pattern(sim, pattern, amp, targetLayers = null, omegaBase = null, rng = null) {
    const N = sim.N;
    const GRID = sim.gridSize;
    const layers = sim.layers || 1;
    const layerSize = GRID * GRID;
    const omega = omegaBase ? new Float32Array(omegaBase) : new Float32Array(N * 4);
    const targets = Array.isArray(targetLayers) && targetLayers.length > 0
        ? targetLayers
        : Array.from({ length: layers }, (_, i) => i);
    const normal = rng ? rng.normal : null;
    const rand = rng ? rng.float : Math.random;

    if (pattern === 'uniform') {
        // All oscillators rotate around Z-axis with same speed
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let i = 0; i < layerSize; i++) {
                const base = (offset + i) * 4;
                omega[base] = 0;
                omega[base + 1] = 0;
                omega[base + 2] = amp;
                omega[base + 3] = 0;
            }
        });
    } else {
        // random pattern: 3D Gaussian-distributed rotation vectors
        targets.forEach(layer => {
            const offset = layer * layerSize;
            for (let i = 0; i < layerSize; i++) {
                let x, y, z;
                if (normal) {
                    x = normal(0, amp);
                    y = normal(0, amp);
                    z = normal(0, amp);
                } else {
                    // Box-Muller
                    const u1 = rand(), u2 = rand(), u3 = rand(), u4 = rand();
                    const r1 = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10)));
                    const r2 = Math.sqrt(-2 * Math.log(Math.max(u3, 1e-10)));
                    x = r1 * Math.cos(2 * Math.PI * u2) * amp;
                    y = r1 * Math.sin(2 * Math.PI * u2) * amp;
                    z = r2 * Math.cos(2 * Math.PI * u4) * amp;
                }
                const base = (offset + i) * 4;
                omega[base] = x;
                omega[base + 1] = y;
                omega[base + 2] = z;
                omega[base + 3] = 0;
            }
        });
    }

    sim.writeOmegaVec(omega);  // S³ uses same buffer as S²
}

/**
 * Apply external input from canvas to omega values.
 * @param {GPUDevice} device - WebGPU device
 * @param {Object} sim - Simulation instance
 * @param {HTMLCanvasElement} canvas - Input canvas
 * @param {number} amplitude - Amplitude scaling
 */
export function applyExternalInput(device, sim, canvas, amplitude) {
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

        // Map RGB to frequency: use brightness
        const brightness = (r + g + b) / 3;
        omega[i] = (brightness - 0.5) * amplitude * 2;
    }

    sim.writeOmega(omega);
    sim.storeOmega(omega);
}

/**
 * Convert RGB to hue value (0-360).
 * @param {number} r - Red (0-1)
 * @param {number} g - Green (0-1)
 * @param {number} b - Blue (0-1)
 * @returns {number} Hue in degrees (0-360)
 */
export function rgbToHue(r, g, b) {
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
