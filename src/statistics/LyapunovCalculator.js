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
