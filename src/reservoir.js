/**
 * Reservoir Computing Module for Kuramoto Oscillators
 * 
 * This module implements the infrastructure for using the Kuramoto oscillator
 * network as a reservoir computer for temporal pattern learning.
 */

import { makeRng, normalizeSeed } from './rng.js';

/**
 * Manages input/output weights and signal injection for reservoir computing
 */
export class ReservoirIO {
    constructor(gridSize) {
        this.gridSize = gridSize;
        this.N = gridSize * gridSize;
        
        // Input weights: how strongly each oscillator receives input signal
        this.inputWeights = new Float32Array(this.N);
        
        // Readout mask: which oscillators are used for output (0 or 1)
        this.readoutMask = new Float32Array(this.N);

        // Cached readout indices for fast feature extraction
        this.readoutIndices = [];
        
        // Current input signal value
        this.inputSignal = 0;
        
        // Feature history buffer (ring buffer of past readout states)
        // Keep history short to limit feature count: 50 readouts × 2 × 10 = 1000 features
        this.historyLength = 10;
        this.featureHistory = [];
        this.historyIndex = 0;
        this.maxFeatures = 512;
        
        // Number of readout oscillators
        this.numReadouts = 0;

        this.seed = 1;
        this.rng = makeRng(this.seed, 'rc:io');
    }

    setSeed(seed) {
        this.seed = normalizeSeed(seed);
        this.rng = makeRng(this.seed, 'rc:io');
    }
    
    /**
     * Configure input region
     * @param {string} region - 'left', 'top', 'center', 'random'
     * @param {number} width - Fraction of grid (0-0.5)
     * @param {number} strength - Input scaling factor
     */
    setInputRegion(region, width = 0.1, strength = 1.0) {
        this.inputWeights.fill(0);
        const w = Math.floor(this.gridSize * width);
        
        switch (region) {
            case 'left':
                // Simple left edge - uniform weights
                for (let y = 0; y < this.gridSize; y++) {
                    for (let x = 0; x < w; x++) {
                        this.inputWeights[y * this.gridSize + x] = strength;
                    }
                }
                break;
            case 'top':
                // Simple top edge - uniform weights  
                for (let y = 0; y < w; y++) {
                    for (let x = 0; x < this.gridSize; x++) {
                        this.inputWeights[y * this.gridSize + x] = strength;
                    }
                }
                break;
            case 'center':
                const cx = Math.floor(this.gridSize / 2);
                const cy = Math.floor(this.gridSize / 2);
                const r = Math.floor(this.gridSize * width);
                for (let y = 0; y < this.gridSize; y++) {
                    for (let x = 0; x < this.gridSize; x++) {
                        const dx = x - cx, dy = y - cy;
                        if (dx * dx + dy * dy < r * r) {
                            this.inputWeights[y * this.gridSize + x] = strength;
                        }
                    }
                }
                break;
            case 'random':
                const numInputs = Math.floor(this.N * width * 0.5);
                const indices = [];
                for (let i = 0; i < this.N; i++) indices.push(i);
                // Shuffle and take first numInputs
                for (let i = indices.length - 1; i > 0; i--) {
                    const j = this.rng ? this.rng.int(0, i) : Math.floor(Math.random() * (i + 1));
                    [indices[i], indices[j]] = [indices[j], indices[i]];
                }
                for (let i = 0; i < numInputs; i++) {
                    this.inputWeights[indices[i]] = strength;
                }
                break;
            case 'gradient':
                // Full left-to-right gradient across entire grid
                // This creates a smooth input that propagates better
                for (let y = 0; y < this.gridSize; y++) {
                    for (let x = 0; x < this.gridSize; x++) {
                        // Exponential falloff from left edge
                        const normalizedX = x / this.gridSize;
                        const falloff = Math.exp(-normalizedX * 4); // e^(-4x) decays to ~2% at x=1
                        this.inputWeights[y * this.gridSize + x] = strength * falloff;
                    }
                }
                break;
        }
    }
    
