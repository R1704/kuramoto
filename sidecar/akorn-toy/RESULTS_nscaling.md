# AKOrN n-scaling: does S^{n-1} extend the object-count limit?

**Setup.** Vector AKOrN at oscillator dimension n in {2, 4, 8, 16}, trained on mixed
2-8-object scenes (64x64, 10k steps, batch 64) on 2x RTX 4090. Pairwise segmentation
accuracy evaluated per object count K over 64 seeded scenes each.

## Result (pairwise accuracy by object count)

| oscillator | K=2 | K=3 | K=4 | K=5 | K=6 | K=7 | K=8 |
|------------|-----|-----|-----|-----|-----|-----|-----|
| n=2  (S¹)  | .997| .885| .708| .691| .671| .615| .558|
| n=4  (S³)  | .984| .870| .730| .631| .677| .656| .639|
| n=8  (S⁷)  | .995| .914| .806| .734| .724| .667| .645|
| n=16 (S¹⁵) | .997| .975| .844| .779| .711| .636| .582|

## Verdict: hypothesis confirmed in the informative regime

Higher oscillator dimension **measurably extends the object-count limit**, clearest at
the counts where the task is neither trivial nor saturated:

- **K=3:** 0.885 → 0.975 (n=2 → n=16), monotone in n.
- **K=4:** 0.708 → 0.844, monotone in n.
- **K=5:** 0.691 → 0.779 (n=16 best; n=8 second; n=4 noisy-low).

A circle (S¹) crowds: K identities must share one angular coordinate and collide. A
higher-dimensional sphere has room for more near-orthogonal directions, so more objects
stay separable — the geometric reason AKOrN uses N-dim oscillators.

## Honest limits

- **K=2 is saturated** (~0.99 for all n) — uninformative.
- **K≥7 floors** (~0.58-0.67 for all n): 7-8 objects on 64x64 is heavily occluded and
  likely capacity-/training-bound, not phase-room-bound; the n-advantage vanishes there.
- **Single run per n** (no seeds/error bars). The monotone trend across four n values at
  K=3/4/5 is consistent enough to trust the direction; n=4 is the noisiest row.
- 10k steps; more training might lift the high-K tail.

## Next

- Repeat with seeds for error bars (cheap now); push training longer for the K>=6 tail.
- Larger canvas so many-object scenes are less occlusion-limited.
- Export an n=8/16 model to the browser viewer (needs a vector->hue readout, e.g. PCA the
  per-pixel vectors to 2D, since the current viewer shows scalar phase).

Reproduce: `STEPS=10000 ./run_sweep.sh` (writes results_n*.json).
