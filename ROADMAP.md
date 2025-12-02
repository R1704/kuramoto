# Kuramoto Reservoir Computing - Implementation Roadmap

## Current Status (Phase 1 Complete)
- ✅ Statistics infrastructure (local R, global R, susceptibility)
- ✅ K-scan for empirical Kc estimation
- ✅ Time series visualization
- ✅ GPU readback pipeline
- ✅ Performance optimization (throttled stats for small grids)
- ✅ Lyapunov exponent calculator (tangent-space linearization method)
- ✅ Susceptibility Y-axis visualization
- ✅ Statistics toggle (enable/disable for performance)
- ✅ Smoothing modes (nearest, bilinear, bicubic Catmull-Rom, Gaussian 3×3)
- ✅ Grid resize interpolation (phase-aware for θ, scalar for ω)
- ✅ **Reservoir Computing Phase 1** (see below)

---

## Criticality Detection Methods

### 1. Susceptibility Peak (χ-peak) - IMPLEMENTED ✅
**Method**: χ = N × Var(R) peaks at the critical point
- Run K-scan from low to high coupling
- Measure R and variance at each K
- Find K where χ is maximum

**Pros**: Simple, empirical, works well in practice
**Cons**: Requires full K-scan, sensitive to finite-size effects

### 2. Lyapunov Exponent (LLE) - IMPLEMENTED ✅
**What it measures**: Rate of trajectory divergence

$$\lambda = \lim_{t \to \infty} \frac{1}{t} \ln \frac{|\delta \theta(t)|}{|\delta \theta(0)|}$$

**Interpretation**:
| LLE (λ) | Meaning | RC Suitability |
|---------|---------|----------------|
| λ > 0 | Chaotic (exponential divergence) | Poor - unreliable |
| λ ≈ 0 | Critical (edge of chaos) | **Optimal** |
| λ < 0 | Stable (exponential convergence) | Poor - no memory |

**Algorithm** (Tangent-Space Linearization):

Our implementation uses the correct tangent-space method rather than the naive dual-trajectory approach:

1. **Jacobian Construction**: For each oscillator pair:
   $$J_{ij} = \frac{K}{N} \cos(\theta_j - \theta_i)$$

2. **Perturbation Evolution**: Track infinitesimal perturbation δθ:
   $$\delta\theta(t + \Delta t) = \delta\theta(t) + \Delta t \cdot J \cdot \delta\theta(t)$$

3. Every T steps (renormalization interval):
   - Measure perturbation magnitude d = ||δθ||
   - Accumulate: sum += log(d/δ₀)
   - **Renormalize**: δθ ← δ₀ × δθ/d

4. LLE = sum / (n × T × dt)

**Why tangent-space?** The naive approach of running two separate trajectories fails because:
- Both trajectories quickly synchronize to the same attractor
- Perturbations don't grow along unstable manifolds
- Results in artificially low/constant Lyapunov estimates (~1.7)

The tangent-space method correctly linearizes the dynamics and tracks infinitesimal perturbation growth.

### 3. Finite-Size Scaling - PLANNED
**What it measures**: How properties scale with system size N

At the true critical point, order parameter scales as:
$$R(K_c, N) \sim N^{-\beta/\nu}$$

**Method**:
1. Run K-scans at multiple sizes: N = 64², 128², 256², 512²
2. For each N, find apparent Kc(N) from χ-peak
3. Plot Kc(N) vs 1/√N
4. Extrapolate to N → ∞ for true Kc

**Note**: This is different from Lyapunov renormalization! FSS is about varying system size, not perturbation magnitude.

### 4. Jacobian Eigenvalue Analysis - NOT PLANNED
**Why**: O(N³) complexity makes it impractical for N > 10,000
For 256×256 grid (N=65,536), would need to compute eigenvalues of a 65,536×65,536 matrix.

---

## Phase 1: Input/Output Infrastructure ✅ COMPLETE

### 1.1 Input Injection Layer ✅
**Goal**: Inject external signals into oscillator dynamics

**Implemented**: Frequency modulation approach
- `ω_eff(t) = ω_i + input_weights[i] × input_signal × amplification`
- Input weights stored in GPU storage buffer (binding 7)
- Input signal stored in GPU uniform buffer (binding 8)
- Shader modified to apply input during integration step

**Input Regions**:
- Center (recommended for periodic boundaries)
- Left/Top edge (wraps around!)
- Random sparse

### 1.2 State Readout Layer ✅
**Goal**: Extract features from oscillator states for training

