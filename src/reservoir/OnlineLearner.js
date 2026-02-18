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
