#!/usr/bin/env bash
# Error-bar confirmation: n in {2,8,16} x 3 seeds = 9 runs, capped at 2 per GPU
# (4 concurrent) so the 24GB cards don't OOM. Aggregates mean +/- std per (n, K).
set -e
cd "$(dirname "$0")"
PY=.venv/bin/python
export OMP_NUM_THREADS=4 MKL_NUM_THREADS=4
STEPS="${STEPS:-8000}"; SIZE="${SIZE:-64}"; MAXOBJ="${MAXOBJ:-8}"; BS="${BS:-64}"

rm -f results_n*_s*.json confirm_*.log
# build job queue as "gpu:n:seed", balancing the expensive n=16 across both GPUs
queue=()
i=0
for n in 2 8 16; do for s in 0 1 2; do
  queue+=("$((i % 2)):$n:$s"); i=$((i+1))
done; done

running=0
for job in "${queue[@]}"; do
  gpu="${job%%:*}"; rest="${job#*:}"; n="${rest%%:*}"; s="${rest##*:}"
  CUDA_VISIBLE_DEVICES="$gpu" $PY experiment_nscaling.py --n "$n" --seed "$s" \
    --device cuda:0 --steps "$STEPS" --size "$SIZE" --max-obj "$MAXOBJ" \
    --batch-size "$BS" > "confirm_n${n}_s${s}.log" 2>&1 &
  running=$((running+1))
  # cap at 4 concurrent (2 per GPU)
  if [ "$running" -ge 4 ]; then wait -n; running=$((running-1)); fi
done
wait
echo "=== all confirm runs done ==="
$PY - <<'EOF'
import json, glob, math
from collections import defaultdict
runs = [json.load(open(f)) for f in glob.glob('results_n*_s*.json')]
by_n = defaultdict(list)
for r in runs:
    by_n[r['n']].append(r['acc_by_count'])
ks = sorted({int(k) for r in runs for k in r['acc_by_count']})
def ms(vals):
    m = sum(vals)/len(vals)
    sd = (sum((v-m)**2 for v in vals)/max(1,len(vals)-1))**0.5
    return m, sd
print('n (seeds) | ' + '  '.join(f'K={k}' for k in ks))
for n in sorted(by_n):
    accs = by_n[n]
    cells = []
    for k in ks:
        m, sd = ms([a[str(k)] for a in accs])
        cells.append(f'{m:.2f}±{sd:.02f}')
    print(f'n={n:>2} ({len(accs)})  | ' + '  '.join(cells))
EOF