    /**
     * Configure output/readout region - uses sparse sampling to keep feature count manageable
     * @param {string} region - 'right', 'bottom', 'random'
     * @param {number} width - Fraction of grid (0-0.5)
     */
    setOutputRegion(region, width = 0.1) {
        this.readoutMask.fill(0);
        this.numReadouts = 0;
        this.readoutIndices = [];
        
        // With online learning (RLS), we can handle more readouts
        // 100 readouts × 2 features × 10 history = 2000 features
        // RLS is O(n²) per update, so 2000² = 4M ops per step - manageable
        const maxReadouts = 100;
        
        // Collect candidate indices based on region
        const candidates = [];
        const w = Math.floor(this.gridSize * width);
        
        switch (region) {
            case 'right':
                for (let y = 0; y < this.gridSize; y++) {
                    for (let x = this.gridSize - w; x < this.gridSize; x++) {
                        candidates.push(y * this.gridSize + x);
                    }
                }
                break;
            case 'bottom':
                for (let y = this.gridSize - w; y < this.gridSize; y++) {
                    for (let x = 0; x < this.gridSize; x++) {
                        candidates.push(y * this.gridSize + x);
                    }
                }
                break;
            case 'random':
                for (let i = 0; i < this.N; i++) {
                    // Avoid overlap with input weights
                    if (this.inputWeights[i] === 0) candidates.push(i);
                }
                break;
        }
        
        // Sparse sample from candidates
        if (candidates.length <= maxReadouts) {
            // Use all candidates
            for (const idx of candidates) {
                this.readoutMask[idx] = 1;
                this.numReadouts++;
                this.readoutIndices.push(idx);
            }
        } else {
            // Uniformly sample from candidates
            const step = candidates.length / maxReadouts;
            for (let i = 0; i < maxReadouts; i++) {
                const idx = candidates[Math.floor(i * step)];
                this.readoutMask[idx] = 1;
                this.numReadouts++;
                this.readoutIndices.push(idx);
            }
        }
    }
    
    /**
     * Set current input signal
     * @param {number} signal - Input value (typically normalized to [-1, 1])
     */
    setInputSignal(signal) {
        this.inputSignal = signal;
    }
    
    /**
     * Extract features from current oscillator state
     * @param {Float32Array} theta - Current phase values
     * @returns {Float32Array} Feature vector [sin(θ), cos(θ)] for readout oscillators
     */
    extractFeatures(theta) {
        // Safety check
        if (!theta || theta.length !== this.N) {
            console.warn('extractFeatures: invalid theta', theta?.length, 'expected', this.N);
            return new Float32Array(this.numReadouts * 2);
        }
        
        if (this.numReadouts === 0) {
            console.warn('extractFeatures: no readout oscillators configured');
            return new Float32Array(0);
        }
        
        // Features: sin(θ) and cos(θ) for each readout oscillator
        const indices = this.readoutIndices;
        const features = new Float32Array(indices.length * 2);
        let fi = 0;

        for (let k = 0; k < indices.length; k++) {
            const i = indices[k];
            const th = theta[i];
            features[fi++] = Math.sin(th);
            features[fi++] = Math.cos(th);
        }

        return features;
    }
    
    /**
     * Update feature history with current features
     * @param {Float32Array} features - Current feature vector
     */
    updateHistory(features) {
        if (this.featureHistory.length < this.historyLength) {
            this.featureHistory.push(new Float32Array(features));
        } else {
            // Overwrite oldest entry
            this.featureHistory[this.historyIndex].set(features);
            this.historyIndex = (this.historyIndex + 1) % this.historyLength;
        }
    }
    
