/**
 * Statistics Module for Kuramoto Simulation
 * 
 * Provides real-time tracking of:
 * - Global order parameter R (coherent phase alignment)
 * - Mean LOCAL order R̄_local (spatial organization - waves/spirals/clusters)
 * - Phase gradient magnitude (detects traveling waves/spirals)
 * - Susceptibility χ = N × Var(local mean R) (peaks at criticality)
 * - Sync fraction (fraction with local R > threshold)
 * - Time series history for plotting
 * - Phase diagram builder (local mean R vs K scan)
 * - Criticality estimation (K_c from χ peak)
 * - Local order histogram (multimodality/chimera detection)
 * 
 * KEY INSIGHT: Global R averages phases globally, so traveling waves/spirals
 * show R≈0 even though highly organized. Mean LOCAL R captures this organization.
 */

export class StatisticsTracker {
    constructor(N, historySize = 500) {
        this.N = N;
        this.historySize = historySize;
        
        // Rolling history buffers
        this.R_history = new Float32Array(historySize);        // Global R
        this.localR_history = new Float32Array(historySize);   // Mean local R
        this.chi_history = new Float32Array(historySize);
        this.gradient_history = new Float32Array(historySize); // Phase gradient
        this.Psi_history = new Float32Array(historySize);
        this.historyIndex = 0;
        this.historyCount = 0;
        
        // Current values
        this.R = 0;            // Global order parameter magnitude
        this.localR = 0;       // Mean LOCAL order parameter (better for spatial patterns)
        this.Psi = 0;          // Global mean phase
        this.chi = 0;          // Susceptibility
        this.syncFraction = 0; // Fraction of oscillators with high local R
        this.gradient = 0;     // Mean phase gradient (high = waves/spirals)
        this.localVariance = 0; // Variance of local R values
        this.localHist = new Float32Array(16); // Histogram of local R
        
        // For variance computation (Welford's algorithm)
        this.R_mean = 0;
        this.R_M2 = 0;
        this.varianceCount = 0;
        this.varianceWindowSize = 100; // Compute variance over last N samples
        this.R_window = new Float32Array(this.varianceWindowSize);
        this.windowIndex = 0;
        this.windowFilled = false;
        
        // Phase diagram data (K vs R scan results)
        this.phaseDiagramData = [];
        this.estimatedKc = null;
        this.isScanning = false;
        this.scanProgress = 0;
        
        // Callbacks
        this.onUpdate = null;
        this.onScanProgress = null;
        this.onScanComplete = null;
    }
    
    /**
     * Update with new order parameter values from GPU
     * @param {number} cosSum - Sum of cos(θ) / N (global)
     * @param {number} sinSum - Sum of sin(θ) / N (global)
     * @param {Object} localStats - Local order statistics from GPU
     */
    update(cosSum, sinSum, localStats = null) {
        // Compute global R and Ψ from complex order parameter Z = (cosSum, sinSum)
        this.R = Math.sqrt(cosSum * cosSum + sinSum * sinSum);
        this.Psi = Math.atan2(sinSum, cosSum);
        
        // Update local stats if provided
        if (localStats) {
            this.localR = localStats.meanR;
            this.syncFraction = localStats.syncFraction;
            this.gradient = localStats.gradient;
            this.localVariance = localStats.variance;
            if (localStats.histogram && localStats.histogram.length === this.localHist.length) {
                this.localHist.set(localStats.histogram);
            }
        }
        
        // Add to history - use LOCAL R for plotting since it better represents organization
        this.R_history[this.historyIndex] = this.R;
        this.localR_history[this.historyIndex] = this.localR;
        this.gradient_history[this.historyIndex] = this.gradient;
        this.Psi_history[this.historyIndex] = this.Psi;
        
        // Update variance window (use local R for susceptibility - better metric)
        this.R_window[this.windowIndex] = this.localR;
        this.windowIndex = (this.windowIndex + 1) % this.varianceWindowSize;
        if (!this.windowFilled && this.windowIndex === 0) {
            this.windowFilled = true;
        }
        
        // Compute variance and susceptibility
        this.computeSusceptibility();
        this.chi_history[this.historyIndex] = this.chi;
        
        // Advance history index
        this.historyIndex = (this.historyIndex + 1) % this.historySize;
        this.historyCount = Math.min(this.historyCount + 1, this.historySize);
        
        // Fire callback
        if (this.onUpdate) {
            this.onUpdate(this);
        }
    }
    
