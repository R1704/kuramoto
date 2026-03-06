import { makeRng, normalizeSeed } from '../utils/index.js';

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