    /**
     * Get flattened feature vector including history
     * @returns {Float32Array} Concatenated features from all history timesteps
     */
    getFullFeatureVector() {
        if (this.featureHistory.length === 0) return new Float32Array(0);
        
        const featureSize = this.featureHistory[0].length;
        const fullFeatures = new Float32Array(this.featureHistory.length * featureSize);
        
        // Arrange from oldest to newest
        for (let t = 0; t < this.featureHistory.length; t++) {
            const idx = (this.historyIndex + t) % this.featureHistory.length;
            fullFeatures.set(this.featureHistory[idx], t * featureSize);
        }
        
        // Downsample features if exceeding budget (stride-based)
        if (fullFeatures.length <= this.maxFeatures || this.maxFeatures <= 0) {
            return fullFeatures;
        }
        const step = Math.ceil(fullFeatures.length / this.maxFeatures);
        const capped = Math.min(fullFeatures.length, step * this.maxFeatures);
        const projected = new Float32Array(Math.floor(capped / step));
        let pi = 0;
        for (let i = 0; i < capped && pi < projected.length; i += step) {
            projected[pi++] = fullFeatures[i];
        }
        return projected;
    }
    
    /**
     * Clear history buffer
     */
    clearHistory() {
        this.featureHistory = [];
        this.historyIndex = 0;
    }
    
    /**
     * Resize for new grid size
     */
    resize(newGridSize) {
        this.gridSize = newGridSize;
        this.N = newGridSize * newGridSize;
        this.inputWeights = new Float32Array(this.N);
        this.readoutMask = new Float32Array(this.N);
        this.readoutIndices = [];
        this.clearHistory();
    }

    setFeatureBudget(maxFeatures) {
        this.maxFeatures = Math.max(0, maxFeatures | 0);
    }

    setHistoryLength(len) {
        this.historyLength = Math.max(1, len | 0);
        this.clearHistory();
    }

    /**
     * Dynamic moving-dot input weights (normalized coordinates 0-1)
     */
    setMovingDotWeightsNorm(nx, ny, radiusNorm = 0.05, strength = 1.0) {
        this.inputWeights.fill(0);
        const radius = Math.max(1, Math.floor(this.gridSize * radiusNorm));
        const cx = Math.floor(nx * this.gridSize) % this.gridSize;
        const cy = Math.floor(ny * this.gridSize) % this.gridSize;
        const r2 = radius * radius;
        for (let y = -radius; y <= radius; y++) {
            for (let x = -radius; x <= radius; x++) {
                if (x * x + y * y <= r2) {
                    const gx = (cx + x + this.gridSize) % this.gridSize;
                    const gy = (cy + y + this.gridSize) % this.gridSize;
                    this.inputWeights[gy * this.gridSize + gx] = strength;
                }
            }
        }
    }
}

/**
 * Online Learning with Recursive Least Squares (RLS)
 * Much more scalable than batch ridge regression - O(n²) per update instead of O(n³) total
 * Can handle unlimited training samples and larger feature dimensions
 */
export class OnlineLearner {
    constructor() {
        this.weights = null;  // Weight vector
        this.P = null;        // Inverse correlation matrix (for RLS)
        this.dim = 0;         // Feature dimension
        this.lambda = 0.99;   // Forgetting factor (1.0 = no forgetting)
        this.delta = 1.0;     // Initial P scaling
        this.sampleCount = 0;
        this.initialized = false;

        this.xScratch = null;
        this.PxScratch = null;
        this.kScratch = null;
        
        // For computing running NRMSE
        this.errorSum = 0;
        this.targetSum = 0;
        this.targetSqSum = 0;
    }
    
    /**
     * Initialize with feature dimension
     */
    initialize(dim) {
        this.dim = dim + 1; // +1 for bias
        this.weights = new Float32Array(this.dim);
        
        // Initialize P as scaled identity matrix
        // Use a simple diagonal representation for efficiency
        this.P = new Float32Array(this.dim * this.dim);
        for (let i = 0; i < this.dim; i++) {
            this.P[i * this.dim + i] = this.delta;
        }
        
        this.sampleCount = 0;
        this.errorSum = 0;
        this.targetSum = 0;
        this.targetSqSum = 0;
        this.initialized = true;

        this.xScratch = new Float32Array(this.dim);
        this.PxScratch = new Float32Array(this.dim);
        this.kScratch = new Float32Array(this.dim);
        console.log(`OnlineLearner initialized with ${dim} features (+1 bias)`);
    }
    
