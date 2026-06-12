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

Scaffold — syntax-verified, **not yet trained** (no torch in the authoring
environment). Expected behavior on first runs: pairwise accuracy should climb
well above the 0.5 chance level within a few hundred steps if the unrolled
dynamics learn signed couplings; if it plateaus at chance, increase `--steps`
per rollout (`KuramotoSegmenter(steps=...)`) before touching the loss.

## Run

```sh
pip install torch
python train.py                 # defaults: 2000 steps, 48x48 scenes, CPU/CUDA auto
python train.py --steps 5000 --batch-size 32
```

Prints loss + threshold-free pairwise segmentation accuracy every 100 steps,
saves `akorn_toy.pt`.

## Relationship to the browser app

- Browser (Rule 7): hand-designed dynamics, interactive, readback-verified —
  the intuition rig. Its binding term was shown load-bearing for structure
  under omega heterogeneity (2026-06-12 experiments, see DOCUMENTATION.md).
- This sidecar: the same scalar dynamics made differentiable and *trained on a
  task*. Next steps after the toy task converges: vector oscillators on
  S^{n-1}, conditioned symmetry-breaking stimulus, energy readout, and
  exporting trained rollouts as `.npy` for visualization in the app.