**Implemented**:
- Sparse sampling of up to 100 readout oscillators
- Feature extraction: sin(θ), cos(θ) for each readout
- Readout mask to mark non-input oscillators
- Async theta readback from GPU to CPU

### 1.3 State Snapshot Buffer ✅
- Ring buffer of 10 recent feature vectors
- Concatenated for temporal features (2000 total features)
- Warmup period to fill history buffer

## Phase 2: Training Infrastructure ✅ COMPLETE

### 2.1 Online Learning (RLS) ✅
**Implemented**: Recursive Least Squares instead of batch training
- O(n²) per update instead of O(n³) total
- Forgetting factor λ = 0.995 for adaptation
- Instant weight updates during training
- No need to collect and batch process samples

### 2.2 Training Tasks ✅
1. **Sine wave prediction**: sin(ωt) → sin(ω(t+τ)), τ=10 steps
2. **NARMA-10**: Nonlinear autoregressive moving average benchmark  
3. **Memory capacity**: Recall input from τ timesteps ago

### 2.3 Performance Metrics ✅
- NRMSE (Normalized Root Mean Square Error) displayed in real-time
- Live prediction vs target plot
- Sample counter

### 2.4 UI Controls ✅
- Enable/disable RC toggle
- Input/output region selectors
- Input strength slider
- Train / Stop & Test buttons
- Task selector dropdown
- Real-time metrics display

## Phase 3: Advanced Features (NEXT)

### 3.1 Multiple Input Channels
- Support for multiple simultaneous input signals
- Different input regions for different channels
- Multi-dimensional prediction tasks

### 3.2 Closed-Loop Control
- Use prediction output to control system parameters
- Feedback from readout to input
- Autonomous pattern generation

### 3.3 Criticality-Aware Operation
- Auto-tune K to operate near estimated Kc
- Real-time stability monitoring
- Dynamic K adjustment based on task performance

### 3.2 Graph Topology Experiments
Test RC performance with different coupling structures:
- [ ] Small-world networks (Watts-Strogatz)
- [ ] Scale-free networks (Barabási-Albert)
- [ ] Hierarchical modular networks
- [ ] Random sparse vs regular lattice

### 3.3 Multi-scale Readout
- Pool features at multiple spatial scales
- Wavelet-like decomposition of phase field
- Fourier modes of phase distribution

## Phase 4: Applications

### 4.1 Time Series Prediction
- Stock/weather forecasting benchmark
- Lorenz attractor prediction
- Fluid dynamics (simplified)

### 4.2 Pattern Recognition
- MNIST digit classification (temporal encoding)
- Spoken digit recognition
- Gesture recognition from sensor data

### 4.3 Control Tasks
- Cart-pole balancing
- Simple robot locomotion patterns

---

## Technical Notes

### Criticality Detection Options

| Method | Pros | Cons | Status |
|--------|------|------|--------|
| χ-peak (K-scan) | Simple, empirical | Requires K-scan | ✅ Done |
| Lyapunov exponent | Direct stability measure | CPU-intensive | ✅ Done |
| Finite-size scaling | Theoretically grounded | Needs multiple N | Medium priority |
| Jacobian eigenvalue | Rigorous | O(N³) cost | Only for small N |

### Smoothing/Interpolation Modes

| Mode | Algorithm | Quality | Performance |
|------|-----------|---------|-------------|
| Nearest (0) | Direct sampling | Pixelated | Fastest |
| Bilinear (1) | 4-neighbor linear | Good | Fast |
| Bicubic (2) | 16-neighbor Catmull-Rom | Excellent | Medium |
| Gaussian (3) | 3×3 convolution | Soft/smooth | Medium |

### Grid Resize Interpolation

When resizing the grid, different data types require different interpolation:
- **Phases (θ)**: Phase-aware interpolation with proper wrap-around (0 ↔ 2π)
- **Frequencies (ω)**: Standard scalar interpolation (no wrapping)

This prevents artifacts like sharp clusters appearing after resize.

### Performance Targets
- Training: 1000+ timesteps at 60fps (16ms/frame)
- Inference: Real-time at 60fps
- Feature extraction: <1ms latency

### Data Flow
```
Input Signal → Input Buffer → GPU Simulation → Feature Extraction → CPU Readout
                                    ↓
                              Phase Display
```

---

## Next Steps (Immediate)

1. **Test RC with different patterns** - Find optimal dynamics for reservoir computing
2. **Benchmark on NARMA-10** - Standard RC comparison metric
3. **Visualize input region** - Show which oscillators receive input
4. **Add memory capacity test** - Measure information retention
5. **Explore criticality connection** - Does K near Kc improve RC?
6. **Multi-input channels** - Support multiple simultaneous signals

