# 🌀 Kuramoto Oscillators - WebGPU Simulation

[![WebGPU](https://img.shields.io/badge/WebGPU-enabled-blue)](https://github.com/gpuweb/gpuweb)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

An interactive, high-performance visualization of the **Kuramoto model** — a fundamental framework for studying synchronization in complex systems. This implementation uses **WebGPU compute shaders** to simulate up to 1 million coupled oscillators in real-time, with stunning 3D/2D visualizations and advanced features like external image/video input.

You can play with the demo [here](http://r1704.github.io/kuramoto/)

## 🎯 What is the Kuramoto Model?

The Kuramoto model describes how a large ensemble of coupled oscillators (pendulums, neurons, fireflies, etc.) synchronize despite having different natural frequencies. It's widely used in:

- **Neuroscience**: Brain synchronization, seizures, consciousness
- **Power Systems**: Grid stability, cascading failures
- **Biology**: Firefly flashing, circadian rhythms, cardiac pacemakers
- **Chemistry**: Oscillating reactions, chemical clocks
- **Physics**: Superconductors, laser arrays, plasma dynamics

### The Basic Equation

Each oscillator *i* evolves according to:

```
dθᵢ/dt = ωᵢ + K·⟨sin(θⱼ - θᵢ)⟩
```

Where:
- **θᵢ** = phase of oscillator *i* (0 to 2π)
- **ωᵢ** = natural frequency (intrinsic oscillation rate)
- **K** = coupling strength (how strongly oscillators influence each other)
- **⟨...⟩** = average over neighbors

## 🚀 Quick Start

### Browser Requirements

- **Chrome/Edge 113+** or **Firefox Nightly** or **Safari** with WebGPU enabled
- Modern GPU (2018+ recommended)

### Run Locally

```bash
# Clone the repository
git clone https://github.com/r1704/kuramoto.git
cd kuramoto

# Serve with any static file server
python -m http.server 8000
# or
npx serve

# Open http://localhost:8000
```

### First Steps

1. **Open** `index.html` in your browser
2. **Click** a preset button (e.g., "🌀 Single Spiral")
3. **Interact**:
   - **Drag** to rotate camera (3D mode)
   - **Scroll** to zoom
   - **Press keys** for quick controls (see [Keyboard Shortcuts](#keyboard-shortcuts))

## 📊 Features

### Six Coupling Rules

The simulation implements 6 different coupling mechanisms:

| Rule | Description | Best For |
|------|-------------|----------|
| **0: Classic** | Standard Kuramoto equation | Learning basics, global sync |
| **1: Coherence-Gated** | Coupling weakens in synchronized regions | Grain domains, pattern fragmentation |
| **2: Curvature-Aware** | Stronger coupling at phase gradients | Sharp waves, spiral enhancement |
| **3: Harmonics** | 2nd + 3rd harmonic coupling | Multi-cluster patterns, checkerboards |
| **4: Kernel-Based** | Spatial coupling kernels (Gaussian, elliptical, multi-scale, rings) | **Chimera states**, rich pattern formation |
| **5: Delay-Coupled** | Uses delayed phase from past timesteps | Emergent spirals, spatiotemporal chaos |

Switch rules using **keyboard 0-5** or the dropdown menu.

### 11 Colormap Modes

Rich visualization options including Phase, Velocity, Curvature, Order, Image Texture, Viridis, Plasma, Twilight, Inferno, Chirality, and Phase+Gradient. Colormaps are synchronized between 2D and 3D views for consistent visualization.

### Fast 2D Rendering

Dedicated 2D rendering path using a single full-screen triangle instead of N² instanced quads. Provides 2-5× speedup for large grids while maintaining full colormap and zoom/pan support.

### External Image/Video Input

Drive oscillator dynamics with images or live webcam:

1. Set **Frequency Pattern (ω)** to **"Image/Video Input"**
2. Upload image or click **"📷 Use Webcam"**
3. Image brightness → natural frequency
4. Set **Color Mode** to **"Image Texture"** for liquid painting effect
5. Switch to **2D view** (press **V**) for best visualization

**Use Cases:**
- Image segmentation (similar colors synchronize)
- Video art (morphing liquid effects)
- Pattern recognition

### Dynamic Grid Resizing

Change simulation resolution on-the-fly:

- **32×32**: Ultra-fast (1000+ FPS)
- **128×128**: Balanced (60+ FPS)
- **256×256**: Default, detailed
- **512×512**: High-resolution
- **1024×1024**: Maximum detail (research-grade)

**Keyboard shortcuts:** Shift + ↑/↓

### View Modes

- **3D Mode** (default): Height field where height = 2·sin(θ)
  - Orbit camera with left-drag
  - Pan with right-drag
  - Zoom with scroll
  
- **2D Mode**: Flat top-down view (optimized fast rendering path)
  - Perfect for image textures
  - Direct phase visualization
  - Publication-quality figures
  - **Zoom**: Mouse wheel (0.5× to 10×)
  - **Pan**: Click and drag
  - **Reset View**: Double-click or press **Z**

Toggle with **V** key or buttons.

## 🎨 Visualization Modes

Press **C** to cycle through colormaps:

| Mode | Name | Shows | Color Scheme |
|------|------|-------|--------------|
| **0** | Phase | Raw oscillator phase | Blue → Cyan → Green → Yellow → Red |
| **1** | Velocity | Phase gradient (∇θ) | Blue (slow) → Orange (fast) |
| **2** | Curvature | Phase Laplacian (∇²θ) | Purple (concave) → Yellow (convex) |
| **3** | Order | Local synchronization | Red (chaos) → Green (sync) |
| **4** | Image Texture | External image modulated by phase | Original colors × phase brightness |
| **5** | Viridis | Perceptually uniform | Blue → Green → Yellow |
| **6** | Plasma | Hot magenta-yellow | Magenta → Orange → Yellow |
| **7** | Twilight | Cyclic colormap | Purple → Red → Yellow → Blue |
| **8** | Inferno | Black to bright | Black → Purple → Orange → Yellow |
| **9** | Chirality | Spiral rotation direction | Blue (CW) → Gray → Red (CCW) |
| **10** | Phase+Gradient | Combined visualization | Phase hue with gradient brightness |

### Order Parameter Overlay

Press **O** to toggle brightness modulation by local order:
- Synchronized regions appear **bright**
- Chaotic regions appear **dim**

## 🎛️ Parameters & Controls

### Simulation Parameters

| Parameter | Range | Default | Effect |
|-----------|-------|---------|--------|
| **Coupling Strength (K₀)** | 0 - 3.0 | 1.0 | Overall interaction strength |
| **Time Step (dt)** | 0.001 - 0.1 | 0.03 | Integration step size |
| **Range** | 1 - 8 | 2 | Neighborhood size (cells) |
| **Global Coupling** | On/Off | Off | If on: all-to-all coupling |
| **Noise Strength** | 0 - 0.5 | 0.0 | Random perturbation amplitude |
| **Time Scale** | 0.1× - 4× | 1× | Simulation speed multiplier |

### Rule-Specific Parameters

#### Rule 3: Harmonics
- **2nd Harmonic (a₂)**: 0-1, default 0.4 (anti-phase clustering)
- **3rd Harmonic (a₃)**: 0-1, default 0.0 (three-cluster patterns)

#### Rule 4: Kernel-Based

Spatial coupling kernel with multiple shape options:

**Kernel Shapes:**
- **Isotropic (Circular)**: Classic Mexican-hat (Gaussian excitation - inhibition)
  - Rotationally symmetric patterns
- **Anisotropic (Elliptical)**: Directional coupling
  - Creates stripes and waves along orientation axis
  - **Orientation**: 0-360° rotation angle
  - **Aspect Ratio**: 1.0-5.0 elongation factor
- **Multi-Scale (Nested)**: Superposition of 3 scales (1×, 2×, 3×)
  - Nested patterns with large features containing smaller eddies
  - **Scale 2 Weight**: -0.5 to 0.5 (2× size component)
  - **Scale 3 Weight**: -0.5 to 0.5 (3× size component)
- **Asymmetric (Directional)**: Different forward/backward coupling
  - Creates propagating patterns with directional bias
  - **Orientation**: 0-360° propagation direction
  - **Asymmetry**: -1.0 to 1.0 (forward vs backward bias)
- **Step (Rectangular)**: Constant weight within radius, sharp cutoff
  - Binary coupling regions with hard boundaries
- **Multi-Ring (Concentric)**: Up to 5 customizable rings with individual widths and weights
  - Each ring has independent outer radius (cumulative) and weight
  - Creates complex nested patterns (e.g., 3-ring target waves with alternating excitation/inhibition)
  - Ring weights can be positive (excitatory) or negative (inhibitory)
  - **Number of Rings**: 1-5
  - **Ring N Outer Radius**: Normalized radius relative to sigma2 (0.05-1.0)
  - **Ring N Weight**: Coupling strength for that ring (-1.0 to 1.0)

**Kernel Composition** (mix two shapes):
- Enable to blend two kernel shapes together
- **Secondary Shape**: Choose second kernel (0-5)
- **Mix Ratio**: 0 = all secondary, 1 = all primary
- *Example use cases:*
  - Asymmetric + Multi-ring → Directional nested patterns
  - Anisotropic + Step → Elliptical hard boundaries
  - Multi-scale + Multi-ring → Hierarchical nested structures

**Base Parameters:**
- **Sigma (σ)**: 0.3-4.0, default 1.2 (excitation width)
- **Sigma2 (σ₂)**: 0.3-6.0, default 2.2 (inhibition width)
- **Beta (β)**: 0-1.5, default 0.6 (inhibition strength)
- **Critical for chimeras:** σ₂/σ ≈ 2.5-3.0

#### Rule 5: Delay-Coupled
- **Delay Steps (τ)**: 1-30, default 10 (coupling time lag)

### Initial Conditions

#### Phase Pattern (θ)
- **Random**: Uniform random [0, 2π]
- **Gradient**: Linear ramp (creates plane waves)
- **Spiral**: Angular gradient (creates spirals)
- **Checkerboard**: Alternating 0° and 180°
- **Synchronized**: All at 0° (uniform state)
- **From Image**: Initialize from uploaded image brightness

#### Frequency Pattern (ω)
- **Random**: Gaussian distribution
- **Uniform**: All identical
- **Gradient**: Linear shear
- **Checkerboard**: Alternating fast/slow
- **Center Fast**: Gaussian pacemaker (creates target waves)
- **Image/Video Input**: Drive from external media

**Amplitude**: Controls frequency spread (0-2.0, default 0.4)

## ⌨️ Keyboard Shortcuts

### Rule & Mode Control
- **0-5**: Switch coupling rules
- **V**: Toggle 2D/3D view
- **C**: Cycle colormaps (11 modes)
- **O**: Toggle order overlay
- **G**: Toggle global coupling

### Simulation Control
- **Space**: Pause/Resume
- **R**: Reset simulation
- **T**: Randomize phases
- **[** / **]**: Slower / Faster (×0.5 / ×2)

### Parameter Adjustment
- **↑** / **↓**: Increase/Decrease coupling strength K₀
- **←** / **→**: Decrease/Increase range (local coupling only)
- **Shift + ↑** / **Shift + ↓**: Increase/Decrease grid size

### View Control (2D Mode)
- **Z**: Reset zoom/pan to default
- **+** / **=**: Zoom in
- **-**: Zoom out

### Camera (3D Mode)
- **Left-drag**: Rotate
- **Right-drag**: Pan
- **Scroll**: Zoom

## 🎭 Presets

Click preset buttons to load fascinating patterns:

| Preset | Pattern | Description |
|--------|---------|-------------|
| **🔄 Global Sync** | Synchronization | All oscillators converge to single phase |
| **🔲 Grain Domains** | Domain formation | Multiple synchronized regions with sharp boundaries |
| **🔢 Two-Clusters** | Anti-phase | Two populations at opposite phases |
| **〰️ Plane Wave** | Traveling wave | Diagonal stripes moving smoothly |
| **🎯 Target Waves** | Concentric rings | Expanding circles from center pacemaker |
| **🎯⤴ Target In** | Converging rings | Waves moving inward |
| **🌀 Single Spiral** | Rotating spiral | Pinwheel pattern with topological defect |
| **🌀🌀 Spiral Pair** | Counter-rotating | Two spirals orbiting each other |
| **👥 Chimera State** | Order/Chaos coexistence | **Most fascinating!** Half synchronized, half chaotic |
| **🌊 Turbulence** | Spatiotemporal chaos | Constantly changing, no persistent structure |
| **💓 Breathing Mode** | Oscillating blob | Central region pulses periodically |
| **🕐 Delay Spirals** | Emergent patterns | Delay-coupled spontaneous spiral formation |

## 🧪 Example Workflows

### 1. Create Plane Waves from Scratch

```
1. Phase Pattern → Gradient
2. Frequency Pattern → Uniform (amplitude 0.2)
3. Rule → 0 (Classic)
4. K₀ → 1.0
5. Range → 2
6. Global Coupling → OFF
7. Press "Reset"
8. Press C to switch to Velocity colormap
→ Observe diagonal stripes moving
```

### 2. Observe Chimera State

```
1. Click "👥 Chimera State" preset
2. Press O (order overlay)
   → Left half green (synchronized)
   → Right half red (chaotic)
   → Sharp boundary between them
3. Adjust β (inhibition strength):
   - Higher β → boundary blurs
   - Lower β → boundary sharpens
4. Try adjusting σ₂ to change domain size
```

### 3. Image Segmentation

```
1. Frequency Pattern → "Image/Video Input"
2. Upload image (faces, landscapes work well)
3. Rule → 0 (Classic)
4. K₀ → 1.5
5. Range → 3
6. Global Coupling → OFF
7. Press "Apply & Reset"
8. Wait 5-10 seconds
9. Color Mode → "Order Parameter"
   → Green regions = similar colors in original
   → Red regions = boundary/different colors
```

### 4. Liquid Painting Effect

```
1. Frequency Pattern → "Image/Video Input"
2. Click "📷 Use Webcam" (or upload image)
3. Phase Pattern → "From Image"
4. Color Mode → "Image Texture"
5. Press V (switch to 2D view)
6. Rule → 1 (Coherence-Gated)
7. K₀ → 2.5 (strong morphing)
8. Range → 2-3
9. Time Scale → 1.5× (speed up)
→ Watch image flow like liquid!
```

### 5. Publication Figure

```
1. Grid size → 512 (high resolution)
2. Choose preset (e.g., "🌀 Spiral Pair")
3. Wait 10-15 seconds for pattern to settle
4. Press V (2D mode for cleaner view)
5. Zoom to frame pattern
6. Choose appropriate colormap:
   - Phase (0): show structure
   - Velocity (1): show dynamics
   - Order (3): show synchronization
7. Screenshot at stable moment
```

## 🏗️ Architecture

### Technology Stack

- **Frontend**: Vanilla JavaScript (ES6 modules)
- **Graphics**: WebGPU API
- **Compute**: GPU compute shaders (WGSL)
- **Math**: Custom matrix/vector utilities

### Code Organization

```
kuramoto/
├── index.html              # Main application entry
├── src/
│   ├── main.js            # Application initialization & control
│   ├── simulation.js      # Compute shader setup & buffer management
│   ├── renderer.js        # Render pipeline & texture handling
│   ├── shaders.js         # WGSL shader code (compute + render)
│   ├── ui.js              # UI controls & event handling
│   ├── presets.js         # Preset configurations
│   ├── kernel.js          # Spatial kernel visualization (1D/2D)
│   └── common.js          # Camera & math utilities
├── DOCUMENTATION.md        # Comprehensive mathematical documentation
├── EXTENSIONS.md          # Future extensions (graphs, layers, etc.)
└── README.md              # This file
```

### Performance Optimization

- **Shared Memory Tiling**: Compute shaders use GPU shared memory for neighbor data
- **Cached Bind Groups**: Reuse GPU bind groups per delay step
- **Workgroup Size**: 16×16 threads per group (optimized for modern GPUs)
- **Partial Buffer Updates**: Only update dynamic params (dt, time) per frame
- **Fast 2D Rendering**: Single full-screen triangle instead of N² instanced quads
- **Periodic Boundaries**: Efficient toroidal topology

**Benchmarks (M1 Max GPU):**
- 128×128: 60+ FPS
- 256×256: 30-45 FPS
- 512×512: 7-15 FPS
- 1024×1024: 2-4 FPS

## 📐 Mathematical Background

### Synchronization Transition

For classic Kuramoto with identical frequencies, there exists a **critical coupling** Kc:

```
K < Kc: Oscillators remain incoherent (disorder)
K > Kc: Oscillators synchronize globally (order)
```

The **order parameter** measures synchronization:

```
R = |⟨e^(iθ)⟩| ∈ [0, 1]

R ≈ 0: Incoherent (chaotic)
R ≈ 1: Synchronized (ordered)
```

### Pattern Formation

Different combinations create distinct patterns:

1. **Global Synchronization**: Strong K, uniform ω, global coupling
2. **Grain Domains**: Moderate K, coherence-gated rule
3. **Traveling Waves**: Gradient θ₀, uniform ω, moderate K
4. **Target Waves**: Radial θ₀, center-fast ω
5. **Spiral Waves**: Angular θ₀, radial ω
6. **Chimera States**: Kernel-based (Rule 4), split domain initial condition
7. **Turbulence**: Weak K, heterogeneous ω, noise

### Topological Defects

Spiral patterns contain **topological defects** (singularities) where phase is undefined:

```
Winding number: q = (1/2π) ∮ ∇θ·dl

q = +1: Right-handed spiral
q = -1: Left-handed spiral
```

These defects are **topologically protected** — they cannot be removed without creating/annihilating pairs.

## 🔬 Research Applications

This simulator is suitable for:

- **Teaching**: Demonstrate synchronization phenomena
- **Research**: Explore parameter space, test hypotheses
- **Art**: Generate algorithmic visuals
- **Machine Learning**: Pattern recognition training data

### Publications Using Similar Models

- Y. Kuramoto, "Self-entrainment of a population of coupled non-linear oscillators" (1975)
- S. Strogatz, "From Kuramoto to Crawford: exploring the onset of synchronization" (2000)
- M. Wolfrum & O. Omel'chenko, "Chimera states are chaotic transients" (2011)

## 🛠️ Advanced Usage

### Custom Presets

Add your own preset in `src/presets.js`:

```javascript
my_custom: (state, sim) => {
    state.ruleMode = 0;
    state.K0 = 1.2;
    state.range = 3;
    
    const theta = new Float32Array(sim.N);
    const omega = new Float32Array(sim.N);
    
    // Initialize theta and omega arrays
    for (let i = 0; i < sim.N; i++) {
        theta[i] = /* your initialization */;
        omega[i] = /* your initialization */;
    }
    
    sim.writeTheta(theta);
    sim.writeOmega(omega);
}
```

### Export Data

Currently, data export is manual (future feature). To capture states:

1. Open browser DevTools (F12)
2. In Console, run:
   ```javascript
   // Get current theta values
   const encoder = device.createCommandEncoder();
   const staging = device.createBuffer({
       size: sim.N * 4,
       usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
   });
   encoder.copyBufferToBuffer(sim.thetaBuf, 0, staging, 0, sim.N * 4);
   device.queue.submit([encoder.finish()]);
   
   await staging.mapAsync(GPUMapMode.READ);
   const data = new Float32Array(staging.getMappedRange());
   console.log(Array.from(data)); // Copy to clipboard
   ```

## 🐛 Troubleshooting

### Black Screen / No Display

- **Check WebGPU support**: Visit https://webgpureport.org/
- **Update browser**: Chrome 113+, Firefox Nightly
- **Check GPU**: Integrated GPUs (Intel) may have issues

### Poor Performance

- **Reduce grid size**: 128×128 or 64×64
- **Disable webcam**: Stop live video input
- **Close other tabs**: Free up GPU memory
- **Check background apps**: Disable GPU-intensive apps

### Image Texture Shows Black

- **Upload image first**: Before selecting "Image Texture" mode
- **Press C**: Cycle away from mode 4, then back
- **Check console**: F12 → Console for errors

### 2D View Flipped/Rotated

- This is intentional: Y-coordinate is flipped to match image orientation
- If issue persists, check browser console for errors

## 🚧 Future Extensions

See `EXTENSIONS.md` for detailed proposals:

1. **Arbitrary Graph Topologies**: Move beyond grids (small-world, scale-free)
2. **Hierarchical Layers**: Multi-layer architecture (feed-forward/feedback)
3. **Hebbian Learning**: Adaptive coupling weights
4. **n-Dimensional Vectors**: Extend from scalars on S¹ to vectors on Sⁿ
5. **Data Export**: Save states, parameters, videos
6. **Batch Simulations**: Parameter space exploration
7. **Interactive Perturbations**: Click to add disturbances

## 📚 Learn More

### Recommended Reading

- **Textbook**: S. Strogatz, "Nonlinear Dynamics and Chaos" (2015)
- **Review**: J. Acebrón et al., "The Kuramoto model: A simple paradigm" (2005)
- **Chimera States**: M. Panaggio & D. Abrams, "Chimera states: coexistence of coherence and incoherence" (2015)

### Online Resources

- [Scholarpedia: Kuramoto Model](http://scholarpedia.org/article/Kuramoto_model)
- [WebGPU Fundamentals](https://webgpufundamentals.org/)
- [Synchronization Simulation](https://ncase.me/fireflies/) (simpler version)

## 🤝 Contributing

Contributions welcome! Areas of interest:

- **New coupling rules**: Implement novel interaction mechanisms
- **Performance**: Optimize shader code, reduce memory bandwidth
- **UI/UX**: Improve controls, add visualizations
- **Features**: Implement extensions from `EXTENSIONS.md`
- **Documentation**: Improve explanations, add tutorials

### Development Setup

```bash
git clone https://github.com/yourusername/kuramoto.git
cd kuramoto

# Install dev dependencies (optional, for linting)
npm install

# Run local server
python -m http.server 8000
```

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- **Yoshiki Kuramoto**: For the original model (1975)
- **WebGPU Team**: For the amazing API
- **Community**: For feedback and suggestions

## 📧 Contact

- **Issues**: [GitHub Issues](https://github.com/yourusername/kuramoto/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/kuramoto/discussions)

---

**Enjoy exploring the beautiful world of synchronization!** 🌀✨

*Last updated: January 2025*
