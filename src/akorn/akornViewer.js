// AKOrN viewer: watch a trained oscillator network organize random state into
// per-object domains on a scene of overlapping shapes. Two models:
//   - scalar (S^1): hue = phase, the 2-object segmenter.
//   - vector (S^15): the per-pixel 16-D unit vectors projected to RGB (top-3 PCA),
//     which holds more objects apart (see RESULTS_nscaling.md). Aligned vectors =
//     same object = same colour.
// Self-contained (no WebGPU sim dependency).

import { loadAkornModel, runSegmentation, pairwiseAccuracy } from './akornInference.js';
import {
    loadVectorModel, runVectorSegmentation, stimulusInit,
    topPCs, fieldToRGB, foregroundIndices,
} from './vectorInference.js';

function hsv2rgb(h, s, v) {
    const i = Math.floor(h * 6), f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: return [v, t, p]; case 1: return [q, v, p]; case 2: return [p, v, t];
        case 3: return [p, q, v]; case 4: return [t, p, v]; default: return [v, p, q];
    }
}

function vectorPairwiseAcc(x, labels, n, HW, samples = 8000) {
    const fg = foregroundIndices ? [] : [];
    for (let p = 0; p < HW; p++) if (labels[p] > 0) fg.push(p);
    if (fg.length < 2) return null;
    let correct = 0;
    for (let s = 0; s < samples; s++) {
        const a = fg[(Math.random() * fg.length) | 0];
        const b = fg[(Math.random() * fg.length) | 0];
        let dot = 0;
        for (let ch = 0; ch < n; ch++) dot += x[ch * HW + a] * x[ch * HW + b];
        if ((dot > 0) === (labels[a] === labels[b])) correct++;
    }
    return correct / samples;
}

export function createAkornViewer({ canvas, infoEl, runBtn, modeEl, modelEl }) {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const TWO_PI = Math.PI * 2;
    const cache = { scalar: null, vector: null };
    let sceneIdx = 0;
    let anim = null;

    function blit(rgba, W, H) {
        const off = document.createElement('canvas');
        off.width = W; off.height = H;
        off.getContext('2d').putImageData(new ImageData(rgba, W, H), 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    }

    function drawTruth(image, labels, H, W) {
        const palette = [[0, 0, 0], [0.2, 0.7, 1.0], [1.0, 0.5, 0.2], [0.4, 1.0, 0.3], [1.0, 0.3, 0.8], [0.9, 0.9, 0.3]];
        const rgba = new Uint8ClampedArray(H * W * 4);
        for (let i = 0; i < H * W; i++) {
            const bright = Math.min(1, image[i]);
            const col = palette[labels[i] % palette.length] || [0, 0, 0];
            rgba[i * 4] = col[0] * bright * 255; rgba[i * 4 + 1] = col[1] * bright * 255;
            rgba[i * 4 + 2] = col[2] * bright * 255; rgba[i * 4 + 3] = 255;
        }
        blit(rgba, W, H);
    }

    function drawScalar(image, theta, H, W) {
        const rgba = new Uint8ClampedArray(H * W * 4);
        for (let i = 0; i < H * W; i++) {
            const bright = Math.min(1, image[i]);
            const hue = (((theta[i] % TWO_PI) + TWO_PI) % TWO_PI) / TWO_PI;
            const [r, g, b] = hsv2rgb(hue, 0.9, bright);
            rgba[i * 4] = r * 255; rgba[i * 4 + 1] = g * 255; rgba[i * 4 + 2] = b * 255; rgba[i * 4 + 3] = 255;
        }
        blit(rgba, W, H);
    }

    async function run() {
        if (anim) { clearInterval(anim); anim = null; }
        const kind = modelEl && modelEl.value === 'vector' ? 'vector' : 'scalar';
        if (infoEl) infoEl.textContent = 'loading trained model…';
        if (!cache[kind]) cache[kind] = await (kind === 'vector' ? loadVectorModel() : loadAkornModel());
        const model = cache[kind];
        const H = model.meta.size, W = model.meta.size;
        const scene = model.scenes[sceneIdx % model.scenes.length];
        const which = (sceneIdx % model.scenes.length) + 1;
        sceneIdx++;
        const image = Float32Array.from(scene.image.flat());
        const labels = Float32Array.from(scene.labels.flat());

        if (modeEl && modeEl.value === 'truth') {
            drawTruth(image, labels, H, W);
            if (infoEl) infoEl.textContent = `ground truth — scene ${which}/${model.scenes.length}`;
            return;
        }

        let trajectory, acc, draw;
        if (kind === 'vector') {
            const n = model.meta.n, HW = H * W;
            const init = stimulusInit(model, image, H, W);
            const res = runVectorSegmentation(model, image, init, { keepTrajectory: true });
            trajectory = res.trajectory;
            acc = vectorPairwiseAcc(res.x, labels, n, HW);
            const basis = topPCs(res.x, foregroundIndices(image, HW), n, HW, 3); // stable colours from final frame
            draw = (frame) => blit(fieldToRGB(frame, image, n, H, W, basis), W, H);
        } else {
            const init = new Float32Array(H * W);
            for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) init[r * W + c] = 0.01 * (c - W / 2);
            const res = runSegmentation(model, image, init, { keepTrajectory: true });
            trajectory = res.trajectory;
            acc = pairwiseAccuracy(res.theta, labels, H, W, 8000);
            draw = (frame) => drawScalar(image, frame, H, W);
        }

        const label = kind === 'vector' ? `S¹⁵ vectors → RGB` : `S¹ phase → hue`;
        let f = 0;
        if (infoEl) infoEl.textContent = `relaxing… (${model.meta.steps} steps, ${label})`;
        anim = setInterval(() => {
            draw(trajectory[f]); f++;
            if (f >= trajectory.length) {
                clearInterval(anim); anim = null;
                if (infoEl) infoEl.textContent = `${label} — pairwise accuracy ${(acc * 100).toFixed(1)}% (scene ${which}/${model.scenes.length})`;
            }
        }, 60);
    }

    if (runBtn) runBtn.onclick = run;
    const rerun = () => { if (cache.scalar || cache.vector) { sceneIdx = Math.max(0, sceneIdx - 1); run(); } };
    if (modeEl) modeEl.onchange = rerun;
    if (modelEl) modelEl.onchange = () => { sceneIdx = 0; run(); };
    return { run };
}
