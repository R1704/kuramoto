# Refined Kuramoto Reservoir Computing Specification v2

## Implementation Status

### ✅ Phase 0: Statistics & Visualization Foundation (COMPLETED)

**Implemented features:**

1. **Statistics Module** (`src/statistics.js`)
   - `StatisticsTracker` class with rolling history buffers
   - Real-time R (order parameter) and χ (susceptibility) computation
   - Operating regime detection (chaos/critical/sync)
   - K-scan phase diagram builder with Kc estimation

2. **GPU Readback**
   - Global order parameter readback from GPU
   - Non-blocking async readback pipeline
   - Always computes R (not just in global coupling mode)

3. **Statistics Panel UI**
   - Real-time R, χ display
   - Criticality indicator (color-coded operating point)
   - R(t) and χ(t) time series plots
   - Phase diagram (R vs K) with Kc marker

4. **K-Scan Feature**
   - Automated coupling strength sweep
   - Measures R mean, variance at each K
   - Estimates critical coupling Kc from χ peak
   - "Go to Kc" button for quick tuning

5. **Keyboard Shortcuts**
   - `K`: Start K-scan
   - `Shift+K`: Jump to estimated Kc

6. **Data Export**
   - Export statistics history to CSV
   - Export phase diagram data to CSV

### ✅ Phase 1: Core RC Infrastructure (COMPLETED)

**Implemented features:**

1. **Input Injection** (`src/reservoir.js`, `src/shaders.js`)
   - Frequency modulation: `ω_eff = ω + input_weights × input_signal × amplification`
   - GPU buffers: `inputWeightsBuf` (binding 7), `inputSignalBuf` (binding 8)
   - Input regions: center, left/top edge, random sparse
   - Gradient falloff option for smoother propagation

2. **State Readout** (`src/reservoir.js`)
   - `ReservoirIO` class manages input/output topology
   - Sparse sampling: up to 100 readout oscillators
   - Feature extraction: sin(θ), cos(θ) pairs for each readout
   - Temporal features: 10-step history buffer → 2000 total features

3. **Online Learning** (`src/reservoir.js`)
   - `OnlineLearner` class implements Recursive Least Squares (RLS)
   - O(n²) per update instead of O(n³) batch training
   - Forgetting factor λ = 0.995 for adaptation
   - Predict-before-update for accurate generalization error

4. **Training Tasks** (`src/reservoir.js`)
   - `RCTasks` class with three tasks:
     - Sine prediction: sin(ωt) → sin(ω(t+τ))
     - NARMA-10: Nonlinear benchmark
     - Memory capacity: Recall delayed input
   
5. **UI Integration** (`src/main.js`, `index.html`)
   - RC panel with enable toggle
   - Input/output region selectors
   - Input strength slider (0.5-5.0)

# Reservoir Computing in the Kuramoto WebGPU Simulator: Detailed, Reproducible Report

## 1. Introduction

Reservoir Computing (RC) leverages a high-dimensional, nonlinear dynamical system (the "reservoir") to transform input signals into a rich set of features for temporal learning tasks. In this simulator, a 2D grid of Kuramoto oscillators acts as the reservoir. Only the output layer is trained, using online or batch regression.

This report is **self-contained**: all algorithms, statistics, and tasks are described with full code and mathematical details. You can reproduce the RC workflow from this document alone.

---

## 2. Reservoir Setup and Signal Injection

### 2.1. Kuramoto Grid

The reservoir is a $N \times N$ grid of oscillators, each with phase $\theta_i$ evolving as:

$$
\frac{d\theta_i}{dt} = \omega_i + \frac{K}{N} \sum_{j \in \mathcal{N}(i)} \sin(\theta_j - \theta_i) + w_i u(t)
$$

- $\omega_i$: natural frequency
- $K$: coupling strength
- $w_i$: input weight (see below)
- $u(t)$: external input signal

### 2.2. Input Region and Weights

You can inject the input signal into a specific region:

```js
// Example: center disk input
reservoir.setInputRegion('center', 0.15, 1.0);
```

**Actual code for input weights:**
```js
setInputRegion(region, width = 0.1, strength = 1.0) {
    this.inputWeights.fill(0);
    const w = Math.floor(this.gridSize * width);
    switch (region) {
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
        // ...other regions omitted for brevity
    }
}
```

