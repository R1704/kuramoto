# KuraNCA Coherence-Gated Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Rule 7's additive sync feedback with the simpler coherence-gated KuraNCA model and document it as the reference model.

**Architecture:** Keep the current \(d=2\) phase texture but interpret it as a unit vector \((\cos\theta,\sin\theta)\). Rule 7 computes excitatory/inhibitory matter, matter-weighted local oscillator average, coherence gate, birth/death matter update, and Kuramoto torque. The UI remains compact by reusing `ncaSyncFeedback` as incoherence death strength.

**Tech Stack:** Static WebGPU ES modules, WGSL shader strings, Node verifier scripts, Markdown docs.

---

### Task 1: Verification

**Files:**
- Modify: `scripts/verify-kuramoto-nca.mjs`

- [ ] Add checks that Rule 7 uses `growth_pos`, `growth_neg`, `coherence_gate`, capacity-limited birth, incoherence death, and matter-weighted oscillator normalization.
- [ ] Run `node scripts/verify-kuramoto-nca.mjs` and confirm it fails before the shader update.

### Task 2: Shader And Probe

**Files:**
- Modify: `src/shaders/sources/compute.js`
- Modify: `src/analysis/kuramotoNcaProbe.js`

- [ ] Replace `growth + ncaSyncFeedback * (R - 0.5)` with coherence-gated birth/death.
- [ ] Normalize oscillator perception by living excitatory matter, not raw positive kernel mass.
- [ ] Mirror the shader math in the local NCA probe.

### Task 3: UI And Docs

**Files:**
- Modify: `index.html`
- Modify: `src/ui/UIManager.js`
- Modify: `DOCUMENTATION.md`
- Modify: `ROADMAP.md`
- Modify: `tasks/todo.md`
- Create or modify: `Imaginarium copy/forge/kuranca-coherence-gated-model.md`

- [ ] Rename `Sync Feedback` to `Incoherence Death` while keeping the state key.
- [ ] Record that KuraNCA is conceptually `(matter, unit oscillator)` and currently implemented as the \(d=2\) case.
- [ ] Mark vector \(d>2\), hidden channels, MLPs, AKOrN-style projection, and reservoir readout as future work.

### Task 4: Verification

**Commands:**

```bash
node scripts/verify-kuramoto-audit.mjs
node scripts/verify-kuramoto-nca.mjs
git diff --check
```

Expected: all commands pass.
