"""Probe: does the scalar S^1 phase model scale past two objects?

The 2-shape segmenter works at ~100%. But S^1 (a circle) has limited "room":
K objects must occupy K distinct phases, and as K grows they crowd toward each
other until the dynamics can no longer keep them apart. This probe trains one
model on mixed 2..4-object scenes and measures, per object count:
  - pairwise accuracy (does it still segment?)
  - mean inter-object phase separation (how far apart the object phases sit)
If accuracy falls and separation shrinks with K, that is the concrete case for
true vector oscillators on S^{n-1} (room for more identities) — the GPU work.

Usage: .venv/bin/python probe_object_count.py [--steps N]
"""

import argparse
import math

import torch

from train import KuramotoSegmenter, phase_binding_loss


def make_batch_multi(batch_size, size, n_shapes, device, generator=None):
    # Fully vectorized on the device: all shape parameters are sampled at once and
    # masks are built by broadcasting, so there are NO per-scalar .item()/float()
    # syncs and NO per-sample Python loop — only n_shapes (<=8) GPU ops per call.
    # (The earlier per-shape scalar build cost ~280 ms/step; the CPU-build variant
    # oversubscribed cores across the 4 parallel runs. This is ~ms on a 4090.)
    g = generator
    yy = torch.arange(size, device=device, dtype=torch.float32).view(1, size, 1)
    xx = torch.arange(size, device=device, dtype=torch.float32).view(1, 1, size)

    def U(lo, hi):  # (batch,1,1) uniform on [lo,hi], no host sync
        r = torch.rand(batch_size, 1, 1, device=device, generator=g)
        return lo + (hi - lo) * r

    images = torch.zeros(batch_size, size, size, device=device)
    labels = torch.zeros(batch_size, size, size, dtype=torch.long, device=device)
    for k in range(n_shapes):  # small loop over shapes, each step vectorized over the batch
        cx = U(size * 0.28, size * 0.72)
        cy = U(size * 0.28, size * 0.72)
        rad = U(size * 0.12, size * 0.18)
        if k % 2 == 0:
            mask = ((xx - cx) ** 2 + (yy - cy) ** 2).sqrt() <= rad
        else:
            mask = ((xx - cx).abs() <= rad) & ((yy - cy).abs() <= rad)
        labels = torch.where(mask, torch.full_like(labels, k + 1), labels)  # later shapes occlude
        images = torch.where(mask, torch.full_like(images, 0.5 + 0.12 * k), images)
    images = images + 0.05 * torch.randn(images.shape, device=device, generator=g)
    return images.clamp(0, 1).unsqueeze(1), labels.to(device)


@torch.no_grad()
def evaluate(model, size, n_shapes, device, scenes=8):
    accs, seps = [], []
    for _ in range(scenes):
        img, lab = make_batch_multi(1, size, n_shapes, device)
        theta, _ = model(img)
        t = theta.reshape(-1)
        l = lab.reshape(-1)
        fg = (l > 0).nonzero(as_tuple=True)[0]
        if fg.numel() < 2:
            continue
        ia = fg[torch.randint(fg.numel(), (6000,), device=device)]
        ib = fg[torch.randint(fg.numel(), (6000,), device=device)]
        agree = 0.5 * (1 + torch.cos(t[ia] - t[ib])) > 0.5
        same = l[ia] == l[ib]
        accs.append((agree == same).float().mean().item())
        # mean object phase (circular) per label, then min pairwise separation
        centers = []
        for k in range(1, n_shapes + 1):
            m = (l == k)
            if m.sum() > 0:
                centers.append(math.atan2(torch.sin(t[m]).mean().item(),
                                          torch.cos(t[m]).mean().item()))
        if len(centers) >= 2:
            mind = math.pi
            for i in range(len(centers)):
                for j in range(i + 1, len(centers)):
                    d = abs(centers[i] - centers[j]) % (2 * math.pi)
                    d = min(d, 2 * math.pi - d)
                    mind = min(mind, d)
            seps.append(mind)
    return (sum(accs) / max(1, len(accs)), sum(seps) / max(1, len(seps)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--steps", type=int, default=1500)
    parser.add_argument("--size", type=int, default=48)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available()
                        else ("mps" if torch.backends.mps.is_available() else "cpu"))
    args = parser.parse_args()

    model = KuramotoSegmenter().to(args.device)
    opt = torch.optim.Adam(model.parameters(), lr=5e-4)

    for step in range(1, args.steps + 1):
        n_shapes = int(torch.randint(2, 5, (1,)).item())  # 2..4
        img, lab = make_batch_multi(args.batch_size, args.size, n_shapes, args.device)
        theta, traj = model(img)
        loss = sum(phase_binding_loss(t, lab) for t in traj[-4:]) / 4
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        if step % 250 == 0 or step == 1:
            print(f"step {step:5d}  loss {loss.item():.4f}")

    print("\nobject-count scaling (pairwise accuracy | min phase separation, rad):")
    for n in (2, 3, 4):
        acc, sep = evaluate(model, args.size, n, args.device)
        print(f"  {n} objects:  acc {acc:.3f}   sep {sep:.2f} rad ({math.degrees(sep):.0f}°)")
    torch.save(model.state_dict(), "akorn_multi.pt")
    print("saved akorn_multi.pt")


if __name__ == "__main__":
    main()
