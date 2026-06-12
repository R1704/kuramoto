"""GPU experiment: does S^{n-1} extend the object-count limit of phase binding?

Trains a vector AKOrN at a single oscillator dimension n on mixed multi-object
scenes, then evaluates pairwise segmentation accuracy stratified by object count
over many seeded scenes. Run several n in parallel across GPUs (see run_sweep.sh)
to get the accuracy[n][K] table. Hypothesis: the object count K at which accuracy
breaks down rises with n (more room for distinct identities on a higher sphere).

Usage:
  python experiment_nscaling.py --n 8 --device cuda:0 --steps 12000 \
      --size 64 --max-obj 8 --out results_n8.json
"""

import argparse
import json

import torch

from vector_akorn import VectorAKOrN, binding_loss, pairwise_acc
from probe_object_count import make_batch_multi


@torch.no_grad()
def eval_by_count(model, size, max_obj, device, scenes=64, base_seed=10_000):
    out = {}
    for k in range(2, max_obj + 1):
        accs = []
        for s in range(scenes):
            g = torch.Generator(device='cpu').manual_seed(base_seed + 1000 * k + s)
            img, lab = make_batch_multi(1, size, k, device, generator=g)
            x, _ = model(img)
            accs.append(pairwise_acc(x, lab))
        out[k] = sum(accs) / len(accs)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n", type=int, required=True, help="oscillator dimension (S^{n-1})")
    ap.add_argument("--steps", type=int, default=12000)
    ap.add_argument("--size", type=int, default=64)
    ap.add_argument("--max-obj", type=int, default=8)
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--lr", type=float, default=5e-4)
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    torch.manual_seed(0)
    dev = args.device
    model = VectorAKOrN(n=args.n).to(dev)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)

    for step in range(1, args.steps + 1):
        n_obj = int(torch.randint(2, args.max_obj + 1, (1,)).item())
        img, lab = make_batch_multi(args.batch_size, args.size, n_obj, dev)
        x, traj = model(img)
        loss = sum(binding_loss(t, lab) for t in traj[-4:]) / 4
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        if step % 1000 == 0 or step == 1:
            print(f"[n={args.n}] step {step:6d}  loss {loss.item():.4f}", flush=True)

    acc = eval_by_count(model, args.size, args.max_obj, dev)
    result = {
        "n": args.n, "steps": args.steps, "size": args.size,
        "max_obj": args.max_obj, "batch_size": args.batch_size,
        "acc_by_count": acc,
    }
    print(f"[n={args.n}] accuracy by object count:")
    for k, a in acc.items():
        print(f"    {k} objects: {a:.3f}")
    out = args.out or f"results_n{args.n}.json"
    with open(out, "w") as f:
        json.dump(result, f, indent=2)
    torch.save(model.state_dict(), f"vector_akorn_n{args.n}.pt")
    print(f"[n={args.n}] wrote {out} and vector_akorn_n{args.n}.pt", flush=True)


if __name__ == "__main__":
    main()