    /**
     * Compute susceptibility χ = N × Var(local mean R)
     * Uses variance of local mean R over a recent window.
     */
    computeSusceptibility() {
        const count = this.windowFilled ? this.varianceWindowSize : this.windowIndex;
        if (count < 2) {
            this.chi = 0;
            return;
        }
        
        // Compute mean
        let sum = 0;
        for (let i = 0; i < count; i++) {
            sum += this.R_window[i];
        }
        const mean = sum / count;
        this.R_mean = mean;
        
        // Compute variance
        let sumSq = 0;
        for (let i = 0; i < count; i++) {
            const diff = this.R_window[i] - mean;
            sumSq += diff * diff;
        }
        const variance = sumSq / (count - 1);
        
        // Susceptibility χ = N × Var(local mean R)
        this.chi = this.N * variance;
    }
    
    /**
     * Get recent R history for plotting
     * @param {number} count - Number of samples to return
     * @param {boolean} useLocal - If true, return mean local R (better for patterns)
     * @returns {Float32Array} R values in chronological order
     */
    getRecentR(count = 300, useLocal = true) {
        const result = new Float32Array(count);
        const available = Math.min(count, this.historyCount);
        const history = useLocal ? this.localR_history : this.R_history;
        
        for (let i = 0; i < available; i++) {
            const idx = (this.historyIndex - available + i + this.historySize) % this.historySize;
            result[count - available + i] = history[idx];
        }
        
        return result;
    }
    
    /**
     * Get recent global R history (for comparison with local R)
     */
    getRecentGlobalR(count = 300) {
        return this.getRecentR(count, false);
    }
    
    /**
     * Get recent gradient history for plotting
     * High gradient indicates traveling waves or spirals
     */
    getRecentGradient(count = 300) {
        const result = new Float32Array(count);
        const available = Math.min(count, this.historyCount);
        
        for (let i = 0; i < available; i++) {
            const idx = (this.historyIndex - available + i + this.historySize) % this.historySize;
            result[count - available + i] = this.gradient_history[idx];
        }
        
        return result;
    }
    
    /**
     * Get recent χ history for plotting
     * @returns {Float32Array} χ values in chronological order
     */
    getRecentChi(count = 300) {
        const result = new Float32Array(count);
        const available = Math.min(count, this.historyCount);
        
        for (let i = 0; i < available; i++) {
            const idx = (this.historyIndex - available + i + this.historySize) % this.historySize;
            result[count - available + i] = this.chi_history[idx];
        }
        
        return result;
    }

    fillRecentR(out, useLocal = true) {
        const count = out.length;
        const available = Math.min(count, this.historyCount);
        const history = useLocal ? this.localR_history : this.R_history;
        out.fill(0);
        for (let i = 0; i < available; i++) {
            const idx = (this.historyIndex - available + i + this.historySize) % this.historySize;
            out[count - available + i] = history[idx];
        }
        return out;
    }

    fillRecentChi(out) {
        const count = out.length;
        const available = Math.min(count, this.historyCount);
        out.fill(0);
        for (let i = 0; i < available; i++) {
            const idx = (this.historyIndex - available + i + this.historySize) % this.historySize;
            out[count - available + i] = this.chi_history[idx];
        }
        return out;
    }
    
    /**
     * Check if system is near criticality
     * Heuristic: R ≈ 0.5 AND high variance
     * Uses local R since it better captures organization
     */
    isNearCritical(tolerance = 0.15, minChi = 0.1) {
        return Math.abs(this.localR - 0.5) < tolerance && this.chi > minChi;
    }
    
    /**
     * Get operating regime description
     * Uses local R which better captures spatial organization
     */
    getRegime() {
        const r = this.localR;
        const g = this.gradient;
        
        // Check for wave patterns (high local R + high gradient)
        if (r > 0.5 && g > 0.3) {
            if (r > 0.7) return 'traveling waves';
            return 'wave formation';
        }
        
        // Standard phase classifications
        if (r < 0.2) return 'desynchronized';
        if (r < 0.4) return 'weakly coupled';
        if (r < 0.6) return 'near critical';
        if (r < 0.8) return 'partially synchronized';
        return 'synchronized';
    }
    
    /**
     * Get detailed pattern classification
     */
    getPatternType() {
        const r = this.localR;
        const g = this.gradient;
        const gR = this.R; // Global R
        
        // High local R but low global R suggests traveling patterns
        if (r > 0.6 && gR < 0.3 && g > 0.2) return 'spiral/vortex';
        if (r > 0.5 && gR < 0.4 && g > 0.3) return 'plane wave';
        if (r > 0.6 && Math.abs(r - gR) < 0.2) return 'synchronized cluster';
        if (r > 0.5 && g < 0.1) return 'static pattern';
        if (r < 0.3) return 'incoherent';
        return 'mixed';
    }
    
