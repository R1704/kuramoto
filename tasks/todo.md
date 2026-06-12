# Standing Guidance: KuramotoNCA Design Faults (2026-06-10 expert review)

These are the standing faults to steer Rule 7 work by. Prefer changes that resolve a
fault over changes that add features. Recommended order is (1)→(6).

1. **Phase only couples to matter through |R| (rotation-invariant).** Oscillator state
   collapses to coherence magnitude before touching matter, discarding relative phase /
   gradients / defects. The model is named for synchrony binding but structurally cannot
   bind. Fix: make co-growth/identity depend on *relative* phase (in-phase neighbors bind,
   anti-phase form boundaries).
2. **It is Lenia + a coherence multiplier; the oscillator is unproven.** Run the ablation:
   (a) full oscillator coupling vs (b) passive diffusing scalar of matched smoothness vs
   (c) gate pinned to 1 (pure Lenia). Cheapest, highest-information experiment. If (a) adds
   nothing, redesign.
3. **Six redundant birth/death terms = brittle hand-tuning.** Collapse to one growth + one
   saturating decay with structural homeostasis instead of imposing stability by sweeping.
4. **"Hidden morphogen memory" is just an EMA of current observables.** Drop it now, or
   commit to free + learned latent state later.
5. **Viability score rewards the trivial max-R synchronized blob** and penalizes the
   metastable / edge-of-chaos regimes that matter. Re-target it (metastability,
   regeneration-after-perturbation, distinct phase domains; penalize global-sync fixed point).
6. **Strategic: AKOrN (Miyato et al. 2024) is the actual prize and is deferred.** Reframe
   the scalar app as the AKOrN intuition rig; next real milestone = a *trained* toy task
   (segment two overlapping shapes by phase), not more presets. If in-browser autodiff
   blocks it, the learning phase needs an offline PyTorch sidecar with WebGPU as viewer.

Numerics watch-outs: `local_r = field / max(matter_exc, 1e-5)` manufactures spurious unit
coherence at the matter frontier (guard with a matter-mass floor); explicit Euler + clamp(0,1)
can mask instability — real structures survive a `dt` halving, clamp artifacts don't.

Keep: trust-first verifier-per-pass discipline, the per-cell NCA probe, matter-normalized
perception, scalar-before-vector warm-up.

---

# Task: Fix remaining faults — #3 collapse death terms, #4 drop hidden EMA, #5 viability re-target, binding-dependence experiments, #6 reframe

Status: done (2026-06-12). Phase 1 work committed as 4331809; this task committed separately.

## Pass 1 — Collapse Rule 7 dynamics (#3) + drop hidden channels (#4)

Design: `da = growth_k * (gate^2 * G+(u) * (1-a) - (G-(u) + decay) * a)`. One coherence-gated
saturating growth term; death is structural (the negative tail of the growth function) plus a
small passive leak. Removed as redundant: incoherence_death (gate already encodes it on the
birth side), overcrowding_death (inhibition already enters u via beta), memory_gate /
memory_death (hidden EMA dropped entirely — fault #4 decision: drop now; learned latent state
returns with the AKOrN sidecar if ever). ncaSyncFeedback and ncaHiddenMemory params removed.
Hidden texture plumbing (bindings 22/23, ping-pong, loadHiddenGlobal) removed — exploration
confirmed it is 100% isolated to rule 7, never rendered, never read back.

- [x] Failing verifier checks first (5 failed, then all 37 pass)
- [x] compute.js: collapsed da; strip hidden bindings/loads/stores/NcaStep.hidden_next;
      slots 57/61 become padding (S2/S3 struct copies untouched — they never run rule 7)
- [x] JS plumbing removal: buffers.js (hidden textures + slot 57/61 packing), pipelines.js,
      Simulation.js hidden flip, defaultState, urlSchema, layerParams, index.html (2 sliders
      + sweep options), controls.js, updateDisplay.js, presets.js
- [x] Probe mirrors the collapsed rule exactly (+ fixed shape-7 kernel drift in the probe)
- [x] Browser verify: zero console errors; droplets preset stable 10s (matter mean ~0.26,
      513 organisms), rule 6 stable (405 organisms), dt-halving survives (195 organisms,
      mean 0.27). No retune needed.

## Pass 2 — Re-target viability (#5)

