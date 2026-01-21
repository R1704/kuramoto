# 🚀 Kuramoto Extensions & Interaction Guide

An integrated handbook that documents the interactive controls and lays out a reprioritized roadmap for the next generation of Kuramoto extensions. Use the **Interaction Primer** to operate the current sandbox, and the **Roadmap** to decide what to build next.

---

## Interaction Primer (updated)

- **Draw / Erase (GPU-side)**
  - Hold **Cmd+Drag** to draw random phase seeds; **Cmd+Shift+Drag** to erase. Works in **both 2D and 3D** and no longer fights camera panning (camera ignores Cmd).
  - 2D view: fixed canvas, scroll zoom anchors to cursor, min zoom = 1× canvas; **double-click** resets zoom/pan. 3D view: Cmd-drag stops orbit/pan.

- **3D Surface Modes**
  - Toggle **Continuous Mesh** vs **Instanced Quads** in the Visuals panel. Mesh is smooth and auto-rebuilds on grid resize; Instanced shows per-cell tiles (great for alias-free phase discontinuities).

- **Scale field (K modulation)**
  - Sliders modulate effective coupling **K** spatially: base, radial, random, and ring terms combine then clamp to 0.1–5×. Higher values stiffen local sync; lower values loosen it.

- **Flow field (phase advection)**
  - Radial/rotate/swirl/bubble/ring/vortex/vertical add signed bias to phase rate (after dynamics/input). Range widened to ±5 for visibly stronger advection patterns.

- **Orientation map (anisotropy)**
  - Radial/circles/swirl/bubble/linear terms anisotropically scale phase updates (0.05–8×) to favor certain directions; strongest impact near boundaries/gradients. Acts like spatially varying diffusion.

- **Color = Data Layer × Palette**
  - Two selectors: **Data Layer** (Phase, Velocity, Curvature, Order, Chirality, Phase+Grad, Image) and **Palette** (Rainbow, Viridis, Plasma, Inferno, Twilight, Greyscale). `C` cycles palettes, **Shift+C** cycles data layer.

- **Phase space plot**
  - Unit-circle scatter remains behind `P` toggle; sampling is throttled and piggybacks RC readbacks where possible.

- **RC input modes**
  - Pick `freq_mod`, `phase_drive` (torque), or `coupling_mod`; shader switches injection path without rebuilds.

- **Saving settings**
  - URL updates with encoded params; bookmark/share to preserve state.

---

## Prioritization Framework

Priority is based on impact on research/UX, novelty, time-to-value, and implementation effort. Tiers help scope work; ranks are global across tiers.

---

## Critical Review & Implementation Plan (from RC/criticality audit)

- **Couple criticality to RC performance**: Run explicit K-sweeps per task and plot NRMSE/memory vs K alongside R, χ. Add this as an experiment preset.  
- ✅ Added RC K sweep (button) to sample NRMSE across K values for current task/regions.  
- **Add a spatiotemporal benchmark**: Include at least one 2D task (moving dot/bar prediction) to justify the 2D reservoir.  
- ✅ Added moving-dot spatiotemporal benchmark (dynamic input weights + future-position target).
- **State representation limits**: Phase-only Kuramoto lacks guaranteed fading memory; document this and optionally add leak/amplitude variants.  
- **Feature design and conditioning**: Add feature-budgeting (projection or temporal filters) to avoid ill-conditioned RLS; monitor covariance condition number.  
- ✅ Added feature budget with stride downsampling and condition estimate display (diag(P)).  
- **Input injection modes**: ✅ Implemented `freq_mod`, `phase_drive` (additive torque), and `coupling_mod` as selectable injection schemes.  
- **Stats clarity**: Label χ as temporal fluctuation proxy; add local R histograms to avoid over-compressing spatial structure.  
- ✅ χ labeled as temporal variance proxy; added live local-R histogram (fixed readback).  
- **LLE scope**: Treat LLE as offline/advanced; rely on R/χ/gradients for primary regime detection.  
- **UX for tasks**: Provide task presets and automated plots (NRMSE vs time/K) instead of manual eyeballing.

These items map onto the roadmap tiers below; the highest leverage is coupling RC performance to K and adding the spatiotemporal benchmark plus input-mode variants.

---

## Ranked Roadmap

