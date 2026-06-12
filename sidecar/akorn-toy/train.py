"""AKOrN-style toy task: segment two overlapping shapes by phase.

The browser app (Rule 7 KuramotoNCA) is the intuition rig; this sidecar is the
training vehicle (standing fault #6). A differentiable, unrolled scalar
Kuramoto layer runs on image-conditioned couplings; the objective asks pixel
pairs from the same shape to end up in phase and pairs from different shapes
to end up out of phase. Segmentation is read out from the final phase field —
identity is carried by *relative phase*, the same thesis the browser app
demonstrates with ncaPhaseAffinity.

Status: scaffold, syntax-verified but not yet trained (torch not installed in
the authoring environment). Run: pip install torch, then python train.py

Reference: Miyato et al. 2024, "Artificial Kuramoto Oscillatory Neurons".
"""

import argparse
import math

import torch
import torch.nn as nn
import torch.nn.functional as F


# ---------------------------------------------------------------- data

def make_batch(batch_size, size=48, device="cpu", generator=None):
    """Synthetic scenes: one circle + one square, partially overlapping.

    Returns images (B,1,H,W) in [0,1] and instance labels (B,H,W) in
    {0: background, 1: circle, 2: square}; overlap pixels are assigned to the
    square (drawn on top), matching what a human annotator would see.
    """
    g = generator
    yy, xx = torch.meshgrid(
        torch.arange(size, device=device, dtype=torch.float32),
        torch.arange(size, device=device, dtype=torch.float32),
        indexing="ij",
    )
    images = torch.zeros(batch_size, 1, size, size, device=device)
    labels = torch.zeros(batch_size, size, size, dtype=torch.long, device=device)
    for b in range(batch_size):
        r = float(torch.empty(1).uniform_(size * 0.14, size * 0.2, generator=g))
        cx = float(torch.empty(1).uniform_(size * 0.3, size * 0.5, generator=g))
        cy = float(torch.empty(1).uniform_(size * 0.3, size * 0.7, generator=g))
        half = float(torch.empty(1).uniform_(size * 0.12, size * 0.18, generator=g))
        sx = cx + float(torch.empty(1).uniform_(r * 0.5, r * 1.5, generator=g))
        sy = cy + float(torch.empty(1).uniform_(-r, r, generator=g))

        circle = ((xx - cx) ** 2 + (yy - cy) ** 2).sqrt() <= r
        square = ((xx - sx).abs() <= half) & ((yy - sy).abs() <= half)

        labels[b][circle] = 1
        labels[b][square] = 2  # square on top in the overlap
        images[b, 0][circle] = 0.6
        images[b, 0][square] = torch.where(
            circle[square], torch.tensor(1.0, device=device), torch.tensor(0.8, device=device)
        )
    images = images + 0.05 * torch.randn(images.shape, device=device, generator=g)
    return images.clamp(0, 1), labels


# ---------------------------------------------------------------- model

class KuramotoSegmenter(nn.Module):
    """Unrolled scalar Kuramoto dynamics with image-conditioned couplings.

    A small CNN maps the image to per-pixel omega and to coupling weights for
    each neighbor offset. Phases start random and relax for `steps` updates:
        theta_i += dt * (omega_i + sum_j J_ij sin(theta_j - theta_i))
    Everything is differentiable; gradients flow through the unrolled dynamics
    into the CNN, so the network learns couplings that make same-shape pixels
    synchronize and different-shape pixels repel (J may be negative).
    """

    OFFSETS = [(-1, 0), (1, 0), (0, -1), (0, 1), (-2, 0), (2, 0), (0, -2), (0, 2)]

    def __init__(self, hidden=32, steps=32, dt=0.25):
        super().__init__()
        self.steps = steps
        self.dt = dt
        self.encoder = nn.Sequential(
            nn.Conv2d(1, hidden, 5, padding=2),
            nn.ReLU(),
            nn.Conv2d(hidden, hidden, 5, padding=2),
            nn.ReLU(),
        )
        self.omega_head = nn.Conv2d(hidden, 1, 1)
        self.coupling_head = nn.Conv2d(hidden, len(self.OFFSETS), 1)
        # Start in a weakly synchronizing regime: from random phases, near-zero
        # couplings produce no organization and therefore almost no gradient.
        # A positive bias makes everything begin to sync; training then learns
        # where to cut (negative couplings at shape boundaries).
        nn.init.constant_(self.coupling_head.bias, 1.0)

    def forward(self, images, generator=None):
        feats = self.encoder(images)
        # Both heads bounded: with the drive mean-normalized over offsets below,
        # |dtheta| <= dt * (|omega| + |J|) <= 0.5 rad/step — inside the explicit-
        # Euler stability region. Unbounded heads made the rollout chaotic from
        # initialization (within-shape agreement decayed instead of growing).
        omega = torch.tanh(self.omega_head(feats)).squeeze(1)
        coupling = torch.tanh(self.coupling_head(feats))  # (B, n_offsets, H, W)

        b, _, h, w = images.shape
        # Near-uniform init, NOT fully random: with random phases every forward
        # is an uncontrollable draw and expected gradients vanish (verified —
        # the model could not even overfit one scene). Starting all-bound makes
        # the task "learn to cut": omega conditioned on appearance drifts the
        # shapes apart, negative boundary couplings keep them cut, positive
        # couplings bind shape interiors.
        theta = 0.1 * torch.randn(b, h, w, device=images.device, generator=generator)
        trajectory = []
        for _ in range(self.steps):
            drive = torch.zeros_like(theta)
            for k, (dy, dx) in enumerate(self.OFFSETS):
                neighbor = torch.roll(theta, shifts=(dy, dx), dims=(1, 2))
                drive = drive + coupling[:, k] * torch.sin(neighbor - theta)
            theta = theta + self.dt * (omega + drive / len(self.OFFSETS))
            trajectory.append(theta)
        return theta, trajectory


