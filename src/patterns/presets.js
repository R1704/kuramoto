export const Presets = {
    sync: (state, sim) => {
        state.ruleMode = 0;
        state.K0 = 1.5;
        state.range = 2;
        state.globalCoupling = true;
        state.dt = 0.03;
        
        const theta = new Float32Array(sim.N).fill(0);
        const omega = new Float32Array(sim.N).fill(0.1);
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },
    
    grains: (state, sim, rng = null) => {
        state.ruleMode = 1; // Coherence-Gated
        state.K0 = 0.8;
        state.range = 2;
        state.globalCoupling = false;
        state.dt = 0.03;
        
        // Random theta (uniform)
        const theta = new Float32Array(sim.N);
        const rand = rng ? rng.float : Math.random;
        for(let i=0; i<sim.N; i++) {
            theta[i] = rand() * 2 * Math.PI;
        }
        
        // Random omega (Gaussian distribution, Box-Muller transform)
        const omega = new Float32Array(sim.N);
        const amplitude = 0.4;
        const normal = rng ? rng.normal : null;
        for(let i=0; i<sim.N; i++) {
            if (normal) {
                omega[i] = normal(0, amplitude);
            } else {
                const u1 = Math.random();
                const u2 = Math.random();
                const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                omega[i] = z * amplitude;
            }
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },
    
    clusters: (state, sim, rng = null) => {
        state.ruleMode = 3; // Harmonics
        state.K0 = 0.8;
        state.harmonicA = 0.5;
        state.range = 2;
        state.globalCoupling = false;
        state.dt = 0.03;
        
        // Random initialization
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const rand = rng ? rng.float : Math.random;
        for(let i=0; i<sim.N; i++) {
            theta[i] = rand() * 2 * Math.PI;
            omega[i] = (rand() - 0.5) * 0.3;
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },

    flux_lattice: (state, sim, rng = null) => {
        state.manifoldMode = 's1';
        state.topologyMode = 'grid';
        state.ruleMode = 0;
        state.K0 = 1.1;
        state.range = 2;
        state.globalCoupling = false;
        state.dt = 0.03;
        state.gaugeEnabled = true;
        state.gaugeMode = 'static';
        state.gaugeCharge = 1.0;
        state.gaugeMatterCoupling = 1.0;
        state.gaugeStiffness = 0.2;
        state.gaugeDamping = 0.05;
        state.gaugeNoise = 0.0;
        state.gaugeDtScale = 1.0;
        state.gaugeInitPattern = 'uniform_flux';
        state.gaugeFluxBias = 0.8;

        const rand = rng ? rng.float : Math.random;
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        for (let i = 0; i < sim.N; i++) {
            theta[i] = rand() * 2 * Math.PI;
            omega[i] = 0.1 * (rand() - 0.5);
        }
        sim.writeTheta(theta);
        sim.writeOmega(omega);

        const grid = sim.gridSize;
        const layers = sim.layers || 1;
        const layerSize = grid * grid;
        const ax = new Float32Array(sim.N);
        const ay = new Float32Array(sim.N);
        const wrapPi = (value) => {
            let v = value;
            while (v <= -Math.PI) v += 2 * Math.PI;
            while (v > Math.PI) v -= 2 * Math.PI;
            return v;
        };
        for (let layer = 0; layer < layers; layer++) {
            const offset = layer * layerSize;
            for (let r = 0; r < grid; r++) {
                for (let c = 0; c < grid; c++) {
                    const idx = offset + r * grid + c;
                    ax[idx] = 0.0;
                    ay[idx] = wrapPi(state.gaugeFluxBias * c);
                }
            }
        }
        if (typeof sim.writeGaugeField === 'function') {
            sim.writeGaugeField(ax, ay);
        }
        if (typeof sim.writeGraphGauge === 'function') {
            sim.writeGraphGauge(new Float32Array(sim.N * (sim.maxGraphDegree || 16)));
        }
    },

    discovery_flux_low: (state, sim, rng = null) => {
        Presets.flux_lattice(state, sim, rng);
        state.gaugeFluxBias = 0.35;
        state.gaugeCharge = 0.8;
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const rand = rng ? rng.float : Math.random;
        for (let i = 0; i < sim.N; i++) {
            theta[i] = rand() * 2 * Math.PI;
            omega[i] = 0.05 * (rand() - 0.5);
        }
        sim.writeTheta(theta);
        sim.writeOmega(omega);
        const ax = new Float32Array(sim.N);
        const ay = new Float32Array(sim.N);
        const grid = sim.gridSize;
        const layerSize = grid * grid;
        const wrapPi = (value) => {
            let v = value;
            while (v <= -Math.PI) v += 2 * Math.PI;
            while (v > Math.PI) v -= 2 * Math.PI;
            return v;
        };
        for (let layer = 0; layer < (sim.layers || 1); layer++) {
            const offset = layer * layerSize;
            for (let r = 0; r < grid; r++) {
                for (let c = 0; c < grid; c++) {
                    const idx = offset + r * grid + c;
                    ay[idx] = wrapPi(state.gaugeFluxBias * c);
                }
            }
        }
        sim.writeGaugeField(ax, ay);
    },

    discovery_flux_mid: (state, sim, rng = null) => {
        Presets.discovery_flux_low(state, sim, rng);
        state.gaugeFluxBias = 0.85;
        state.gaugeCharge = 1.0;
        const grid = sim.gridSize;
        const layerSize = grid * grid;
        const ax = new Float32Array(sim.N);
        const ay = new Float32Array(sim.N);
        const wrapPi = (value) => {
            let v = value;
            while (v <= -Math.PI) v += 2 * Math.PI;
            while (v > Math.PI) v -= 2 * Math.PI;
            return v;
        };
        for (let layer = 0; layer < (sim.layers || 1); layer++) {
            const offset = layer * layerSize;
            for (let r = 0; r < grid; r++) {
                for (let c = 0; c < grid; c++) {
                    const idx = offset + r * grid + c;
                    ay[idx] = wrapPi(state.gaugeFluxBias * c);
                }
            }
        }
        sim.writeGaugeField(ax, ay);
    },

    discovery_flux_high: (state, sim, rng = null) => {
        Presets.discovery_flux_mid(state, sim, rng);
        state.gaugeFluxBias = 1.35;
        state.gaugeCharge = 1.4;
        const grid = sim.gridSize;
        const layerSize = grid * grid;
        const ax = new Float32Array(sim.N);
        const ay = new Float32Array(sim.N);
        const wrapPi = (value) => {
            let v = value;
            while (v <= -Math.PI) v += 2 * Math.PI;
            while (v > Math.PI) v -= 2 * Math.PI;
            return v;
        };
        for (let layer = 0; layer < (sim.layers || 1); layer++) {
            const offset = layer * layerSize;
            for (let r = 0; r < grid; r++) {
                for (let c = 0; c < grid; c++) {
                    const idx = offset + r * grid + c;
                    ay[idx] = wrapPi(state.gaugeFluxBias * c);
                }
            }
        }
        sim.writeGaugeField(ax, ay);
    },

    discovery_dynamic_soft: (state, sim, rng = null) => {
        state.manifoldMode = 's1';
        state.topologyMode = 'grid';
        state.ruleMode = 0;
        state.K0 = 1.4;
        state.range = 3;
        state.globalCoupling = false;
        state.dt = 0.04;
        state.gaugeEnabled = true;
        state.gaugeMode = 'dynamic';
        state.gaugeCharge = 0.8;
        state.gaugeMatterCoupling = 0.9;
        state.gaugeStiffness = 0.18;
        state.gaugeDamping = 0.10;
        state.gaugeNoise = 0.0;
        state.gaugeDtScale = 1.0;
        state.gaugeInitPattern = 'pure_gauge';
        state.gaugeInitAmplitude = 1.0;
        const rand = rng ? rng.float : Math.random;
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        for (let i = 0; i < sim.N; i++) {
            theta[i] = rand() * 2 * Math.PI;
            omega[i] = 0.06 * (rand() - 0.5);
        }
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },

    discovery_dynamic_strong: (state, sim, rng = null) => {
        Presets.discovery_dynamic_soft(state, sim, rng);
        state.gaugeCharge = 2.0;
        state.gaugeMatterCoupling = 2.2;
        state.gaugeStiffness = 0.35;
        state.gaugeDamping = 0.04;
        state.gaugeDtScale = 1.8;
        state.gaugeInitAmplitude = 1.5;
    },

    discovery_stiffness_low: (state, sim, rng = null) => {
        Presets.discovery_dynamic_soft(state, sim, rng);
        state.gaugeMatterCoupling = 1.2;
        state.gaugeStiffness = 0.06;
        state.gaugeDamping = 0.06;
    },

    discovery_stiffness_high: (state, sim, rng = null) => {
        Presets.discovery_dynamic_soft(state, sim, rng);
        state.gaugeMatterCoupling = 1.2;
        state.gaugeStiffness = 0.65;
        state.gaugeDamping = 0.14;
    },

    discovery_graph_static: (state, sim, rng = null) => {
        state.manifoldMode = 's1';
        state.ruleMode = 0;
        state.K0 = 1.0;
        state.range = 2;
        state.globalCoupling = false;
        state.dt = 0.03;
        state.gaugeEnabled = true;
        state.gaugeMode = 'static';
        state.gaugeCharge = 1.2;
        state.gaugeMatterCoupling = 1.0;
        state.gaugeStiffness = 0.2;
        state.gaugeDamping = 0.05;
        state.gaugeNoise = 0.0;
        state.gaugeDtScale = 1.0;
        state.gaugeInitPattern = 'random_link';
        state.gaugeInitAmplitude = 0.9;
        const rand = rng ? rng.float : Math.random;
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        for (let i = 0; i < sim.N; i++) {
            theta[i] = rand() * 2 * Math.PI;
            omega[i] = 0.12 * (rand() - 0.5);
        }
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },

    plane_wave: (state, sim) => {
        state.ruleMode = 0;
        state.K0 = 1.0;
        state.range = 2;
        state.globalCoupling = false;
        state.dt = 0.03;
        
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const GRID = sim.gridSize;
        
        const waveDirection = Math.PI / 4;
        const wavelength = 15;
        const k = 2 * Math.PI / wavelength;
        
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const i = r * GRID + c;
                const x = c * Math.cos(waveDirection) + r * Math.sin(waveDirection);
                theta[i] = k * x;
                omega[i] = 0.2;
            }
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },
    
    chimera: (state, sim, rng = null) => {
        state.ruleMode = 4;
        state.K0 = 1.2;
        state.sigma = 1.5;
        state.sigma2 = 3.0;
        state.beta = 0.5;
        state.range = 5;
        state.globalCoupling = false;
        
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const GRID = sim.gridSize;
        
        const rand = rng ? rng.float : Math.random;
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const i = r * GRID + c;
                if (c < GRID / 2) {
                    theta[i] = 0;
                    omega[i] = 0.1;
                } else {
                    theta[i] = rand() * 2 * Math.PI;
                    omega[i] = (rand() - 0.5) * 0.4;
                }
            }
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },
    
    checkerboard: (state, sim) => {
        state.ruleMode = 0;
        state.K0 = 1.0;
        state.range = 2;
        state.globalCoupling = false;
        
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const GRID = sim.gridSize;
        
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const i = r * GRID + c;
                const check = ((Math.floor(r/16) + Math.floor(c/16)) % 2 === 0);
                theta[i] = check ? 0 : Math.PI;
                omega[i] = 0.2;
            }
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },

    target_waves: (state, sim) => {
        state.ruleMode = 0;
        state.K0 = 1.1;
        state.range = 2;
        state.globalCoupling = false;
        
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const GRID = sim.gridSize;
        const cx = GRID / 2;
        const cy = GRID / 2;
        const wavelength = 12;
        const k = 2 * Math.PI / wavelength;
        
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const i = r * GRID + c;
                const dx = c - cx;
                const dy = r - cy;
                const dist = Math.sqrt(dx*dx + dy*dy);
                theta[i] = k * dist;
                
                if (dist < 5) {
                    omega[i] = 0.3; // Fast at center
                } else {
                    omega[i] = 0.05; // Slower outside
                }
            }
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },

    target_waves_inward: (state, sim) => {
        state.ruleMode = 0;
        state.K0 = 1.1;
        state.range = 2;
        state.globalCoupling = false;
        
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const GRID = sim.gridSize;
        const cx = GRID / 2;
        const cy = GRID / 2;
        const wavelength = 12;
        const k = 2 * Math.PI / wavelength;
        
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const i = r * GRID + c;
                const dx = c - cx;
                const dy = r - cy;
                const dist = Math.sqrt(dx*dx + dy*dy);
                theta[i] = -k * dist;
                omega[i] = (dist < 5) ? 0.8 : 0.2;
            }
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },

    single_spiral: (state, sim) => {
        state.ruleMode = 0;
        state.K0 = 1.2;
        state.range = 3;
        state.globalCoupling = false;
        
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const GRID = sim.gridSize;
        const cx = GRID / 2;
        const cy = GRID / 2;
        
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const i = r * GRID + c;
                const dx = c - cx;
                const dy = r - cy;
                const angle = Math.atan2(dy, dx);
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // Archimedean spiral
                theta[i] = angle + dist * 0.1;
                omega[i] = 0.15 * (1 - dist / (GRID * 0.7));
            }
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },

    spiral_simple: (state, sim) => {
        state.ruleMode = 0;
        state.K0 = 1.2;
        state.range = 3;
        state.globalCoupling = false;
        
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const GRID = sim.gridSize;
        const cx = GRID / 2;
        const cy = GRID / 2;
        
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const i = r * GRID + c;
                theta[i] = Math.atan2(r - cy, c - cx);
                omega[i] = 0.2;
            }
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },

    spiral_pair: (state, sim) => {
        state.ruleMode = 0;
        state.K0 = 1.2;
        state.range = 3;
        state.globalCoupling = false;
        
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const GRID = sim.gridSize;
        
        const c1x = GRID * 0.35, c1y = GRID * 0.35;
        const c2x = GRID * 0.65, c2y = GRID * 0.65;
        
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const i = r * GRID + c;
                
                const dx1 = c - c1x;
                const dy1 = r - c1y;
                const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
                const angle1 = Math.atan2(dy1, dx1);
                
                const dx2 = c - c2x;
                const dy2 = r - c2y;
                const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                const angle2 = Math.atan2(dy2, dx2);
                
                const w1 = 1 / (dist1 + 1);
                const w2 = 1 / (dist2 + 1);
                const totalW = w1 + w2;
                
                const phase1 = angle1 + dist1 * 0.1;
                const phase2 = -angle2 + dist2 * 0.1;
                
                theta[i] = (phase1 * w1 + phase2 * w2) / totalW;
                omega[i] = 0.1;
            }
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },

    spiral_pair_interference: (state, sim) => {
        state.ruleMode = 0;
        state.K0 = 1.2;
        state.range = 3;
        state.globalCoupling = false;
        
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const GRID = sim.gridSize;
        
        const c1x = GRID * 0.35, c1y = GRID * 0.35;
        const c2x = GRID * 0.65, c2y = GRID * 0.65;
        
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const i = r * GRID + c;
                const a1 = Math.atan2(r - c1y, c - c1x);
                const a2 = Math.atan2(r - c2y, c - c2x);
                theta[i] = a1 - a2;
                omega[i] = 0.2;
            }
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },

    turbulence: (state, sim, rng = null) => {
        state.ruleMode = 2; // Curvature
        state.K0 = 0.6;
        state.range = 2;
        state.globalCoupling = false;
        state.noiseStrength = 0.15;
        
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const GRID = sim.gridSize;
        
        // Random phases with spatial correlation
        const rand = rng ? rng.float : Math.random;
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const i = r * GRID + c;
                theta[i] = rand() * 2 * Math.PI;
                omega[i] = (rand() - 0.5) * 0.8;
            }
        }
        
        // Apply smoothing (periodic boundaries)
        const smoothedTheta = new Float32Array(sim.N);
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const i = r * GRID + c;
                let sum = 0;
                let count = 0;
                
                for (let dr = -2; dr <= 2; dr++) {
                    for (let dc = -2; dc <= 2; dc++) {
                        let rr = (r + dr + GRID) % GRID;
                        let cc = (c + dc + GRID) % GRID;
                        const j = rr * GRID + cc;
                        sum += Math.sin(theta[j]);
                        count++;
                    }
                }
                smoothedTheta[i] = Math.atan2(sum / count, Math.cos(theta[i]));
            }
        }
        
        sim.writeTheta(smoothedTheta);
        sim.writeOmega(omega);
    },

    turbulence_simple: (state, sim, rng = null) => {
        state.ruleMode = 2; // Curvature
        state.K0 = 0.6;
        state.range = 2;
        state.globalCoupling = false;
        state.noiseStrength = 0.15;
        
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const GRID = sim.gridSize;
        
        // Random phases with spatial correlation (simple smoothing)
        const raw = new Float32Array(sim.N);
        const rand = rng ? rng.float : Math.random;
        for(let i=0; i<sim.N; i++) raw[i] = rand() * 2 * Math.PI;
        
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const i = r * GRID + c;
                let sum = 0, count = 0;
                for(let dy=-2; dy<=2; dy++) {
                    for(let dx=-2; dx<=2; dx++) {
                        const rr = r+dy, cc = c+dx;
                        if(rr>=0 && rr<GRID && cc>=0 && cc<GRID) {
                            sum += raw[rr*GRID+cc];
                            count++;
                        }
                    }
                }
                theta[i] = sum / count;
                omega[i] = 0.2;
            }
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },

    breathing: (state, sim) => {
        state.ruleMode = 4; // Mexican Hat
        state.K0 = 1.0;
        state.sigma = 1.2;
        state.sigma2 = 2.5;
        state.beta = 0.6;
        state.range = 4;
        state.globalCoupling = false;
        
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const GRID = sim.gridSize;
        const cx = GRID / 2;
        const cy = GRID / 2;
        
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const i = r * GRID + c;
                const dist = Math.sqrt((c-cx)**2 + (r-cy)**2);
                theta[i] = (dist < GRID/4) ? 0 : Math.PI;
                omega[i] = 0.1;
            }
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },

    delay_spirals: (state, sim, rng = null) => {
        state.ruleMode = 5; // Delay
        state.K0 = 1.0;
        state.range = 2;
        state.delaySteps = 15;
        state.globalCoupling = false;
        
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        
        const rand = rng ? rng.float : Math.random;
        for(let i=0; i<sim.N; i++) {
            theta[i] = rand() * 0.1; // Small perturbation
            omega[i] = 0.2;
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
    },
    
    // Reservoir Computing optimized preset
    // Creates traveling waves that carry information from left to right
    reservoir: (state, sim, rng = null) => {
        state.ruleMode = 0; // Classic Kuramoto
        state.K0 = 0.8;     // Below full sync - sensitive to perturbations
        state.range = 4;     // Local coupling for wave propagation
        state.globalCoupling = false;
        state.noiseStrength = 0.02; // Small noise prevents locking
        state.dt = 0.1;
        
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const GRID = sim.gridSize;
        
        // Initialize with a gradient from left to right
        // This creates natural wave propagation direction
        const rand = rng ? rng.float : Math.random;
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const i = r * GRID + c;
                // Phase gradient: waves travel left to right
                theta[i] = (c / GRID) * Math.PI * 2;
                // Slight frequency variation for richer dynamics
                omega[i] = 0.1 + (rand() - 0.5) * 0.05;
            }
        }
        
        sim.writeTheta(theta);
        sim.writeOmega(omega);
        sim.storeOmega(omega);
    },

    overlay_alignment_debug: (state, sim) => {
        state.manifoldMode = 's1';
        state.topologyMode = 'grid';
        state.viewMode = 1;
        state.zoom = 2.2;
        state.panX = 0.12;
        state.panY = -0.08;
        state.colormap = 7;
        state.gaugeEnabled = true;
        state.gaugeMode = 'static';
        state.gaugeCharge = 1.0;
        state.overlayGaugeLinks = true;
        state.overlayPlaquetteSign = true;
        state.overlayProbeEnabled = true;
        state.ruleMode = 0;
        state.K0 = 1.1;
        state.range = 2;
        state.globalCoupling = false;

        const grid = sim.gridSize;
        const theta = new Float32Array(sim.N);
        const omega = new Float32Array(sim.N);
        const ax = new Float32Array(sim.N);
        const ay = new Float32Array(sim.N);
        const wrapPi = (value) => {
            let v = value;
            while (v <= -Math.PI) v += 2 * Math.PI;
            while (v > Math.PI) v -= 2 * Math.PI;
            return v;
        };

        for (let r = 0; r < grid; r++) {
            for (let c = 0; c < grid; c++) {
                const idx = r * grid + c;
                const checker = ((r + c) % 2 === 0) ? 0 : Math.PI;
                theta[idx] = checker;
                omega[idx] = 0.0;
                ax[idx] = 0.0;
                ay[idx] = wrapPi(0.8 * c);
            }
        }

        sim.writeTheta(theta);
        sim.writeOmega(omega);
        sim.storeOmega(omega);
        if (typeof sim.writeGaugeField === 'function') {
            sim.writeGaugeField(ax, ay);
        }
    },
};
