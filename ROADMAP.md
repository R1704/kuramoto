# Kuramoto Reservoir Computing - Roadmap (Consolidated)

The full roadmap and interaction guide now live in **EXTENSIONS.md**. Use this file as a quick pointer.

## Where to look
- **EXTENSIONS.md**: canonical, up-to-date roadmap, Interaction Primer, and Immediate Next Steps.
- **DOCUMENTATION.md** / **RESERVOIR.MD**: detailed theory, RC implementation, and stats/criticality methods.

## Current status (snapshot)
- Statistics + K-scan + LLE implemented.
- RC Phase 1 shipped; multiple injection modes (`freq_mod`, `phase_drive`, `coupling_mod`).
- Interaction primer alignment (Cmd-draw/erase, zoom-to-cursor 2D, unified palettes/data layers).
- 3D surface modes (continuous mesh vs instanced quads) with auto mesh rebuild on grid resize.

## Immediate next steps (prioritized)
1) Stability pass on surface modes (mesh vs instanced): regression-test resize/zoom/draw parity in 2D/3D; add a mode indicator in UI.  
2) RC vs Criticality presets: one-click K-sweep + NRMSE overlay per task (sine/NARMA/memory).  
3) Spatiotemporal benchmark polish: make the moving-dot task visually explicit (dot overlay + target trail) and log its NRMSE separately.  
4) Input-mode comparison: side-by-side micro-plots for `freq_mod` / `phase_drive` / `coupling_mod` with a shared seed.  
5) Save/Load (θ/ω/params) with versioning; optional “copy link with state”.  
6) Order-history sparkline (R(t)/χ(t)) with pause/export.