# ---------------------------------------------------------------- loss

def phase_binding_loss(theta, labels, pairs_per_image=2048, generator=None):
    """Contrastive loss on relative phase over sampled foreground pixel pairs.

    agreement_ij = (1 + cos(theta_i - theta_j)) / 2 in [0, 1]; target is 1 for
    same-instance pairs, 0 for different-instance pairs. Background is ignored
    so the dynamics own the foreground binding problem.
    """
    b, h, w = theta.shape
    flat_theta = theta.reshape(b, -1)
    flat_labels = labels.reshape(b, -1)
    total = torch.tensor(0.0, device=theta.device)
    counted = 0
    for i in range(b):
        fg = (flat_labels[i] > 0).nonzero(as_tuple=True)[0]
        if fg.numel() < 2:
            continue
        idx_a = fg[torch.randint(fg.numel(), (pairs_per_image,), device=theta.device, generator=generator)]
        idx_b = fg[torch.randint(fg.numel(), (pairs_per_image,), device=theta.device, generator=generator)]
        agreement = 0.5 * (1 + torch.cos(flat_theta[i, idx_a] - flat_theta[i, idx_b]))
        target = (flat_labels[i, idx_a] == flat_labels[i, idx_b]).float()
        total = total + F.binary_cross_entropy(agreement.clamp(1e-6, 1 - 1e-6), target)
        counted += 1
    return total / max(counted, 1)


# ---------------------------------------------------------------- eval

@torch.no_grad()
def pairwise_accuracy(theta, labels, pairs_per_image=4096):
    """Fraction of foreground pixel pairs whose phase agreement (>0.5 vs <0.5)
    matches same/different instance — threshold-free segmentation quality."""
    b = theta.shape[0]
    flat_theta = theta.reshape(b, -1)
    flat_labels = labels.reshape(b, -1)
    correct, total = 0, 0
    for i in range(b):
        fg = (flat_labels[i] > 0).nonzero(as_tuple=True)[0]
        if fg.numel() < 2:
            continue
        idx_a = fg[torch.randint(fg.numel(), (pairs_per_image,), device=theta.device)]
        idx_b = fg[torch.randint(fg.numel(), (pairs_per_image,), device=theta.device)]
        agreement = 0.5 * (1 + torch.cos(flat_theta[i, idx_a] - flat_theta[i, idx_b])) > 0.5
        same = flat_labels[i, idx_a] == flat_labels[i, idx_b]
        correct += (agreement == same).sum().item()
        total += idx_a.numel()
    return correct / max(total, 1)


# ---------------------------------------------------------------- train

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--steps", type=int, default=2000)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=5e-4)
    parser.add_argument("--size", type=int, default=48)
    parser.add_argument(
        "--device",
        default="cuda" if torch.cuda.is_available()
        else ("mps" if torch.backends.mps.is_available() else "cpu"),
    )
    parser.add_argument("--checkpoint", default="akorn_toy.pt")
    args = parser.parse_args()

    model = KuramotoSegmenter().to(args.device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)

    for step in range(1, args.steps + 1):
        images, labels = make_batch(args.batch_size, args.size, args.device)
        theta, trajectory = model(images)
        # Supervise the tail of the rollout, not just the endpoint: richer
        # gradient through the unrolled dynamics and a preference for stable
        # (not momentarily lucky) phase configurations.
        loss = sum(phase_binding_loss(t, labels) for t in trajectory[-4:]) / 4
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        if step % 100 == 0 or step == 1:
            images, labels = make_batch(args.batch_size, args.size, args.device)
            theta, _ = model(images)
            acc = pairwise_accuracy(theta, labels)
            print(f"step {step:5d}  loss {loss.item():.4f}  pairwise-acc {acc:.3f}")

    torch.save(model.state_dict(), args.checkpoint)
    print(f"saved {args.checkpoint}")


if __name__ == "__main__":
    main()
