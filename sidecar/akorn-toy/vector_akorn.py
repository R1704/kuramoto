"""Vector AKOrN: oscillators on S^{n-1} instead of the scalar circle S^1.

The object-count probe showed the scalar (n=2) model crowds: 4 objects collapse
toward one phase (38 deg separation, accuracy 0.74). AKOrN's actual formulation
(Miyato et al. 2024) uses N-dimensional unit-vector oscillators x_i in S^{n-1},
which have far more room for distinct identities. This implements that and tests
whether higher n rescues the many-object case the circle could not hold.

Update (tangent-space projected ascent on the alignment energy
E = sum_i <x_i, c_i + sum_j J_ij x_j>):
    y_i  = c_i + sum_j J_ij x_j
    x_i <- normalize(x_i + dt * (y_i - <y_i, x_i> x_i))
At n=2 this reduces to the scalar Kuramoto update (c_i plays omega's role), so
the family is a clean generalization.

Usage: .venv/bin/python vector_akorn.py [--n 4] [--steps 1500]
"""

import argparse

import torch
import torch.nn as nn

from probe_object_count import make_batch_multi


class VectorAKOrN(nn.Module):
    OFFSETS = [(-1, 0), (1, 0), (0, -1), (0, 1), (-2, 0), (2, 0), (0, -2), (0, 2)]

    def __init__(self, n=4, hidden=32, steps=32, dt=0.25):
        super().__init__()
        self.n = n
        self.steps = steps
        self.dt = dt
        self.encoder = nn.Sequential(
            nn.Conv2d(1, hidden, 5, padding=2), nn.ReLU(),
            nn.Conv2d(hidden, hidden, 5, padding=2), nn.ReLU(),
        )
        self.stim_head = nn.Conv2d(hidden, n, 1)              # conditional stimulus c_i in R^n
        self.coupling_head = nn.Conv2d(hidden, len(self.OFFSETS), 1)  # scalar J per offset
        nn.init.constant_(self.coupling_head.bias, 1.0)

    def normalize(self, x):  # x: (B, n, H, W) -> unit vectors per pixel
        return x / x.norm(dim=1, keepdim=True).clamp_min(1e-6)

    def forward(self, images, generator=None):
        feats = self.encoder(images)
        c = torch.tanh(self.stim_head(feats))            # (B, n, H, W)
        coupling = torch.tanh(self.coupling_head(feats))  # (B, nOff, H, W)
        b, _, h, w = images.shape
        x = self.normalize(0.1 * torch.randn(b, self.n, h, w, device=images.device, generator=generator) + c)
        traj = []
        for _ in range(self.steps):
            y = c.clone()
            for k, (dy, dx) in enumerate(self.OFFSETS):
                neighbor = torch.roll(x, shifts=(dy, dx), dims=(2, 3))
                y = y + coupling[:, k:k + 1] * neighbor
            dot = (y * x).sum(dim=1, keepdim=True)        # <y_i, x_i>
            x = self.normalize(x + self.dt * (y - dot * x) / len(self.OFFSETS))
            traj.append(x)
        return x, traj


def _sample_pairs(x, labels, pairs):
    # Sample `pairs` random pixel pairs per image over ALL pixels (vectorized over
    # the batch), returning cosine similarity, same-instance target, and a
    # foreground mask. Sampling over all pixels + masking avoids per-image nonzero()
    # (which syncs CPU<->GPU) and the Python batch loop entirely.
    b, n, h, w = x.shape
    P = h * w
    xf = x.reshape(b, n, P)
    lf = labels.reshape(b, P)
    ia = torch.randint(P, (b, pairs), device=x.device)
    ib = torch.randint(P, (b, pairs), device=x.device)
    xa = torch.gather(xf, 2, ia.unsqueeze(1).expand(b, n, pairs))
    xb = torch.gather(xf, 2, ib.unsqueeze(1).expand(b, n, pairs))
    sim = (xa * xb).sum(dim=1)                      # (b, pairs) in [-1, 1]
    la = torch.gather(lf, 1, ia)
    lb = torch.gather(lf, 1, ib)
    fg = (la > 0) & (lb > 0)                         # both pixels foreground
    same = la == lb
    return sim, same, fg


def binding_loss(x, labels, pairs=2048):
    # contrastive on cosine similarity: +1 same instance, -1 different; bg pairs dropped
    sim, same, fg = _sample_pairs(x, labels, pairs)
    target = torch.where(same, 1.0, -1.0)
    err = ((sim - target) ** 2) * fg.float()
    return err.sum() / fg.float().sum().clamp_min(1.0)


@torch.no_grad()
def pairwise_acc(x, labels, scenes_pairs=6000):
    sim, same, fg = _sample_pairs(x, labels, scenes_pairs)
    agree = sim > 0.0
    correct = (agree == same) & fg
    return (correct.float().sum() / fg.float().sum().clamp_min(1.0)).item()


@torch.no_grad()
def evaluate(model, size, n_obj, device, scenes=8):
    accs = []
    for _ in range(scenes):
        img, lab = make_batch_multi(1, size, n_obj, device)
        x, _ = model(img)
        accs.append(pairwise_acc(x, lab))
    return sum(accs) / len(accs)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n", type=int, default=4, help="oscillator dimension (S^{n-1})")
    ap.add_argument("--steps", type=int, default=1500)
    ap.add_argument("--size", type=int, default=48)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available()
                    else ("mps" if torch.backends.mps.is_available() else "cpu"))
    args = ap.parse_args()

    model = VectorAKOrN(n=args.n).to(args.device)
    opt = torch.optim.Adam(model.parameters(), lr=5e-4)
    for step in range(1, args.steps + 1):
        n_obj = int(torch.randint(2, 5, (1,)).item())
        img, lab = make_batch_multi(args.batch_size, args.size, n_obj, args.device)
        x, traj = model(img)
        loss = sum(binding_loss(t, lab) for t in traj[-4:]) / 4
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        if step % 250 == 0 or step == 1:
            print(f"step {step:5d}  loss {loss.item():.4f}")

    print(f"\nS^{args.n - 1} oscillators — object-count scaling (pairwise accuracy):")
    for no in (2, 3, 4):
        print(f"  {no} objects:  acc {evaluate(model, args.size, no, args.device):.3f}")
    torch.save(model.state_dict(), f"vector_akorn_n{args.n}.pt")
    print(f"saved vector_akorn_n{args.n}.pt")


if __name__ == "__main__":
    main()