    /**
     * Start a K-scan to build phase diagram
     * @param {Object} simulation - Simulation instance
     * @param {Object} state - STATE object with K0
     * @param {Object} options - Scan options
     */
    async startKScan(simulation, state, options = {}) {
        const {
            K_min = 0.1,
            K_max = 2.5,
            K_steps = 25,
            warmupSteps = 300,
            measureSteps = 200,
            onProgress = null,
            onComplete = null
        } = options;
        
        if (this.isScanning) {
            console.warn('K-scan already in progress');
            return;
        }
        
        this.isScanning = true;
        this.scanProgress = 0;
        this.phaseDiagramData = [];
        
        const originalK = state.K0;
        const originalPaused = state.paused;
        
        // Temporarily unpause for scanning
        state.paused = false;
        
        for (let i = 0; i <= K_steps; i++) {
            const K = K_min + (K_max - K_min) * i / K_steps;
            state.K0 = K;
            simulation.updateFullParams(state);
            
            // Reset variance window for fresh measurement
            this.windowIndex = 0;
            this.windowFilled = false;
            
            // Warmup phase - let system equilibrate
            for (let t = 0; t < warmupSteps; t++) {
                // Need to step simulation - this will be done in integration
                await this.waitFrame();
            }
            
            // Measurement phase
            const R_samples = [];
            for (let t = 0; t < measureSteps; t++) {
                await this.waitFrame();
                // Use local mean R as the primary organization metric
                R_samples.push(this.localR);
            }
            
            // Compute statistics for this K value
            const R_mean = R_samples.reduce((a, b) => a + b, 0) / R_samples.length;
            const R_var = R_samples.reduce((a, b) => a + (b - R_mean) ** 2, 0) / (R_samples.length - 1);
            const chi = this.N * R_var;
            
            this.phaseDiagramData.push({
                K,
                R_mean,
                R_std: Math.sqrt(R_var),
                chi
            });
            
            this.scanProgress = (i + 1) / (K_steps + 1);
            
            if (onProgress) {
                onProgress(this.scanProgress, K, R_mean, chi);
            }
        }
        
        // Estimate K_c from χ peak
        this.estimateKc();
        
        // Restore original state
        state.K0 = originalK;
        state.paused = originalPaused;
        simulation.updateFullParams(state);
        
        this.isScanning = false;
        
        if (onComplete) {
            onComplete(this.phaseDiagramData, this.estimatedKc);
        }
        
        return {
            data: this.phaseDiagramData,
            Kc: this.estimatedKc
        };
    }
    
    /**
     * Quick K-scan using current simulation state (non-blocking)
     * This version integrates with the main render loop
     */
    createKScanner(simulation, state, options = {}) {
        const {
            K_min = 0.1,
            K_max = 2.5,
            K_steps = 25,
            warmupSteps = 200,
            measureSteps = 150
        } = options;
        
        return {
            currentStep: 0,
            totalSteps: K_steps + 1,
            phase: 'idle', // 'idle' | 'warmup' | 'measure' | 'done'
            warmupCounter: 0,
            measureCounter: 0,
            R_samples: [],
            originalK: state.K0,
            
            start: () => {
                this.phaseDiagramData = [];
                this.isScanning = true;
                return {
                    currentStep: 0,
                    phase: 'warmup',
                    warmupCounter: 0,
                    measureCounter: 0,
                    R_samples: [],
                    originalK: state.K0
                };
            },
            
            step: (scanner) => {
                if (scanner.phase === 'idle' || scanner.phase === 'done') {
                    return scanner;
                }
                
                const K = K_min + (K_max - K_min) * scanner.currentStep / K_steps;
                state.K0 = K;
                simulation.updateFullParams(state);
                
                if (scanner.phase === 'warmup') {
                    scanner.warmupCounter++;
                    if (scanner.warmupCounter >= warmupSteps) {
                        scanner.phase = 'measure';
                        scanner.measureCounter = 0;
                        scanner.R_samples = [];
                        // Reset variance window
                        this.windowIndex = 0;
                        this.windowFilled = false;
                    }
                } else if (scanner.phase === 'measure') {
                    // Use local R for better pattern measurement
                    scanner.R_samples.push(this.localR);
                    scanner.measureCounter++;
                    
                    if (scanner.measureCounter >= measureSteps) {
                        // Compute statistics
                        const R_mean = scanner.R_samples.reduce((a, b) => a + b, 0) / scanner.R_samples.length;
                        const R_var = scanner.R_samples.reduce((a, b) => a + (b - R_mean) ** 2, 0) / (scanner.R_samples.length - 1);
                        
                        this.phaseDiagramData.push({
                            K,
                            R_mean,
                            R_std: Math.sqrt(R_var),
                            chi: this.N * R_var
                        });
                        
                        scanner.currentStep++;
                        this.scanProgress = scanner.currentStep / (K_steps + 1);
                        
                        if (scanner.currentStep > K_steps) {
                            // Done
                            scanner.phase = 'done';
                            this.estimateKc();
                            this.isScanning = false;
                            state.K0 = scanner.originalK;
                            simulation.updateFullParams(state);
                        } else {
                            // Next K value
                            scanner.phase = 'warmup';
                            scanner.warmupCounter = 0;
                        }
                    }
                }
                
                return scanner;
            }
        };
    }
    
