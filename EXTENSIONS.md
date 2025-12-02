# 🚀 Kuramoto Simulation Extensions Roadmap# 🚀 Comprehensive Extensions for Kuramoto Dynamics



A prioritized list of potential extensions for the Kuramoto oscillator simulation, ranked by multiple criteria to guide development decisions.This document outlines advanced extensions to move beyond the basic 2D grid of coupled phase oscillators. We examine four major directions, each with increasing complexity and biological/computational relevance.



------



## 📊 Extension Ranking Summary## **Table of Contents**



| Rank | Extension | Difficulty | Impact | Novelty | Time Est. | Priority Score |1. [Extension 1: n-Dimensional Unit Vectors (S^n)](#extension-1-n-dimensional-unit-vectors-sn)

|------|-----------|------------|--------|---------|-----------|----------------|2. [Extension 2: Hierarchical (Deep) Layers](#extension-2-hierarchical-deep-layers)

| 1 | 💾 State Save/Load | ⭐ Easy | ⭐⭐⭐ High | ⭐ Low | 2-4 hrs | **95** |3. [Extension 3: Hebbian Learning & Plasticity](#extension-3-hebbian-learning--plasticity)

| 2 | 📊 Real-time Statistics | ⭐⭐ Medium | ⭐⭐⭐ High | ⭐⭐ Medium | 4-8 hrs | **90** |4. [Extension 4: Arbitrary Graph Topologies](#extension-4-arbitrary-graph-topologies)

| 3 | 🎬 Recording/GIF Export | ⭐⭐ Medium | ⭐⭐⭐ High | ⭐ Low | 6-10 hrs | **88** |5. [Synthesis: Combining Extensions](#synthesis-combining-extensions)

| 4 | 🎯 Targeted Perturbation | ⭐ Easy | ⭐⭐ Medium | ⭐⭐ Medium | 2-4 hrs | **85** |6. [Implementation Roadmap](#implementation-roadmap)

| 5 | 🌊 External Forcing | ⭐ Easy | ⭐⭐ Medium | ⭐⭐ Medium | 3-5 hrs | **82** |

| 6 | 📉 Order Parameter History | ⭐⭐ Medium | ⭐⭐⭐ High | ⭐ Low | 4-6 hrs | **80** |---

| 7 | 🔗 Graph Topologies | ⭐⭐⭐ Hard | ⭐⭐⭐ High | ⭐⭐⭐ High | 2-3 weeks | **78** |

| 8 | 🧠 Hebbian Learning | ⭐⭐⭐ Hard | ⭐⭐⭐ High | ⭐⭐⭐ High | 2-3 weeks | **75** |## **Extension 1: n-Dimensional Unit Vectors (S^n)**

| 9 | 📈 Frequency Adaptation | ⭐⭐ Medium | ⭐⭐ Medium | ⭐⭐⭐ High | 1 week | **72** |

| 10 | 🏗️ Hierarchical Layers | ⭐⭐⭐ Hard | ⭐⭐⭐ High | ⭐⭐⭐ High | 3-4 weeks | **70** |### Motivation

| 11 | 🌀 Chimera Detection | ⭐⭐⭐ Hard | ⭐⭐ Medium | ⭐⭐⭐ High | 1-2 weeks | **68** |

| 12 | 🌡️ Temperature/Noise Control | ⭐⭐ Medium | ⭐⭐ Medium | ⭐⭐ Medium | 3-5 hrs | **65** |Current model: Each oscillator has a **scalar phase** $\theta_i \in [0, 2\pi)$ on the circle $S^1$.

| 13 | 🗺️ Phase Space Visualization | ⭐⭐ Medium | ⭐⭐ Medium | ⭐ Low | 4-8 hrs | **62** |

| 14 | 📊 Frequency Spectrum (FFT) | ⭐⭐⭐ Hard | ⭐⭐ Medium | ⭐⭐ Medium | 1 week | **58** |**Why extend to vectors?**

| 15 | ⏱️ Adaptive Time-stepping | ⭐⭐ Medium | ⭐ Low | ⭐⭐ Medium | 4-8 hrs | **55** |- **Biological realism**: Neural populations, protein orientations, bacterial swimming

| 16 | 🔮 n-D Unit Vectors (S^n) | ⭐⭐⭐⭐ V.Hard | ⭐⭐⭐ High | ⭐⭐⭐ High | 4-6 weeks | **52** |- **Richer dynamics**: Nematic order, topological defects, quaternion rotations

| 17 | 🧊 True 3D Grid | ⭐⭐⭐⭐ V.Hard | ⭐⭐ Medium | ⭐⭐ Medium | 3-4 weeks | **45** |- **Mathematical depth**: Explores high-dimensional synchronization phenomena

| 18 | 🔀 Multi-population | ⭐⭐⭐ Hard | ⭐⭐ Medium | ⭐⭐ Medium | 2-3 weeks | **42** |

| 19 | 🎭 Frustrated Coupling | ⭐⭐⭐ Hard | ⭐ Low | ⭐⭐⭐ High | 2 weeks | **38** |### Mathematical Foundation



**Priority Score** = (10 - Difficulty) × 2 + Impact × 15 + Novelty × 5 + (10 - TimeWeeks) × 3#### Current: Scalar Phases on S¹



---$$\frac{d\theta_i}{dt} = \omega_i + K \sum_{j} \sin(\theta_j - \theta_i)$$



## 🏆 Tier 1: Quick Wins (< 1 day each)**State space**: Circle $S^1 = \{e^{i\theta} : \theta \in [0, 2\pi)\}$



These deliver high value with minimal effort. **Do these first.**#### Generalized: Unit Vectors on S^(n-1)



### 1. 💾 State Save/Load$$\frac{d\mathbf{v}_i}{dt} = \boldsymbol{\omega}_i + K \sum_{j} \sin(\alpha_{ij}) \cdot \hat{\mathbf{c}}_{ij}$$

**Difficulty:** ⭐ Easy | **Impact:** ⭐⭐⭐ High | **Time:** 2-4 hours

Where:

Save simulation state (theta, omega, parameters) to JSON file; load it back later.- $\mathbf{v}_i \in \mathbb{R}^n$ with $||\mathbf{v}_i|| = 1$ (unit vector)

- $\cos(\alpha_{ij}) = \mathbf{v}_i \cdot \mathbf{v}_j$ (dot product gives angle)

**Why prioritize:**- $\hat{\mathbf{c}}_{ij}$ = coupling direction along geodesic on sphere

- Users lose interesting patterns when refreshing

- Enables sharing discoveries**Coupling direction** (tangent to sphere):

- Foundation for presets library$$\hat{\mathbf{c}}_{ij} = \frac{\mathbf{v}_j - (\mathbf{v}_j \cdot \mathbf{v}_i)\mathbf{v}_i}{||\mathbf{v}_j - (\mathbf{v}_j \cdot \mathbf{v}_i)\mathbf{v}_i||}$$



**Implementation:**This projects $\mathbf{v}_j$ onto the **tangent plane** at $\mathbf{v}_i$.

```javascript

function saveState() {### Dimensional Examples

    const state = {

        theta: Array.from(sim.readTheta()),| Dimension | Sphere | Representation | Applications |

        omega: Array.from(sim.readOmega()),|-----------|--------|----------------|--------------|

        params: { ...STATE }| **n=2** | S¹ (circle) | $[\cos\theta, \sin\theta]$ | Current system |

    };| **n=3** | S² (2-sphere) | $[x, y, z]$ with $x^2+y^2+z^2=1$ | Magnetic spins, protein folding |

    const blob = new Blob([JSON.stringify(state)], {type: 'application/json'});| **n=4** | S³ (3-sphere) | Quaternions $w+xi+yj+zk$ | 3D rotations, orientation dynamics |

    downloadBlob(blob, `kuramoto-${Date.now()}.json`);| **n>>4** | S^(n-1) | High-dim vectors | Neural population codes |

}

```### Implementation: S² (3D Unit Vectors)



---**GPU Buffer Layout:**

```wgsl

### 2. 🎯 Targeted Perturbation (Click to Disturb)struct Vector3 {

**Difficulty:** ⭐ Easy | **Impact:** ⭐⭐ Medium | **Time:** 2-4 hours    x: f32,

    y: f32,

Click on the simulation to inject a phase pulse at that location.    z: f32,

    padding: f32,  // Align to 16 bytes

**Why prioritize:**}

- Highly interactive

- Reveals system stability@group(0) @binding(0) var<storage, read_write> states: array<Vector3>;

- Great for teaching@group(0) @binding(1) var<storage, read> omegas: array<Vector3>;

```

**Implementation:**

- Add click handler to canvas**Compute Shader (Simplified):**

- Map click coordinates to grid position```wgsl

- Write phase pulse to theta buffer at that locationfn compute_step(i: u32) {

    let v_i = normalize(vec3f(states[i].x, states[i].y, states[i].z));

---    var dv = vec3f(omegas[i].x, omegas[i].y, omegas[i].z);

    

### 3. 🌊 External Forcing (Periodic Drive)    // Sum over neighbors

**Difficulty:** ⭐ Easy | **Impact:** ⭐⭐ Medium | **Time:** 3-5 hours    for (var j = 0u; j < neighbor_count; j++) {

        let v_j = normalize(vec3f(states[j].x, states[j].y, states[j].z));

Add a global periodic driving force: `dθ/dt += F·sin(ω_drive·t - θ)`        

        // Angle between vectors

**Why prioritize:**        let cos_alpha = dot(v_i, v_j);

- Simple equation modification        let sin_alpha = sqrt(max(0.0, 1.0 - cos_alpha * cos_alpha));

- Demonstrates entrainment        

- Relevant to many real systems (heartbeat, circadian rhythms)        // Tangent component (coupling direction)

        let c_ij = normalize(v_j - cos_alpha * v_i);

**New Parameters:**        

- `forcingAmplitude` (0-1)        // Accumulate coupling force

- `forcingFrequency` (0-5 Hz)        dv += K * sin_alpha * c_ij;

    }

---    

    // Update and renormalize to stay on sphere

### 4. 🌡️ Enhanced Noise Control    let v_new = normalize(v_i + dt * dv);

**Difficulty:** ⭐⭐ Medium | **Impact:** ⭐⭐ Medium | **Time:** 3-5 hours    states[i] = Vector3(v_new.x, v_new.y, v_new.z, 0.0);

}

Expand noise options: spatially correlated noise, colored noise, noise bursts.```



**Why prioritize:****Key Operation: Renormalization**

- Already have noise infrastructure

- Phase transitions depend on noiseAfter each update, vectors **must** be renormalized:

- More realistic physics$$\mathbf{v}_i^{\text{new}} = \frac{\mathbf{v}_i + \Delta t \cdot \frac{d\mathbf{v}_i}{dt}}{||\mathbf{v}_i + \Delta t \cdot \frac{d\mathbf{v}_i}{dt}||}$$



---### Visualization Strategies



## 🥈 Tier 2: Medium Projects (1-3 days each)**Challenge**: How to display 3D+ vectors on a 2D screen?



### 5. 📊 Real-time Statistics Panel#### Option A: Stereographic Projection

**Difficulty:** ⭐⭐ Medium | **Impact:** ⭐⭐⭐ High | **Time:** 4-8 hours

Project S² → ℝ²:

Display live metrics:```

- Global order parameter R (already computed!)North pole: (0, 0, 1)

- Mean/std of frequenciesProjected point: (x/(1-z), y/(1-z))

- Chimera index (sync vs desync area ratio)```

- Pattern classification (spiral, wave, chimera, etc.)

#### Option B: Color Mapping

**Why prioritize:**

- Uses existing GPU computations```wgsl

- Makes simulation quantitativefn vector_to_color(v: vec3f) -> vec4f {

- Essential for research use    // Azimuthal angle → Hue

    let hue = atan2(v.y, v.x) / (2.0 * 3.14159);

**Implementation:**    

```javascript    // Polar angle → Brightness

// Add stats panel to UI    let brightness = 0.5 + 0.5 * v.z;

<div id="stats-panel">    

    <div>Order R: <span id="stat-order">0.00</span></div>    return hsv_to_rgb(hue, 1.0, brightness);

    <div>Entropy: <span id="stat-entropy">0.00</span></div>}

    <div>Pattern: <span id="stat-pattern">Unknown</span></div>```

</div>

```#### Option C: Quiver Plot (3D Arrows)



---Render small arrows at each grid position showing vector direction.



### 6. 🎬 Recording/GIF Export### New Phenomena on S^n

**Difficulty:** ⭐⭐ Medium | **Impact:** ⭐⭐⭐ High | **Time:** 6-10 hours

1. **Nematic Order** (S²): 

Record simulation to video (WebM) or animated GIF.   - Vectors have head-tail symmetry: $\mathbf{v} \equiv -\mathbf{v}$

   - Allows topological defects with **±1/2 winding** (not just ±1)

**Why prioritize:**   - Forms stripe patterns, not spirals

- Sharing on social media

- Documentation/presentations2. **Quaternion Dynamics** (S³):

- Publication figures   - Represents 3D rotations without gimbal lock

   - Couples rotational degrees of freedom

**Libraries:** gif.js, MediaRecorder API   - Applications: Satellite attitude control, robotic swarms



---3. **High-Dimensional Effects**:

   - **Concentration of measure**: Random vectors in S^(n-1) are nearly orthogonal when n is large

### 7. 📉 Order Parameter History (Time Series)   - Harder to synchronize (requires stronger coupling)

**Difficulty:** ⭐⭐ Medium | **Impact:** ⭐⭐⭐ High | **Time:** 4-6 hours   - Neural population codes live in S^(100+)



Plot R(t) over time in a small chart below the main view.### Generalized Order Parameter



**Why prioritize:**For scalar phases: $Z = \frac{1}{N}\sum_i e^{i\theta_i}$, $|Z| \in [0,1]$

- Shows synchronization transitions

- Detects oscillations and chaosFor vector states:

- Standard analysis tool$$\mathbf{Z} = \frac{1}{N}\sum_{i=1}^{N} \mathbf{v}_i \in \mathbb{R}^n$$



**Implementation:** Use Chart.js or canvas 2D with rolling buffer- **Magnitude**: $|\mathbf{Z}| \in [0, 1]$ measures synchronization

- **Direction**: $\mathbf{Z}/|\mathbf{Z}|$ shows mean orientation

---

---

### 8. 🗺️ Phase Space Visualization

**Difficulty:** ⭐⭐ Medium | **Impact:** ⭐⭐ Medium | **Time:** 4-8 hours## **Extension 2: Hierarchical (Deep) Layers**



Show all oscillators as dots on a unit circle (phase) or torus (phase + frequency).### Motivation



**Why prioritize:**Single-layer oscillators can synchronize, but **hierarchical organization** enables:

- Classic Kuramoto visualization- **Abstraction**: Higher layers represent abstract features

- Reveals clustering directly- **Top-down attention**: Feedback from high to low layers

- Complements spatial view- **Multi-scale processing**: Different timescales at different layers



---**Biological parallel**: Cortical hierarchy (V1 → V2 → V4 → IT)



### 9. 📈 Frequency Adaptation### Architecture

**Difficulty:** ⭐⭐ Medium | **Impact:** ⭐⭐ Medium | **Time:** 1 week

```

Oscillators adjust their natural frequency based on neighbors:Layer 2 (Abstract)    ●────●────●────●

`dω/dt = ε · (ω_neighbors - ω_i)`                      ↕    ↕    ↕    ↕

Layer 1 (Features)   ●─●─●─●─●─●─●─●─●

**Why prioritize:**                     ↕ ↕ ↕ ↕ ↕ ↕ ↕ ↕ ↕

- Novel dynamicsLayer 0 (Input)     ●●●●●●●●●●●●●●●●●●

- Self-organizing frequencies

- Biological relevance (neural adaptation)Connections:

─ Lateral coupling (within layer)

---↕ Vertical coupling (between layers)

```

## 🥉 Tier 3: Major Features (1-3 weeks each)

### Mathematical Formulation

### 10. 🔗 Arbitrary Graph Topologies

**Difficulty:** ⭐⭐⭐ Hard | **Impact:** ⭐⭐⭐ High | **Time:** 2-3 weeksFor oscillator $i$ in layer $\ell$:



Replace grid with small-world, scale-free, or custom networks.$$\frac{d\theta_i^\ell}{dt} = \omega_i^\ell + \underbrace{K_{\text{lat}} \sum_{j \in N_i^\ell} \sin(\theta_j^\ell - \theta_i^\ell)}_{\text{Lateral (same layer)}} + \underbrace{K_{\text{vert}} \sum_{k} \sin(\theta_k^{\ell \pm 1} - \theta_i^\ell)}_{\text{Vertical (adjacent layers)}}$$



**Why prioritize:****Key parameters**:

- Fundamentally new phenomena- $K_{\text{lat}}$: Within-layer coupling (feature binding)

- Brain/social network modeling- $K_{\text{vert}}$: Between-layer coupling (feed-forward/feedback)

- Strong research interest- $\omega^\ell$: Layer-specific natural frequencies



**Key Challenges:**### Feed-Forward vs Feedback

- Neighbor buffer management

- Force-directed layout for visualization#### Feed-Forward (Bottom-Up)

- Non-uniform degree handling```

Layer 1 receives input from Layer 0:

**Implementation Approach:**dθ₁/dt = ω₁ + K_lat Σ sin(θ₁_j - θ₁_i) + K_ff Σ sin(θ₀_k - θ₁_i)

1. Add neighbor index buffer (N × MAX_DEGREE)```

2. Modify compute shader to iterate over explicit neighbors

3. Implement Watts-Strogatz and Barabási-Albert generators**Effect**: Lower layers drive higher layers (sensory processing)

4. Add force-directed layout for node positioning

#### Feedback (Top-Down)

---```

Layer 0 receives input from Layer 1:

### 11. 🧠 Hebbian Learning (Adaptive Weights)dθ₀/dt = ω₀ + K_lat Σ sin(θ₀_j - θ₀_i) + K_fb Σ sin(θ₁_k - θ₀_i)

**Difficulty:** ⭐⭐⭐ Hard | **Impact:** ⭐⭐⭐ High | **Time:** 2-3 weeks```



Coupling weights evolve based on correlation:**Effect**: Higher layers modulate lower layers (attention, prediction)

`dK_ij/dt = η·cos(θ_j - θ_i) - λ·K_ij`

#### Bi-Directional (Full)

**Why prioritize:**```

- Memory formationBoth feed-forward AND feedback active simultaneously

- Self-organization```

- Biologically plausible

**Effect**: Hierarchical inference (predictive coding)

**Key Challenges:**

- Weight buffer (N × N or sparse)### Implementation

- Two-pass update (phases then weights)

- Visualization of weight matrix**GPU Buffer Structure:**

```javascript

---// Flat buffer: [Layer 0, Layer 1, ..., Layer L]

// Total size: L × N × 4 bytes

### 12. 🌀 Automatic Chimera Detection

**Difficulty:** ⭐⭐⭐ Hard | **Impact:** ⭐⭐ Medium | **Time:** 1-2 weeksconst totalOscillators = NUM_LAYERS × gridSize × gridSize;

thetaBuf = device.createBuffer({

Automatically identify and highlight chimera states.    size: totalOscillators × 4,

    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,

**Algorithm:**});

1. Compute local order parameter R_i for each oscillator```

2. Threshold into "sync" (R > 0.8) and "desync" (R < 0.3) regions

3. Find connected components**Compute Shader:**

4. Report chimera index = |sync| / |total|```wgsl

struct Params {

---    // ... existing params ...

    num_layers: u32,

### 13. 📊 Frequency Spectrum (FFT)    K_lateral: f32,

**Difficulty:** ⭐⭐⭐ Hard | **Impact:** ⭐⭐ Medium | **Time:** 1 week    K_vertical_ff: f32,  // Feed-forward strength

    K_vertical_fb: f32,  // Feedback strength

Compute and display frequency spectrum of phase evolution.}



**Why useful:**fn get_index(layer: u32, row: u32, col: u32) -> u32 {

- Reveals dominant frequencies    return layer * params.rows * params.cols + row * params.cols + col;

- Detects period-doubling}

- Characterizes chaos

@compute @workgroup_size(16, 16)

**Implementation:** WebGPU FFT or wgpu-fft libraryfn main(@builtin(global_invocation_id) gid: vec3u) {

    let layer = gid.z;  // Use Z dimension for layer

---    let row = gid.y;

    let col = gid.x;

## 🔬 Tier 4: Research-Grade Extensions (1+ months)    

    let i = get_index(layer, row, col);

### 14. 🏗️ Hierarchical Layers    let theta_i = theta[i];

**Difficulty:** ⭐⭐⭐ Hard | **Impact:** ⭐⭐⭐ High | **Time:** 3-4 weeks    var dtheta = omega[i];

    

Multiple layers with feed-forward and feedback coupling.    // 1. Lateral coupling (same layer)

    for (var dr = -range; dr <= range; dr++) {

**Architecture:**        for (var dc = -range; dc <= range; dc++) {

```            if (dr == 0 && dc == 0) { continue; }

Layer 2 (Abstract)    ●────●────●            let r_neighbor = (row + dr + params.rows) % params.rows;

                      ↕    ↕    ↕            let c_neighbor = (col + dc + params.cols) % params.cols;

Layer 1 (Features)   ●─●─●─●─●─●            let j = get_index(layer, r_neighbor, c_neighbor);

                     ↕ ↕ ↕ ↕ ↕ ↕            dtheta += params.K_lateral * sin(theta[j] - theta_i);

Layer 0 (Input)     ●●●●●●●●●●●●        }

```    }

    

**Applications:**    // 2. Vertical coupling (adjacent layers)

- Cortical hierarchy modeling    if (layer > 0) {

- Predictive coding        // Feed-forward from layer below

- Deep oscillator networks        let j = get_index(layer - 1, row, col);

        dtheta += params.K_vertical_ff * sin(theta[j] - theta_i);

---    }

    

### 15. 🔮 n-Dimensional Unit Vectors (S^n)    if (layer < params.num_layers - 1) {

**Difficulty:** ⭐⭐⭐⭐ Very Hard | **Impact:** ⭐⭐⭐ High | **Time:** 4-6 weeks        // Feedback from layer above

        let j = get_index(layer + 1, row, col);

Extend from scalar phase θ ∈ S¹ to vector v ∈ S² or S³.        dtheta += params.K_vertical_fb * sin(theta[j] - theta_i);

    }

**New Phenomena:**    

- Nematic order (±½ defects)    // Update

- Quaternion dynamics (3D rotations)    theta_next[i] = theta_i + params.dt * dtheta;

- High-dimensional synchronization}

```

**Challenges:**

- Vector normalization on sphere**3D Workgroup Dispatch:**

- Geodesic coupling computation```javascript

- Visualization (stereographic projection, color mapping)const workgroupsX = Math.ceil(gridSize / 16);

const workgroupsY = Math.ceil(gridSize / 16);

---const workgroupsZ = NUM_LAYERS;



### 16. 🧊 True 3D LatticecomputePass.dispatchWorkgroups(workgroupsX, workgroupsY, workgroupsZ);

**Difficulty:** ⭐⭐⭐⭐ Very Hard | **Impact:** ⭐⭐ Medium | **Time:** 3-4 weeks```



3D grid of oscillators (not just 3D visualization of 2D grid).### Visualization: Multi-Layer View



**Challenges:****Option 1: Side-by-Side Panels**

- Memory: N³ oscillators```

- Visualization: Volume rendering or slicing┌──────────┬──────────┬──────────┐

- Interaction: Navigating 3D space│ Layer 0  │ Layer 1  │ Layer 2  │

│ (Input)  │(Features)│(Abstract)│

---└──────────┴──────────┴──────────┘

```

### 17. 🔀 Multi-population Dynamics

**Difficulty:** ⭐⭐⭐ Hard | **Impact:** ⭐⭐ Medium | **Time:** 2-3 weeks**Option 2: 3D Stack**

```

Multiple distinct oscillator types with different coupling rules.Render layers at different heights:

y = 0:   Layer 0 (base)

**Example:** Excitatory + Inhibitory populations (like E-I balance in brain)y = 10:  Layer 1 (middle)

y = 20:  Layer 2 (top)

---

With transparency to see through

### 18. 🎭 Frustrated Coupling (XY Model)```

**Difficulty:** ⭐⭐⭐ Hard | **Impact:** ⭐ Low | **Time:** 2 weeks

**Option 3: Animated Transition**

Add frustration term to coupling: `K·sin(θ_j - θ_i - α_ij)````

Press [ / ] to cycle through layers

**Applications:**Show one layer at a time with context

- Spin glass behavior```

- Disordered systems

- Complex energy landscapes### Applications



---1. **Feature Extraction**: Layer 0 = edges, Layer 1 = shapes, Layer 2 = objects

2. **Predictive Coding**: Top-down prediction vs bottom-up sensation

## 📋 Implementation Decision Matrix3. **Hierarchical Synchronization**: Different timescales at different layers

4. **Memory Consolidation**: Slow dynamics in higher layers

Use this to decide what to work on next:

### Novel Patterns

| Question | If YES → | If NO → |

|----------|----------|---------|- **Hierarchical Waves**: Traveling waves that propagate upward through layers

| Need quick demo? | Tier 1 | Continue |- **Layer-Specific Chimeras**: Synchronized in Layer 0, chaotic in Layer 1

| Users requesting feature? | Prioritize that | Continue |- **Cross-Layer Resonance**: Frequency matching between layers creates binding

| Research publication goal? | Tier 3-4 | Tier 1-2 |

| Learning GPU programming? | Tier 2-3 | Tier 1 |---

| Want viral social media? | Recording + Statistics | Continue |

| Studying specific phenomenon? | Feature enabling that | General improvements |## **Extension 3: Hebbian Learning & Plasticity**



---### Motivation



## 🗓️ Suggested Development Schedule**Current**: Coupling strength $K$ is fixed and uniform.



### Sprint 1 (Week 1): Foundation**Biological reality**: Synaptic connections **strengthen** with correlated activity (Hebb's rule: "Neurons that fire together, wire together").

- [ ] State save/load

- [ ] Targeted perturbation (click to disturb)**Goal**: Make coupling weights $K_{ij}$ **dynamic** and **adaptive**.

- [ ] Basic statistics panel

### Mathematical Formulation

### Sprint 2 (Week 2): Analysis

- [ ] Order parameter history plot#### Standard Kuramoto (Fixed K)

- [ ] External forcing$$\frac{d\theta_i}{dt} = \omega_i + K \sum_j \sin(\theta_j - \theta_i)$$

- [ ] Enhanced noise options

#### Hebbian Kuramoto (Adaptive K_ij)

### Sprint 3 (Weeks 3-4): Recording & Polish$$\frac{d\theta_i}{dt} = \omega_i + \sum_j K_{ij}(t) \sin(\theta_j - \theta_i)$$

- [ ] Video/GIF recording

- [ ] Phase space visualization$$\frac{dK_{ij}}{dt} = \eta \cdot f(\theta_i, \theta_j) - \lambda K_{ij}$$

- [ ] UI improvements

Where:

### Sprint 4 (Weeks 5-8): Graph Topologies- $\eta$: Learning rate

- [ ] Neighbor buffer system- $f(\theta_i, \theta_j)$: Hebbian learning rule

- [ ] Small-world generator- $\lambda K_{ij}$: Weight decay (prevents runaway growth)

- [ ] Scale-free generator

- [ ] Force-directed layout### Learning Rules



### Sprint 5 (Weeks 9-12): Learning#### Rule 1: Phase Difference Hebb

- [ ] Weight buffer

- [ ] Hebbian learning rule$$f(\theta_i, \theta_j) = \cos(\theta_j - \theta_i)$$

- [ ] Weight visualization

**Effect**:

### Future: Advanced- If $\theta_i \approx \theta_j$ (synchronized) → $f > 0$ → $K_{ij}$ increases

- [ ] Hierarchical layers- If $\theta_i \approx \theta_j + \pi$ (anti-phase) → $f < 0$ → $K_{ij}$ decreases

- [ ] n-D vectors

- [ ] 3D lattice#### Rule 2: Activity-Dependent Hebb



---$$f(\theta_i, \theta_j) = \dot{\theta}_i \cdot \dot{\theta}_j$$



## 🔧 Technical Dependencies**Effect**: Strengthen connections when both oscillators are accelerating together



```#### Rule 3: Order-Gated Hebb

State Save/Load ──┐

                  ├──► Recording$$f(\theta_i, \theta_j) = R_i \cdot R_j \cdot \cos(\theta_j - \theta_i)$$

Statistics ───────┘

Where $R_i$ is the local order parameter.

Graph Topologies ──┬──► Hebbian Learning

                   │**Effect**: Only learn when both oscillators are in synchronized neighborhoods

                   └──► Hierarchical Layers

### Implementation

n-D Vectors ────────────► (Independent, can do anytime)

```**GPU Buffer for Weights:**

```javascript

---// For N oscillators with max degree D:

// Weight matrix: N × D × 4 bytes (per neighbor)

## 📚 References

weightsBuffer = device.createBuffer({

1. **Kuramoto Model**: Kuramoto, Y. (1975). Self-entrainment of a population of coupled non-linear oscillators.    size: N * MAX_DEGREE * 4,

2. **Chimera States**: Abrams, D. & Strogatz, S. (2004). Chimera states for coupled oscillators.    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,

3. **Small-World**: Watts, D. & Strogatz, S. (1998). Collective dynamics of 'small-world' networks.});

4. **Scale-Free**: Barabási, A. & Albert, R. (1999). Emergence of scaling in random networks.```

5. **Hebbian Learning**: Hebb, D. (1949). The Organization of Behavior.

**Two-Pass Update:**

---

**Pass 1: Update Phases (Using Current Weights)**

*Last updated: January 2025*```wgsl

@compute @workgroup_size(16, 16)
fn update_phases() {
    let i = get_index(gid.x, gid.y);
    var dtheta = omega[i];
    
    for (var k = 0u; k < MAX_DEGREE; k++) {
        let j = neighbors[i * MAX_DEGREE + k];
        if (j < 0) { break; }
        
        let K_ij = weights[i * MAX_DEGREE + k];  // Dynamic weight
        dtheta += K_ij * sin(theta[j] - theta[i]);
    }
    
    theta_next[i] = theta[i] + dt * dtheta;
}
```

**Pass 2: Update Weights (Using Phases)**
```wgsl
@compute @workgroup_size(16, 16)
fn update_weights() {
    let i = get_index(gid.x, gid.y);
    let theta_i = theta[i];
    
    for (var k = 0u; k < MAX_DEGREE; k++) {
        let j = neighbors[i * MAX_DEGREE + k];
        if (j < 0) { break; }
        
        let theta_j = theta[j];
        let K_ij = weights[i * MAX_DEGREE + k];
        
        // Hebbian learning rule
        let f = cos(theta_j - theta_i);  // Correlation
        let dK = eta * f - lambda * K_ij;  // Growth - decay
        
        // Clamp to [K_min, K_max]
        weights_next[i * MAX_DEGREE + k] = clamp(
            K_ij + dt_learning * dK,
            K_min,
            K_max
        );
    }
}
```

### Emergent Behaviors

1. **Community Detection**: Strongly coupled clusters emerge (like-minded groups)
2. **Memory Formation**: Patterns that repeat get "burned in" (stronger weights)
3. **Forgetting**: Unused connections decay back to baseline
4. **Sparse Coding**: Only relevant connections remain strong
5. **Self-Organization**: Network topology emerges from dynamics

### Visualization

**Weight Heatmap Overlay:**
```javascript
// Color connections by weight strength
for (let i = 0; i < N; i++) {
    for (let k = 0; k < degree[i]; k++) {
        const j = neighbors[i][k];
        const K_ij = weights[i][k];
        
        // Draw line from i to j with color/thickness = K_ij
        const color = interpolateColor(K_ij, K_min, K_max);
        drawLine(positions[i], positions[j], color);
    }
}
```

**Network Analysis:**
```javascript
// Compute weight statistics
const mean_weight = sum(weights) / num_edges;
const sparsity = count(weights < threshold) / num_edges;
const clustering_coefficient = ... // Graph theory metric
```

### Applications

1. **Associative Memory**: Store patterns as weight configurations
2. **Attractor Networks**: Learned patterns become stable states
3. **Developmental Processes**: Network grows through experience
4. **Neuroplasticity Models**: Simulate learning disabilities, recovery from injury

---

## **Extension 4: Arbitrary Graph Topologies**

### Motivation

**Current limitation**: Grid topology with periodic boundary conditions.

**Reality**: Many systems have **non-grid structure**:
- Social networks: Power-law degree distribution
- Brain networks: Small-world connectivity
- Communication networks: Hub-and-spoke architecture

### Graph Types

| Graph Type | Properties | Applications |
|------------|------------|--------------|
| **Regular Grid** | Uniform degree, local | Current system |
| **Small-World** | High clustering, short paths | Social networks, neural cortex |
| **Scale-Free** | Power-law degree, hubs | Internet, protein interactions |
| **Random** | Poisson degree distribution | Baseline comparison |
| **Hierarchical** | Modular structure | Organizations, metabolic networks |

### Small-World Networks (Watts-Strogatz)

**Algorithm:**
1. Start with regular ring lattice (degree $k$)
2. For each edge, rewire with probability $p$:
   - Keep edge with prob $(1-p)$
   - Rewire to random node with prob $p$

**Effect**:
- $p=0$: Regular lattice (high clustering, long paths)
- $p=1$: Random graph (low clustering, short paths)
- $p \in [0.01, 0.1]$: **Small-world** (high clustering AND short paths!)

**Implementation:**
```javascript
function generateSmallWorld(N, k, p) {
    const neighbors = [];
    
    // 1. Create ring lattice
    for (let i = 0; i < N; i++) {
        neighbors[i] = [];
        for (let j = 1; j <= k/2; j++) {
            neighbors[i].push((i + j) % N);
            neighbors[i].push((i - j + N) % N);
        }
    }
    
    // 2. Rewire with probability p
    for (let i = 0; i < N; i++) {
        for (let k = 0; k < neighbors[i].length; k++) {
            if (Math.random() < p) {
                // Rewire to random node (avoid self-loops)
                let new_target;
                do {
                    new_target = Math.floor(Math.random() * N);
                } while (new_target === i || neighbors[i].includes(new_target));
                
                neighbors[i][k] = new_target;
            }
        }
    }
    
    return neighbors;
}
```

### Scale-Free Networks (Barabási-Albert)

**Algorithm (Preferential Attachment):**
1. Start with small connected graph ($m_0$ nodes)
2. Add nodes one at a time
3. New node connects to $m$ existing nodes with probability proportional to their degree:
   $$P(\text{connect to node } i) = \frac{k_i}{\sum_j k_j}$$

**Result**: Power-law degree distribution $P(k) \sim k^{-\gamma}$ with $\gamma \approx 3$

**Effect**:
- Few **hubs** with high degree
- Many nodes with low degree
- Robust to random failures, vulnerable to targeted attacks

**Implementation:**
```javascript
function generateScaleFree(N, m) {
    const neighbors = Array(N).fill(null).map(() => []);
    const degrees = Array(N).fill(0);
    
    // Start with complete graph of m nodes
    for (let i = 0; i < m; i++) {
        for (let j = 0; j < m; j++) {
            if (i !== j) {
                neighbors[i].push(j);
                degrees[i]++;
            }
        }
    }
    
    // Add remaining nodes with preferential attachment
    for (let i = m; i < N; i++) {
        const targets = [];
        const total_degree = degrees.reduce((a, b) => a + b, 0);
        
        while (targets.length < m) {
            // Choose node with prob ∝ degree
            const rand = Math.random() * total_degree;
            let cumsum = 0;
            for (let j = 0; j < i; j++) {
                cumsum += degrees[j];
                if (cumsum >= rand && !targets.includes(j)) {
                    targets.push(j);
                    break;
                }
            }
        }
        
        // Connect to selected targets
        for (const j of targets) {
            neighbors[i].push(j);
            neighbors[j].push(i);
            degrees[i]++;
            degrees[j]++;
        }
    }
    
    return neighbors;
}
```

### Implementation Strategy

**Fixed Max Degree Representation** (Recommended):

```javascript
// Neighbor buffer: N × MAX_DEGREE × 4 bytes
// Store -1 for unused slots

function packNeighbors(graph, MAX_DEGREE) {
    const packed = new Int32Array(N * MAX_DEGREE);
    packed.fill(-1);
    
    for (let i = 0; i < N; i++) {
        const degree = Math.min(graph[i].length, MAX_DEGREE);
        for (let k = 0; k < degree; k++) {
            packed[i * MAX_DEGREE + k] = graph[i][k];
        }
    }
    
    return packed;
}
```

**Shader Update:**
```wgsl
@group(0) @binding(6) var<storage, read> neighbors: array<i32>;
const MAX_DEGREE: u32 = 50u;

fn compute_coupling(i: u32) -> f32 {
    let theta_i = theta[i];
    var coupling = 0.0;
    
    for (var k = 0u; k < MAX_DEGREE; k++) {
        let j = neighbors[i * MAX_DEGREE + k];
        if (j < 0) { break; }  // End of neighbors
        
        coupling += K * sin(theta[j] - theta_i);
    }
    
    return coupling;
}
```

### Node Positioning (Layout Algorithms)

**Challenge**: How to visualize non-grid graphs?

#### Option 1: Force-Directed Layout

```javascript
function forceDirectedLayout(graph, iterations = 1000) {
    const positions = Array(N).fill(null).map(() => ({
        x: Math.random() * WIDTH,
        y: Math.random() * HEIGHT
    }));
    
    for (let iter = 0; iter < iterations; iter++) {
        const forces = Array(N).fill(null).map(() => ({ x: 0, y: 0 }));
        
        // Repulsive force (all pairs)
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const dx = positions[j].x - positions[i].x;
                const dy = positions[j].y - positions[i].y;
                const dist = Math.sqrt(dx*dx + dy*dy) + 1e-6;
                const force = K_REPEL / (dist * dist);
                
                forces[i].x -= force * dx / dist;
                forces[i].y -= force * dy / dist;
                forces[j].x += force * dx / dist;
                forces[j].y += force * dy / dist;
            }
        }
        
        // Attractive force (connected pairs)
        for (let i = 0; i < N; i++) {
            for (const j of graph[i]) {
                const dx = positions[j].x - positions[i].x;
                const dy = positions[j].y - positions[i].y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const force = K_ATTRACT * dist;
                
                forces[i].x += force * dx / dist;
                forces[i].y += force * dy / dist;
            }
        }
        
        // Update positions
        for (let i = 0; i < N; i++) {
            positions[i].x += forces[i].x * DAMPING;
            positions[i].y += forces[i].y * DAMPING;
        }
    }
    
    return positions;
}
```

#### Option 2: Community-Based Layout

```javascript
// Use Louvain algorithm to detect communities
// Position communities in a circle
// Position nodes within communities in subcircles
```

### Rendering Graph Topology

**Draw Nodes AND Edges:**

```wgsl
// Vertex shader for edges (line segments)
@vertex
fn vs_edge(@builtin(vertex_index) vid: u32) -> EdgeOutput {
    let edge_id = vid / 2u;
    let endpoint = vid % 2u;
    
    let i = edges[edge_id].source;
    let j = edges[edge_id].target;
    
    let pos = select(positions[i], positions[j], endpoint == 1u);
    
    // Color by weight (if using Hebbian learning)
    let weight = weights[edge_id];
    let color = weight_to_color(weight);
    
    return EdgeOutput(pos, color);
}

// Fragment shader
@fragment
fn fs_edge(input: EdgeOutput) -> @location(0) vec4f {
    return input.color;
}
```

### Synchronization Phenomena on Graphs

**New behaviors not seen on grids:**

1. **Hub Synchronization**: Hubs (high-degree nodes) synchronize first, then pull in periphery
2. **Community Clustering**: Graph communities sync internally before global sync
3. **Chimera Stability**: Small-world topology makes chimeras MORE stable
4. **Explosive Synchronization**: Sudden transition in scale-free networks when frequency-degree correlated

### Performance Considerations

**Memory:**
- Grid: $O(N)$ (implicit neighbors)
- Graph: $O(N \cdot \bar{k})$ where $\bar{k}$ is average degree
- For small-world: $\bar{k} \sim 10$, so ~10× memory

**Computation:**
- Grid: Regular access pattern (cache-friendly)
- Graph: Random access pattern (cache-unfriendly)
- Expect 20-30% slowdown due to memory latency

**Mitigation:**
- Use shared memory to cache neighbor data
- Sort nodes by degree for better load balancing
- Use async compute if available

---

## **Synthesis: Combining Extensions**

### The Ultimate System: n-D Hierarchical Adaptive Networks

**Combining all four extensions:**

1. **Unit vectors on S^n** (n-dimensional state)
2. **Hierarchical layers** (L layers)
3. **Hebbian learning** (adaptive weights)
4. **Arbitrary topology** (graph structure)

**Total state:**
- $N$ nodes
- $L$ layers
- $n$-dimensional vectors
- $E$ edges with adaptive weights

**Total memory**: $N \times L \times n \times 4$ (states) $+ E \times 4$ (weights)

Example: $N=1000, L=3, n=3, E=10000$
- States: $1000 \times 3 \times 3 \times 4 = 36$ KB
- Weights: $10000 \times 4 = 40$ KB
- Total: ~76 KB (negligible!)

### Unified Dynamics

$$\frac{d\mathbf{v}_i^\ell}{dt} = \boldsymbol{\omega}_i^\ell + \sum_{j \in N_i^\ell} K_{ij}^\ell(t) \sin(\alpha_{ij}) \hat{\mathbf{c}}_{ij} + \sum_{k} K_{ik}^{\ell,\ell\pm1}(t) \sin(\alpha_{ik}) \hat{\mathbf{c}}_{ik}$$

$$\frac{dK_{ij}^\ell}{dt} = \eta \cdot f(\mathbf{v}_i^\ell, \mathbf{v}_j^\ell) - \lambda K_{ij}^\ell$$

Where:
- First sum: **Lateral** coupling (same layer, graph topology, adaptive weights)
- Second sum: **Vertical** coupling (adjacent layers, adaptive weights)
- Learning rule: Generalized Hebbian (dot product correlation)

### Emergent Phenomena

**From this unified system, we can study:**

1. **Hierarchical Feature Learning**: Lower layers extract simple features, higher layers combine them
2. **Attractor Landscapes**: Learned weight configurations create basins of attraction
3. **Multi-Scale Synchronization**: Different timescales at different layers
4. **Topological Dynamics**: How network structure co-evolves with synchronization patterns
5. **Memory and Prediction**: System learns to anticipate inputs based on history

### Applications

| Domain | How Extensions Help |
|--------|---------------------|
| **Neuroscience** | Hierarchical layers = cortex, Adaptive weights = synaptic plasticity, Graph = connectome |
| **Machine Learning** | S^n vectors = embeddings, Hebbian = self-supervised learning, Layers = deep networks |
| **Social Dynamics** | Graph = social network, Adaptive = opinion formation, Hierarchy = influence cascades |
| **Collective Motion** | S² vectors = 3D orientation, Graph = interaction topology, Layers = decision hierarchy |

---

## **Implementation Roadmap**

### Phase 1: Foundation (Weeks 1-2)
**Goal**: Get basic infrastructure working

- [ ] Refactor codebase for extensibility
- [ ] Add neighbor buffer system (fixed max degree)
- [ ] Implement graph generation (Small-world, Scale-free)
- [ ] Test performance with non-grid topology

**Deliverable**: Graph-based Kuramoto (scalar phases, single layer, fixed weights)

### Phase 2: Vectors (Weeks 3-4)
**Goal**: Move to S² (3D unit vectors)

- [ ] Extend state buffers to vec3
- [ ] Implement geodesic coupling on sphere
- [ ] Add vector normalization in compute shader
- [ ] Implement stereographic projection visualization
- [ ] Add vector-to-color mapping

**Deliverable**: 3D vector Kuramoto on graphs

### Phase 3: Hierarchy (Weeks 5-6)
**Goal**: Add multi-layer architecture

- [ ] Extend buffers to 3D (layer dimension)
- [ ] Implement feed-forward coupling
- [ ] Implement feedback coupling
- [ ] Add layer selection UI
- [ ] Visualize all layers simultaneously

**Deliverable**: Hierarchical Kuramoto (3D vectors, multiple layers, graph topology)

### Phase 4: Learning (Weeks 7-8)
**Goal**: Add adaptive weights

- [ ] Add weight buffer
- [ ] Implement Hebbian learning rule
- [ ] Add two-pass update (phases then weights)
- [ ] Visualize edge weights
- [ ] Add weight statistics display

**Deliverable**: Full system (vectors, hierarchy, graph, learning)

### Phase 5: Applications (Weeks 9-10)
**Goal**: Build interesting demos

- [ ] Pattern recognition demo (memorize images)
- [ ] Hierarchical processing demo (edge → shape → object)
- [ ] Network evolution demo (adaptive topology)
- [ ] Comparative analysis (grid vs small-world vs scale-free)

**Deliverable**: Publication-ready demonstrations

### Phase 6: Optimization (Weeks 11-12)
**Goal**: Scale to large systems

- [ ] Optimize memory access patterns
- [ ] Implement spatial hashing for graph
- [ ] Add level-of-detail system
- [ ] Profile and remove bottlenecks
- [ ] Benchmark: 10K+ oscillators at 60 FPS

**Deliverable**: Production-quality implementation

---

## **Priority Recommendation**

**Start with Extension 4 (Arbitrary Topologies)**, because:

1. ✅ **Independent**: Can implement without touching other extensions
2. ✅ **Foundation**: Other extensions build on top of graph infrastructure
3. ✅ **High impact**: Reveals fundamentally new synchronization phenomena
4. ✅ **Manageable scope**: ~1-2 weeks of work
5. ✅ **Immediate results**: Small-world chimeras are visually striking

**Then proceed to:**
- Extension 3 (Hebbian Learning) - leverages graph structure
- Extension 2 (Hierarchy) - adds depth
- Extension 1 (Vectors) - final generalization

This gives a natural progression: **topology → learning → hierarchy → geometry**.

---

## **Open Questions for Research**

1. **Does hierarchical learning converge?** Under what conditions?
2. **Optimal graph topology for synchronization?** Small-world? Scale-free?
3. **How many layers needed for feature abstraction?** 2? 5? 10?
4. **Can Hebbian learning discover community structure?** Unsupervised graph clustering?
5. **S² vs S³ vs S^n - which is most biologically plausible?** For neural populations?
6. **Chimera states on non-grid graphs?** More or less stable?
7. **Can this system perform computation?** Reservoir computing? Memory tasks?

---

## **Conclusion**

These extensions transform the Kuramoto model from a **toy demonstration** into a **computational framework** for:
- Self-organizing systems
- Hierarchical learning
- Adaptive networks
- Collective intelligence

The mathematical foundation is solid, the GPU implementation is feasible, and the potential applications span neuroscience, ML, social dynamics, and beyond.




Tier 1: Visual Enhancements (Easy, High Impact)
Extension	Description	Effort
🎨 More colormaps	Add plasma, viridis, inferno, twilight	Low
📊 Real-time statistics	Show mean frequency, sync ratio, chimera index	Medium
🎬 Recording/GIF export	Capture simulation as video or GIF	Medium
🔍 Zoom/Pan	Mouse wheel zoom, click-drag pan	Low
Tier 2: Physics Extensions (Medium Complexity)
Extension	Description	Effort
🌊 External forcing	Add periodic driving force (entrainment)	Low
🎯 Targeted perturbation	Click to inject phase pulse	Low
📈 Frequency adaptation	Oscillators adapt their natural frequency	Medium
🔗 Network topology	Small-world, scale-free, or custom networks	High
⏱️ Adaptive time-stepping	Larger dt when synchronized, smaller when chaotic	Medium
Tier 3: Analysis Tools (Medium-High Complexity)
Extension	Description	Effort
📉 Order parameter history	Time series plot of global order	Medium
🗺️ Phase space visualization	Plot oscillators on unit circle	Medium
🌀 Chimera detection	Automatically detect and highlight chimera states	High
📊 Frequency spectrum	FFT of phase evolution	High
💾 State save/load	Save interesting patterns to JSON	Low
Tier 4: Advanced Simulations (High Complexity)
Extension	Description	Effort
🧊 True 3D grid	3D lattice of oscillators (not just 3D view)	High
🔀 Multi-population	Different oscillator types with cross-coupling	High
🌡️ Temperature/noise control	Thermal fluctuations with phase transitions	Medium
🎭 Frustrated coupling	XY model with frustration (spin glass behavior)	Medium




read the extensions.md and fix the broken table. 
include 
Draw

You can interact with the simulation by drawing on the canvas. Press the Clear button to clear the entire canvas and then draw to seed a new pattern. Hold down the ctrl key to erase instead of draw.


Scale

The Scale sliders adjusts the relative size of the pattern. The scales can vary across the simulation grid using the Scale Radial, Scale Random, or Scale Ring sliders, and these effects can be combined. Larger scales usually require less computation, so that can help the simulation run faster if your hardware is limited.


Speed

This slider allows speeding up or slowing down the simulation. However, you might not see any effect when increasing the speed if the fps shown in the application is already below your screen's refresh rate. A typical refresh rate is 60 frames per second (fps). To stop the simulation altogether press the Pause button.

Flow

These sliders add a velocity field to the the simulation, with options to flow in various ways across the grid. The different types of flow can be combined, and each can be in a positive or negative direction. The center positions of the sliders represent zero, and they should snap there slightly when you slide past that position. To avoid the snap at zero, hold down the ctrl key while sliding.
we have radial, rotate, swirl, bubble, ring, vortex, vertical 


Orientation

These sliders give an orientation map to the results by causing the diffusion to occur faster in one direction than another. The positive and negative directions will usually appear the same, but can make a difference if you combine multiple orientation types. The Orientation Linear slider gives vertical orientation when positive, or horizontal when negative.
we have radial, circles, swirl, bubble, linear

Adjust colors

Experiment with different color map and color settings. Hopefully these are self explanatory. there are sliders for hue, saturation, brightness, contrast, frequency, phase


Aspect ratio

The aspect ratio of the simulation canvas should default to the aspect ratio of your monitor, so it will fit your screen when in fullscreen mode. You can adjust the aspect ratio manually by dragging the lower left corner of the canvas up or down. If the canvas reaches the bottom of the browser window, try making your whole window narrower first.


Saving settings

As you adjust the sliders and options, the URL in your browser is automatically updated with a random looking string of characters that encodes all the current parameter values. You can save, forward, or bookmark that URL to preserve specific combinations of settings.

for next extensions and fit them in the tiers and reprioritize everything. it should be one extensive beautifully formated document