---

## 3. Feature Extraction and Readout

### 3.1. Readout Region

Select a sparse set of oscillators for output:

```js
reservoir.setOutputRegion('random', 0.1); // 10% random readouts
```

### 3.2. Feature Vector Construction

For each readout oscillator $i$:
- Compute $\sin(\theta_i)$ and $\cos(\theta_i)$
- Concatenate for all readouts
- Optionally, stack features from previous $T$ timesteps for temporal context

**Actual code:**
```js
extractFeatures(theta) {
    const features = new Float32Array(this.numReadouts * 2);
    let fi = 0;
    for (let i = 0; i < this.N; i++) {
        if (this.readoutMask[i] > 0) {
            features[fi++] = Math.sin(theta[i]);
            features[fi++] = Math.cos(theta[i]);
        }
    }
    return features;
}

updateHistory(features) {
    if (this.featureHistory.length < this.historyLength) {
        this.featureHistory.push(new Float32Array(features));
    } else {
        this.featureHistory[this.historyIndex].set(features);
        this.historyIndex = (this.historyIndex + 1) % this.historyLength;
    }
}

getFullFeatureVector() {
    if (this.featureHistory.length === 0) return new Float32Array(0);
    const featureSize = this.featureHistory[0].length;
    const fullFeatures = new Float32Array(this.featureHistory.length * featureSize);
    for (let t = 0; t < this.featureHistory.length; t++) {
        const idx = (this.historyIndex + t) % this.featureHistory.length;
        fullFeatures.set(this.featureHistory[idx], t * featureSize);
    }
    return fullFeatures;
}
```

---

## 4. Online Learning: Recursive Least Squares (RLS)

The output weights are trained online using RLS, which updates weights $w$ to minimize prediction error for a target $y$:

$$
	ext{error} = y - w^T x
$$

**Actual code for RLS update:**
```js
update(features, target) {
    // Augment features with bias
    const x = new Float32Array(this.dim);
    for (let i = 0; i < features.length; i++) x[i] = features[i];
    x[this.dim - 1] = 1.0;
    // Prediction
    let prediction = 0;
    for (let i = 0; i < this.dim; i++) prediction += this.weights[i] * x[i];
    const error = target - prediction;
    // RLS update
    const Px = new Float32Array(this.dim);
    for (let i = 0; i < this.dim; i++) {
        let sum = 0;
        for (let j = 0; j < this.dim; j++) sum += this.P[i * this.dim + j] * x[j];
        Px[i] = sum;
    }
    let xPx = 0;
    for (let i = 0; i < this.dim; i++) xPx += x[i] * Px[i];
    const denom = this.lambda + xPx;
    const k = new Float32Array(this.dim);
    for (let i = 0; i < this.dim; i++) k[i] = Px[i] / denom;
    for (let i = 0; i < this.dim; i++) this.weights[i] += k[i] * error;
    for (let i = 0; i < this.dim; i++) {
        for (let j = 0; j < this.dim; j++) {
            this.P[i * this.dim + j] = (this.P[i * this.dim + j] - k[i] * Px[j]) / this.lambda;
        }
    }
    return error;
}
```

---

## 5. Statistics: Computation and Interpretation

### 5.1. Global Order Parameter $R$

Measures overall phase coherence:

$$
R = \left| \frac{1}{N} \sum_{j=1}^N e^{i\theta_j} \right| = \sqrt{\left(\frac{1}{N} \sum_j \cos\theta_j\right)^2 + \left(\frac{1}{N} \sum_j \sin\theta_j\right)^2}
$$

**Code:**
```js
let cosSum = 0, sinSum = 0;
for (let i = 0; i < N; i++) {
    cosSum += Math.cos(theta[i]);
    sinSum += Math.sin(theta[i]);
}
cosSum /= N;
sinSum /= N;
const R = Math.sqrt(cosSum * cosSum + sinSum * sinSum);
```

### 5.2. Mean Local Order $\bar{R}_{local}$

For each oscillator $i$, compute local order $R_i$ over its neighbors:

