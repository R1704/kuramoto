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
   - Train / Stop & Test buttons
   - Real-time NRMSE display
   - Live prediction vs target plot

6. **GPU Integration** (`src/simulation.js`)
   - `writeInputWeights(weights)` → GPU storage buffer
   - `setInputSignal(value)` → GPU uniform buffer
   - `readTheta()` → async theta readback for feature extraction
   - `thetaReadPending` guard to prevent overlapping reads

### 🔲 Phase 2: Criticality Tuning (Not Started)
### 🔲 Phase 3: Demo Tasks & Benchmarks (Partially Complete - basic tasks done)
### 🔲 Phase 4: Graph Topologies (Not Started)

---

## Answers to Your Questions

### 1. Would Different Graph Topologies Help or Be Interesting?

**Yes, absolutely.** Different topologies would significantly enhance RC capabilities:

| Topology | RC Benefit | Implementation Complexity |
|----------|-----------|---------------------------|
| **Small-World** (Watts-Strogatz) | Long-range shortcuts improve memory capacity | Medium |
| **Scale-Free** (Barabási-Albert) | Hub nodes act as feature integrators | Medium |
| **Random** (Erdős-Rényi) | Baseline comparison, tunable connectivity | Easy |
| **Modular** (Community structure) | Natural multi-scale features | Medium |
| **Ring + Shortcuts** | Classic chimera topology from literature | Easy |

**For RC specifically:**
- **Small-world** is ideal: high clustering (local feature extraction) + short path lengths (fast information propagation)
- **Scale-free** creates natural hierarchy: hubs aggregate information from many oscillators
- Literature shows reservoir performance peaks at intermediate rewiring probability (~0.1-0.3)

**Implementation approach:**
```javascript
// Neighbor index buffer instead of implicit grid
// Each oscillator stores indices of its neighbors
neighborIdxBuf: N × MAX_DEGREE × 4 bytes
neighborCountBuf: N × 4 bytes

// Compute shader reads explicit neighbor list
for (var n = 0u; n < neighbor_count[i]; n++) {
    let j = neighbor_idx[i * MAX_DEGREE + n];
    coupling += sin(theta[j] - theta[i]);
}
```

**Recommendation:** Add topology support as a **prerequisite** for RC—it's useful independently and enhances RC capabilities.

---

### 2. Statistics Panel Design

**Yes, these should be visible in real-time alongside the kernel visualization.**

#### Proposed Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                        MAIN CANVAS                               │
│                    (Kuramoto Simulation)                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  KERNEL PROFILE  │  │  ORDER PARAMETER │  │  PHASE DIAGRAM   │
│   (Existing)     │  │   TIME SERIES    │  │   (K vs R)       │
│                  │  │                  │  │                  │
│   ╱╲             │  │  R(t)            │  │     ●            │
│  ╱  ╲────        │  │   ╱╲  ╱╲        │  │    ╱             │
│ ╱      ╲╱        │  │  ╱  ╲╱  ╲       │  │   ╱  ←current    │
│                  │  │ ╱        ╲      │  │  ╱               │
│  σ=1.2  β=0.6   │  │ 0────────────t  │  │ K_c              │
└──────────────────┘  └──────────────────┘  └──────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   CRITICALITY    │  │   SUSCEPTIBILITY │  │  FEATURE SPACE   │
│   INDICATOR      │  │   χ(t)           │  │  (RC Mode)       │
│                  │  │                  │  │                  │
│   ◀──●──────▶    │  │      ╱╲         │  │  ●   ●           │
│   chaos│ sync    │  │     ╱  ╲        │  │    ●   ●  ●      │
│        │         │  │ ───╱    ╲───    │  │  ●    ●          │
│   K=0.8 (≈K_c)   │  │                  │  │  [PCA of φ(t)]   │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

#### Statistics to Display

| Statistic | Formula | Interpretation |
|-----------|---------|----------------|
| **Global Order R** | $R = \|\frac{1}{N}\sum e^{i\theta_i}\|$ | Synchronization level (0=chaos, 1=sync) |
| **Mean Phase Ψ** | $\Psi = \arg(\frac{1}{N}\sum e^{i\theta_i})$ | Collective phase |
| **Susceptibility χ** | $\chi = N \cdot \text{Var}(R)$ | Peaks at criticality |
| **Correlation Time τ_c** | Autocorrelation decay | Long at criticality |
| **Lyapunov Exponent λ** | Trajectory divergence rate | Positive = chaos |
| **Chimera Index** | $\frac{|\text{sync region}|}{N}$ | Fraction synchronized |
| **Effective K_c** | Estimated critical coupling | From R(K) curve |

---

### 3. How Do We Find Criticality?

Given our real-time GPU simulation, here are the **practical methods** ranked by feasibility:

#### Method A: Order Parameter Transition (Easiest, Real-Time)

```javascript
class CriticalityFinder {
    constructor() {
        this.R_history = [];        // R values over time
        this.K_scan_results = [];   // {K, R_mean, R_var} pairs
        this.windowSize = 200;
    }
    
    // Real-time: track R variance
    updateRealTime(R) {
        this.R_history.push(R);
        if (this.R_history.length > this.windowSize) {
            this.R_history.shift();
        }
    }
    
    get susceptibility() {
        // χ = N × Var(R) — peaks at K_c
        const mean = this.R_history.reduce((a,b) => a+b, 0) / this.R_history.length;
        const variance = this.R_history.reduce((a,b) => a + (b-mean)**2, 0) / this.R_history.length;
        return STATE.N * variance;
    }
    
    get isNearCritical() {
        // Heuristic: R ≈ 0.5 AND high variance
        const meanR = this.R_history.reduce((a,b) => a+b, 0) / this.R_history.length;
        return Math.abs(meanR - 0.5) < 0.15 && this.susceptibility > 0.1;
    }
    
    // Offline: scan K to build phase diagram
    async scanK(simulation, K_min = 0.1, K_max = 2.5, steps = 25) {
        this.K_scan_results = [];
        
        for (let i = 0; i <= steps; i++) {
            const K = K_min + (K_max - K_min) * i / steps;
            simulation.setK(K);
            
            // Warmup
            for (let t = 0; t < 500; t++) await simulation.step();
            
            // Measure
            const R_samples = [];
            for (let t = 0; t < 300; t++) {
                await simulation.step();
                R_samples.push(simulation.getGlobalR());
            }
            
            const R_mean = R_samples.reduce((a,b) => a+b, 0) / R_samples.length;
            const R_var = R_samples.reduce((a,b) => a + (b - R_mean)**2, 0) / R_samples.length;
            
            this.K_scan_results.push({ K, R_mean, R_var, chi: STATE.N * R_var });
        }
        
        return this.estimateKc();
    }
    
    estimateKc() {
        // K_c is where susceptibility χ peaks
        let maxChi = 0, K_c = 0;
        for (const {K, chi} of this.K_scan_results) {
            if (chi > maxChi) {
                maxChi = chi;
                K_c = K;
            }
        }
        return K_c;
    }
}
```

#### Method B: Finite-Size Scaling (More Accurate)

For finite N, the transition is smoothed. True K_c can be estimated by:

$$K_c(N) = K_c(\infty) + a \cdot N^{-1/2}$$

```javascript
async estimateKcInfinite(simulation, gridSizes = [32, 64, 128, 256]) {
    const results = [];
    
    for (const gridSize of gridSizes) {
        simulation.resizeGrid(gridSize);
        const K_c = await this.scanK(simulation);
        results.push({ N: gridSize * gridSize, K_c });
    }
    
    // Linear fit: K_c vs N^(-1/2)
    // K_c(∞) is y-intercept
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