    /**
     * Estimate critical coupling K_c from susceptibility peak
     */
    estimateKc() {
        if (this.phaseDiagramData.length < 3) {
            this.estimatedKc = null;
            return null;
        }
        
        let maxChi = 0;
        let K_c = null;
        
        for (const point of this.phaseDiagramData) {
            if (point.chi > maxChi) {
                maxChi = point.chi;
                K_c = point.K;
            }
        }
        
        this.estimatedKc = K_c;
        return K_c;
    }
    
    /**
     * Get theoretical K_c estimate (mean-field approximation)
     * For Gaussian frequency distribution: K_c ≈ 2σ_ω/√π
     */
    theoreticalKc(omegaStd) {
        return 2 * omegaStd / Math.sqrt(Math.PI);
    }
    
    /**
     * Wait for next animation frame (for async scanning)
     */
    waitFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    }
    
    /**
     * Resize the tracker for new grid size
     */
    resize(newN) {
        this.N = newN;
        // Keep history, just update N for susceptibility calculation
    }
    
    /**
     * Reset all statistics
     */
    reset() {
        this.R_history.fill(0);
        this.chi_history.fill(0);
        this.Psi_history.fill(0);
        this.historyIndex = 0;
        this.historyCount = 0;
        this.R = 0;
        this.Psi = 0;
        this.chi = 0;
        this.syncFraction = 0;
        this.R_mean = 0;
        this.R_M2 = 0;
        this.varianceCount = 0;
        this.R_window.fill(0);
        this.windowIndex = 0;
        this.windowFilled = false;
        this.phaseDiagramData = [];
        this.estimatedKc = null;
    }
    
    /**
     * Export statistics data to CSV format
     */
    exportCSV() {
        let csv = 'time,globalR,localMeanR,chi,gradient,Psi\n';
        const count = this.historyCount;
        
        for (let i = 0; i < count; i++) {
            const idx = (this.historyIndex - count + i + this.historySize) % this.historySize;
            csv += `${i},${this.R_history[idx].toFixed(6)},${this.localR_history[idx].toFixed(6)},${this.chi_history[idx].toFixed(6)},${this.gradient_history[idx].toFixed(6)},${this.Psi_history[idx].toFixed(6)}\n`;
        }
        
        return csv;
    }
    
    /**
     * Export phase diagram data to CSV
     */
    exportPhaseDiagramCSV() {
        if (this.phaseDiagramData.length === 0) {
            return 'No phase diagram data. Run K-scan first.';
        }
        
        let csv = 'K,localMeanR_mean,localMeanR_std,chi\n';
        for (const point of this.phaseDiagramData) {
            csv += `${point.K.toFixed(4)},${point.R_mean.toFixed(6)},${point.R_std.toFixed(6)},${point.chi.toFixed(6)}\n`;
        }
        
        return csv;
    }
}


/**
 * Lyapunov Exponent Calculator
 * 
 * Computes the Largest Lyapunov Exponent (LLE) using Benettin's algorithm.
 * 
 * The LLE measures sensitivity to initial conditions:
 * - λ > 0: Chaotic (trajectories diverge exponentially)
 * - λ ≈ 0: Critical (edge of chaos - optimal for reservoir computing)
 * - λ < 0: Stable (trajectories converge)
 * 
 * Algorithm (Benettin et al.):
 * 1. Run reference trajectory θ(t)
 * 2. Run perturbed trajectory θ'(t) = θ(t) + δ
 * 3. After each renormalization interval:
 *    a. Measure distance d = ||θ' - θ||
 *    b. Accumulate log(d/δ₀)
 *    c. Renormalize: θ' ← θ + δ₀ · (θ' - θ)/d
 * 4. LLE = (1/T) · Σ log(d/δ₀)
 */
export class LyapunovCalculator {
    constructor(N) {
        this.N = N;
        this.gridSize = Math.sqrt(N);
        
        // Parameters
        this.delta0 = 1e-8;  // Initial perturbation magnitude (smaller for accuracy)
        this.renormInterval = 5;  // Steps between renormalizations
        
        // State
        this.isRunning = false;
        this.perturbation = null;  // Current perturbation vector δθ
        this.prevTheta = null;     // Previous theta for computing trajectory evolution
        
        // Accumulator for LLE computation
        this.logSum = 0;
        this.renormCount = 0;
        this.stepCount = 0;
        this.totalTime = 0;
        
        // History for plotting
        this.lleHistory = [];
        this.maxHistory = 200;
        
        // Current estimate
        this.lle = 0;
        
        // Callbacks
        this.onUpdate = null;

        this.rng = null;
    }
    