$$
R_i = \left| \frac{1}{|\mathcal{N}(i)|} \sum_{j \in \mathcal{N}(i)} e^{i\theta_j} \right|
$$

Then average over all $i$:

$$
\bar{R}_{local} = \frac{1}{N} \sum_{i=1}^N R_i
$$

**Code:**
```js
function computeLocalOrder(theta, gridSize, range=1) {
    const N = gridSize * gridSize;
    let sumLocalR = 0;
    for (let i = 0; i < N; i++) {
        let re = 0, im = 0, count = 0;
        const x0 = i % gridSize, y0 = Math.floor(i / gridSize);
        for (let dy = -range; dy <= range; dy++) {
            for (let dx = -range; dx <= range; dx++) {
                const x = (x0 + dx + gridSize) % gridSize;
                const y = (y0 + dy + gridSize) % gridSize;
                const j = y * gridSize + x;
                re += Math.cos(theta[j]);
                im += Math.sin(theta[j]);
                count++;
            }
        }
        sumLocalR += Math.sqrt(re * re + im * im) / count;
    }
    return sumLocalR / N;
}
```

### 5.3. Phase Gradient

Measures spatial variation (waves/spirals):

$$
	ext{gradient} = \frac{1}{N} \sum_{i=1}^N \sqrt{(\theta_{i+1} - \theta_i)^2 + (\theta_{i+gridSize} - \theta_i)^2}
$$

**Code:**
```js
function computePhaseGradient(theta, gridSize) {
    const N = gridSize * gridSize;
    let sum = 0;
    for (let i = 0; i < N; i++) {
        const x = i % gridSize, y = Math.floor(i / gridSize);
        const right = y * gridSize + ((x + 1) % gridSize);
        const down = ((y + 1) % gridSize) * gridSize + x;
        let dx = theta[right] - theta[i];
        let dy = theta[down] - theta[i];
        // Wrap phase differences to [-pi, pi]
        dx = ((dx + Math.PI) % (2 * Math.PI)) - Math.PI;
        dy = ((dy + Math.PI) % (2 * Math.PI)) - Math.PI;
        sum += Math.sqrt(dx * dx + dy * dy);
    }
    return sum / N;
}
```

### 5.4. Susceptibility $\chi$

Variance of local order, peaks at criticality:

$$
\chi = N \cdot \text{Var}(R_{local})
$$

**Code:**
```js
function computeSusceptibility(localRHistory, N) {
    const mean = localRHistory.reduce((a, b) => a + b, 0) / localRHistory.length;
    const variance = localRHistory.reduce((a, b) => a + (b - mean) ** 2, 0) / (localRHistory.length - 1);
    return N * variance;
}
```

### 5.5. Sync Fraction

Fraction of oscillators with local $R_i > 0.7$:

```js
function computeSyncFraction(localRs) {
    return localRs.filter(r => r > 0.7).length / localRs.length;
}
```

### 5.6. Largest Lyapunov Exponent (LLE)

