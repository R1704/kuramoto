# Task: Phase M1 - UI Cleanup for S²/S³ Manifolds

## Status: COMPLETED

## Summary
Implemented UI cleanup that hides inapplicable controls when S² or S³ manifolds are selected.

---

## Implementation Details

### 1. Added Feature Flags to ManifoldRegistry
Added three new feature flags to each manifold definition:
- `globalCoupling`: Whether global coupling toggle is applicable
- `phaseSpace`: Whether phase space visualization works
- `lyapunov`: Whether Lyapunov exponent calculation works

S¹ has all three `true`, S²/S³ have all three `false`.

**File modified:** `src/manifolds/ManifoldRegistry.js`

### 2. Added Container IDs to HTML
Added IDs to elements that need visibility control:
- `#rule-mode-container` - Coupling mode dropdown wrapper
- `#lyapunov-section` - Lyapunov exponent panel
- `#reservoir-tab-btn` - Reservoir Computing tab button
- `#reservoir-tab-pane` - Reservoir Computing tab content

**File modified:** `index.html`

### 3. Added updateManifoldVisibility to UIManager
New method that shows/hides UI controls based on manifold feature flags:
- Rule mode dropdown
- Harmonics sliders
- Delay slider
- Global coupling indicator
- Reservoir Computing tab
- Phase Space section
- Lyapunov section

**File modified:** `src/ui/UIManager.js`

### 4. Added updatePatternOptions to UIManager
New method that dynamically updates theta and omega pattern dropdowns:
- Gets supported patterns from ManifoldRegistry
- Updates dropdown options
- Preserves selection if still valid, otherwise defaults to first option

**File modified:** `src/ui/UIManager.js`

### 5. Wired Up Visibility Updates in main.js
Added calls to:
- `ui.updateManifoldVisibility(STATE.manifoldMode)`
- `ui.updatePatternOptions(STATE.manifoldMode)`

Called in:
- `onParamChange` callback (on every manifold change)
- Initial display setup (on page load)

**File modified:** `src/main.js`

---

## Controls Hidden for S²/S³

| Control | Element ID(s) | Feature Flag |
|---------|---------------|--------------|
| Rule Mode dropdown | `#rule-mode-container` | `ruleMode` |
| Harmonic A slider | `#harmonic-control` | `harmonics` |
| Harmonic B slider | `#harmonic3-control` | `harmonics` |
| Delay slider | `#delay-control` | `delay` |
| Global Coupling indicator | `#global-indicator` | `globalCoupling` |
| Reservoir Computing tab | `#reservoir-tab-btn`, `#reservoir-tab-pane` | `reservoir` |
| Phase Space plot | `#phase-space-section` | `phaseSpace` |
| Lyapunov section | `#lyapunov-section` | `lyapunov` |

---

## Verification Checklist
- [x] Switch to S² → Rule mode, harmonics, delay, RC, phase space, Lyapunov all hidden
- [x] Switch to S³ → Same controls hidden
- [x] Switch back to S¹ → All controls return
- [x] Pattern dropdowns show only supported patterns
- [x] No JS syntax errors
- [x] URL state still works correctly with manifold parameter

---

## Review
The implementation is clean and minimal:
- Uses existing ManifoldRegistry feature flag pattern
- Adds IDs to HTML elements without changing structure
- Two new focused methods in UIManager
- Proper integration in main.js at appropriate points
