# AGENTS

This file orients coding agents working in this repo. Keep it current after
any sizable change. Prefer concise, verifiable guidance over speculation.

## Repo Snapshot
- App type: static WebGPU app (ES modules, no bundler)
- Entry points: `index.html`, `src/main.js`
- UI wiring: `src/ui.js` manages DOM and state changes
- Core compute: `src/simulation.js` + WGSL in `src/shaders.js`

## Build / Lint / Test
- Run locally: `python -m http.server 8000` or `npx serve`
- Open: `http://localhost:8000`
- Lint: none configured
- Tests: none configured
- Single test: not applicable (no test runner)

## Cursor / Copilot Rules
- None found (`.cursor/rules/`, `.cursorrules`, `.github/copilot-instructions.md`)

## Code Style (JS)
- ES modules with explicit `.js` extensions in imports
- Imports grouped at top of file; no dynamic imports for core paths
- 4-space indentation; semicolons required
- Prefer `const`, use `let` only when reassignment is needed
- Strings use single quotes unless HTML/template requires double quotes
- Classes: PascalCase; functions/vars: camelCase; constants: UPPER_SNAKE
- Avoid magic numbers: define constants or re-use existing state defaults
- Keep UI text in `index.html` or `UIManager` for centralized updates

## WebGPU Performance Rules
- Never allocate per-frame in hot paths; reuse typed arrays and buffers
- Cache pipelines, bind groups, layouts; avoid recreating per frame
- Batch `queue.writeBuffer` updates; write only changed ranges
- Use staging buffers and async map/readback sparingly
- Mind buffer alignment and WGSL struct packing (16-byte boundaries)
- Keep workgroup sizes and buffer sizes in sync with shader assumptions
- For debug readbacks, add throttling or toggles to avoid stalls

## UI Manager Design Principles
- `STATE` is source of truth; no duplicated state in DOM
- All control changes go through `UIManager` and call `onParamChange`
- IDs map predictably: `foo-slider` -> `foo` state key
- Update display text in `UIManager`, not ad-hoc in other modules
- Keep UI operations light; avoid expensive DOM queries in render loop
- UI should be consistent across 2D/3D modes (same naming and ranges)

## Math / Model Consistency Checker
Use after any change to equations, buffers, or shader parameters.
- Verify equations in docs match implementation (e.g., README, RESERVOIR.MD)
- Confirm parameter ranges in UI match shader expectations
- Check uniform indexing and buffer layout alignment (JS <-> WGSL)
- Verify normalization factors (N, gridSize, range) remain consistent
- Re-check order parameter, local order, and gradient formulas

## Debugger Checklist (after large edit)
- App boots: adapter/device created, no pipeline compile errors
- Simulation renders in both 2D and 3D modes
- Parameter changes update visuals and stats immediately
- No console spam; WebGPU validation errors resolved
- Stats readbacks and RC readouts are throttled and stable
- Regression sweep: presets, K-scan, palette/layer toggle, view toggle

## Refactor / Simplifier Guidance
- Prefer small modules over monoliths; isolate responsibilities
- Extract repeated math into `src/common.js`
- Keep shader strings grouped and documented by purpose
- Avoid cyclic imports; keep UI and simulation boundaries clear
- Remove dead code when safe; avoid speculative utilities

## Documentation Update Policy
- Update `README.md` for user-facing behavior changes
- Update `DOCUMENTATION.md`, `RESERVOIR.MD`, or `EXTENSIONS.md` for model changes
- Keep code comments minimal; prefer docs for conceptual explanations
- Add short release notes in docs for major changes

## Git Hygiene
- Keep commits small and focused; no mixed concerns
- Check `git status` and `git diff` before and after edits
- Do not commit generated files or local artifacts

## Agent Roles (Recommended)
These are responsibilities, not extra tooling.

### Global Agents
- Performance Guardian: enforces WebGPU efficiency rules
- Docs Steward: keeps README and technical docs aligned with behavior
- Debug Auditor: runs the debugger checklist after large edits
- Refactor Coach: keeps code compact, modular, and consistent
- Git Manager: ensures clean commits and excludes artifacts

### Local Agents
- UI Consistency Agent: audits UI controls, ranges, and state wiring
- Math Verifier: checks model equations vs JS/WGSL and docs

## Optional Skills (Reusable Checklists)
- WebGPU perf audit
- UI control audit
- Math alignment audit
- Regression checklist for large changes

## Optional Tools (Future)
- Add linting (ESLint) and formatting (Prettier) if desired
- Add test harness if shader/unit tests become necessary