Design: per-organism circular mean phase (detector takes theta alongside order field), then
score = matter window + structure (organism count, dominance penalty for one giant blob) +
phase diversity (area-weighted circular spread of organism mean phases; fallback: localR vs
globalR gap = locally-coherent-globally-diverse) + dynamism (temporal R std / chi in a healthy
band — frozen R~1 and pure noise both score low). Explicit uniform_sync penalty + new regimes
'multi_domain' (best) and 'uniform_sync'. Fix the sweep call site that currently passes FAKE
organism data (organismCount: 0, largestArea = total mass) — wire getOrganisms + globalR in.

- [x] Failing verifier checks first (4 failed, then all 41 pass)
- [x] StructureDetector: optional theta input -> per-structure meanPhase + internal phaseR
- [x] frameLoop: theta read SEQUENTIALLY after order field (all readbacks share one
      pending-guard mutex; Promise.all silently nulls the second read - caught in browser)
- [x] computeNcaViability rewrite + scripts/verify-nca-viability.mjs (10 behavioral checks:
      multi-domain 0.98 > lattice-shared-phase 0.29 > uniform blob 0.13; extinct/overgrown floor)
- [x] Sweep call site detects organisms from readback itself (own StructureDetector) +
      passes matterMass/globalR/phaseDiversity; ExperimentRunner passes globalR std +
      phaseDiversity series + organism-derived living coherence
- [x] Browser verify (readback, real system): Mitosis diversity 0.894 -> score 1.0
      multi_domain; forced uniform sync diversity 0 -> 0.324 uniform_sync; droplets
      lattice diversity 0.035 -> 0.334 uniform_sync. FINDING: the droplets spot lattice
      is itself phase-locked (trivial regime) - the metric now exposes that; Mitosis is
      the only preset currently in the multi_domain regime.

## Pass 3 — Binding-dependence experiments (fault #1 follow-up)

- [x] Omega heterogeneity: per-cell omega ~N(0,0.2), Mitosis seed, SAME theta/matter/omega
      across 4 conditions {gate on/off} x {affinity 0/0.7}, measured at 2.5/5/10s
- [x] RESULT — binding IS load-bearing for structure under drift pressure: pure Lenia
      (gate off, aff 0) merges to 317 organisms / div 0.819 at 10s (142 at 5s); binding
      alone (gate off, aff 0.7) restores 566 / 0.901 (454 at 5s; 3.2x mid-run gap),
      matching the full model. The affinity term alone reproduces the oscillator
      pathway's structural contribution. Still open: minutes-scale identity tracking.
- [x] Affinity sweep note: the new metric saturates at 1.0 across all 4 healthy
      conditions, so a ncaPhaseAffinity sweep cannot rank WITHIN the multi-domain
      regime — documented as a known ceiling (the metric separates regimes, which is
      what sweeps needed to escape the trivial attractor).

## Pass 4 — Reframe toward AKOrN (#6)

- [x] ROADMAP.md research-triage entry rewritten: browser = AKOrN intuition rig; next
      real milestone = trained toy task; offline PyTorch sidecar is the vehicle
- [x] sidecar/akorn-toy/ scaffold: differentiable unrolled scalar Kuramoto layer
      (CNN -> omega + signed neighbor couplings), pairwise phase-binding BCE loss,
      threshold-free pairwise accuracy eval. py_compile-verified; NOT trained (no torch
      in this environment) and the README says so

## Review

All six standing faults now addressed: #1 binding implemented AND proven load-bearing
(under omega heterogeneity), #2 ablation harness, #3 dynamics collapsed to growth +
structural decay (2 params and 1 texture ping-pong removed; validated attractor
unchanged), #4 hidden EMA fully removed, #5 viability re-targeted to multi-domain
(uniform-sync explicitly penalized; sweep site fed real organism+phase data instead of
fakes), #6 reframed with a runnable-shaped training scaffold.

Verification: verify-kuramoto-nca.mjs 41/41, verify-kuramoto-audit.mjs 5/5,
verify-nca-viability.mjs 10/10, zero browser console errors, readback-verified dynamics
(stability, dt-halving, regime ranking on the live system).

Surprises worth remembering: (a) all sim readbacks share one pending-guard mutex —
Promise.all on two readbacks silently nulls the second (fixed sequentially at both new
call sites, verifier check added); (b) the droplets spot lattice is itself phase-locked
(diversity 0.035) — visually rich but in the trivial phase regime; Mitosis is the only
preset in multi_domain. Finding binding-dependent *presets* is now a search problem the
fixed sweep + metric can actually do.

Follow-up session (same day, "go ahead"): all three known limits were closed.
- Viability de-saturation: hard clamps -> soft saturation x/(x+k) + direct [0,1] factors;
  the real binding-experiment endpoints now rank (binding-only > pure Lenia) instead of
  tying at 1.0; regression check added (verify-nca-viability 11/11).
