# Kuramoto Research Roadmap

This repo is a **research sandbox** for Kuramoto-like dynamics on WebGPU: multilayer coupling, topology variants, analysis tooling, and reservoir computing.

This file is the **single canonical roadmap**. It consolidates prior plans, interaction notes, and RC/statistics intent so work stays strategically prioritized and experimentally grounded.

## Guiding principles (why this order)
- **Trust first**: fix correctness + semantics drift before adding new dynamics.
- **Reproducible experiments**: every feature should be measurable, exportable, and replayable.
- **Locality + scaling**: avoid O(N^2) paths; prefer local kernels, sparse graphs, and throttled readbacks.
- **Minimal confounding**: add one capability at a time with clear acceptance tests.

## Current system snapshot
- Runtime bootstrap: `src/main.js` + `src/app/bootstrap.js` + `src/app/{defaultState,stateAdapter}.js` + `src/app/render/frameLoop.js`.
- Core simulation: `src/simulation/Simulation.js` + `src/simulation/{buffers,pipelines,readback,resize}.js` + WGSL in `src/shaders/sources/*.js` (rules 0-7, kernels, topology mode).
- KuramotoNCA substrate: rule 7 implements coherence-gated scalar KuraNCA as the `d = 2` case of a matter-plus-unit-oscillator model. Matter `a_i` lives in a ping-pong texture, phase `theta_i` encodes the unit vector `(cos theta_i, sin theta_i)`, and matter birth/death is gated by local living oscillator coherence. The current validation pass uses excitation-minus-inhibition matter growth, four diagnostic presets (Orbium, Mitosis, Filament, Droplets), rollout viability scoring, and a local NCA probe.
- Gauge extension (S1): local U(1) link fields (`A_x`, `A_y`, graph edge phases), static/dynamic gauge modes, gauge-aware layers (flux and covariant gradient).
- Rendering: `src/rendering/Renderer.js` (fast 2D triangle path + 3D mesh/instanced).
- UI/state: `index.html` + `src/ui/UIManager.js` + `src/ui/{bindings,view}/*` + `src/utils/urlstate.js`.
- Controllers: `src/app/controllers/{experimentController,snapshotController,analysisController,rcController}.js`.
- Analysis: `src/statistics/{StatisticsTracker,LyapunovCalculator,TimeSeriesPlot,PhaseDiagramPlot,PhaseSpacePlot}.js` + `src/app/view/{updateStatsView,initDrawing}.js` (Local/Global order, χ proxy, K-scan, LLE heuristic, FSS).
- Reservoir: `src/reservoir/{ReservoirComputer,ReservoirIO,OnlineLearner,RidgeRegression,RCTasks}.js` (input injection modes + sparse readout + online RLS).

## Interaction primer (what exists today)
- Force injection: left-drag injects local force (S1 + grid).
- 3D pan: Cmd+left-drag pans camera (right-drag pan retained).
- 2D navigation: scroll zoom anchored to cursor; double-click resets zoom/pan.
- 3D surface modes: Continuous Mesh vs Instanced Quads.
- Color = Data layer × Palette: palettes cycle with `C`; data layer cycles with Shift+`C`.
- RC injection modes: `freq_mod`, `phase_drive`, `coupling_mod`.

## Spectral analysis design notes (planning only)
- **Temporal spectral analysis:** run short-window STFT/FFT over `R(t)`, `dψ/dt`, and gradient energy; use band energy envelopes for smoother audio control and event detection.
- **Graph spectral analysis:** compute Laplacian eigenspectrum for graph topology mode; track `λ₂` (spectral gap) for synchronizability and inspect leading eigenvectors for community/bottleneck structure.

