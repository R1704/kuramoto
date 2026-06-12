// Prove the JS vector-AKOrN forward pass matches PyTorch. The export bakes a
// deterministic init field x0 and the resulting final field; we run the JS port
// (encoder + unrolled tangent-space dynamics) from the same x0 and require the max
// abs error below tolerance.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const model = JSON.parse(fs.readFileSync(path.join(root, 'src/akorn/akornVectorModel.json'), 'utf8'));
const { runVectorSegmentation } = await import(path.join(root, 'src/akorn/vectorInference.js'));

const H = model.meta.size, W = model.meta.size, n = model.meta.n, HW = H * W;
// nested (n,H,W) -> channel-major Float32Array[n*HW]
const flatCHW = (grid) => {
    const out = new Float32Array(n * HW);
    for (let ch = 0; ch < n; ch++)
        for (let r = 0; r < H; r++)
            for (let c = 0; c < W; c++) out[ch * HW + r * W + c] = grid[ch][r][c];
    return out;
};

const image = Float32Array.from(model.reference.image.flat());
const initX = flatCHW(model.reference.init_x);
const expected = flatCHW(model.reference.final_x);
const { x } = runVectorSegmentation(model, image, initX);
let maxErr = 0;
for (let i = 0; i < x.length; i++) maxErr = Math.max(maxErr, Math.abs(x[i] - expected[i]));

const pass = maxErr < 1e-3;
console.log(`${pass ? 'PASS' : 'FAIL'} JS vector forward matches PyTorch (max abs err < 1e-3)`);
console.log(`max abs error vs PyTorch: ${maxErr.toExponential(2)} (n=${n}, steps=${model.meta.steps})`);
if (!pass) process.exit(1);
