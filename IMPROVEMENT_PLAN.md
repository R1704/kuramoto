# 🚀 Kuramoto Simulation Improvement Plan

## Current Issues to Address

### 1. ✅ **FIXED: Kernel Size Display Bug**
- **Problem**: Kernel extent always showed "3.5 cells" regardless of sigma2 value
- **Root Cause**: Used hardcoded constant `3.5` instead of actual `state.sigma2 * 3.5`
- **Solution**: Changed to `(state.sigma2 * 3.5).toFixed(1)` to show actual extent
- **Status**: FIXED

### 2. **Kernel Visualization Accuracy**
- **Problem**: Grid cell size indicator is theoretically correct but visually unclear
- **Current**: Shows 1 grid cell as small square in corner
- **Issue**: Hard to relate to actual simulation grid
- **Improvements Needed**:
  - Add overlay grid lines on 2D kernel showing actual grid cell boundaries
  - Show multiple cells (e.g., 5×5 grid overlay) for better spatial reference
  - Add radius markers at σ and σ₂ distances
  - Display actual range in pixels: "Kernel covers ~12 grid cells"

### 3. **UI Parameter Organization**
**Current structure is confusing:**
```
Coupling Kernel Section:
├── Kernel Shape Dropdown        <-- Primary selector
├── Shape-specific controls       <-- Appear dynamically
├── Kernel Composition           <-- Way at bottom
│   ├── Secondary Shape          <-- Separated from primary
│   └── Mix Ratio
├── σ, σ₂, β                     <-- Shared params in middle
```

**Proposed reorganization:**
```
Coupling Kernel Section:
├── Global Parameters (Always visible)
│   ├── σ (Inner/Excitation)    <-- Core params at TOP
│   ├── σ₂ (Outer/Inhibition)
│   └── β (Inhibition Strength)
│
├── Primary Kernel
│   ├── Shape Selection
│   └── Shape-specific controls (orientation, aspect, etc.)
│
├── Kernel Composition (Optional)
│   ├── ☑ Enable Composition
│   ├── Secondary Kernel
│   │   ├── Shape Selection
│   │   └── Shape-specific controls
│   └── Mix Ratio
│
└── Kernel Visualization Link
    └── → See "Kernel Visualizers" panel
```

### 4. **Grid vs Kernel Resolution**
- **Problem**: "The kernel is more fine-grained than the grid cell"
- **Reality**: 
  - **Simulation**: Each grid cell has ONE oscillator
  - **Kernel**: Continuous function evaluated at integer grid positions
  - **Confusion**: Visualization shows smooth kernel, but simulation is discrete
  
- **Improvements**:
  - Add toggle: "Show Discrete Grid" (overlay grid lines on 2D kernel viz)
  - Show sampled kernel values at grid points (dots on visualization)
  - Add explanation: "Kernel shown continuous for clarity, but sampled at grid points in simulation"
  - Option to show "effective neighborhood" (which cells actually couple)

---

## Strategic Vision: Where to Take This Project

### Phase 1: **Core Simulation** ✅ (COMPLETE)
- [x] 6 coupling rules implemented
- [x] WebGPU acceleration (1M oscillators possible)
- [x] 3D/2D visualization
- [x] External image/video input
- [x] Dynamic grid resizing

### Phase 2: **Advanced Kernels** ✅ (COMPLETE)
- [x] 6 kernel shapes (Isotropic, Anisotropic, Multi-scale, Asymmetric, Step, Multi-ring)
- [x] Kernel composition (mixing two shapes)
- [x] Separate orientation parameters
- [x] Multi-ring customization (5 rings, individual widths/weights)

### Phase 3: **Adaptive Dynamics** (NEXT - 3-4 weeks)

#### 3A. Adaptive Spatial Scales
**Motivation**: Fixed kernel sizes limit emergent behavior. Let the system self-organize its coupling ranges.

**Implementation**:
```javascript
// Per-oscillator adaptive sigma
sigma[i](t+1) = sigma[i](t) + ε_σ · (R_target - R_i(t))

Where:
- R_i = local order parameter (synchronization level)
- R_target = desired coherence (e.g., 0.5 for edge-of-chaos)
- ε_σ = adaptation rate (0.001 - 0.1)
```