- Minutes-scale identity (90s tracked runs, omega heterogeneity, affinity 0 vs 0.7):
  positional identity is binding-INDEPENDENT (zero deaths, 100% survival both); phase
  identity erodes in both and binding slows the erosion ~25-30% (diversity at 90s 0.737
  vs 0.618; decay 0.0027/s vs 0.0034/s). Binding is a brake, not a wall. Single run per
  condition - directional.
- Sidecar TRAINED to convergence (torch 2.12/MPS via uv venv): pairwise segmentation
  accuracy on fresh scenes 0.994 at step 100, sustained 1.000 from step 300 (2000 steps).
  Two fixes were required and are documented in the README: (1) random initial phases
  make expected gradients vanish (could not even overfit one scene) -> near-uniform init
  turns the task into "learn to cut"; (2) unbounded heads broke the explicit-Euler
  stability bound (~4.6 rad/step updates -> chaos) -> tanh-bounded heads + mean-normalized
  drive cap updates at 0.5 rad/step. The fault #6 milestone - segment two overlapping
  shapes by phase, trained end-to-end through unrolled Kuramoto dynamics - is achieved.

---

# Task: Phase Binding (fault #1 — relative phase carries identity)

Status: done (2026-06-10) — mechanism implemented + verified; load-bearing identity proof
needs harder experimental conditions (see Review).

Goal: matter perception in Rule 7 becomes phase-selective so synchrony binds and phase
difference segments — the model's actual thesis.

## Design
- Neighbor support = a_j * mix(1, 0.5 + 0.5*cos(theta_j - theta_i), ncaPhaseAffinity),
  accumulated into a separate `matter_support` used for the growth input u.
- `matter_exc` (phase-blind) still normalizes the oscillator field and hidden average —
  affinity must not inflate R.
- Inhibition stays phase-blind: competition for space is physical, support is selective.
- `ncaPhaseAffinity` in free uniform slot 63; state/UI/URL/sweep wiring like ablation mode.
- Mitosis preset seeds its two lobes at opposite phases to demo binding.

## Success criteria
1. Verifier checks for the affinity term, wiring, and probe mirror (fail first).
2. Binding experiment (readback): two touching blobs at opposite phases, same seed —
   affinity high => 2+ persistent organisms with a matter gap; affinity 0 => fused mass.
3. Docs record the binding model and the experiment.

## Checklist
- [x] Failing verifier checks (3 failed first).
- [x] Shader: matter_support accumulator + affinity mix; field/hidden normalization stays phase-blind.
- [x] Probe mirror.
- [x] State/layerParams/buffers(63)/urlSchema/UI slider/sweep option/candidate state.
- [x] Preset: base affinity 0.7 + Mitosis opposite-phase lobes.
- [x] Verifiers + readback binding experiments.
- [x] DOCUMENTATION/memory updates (claims match measurements).

## Review (readback experiments, 256², same-seed conditions)
- Interface growth: affinity changes the anti-phase interface response strongly and
  non-monotonically — at the Mitosis seed density, phase-blind support puts interface u
  ABOVE the growth window (starves, lobe/interface ratio 41 at 2.5s) while binding halves
  perceived density INTO the window (feeds it, ratio 5). The term is live and powerful.