    /**
     * Resize the calculator for new grid size
     */
    resize(N) {
        this.stop();
        this.N = N;
        this.gridSize = Math.sqrt(N);
        this.lle = 0;
        this.lleHistory = [];
    }
    
    /**
     * Initialize the perturbation from current state
     * @param {Float32Array} theta - Current phase values
     */
    start(theta, rng = null) {
        this.prevTheta = new Float32Array(theta);
        this.rng = rng;
        
        // Initialize random unit perturbation
        this.perturbation = new Float32Array(this.N);
        let norm = 0;
        for (let i = 0; i < this.N; i++) {
            const r = this.rng ? this.rng.float() : Math.random();
            this.perturbation[i] = r - 0.5;
            norm += this.perturbation[i] * this.perturbation[i];
        }
        norm = Math.sqrt(norm);
        
        // Normalize to delta0
        for (let i = 0; i < this.N; i++) {
            this.perturbation[i] = this.delta0 * this.perturbation[i] / norm;
        }
        
        this.logSum = 0;
        this.renormCount = 0;
        this.stepCount = 0;
        this.totalTime = 0;
        this.lleHistory = [];
        this.isRunning = true;
        
        console.log('Lyapunov calculation started (tangent-space method)');
    }
    
    /**
     * Stop the calculation
     */
    stop() {
        this.isRunning = false;
        this.perturbation = null;
        this.prevTheta = null;
        console.log(`Lyapunov calculation stopped. Final LLE = ${this.lle.toFixed(4)}`);
    }
    
    /**
     * Evolve perturbation using linearized dynamics (tangent-space method)
     * 
     * For Kuramoto: dθᵢ/dt = ωᵢ + (K/N) Σⱼ sin(θⱼ - θᵢ)
     * Linearized: dδθᵢ/dt = (K/N) Σⱼ cos(θⱼ - θᵢ)(δθⱼ - δθᵢ)
     * 
     * @param {Float32Array} theta - Current phase values from GPU
     * @param {Float32Array} omega - Natural frequencies (unused in linearized eqn)
     * @param {number} K - Coupling strength
     * @param {number} dt - Time step
     * @param {number} range - Coupling range
     * @param {number} gridSize - Grid dimension
     */
    step(theta, omega, K, dt, range, gridSize) {
        if (!this.isRunning || !this.perturbation) return;
        
        const rng = Math.floor(range);
        const newPerturbation = new Float32Array(this.N);
        
        // Evolve perturbation using linearized Kuramoto dynamics
        for (let i = 0; i < this.N; i++) {
            const col = i % gridSize;
            const row = Math.floor(i / gridSize);
            
            let dPerturbation = 0;
            let count = 0;
            
            for (let dr = -rng; dr <= rng; dr++) {
                for (let dc = -rng; dc <= rng; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    
                    const nc = (col + dc + gridSize) % gridSize;
                    const nr = (row + dr + gridSize) % gridSize;
                    const j = nr * gridSize + nc;
                    
                    // Jacobian element: J_ij = (K/count) * cos(θⱼ - θᵢ)
                    const phaseDiff = theta[j] - theta[i];
                    const coupling = Math.cos(phaseDiff);
                    
                    // Contribution to δθᵢ: J_ij * (δθⱼ - δθᵢ)
                    dPerturbation += coupling * (this.perturbation[j] - this.perturbation[i]);
                    count++;
                }
            }
            
            // Euler step for perturbation
            newPerturbation[i] = this.perturbation[i] + dt * (K / count) * dPerturbation;
        }
        
        this.perturbation = newPerturbation;
        this.stepCount++;
        this.totalTime += dt;
        
        // Renormalize and measure growth periodically
        if (this.stepCount % this.renormInterval === 0) {
            this.renormalize();
        }
        
        // Store previous theta
        this.prevTheta.set(theta);
    }
    