**New Parameters**:
- `adaptiveSigma`: boolean (enable/disable)
- `sigmaAdaptRate`: learning rate
- `sigmaTargetOrder`: target synchronization
- `sigmaMin`, `sigmaMax`: bounds (prevent collapse/explosion)

**Buffer Requirements**:
- `sigmaBuf`: N × float32 (per-oscillator sigmas)
- `sigma2Buf`: N × float32 (per-oscillator inhibition range)

**Use Cases**:
- **Self-organizing domains**: Synchronized regions shrink coupling (stabilize), chaotic regions expand (recruit)
- **Dynamic chimeras**: Boundary maintains itself through local adaptation
- **Criticality**: System tunes itself to edge of synchronization transition

#### 3B. Frequency-Selective Coupling
**Motivation**: Biological oscillators (neurons, circadian clocks) preferentially sync with similar frequencies.

**Implementation**:
```javascript
// Weight coupling by frequency similarity
w_ij = w_spatial(r_ij) · exp(-(ω_i - ω_j)² / (2σ_ω²))

Where:
- w_spatial = standard kernel weight
- σ_ω = frequency bandwidth (how selective)
```

**New Parameters**:
- `frequencySelectivity`: boolean
- `sigmaOmega`: frequency bandwidth (0.1-2.0)
  - High = broad (couples to all frequencies)
  - Low = narrow (only couples to similar ω)

**Use Cases**:
- **Frequency clustering**: Similar-ω oscillators form spatial domains
- **Multi-band patterns**: Distinct frequency groups create layered patterns
- **Resonance**: Oscillators "search" for matching partners

#### 3C. Adaptive Inhibition (Beta Plasticity)
**Motivation**: Fixed inhibition can be too strong (kills patterns) or too weak (over-synchronizes).

**Implementation**:
```javascript
// Adapt beta based on local order gradient
beta[i](t+1) = beta[i](t) + ε_β · (|∇R_i| - ∇_target)

Where:
- |∇R_i| = spatial gradient of order (high at boundaries)
- ∇_target = target gradient (sharpness preference)
```

**New Parameters**:
- `adaptiveBeta`: boolean
- `betaAdaptRate`: learning rate
- `betaTargetGradient`: desired boundary sharpness
- `betaMin`, `betaMax`: bounds

**Use Cases**:
- **Boundary sharpening**: Domain edges increase inhibition (self-maintain)
- **Chimera stabilization**: Extends lifetime of order-chaos coexistence
- **Pattern selection**: System chooses optimal inhibition for stable patterns

---

### Phase 4: **Novel Kernel Architectures** (4-6 weeks)

#### 4A. Gabor Kernels (Spatially Localized Oscillations)
```javascript
w(x, y) = exp(-(x² + y²)/(2σ²)) · cos(k_x·x + k_y·y + φ)

Where:
- (k_x, k_y) = spatial frequency (wavenumber vector)
- φ = phase offset
```

**Applications**:
- Visual cortex models (oriented edge detectors)
- Stripe/grid pattern formation
- Resonant spatial modes

**UI Controls**:
- Spatial frequency magnitude & angle
- Phase offset
- Envelope width (σ)

#### 4B. Power-Law Kernels (Long-Range Interactions)
```javascript
w(r) = 1 / (r + r_0)^α

Where:
- α ∈ [1, 3] = decay exponent
- r_0 = cutoff to prevent singularity at r=0
```

**Applications**:
- Scale-free networks
- Critical phenomena (α ≈ 2)
- Long-range synchronization

**Research Question**: Does power-law coupling lead to self-organized criticality?

#### 4C. User-Drawable Kernels (Interactive Design)
**Concept**: Let users draw arbitrary 1D kernel profiles directly on canvas

**Implementation**:
1. Interactive HTML5 canvas with click-and-drag drawing
2. Spline interpolation between points
3. Rotate to 2D (radially symmetric from 1D profile)
4. Upload kernel data to GPU as texture/buffer

