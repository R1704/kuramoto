"""Export a trained vector AKOrN (S^{n-1}) for the browser viewer.

Like export_weights.py but for VectorAKOrN: dumps the CNN weights, the stimulus
and coupling heads, a set of multi-object demo scenes, and a verification
reference (a fixed init field x0 and the resulting final field) so the JS port
can be proven bit-close. The browser projects the per-pixel n-vectors to RGB so
aligned vectors (same object) get the same colour.

Usage: .venv/bin/python export_vector.py [--ckpt vector_akorn_n16.pt]
Output: ../../src/akorn/akornVectorModel.json
"""

import argparse
import json
import os

import torch

from vector_akorn import VectorAKOrN
from probe_object_count import make_batch_multi

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'akorn', 'akornVectorModel.json')


def tolist(t):
    return t.detach().cpu().numpy().tolist()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--ckpt', default='vector_akorn_n16.pt')
    ap.add_argument('--n', type=int, default=16)
    ap.add_argument('--size', type=int, default=64)
    ap.add_argument('--scenes', type=int, default=8)
    ap.add_argument('--demo-objs', type=int, default=3)
    args = ap.parse_args()

    model = VectorAKOrN(n=args.n)
    model.load_state_dict(torch.load(args.ckpt, map_location='cpu'))
    model.eval()

    weights = {
        'enc0_w': tolist(model.encoder[0].weight), 'enc0_b': tolist(model.encoder[0].bias),
        'enc2_w': tolist(model.encoder[2].weight), 'enc2_b': tolist(model.encoder[2].bias),
        'stim_w': tolist(model.stim_head.weight), 'stim_b': tolist(model.stim_head.bias),
        'coup_w': tolist(model.coupling_head.weight), 'coup_b': tolist(model.coupling_head.bias),
    }

    torch.manual_seed(20)
    scenes = []
    for _ in range(args.scenes):
        img, lab = make_batch_multi(1, args.size, args.demo_objs, 'cpu')
        scenes.append({'image': tolist(img[0, 0]), 'labels': tolist(lab[0])})

    # Verification reference: deterministic init x0 = normalize(stimulus), forwarded
    # by hand through the exact dynamics.
    img0 = torch.tensor(scenes[0]['image']).view(1, 1, args.size, args.size)
    with torch.no_grad():
        feats = model.encoder(img0)
        c = torch.tanh(model.stim_head(feats))            # (1, n, H, W)
        coupling = torch.tanh(model.coupling_head(feats))  # (1, nOff, H, W)
        x = model.normalize(c.clone())
        init_x = x.clone()
        for _ in range(model.steps):
            y = c.clone()
            for k, (dy, dx) in enumerate(model.OFFSETS):
                y = y + coupling[:, k:k + 1] * torch.roll(x, shifts=(dy, dx), dims=(2, 3))
            dot = (y * x).sum(dim=1, keepdim=True)
            x = model.normalize(x + model.dt * (y - dot * x) / len(model.OFFSETS))
        final_x = x

    reference = {
        'image': scenes[0]['image'],
        'init_x': tolist(init_x[0]),    # (n, H, W)
        'final_x': tolist(final_x[0]),  # (n, H, W)
    }

    out = {
        'meta': {'size': args.size, 'n': args.n, 'hidden': 32,
                 'steps': model.steps, 'dt': model.dt, 'offsets': model.OFFSETS},
        'weights': weights,
        'scenes': scenes,
        'reference': reference,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(out, f)
    print(f'Wrote {OUT} ({os.path.getsize(OUT)//1024} KB): n={args.n}, {args.scenes} scenes, {args.demo_objs} objs')


if __name__ == '__main__':
    main()
