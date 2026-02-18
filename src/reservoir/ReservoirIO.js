import { makeRng, normalizeSeed } from '../utils/index.js';

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
