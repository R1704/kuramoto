# 🚀 Comprehensive Extensions for Kuramoto Dynamics

This document outlines advanced extensions to move beyond the basic 2D grid of coupled phase oscillators. We examine four major directions, each with increasing complexity and biological/computational relevance.

---

## **Table of Contents**

1. [Extension 1: n-Dimensional Unit Vectors (S^n)](#extension-1-n-dimensional-unit-vectors-sn)
2. [Extension 2: Hierarchical (Deep) Layers](#extension-2-hierarchical-deep-layers)
3. [Extension 3: Hebbian Learning & Plasticity](#extension-3-hebbian-learning--plasticity)
4. [Extension 4: Arbitrary Graph Topologies](#extension-4-arbitrary-graph-topologies)
5. [Synthesis: Combining Extensions](#synthesis-combining-extensions)
6. [Implementation Roadmap](#implementation-roadmap)

---

## **Extension 1: n-Dimensional Unit Vectors (S^n)**

### Motivation

Current model: Each oscillator has a **scalar phase** $\theta_i \in [0, 2\pi)$ on the circle $S^1$.

**Why extend to vectors?**
- **Biological realism**: Neural populations, protein orientations, bacterial swimming
- **Richer dynamics**: Nematic order, topological defects, quaternion rotations
- **Mathematical depth**: Explores high-dimensional synchronization phenomena

### Mathematical Foundation

#### Current: Scalar Phases on S¹

$$\frac{d\theta_i}{dt} = \omega_i + K \sum_{j} \sin(\theta_j - \theta_i)$$

**State space**: Circle $S^1 = \{e^{i\theta} : \theta \in [0, 2\pi)\}$

#### Generalized: Unit Vectors on S^(n-1)

$$\frac{d\mathbf{v}_i}{dt} = \boldsymbol{\omega}_i + K \sum_{j} \sin(\alpha_{ij}) \cdot \hat{\mathbf{c}}_{ij}$$

Where:
- $\mathbf{v}_i \in \mathbb{R}^n$ with $||\mathbf{v}_i|| = 1$ (unit vector)
- $\cos(\alpha_{ij}) = \mathbf{v}_i \cdot \mathbf{v}_j$ (dot product gives angle)
- $\hat{\mathbf{c}}_{ij}$ = coupling direction along geodesic on sphere

**Coupling direction** (tangent to sphere):
$$\hat{\mathbf{c}}_{ij} = \frac{\mathbf{v}_j - (\mathbf{v}_j \cdot \mathbf{v}_i)\mathbf{v}_i}{||\mathbf{v}_j - (\mathbf{v}_j \cdot \mathbf{v}_i)\mathbf{v}_i||}$$

This projects $\mathbf{v}_j$ onto the **tangent plane** at $\mathbf{v}_i$.

### Dimensional Examples

| Dimension | Sphere | Representation | Applications |
|-----------|--------|----------------|--------------|
| **n=2** | S¹ (circle) | $[\cos\theta, \sin\theta]$ | Current system |
| **n=3** | S² (2-sphere) | $[x, y, z]$ with $x^2+y^2+z^2=1$ | Magnetic spins, protein folding |
| **n=4** | S³ (3-sphere) | Quaternions $w+xi+yj+zk$ | 3D rotations, orientation dynamics |
| **n>>4** | S^(n-1) | High-dim vectors | Neural population codes |

### Implementation: S² (3D Unit Vectors)

**GPU Buffer Layout:**
```wgsl
struct Vector3 {
    x: f32,
    y: f32,
    z: f32,
    padding: f32,  // Align to 16 bytes
}

@group(0) @binding(0) var<storage, read_write> states: array<Vector3>;
@group(0) @binding(1) var<storage, read> omegas: array<Vector3>;
```

**Compute Shader (Simplified):**
```wgsl
fn compute_step(i: u32) {
    let v_i = normalize(vec3f(states[i].x, states[i].y, states[i].z));
    var dv = vec3f(omegas[i].x, omegas[i].y, omegas[i].z);
    
    // Sum over neighbors
    for (var j = 0u; j < neighbor_count; j++) {
        let v_j = normalize(vec3f(states[j].x, states[j].y, states[j].z));
        
        // Angle between vectors
        let cos_alpha = dot(v_i, v_j);
        let sin_alpha = sqrt(max(0.0, 1.0 - cos_alpha * cos_alpha));
        
        // Tangent component (coupling direction)
        let c_ij = normalize(v_j - cos_alpha * v_i);
        
        // Accumulate coupling force
        dv += K * sin_alpha * c_ij;
    }
    
    // Update and renormalize to stay on sphere
    let v_new = normalize(v_i + dt * dv);
    states[i] = Vector3(v_new.x, v_new.y, v_new.z, 0.0);
}
```

**Key Operation: Renormalization**

After each update, vectors **must** be renormalized:
$$\mathbf{v}_i^{\text{new}} = \frac{\mathbf{v}_i + \Delta t \cdot \frac{d\mathbf{v}_i}{dt}}{||\mathbf{v}_i + \Delta t \cdot \frac{d\mathbf{v}_i}{dt}||}$$

### Visualization Strategies

**Challenge**: How to display 3D+ vectors on a 2D screen?

#### Option A: Stereographic Projection

Project S² → ℝ²:
```
North pole: (0, 0, 1)
Projected point: (x/(1-z), y/(1-z))
```

#### Option B: Color Mapping

```wgsl
fn vector_to_color(v: vec3f) -> vec4f {
    // Azimuthal angle → Hue
    let hue = atan2(v.y, v.x) / (2.0 * 3.14159);
    
    // Polar angle → Brightness
    let brightness = 0.5 + 0.5 * v.z;
    
    return hsv_to_rgb(hue, 1.0, brightness);
}
```

#### Option C: Quiver Plot (3D Arrows)

Render small arrows at each grid position showing vector direction.

### New Phenomena on S^n

1. **Nematic Order** (S²): 
   - Vectors have head-tail symmetry: $\mathbf{v} \equiv -\mathbf{v}$
   - Allows topological defects with **±1/2 winding** (not just ±1)
   - Forms stripe patterns, not spirals

2. **Quaternion Dynamics** (S³):
   - Represents 3D rotations without gimbal lock
   - Couples rotational degrees of freedom
   - Applications: Satellite attitude control, robotic swarms

3. **High-Dimensional Effects**:
   - **Concentration of measure**: Random vectors in S^(n-1) are nearly orthogonal when n is large
   - Harder to synchronize (requires stronger coupling)
   - Neural population codes live in S^(100+)

### Generalized Order Parameter

For scalar phases: $Z = \frac{1}{N}\sum_i e^{i\theta_i}$, $|Z| \in [0,1]$

For vector states:
$$\mathbf{Z} = \frac{1}{N}\sum_{i=1}^{N} \mathbf{v}_i \in \mathbb{R}^n$$

- **Magnitude**: $|\mathbf{Z}| \in [0, 1]$ measures synchronization
- **Direction**: $\mathbf{Z}/|\mathbf{Z}|$ shows mean orientation

---

## **Extension 2: Hierarchical (Deep) Layers**

### Motivation

Single-layer oscillators can synchronize, but **hierarchical organization** enables:
- **Abstraction**: Higher layers represent abstract features
- **Top-down attention**: Feedback from high to low layers
- **Multi-scale processing**: Different timescales at different layers

**Biological parallel**: Cortical hierarchy (V1 → V2 → V4 → IT)

### Architecture

```
Layer 2 (Abstract)    ●────●────●────●
                      ↕    ↕    ↕    ↕
Layer 1 (Features)   ●─●─●─●─●─●─●─●─●
                     ↕ ↕ ↕ ↕ ↕ ↕ ↕ ↕ ↕
Layer 0 (Input)     ●●●●●●●●●●●●●●●●●●

Connections:
─ Lateral coupling (within layer)
↕ Vertical coupling (between layers)
```

### Mathematical Formulation

For oscillator $i$ in layer $\ell$:

$$\frac{d\theta_i^\ell}{dt} = \omega_i^\ell + \underbrace{K_{\text{lat}} \sum_{j \in N_i^\ell} \sin(\theta_j^\ell - \theta_i^\ell)}_{\text{Lateral (same layer)}} + \underbrace{K_{\text{vert}} \sum_{k} \sin(\theta_k^{\ell \pm 1} - \theta_i^\ell)}_{\text{Vertical (adjacent layers)}}$$

**Key parameters**:
- $K_{\text{lat}}$: Within-layer coupling (feature binding)
- $K_{\text{vert}}$: Between-layer coupling (feed-forward/feedback)
- $\omega^\ell$: Layer-specific natural frequencies

### Feed-Forward vs Feedback

#### Feed-Forward (Bottom-Up)
```
Layer 1 receives input from Layer 0:
dθ₁/dt = ω₁ + K_lat Σ sin(θ₁_j - θ₁_i) + K_ff Σ sin(θ₀_k - θ₁_i)
```

**Effect**: Lower layers drive higher layers (sensory processing)

#### Feedback (Top-Down)
```
Layer 0 receives input from Layer 1:
dθ₀/dt = ω₀ + K_lat Σ sin(θ₀_j - θ₀_i) + K_fb Σ sin(θ₁_k - θ₀_i)
```

**Effect**: Higher layers modulate lower layers (attention, prediction)

#### Bi-Directional (Full)
```
Both feed-forward AND feedback active simultaneously
```

**Effect**: Hierarchical inference (predictive coding)

### Implementation

**GPU Buffer Structure:**
```javascript
// Flat buffer: [Layer 0, Layer 1, ..., Layer L]
// Total size: L × N × 4 bytes

const totalOscillators = NUM_LAYERS × gridSize × gridSize;
thetaBuf = device.createBuffer({
    size: totalOscillators × 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
```

**Compute Shader:**
```wgsl
struct Params {
    // ... existing params ...
    num_layers: u32,
    K_lateral: f32,
    K_vertical_ff: f32,  // Feed-forward strength
    K_vertical_fb: f32,  // Feedback strength
}

fn get_index(layer: u32, row: u32, col: u32) -> u32 {
    return layer * params.rows * params.cols + row * params.cols + col;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let layer = gid.z;  // Use Z dimension for layer
    let row = gid.y;
    let col = gid.x;
    
    let i = get_index(layer, row, col);
    let theta_i = theta[i];
    var dtheta = omega[i];
    
    // 1. Lateral coupling (same layer)
    for (var dr = -range; dr <= range; dr++) {
        for (var dc = -range; dc <= range; dc++) {
            if (dr == 0 && dc == 0) { continue; }
            let r_neighbor = (row + dr + params.rows) % params.rows;
            let c_neighbor = (col + dc + params.cols) % params.cols;
            let j = get_index(layer, r_neighbor, c_neighbor);
            dtheta += params.K_lateral * sin(theta[j] - theta_i);
        }
    }
    
    // 2. Vertical coupling (adjacent layers)
    if (layer > 0) {
        // Feed-forward from layer below
        let j = get_index(layer - 1, row, col);
        dtheta += params.K_vertical_ff * sin(theta[j] - theta_i);
    }
    
    if (layer < params.num_layers - 1) {
        // Feedback from layer above
        let j = get_index(layer + 1, row, col);
        dtheta += params.K_vertical_fb * sin(theta[j] - theta_i);
    }
    
    // Update
    theta_next[i] = theta_i + params.dt * dtheta;
}
```

**3D Workgroup Dispatch:**
```javascript
const workgroupsX = Math.ceil(gridSize / 16);
const workgroupsY = Math.ceil(gridSize / 16);
const workgroupsZ = NUM_LAYERS;

computePass.dispatchWorkgroups(workgroupsX, workgroupsY, workgroupsZ);
```

### Visualization: Multi-Layer View

**Option 1: Side-by-Side Panels**
```
┌──────────┬──────────┬──────────┐
│ Layer 0  │ Layer 1  │ Layer 2  │
│ (Input)  │(Features)│(Abstract)│
└──────────┴──────────┴──────────┘
```

**Option 2: 3D Stack**
```
Render layers at different heights:
y = 0:   Layer 0 (base)
y = 10:  Layer 1 (middle)
y = 20:  Layer 2 (top)

With transparency to see through
```

**Option 3: Animated Transition**
```
Press [ / ] to cycle through layers
Show one layer at a time with context
```

### Applications

1. **Feature Extraction**: Layer 0 = edges, Layer 1 = shapes, Layer 2 = objects
2. **Predictive Coding**: Top-down prediction vs bottom-up sensation
3. **Hierarchical Synchronization**: Different timescales at different layers
4. **Memory Consolidation**: Slow dynamics in higher layers

### Novel Patterns

- **Hierarchical Waves**: Traveling waves that propagate upward through layers
- **Layer-Specific Chimeras**: Synchronized in Layer 0, chaotic in Layer 1
- **Cross-Layer Resonance**: Frequency matching between layers creates binding

---

## **Extension 3: Hebbian Learning & Plasticity**

### Motivation

**Current**: Coupling strength $K$ is fixed and uniform.

**Biological reality**: Synaptic connections **strengthen** with correlated activity (Hebb's rule: "Neurons that fire together, wire together").

**Goal**: Make coupling weights $K_{ij}$ **dynamic** and **adaptive**.

### Mathematical Formulation

#### Standard Kuramoto (Fixed K)
$$\frac{d\theta_i}{dt} = \omega_i + K \sum_j \sin(\theta_j - \theta_i)$$

#### Hebbian Kuramoto (Adaptive K_ij)
$$\frac{d\theta_i}{dt} = \omega_i + \sum_j K_{ij}(t) \sin(\theta_j - \theta_i)$$

$$\frac{dK_{ij}}{dt} = \eta \cdot f(\theta_i, \theta_j) - \lambda K_{ij}$$

Where:
- $\eta$: Learning rate
- $f(\theta_i, \theta_j)$: Hebbian learning rule
- $\lambda K_{ij}$: Weight decay (prevents runaway growth)

### Learning Rules

#### Rule 1: Phase Difference Hebb

$$f(\theta_i, \theta_j) = \cos(\theta_j - \theta_i)$$

**Effect**:
- If $\theta_i \approx \theta_j$ (synchronized) → $f > 0$ → $K_{ij}$ increases
- If $\theta_i \approx \theta_j + \pi$ (anti-phase) → $f < 0$ → $K_{ij}$ decreases

#### Rule 2: Activity-Dependent Hebb

$$f(\theta_i, \theta_j) = \dot{\theta}_i \cdot \dot{\theta}_j$$

**Effect**: Strengthen connections when both oscillators are accelerating together

#### Rule 3: Order-Gated Hebb

$$f(\theta_i, \theta_j) = R_i \cdot R_j \cdot \cos(\theta_j - \theta_i)$$

Where $R_i$ is the local order parameter.

**Effect**: Only learn when both oscillators are in synchronized neighborhoods

### Implementation

**GPU Buffer for Weights:**
```javascript
// For N oscillators with max degree D:
// Weight matrix: N × D × 4 bytes (per neighbor)

weightsBuffer = device.createBuffer({
    size: N * MAX_DEGREE * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
```

**Two-Pass Update:**

**Pass 1: Update Phases (Using Current Weights)**
```wgsl
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