    /**
     * Update weights with a single sample (RLS update)
     * @param {Float32Array} features - Feature vector
     * @param {number} target - Target value
     * @returns {number} Prediction error for this sample
     */
    update(features, target) {
        if (!this.initialized) {
            this.initialize(features.length);
        }
        
        // Augment features with bias term
        const x = this.xScratch;
        x.fill(0);
        x.set(features, 0);
        x[this.dim - 1] = 1.0; // Bias
        
        // Compute prediction with current weights
        let prediction = 0;
        for (let i = 0; i < this.dim; i++) {
            prediction += this.weights[i] * x[i];
        }
        
        // Prediction error
        const error = target - prediction;
        
        // RLS update: compute P * x
        const Px = this.PxScratch;
        for (let i = 0; i < this.dim; i++) {
            let sum = 0;
            for (let j = 0; j < this.dim; j++) {
                sum += this.P[i * this.dim + j] * x[j];
            }
            Px[i] = sum;
        }
        
        // Compute x' * P * x
        let xPx = 0;
        for (let i = 0; i < this.dim; i++) {
            xPx += x[i] * Px[i];
        }
        
        // Compute gain vector k = P * x / (lambda + x' * P * x)
        const denom = this.lambda + xPx;
        const k = this.kScratch;
        for (let i = 0; i < this.dim; i++) {
            k[i] = Px[i] / denom;
        }
        
        // Update weights: w = w + k * error
        for (let i = 0; i < this.dim; i++) {
            this.weights[i] += k[i] * error;
        }
        
        // Update P: P = (P - k * x' * P) / lambda
        // This is the expensive O(n²) part
        for (let i = 0; i < this.dim; i++) {
            for (let j = 0; j < this.dim; j++) {
                this.P[i * this.dim + j] = (this.P[i * this.dim + j] - k[i] * Px[j]) / this.lambda;
            }
        }
        
        // Update running statistics
        this.sampleCount++;
        this.errorSum += error * error;
        this.targetSum += target;
        this.targetSqSum += target * target;
        
        return error;
    }
    
    /**
     * Make a prediction
     */
    predict(features) {
        if (!this.initialized || !this.weights) return 0;
        
        let result = this.weights[this.dim - 1]; // Bias
        const len = Math.min(features.length, this.dim - 1);
        for (let i = 0; i < len; i++) {
            result += this.weights[i] * features[i];
        }
        return result;
    }
    
    /**
     * Get running NRMSE
     */
    getNRMSE() {
        if (this.sampleCount < 2) return Infinity;
        
        const mse = this.errorSum / this.sampleCount;
        const meanTarget = this.targetSum / this.sampleCount;
        const varTarget = this.targetSqSum / this.sampleCount - meanTarget * meanTarget;
        
        if (varTarget < 1e-10) return Infinity;
        return Math.sqrt(mse / varTarget);
    }
    
    /**
     * Check if learner is ready
     */
    isTrained() {
        return this.initialized && this.sampleCount > 10;
    }
    
    /**
     * Get sample count
     */
    getSampleCount() {
        return this.sampleCount;
    }

    /**
    * Approximate condition number using diag(P)
    */
    getConditionEstimate() {
        if (!this.P || this.dim === 0) return null;
        let minD = Infinity;
        let maxD = 0;
        for (let i = 0; i < this.dim; i++) {
            const v = this.P[i * this.dim + i];
            minD = Math.min(minD, v);
            maxD = Math.max(maxD, v);
        }
        if (minD <= 0 || !isFinite(minD) || !isFinite(maxD)) return null;
        return maxD / minD;
    }
    
    /**
     * Reset learner
     */
    clear() {
        this.weights = null;
        this.P = null;
        this.initialized = false;
        this.sampleCount = 0;
        this.errorSum = 0;
        this.targetSum = 0;
        this.targetSqSum = 0;

        this.xScratch = null;
        this.PxScratch = null;
        this.kScratch = null;
    }
}

/**
 * Ridge Regression trainer for reservoir readout (kept for comparison/batch mode)
 */
export class RidgeRegression {
    constructor() {
        this.X = []; // Feature matrix (list of feature vectors)
        this.Y = []; // Target values
        this.weights = null; // Trained weights
        this.bias = 0;
    }
    
