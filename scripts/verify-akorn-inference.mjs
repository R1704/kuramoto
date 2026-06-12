// Prove the JS AKOrN forward pass matches PyTorch bit-close. The export bakes a
// fixed init theta and the resulting final theta; we run the JS port from the same
// init and require max abs error below tolerance. Also checks the trained model
// actually segments the demo scenes (pairwise accuracy well above chance).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const model = JSON.parse(fs.readFileSync(path.join(root, 'src/akorn/akornModel.json'), 'utf8'));

// import the ES module under test
const mod = await import(path.join(root, 'src/akorn/akornInference.js'));
const { runSegmentation, pairwiseAccuracy } = mod;

const H = model.meta.size, W = model.meta.size;
const flat = (grid) => Float32Array.from(grid.flat());

// 1. Exactness vs PyTorch on the baked reference.
const ref = model.reference;
const image = flat(ref.image);
const initTheta = flat(ref.init_theta);
const expected = flat(ref.final_theta);
const { theta } = runSegmentation(model, image, initTheta);
let maxErr = 0;
for (let i = 0; i < theta.length; i++) maxErr = Math.max(maxErr, Math.abs(theta[i] - expected[i]));

// 2. Segmentation quality on the demo scenes, from a deterministic ramp init.
let seed = 1234;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const accs = [];
for (const scene of model.scenes) {
    const img = flat(scene.image);
    const labels = flat(scene.labels);
    const init = new Float32Array(H * W);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) init[r * W + c] = 0.01 * (c - W / 2);
    const { theta: th } = runSegmentation(model, img, init);
    const acc = pairwiseAccuracy(th, labels, H, W, 6000, rand);
    if (acc !== null) accs.push(acc);
}
const meanAcc = accs.reduce((a, b) => a + b, 0) / accs.length;

const checks = [
    ['JS forward pass matches PyTorch (max abs err < 1e-3)', maxErr < 1e-3],
    ['trained model segments demo scenes (mean pairwise acc > 0.9)', meanAcc > 0.9],
];

let failed = 0;
for (const [name, pass] of checks) {
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
    if (!pass) failed++;
}
console.log(`\nmax abs error vs PyTorch: ${maxErr.toExponential(2)}`);
console.log(`mean pairwise accuracy: ${meanAcc.toFixed(3)} over ${accs.length} scenes (${accs.map((a) => a.toFixed(2)).join(', ')})`);
if (failed) process.exit(1);
