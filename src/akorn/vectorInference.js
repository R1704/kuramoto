// Vector AKOrN inference in JavaScript — exact port of VectorAKOrN
// (sidecar/akorn-toy/vector_akorn.py). Oscillators are unit vectors on S^{n-1}
// (n=16 here); a CNN maps the image to a per-pixel stimulus c and scalar neighbour
// couplings, then the field relaxes by tangent-space projected ascent on the
// alignment energy until same-object pixels point the same way. The browser
// projects the per-pixel n-vectors to RGB (top-3 PCA directions) so aligned
// vectors render as one colour — a learned, higher-dimensional Living Phase.
//
// Verified bit-close to PyTorch by scripts/verify-akorn-vector.mjs.

import { conv2d, reluInPlace, pointwise } from './akornInference.js';

let _modelPromise = null;
export function loadVectorModel() {
    if (!_modelPromise) {
        _modelPromise = fetch(new URL('./akornVectorModel.json', import.meta.url)).then((r) => r.json());
    }
    return _modelPromise;
}

// Per-pixel L2 normalize of an n-channel field stored channel-major [n*H*W].
function normalizeField(x, n, HW) {
    for (let p = 0; p < HW; p++) {
        let s = 0;
        for (let ch = 0; ch < n; ch++) { const v = x[ch * HW + p]; s += v * v; }
        const inv = 1 / Math.max(Math.sqrt(s), 1e-6);
        for (let ch = 0; ch < n; ch++) x[ch * HW + p] *= inv;
    }
}

export function encodeVectorScene(model, image, H, W) {
    const w = model.weights;
    const hidden = model.meta.hidden;
    let f = conv2d(image, 1, H, W, w.enc0_w, w.enc0_b, hidden, 5);
    reluInPlace(f);
    f = conv2d(f, hidden, H, W, w.enc2_w, w.enc2_b, hidden, 5);
    reluInPlace(f);
    const c = pointwise(f, hidden, H, W, w.stim_w, w.stim_b, model.meta.n, true);          // [n*HW]
    const coupling = pointwise(f, hidden, H, W, w.coup_w, w.coup_b, model.meta.offsets.length, true); // [nOff*HW]
    return { c, coupling };
}

// One vector update: y = c + sum_k J_k * roll(x, off_k); x <- normalize(x + dt*(y-<y,x>x)/nOff).
function vectorStep(x, c, coupling, offsets, n, H, W, dt) {
    const HW = H * W;
    const nOff = offsets.length;
    const y = Float32Array.from(c);
    for (let k = 0; k < nOff; k++) {
        const dy = offsets[k][0], dx = offsets[k][1];
        const kBase = k * HW;
        for (let r = 0; r < H; r++) {
            const nr = ((r - dy) % H + H) % H;
            for (let cc = 0; cc < W; cc++) {
                const idx = r * W + cc;
                const nc = ((cc - dx) % W + W) % W;
                const nIdx = nr * W + nc;
                const J = coupling[kBase + idx];
                for (let ch = 0; ch < n; ch++) y[ch * HW + idx] += J * x[ch * HW + nIdx];
            }
        }
    }
    for (let p = 0; p < HW; p++) {
        let dot = 0;
        for (let ch = 0; ch < n; ch++) dot += y[ch * HW + p] * x[ch * HW + p];
        for (let ch = 0; ch < n; ch++) {
            const o = ch * HW + p;
            x[o] = x[o] + dt * (y[o] - dot * x[o]) / nOff;
        }
    }
    normalizeField(x, n, HW);
}

export function runVectorSegmentation(model, image, initX, { keepTrajectory = false } = {}) {
    const H = model.meta.size, W = model.meta.size, n = model.meta.n;
    const { c, coupling } = encodeVectorScene(model, image, H, W);
    const x = Float32Array.from(initX);
    const trajectory = keepTrajectory ? [] : null;
    for (let s = 0; s < model.meta.steps; s++) {
        vectorStep(x, c, coupling, model.meta.offsets, n, H, W, model.meta.dt);
        if (keepTrajectory) trajectory.push(Float32Array.from(x));
    }
    return { x, c, trajectory };
}