    /**
     * Collect a training sample
     * @param {Float32Array} features - Feature vector
     * @param {number} target - Target value
     */
    collectSample(features, target) {
        this.X.push(Array.from(features));
        this.Y.push(target);
    }
    
    /**
     * Train the model using ridge regression
     * @param {number} lambda - Regularization parameter
     * @returns {number} Training NRMSE
     */
    train(lambda = 0.001) {
        if (this.X.length < 10) {
            console.warn('Not enough training samples:', this.X.length);
            return Infinity;
        }
        
        const n = this.X.length;
        const d = this.X[0].length;
        
        if (d === 0) {
            console.error('Feature dimension is 0 - no readout oscillators configured?');
            return Infinity;
        }
        
        console.log(`Training with ${n} samples, ${d} features`);
        
        // Add bias term to features
        const X_aug = this.X.map(row => [...row, 1]);
        const d_aug = d + 1;
        
        // Compute X^T X
        const XtX = new Array(d_aug).fill(0).map(() => new Array(d_aug).fill(0));
        for (let i = 0; i < d_aug; i++) {
            for (let j = 0; j < d_aug; j++) {
                let sum = 0;
                for (let k = 0; k < n; k++) {
                    sum += X_aug[k][i] * X_aug[k][j];
                }
                XtX[i][j] = sum;
            }
        }
        
        // Add regularization: X^T X + λI
        for (let i = 0; i < d_aug - 1; i++) { // Don't regularize bias
            XtX[i][i] += lambda;
        }
        
        // Compute X^T Y
        const XtY = new Array(d_aug).fill(0);
        for (let i = 0; i < d_aug; i++) {
            for (let k = 0; k < n; k++) {
                XtY[i] += X_aug[k][i] * this.Y[k];
            }
        }
        
        // Solve (X^T X + λI) w = X^T Y using Gaussian elimination
        const w = this.solveLinearSystem(XtX, XtY);
        
        if (w === null) {
            console.error('Failed to solve linear system');
            return Infinity;
        }
        
        this.weights = w.slice(0, d);
        this.bias = w[d];
        
        // Compute training NRMSE
        return this.computeNRMSE(this.X, this.Y);
    }
    
    /**
     * Solve linear system Ax = b using Gaussian elimination with partial pivoting
     */
    solveLinearSystem(A, b) {
        const n = b.length;
        
        // Create augmented matrix
        const aug = A.map((row, i) => [...row, b[i]]);
        
        // Forward elimination
        for (let col = 0; col < n; col++) {
            // Find pivot
            let maxRow = col;
            for (let row = col + 1; row < n; row++) {
                if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
                    maxRow = row;
                }
            }
            [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
            
            if (Math.abs(aug[col][col]) < 1e-10) {
                console.warn('Matrix is singular or nearly singular');
                return null;
            }
            
            // Eliminate column
            for (let row = col + 1; row < n; row++) {
                const factor = aug[row][col] / aug[col][col];
                for (let j = col; j <= n; j++) {
                    aug[row][j] -= factor * aug[col][j];
                }
            }
        }
        
        // Back substitution
        const x = new Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            x[i] = aug[i][n];
            for (let j = i + 1; j < n; j++) {
                x[i] -= aug[i][j] * x[j];
            }
            x[i] /= aug[i][i];
        }
        
        return x;
    }
    
    /**
     * Make a prediction
     * @param {Float32Array|Array} features - Feature vector
     * @returns {number} Predicted value
     */
    predict(features) {
        if (!this.weights) return 0;
        
        let result = this.bias;
        for (let i = 0; i < this.weights.length && i < features.length; i++) {
            result += this.weights[i] * features[i];
        }
        return result;
    }
    
    /**
     * Compute Normalized Root Mean Square Error
     */
    computeNRMSE(X, Y) {
        if (X.length === 0) return Infinity;
        
        let mse = 0;
        for (let i = 0; i < X.length; i++) {
            const pred = this.predict(X[i]);
            const err = pred - Y[i];
            mse += err * err;
        }
        mse /= X.length;
        
        // Normalize by target variance
        const meanY = Y.reduce((a, b) => a + b, 0) / Y.length;
        let varY = 0;
        for (const y of Y) {
            varY += (y - meanY) * (y - meanY);
        }
        varY /= Y.length;
        
        if (varY < 1e-10) return Infinity;
        
        return Math.sqrt(mse / varY);
    }
    
    /**
     * Clear all training data
     */
    clear() {
        this.X = [];
        this.Y = [];
        this.weights = null;
        this.bias = 0;
    }
    
    /**
     * Check if model is trained
     */
    isTrained() {
        return this.weights !== null;
    }
    
    /**
     * Get number of training samples
     */
    getSampleCount() {
        return this.X.length;
    }
}