    /**
     * Renormalize the perturbation and accumulate log-growth
     */
    renormalize() {
        // Compute current perturbation norm
        let normSq = 0;
        for (let i = 0; i < this.N; i++) {
            normSq += this.perturbation[i] * this.perturbation[i];
        }
        const norm = Math.sqrt(normSq);
        
        if (norm > 0 && norm < Infinity && !isNaN(norm)) {
            // Accumulate log-growth: λ = (1/T) * Σ log(||δθ|| / δ₀)
            this.logSum += Math.log(norm / this.delta0);
            this.renormCount++;
            
            // Renormalize: reset perturbation magnitude while keeping direction
            for (let i = 0; i < this.N; i++) {
                this.perturbation[i] = this.delta0 * this.perturbation[i] / norm;
            }
            
            // Update LLE estimate (divide by actual time, not steps)
            if (this.totalTime > 0) {
                this.lle = this.logSum / this.totalTime;
            }
            
            // Store in history
            this.lleHistory.push(this.lle);
            if (this.lleHistory.length > this.maxHistory) {
                this.lleHistory.shift();
            }
            
            // Callback
            if (this.onUpdate) {
                this.onUpdate(this.lle, this.renormCount);
            }
        } else {
            // Perturbation collapsed or exploded - reinitialize
            console.warn('LLE: Perturbation numerical issue, reinitializing');
            let newNorm = 0;
            for (let i = 0; i < this.N; i++) {
                const r = this.rng ? this.rng.float() : Math.random();
                this.perturbation[i] = r - 0.5;
                newNorm += this.perturbation[i] * this.perturbation[i];
            }
            newNorm = Math.sqrt(newNorm);
            for (let i = 0; i < this.N; i++) {
                this.perturbation[i] = this.delta0 * this.perturbation[i] / newNorm;
            }
        }
    }
    
    /**
     * Get interpretation of current LLE
     */
    getInterpretation() {
        if (this.renormCount < 5) return 'measuring...';
        
        if (this.lle > 0.1) return 'chaotic';
        if (this.lle > 0.01) return 'weakly chaotic';
        if (this.lle > -0.01) return 'critical (edge of chaos)';
        if (this.lle > -0.1) return 'weakly stable';
        return 'stable';
    }
    
    /**
     * Get recent LLE history for plotting
     */
    getHistory() {
        return this.lleHistory;
    }
}


/**
 * Time Series Plot - Canvas-based real-time plotting
 */
export class TimeSeriesPlot {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.warn(`Canvas ${canvasId} not found`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        
        this.maxPoints = options.maxPoints || 300;
        this.yMin = options.yMin ?? 0;
        this.yMax = options.yMax ?? 1;
        this.autoScale = options.autoScale || false;
        this.color = options.color || '#4CAF50';
        this.fillColor = options.fillColor || null;
        this.showGrid = options.showGrid !== false;
        this.showValue = options.showValue !== false;
        this.showYAxis = options.showYAxis || false;  // Show Y axis with labels
        this.label = options.label || '';
        this.lineWidth = options.lineWidth || 1.5;
        this.logScale = options.logScale || false;  // Log scale for Y axis
        this.leftMargin = options.showYAxis ? 35 : 0;  // Space for Y axis labels
        
        // High-DPI support
        this.setupHiDPI();
    }
    
    /**
     * Toggle log scale mode
     */
    setLogScale(enabled) {
        this.logScale = enabled;
    }
    
    /**
     * Convert value to Y position, handling log scale
     */
    valueToY(value, yMin, yMax, H) {
        if (this.logScale && value > 0) {
            // Use log scale
            const logMin = Math.log10(Math.max(yMin, 1e-6));
            const logMax = Math.log10(Math.max(yMax, 1e-5));
            const logVal = Math.log10(Math.max(value, 1e-6));
            return H - ((logVal - logMin) / (logMax - logMin)) * H;
        } else {
            // Linear scale
            return H - ((value - yMin) / (yMax - yMin)) * H;
        }
    }
    
    setupHiDPI() {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.displayWidth = rect.width;
        this.displayHeight = rect.height;
    }
    
    /**
     * Render the plot with given data
     * @param {Float32Array} data - Array of values to plot
     */
    render(data) {
        if (!this.canvas || !this.ctx) return;
        
        const W = this.displayWidth;
        const H = this.displayHeight;
        const ctx = this.ctx;
        
        // Auto-scale Y axis if enabled
        let yMin = this.yMin;
        let yMax = this.yMax;
        if (this.autoScale && data.length > 0) {
            let min = Infinity, max = -Infinity;
            for (let i = 0; i < data.length; i++) {
                if (data[i] !== 0) { // Ignore uninitialized values
                    min = Math.min(min, data[i]);
                    max = Math.max(max, data[i]);
                }
            }
            if (min !== Infinity) {
                const range = max - min || 1;
                yMin = min - range * 0.1;
                yMax = max + range * 0.1;
            }
        }
        
        // Calculate plot area (with optional left margin for Y axis)
        const plotLeft = this.leftMargin;
        const plotWidth = W - plotLeft;
        
        // Clear
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, W, H);
        
