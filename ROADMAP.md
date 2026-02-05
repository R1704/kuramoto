# Kuramoto Research Roadmap

This repo is a **research sandbox** for Kuramoto-like dynamics on WebGPU: multilayer coupling, topology variants, analysis tooling, and reservoir computing.

This file is the **single canonical roadmap**. It consolidates prior plans, interaction notes, and RC/statistics intent so work stays strategically prioritized and experimentally grounded.

## Guiding principles (why this order)
- **Trust first**: fix correctness + semantics drift before adding new dynamics.
- **Reproducible experiments**: every feature should be measurable, exportable, and replayable.
- **Locality + scaling**: avoid O(N^2) paths; prefer local kernels, sparse graphs, and throttled readbacks.
- **Minimal confounding**: add one capability at a time with clear acceptance tests.

## Current system snapshot
- Core simulation: `src/simulation.js` + WGSL in `src/shaders.js` (rules 0-5, kernels, topology mode).
- Rendering: `src/renderer.js` (fast 2D triangle path + 3D mesh/instanced).
- UI/state: `index.html` + `src/ui.js` + `src/urlstate.js`.
- Analysis: `src/statistics.js` (Local/Global order, χ proxy, K-scan, LLE heuristic, FSS).
- Reservoir: `src/reservoir.js` (input injection modes + sparse readout + online RLS).

## Interaction primer (what exists today)
- Draw/erase: Cmd+drag draws random phase seeds; Cmd+Shift+drag erases.
- 2D navigation: scroll zoom anchored to cursor; double-click resets zoom/pan.
- 3D surface modes: Continuous Mesh vs Instanced Quads.
- Color = Data layer × Palette: palettes cycle with `C`; data layer cycles with Shift+`C`.
- RC injection modes: `freq_mod`, `phase_drive`, `coupling_mod`.

## Known issues / correctness risks (must address early)
- **Multi-layer stats**: ensure layer-aware metrics stay intra-layer (e.g., phase gradient); avoid cross-layer indexing artifacts.
- **Metric semantics drift**: ensure UI/plot/export naming is explicit (globalR vs localMeanR) and consistent.
- **RC + layers mismatch**: fixed by defining an explicit policy (default: active-layer features + injection).
- **LLE scope**: Lyapunov estimator is heuristic and not aligned with every shader mode (kernels/topology/interlayer); treat as an indicator, not a proof.

## Roadmap (strategically prioritized)

## Near-term queue (next 2-3 sessions)
- **Surface-mode stability pass**: regression-test mesh vs instanced across resize/zoom/draw parity in 2D/3D; add a small UI mode indicator.
- **RC vs criticality experiment preset**: one-click K-sweep that overlays task test NRMSE vs K alongside local mean R and chi (temporal variance proxy); same seed across runs.
- **Spatiotemporal benchmark polish**: make moving-dot task explicit (dot overlay + target trail) and log/report its metric separately.
- **Input-mode comparison**: side-by-side micro-plots for `freq_mod` / `phase_drive` / `coupling_mod` under shared seed.
- **Order-history sparkline**: lightweight local mean R(t) / chi(t) strip that can be paused/exported.

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
- Seed discipline: a single `seed` controls all stochastic init/noise/topology sampling.
- Scenario runner: run for T steps, collect summary metrics, export JSON/CSV with config hash.
- URL/state completeness: ensure all parameters used in experiments round-trip.
- “Save/Load state”: serialize θ/ω/params with versioning; optional shareable link.
- Targeted perturbations: reproducible pulse/erase actions (logged in the scenario runner) for stability/recovery experiments.
- Optional recording/export: deterministic capture (fixed FPS, downsample) for shareable comparisons.

Acceptance:
- Same seed + same URL state yields comparable trajectories (within floating tolerance).
- A/B configs can be compared via exported metrics, not screenshots.

### Phase 2 — Analysis instrumentation that supports discovery
Goal: diagnostics that explain patterns rather than just naming them.
- Kernel influence probe: hover a cell and visualize local kernel weights and dominant contributors.
- Graph edge overlay: in topology mode, show hovered node’s edges and weights.
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
- Add weight diagnostics + export for reproducibility.

Acceptance:
- Learning improves task metrics on held-out test windows and remains stable under long rollouts.

### Phase 6 — Vector oscillators / AKOrN-style dynamics (optional research track)
Goal: introduce n-sphere oscillators once the framework can evaluate them.
- Add an alternate sim mode with x_i on S^{N-1} (start N=4), tangent projection, and local coupling.
- Add symmetry-breaking field C from image/video or a simple readout module.
- Add energy proxy + test-time compute extension experiments.

Acceptance:
- Vector mode is stable, measurable, and comparable to scalar phase mode via the same harness.

## Dependency notes
- Do Phase 0 before anything else: learning/RC will otherwise optimize into metric bugs.
- Do Phase 1 before Phase 3/5/6: otherwise you can’t compare configurations reliably.
- Do Phase 2 before major new dynamics: it prevents “black box” iteration.