/**
 * Task generators for reservoir computing benchmarks
 */
export class RCTasks {
    constructor() {
        this.time = 0;
        this.taskType = 'sine';
        this.history = []; // For NARMA
        this.movingDotPeriod = 400;
        this.movingDotHorizon = 5;
        this.movingDotWidth = 0.05;
        this.movingDotY = 0.5;

        this.seed = 1;
        this.rng = makeRng(this.seed, 'rc:tasks');
    }

    setSeed(seed) {
        this.seed = normalizeSeed(seed);
        this.rng = makeRng(this.seed, 'rc:tasks');
        this.reset();
    }
    
    /**
     * Set task type
     * @param {string} type - 'sine', 'narma10', 'memory'
     */
    setTask(type) {
        this.taskType = type;
        this.time = 0;
        this.history = [];
    }

    reset() {
        this.time = 0;
        this.history = [];
    }
    
    /**
     * Get next input/target pair
     * @returns {{input: number, target: number}}
     */
    step() {
        this.time++;
        
        switch (this.taskType) {
            case 'sine':
                return this.sineTask();
            case 'narma10':
                return this.narma10Task();
            case 'memory':
                return this.memoryTask();
            case 'moving_dot':
                return this.movingDotTask();
            default:
                return { input: 0, target: 0 };
        }
    }
    
    /**
     * Sine wave prediction: predict sin(t + τ) from sin(t)
     */
    sineTask() {
        const freq = 0.05; // Slow frequency for reservoir dynamics
        const tau = 10; // Prediction horizon
        const input = Math.sin(freq * this.time);
        const target = Math.sin(freq * (this.time + tau));
        return { input, target };
    }
    
    /**
     * NARMA-10: Nonlinear autoregressive moving average
     * y(t+1) = 0.3*y(t) + 0.05*y(t)*Σy(t-i) + 1.5*u(t-9)*u(t) + 0.1
     */
    narma10Task() {
        // Random input in [0, 0.5]
        const u = (this.rng ? this.rng.float() : Math.random()) * 0.5;
        
        // Initialize history if needed
        while (this.history.length < 11) {
            this.history.push({ u: 0, y: 0 });
        }
        
        // Get past values
        const y_prev = this.history[this.history.length - 1].y;
        
        // Sum of past 10 y values
        let sum_y = 0;
        for (let i = 1; i <= 10; i++) {
            const idx = this.history.length - i;
            if (idx >= 0) sum_y += this.history[idx].y;
        }
        
        // u(t-9)
        const u_9 = this.history.length >= 10 ? this.history[this.history.length - 10].u : 0;
        
        // NARMA-10 equation
        const y = 0.3 * y_prev + 0.05 * y_prev * sum_y + 1.5 * u_9 * u + 0.1;
        
        // Clamp to prevent explosion
        const y_clamped = Math.max(-1, Math.min(1, y));
        
        // Store in history
        this.history.push({ u, y: y_clamped });
        if (this.history.length > 50) this.history.shift();
        
        return { input: u, target: y_clamped };
    }
    
    /**
     * Memory capacity task: reproduce delayed input
     */
    memoryTask() {
        const delay = 5;
        const input = Math.sin(0.1 * this.time) + 0.5 * Math.sin(0.23 * this.time);
        
        // Initialize history
        while (this.history.length < delay + 1) {
            this.history.push(0);
        }
        
        this.history.push(input);
        const target = this.history[this.history.length - 1 - delay];
        
        if (this.history.length > 100) this.history.shift();
        
        return { input, target };
    }