// init x0 = normalize(stimulus) — matches export_vector.py's deterministic reference.
export function stimulusInit(model, image, H, W) {
    const { c } = encodeVectorScene(model, image, H, W);
    const x = Float32Array.from(c);
    normalizeField(x, model.meta.n, H * W);
    return x;
}

// --- PCA -> RGB readout ------------------------------------------------------
// Top-3 principal directions of the foreground vectors via power iteration with
// deflation; project every pixel onto them -> RGB. Aligned (same-object) vectors
// land at the same colour; distinct phase domains get distinct colours.
function topPCs(x, fgIdx, n, HW, k = 3) {
    // mean over foreground
    const mean = new Float64Array(n);
    for (const p of fgIdx) for (let ch = 0; ch < n; ch++) mean[ch] += x[ch * HW + p];
    for (let ch = 0; ch < n; ch++) mean[ch] /= Math.max(1, fgIdx.length);
    // covariance (n x n)
    const C = new Float64Array(n * n);
    const v = new Float64Array(n);
    for (const p of fgIdx) {
        for (let ch = 0; ch < n; ch++) v[ch] = x[ch * HW + p] - mean[ch];
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) C[a * n + b] += v[a] * v[b];
    }
    const pcs = [];
    for (let comp = 0; comp < k; comp++) {
        let u = new Float64Array(n).map(() => Math.random() - 0.5);
        for (let it = 0; it < 64; it++) {
            const w = new Float64Array(n);
            for (let a = 0; a < n; a++) { let s = 0; for (let b = 0; b < n; b++) s += C[a * n + b] * u[b]; w[a] = s; }
            let norm = Math.hypot(...w) || 1;
            for (let a = 0; a < n; a++) u[a] = w[a] / norm;
        }
        // eigenvalue (Rayleigh) then deflate C
        const Cu = new Float64Array(n);
        for (let a = 0; a < n; a++) { let s = 0; for (let b = 0; b < n; b++) s += C[a * n + b] * u[b]; Cu[a] = s; }
        let lam = 0; for (let a = 0; a < n; a++) lam += u[a] * Cu[a];
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) C[a * n + b] -= lam * u[a] * u[b];
        pcs.push({ u, mean });
    }
    return pcs;
}

// Build an RGB image (Uint8, HxWx4) from a vector field using a fixed PC basis.
// `basis` is reused across frames so colours stay stable through the animation.
export function fieldToRGB(x, image, n, H, W, basis) {
    const HW = H * W;
    const proj = new Float32Array(HW * 3);
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let p = 0; p < HW; p++) {
        for (let comp = 0; comp < 3; comp++) {
            const { u, mean } = basis[comp];
            let s = 0;
            for (let ch = 0; ch < n; ch++) s += (x[ch * HW + p] - mean[ch]) * u[ch];
            proj[p * 3 + comp] = s;
            if (image[p] > 0.05) { if (s < lo[comp]) lo[comp] = s; if (s > hi[comp]) hi[comp] = s; }
        }
    }
    const img = new Uint8ClampedArray(HW * 4);
    for (let p = 0; p < HW; p++) {
        const bright = Math.min(1, image[p]);
        for (let comp = 0; comp < 3; comp++) {
            const t = (proj[p * 3 + comp] - lo[comp]) / Math.max(1e-6, hi[comp] - lo[comp]);
            img[p * 4 + comp] = Math.max(0, Math.min(1, t)) * bright * 255;
        }
        img[p * 4 + 3] = 255;
    }
    return img;
}

export function foregroundIndices(image, HW) {
    const fg = [];
    for (let p = 0; p < HW; p++) if (image[p] > 0.05) fg.push(p);
    return fg;
}

export { topPCs };