## Research idea triage (updated 2026-05-12)
- **Gauge field purpose:** the U(1) field is a local phase-offset medium on links. Plain Kuramoto asks neighbors to align via `sin(θ_j - θ_i)`; gauge Kuramoto asks them to align after paying a link phase `A_ij`, via `sin(θ_j - θ_i - qA_ij)`. Nonzero plaquette flux means those link preferences cannot all be satisfied at once, producing frustration, defects, chiral textures, and covariant-gradient structure. This is useful as a controllable topological/frustration layer, but it must be validated before it becomes a headline feature.
- **KuramotoNCA (reframed 2026-06-12, standing fault #6):** the browser app is the **AKOrN intuition rig**, not the research vehicle itself. The reference model is `cell_i = (a_i, x_i)` — living matter plus a unit oscillator with collapsed coherence-gated growth/decay and phase-selective support (binding). The hidden morphogen channels were removed (they were an EMA of current observables, not memory); learned latent state returns with training. The **next real milestone is a trained toy task** in the spirit of AKOrN (Miyato et al. 2024): segment two overlapping shapes by phase, trained end-to-end. In-browser autodiff is not realistic for this, so the learning phase is an **offline PyTorch sidecar** (scalar Kuramoto layer + readout, trained on synthetic overlapping-shape data) with the WebGPU app as the visualization/intuition surface. Refining scalar viability heuristics further is explicitly NOT the path — the current metric (multi-domain re-target) is good enough to steer sweeps away from the trivial sync attractor, which is all it needs to do. After the toy task trains: vector oscillators on `S^{N-1}`, symmetry-breaking conditioned stimulus, energy readout.
- **Flow matching:** relevant as a training/objective lens, not as a direct simulator replacement. Candidate use: learn a vector field that transports simple initial phase/noise distributions toward desired oscillator pattern distributions, or distill expensive Kuramoto rollouts into a learned update. Defer until state snapshots, datasets, and evaluation metrics exist.
- **Hilbert-space framing:** mathematically adjacent through complex phase amplitudes `z=e^{iθ}` and quantum/oscillator language, but not a near-term implementation target. Treat Hilbert space as an analysis/representation analogy unless a concrete complex-amplitude model, quantum walk, or linear operator experiment is specified.
- **Other geometries / curvature:** S2/S3 are near-term because the code already has vector textures and tangent projection. Hyperbolic space is conceptually valuable for hierarchy and tree-like synchrony, but requires new metric/geodesic/Laplacian math; keep as a longer-horizon geometry track after manifold diagnostics are trustworthy.

## Known issues / correctness risks (must address early)
- **Multi-layer stats**: ensure layer-aware metrics stay intra-layer (e.g., phase gradient); avoid cross-layer indexing artifacts.
- **Metric semantics drift**: ensure UI/plot/export naming is explicit (globalR vs localMeanR) and consistent.
- **RC + layers mismatch**: fixed by defining an explicit policy (default: active-layer features + injection).
- **LLE scope**: Lyapunov estimator is heuristic and not aligned with every shader mode (kernels/topology/interlayer); treat as an indicator, not a proof.
- **Gauge semantics**: clarify in UI/docs that gauge is not "more coupling"; it is link-wise phase transport/frustration. Add deterministic covariance and flux tests before expanding it.

## Roadmap (strategically prioritized)

## Near-term queue (next 2-3 sessions)
- **Trust + UI architecture sprint**: metric labels/exports (`globalR`, `localMeanR`, `chiProxy`), LLE gating/labeling, RC active-layer policy, and `bootstrap.js` controller extraction.
- **KuramotoNCA Phase 1 validation**: verify rule 7 matter persistence, living-coherence organism tracking, rollout exports, preset diversity, viability scoring, parameter sweep ranking, and parameter legibility before adding learned kernels.
- **KuramotoNCA ablation harness (done) + relative-phase binding (next)**: the three-way ablation (`ncaAblationMode`: full / frozen oscillator / gate off) tests whether the oscillator earns its place; run it on each preset before further Rule 7 tuning. The standing design critique (see `tasks/todo.md` Standing Guidance) says the deeper fault is that phase couples to matter only through the rotation-invariant `R_i` — the next substantive change should make co-growth/identity depend on *relative* phase so synchrony binding is actually possible.
- **Gauge explanation + validation pass**: add a plain-language UI explainer, deterministic gauge covariance checks, flux sanity checks, and one "why gauge?" preset.
- **RC vs criticality experiment preset**: one-click K-sweep that overlays task test NRMSE vs K alongside local mean R and chi (temporal variance proxy); same seed across runs.
- **Surface-mode stability pass**: regression-test mesh vs instanced across resize/zoom/draw parity in 2D/3D; add a small UI mode indicator.
- **Spatiotemporal benchmark polish**: moving-dot task is exposed in UI and rendered with dot/ghost/trail HUD.
- **Input-mode comparison**: injection mode compare runner + plot + export for `freq_mod` / `phase_drive` / `coupling_mod` under shared seed.
- **Order-history sparkline**: implemented as control-panel sparklines with pause + export.

### Phase 0 — Make outputs trustworthy
Goal: you can rely on displayed numbers and exported files.
- Fix multi-layer stats gradient (compute per-layer, or per-active-layer; document the choice).
- Make labels/exports explicit: `globalR` vs `localMeanR` vs `chiProxy`.
- Ensure stats toggle truly disables readbacks and heavy work.
- Clarify LLE UI/docs (“heuristic / classic-local approximation”) or gate it by mode.

Acceptance:
- With `layerCount>1`, stats do not change when layers are permuted (given identical per-layer state).
- CSV export columns match what plots display.

### Phase 1 — Reproducible experiment harness
Goal: fast iteration without manual eyeballing.
- Seed discipline: a single `seed` controls all stochastic init/presets/RC task generation (stored in URL; UI reseed control).
- Scenario runner: rollout runner with JSON export (state snapshot + protocol + summary metrics + timeseries).
- URL/state completeness: ensure all parameters used in experiments round-trip.
- “Save/Load state”: versioned snapshots of theta/omega/params (JSON) for reproducible restoration.
- Targeted perturbations: reproducible pulse/erase actions (logged in the scenario runner) for stability/recovery experiments.
- Optional recording/export: deterministic capture (fixed FPS, downsample) for shareable comparisons.

Acceptance:
- Same seed + same URL state yields comparable trajectories (within floating tolerance).
- A/B configs can be compared via exported metrics, not screenshots.

### Phase 2 — Analysis instrumentation that supports discovery
Goal: diagnostics that explain patterns rather than just naming them.
- Kernel influence probe: hover a cell and visualize local kernel weights and dominant contributors.
- KuramotoNCA probe: hover a Rule 7 cell and show local matter, excitation, inhibition, growth input, local coherence, growth response, estimated matter delta, and dominant neighbor contributors.
- KuraNCA coherence-gated refinement: Rule 7 now uses stricter \(C^2\) coherent birth and direct inhibitory-surround death so early organisms do not default to unbounded expanding blobs.
- KuraNCA gate controls: `ncaCoherenceMin` and `ncaCoherenceMax` are now explicit model parameters instead of hard-coded shader constants, making the main coherence-gated substrate sweepable before adding learned updates.
- Graph edge overlay: in topology mode, show hovered node’s edges and weights.
- Gauge probe: show local link phases, plaquette flux, and whether a region is frustrated or gauge-trivial.
- Cross-layer diagnostics: mean cos(Δθ) between layers, per-layer Local R̄ and its histogram.
- Performance guardrails: stats readback cadence controls, in-flight map guards.

Acceptance:
- You can explain why a pattern formed by inspecting probes/overlays (not guessing).

### Phase 3 — Multilayer coupling upgrades (structure before learning)
Goal: systematically explore interlayer interactions.
- Document current interlayer coupling contract (adjacent-only, up/down asymmetric, optional kernel-based).
- Add general layer-to-layer gain matrix G[l,m] (default adjacent), still local sampling.
- Optional spatial remap: per (l,m) integer shifts (dx,dy) to couple displaced features.
- Optional delay on interlayer terms (separate from intra-layer delay rule).

Acceptance:
- You can produce (and quantify) locking, segregation, and directed information flow across layers.

### Phase 4 — Reservoir computing: correctness + scalability + layer-awareness
Goal: RC results are valid, comparable, and can pressure the substrate.
- Fix RC layer policy explicitly: active layer only (default), fixed layer, or multi-layer concatenation.
- Feature extraction O(#readouts): precompute readout indices; avoid scanning N each step.
- Standard protocol: washout → train → test; report test NRMSE.
- Multi-head readouts (if multi-layer): per-layer head + fused head.
- Add at least one spatial task (e.g., moving-dot) as a first-class UI option with clear plots.

Acceptance:
- RC works correctly with `layerCount>1` and produces stable test metrics across seeds.

### Phase 5 — Plasticity / learning (only after harness is solid)
Goal: learn small, local parameters under tight constraints.
- Start with learnable interlayer kernels (3×3 per layer-pair) with clamping/decay and throttled updates.
- Use objective-driven learning first (RC test loss as the signal); use Hebb/Oja as a regularizer.
- For KuramotoNCA, begin with the coherence-gated scalar S1 implementation, then add learned local coupling/perception before true vector AKOrN-style unit oscillators.
- Add weight diagnostics + export for reproducibility.

Acceptance:
- Learning improves task metrics on held-out test windows and remains stable under long rollouts.

### Phase 6 — Vector oscillators / AKOrN-style dynamics (optional research track)
Goal: introduce n-sphere oscillators once the framework can evaluate them.
- Add an alternate sim mode with x_i on S^{N-1} (start N=4), tangent projection, and local coupling.
- Add symmetry-breaking field C from image/video or a simple readout module.
- Add energy proxy + test-time compute extension experiments.
- Compare scalar KuramotoNCA vs vector AKOrN-style NCA under the same seeded tasks.

Acceptance:
- Vector mode is stable, measurable, and comparable to scalar phase mode via the same harness.

### Phase 7 — Learned flows and curved spaces (longer horizon)
Goal: test whether learned vector fields or non-Euclidean geometry add explanatory/computational value.
- Flow matching: learn pattern-generation or rollout-distillation vector fields from saved Kuramoto trajectories; require datasets and metrics from Phase 1 first.
- Hilbert/complex-amplitude experiments: only if a concrete complex state model is defined beyond phase-only `S1`.
- Hyperbolic Kuramoto: implement after S2/S3 diagnostics are stable; requires new geometry math, distance, transport, and Laplacian choices.

Acceptance:
- Learned-flow or curved-space variants beat a simpler Kuramoto baseline on a named, exported task.

## Dependency notes
- Do Phase 0 before anything else: learning/RC will otherwise optimize into metric bugs.
- Do Phase 1 before Phase 3/5/6: otherwise you can’t compare configurations reliably.
- Do Phase 2 before major new dynamics: it prevents “black box” iteration.