    /**
     * Moving dot task: input is localized moving dot; target is future x position
     */
    movingDotTask() {
        const phase = (this.time % this.movingDotPeriod) / this.movingDotPeriod;
        const nextPhase = ((this.time + this.movingDotHorizon) % this.movingDotPeriod) / this.movingDotPeriod;
        // Move horizontally sinusoidally
        const x = 0.5 + 0.4 * Math.sin(2 * Math.PI * phase);
        const xNext = 0.5 + 0.4 * Math.sin(2 * Math.PI * nextPhase);
        const input = 1.0; // constant amplitude; spatial pattern in weights
        const target = xNext; // predict future x in [0,1]
        // Store current x for weight placement
        this.currentDotX = x;
        this.currentDotXNext = xNext;
        return { input, target };
    }
    
    /**
     * Reset task state
     */
    reset() {
        this.time = 0;
        this.history = [];
        this.currentDotX = 0.5;
    }
}

/**
 * Main Reservoir Computer class that coordinates all components
 * Uses online learning (RLS) for scalable training
 */
export class ReservoirComputer {
    constructor(gridSize) {
        this.io = new ReservoirIO(gridSize);
        this.onlineLearner = new OnlineLearner();
        this.tasks = new RCTasks();

        this.seed = 1;
        this.setSeed(this.seed);
        
        this.isTraining = false;
        this.isInference = false;
        this.warmupSteps = 15; // Steps to fill history buffer
        this.currentStep = 0;
        
        // Prediction history for plotting
        this.predictions = [];
        this.targets = [];
        this.maxPlotPoints = 200;

        this.lastPrediction = null;
        this.lastTarget = null;
        this.lastInput = null;
        
        // Running NRMSE during training
        this.lastNRMSE = Infinity;
        this.maxFeatures = 512;
        this.io.setFeatureBudget(this.maxFeatures);
    }
    
    /**
     * Initialize input/output regions
     */
    configure(inputRegion, outputRegion, inputStrength = 1.0) {
        this.io.setInputRegion(inputRegion, 0.1, inputStrength);
        this.io.setOutputRegion(outputRegion, 0.1);
        this.io.clearHistory();
        console.log(`RC configured: input=${inputRegion}, output=${outputRegion}, readouts=${this.io.numReadouts}`);
    }

    setSeed(seed) {
        this.seed = normalizeSeed(seed);
        this.io.setSeed(this.seed);
        this.tasks.setSeed(this.seed);
    }

    setFeatureBudget(maxFeatures) {
        this.io.setFeatureBudget(maxFeatures);
    }

    setHistoryLength(len) {
        this.io.setHistoryLength(len);
    }
    
    /**
     * Set the task type
     */
    setTask(taskType) {
        this.tasks.setTask(taskType);
    }
    
    /**
     * Start training mode
     */
    startTraining() {
        this.isTraining = true;
        this.isInference = false;
        this.currentStep = 0;
        this.onlineLearner.clear();
        this.tasks.reset();
        this.io.clearHistory();
        this.predictions = [];
        this.targets = [];
        this.lastNRMSE = Infinity;
    }
    
    /**
     * Stop training and return final NRMSE
     * @returns {number} NRMSE
     */
    stopTraining() {
        this.isTraining = false;
        this.lastNRMSE = this.onlineLearner.getNRMSE();
        console.log(`Training stopped: ${this.onlineLearner.getSampleCount()} samples, NRMSE: ${this.lastNRMSE.toFixed(4)}`);
        return this.lastNRMSE;
    }
    
    /**
     * Start inference mode
     */
    startInference() {
        if (!this.onlineLearner.isTrained()) {
            console.warn('Model not trained yet');
            return false;
        }
        console.log(`Starting inference`);
        this.isInference = true;
        this.isTraining = false;
        this.currentStep = 0;
        this.tasks.reset();
        this.io.clearHistory();
        this.predictions = [];
        this.targets = [];
        return true;
    }
    
