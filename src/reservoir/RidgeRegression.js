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