**Use Cases**:
- Rapid prototyping of novel kernels
- Educational tool (see immediate effect of kernel shape)
- Discovery of unexpected emergent patterns

---

### Phase 5: **Multi-Layer & Network Extensions** (Long-term - 2-3 months)

#### 5A. Two-Layer Kuramoto
**Motivation**: Model systems with fast/slow variables (e.g., neural fields with inhibitory interneurons)

**Architecture**:
```
Layer 1 (Fast): dθ₁/dt = ω₁ + K₁·〈sin(θ₁ⱼ - θ₁ᵢ)〉 + C·〈sin(θ₂ⱼ - θ₁ᵢ)〉
Layer 2 (Slow): dθ₂/dt = ε·ω₂ + K₂·〈sin(θ₂ⱼ - θ₂ᵢ)〉 + D·〈sin(θ₁ⱼ - θ₂ᵢ)〉

Where:
- ε << 1 = slow timescale ratio
- C, D = cross-layer coupling strengths
```

**Buffer Requirements**:
- Double all buffers (theta1, theta2, omega1, omega2)
- +256 MB for 512×512 grid (manageable)

**Visualization**:
- Color layer 1 by phase (hue)
- Overlay layer 2 as brightness/saturation
- Or side-by-side 3D surfaces

**Use Cases**:
- Inhibitory stabilization (layer 2 = slow inhibitory pool)
- Multi-timescale patterns
- Cortical oscillations (gamma on top of theta)

#### 5B. Graph-Based Coupling (Non-Grid Topologies)
**Motivation**: Not all systems are spatial grids. Model social networks, neuronal connectivity, etc.

**Approach**:
1. Load adjacency matrix from file/API
2. Store edge list in GPU buffer
3. Modify shader to iterate over neighbors (not grid positions)

**Topology Options**:
- Small-world (Watts-Strogatz)
- Scale-free (Barabási-Albert)
- Random (Erdős-Rényi)
- Custom (user-uploaded)

**Challenge**: Variable neighbor counts → need dynamic indexing

#### 5C. External Forcing & Control
**Add time-varying external drive:**
```javascript
dθ/dt = ω + K·〈sin(θⱼ - θᵢ)〉 + F(t)·sin(ω_drive·t - θ)

Where:
- F(t) = forcing amplitude (can vary)
- ω_drive = driving frequency
```

