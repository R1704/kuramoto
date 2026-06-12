// AKOrN viewer: watch the trained segmenter organize random phases into two phase
// domains on a pair of overlapping shapes. This is the trained counterpart to the
// hand-designed Living Phase view — identity carried by relative phase, but learned
// end-to-end. Self-contained (no WebGPU sim dependency).

import { loadAkornModel, runSegmentation, pairwiseAccuracy } from './akornInference.js';

function hsv2rgb(h, s, v) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: return [v, t, p];
        case 1: return [q, v, p];
        case 2: return [p, v, t];
        case 3: return [p, q, v];
        case 4: return [t, p, v];
        default: return [v, p, q];
    }
}

export function createAkornViewer({ canvas, infoEl, runBtn, modeEl }) {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    let model = null;
    let sceneIdx = 0;
    let anim = null;

    const TWO_PI = Math.PI * 2;

    function draw(image, theta, labels, H, W, showTruth) {
        const img = ctx.createImageData(W, H);
        for (let i = 0; i < H * W; i++) {
            const bright = Math.min(1, image[i]); // shapes lit, background dark
            let r, g, b;
            if (showTruth) {
                // ground-truth instances: circle vs square in fixed colors
                const lab = labels[i];
                const col = lab === 1 ? [0.2, 0.7, 1.0] : lab === 2 ? [1.0, 0.5, 0.2] : [0, 0, 0];
                [r, g, b] = [col[0] * bright, col[1] * bright, col[2] * bright];
            } else {
                const hue = ((theta[i] % TWO_PI) + TWO_PI) % TWO_PI / TWO_PI;
                [r, g, b] = hsv2rgb(hue, 0.9, bright);
            }
            const o = i * 4;
            img.data[o] = r * 255; img.data[o + 1] = g * 255; img.data[o + 2] = b * 255; img.data[o + 3] = 255;
        }
        // nearest-neighbor upscale to the canvas
        const off = document.createElement('canvas');
        off.width = W; off.height = H;
        off.getContext('2d').putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    }

    async function run() {
        if (!model) {
            if (infoEl) infoEl.textContent = 'loading trained model…';
            model = await loadAkornModel();
        }
        if (anim) { clearInterval(anim); anim = null; }
        const H = model.meta.size, W = model.meta.size;
        const scene = model.scenes[sceneIdx % model.scenes.length];
        sceneIdx++;
        const image = Float32Array.from(scene.image.flat());
        const labels = Float32Array.from(scene.labels.flat());
        // deterministic ramp init (matches the verifier); the dynamics do the rest
        const init = new Float32Array(H * W);
        for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) init[r * W + c] = 0.01 * (c - W / 2);
        const { theta, trajectory } = runSegmentation(model, image, init, { keepTrajectory: true });
        const acc = pairwiseAccuracy(theta, labels, H, W, 8000);
        const showTruth = modeEl && modeEl.value === 'truth';
        if (showTruth) {
            draw(image, theta, labels, H, W, true);
            if (infoEl) infoEl.textContent = `ground truth (circle vs square) — scene ${((sceneIdx - 1) % model.scenes.length) + 1}`;
            return;
        }
        // animate the relaxation: random-looking phases -> two clean domains
        let f = 0;
        if (infoEl) infoEl.textContent = `relaxing… (${model.meta.steps} Kuramoto steps)`;
        anim = setInterval(() => {
            draw(image, trajectory[f], labels, H, W, false);
            f++;
            if (f >= trajectory.length) {
                clearInterval(anim); anim = null;
                if (infoEl) infoEl.textContent = `segmented by phase — pairwise accuracy ${(acc * 100).toFixed(1)}% (scene ${((sceneIdx - 1) % model.scenes.length) + 1}/${model.scenes.length})`;
            }
        }, 60);
    }

    if (runBtn) runBtn.onclick = run;
    if (modeEl) modeEl.onchange = () => { if (model) { sceneIdx = Math.max(0, sceneIdx - 1); run(); } };
    return { run };
}
