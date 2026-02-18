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
