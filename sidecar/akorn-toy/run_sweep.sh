#!/usr/bin/env bash
# Run the n-scaling sweep across two GPUs: n=2,4 on GPU0 and n=8,16 on GPU1,
# two processes per GPU (the model is tiny, a 4090 has 24GB to spare). Then
# aggregate results_n*.json into a single accuracy[n][K] table.
set -e
cd "$(dirname "$0")"
PY=.venv/bin/python
# Cap per-process CPU threads so 4 parallel runs don't oversubscribe the cores.
export OMP_NUM_THREADS=4 MKL_NUM_THREADS=4
STEPS="${STEPS:-12000}"
SIZE="${SIZE:-64}"
MAXOBJ="${MAXOBJ:-8}"
BS="${BS:-64}"

run() { CUDA_VISIBLE_DEVICES="$1" $PY experiment_nscaling.py --n "$2" \
    --device cuda:0 --steps "$STEPS" --size "$SIZE" --max-obj "$MAXOBJ" \
    --batch-size "$BS" --out "results_n$2.json" > "train_n$2.log" 2>&1 & }

echo "launching n=2,4 on GPU0 and n=8,16 on GPU1 (steps=$STEPS, size=$SIZE, max_obj=$MAXOBJ)"
run 0 2
run 0 4
run 1 8
run 1 16
wait
echo "=== all runs done ==="
$PY - <<'EOF'
import json, glob
rows = sorted((json.load(open(f)) for f in glob.glob('results_n*.json')), key=lambda r: r['n'])
ks = sorted({int(k) for r in rows for k in r['acc_by_count']})
print('n \\ K | ' + ' '.join(f'{k:>5}' for k in ks))
for r in rows:
    a = r['acc_by_count']
    print(f"S^{r['n']-1:<3} | " + ' '.join(f"{a.get(str(k), a.get(k, float('nan'))):.3f}" for k in ks))
EOF