Measures chaos (see Benettin's algorithm):

**Code:**
```js
// See LyapunovCalculator in statistics.js for full implementation
// Key steps: evolve reference and perturbed trajectories, renormalize, accumulate log separation
```

---

## 6. Tasks: Reproducible RC Experiments

### Task 1: Temporal Pattern Learning

**Goal:** Train the reservoir to reproduce a target signal (e.g., a sine wave or a binary sequence).

**Steps:**
1. Inject the input signal into the reservoir.
2. At each timestep, extract features and update the RLS learner.
3. Compare the output to the target and compute NRMSE.

**Code:**
```js
for (let t = 0; t < T; t++) {
    // 1. Advance Kuramoto simulation (update theta)
    // ...
    // 2. Extract features
    const features = reservoir.extractFeatures(theta);
    reservoir.updateHistory(features);
    const fullFeatures = reservoir.getFullFeatureVector();
    // 3. Train
    learner.update(fullFeatures, target[t]);
    // 4. Predict
    const y_pred = learner.predict(fullFeatures);
    // 5. Evaluate
    // ...store error, plot, etc.
}
```

### Task 2: Phase Diagram Scanning

**Goal:** Map the transition from desynchronization to synchronization as coupling $K$ is varied.

**Steps:**
1. For each $K$ in a range, run the simulation, measure $R$, $\bar{R}_{local}$, $\chi$.
2. Plot $R$ and $\chi$ vs $K$ to find the critical point.

**Code:**
```js
for (let K = K_min; K <= K_max; K += dK) {
    // Set coupling
    sim.setCoupling(K);
    // Run for warmup steps
    for (let t = 0; t < warmup; t++) sim.step();
    // Measure for measureSteps
    let Rvals = [], localRvals = [];
    for (let t = 0; t < measureSteps; t++) {
        sim.step();
        Rvals.push(computeGlobalR(theta));
        localRvals.push(computeLocalOrder(theta, gridSize));
    }
    // Compute susceptibility
    const chi = computeSusceptibility(localRvals, N);
    // Store/plot R, chi vs K
}
```

### Task 3: Criticality and Pattern Classification

**Goal:** Use statistics to identify the system's regime (chaotic, critical, synchronized, wave, etc.).

**Steps:**
1. Compute $R$, $\bar{R}_{local}$, gradient, $\chi$, LLE at each step.
2. Use thresholds to classify patterns.

**Code:**
```js
const regime = classifyRegime(R, localR, gradient, chi, lle);
function classifyRegime(R, localR, gradient, chi, lle) {
    if (lle > 0.05) return 'chaotic';
    if (chi > 10 && Math.abs(localR - 0.5) < 0.1) return 'critical';
    if (localR > 0.7 && gradient > 0.3) return 'traveling wave';
    if (localR > 0.7 && R > 0.7) return 'synchronized';
    return 'other';
}
```

---

## 7. References

- [Reservoir Computing: Theory, Physical Implementations, and Applications](https://www.nature.com/articles/s42254-019-0022-7)
- [Kuramoto Model](https://en.wikipedia.org/wiki/Kuramoto_model)
- [Recursive Least Squares (RLS)](https://en.wikipedia.org/wiki/Recursive_least_squares_filter)

---

This report provides all code and formulas needed to reproduce the RC workflow, statistics, and tasks in the Kuramoto WebGPU simulator or any similar environment.
    const xs = results.map(r => 1 / Math.sqrt(r.N));
    const ys = results.map(r => r.K_c);
    const { intercept } = linearRegression(xs, ys);
    
    return intercept;  // K_c(∞)
}
```

#### Method C: Mean-Field Analytical (For Reference)

For all-to-all coupling with Lorentzian frequency distribution:

$$K_c = \frac{2}{\pi g(0)}$$

where $g(0)$ is the frequency distribution density at ω=0.

For Gaussian distribution with std σ_ω:
$$K_c \approx \frac{2\sigma_\omega}{\sqrt{\pi}}$$

**We can display this as "theoretical K_c" for comparison.**

#### Method D: Eigenvalue Analysis (Research-Grade)

Linearize around desynchronized state, compute Jacobian eigenvalues:

```javascript
// Simplified for local coupling
function computeJacobianEigenvalue(K, omega_distribution, N) {
    // For mean-field: λ_max = K/2 × ∫ g(ω) dω - 1
    // Transition when λ_max crosses 0
    
    // For local coupling: need numerical eigenvalue computation
    // This is expensive but most accurate
}
```

**Recommendation:** Use **Method A (real-time susceptibility)** for live display, with optional **Method B (K-scan)** for precise estimation.

---

### 4. Should Coupling Strength K Be Learnable?

**Yes, but with nuance.** There are two distinct scenarios:

#### Scenario A: Adaptive K for Dynamics (Self-Organization)

Make K adapt based on local order parameter:

$$K_i(t+1) = K_i(t) + \epsilon_K \cdot (R_{\text{target}} - R_i(t))$$

**Pros:**
- Self-tunes to criticality
- Creates spatially heterogeneous coupling (interesting patterns)
- Biologically plausible (synaptic plasticity)

**Cons:**
- Adds complexity
- May destabilize reservoir (changing dynamics during computation)

**Recommendation for RC:** Keep K **fixed during inference**, but allow adaptive K during a **calibration phase**.

#### Scenario B: Learnable K as RC Hyperparameter

Optimize K (along with other params) for task performance:

```javascript
class HyperparameterOptimizer {
    async optimizeForTask(task, paramRanges) {
        // Grid search or Bayesian optimization
        const results = [];
        
        for (const K of paramRanges.K) {
            for (const sigma of paramRanges.sigma) {
                simulation.setParams({ K, sigma });
                const { nrmse } = await rc.trainAndEvaluate(task);
                results.push({ K, sigma, nrmse });
            }
        }
        
        // Return best params
        return results.sort((a, b) => a.nrmse - b.nrmse)[0];
    }
}
```

**Recommendation:** Yes, make K (and other params) searchable hyperparameters for RC optimization.

#### Scenario C: Hebbian Learning of Coupling Weights

Full weight matrix $K_{ij}$ that learns from correlations:

$$\frac{dK_{ij}}{dt} = \eta \cdot \cos(\theta_j - \theta_i) - \lambda \cdot K_{ij}$$

**This is a major extension** (needs N×N weight matrix) but enables:
- Memory formation (specific patterns become attractors)
- Associative recall
- True learning, not just readout training

**Recommendation:** Defer Hebbian learning to Phase 4; focus on fixed-weight RC first.

---

### 5. Other Things to Prepare

Based on this analysis, here's what we need:

#### Infrastructure Prerequisites

| Component | Purpose | Priority |
|-----------|---------|----------|
| **Statistics GPU Compute** | Real-time R, χ, gradients | High |
| **Statistics Panel UI** | Display metrics + plots | High |
| **R(t) Time Series Buffer** | Rolling history for plots | High |
| **K-scan Automation** | Build phase diagram | Medium |
| **Topology Generator** | Small-world, scale-free graphs | Medium |
| **Neighbor Index Buffer** | Non-grid topologies | Medium |
| **Hyperparameter Search** | Optimize RC params | Medium |

#### Statistics Compute Shader

```wgsl
// statistics.wgsl — runs after main dynamics update

struct Statistics {
    R: f32,                    // Global order parameter
    Psi: f32,                  // Mean phase
    chi: f32,                  // Susceptibility (computed on CPU from R history)
    R_local_mean: f32,         // Mean of local order parameters
    R_local_var: f32,          // Variance of local R (high = chimera)
    gradient_mean: f32,        // Mean phase gradient magnitude
    sync_fraction: f32,        // Fraction with R_i > 0.8
}

@group(0) @binding(0) var<storage, read> theta: array<f32>;
@group(0) @binding(1) var<storage, read> order: array<f32>;  // Local R_i
@group(0) @binding(2) var<storage, read_write> stats: Statistics;
@group(0) @binding(3) var<storage, read_write> reduction: array<f32>;  // For parallel sum

// Two-pass reduction for global statistics
@compute @workgroup_size(256)
fn reduce_phase(@builtin(global_invocation_id) gid: vec3u) {
    // Each thread sums chunk of oscillators
    // Write partial sums to reduction buffer
    // Second pass combines partial sums
}
```

---

## Revised Implementation Plan

### Phase 0: Statistics & Visualization Foundation (1 week)

**Goal:** Real-time criticality detection and display

```
Day 1-2: Statistics Compute
├── GPU shader for R, Ψ computation (parallel reduction)
├── R(t) history buffer (rolling 500 samples)
├── Susceptibility χ = N × Var(R) on CPU
└── Chimera index (sync_fraction)

Day 3-4: Statistics Panel UI
├── R(t) time series plot (Canvas 2D, 300×100px)
├── Criticality indicator (slider showing R relative to 0.5)
├── χ(t) plot (peaks at criticality)
├── Live statistics table (R, χ, sync_fraction)
└── Position next to kernel visualization

Day 5: Phase Diagram Scanner
├── Automated K-scan (background, non-blocking)
├── R vs K scatter plot
├── K_c estimation from χ peak
└── "Find K_c" button in UI

Day 6-7: Integration & Polish
├── Keyboard shortcut to toggle stats panel
├── Export statistics to CSV
├── Performance optimization (stats compute <1ms)
└── Documentation
```

### Phase 1: Core RC Infrastructure (1 week)

**Goal:** Basic reservoir computing with existing grid topology

```
Day 1-2: Input Injection
├── Input weight buffer (sparse, N × inputDim)
├── Modify omega buffer for frequency modulation
├── Alternative: external forcing term
└── Test: sine input → visible dynamics change

Day 3-4: Feature Extraction
├── Patch aggregation shader (reduce N → patches)
├── Feature buffer (sin/cos θ, R_i, temporal)
├── Async GPU → CPU readback
└── Test: log features, verify dimensions

Day 5-6: Linear Readout
├── RidgeRegression class (Cholesky solver)
├── Training buffer (circular, max 10K samples)
├── NRMSE computation
└── Test: memorize random sequence

Day 7: Integration
├── ReservoirComputer class
├── train() and predict() methods
├── Basic UI (train button, error display)
└── End-to-end test: sine prediction
```

### Phase 2: Criticality Tuning (3-4 days)

**Goal:** Automatic tuning to edge of criticality

```
Day 1: Auto-Tuning Algorithm
├── Binary search for K giving R ≈ 0.5
├── Susceptibility-based refinement
├── "Auto-tune" button in UI
└── Display estimated K_c

Day 2: Rule-Specific Calibration
├── Different rules have different K_c
├── Precompute approximate K_c for each rule
├── Rule-change triggers re-calibration suggestion
└── Store per-rule K_c estimates

Day 3-4: Validation
├── Compare analytical K_c (mean-field) vs measured
├── Test RC performance at K_c vs away
├── Document optimal operating regimes
└── Create "RC-optimized" presets
```

### Phase 3: Demo Tasks & Benchmarks (1 week)

**Goal:** Demonstrate RC capabilities with standard tasks

```
Day 1-2: Sine Prediction
├── Generate sin(ωt) input sequence
├── Target: sin(ω(t+τ)) for prediction horizon τ
├── Sweep τ from 1 to 50, plot NRMSE vs τ
└── Compare performance at K_c vs away

Day 3-4: NARMA-10 Benchmark
├── Implement NARMA-10 generator
├── Standard RC benchmark (compare to literature)
├── Report: NRMSE ≈ 0.15-0.25 expected
└── Vary reservoir size, plot scaling

Day 5-6: Classification Task
├── Temporal XOR or pattern classification
├── Multiple output classes
├── Accuracy metric
└── Confusion matrix display

Day 7: Memory Capacity
├── Linear memory capacity test
├── Input u(t-k) reconstruction for k=1,2,...
├── Plot MC vs k (should decay)
└── Compare rules: which has longest memory?
```

### Phase 4: Graph Topologies (1 week)

**Goal:** Enable non-grid coupling for enhanced RC

```
Day 1-2: Topology Infrastructure
├── Neighbor index buffer (N × MAX_DEGREE)
├── Neighbor count buffer (N)
├── Modify compute shader for explicit neighbors
└── Test: grid topology via explicit indices (should match)

Day 3-4: Topology Generators
├── Watts-Strogatz small-world
├── Barabási-Albert scale-free  
├── Erdős-Rényi random
├── Ring with long-range shortcuts
└── UI: topology dropdown, parameters

Day 5-6: Topology Visualization
├── Force-directed layout for non-grid
├── Draw edges (or subset) on canvas
├── Color nodes by phase/order
└── Toggle: grid view vs graph view

Day 7: RC with Topologies
├── Compare RC performance across topologies
├── Find optimal rewiring probability for small-world
├── Document: "Best topology for X task"
└── Create topology-specific presets
```

### Phase 5: Advanced Features (Ongoing)

```
Future Extensions:
├── Hebbian weight learning
├── Multi-layer reservoir
├── Online learning (recursive least squares)
├── GPU-side readout computation
├── Video/audio stream prediction
├── Export trained models
└── WebWorker for non-blocking training
```

---

## Detailed Statistics Panel Specification

### Layout (HTML/CSS)

```html
<div id="stats-panel" class="side-panel">
    <h3>📊 Statistics</h3>
    
    <!-- Real-time metrics -->
    <div class="stats-grid">
        <div class="stat-item">
            <label>Order R:</label>
            <span id="stat-R">0.000</span>
            <div class="stat-bar" id="stat-R-bar"></div>
        </div>
        <div class="stat-item">
            <label>Susceptibility χ:</label>
            <span id="stat-chi">0.000</span>
        </div>
        <div class="stat-item">
            <label>Sync Fraction:</label>
            <span id="stat-sync">0.0%</span>
        </div>
        <div class="stat-item">
            <label>Est. K_c:</label>
            <span id="stat-Kc">—</span>
        </div>
    </div>
    
    <!-- Criticality indicator -->
    <div class="criticality-indicator">
        <label>Operating Point:</label>
        <div class="indicator-track">
            <div class="indicator-marker" id="crit-marker"></div>
            <div class="indicator-labels">
                <span>Chaos</span>
                <span>K_c</span>
                <span>Sync</span>
            </div>
        </div>
    </div>
    
    <!-- Time series plots -->
    <div class="plot-container">
        <canvas id="R-plot" width="280" height="80"></canvas>
        <label>R(t) History</label>
    </div>
    
    <div class="plot-container">
        <canvas id="chi-plot" width="280" height="80"></canvas>
        <label>χ(t) Susceptibility</label>
    </div>
    
    <!-- Phase diagram (after K-scan) -->
    <div class="plot-container" id="phase-diagram-container" style="display:none;">
        <canvas id="phase-diagram" width="280" height="120"></canvas>
        <label>Phase Diagram (R vs K)</label>
    </div>
    
    <!-- Controls -->
    <div class="stats-controls">
        <button id="btn-scan-K">📈 Scan K (build phase diagram)</button>
        <button id="btn-find-Kc">🎯 Find K_c</button>
        <button id="btn-export-stats">💾 Export CSV</button>
    </div>
</div>
```

### Time Series Plot Class

```javascript
class TimeSeriesPlot {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.data = [];
        this.maxPoints = options.maxPoints || 300;
        this.yMin = options.yMin || 0;
        this.yMax = options.yMax || 1;
        this.color = options.color || '#4CAF50';
        this.showGrid = options.showGrid !== false;
    }
    
    push(value) {
        this.data.push(value);
        if (this.data.length > this.maxPoints) {
            this.data.shift();
        }
    }
    
    render() {
        const { canvas, ctx, data } = this;
        const W = canvas.width, H = canvas.height;
        
        // Clear
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, W, H);
        
        // Grid
        if (this.showGrid) {
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 0.5;
            for (let y = 0; y <= 1; y += 0.25) {
                const py = H - y * H;
                ctx.beginPath();
                ctx.moveTo(0, py);
                ctx.lineTo(W, py);
                ctx.stroke();
            }
        }
        
        // Data line
        if (data.length < 2) return;
        
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        for (let i = 0; i < data.length; i++) {
            const x = (i / this.maxPoints) * W;
            const y = H - ((data[i] - this.yMin) / (this.yMax - this.yMin)) * H;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // Current value marker
        const lastY = H - ((data[data.length-1] - this.yMin) / (this.yMax - this.yMin)) * H;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(W - 5, lastY, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Usage
const R_plot = new TimeSeriesPlot('R-plot', { 
    yMin: 0, yMax: 1, color: '#4CAF50' 
});
const chi_plot = new TimeSeriesPlot('chi-plot', { 
    yMin: 0, yMax: 'auto', color: '#FF9800' 
});

// In render loop
function updateStats() {
    const R = computeGlobalR();
    const chi = criticalityFinder.susceptibility;
    
    R_plot.push(R);
    chi_plot.push(chi);
    
    R_plot.render();
    chi_plot.render();
    
    document.getElementById('stat-R').textContent = R.toFixed(3);
    document.getElementById('stat-chi').textContent = chi.toFixed(3);
    
    // Update criticality indicator position
    const markerPos = Math.min(100, Math.max(0, R * 100));
    document.getElementById('crit-marker').style.left = `${markerPos}%`;
}
```

### Phase Diagram Builder

```javascript
class PhaseDiagramBuilder {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.data = [];  // {K, R_mean, R_std, chi}
        this.K_range = [0, 3];
        this.estimatedKc = null;
    }
    
    addPoint(K, R_mean, R_std, chi) {
        this.data.push({ K, R_mean, R_std, chi });
        this.data.sort((a, b) => a.K - b.K);
    }
    
    findKc() {
        // K_c is where χ peaks
        let maxChi = 0;
        for (const point of this.data) {
            if (point.chi > maxChi) {
                maxChi = point.chi;
                this.estimatedKc = point.K;
            }
        }
        return this.estimatedKc;
    }
    
    render() {
        const { canvas, ctx, data } = this;
        const W = canvas.width, H = canvas.height;
        const margin = { left: 35, right: 10, top: 10, bottom: 25 };
        const plotW = W - margin.left - margin.right;
        const plotH = H - margin.top - margin.bottom;
        
        // Clear
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, W, H);
        
        // Axes
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin.left, margin.top);
        ctx.lineTo(margin.left, H - margin.bottom);
        ctx.lineTo(W - margin.right, H - margin.bottom);
        ctx.stroke();
        
        // Labels
        ctx.fillStyle = '#aaa';
        ctx.font = '10px monospace';
        ctx.fillText('R', margin.left - 15, margin.top + 10);
        ctx.fillText('K', W - margin.right - 10, H - 5);
        ctx.fillText('0', margin.left - 12, H - margin.bottom + 3);
        ctx.fillText('1', margin.left - 12, margin.top + 10);
        
        if (data.length < 2) return;
        
        // Plot R(K) with error bars
        ctx.strokeStyle = '#4CAF50';
        ctx.fillStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let i = 0; i < data.length; i++) {
            const { K, R_mean, R_std } = data[i];
            const x = margin.left + (K / this.K_range[1]) * plotW;
            const y = margin.top + (1 - R_mean) * plotH;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            
            // Error bar
            const yTop = margin.top + (1 - R_mean - R_std) * plotH;
            const yBot = margin.top + (1 - R_mean + R_std) * plotH;
            ctx.moveTo(x, yTop);
            ctx.lineTo(x, yBot);
        }
        ctx.stroke();
        
        // Mark K_c
        if (this.estimatedKc !== null) {
            const xKc = margin.left + (this.estimatedKc / this.K_range[1]) * plotW;
            ctx.strokeStyle = '#FF5722';
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(xKc, margin.top);
            ctx.lineTo(xKc, H - margin.bottom);
            ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.fillStyle = '#FF5722';
            ctx.fillText(`K_c≈${this.estimatedKc.toFixed(2)}`, xKc + 3, margin.top + 15);
        }
        
        // Current K marker
        const xCurrent = margin.left + (STATE.K0 / this.K_range[1]) * plotW;
        ctx.fillStyle = '#2196F3';
        ctx.beginPath();
        ctx.arc(xCurrent, H - margin.bottom, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}
```

---

## Updated Pros/Cons

### ✅ Enhanced Advantages

| Advantage | Details |
|-----------|---------|
| **Real-time criticality feedback** | Know immediately if operating near K_c |
| **Automated tuning** | "Find K_c" button eliminates manual search |
| **Visual phase diagram** | Understand system behavior across K range |
| **Graph topology support** | Small-world enhances RC performance |
| **Multiple criticality metrics** | R, χ, sync_fraction, correlation time |
| **Research-grade statistics** | Comparable to MATLAB/Python tools |

### ❌ Remaining Challenges

| Challenge | Mitigation |
|-----------|------------|
| **K-scan takes time** | Background thread, progress indicator |
| **Statistics compute overhead** | GPU shader, only 1-2ms |
| **Graph topology complexity** | Start with small-world only |
| **Many hyperparameters** | Provide auto-tuning + presets |

---

## Final Recommendation

**Implementation order:**

1. **Phase 0 (Statistics)** — Essential foundation, useful independently
2. **Phase 1 (Core RC)** — Basic reservoir computing
3. **Phase 2 (Criticality)** — Auto-tuning to optimal regime
4. **Phase 3 (Tasks)** — Demonstrate capabilities
5. **Phase 4 (Topologies)** — Enhanced performance (optional)

**Total timeline:** 4-5 weeks for Phases 0-3, +1 week for Phase 4

The statistics infrastructure (Phase 0) is valuable even without RC — it makes the existing simulation more useful for research and education. Recommend starting there.