- Identity persistence: Δφ(left,right) ≈ 180° persists ≥7.5s in BOTH conditions — domain
  identity is currently maintained by spot-lattice matter gaps (sync torque decoupling)
  and omega = 0, not by the affinity term. Binding is implemented but not yet PROVEN
  load-bearing; the discriminating tests need omega heterogeneity / forced contact /
  longer horizons, and the viability metric should reward multi-domain persistence
  (fault #5) so sweeps can search for binding-dependent regimes.
- All verifiers pass (3 new checks failed first); syntax clean; no console errors.

---

# Task: Make Organisms Possible (audit fixes, pass A)

Status: done (2026-06-10)

Goal: fix the structural reasons no organisms can form (audit findings), in order of leverage.

## Assumptions
- A smooth nonnegative ring ("Lenia shell") becomes kernel shape 7, available to rules 4/6/7.
- Rule 6 becomes TRUE Lenia: growth applied to the existing matter ping-pong field
  (convolve matter, not phaseDensity), order buffer = matter for detection. The old
  phase-density behavior is removed (it was mislabeled; verifier updated accordingly).
- Rule 7 gate gets a matter-mass floor: R is normalized by max(matter_exc, 0.05*pos_total)
  so near-empty neighborhoods read as incoherent instead of R=1.
- Visibility: sqrt gain on the Matter layer in both render paths; switching to rules 0-5
  moves the display off the frozen Matter layer.
- Plumbing quickies in the same pass: growthMu/Sigma/Mode in urlSchema, rule 6 radius
  clamp, NCA Range button sweeps growthMu (ncaGrowthK cannot change the attractor).
- Success this pass = bounded, localized, visible, detectable matter structures
  (not grid-filling mush). A tuned glider/soliton is the follow-up search task.

## Checklist
- [x] Add/adjust verifier checks (fail first); update the stale cyclic-density check.
- [x] Shell kernel (shape 7) in mexhat_weight dispatch + UI option.
- [x] Rule 6 rewrite: matter convolution + growth + matter write + order=matter; radius clamped.
- [x] Rule 7 mass-floor on oscillator-field normalization (+ mirror in probe).
- [x] Matter layer sqrt gain (2D + 3D render shaders).
- [x] Leave Matter layer when switching to rules 0-5 (stale-texture trap).
- [x] Rewrite lenia_* presets: matter seeds, shell kernel, colormap=10, validated growth params.
- [x] urlSchema: growthMu/growthSigma/growthMode; NCA Range -> growthMu.
- [x] Static verifiers + readback-based dynamics validation.
- [x] Update DOCUMENTATION/README/ROADMAP + this file.
- [x] BONUS (found during validation): the Analysis sweep never transmitted layer-backed
      params (growth/NCA/kernel/gauge) to the GPU — all such sweep rankings were noise.
      Fixed via syncParams -> applyLayerStateToSimulation in the sweep controller and
      exposed the same sync on window.__kuramotoDebug.

## Review (readback-verified at 256², no-cache dev server)
- Old Rule 7 (Gaussian-core kernel): blob front-swept to 91% grid coverage, max 0.58,
  ONE detected organism, local R = 0.997 everywhere (vacuous gate) — the observed mush.
- New Rule 6 (true matter Lenia + shell kernel): lenia_orbium preset condenses into a
  stable lattice of 619 discrete persistent spots (~45 cells each), coverage stable at
  ~27%, max 1.0, all individually tracked. growthSigma <= 0.04 dies; 0.06 validated.
- New Rule 7 (shell kernel + mass floor + validated window): kuramoto_nca_orbium preset
  yields ~101 discrete coherent living spots out of the box.
- Ablation sweep rows now genuinely differ (chi: 0.0157 full vs 0.0003 gate-off).
- Verifiers: nca 35+ checks PASS (9 new failed first), audit PASS, syntax clean.
- Known remaining: spot lattices colonize the grid (confined single organisms = sweep
  search over growthMu); coherence gate still mostly open INSIDE spots (fault #1
  relative-phase work is the next substantive model change); probe still omits
  memory_gate/memory_death terms.

---

# Task: KuramotoNCA Ablation Harness (Fault #2)

Status: done (2026-06-10)

Goal: answer "does the oscillator earn its place?" with a same-seed 3-way ablation:
mode 0 = full model, mode 1 = frozen oscillator (omega zeroed; phase becomes a passively
relaxing alignment field), mode 2 = coherence gate pinned to 1 (pure Lenia matter dynamics).

## Assumptions
- Reuse the existing Analysis sweep (baseline capture/restore gives same-seed conditions,
  thumbnails + matter/viability metrics per condition) instead of a new runner.
- `ncaAblationMode` is a per-layer param in the free uniform slot 62 (`_pad3`).
- Mode 1 zeroes `omega_eff` for Rule 7 only; mode 2 pins `coherence_gate = 1` (which also
  zeroes incoherence death). No new textures, no new pipelines.
- Viability ranking is kept but the deliverable is the side-by-side row comparison, not the
  rank (fault #5 says viability favors boring blobs; do not auto-apply "best" here).

## Success Criteria
1. Rule 7 supports the three ablation modes in the shader.
   - Verify: static verifier checks `nca_ablation_mode` uniform, gate override, omega zeroing.
2. UI exposes an Ablation select in NCA controls and an "NCA Ablation" sweep shortcut that
   runs the 3-way comparison (param `ncaAblationMode`, 0→2, 3 integer steps).
   - Verify: static verifier checks select, sweep option, shortcut wiring, int-param handling.
3. State/URL/probe stay consistent (defaults, layerParams pack/unpack, urlSchema, probe gate).
   - Verify: static verifier + browser check on the no-cache dev server.
4. Docs record the ablation harness and how to read the result.
   - Verify: DOCUMENTATION.md Rule 7 section mentions the ablation modes and protocol.

## Checklist
- [x] Add failing verifier checks for the ablation harness (observed 4 failures first).
- [x] Add `ncaAblationMode` to state, layerParams, buffers (slot 62), urlSchema, presets.
- [x] Implement shader branches: gate override (mode 2) and omega zeroing (mode 1).
- [x] Add NCA Ablation select + sweep option + shortcut button; sync in updateDisplay.
- [x] Treat `ncaAblationMode` as integer sweep param; include it in candidate state.
- [x] Make the NCA probe respect mode 2 so probe and shader agree.
- [x] Update DOCUMENTATION.md, ROADMAP.md, and this task file.
- [x] Run static verifier and browser verification.

## Review
- Static verifiers: verify-kuramoto-nca.mjs all PASS (4 new checks failed before
  implementation, pass after); verify-kuramoto-audit.mjs 5/5 PASS; node --check clean on
  all 10 edited JS files.
- Browser (no-cache dev server, port 8123 — port 8000 was held by an unrelated uvicorn
  service): zero console errors/warnings; Rule 7 + ablation select live-flips all 3 modes;
  NCA Ablation button configures and runs the 3-step integer sweep to "done".
- First real run (KuramotoNCA Orbium, settle 240): conditions are dynamically distinct —
  chi(full)=33.2 vs chi(frozen)=3.27 vs chi(gate-off)=3.34 (10x), while localR/viability
  tied at 0.067/0.531. Early hint: at this preset the oscillator's main contribution is
  temporal fluctuation richness, not matter morphology. Needs longer settles and more
  presets before concluding (smoke test only).

---

# Task: KuraNCA Coherence-Gated Model

Status: in progress

Goal: record and implement the simplified KuraNCA model where each cell is conceptually `(matter, unit oscillator)` and Rule 7 uses coherence-gated birth/death instead of additive sync feedback.

Success criteria:
1. The model is written in repo docs and the Imaginarium vault.
2. Rule 7 computes matter-normalized oscillator perception, a smooth coherence gate, positive/negative growth, and birth/death matter update.
3. UI labels `ncaSyncFeedback` as incoherence death rather than generic sync feedback.
4. Static verifier passes for the new model.

- [x] Write KuraNCA model spec in repo docs.
- [x] Write KuraNCA model note in Imaginarium.
- [x] Add verifier checks and observe expected failures.
- [x] Update shader, probe, UI, docs, and verification.
- [x] Add stricter coherent birth and inhibitory-surround death to reduce expanding blob behavior.
- [x] Retune Rule 7 diagnostic presets toward coherent islands/droplets after the stricter matter update.
- [x] Promote coherence gate thresholds to explicit state/UI/sweep parameters for the main KuraNCA model.

# Task: KuramotoNCA Phase 3 Apply Best Candidate

## Assumptions
- Continue the sweep/ranking workflow instead of adding learned kernels.
- Applying a candidate should set only the swept parameter and keep the current seeded state/preset otherwise intact.
- The result should sync to URL/state so a good candidate can be shared or turned into a preset later.

## Success Criteria
1. The sweep UI can apply the top-ranked candidate after a run.
   - Verify: static verifier checks `applyBestResult`, `onApplyBestSweep`, and `sweep-apply-best-btn`.
2. Applying the best candidate updates live state and URL.
   - Verify: browser sweep then Apply Best changes the selected parameter value.
3. Project memory records this as the bridge from search to presets.
   - Verify: DOCUMENTATION, tasks, and Imaginarium mention Apply Best.

## Checklist
- [x] Add failing verifier check for Apply Best.
- [x] Add `applyBestResult` to the sweep controller.
- [x] Wire `onApplyBestSweep` and the Apply Best button.
- [x] Update DOCUMENTATION and task notes.
- [x] Update Imaginarium project note.
- [x] Run static checks and browser verification.

---

# Previous Task Snapshot: KuramotoNCA Phase 3 Parameter Sweep Ranking

## Assumptions
- Continue from Phase 2 instrumentation into systematic parameter search.
- Reuse the existing Analysis parameter sweep instead of creating a second runner.
- Rank Rule 7 sweeps by the existing viability score, using throttled post-settle readback only.

## Success Criteria
1. The parameter sweep supports KuramotoNCA parameters.
   - Verify: static verifier checks NCA parameter options and the NCA Range shortcut.
2. Rule 7 sweep rows include matter and viability metrics, ranked by viability.
   - Verify: static verifier checks `readMatterField`, `ncaViabilityScore`, `rankSweepResults`, and UI rendering.
3. Project memory records this as the next step before learned kernels.
   - Verify: DOCUMENTATION, ROADMAP, tasks, and Imaginarium note mention sweep ranking.

## Checklist
- [x] Add failing verifier check for NCA sweep ranking.
- [x] Add matter readback and viability scoring to the existing sweep controller.
- [x] Rank Rule 7 sweep results by `ncaViabilityScore`.
- [x] Add NCA sweep parameters and the NCA Range shortcut.
- [x] Update ROADMAP, DOCUMENTATION, and project task notes.
- [x] Update Imaginarium project note.
- [x] Run static checks and browser verification.

---

# Previous Task Snapshot: KuramotoNCA Phase 2 Probe Contributors

## Assumptions
- Continue the analysis instrumentation phase.
- The next useful improvement is to show which neighbor offsets dominate the local growth terms.
- Keep it CPU-side and throttled using the existing probe readback path.

## Success Criteria
1. The NCA probe reports dominant excitatory and inhibitory neighbor contributors.
   - Verify: static verifier checks `dominantExc`, `dominantInh`, `nca-probe-top-exc`, and `nca-probe-top-inh`.
2. The browser probe shows numeric contributor offsets after hovering the canvas.
   - Verify: browser check on the no-cache dev server.
3. Project memory reflects the updated probe capability.
   - Verify: DOCUMENTATION, ROADMAP, tasks, and Imaginarium note mention contributor offsets.

## Checklist
- [x] Add failing verifier check for dominant probe contributors.
- [x] Compute dominant excitatory/inhibitory neighbor offsets in the NCA probe.
- [x] Display contributor offsets in the Analysis tab.
- [x] Update ROADMAP, DOCUMENTATION, and project task notes.
- [x] Update Imaginarium project note.
- [x] Run static checks and browser verification.

---

# Previous Task Snapshot: KuramotoNCA Phase 2 Local Probe

## Assumptions
- "Phase 2" means the roadmap's analysis instrumentation phase for KuramotoNCA, not learned kernels yet.
- The first useful probe should explain Rule 7 at the hovered cell using existing readback APIs.
- Keep the probe analysis-only and throttled; do not add continuous training or new GPU pipelines.

## Success Criteria
1. A local Rule 7 probe computes the scalar update terms that decide matter growth.
   - Verify: static verifier checks `computeKuramotoNcaProbe` and fields for excitation, inhibition, growth input, coherence, and matter delta.
2. The Analysis tab displays the probe readout when Rule 7 is active.
   - Verify: static verifier checks `nca-probe-summary` UI and browser hover fills numeric probe fields.
3. Project memory records Phase 2 as discovery instrumentation before learned kernels.
   - Verify: DOCUMENTATION, ROADMAP, tasks, and Imaginarium note mention the probe.

## Checklist
- [x] Add failing verifier check for NCA probe computation/UI/docs.
- [x] Add `src/analysis/kuramotoNcaProbe.js`.
- [x] Wire throttled hover readback through overlay diagnostics.
- [x] Add compact Analysis tab NCA probe readout.
- [x] Update ROADMAP, DOCUMENTATION, and project task notes.
- [x] Update Imaginarium project note.
- [x] Run static checks and browser verification.

---

# Previous Task Snapshot: KuramotoNCA Phase 1.7 Viability Readout

## Assumptions
- Continue validating scalar Rule 7 before adding learned kernels or vector AKOrN cells.
- Use already-throttled rollout samples; do not add continuous per-frame readback.
- The first score should be a triage signal, not a scientific final metric.

## Success Criteria
1. KuramotoNCA rollout exports include a comparable viability signal.
   - Verify: static verifier checks `ncaViabilityScore` and `ncaRegime` in experiment output code.
2. The Analysis rollout panel shows the viability result after a run.
   - Verify: static verifier checks the `exp-nca-summary` UI readout.
3. Project memory explains what the score is and is not.
   - Verify: DOCUMENTATION and ROADMAP mention viability.

## Checklist
- [x] Add failing verifier check for viability export/UI/docs.
- [x] Compute `ncaViabilityScore` and `ncaRegime` from existing rollout samples.
- [x] Add compact Analysis panel readout.
- [x] Update ROADMAP, DOCUMENTATION, and project task notes.
- [x] Update Imaginarium project note.
- [x] Run static checks and browser verification.

---

# Previous Task Snapshot: KuramotoNCA Phase 1.6 Legibility Presets

## Assumptions
- Rule 7 is a substrate milestone, not a finished learned NCA organism generator.
- The next useful step is to make matter dynamics and parameter effects visible before adding learned kernels or MLP updates.
- Keep the pass small: shader growth semantics, presets, verification, and docs.

## Success Criteria
1. Rule 7 exposes clearer excitation/inhibition matter dynamics.
   - Verify: static verifier checks separate excitatory and inhibitory matter densities in WGSL.
2. The UI offers multiple KuramotoNCA diagnostic starts.
   - Verify: static verifier checks Orbium, Mitosis, Filament, and Droplets presets are present and wired.
3. Project memory explains how to read the current behavior.
   - Verify: DOCUMENTATION, ROADMAP, and Imaginarium note describe the scalar matter-plus-phase status and deferred learned phases.
4. App still boots and the new presets load without WebGPU or console errors.
   - Verify: browser check on the no-cache dev server.

## Checklist
- [x] Add failing verifier checks for preset diversity and legible growth.
- [x] Split Rule 7 growth into excitatory and inhibitory matter densities.
- [x] Add KuramotoNCA Orbium, Mitosis, Filament, and Droplets presets to code and UI.
- [x] Update ROADMAP, DOCUMENTATION, and project task notes.
- [x] Update Imaginarium project note.
- [x] Run static checks and browser verification.

---

# Previous Task Snapshot: KuramotoNCA Phase 1.5 Live Validation

## Assumptions
- The current browser warning comes from stale ES module caching, not missing source code.
- Keep the fix small: provide a no-cache dev server and update local run guidance.
- Continue using the existing static app architecture.

## Success Criteria
1. Local browser verification no longer depends on hard-refreshing stale modules.
   - Verify: audit script checks `scripts/dev-server.mjs` and docs mention `node scripts/dev-server.mjs`.
2. KuramotoNCA preset still loads after cache-clear verification.
   - Verify: browser check selects `7: KuramotoNCA`, Matter layer, and NCA controls with no console warnings/errors.
3. Manual Rule 7 use starts from an interpretable state.
   - Verify: verifier checks manual Rule 7 selection seeds matter and switches to the Matter layer.
4. Webcam input is visible again for S1.
   - Verify: verifier checks S1 omega patterns include `image` and the webcam button exists.

## Checklist
- [x] Add failing audit check for no-cache dev server guidance.
- [x] Add `scripts/dev-server.mjs` with `Cache-Control: no-store`.
- [x] Update README, DOCUMENTATION, and AGENTS local run guidance.
- [x] Run static checks and browser verification.
- [x] Restore S1 Image/Video omega input so webcam controls can appear.
- [x] Seed visible matter when manually switching to Rule 7.

---

# Previous Task Snapshot: KuramotoNCA Phase 1 Substrate

## Assumptions
- Phase 1 is deliberately scalar S1: separate living matter `a_i` plus oscillator phase `theta_i`.
- Learned kernels, MLP updates, AKOrN/S3, flow matching, gauge coupling, and curved-space variants remain later phases.
- Keep the implementation static-app compatible: no bundler, no ML dependency, no training runtime.

## Success Criteria
1. Rule 7 evolves matter and phase as separate state fields.
   - Verify: static verifier checks matter ping-pong bindings, `writeMatter`, `readMatterField`, and Rule 7 dispatch.
2. Organism detection sees living coherent matter.
   - Verify: Rule 7 writes living coherence `a_i * R_i` to the order buffer.
3. UI exposes only compact KuramotoNCA controls.
   - Verify: Rule 7 shows phase coupling, growth rate, sync feedback, and matter decay controls plus Matter layer.
4. Preset and experiments can exercise the substrate.
   - Verify: `kuramoto_nca_orbium` seeds matter and phase; experiment exports matter/organism metrics.
5. Docs and project memory explain what was implemented and what remains deferred.
   - Verify: README, DOCUMENTATION, ROADMAP, and Imaginarium note mention the scalar matter-plus-phase substrate.

## Checklist
- [x] Add KuramotoNCA static verifier and watch it fail first.
- [x] Add matter ping-pong textures, Simulation APIs, and readback.
- [x] Implement Rule 7 matter-plus-phase shader update.
- [x] Add Matter rendering layer and compact UI controls.
- [x] Add four fixed hidden morphogen channels as Rule 7's first real NCA memory state.
- [x] Add `kuramoto_nca_orbium` preset with matter seeding.
- [x] Add throttled experiment matter/organism metrics.
- [x] Update README, DOCUMENTATION, ROADMAP, and Imaginarium project note.
- [x] Run static checks and browser verification.

---

# Previous Task Snapshot: Kuramoto Trust + UI Clutter Pass

## Assumptions
- "Do all of it" means the concrete near-term audit recommendations, not the long-horizon AKOrN / learnable-coupling research track.
- Keep changes surgical: correctness fixes first, then a small UI organization pass.

## Success Criteria
1. Shader modifiers are trustworthy.
   - Verify: repo verification script fails before the fix and passes after.
2. Lenia growth no longer treats wrapped phase as a discontinuous scalar.
   - Verify: repo verification script checks for cyclic density use.
3. Dynamics panel is less cluttered on first open.
   - Verify: browser shows advanced coupling sections collapsed by default.
4. App still boots in browser with no new console errors.
   - Verify: local server + browser console check.
5. Browser verification is not polluted by a missing favicon.
   - Verify: repo verification script checks the inline favicon link.

## Checklist
- [x] Add a small verification script for shader invariants.
- [x] Watch the new verification fail on current code.
- [x] Fix shader modifier scaling and Lenia cyclic density.
- [x] Verify the script passes.
- [x] Collapse advanced Dynamics sections by default.
- [x] Add an inline favicon to avoid the previous browser 404.
- [x] Boot app and verify UI/console behavior.
- [x] Summarize results and remaining larger roadmap items.

---

# Previous Task Snapshot: Phase 1 + Phase 2 — Lenia Growth Function & Structure Detection

## Status: COMPLETED

## Phase 1: Lenia Growth Function (Rule 6) — DONE

### Summary
Implemented Rule 6 (Lenia Growth) — a Lenia-style growth function applied to kernel convolution results.

### Changes
- **Shader** (`shaders.js`): Replaced padding with `growth_mu/sigma/mode`, added 4 growth functions + `rule_lenia` + dispatch
- **JS Pipeline**: `defaultState.js`, `layerParams.js`, `buffers.js`, `urlstate.js` — growth params at offsets 52-54
- **UI**: Rule 6 dropdown option, growth μ/σ sliders, growth mode select, show/hide logic
- **Presets**: `lenia_orbium`, `lenia_geminium`, `lenia_scutium` with initial seeds

## Phase 2: Structure Detection & Tracking — DONE

### New Files
- **`src/organisms/StructureDetector.js`** — Union-find connected-component labeling on thresholded local R field, periodic-boundary-aware, circular centroid computation
- **`src/organisms/StructureTracker.js`** — Greedy nearest-centroid matching with area similarity scoring, track lifecycle (birth/death/persistence), velocity computation, periodic distance
- **`src/organisms/index.js`** — Exports

### Modified Files
- **`src/simulation/readback.js`** — Added `readOrderField()` (copies orderBuf → staging → CPU)
- **`src/simulation/Simulation.js`** — Added import + delegation for `readOrderField()`
- **`src/app/render/frameLoop.js`** — Throttled organism detection (200ms), syncs detector params from state, updates DOM stats, organism overlay drawing
- **`src/app/bootstrap.js`** — Initializes StructureDetector, StructureTracker, organism overlay canvas; passes all to frame loop
- **`src/app/runtime/initEventWiring.js`** — Resizes organism overlay canvas on window resize
- **`src/core/overlays.js`** — Added `drawOrganismOverlay()` — bounding boxes, centroids, track labels, velocity vectors, organism count
- **`index.html`** — Organism overlay canvas, organisms panel (count, lifecycle, threshold slider, min area slider, overlay toggle), CSS positioning
- **`src/app/defaultState.js`** — Added `organismsEnabled`, `organismOverlay`, `organismThreshold`, `organismMinArea`
- **`src/ui/bindings/controls.js`** — Bound organisms toggle, overlay toggle, threshold slider, min area slider
- **`src/ui/view/updateDisplay.js`** — Syncs organisms panel state
- **`src/utils/urlstate.js`** — Added organism params to DEFAULTS and SCHEMA

### Architecture
```
GPU orderBuf → readOrderField() → StructureDetector.detect()
     → StructureTracker.update() → runtime.organisms
     → drawOrganismOverlay() → canvas
```

Detection runs every 200ms (configurable), only when `organismsEnabled === true`.

### Verification Checklist
- [ ] Load Rule 4 chimera preset → detect coherent half as organism
- [ ] Load Rule 6 Lenia preset → stable organism gets persistent track ID
- [ ] Organism wrapping periodic boundary → single ID, not split
- [ ] Threshold slider changes detection sensitivity in real-time
- [ ] Overlay shows bounding boxes, centroids, velocity vectors
- [ ] Born/died/tracked counts update
- [ ] Performance: no frame drops at 256×256 with detection enabled