    /**
     * Stop inference
     */
    stopInference() {
        this.isInference = false;
    }
    
    /**
     * Process one timestep - uses online learning for instant weight updates
     * @param {Float32Array} theta - Current oscillator phases
     * @returns {{input: number, prediction: number|null, target: number}}
     */
    step(theta) {
        // Get task input/target
        const { input, target } = this.tasks.step();
        this.lastInput = input;
        this.lastTarget = target;
        
        // Set input signal for next simulation step
        this.io.setInputSignal(input);
        // For moving dot, update spatial weights
        if (this.tasks.taskType === 'moving_dot') {
            const x = this.tasks.currentDotX ?? 0.5;
            const y = this.tasks.movingDotY;
            this.io.setMovingDotWeightsNorm(x, y, this.tasks.movingDotWidth, 1.0);
        }
        
        // Extract features from current state
        const features = this.io.extractFeatures(theta);
        this.io.updateHistory(features);
        
        this.currentStep++;
        
        // During warmup, just run without collecting
        if (this.currentStep < this.warmupSteps) {
            return { input, prediction: null, target };
        }
        
        // Get full feature vector with history
        const fullFeatures = this.io.getFullFeatureVector();
        
        if (this.isTraining) {
            // IMPORTANT: Predict BEFORE updating to show true generalization error
            const prediction = this.onlineLearner.predict(fullFeatures);
            
            // Then update weights with this sample
            this.onlineLearner.update(fullFeatures, target);
            
            // Store prediction for plotting
            this.predictions.push(prediction);
            this.targets.push(target);
            if (this.predictions.length > this.maxPlotPoints) {
                this.predictions.shift();
                this.targets.shift();
            }
            
            // Update running NRMSE periodically
            if (this.currentStep % 10 === 0) {
                this.lastNRMSE = this.onlineLearner.getNRMSE();
            }
            
            this.lastPrediction = prediction;
            return { input, prediction, target };
        }
        
        if (this.isInference) {
            // Make prediction
            const prediction = this.onlineLearner.predict(fullFeatures);
            
            // Store for plotting
            this.predictions.push(prediction);
            this.targets.push(target);
            if (this.predictions.length > this.maxPlotPoints) {
                this.predictions.shift();
                this.targets.shift();
            }
            
            this.lastPrediction = prediction;
            return { input, prediction, target };
        }
        
        return { input, prediction: null, target };
    }
    
    /**
     * Get current input signal for injection into simulation
     */
    getInputSignal() {
        return this.io.inputSignal;
    }
    
    /**
     * Get input weights array
     */
    getInputWeights() {
        return this.io.inputWeights;
    }

    setFeatureBudget(maxFeatures) {
        this.maxFeatures = maxFeatures;
        this.io.setFeatureBudget(maxFeatures);
    }

    setHistoryLength(len) {
        this.io.setHistoryLength(len);
    }
    
    /**
     * Get readout mask array
     */
    getReadoutMask() {
        return this.io.readoutMask;
    }
    
    /**
     * Get sample count
     */
    getSampleCount() {
        return this.onlineLearner.getSampleCount();
    }
    
    /**
     * Get current NRMSE
     */
    getNRMSE() {
        return this.lastNRMSE;
    }
    
    /**
     * Resize for new grid
     */
    resize(newGridSize) {
        this.io.resize(newGridSize);
        this.onlineLearner.clear();
        this.predictions = [];
        this.targets = [];
    }
    
    /**
     * Compute test NRMSE
     */
    computeTestNRMSE() {
        if (this.predictions.length < 10) return Infinity;
        
        let mse = 0;
        for (let i = 0; i < this.predictions.length; i++) {
            const err = this.predictions[i] - this.targets[i];
            mse += err * err;
        }
        mse /= this.predictions.length;
        
        const meanY = this.targets.reduce((a, b) => a + b, 0) / this.targets.length;
        let varY = 0;
        for (const y of this.targets) {
            varY += (y - meanY) * (y - meanY);
        }
        varY /= this.targets.length;
        
        if (varY < 1e-10) return Infinity;
        
        return Math.sqrt(mse / varY);
    }
}