        // Draw Y axis if enabled
        if (this.showYAxis && !this.logScale) {
            ctx.strokeStyle = '#444';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(plotLeft, 0);
            ctx.lineTo(plotLeft, H);
            ctx.stroke();
            
            // Y axis labels
            ctx.fillStyle = '#888';
            ctx.font = '9px monospace';
            ctx.textAlign = 'right';
            
            const numTicks = 4;
            for (let i = 0; i <= numTicks; i++) {
                const t = i / numTicks;
                const val = yMin + t * (yMax - yMin);
                const py = H - t * H;
                
                // Tick mark
                ctx.beginPath();
                ctx.moveTo(plotLeft - 3, py);
                ctx.lineTo(plotLeft, py);
                ctx.stroke();
                
                // Label (format based on value magnitude)
                let label;
                if (Math.abs(val) >= 100) {
                    label = val.toFixed(0);
                } else if (Math.abs(val) >= 1) {
                    label = val.toFixed(1);
                } else {
                    label = val.toFixed(2);
                }
                ctx.fillText(label, plotLeft - 5, py + 3);
            }
        }
        
        // Grid (in plot area)
        if (this.showGrid) {
            ctx.strokeStyle = '#2a2a3a';
            ctx.lineWidth = 0.5;
            
            // Horizontal grid lines
            for (let y = 0; y <= 1; y += 0.25) {
                const py = H - y * H;
                ctx.beginPath();
                ctx.moveTo(plotLeft, py);
                ctx.lineTo(W, py);
                ctx.stroke();
            }
            
            // Vertical grid lines
            for (let x = 0; x <= 1; x += 0.25) {
                const px = plotLeft + x * plotWidth;
                ctx.beginPath();
                ctx.moveTo(px, 0);
                ctx.lineTo(px, H);
                ctx.stroke();
            }
        }
        
        // Data line
        if (data.length < 2) return;
        
        // Find first non-zero value (start of actual data)
        let startIdx = 0;
        for (let i = 0; i < data.length; i++) {
            if (data[i] !== 0) {
                startIdx = i;
                break;
            }
        }
        
        // Draw filled area if fillColor is set
        if (this.fillColor) {
            ctx.fillStyle = this.fillColor;
            ctx.beginPath();
            
            const firstX = plotLeft + (startIdx / this.maxPoints) * plotWidth;
            ctx.moveTo(firstX, H);
            
            for (let i = startIdx; i < data.length; i++) {
                const x = plotLeft + (i / this.maxPoints) * plotWidth;
                const y = this.valueToY(data[i], yMin, yMax, H);
                ctx.lineTo(x, Math.max(0, Math.min(H, y)));
            }
            
            ctx.lineTo(plotLeft + plotWidth, H);
            ctx.closePath();
            ctx.fill();
        }
        
        // Draw line
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.lineWidth;
        ctx.beginPath();
        
        for (let i = startIdx; i < data.length; i++) {
            const x = plotLeft + (i / this.maxPoints) * plotWidth;
            const y = this.valueToY(data[i], yMin, yMax, H);
            if (i === startIdx) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // Current value marker
        const lastVal = data[data.length - 1];
        const lastY = this.valueToY(lastVal, yMin, yMax, H);
        const markerX = plotLeft + plotWidth - 3;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(markerX, lastY, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Value label
        if (this.showValue) {
            ctx.fillStyle = '#fff';
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(lastVal.toFixed(3), markerX - 5, lastY - 6);
        }
        
        // Axis label
        if (this.label) {
            ctx.fillStyle = '#666';
            ctx.font = '9px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(this.label, plotLeft + 4, 12);
        }
    }
}


/**
 * Phase Diagram Plot - local mean R vs K with error bars
 */
export class PhaseDiagramPlot {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.warn(`Canvas ${canvasId} not found`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        
        this.K_range = [0, 3];
        this.currentK = 0;
        this.estimatedKc = null;
        
        this.margin = { left: 35, right: 10, top: 15, bottom: 25 };
        
        this.setupHiDPI();
    }
    
    setupHiDPI() {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.displayWidth = rect.width;
        this.displayHeight = rect.height;
    }
    
    setCurrentK(K) {
        this.currentK = K;
    }
    
    /**
     * Render phase diagram
     * @param {Array} data - Array of {K, R_mean, R_std, chi} objects
     * @param {number} estimatedKc - Estimated critical coupling
     */
    render(data, estimatedKc = null) {
        if (!this.canvas || !this.ctx) return;
        
        const W = this.displayWidth;
        const H = this.displayHeight;
        const ctx = this.ctx;
        const { left, right, top, bottom } = this.margin;
        const plotW = W - left - right;
        const plotH = H - top - bottom;
        
        this.estimatedKc = estimatedKc;
        
        // Clear
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, W, H);
        
        // Axes
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(left, H - bottom);
        ctx.lineTo(W - right, H - bottom);
        ctx.stroke();
        
        // Labels
        ctx.fillStyle = '#888';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('K', left + plotW / 2, H - 4);
        
        ctx.save();
        ctx.translate(10, top + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Local R̄', 0, 0);
        ctx.restore();
        
        // Tick labels
        ctx.fillStyle = '#666';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('1.0', left - 4, top + 4);
        ctx.fillText('0.5', left - 4, top + plotH / 2 + 4);
        ctx.fillText('0.0', left - 4, H - bottom + 4);

        // Midline grid
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, top + plotH / 2);
        ctx.lineTo(W - right, top + plotH / 2);
        ctx.stroke();
        
