# Manifold Upgrade Plan (S¹ → S² → Lie Groups)

This document is the implementation plan for upgrading the simulator from phase angles on a circle (S¹) to higher-dimensional manifolds (spheres and Lie groups). It defines the math, data layout, rendering alignment, UI changes, and staged delivery.

## Goals
- **Mathematically valid dynamics** on the target manifold (norm-preserving, tangent-projected updates).
- **Aligned visualization**: rendering reflects the manifold state (not a misleading proxy).
- **UI alignment**: panel controls and analysis metrics are consistent with the new state.
- **Incremental delivery**: S² first, then S³/quaternions, then true Lie-group coupling.

## Stage 1 — S² (unit vectors in R³)

### 1) State definition
- Each oscillator state is a unit vector `xᵢ ∈ R³`, `||xᵢ|| = 1`.

### 2) Dynamics (valid on S²)
- Build a drive vector `yᵢ` from:
  - Neighbor mean vector `mᵢ` (grid range or graph adjacency)
  - Intrinsic rotation term `Ωᵢ × xᵢ`
  - Input/noise vectors (tangent-projected)
- Update with tangent projection:
  - `dx = Projₓ(y) = y − (x·y)x`
  - `xᵢ ← normalize(xᵢ + dt * dx)`

This preserves unit norm and is a standard, mathematically valid S² flow.

### 3) Neighbor mean
- **Grid mode**: `mᵢ = (1/|N|) Σ xⱼ` within a square neighborhood of radius `range`.
- **Graph mode**: `mᵢ = (1/Σ|w|) Σ |wᵢⱼ| xⱼ` over actual neighbors.

### 4) Stats (S²-correct)
- **Global order**: `R = ||(1/N) Σ xᵢ||`.
- **Local order**: `Rᵢ = ||(1/|N(i)|) Σ xⱼ||`, mean over i gives `Local R̄`.
- **χ**: same definition, `χ = N·Var_t(Local R̄)`.
- **Gradient proxy** (optional): mean angular distance to neighbors `acos(clamp(xᵢ·xⱼ))`.

### 5) Visualization (aligned)
Minimum viable:
- **2D**: color by vector (RGB = (x+1)/2), or azimuth palette.
- **3D height**: use `z` component for surface height.

## Stage 2 — S³ / SU(2) (unit quaternions)

### 1) State
- `qᵢ ∈ R⁴`, `||qᵢ|| = 1` (unit quaternion).

### 2) Dynamics
- Intrinsic rotation via quaternion multiplication:
  - `dq/dt = 0.5 * (0, ω) ⊗ q`
- Coupling (first pass): treat S³ as a sphere with tangent projection (valid, though not full group coupling).
- Later: use log/exp on SU(2) for true group coupling.

## Stage 3 — Lie groups (SO(3), SE(2)/SE(3))

Implement group-aware coupling using log/exp maps:
- `Δ = qᵢ⁻¹ ⊗ qⱼ`, `log(Δ)` in Lie algebra
- Average in tangent space, map back with `exp`

## UI & Panel Alignment
- Add **Manifold** selector: `S¹ (phase)`, `S² (sphere)`, `S³ (quaternion)`.
- For S²/S³:
  - Show intrinsic rotation magnitude (and optionally axis mode).
  - Disable incompatible modes (delay/harmonics) until re-derived.
- Visualization options:
  - State mapping: RGB, azimuth/elevation, z-height.

## Rendering Alignment
- S²: render color from vector and height from z (or azimuth).
- S³: map quaternion to axis/angle for color, optional height from angle.

## Verification Criteria
- Norm preservation: `||xᵢ|| ≈ 1` for long runs.
- Global R and Local R̄ correct for known cases (all equal → 1, random → near 0).
- Visuals match the chosen mapping (RGB or azimuth).

## Delivery Sequence
1. Implement S² compute pipeline + buffers + minimal visualization (RGB or azimuth).
2. Add S² stats (global/local order, χ) and analysis gating.
3. Add graph topology + interlayer coupling for S².
4. Add S³/quaternion preview (sphere-style tangent update).
5. Add true Lie-group coupling (log/exp) + rotation-aware metrics.