| Rank | Tier | Extension | Diff. | Est. | Impact | Notes |
|------|------|-----------|-------|------|--------|-------|
| 1 | T1 (Quick) | 💾 State Save/Load | Easy | 2-4 hrs | High | Persist/restore theta, omega, params; enable sharing. |
| 2 | T1 (Quick) | 📉 Order Parameter History | Medium | 4-6 hrs | High | Rolling R(t)/χ(t) plots for regime detection. |
| 3 | T1 (Quick) | 🎯 Targeted Perturbation | Easy | 2-4 hrs | Medium | Click/drag pulses for stability and teaching. |
| 4 | T1 (Quick) | 🌊 External Forcing | Easy | 3-5 hrs | Medium | Global periodic drive; exposes entrainment. |
| 5 | T1 (Quick) | 🎬 Recording / GIF Export | Medium | 6-10 hrs | High | Shareable demos; uses MediaRecorder/gif.js. |
| 6 | T1 (Quick) | 🧲 Kernel Influence Probe | Easy | 2-4 hrs | High | Hover probe showing kernel weights and neighbor influence. |
| 7 | T1 (Quick) | 🕸️ Graph Edge Overlay | Easy | 2-4 hrs | High | Hover/selection overlay to reveal graph links on the grid. |
| 8 | T1 (Quick) | 📊 Real-time Statistics Panel | Medium | 4-8 hrs | High | Consolidate R, χ, gradients, histograms. |
| 9 | T2 (Core) | 🔗 Graph Topologies | Hard | 2-3 wks | High | Small-world/scale-free neighbor buffers; new phenomena. |
| 10 | T2 (Core) | 🌡️ Noise & Temperature Control | Medium | 3-5 hrs | Medium | Colored/spatial noise; temp-like schedule. |
| 11 | T2 (Core) | 🗺️ Phase Space Visualization | Medium | 4-8 hrs | Medium | ✅ Implemented: unit-circle scatter with toggle (`P` key) and throttled sampling. |
| 12 | T2 (Core) | 📈 Frequency Adaptation | Medium | 1 wk | Medium | Slow ω dynamics; tests self-organization. |
| 13 | T3 (Structural) | 🧠 Hebbian / Plastic Coupling | Hard | 2-3 wks | High | Adaptive weights; two-pass updates and viz. |
| 14 | T3 (Structural) | 🏗️ Hierarchical Layers | Hard | 3-4 wks | High | Multi-layer coupling (feed-forward/feedback). |
| 15 | T3 (Structural) | 🔮 n-D Unit Vectors (Sⁿ) | V.Hard | 4-6 wks | High | Vector states on spheres; geodesic coupling. |
| 16 | T3 (Structural) | 🧊 True 3D Grid | V.Hard | 3-4 wks | Medium | 3D lattice simulation and volume/slice rendering. |
| 17 | T3 (Structural) | 🌀 Chimera Detection | Hard | 1-2 wks | Medium | Automatic sync/async segmentation and reporting. |
| 18 | T4 (Research) | 📈 Graph Spectral Analysis | Hard | 1-2 wks | Medium | Laplacian eigenspectrum for synchronizability on small grids. |
| 19 | T4 (Research) | 🛰️ Particle Kuramoto | V.Hard | 3-5 wks | Medium | Mobile oscillators with distance-based coupling. |
| 20 | T4 (Research) | 📊 Frequency Spectrum (FFT) | Hard | 1 wk | Medium | WebGPU FFT of phase/velocity; chaos diagnostics. |

### Immediate Next Steps (Consolidated, prioritized)
- **Kernel influence probe**: hover on the grid to visualize the active kernel weights around the cursor.  
- **Graph edge overlay**: in topology mode, show edges for the hovered oscillator so graph connectivity is visible on the grid.  
- **Stability pass on surface modes** (mesh vs instanced): regression-test resize/zoom/draw parity in 2D/3D; add a tiny visual marker showing mode in the UI.  
- **RC vs Criticality presets**: ship a preset that runs K-sweep + NRMSE overlay per task (sine/NARMA/memory) so users can see performance vs K without manual setup.  
- **Spatiotemporal benchmark polish**: make the moving-dot task visually obvious (dot overlay + target trail) and log its NRMSE separately from scalar tasks.  
- **Input-mode comparison panel**: side-by-side small plots for `freq_mod` / `phase_drive` / `coupling_mod` with the same seed to expose differences quickly.  
- **Save/Load (state + params)**: JSON round-trip for θ/ω/params with versioning; add “Copy link with state” as stretch (ties to sharing).  
- **Order-history strip**: light-weight R(t)/χ(t) sparkline with pause/export so stats remain observable when other panels are hidden.

---

## Tier Details & Implementation Sketches

