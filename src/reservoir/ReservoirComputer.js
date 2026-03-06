import { ReservoirIO } from './ReservoirIO.js';
import { OnlineLearner } from './OnlineLearner.js';
import { RidgeRegression } from './RidgeRegression.js';
import { RCTasks } from './RCTasks.js';
import { normalizeSeed } from '../utils/index.js';

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
    configure(inputRegion, outputRegion, inputStrength = 1.0, inputWidth = 0.1, outputWidth = 0.1) {
        this.io.setInputRegion(inputRegion, inputWidth, inputStrength);
        this.io.setOutputRegion(outputRegion, outputWidth);
        this.io.clearHistory();
        console.log(
            `RC configured: input=${inputRegion} (w=${inputWidth}), output=${outputRegion} (w=${outputWidth}), readouts=${this.io.numReadouts}`
        );
    }

    setSeed(seed) {
        this.seed = normalizeSeed(seed);
        this.io.setSeed(this.seed);
        this.tasks.setSeed(this.seed);
    }

    setFeatureBudget(maxFeatures) {
        this.maxFeatures = maxFeatures;
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
