# AKOrN toy task sidecar

Offline PyTorch training for the milestone the browser app builds intuition
for (standing fault #6): **segment two overlapping shapes by phase**, in the
spirit of AKOrN (Miyato et al. 2024, *Artificial Kuramoto Oscillatory
Neurons*).

The model is a differentiable, unrolled **scalar Kuramoto layer**: a small CNN
maps the input image to per-pixel intrinsic frequencies and signed neighbor
couplings, random phases relax through 16 unrolled update steps, and the loss
asks same-shape pixel pairs to end in phase and different-shape pairs out of
phase. Identity is carried by *relative phase* — the same thesis the WebGPU
app demonstrates interactively with `ncaPhaseAffinity`.

## Status

**Trained and converged** (2026-06-12, torch 2.12 / Apple MPS): pairwise
segmentation accuracy on fresh scenes reaches **0.994 by step 100 and a
sustained 1.000 from step 300** (2000 steps, batch 16, defaults). Loss falls
2.90 → 0.009. Checkpoint: `akorn_toy.pt` (gitignored; rerun to reproduce).

Two findings from getting it to train, both worth keeping:

1. **Random initial phases kill learning.** With `theta ~ U(0, 2pi)` every
   forward pass is an uncontrollable draw and expected gradients vanish — the
   model could not even overfit a single scene (within-shape agreement decayed
   to chance). Near-uniform init (`0.1·randn`) flips the task to "learn to
   cut": omega conditioned on appearance drifts the shapes apart, negative
   boundary couplings keep them cut, positive couplings bind interiors.
2. **Unrolled explicit Euler must respect its stability bound.** Unbounded
   heads gave per-step phase updates of ~4.6 rad (sum over 8 neighbor offsets)
   — chaotic from initialization. tanh-bounded heads plus a mean-normalized
   drive keep `|dtheta| <= 0.5` rad/step; with that single change the
   single-scene diagnostic went from stuck-at-chance to within-shape agreement
   1.000 / between-shape 0.006 in 100 steps.

The same lesson the browser app taught (`dt`-halving sanity, clamp artifacts
vs real structures) shows up here as: check the integrator before blaming the
objective.

## Run

```sh
pip install torch
python train.py                 # 2-object segmenter, 2000 steps, CPU/CUDA/MPS auto
python export_weights.py        # bake weights + scenes -> src/akorn/akornModel.json (browser viewer)
python probe_object_count.py    # how does scalar S^1 scale with object count?
python vector_akorn.py --n 4    # AKOrN on S^{n-1}; --n 2 reduces to the scalar case
```

`train.py` prints loss + threshold-free pairwise accuracy and saves `akorn_toy.pt`.

## Findings (2026-06-12, local, CPU/MPS — directional, small scale)

- **Scalar S^1 crowds with object count.** Trained on mixed 2-4-object scenes,
  pairwise accuracy falls 0.96 -> 0.90 -> 0.74 as objects go 2 -> 3 -> 4, and the
  minimum inter-object phase separation collapses 126 deg -> 100 deg -> 38 deg.
  A circle has limited room: K identities must share S^1, and they crowd. This
  is the concrete motivation for vector oscillators on S^{n-1}.
- **Vector AKOrN is implemented** (`vector_akorn.py`): unit-vector oscillators
  x_i in S^{n-1}, tangent-space projected ascent on the alignment energy
  E = sum_i <x_i, c_i + sum_j J_ij x_j>; at n=2 it reduces to the scalar update.
  It trains and segments 2 objects at ~0.95.
- **The S^{n-1} advantage is NOT yet demonstrated** at this scale: at 1500 steps
  and 4 objects, n=4 (~0.71) does not beat n=2 (~0.78); both are noisy on an
  8-scene eval. Whether higher n extends the limit needs (a) longer training,
  (b) more objects (8-16, where S^1 truly saturates), and (c) a many-scene eval
  with seeds. **This is the GPU experiment**, not a local one.

## Relationship to the browser app

- Browser (Rule 7): hand-designed dynamics, interactive, readback-verified —
  the intuition rig. Its binding term was shown load-bearing for structure
  under omega heterogeneity (2026-06-12 experiments, see DOCUMENTATION.md).
- This sidecar: the same scalar dynamics made differentiable and *trained on a
  task*. Next steps after the toy task converges: vector oscillators on
  S^{n-1}, conditioned symmetry-breaking stimulus, energy readout, and
  exporting trained rollouts as `.npy` for visualization in the app.