        ctx.textAlign = 'center';
        ctx.fillText('0', left, H - bottom + 12);
        ctx.fillText(this.K_range[1].toString(), W - right, H - bottom + 12);
        
        if (data.length < 2) {
            ctx.fillStyle = '#666';
            ctx.textAlign = 'center';
            ctx.fillText('Run K-scan to build phase diagram', W / 2, H / 2);
            return;
        }
        
        // Update K range from data
        const K_max = Math.max(...data.map(d => d.K));
        this.K_range[1] = Math.max(K_max, 2);
        
        // Draw error bars
        ctx.strokeStyle = 'rgba(74, 158, 255, 0.3)';
        ctx.lineWidth = 1;
        for (const point of data) {
            const x = left + (point.K / this.K_range[1]) * plotW;
            const yMean = top + (1 - point.R_mean) * plotH;
            const yTop = top + (1 - point.R_mean - point.R_std) * plotH;
            const yBot = top + (1 - point.R_mean + point.R_std) * plotH;
            
            ctx.beginPath();
            ctx.moveTo(x, Math.max(top, yTop));
            ctx.lineTo(x, Math.min(H - bottom, yBot));
            ctx.stroke();
        }
        
        // Draw R(K) line
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
            const point = data[i];
            const x = left + (point.K / this.K_range[1]) * plotW;
            const y = top + (1 - point.R_mean) * plotH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // Draw data points
        ctx.fillStyle = '#4CAF50';
        for (const point of data) {
            const x = left + (point.K / this.K_range[1]) * plotW;
            const y = top + (1 - point.R_mean) * plotH;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Mark K_c
        if (this.estimatedKc !== null) {
            const xKc = left + (this.estimatedKc / this.K_range[1]) * plotW;
            ctx.strokeStyle = '#FF5722';
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(xKc, top);
            ctx.lineTo(xKc, H - bottom);
            ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.fillStyle = '#FF5722';
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`Kc≈${this.estimatedKc.toFixed(2)}`, xKc + 4, top + 12);
        }
        
        // Current K marker
        const xCurrent = left + (this.currentK / this.K_range[1]) * plotW;
        ctx.fillStyle = '#2196F3';
        ctx.beginPath();
        ctx.arc(xCurrent, H - bottom, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Current K label
        ctx.fillStyle = '#2196F3';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`K=${this.currentK.toFixed(2)}`, xCurrent, H - bottom - 8);
    }
}

/**
 * Phase Space Plot (θ on unit circle)
 * Renders a subsampled scatter of oscillator phases on a unit circle.
 */
export class PhaseSpacePlot {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.warn(`Canvas ${canvasId} not found`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        this.maxPoints = options.maxPoints || 2000;
        this.pointSize = options.pointSize || 2;
        this.ringColor = options.ringColor || '#333';
        this.pointColor = options.pointColor || 'rgba(74, 158, 255, 0.8)';
        this.bg = options.bg || '#0f0f1a';
        this.axisColor = options.axisColor || '#1f1f2f';
        this.setupHiDPI();
    }

    setupHiDPI() {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.displayWidth = rect.width;
        this.displayHeight = rect.height;
    }

    /**
     * Render from a theta array (Float32Array of radians)
     */
    render(thetaArray) {
        if (!this.canvas || !this.ctx || !thetaArray) return;

        const ctx = this.ctx;
        const W = this.displayWidth;
        const H = this.displayHeight;
        const cx = W / 2;
        const cy = H / 2;
        const radius = Math.min(W, H) * 0.44;

        // Clear background
        ctx.fillStyle = this.bg;
        ctx.fillRect(0, 0, W, H);

        // Draw axes
        ctx.strokeStyle = this.axisColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - radius, cy);
        ctx.lineTo(cx + radius, cy);
        ctx.moveTo(cx, cy - radius);
        ctx.lineTo(cx, cy + radius);
        ctx.stroke();

        // Draw unit circle
        ctx.strokeStyle = this.ringColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Subsample
        const total = thetaArray.length;
        const step = Math.max(1, Math.floor(total / this.maxPoints));
        const offset = 0;

        ctx.fillStyle = this.pointColor;
        ctx.beginPath();
        for (let i = offset; i < total && i < offset + step * this.maxPoints; i += step) {
            const theta = thetaArray[i];
            const x = cx + radius * Math.cos(theta);
            const y = cy - radius * Math.sin(theta);
            ctx.moveTo(x + this.pointSize, y);
            ctx.arc(x, y, this.pointSize, 0, Math.PI * 2);
        }
        ctx.fill();
    }
}