### T1 — Quick Wins (< 1 day each)
- **State Save/Load**: GPU → CPU readback of θ/ω + param snapshot; download/upload JSON; add checksum/version.  
- **Order Parameter History**: Rolling buffers on CPU; lightweight canvas plot; toggles for R(t), χ(t), sync fraction.  
- **Targeted Perturbation**: Map pointer to grid index; kernel applies phase kick or noise burst; UI intensity slider.  
- **External Forcing**: Add forcing term (freq_mod or additive torque) with amplitude/frequency controls; include preset.  
- **Recording / GIF Export**: MediaRecorder for WebM; gif.js fallback; optional downscale/framerate controls.  
- **Real-time Statistics Panel**: Aggregated stats rendered from GPU buffers; histograms of local R; gradient magnitude summary.
- **Kernel Influence Probe**: Hover sampling of kernel weights around cursor; draw in overlay canvas; show kernel radius.  
- **Graph Edge Overlay**: Show sampled edges from hovered oscillator (topology mode only).  

### T2 — Core Dynamics (multi-day)
- **Graph Topologies**: Fixed-max-degree neighbor buffer; generators for Watts–Strogatz and Barabási–Albert; edge visualization; perf profiling.  
- **Noise & Temperature Control**: White/colored noise modes, spatial correlation kernels, burst events; “temperature” slider mapped to noise schedule.  
- **Phase Space Visualization** *(shipped)*: Unit-circle scatter (toggle in visualizer or press `P`); subsamples θ with GPU-friendly throttling; uses RC readbacks when available.  
- **Frequency Adaptation**: Slow ω update `dω/dt = ε(ω̄_neighbors - ω_i)`; damping; optional heterogeneity floor/ceiling.
- **Layered Reservoir Mode**: Treat layers as sub-reservoirs; per-layer scalars (K0, noise, ω) with shared rule; optional cross-layer readouts.

### T3 — Structural Extensions (weeks)
- **Hebbian / Plastic Coupling**: Weight buffer; two-stage compute (phase update, weight update); decay + clipping; edge heatmap; toggle for symmetric/asymmetric learning.  
- **Hierarchical Layers**: Layer dimension in buffers; feed-forward and feedback K; layer-specific ω/K; multi-panel view.  
- **n-D Unit Vectors (Sⁿ)**: Vec3/vec4 buffers; geodesic coupling; renormalization; stereographic or HSV color mapping; start with S².  
- **True 3D Grid**: 3D indexing, workgroup tiling, optional slice rendering; careful memory budgeting.  
- **Chimera Detection**: Thresholded local R, connected components, chimera index; overlay mask; export stats.  
- **Neural Kuramoto Network**: Learnable coupling weights on graph edges; phase-based CTRNN analog; integrates with RC readouts.

### T4 — Research / Analysis
- **Graph Spectral Analysis**: Laplacian eigenvalues for synchronizability; compute on CPU for small grids or downsampled graphs.  
- **Particle Kuramoto**: Dynamic oscillator positions with spatial hashing or kNN for distance coupling; new render path.  
- **Frequency Spectrum (FFT)**: WebGPU FFT of θ̇ or θ; windowing options; peak picking; integrates with order-history plots.
- **Spiking Proxy Readouts**: Interpret phase crossings as spike events; compare to SNN dynamics and coding schemes.

---

## Dependencies & Ordering

- Start with **T1** items; they unlock better UX, diagnostics, and sharing, and they are prerequisites for meaningful evaluation of deeper changes.  
- Implement **Graph Topologies** before **Hebbian** or **Hierarchical Layers** to avoid rewrites.  
- Ship **n-D Vectors** before **True 3D Grid**; the vector math and visualization patterns generalize to volumetric cases.  
- **Chimera Detection** and **FFT** rely on stable stat/IO pipelines built in earlier tiers.

---

## Acceptance Criteria Snippets

- **Save/Load**: Round-trip preserves θ/ω/params within FP tolerance; loading mismatched versions shows a friendly warning.  
- **Order History**: No more than 1–2 ms CPU per frame at 256×256; plot can be paused; export CSV.  
- **Graph Topologies**: Small-world sync transition demonstrable; max-degree overflow handled gracefully.  
- **Hebbian**: Weights remain bounded; visualization updates without dropping FPS >10% at 256×256.  
- **n-D Vectors**: S² spiral/defect demo runs at target FPS on reference hardware; color legend included.

---

## Publishing & Sharing Checklist

- Provide presets for each major extension (graph small-world, Hebbian memory, S² spirals).  
- Add short tooltips for every new control.  
- Update README and on-screen help once a tier ships.  
- Include a reproducible “demo script” (sequence of slider changes) for recording/export tests.
