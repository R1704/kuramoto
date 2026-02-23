# Task: Phase 1 + Phase 2 — Lenia Growth Function & Structure Detection

## Status: COMPLETED

---

## Phase 1: Lenia Growth Function (Rule 6) — DONE

### Summary
Implemented Rule 6 (Lenia Growth) — a Lenia-style growth function applied to kernel convolution results.

### Changes
- **Shader** (`shaders.js`): Replaced padding with `growth_mu/sigma/mode`, added 4 growth functions + `rule_lenia` + dispatch
- **JS Pipeline**: `defaultState.js`, `layerParams.js`, `buffers.js`, `urlstate.js` — growth params at offsets 52-54
- **UI**: Rule 6 dropdown option, growth μ/σ sliders, growth mode select, show/hide logic
- **Presets**: `lenia_orbium`, `lenia_geminium`, `lenia_scutium` with initial seeds

---

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