**Applications**:
- **Entrainment**: Lock oscillators to external rhythm
- **Resonance**: Drive at natural frequency → amplification
- **Desynchronization**: Apply control to break pathological sync (e.g., Parkinson's deep brain stimulation)

**UI**:
- Forcing amplitude slider
- Driving frequency input
- Temporal modulation (constant, pulsed, sine-wave envelope)

---

### Phase 6: **Analysis & Measurements** (Ongoing)

#### 6A. Real-Time Statistics Panel
**Add quantitative metrics dashboard:**

```
┌─ Statistics ──────────────────┐
│ Global Order (R):     0.73    │
│ Domain Count:         3        │
│ Mean Frequency:       1.2 Hz  │
│ Frequency Std:        0.4 Hz  │
│ Pattern Entropy:      2.1 bits│
│ Chimera Index:        0.45    │
└───────────────────────────────┘
```

**Metrics**:
- **Global Order (R)**: |⟨e^(iθ)⟩| (0=chaos, 1=sync)
- **Local Order Distribution**: Histogram of R_i
- **Chimera Index**: Ratio of synchronized/desynchronized area
- **Spatial Correlation**: How far does order extend?
- **Temporal Correlation**: Pattern persistence time

**Implementation**:
- Compute on GPU (reduction shaders)
- Display in HTML div (update every N frames)

#### 6B. Time-Series Recording
**Export data for external analysis:**

**Features**:
- Record state snapshots at regular intervals
- Export formats: CSV, JSON, HDF5 (via WASM)
- Choose variables: theta, omega, local order
- Spatial regions: full grid or ROI

**Use Cases**:
- Offline analysis in Python/MATLAB
- Publication figures
- Machine learning training data

#### 6C. Parameter Sweeps
**Automated exploration of parameter space:**

**UI**:
- Select parameter (e.g., K₀)
- Set range (0.5 to 2.0)
- Set steps (20)
- Choose metric (global order)

**Execution**:
- Run simulation for each parameter value
- Measure steady-state metric
- Plot bifurcation diagram

**Applications**:
- Find critical transitions
- Map phase diagrams
- Optimize for desired patterns

---

### Phase 7: **Performance & Scalability** (Optimization)

#### 7A. Sparse Kernel Evaluation
**Current**: Evaluate kernel for all oscillators within cutoff radius

**Problem**: Wastes computation on near-zero weights at kernel tails

**Solution**: 
- Precompute kernel support radius (where |w| < threshold)
- Only iterate over oscillators within support
- Adaptive: Expand support if kernel changes shape

**Expected Speedup**: 2-3× for large grids

#### 7B. Multi-GPU Support
**For grids > 1024×1024:**

**Approach**:
- Partition grid into tiles
- Assign tile to each GPU
- Exchange boundary data each step
- Synchronize via CPU

**WebGPU Limitation**: Single-device API currently
**Workaround**: Multiple WebGPU contexts (experimental)

#### 7C. Compute Shader Optimization
**Current bottlenecks:**
- Atomic operations in order parameter reduction
- Transcendental functions (sin, cos, exp)

**Optimizations**:
- Use fast math approximations (optional)
- Shared memory for neighbor data
- Occupancy tuning (workgroup size)

---

## Integration of Past Ideas

### From Our Discussions

1. **✅ Kernel Composition** (DONE)
   - Mix two kernel shapes
   - Enables hybrid patterns (e.g., anisotropic + asymmetric = directional stripes)

2. **✅ Multi-Ring Customization** (DONE)
   - Up to 5 rings with independent widths/weights
   - Creates target waves, nested patterns

3. **⏳ Adaptive Sigma** (PLANNED - Phase 3A)
   - Self-organizing spatial scales
   - Chimera stabilization

4. **⏳ Frequency-Selective Coupling** (PLANNED - Phase 3B)
   - Oscillators couple preferentially to similar frequencies
   - Multi-band patterns

5. **⏳ Adaptive Beta** (PLANNED - Phase 3C)
   - Dynamic inhibition strength
   - Boundary sharpening

6. **⏳ Gabor Kernels** (PLANNED - Phase 4A)
   - Spatially localized oscillations
   - Visual cortex modeling

7. **⏳ Two-Layer Systems** (PLANNED - Phase 5A)
   - Fast/slow variable coupling
   - Multi-timescale dynamics

8. **⏳ Graph Topologies** (PLANNED - Phase 5B)
   - Beyond spatial grids
   - Network models

---

## Immediate Next Steps (Priority Order)

### Week 1: Polish Current Features
1. ✅ **Fix kernel size display bug** (DONE)
2. **Improve kernel visualizer**:
   - Add grid overlay option
   - Show σ and σ₂ radius circles
   - Display discrete sampling points
3. **Reorganize UI** (see section 3 above):
   - Move σ, σ₂, β to top
   - Clearer primary/secondary separation
   - Better collapsible section labels
4. **Add tooltips/help**:
   - Hover info on all parameters
   - "?" icons with explanations
   - Link to documentation

### Week 2-3: Adaptive Sigma (Phase 3A)
1. Add per-oscillator sigma buffers
2. Implement adaptation rule in shader
3. Add UI controls (adapt rate, target order, bounds)
4. Visualize sigma distribution (new colormap mode)
5. Test on chimera states (does it stabilize them?)

### Week 4: Frequency-Selective Coupling (Phase 3B)
1. Modify kernel weight calculation
2. Add frequency similarity term
3. UI controls (sigma_omega slider)
4. Test on heterogeneous frequency distributions
5. Document new patterns observed

### Week 5-6: Adaptive Beta (Phase 3C)
1. Per-oscillator beta buffers
2. Compute order gradients
3. Beta adaptation rule
4. Visualize beta distribution
5. Test boundary sharpening

### Week 7-8: Gabor Kernels (Phase 4A)
1. Implement Gabor kernel shape
2. Add spatial frequency controls
3. Test stripe/grid formation
4. Compare with anisotropic kernel

---

## Success Metrics

### Technical
- [ ] Simulation runs at 60 FPS for 512×512 grid
- [ ] All adaptive features stable (no divergence)
- [ ] GPU memory usage < 2 GB

### Scientific
- [ ] Demonstrate novel emergent patterns (not in literature)
- [ ] Quantify chimera lifetime extension with adaptive beta
- [ ] Show frequency clustering with selective coupling

### User Experience
- [ ] Intuitive parameter organization (user testing)
- [ ] Clear kernel visualization (relate to grid)
- [ ] Responsive UI (no lag during parameter changes)

### Publication
- [ ] 2-3 novel findings documented
- [ ] High-quality figures generated
- [ ] Code released open-source (GitHub)
- [ ] Paper draft: "Adaptive Spatial Coupling in Kuramoto Oscillator Arrays"

---

## Long-Term Vision (1 Year+)

### Educational Platform
- **Interactive textbook**: Embed simulation in educational content
- **Problem sets**: Guided explorations for students
- **Visualization gallery**: Showcase beautiful patterns

### Research Tool
- **Plugin system**: Users can add custom rules/kernels
- **Cloud backend**: Run large-scale sweeps on server
- **Collaboration**: Share configurations via URL

### Art & Music
- **MIDI output**: Phase → musical notes
- **Real-time audio reactive**: Music drives oscillators
- **Generative art**: Export high-res renders

---

## Resources Needed

### Development
- **Time**: ~3-4 hrs/week for next 8 weeks (Phase 3)
- **Testing**: Access to multiple GPUs for performance testing
- **Documentation**: Keep DOCUMENTATION.md updated

### Research
- **Literature review**: Survey recent adaptive coupling papers
- **Collaboration**: Reach out to dynamical systems researchers
- **Validation**: Compare results with published work

### Community
- **GitHub Issues**: Track bugs and feature requests
- **Discussions**: Engage users for feedback
- **Blog/Videos**: Explain new features and science

---

## Decision Points

### Should We Implement?

| Feature | Priority | Complexity | Impact | Decision |
|---------|----------|------------|--------|----------|
| Adaptive Sigma | **High** | Medium | High (novel) | ✅ YES |
| Freq-Selective | **High** | Low | High (bio-realistic) | ✅ YES |
| Adaptive Beta | Medium | Medium | Medium | ✅ YES (Phase 3) |
| Gabor Kernels | Medium | Low | Medium | ✅ YES (Phase 4) |
| Power-Law | Low | Low | Low (incremental) | ⏸️ MAYBE |
| User-Drawable | High | High | High (engagement) | ⏸️ LATER |
| Two-Layer | Low | High | Medium | ⏸️ LATER |
| Graph Topology | Low | Very High | Medium | ❌ NO (major rewrite) |
| Multi-GPU | Low | Very High | Low (most users 1 GPU) | ❌ NO |

### Key Questions

1. **Adaptive features**: Will they produce truly novel patterns, or just parameter drift?
   - **Test**: Run long simulations, compare with fixed params

2. **User-drawable kernels**: Worth the dev effort?
   - **Test**: Gauge interest from community feedback

3. **Two-layer**: Interesting enough to justify complexity?
   - **Test**: Read recent papers on two-layer Kuramoto

---

## Conclusion

**Current State**: Solid foundation with 6 rules, 6 kernel shapes, composition, multi-ring.

**Next Phase**: Adaptive dynamics (sigma, beta, frequency-selective) → Novel emergent phenomena

**Long-Term**: Multi-layer, analysis tools, educational platform

**Goal**: Create the most comprehensive, beautiful, and scientifically valuable Kuramoto simulation on the web.

---

**Document Version**: 1.0  
**Created**: November 2025  
**Next Review**: After Phase 3A completion
