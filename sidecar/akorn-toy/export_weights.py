"""Export the trained AKOrN segmenter for the browser viewer.

Closes the sidecar -> app loop: the trained model is tiny (a 2-layer CNN plus
two 1x1 heads), so we dump its weights to JSON and re-run the exact forward
pass in JavaScript. We also export a handful of demo scenes (image + instance
labels) and one verification reference (a fixed init theta and the resulting
final theta) so the JS port can be proven bit-close to PyTorch.

Usage: .venv/bin/python export_weights.py
Output: ../../src/akorn/akornModel.json  (weights + scenes + reference)
"""

import json
import os

import torch

from train import KuramotoSegmenter, make_batch

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'akorn', 'akornModel.json')
CKPT = os.path.join(os.path.dirname(__file__), 'akorn_toy.pt')
SIZE = 48
N_SCENES = 6


def tolist(t):
    return t.detach().cpu().numpy().tolist()


def main():
    model = KuramotoSegmenter()
    model.load_state_dict(torch.load(CKPT, map_location='cpu'))
    model.eval()

    enc = model.encoder
    weights = {
        'enc0_w': tolist(enc[0].weight), 'enc0_b': tolist(enc[0].bias),  # [32,1,5,5],[32]
        'enc2_w': tolist(enc[2].weight), 'enc2_b': tolist(enc[2].bias),  # [32,32,5,5],[32]
        'omega_w': tolist(model.omega_head.weight), 'omega_b': tolist(model.omega_head.bias),  # [1,32,1,1],[1]
        'coup_w': tolist(model.coupling_head.weight), 'coup_b': tolist(model.coupling_head.bias),  # [8,32,1,1],[8]
    }

    # Demo scenes for the viewer (deterministic generator seed).
    gen = torch.Generator().manual_seed(7)
    images, labels = make_batch(N_SCENES, SIZE, 'cpu', generator=gen)
    scenes = [{
        'image': tolist(images[i, 0]),
        'labels': tolist(labels[i]),
    } for i in range(N_SCENES)]

    # Verification reference: a FIXED init theta (not random), forwarded by hand
    # through the same dynamics so the JS port can assert an exact match.
    img0 = images[0:1]
    with torch.no_grad():
        feats = model.encoder(img0)
        omega = torch.tanh(model.omega_head(feats)).squeeze(1)
        coupling = torch.tanh(model.coupling_head(feats))
        h, w = SIZE, SIZE
        # deterministic init: a smooth ramp, no RNG
        yy, xx = torch.meshgrid(torch.arange(h, dtype=torch.float32),
                                torch.arange(w, dtype=torch.float32), indexing='ij')
        theta = (0.01 * (xx - w / 2)).unsqueeze(0)
        init_theta = theta.clone()
        for _ in range(model.steps):
            drive = torch.zeros_like(theta)
            for k, (dy, dx) in enumerate(model.OFFSETS):
                neighbor = torch.roll(theta, shifts=(dy, dx), dims=(1, 2))
                drive = drive + coupling[:, k] * torch.sin(neighbor - theta)
            theta = theta + model.dt * (omega + drive / len(model.OFFSETS))
        final_theta = theta

    reference = {
        'image': tolist(img0[0, 0]),
        'init_theta': tolist(init_theta[0]),
        'final_theta': tolist(final_theta[0]),
        'omega': tolist(omega[0]),
    }

    out = {
        'meta': {
            'size': SIZE,
            'hidden': 32,
            'steps': model.steps,
            'dt': model.dt,
            'offsets': model.OFFSETS,
        },
        'weights': weights,
        'scenes': scenes,
        'reference': reference,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(out, f)
    size_kb = os.path.getsize(OUT) // 1024
    print(f'Wrote {OUT} ({size_kb} KB): {N_SCENES} scenes, steps={model.steps}, dt={model.dt}')


if __name__ == '__main__':
    main()
