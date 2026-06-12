// AKOrN inference in JavaScript — an exact port of the trained KuramotoSegmenter
// forward pass (sidecar/akorn-toy/train.py). The model segments two overlapping
// shapes by phase: a small CNN reads the image into per-pixel intrinsic frequencies
// (omega) and signed neighbour couplings, then random phases relax through `steps`
// unrolled Kuramoto updates until same-shape pixels synchronize and different-shape
// pixels split into a separate phase domain. This closes the sidecar -> app loop:
// the trained model runs live in the browser with no PyTorch.
//
// Verified bit-close to PyTorch by scripts/verify-akorn-inference.mjs.

let _modelPromise = null;
export function loadAkornModel() {
    if (!_modelPromise) {
        _modelPromise = fetch(new URL('./akornModel.json', import.meta.url)).then((r) => r.json());
    }
    return _modelPromise;
}

// 2D convolution with zero padding p = (k-1)/2 (PyTorch Conv2d 'same' for odd k).
// weight: [outC][inC][k][k], bias: [outC], input: Float32Array[inC*H*W].
function conv2d(input, inC, H, W, weight, bias, outC, k) {
    const p = (k - 1) >> 1;
    const out = new Float32Array(outC * H * W);
    for (let o = 0; o < outC; o++) {
        const wO = weight[o];
        const b = bias[o];
        const outBase = o * H * W;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let acc = b;
                for (let i = 0; i < inC; i++) {
                    const wOi = wO[i];
                    const inBase = i * H * W;
                    for (let ky = 0; ky < k; ky++) {
                        const iy = y + ky - p;
                        if (iy < 0 || iy >= H) continue;
                        const rowBase = inBase + iy * W;
                        const wRow = wOi[ky];
                        for (let kx = 0; kx < k; kx++) {
                            const ix = x + kx - p;
                            if (ix < 0 || ix >= W) continue;
                            acc += wRow[kx] * input[rowBase + ix];
                        }
                    }
                }
                out[outBase + y * W + x] = acc;
            }
        }
    }
    return out;
}

function reluInPlace(a) {
    for (let i = 0; i < a.length; i++) if (a[i] < 0) a[i] = 0;
    return a;
}

// 1x1 conv (per-pixel linear map) with optional tanh. weight: [outC][inC][1][1].
function pointwise(input, inC, H, W, weight, bias, outC, useTanh) {
    const out = new Float32Array(outC * H * W);
    const HW = H * W;
    for (let o = 0; o < outC; o++) {
        const wO = weight[o];
        const b = bias[o];
        const outBase = o * HW;
        for (let px = 0; px < HW; px++) {
            let acc = b;
            for (let i = 0; i < inC; i++) acc += wO[i][0][0] * input[i * HW + px];
            out[outBase + px] = useTanh ? Math.tanh(acc) : acc;
        }
    }
    return out;
}

// Compute the image-conditioned fields (omega, couplings) once per scene.
export function encodeScene(model, image, H, W) {
    const w = model.weights;
    let f = conv2d(image, 1, H, W, w.enc0_w, w.enc0_b, model.meta.hidden, 5);
    reluInPlace(f);
    f = conv2d(f, model.meta.hidden, H, W, w.enc2_w, w.enc2_b, model.meta.hidden, 5);
    reluInPlace(f);
    const omega = pointwise(f, model.meta.hidden, H, W, w.omega_w, w.omega_b, 1, true); // [H*W]
    const coupling = pointwise(f, model.meta.hidden, H, W, w.coup_w, w.coup_b, model.meta.offsets.length, true); // [nOff*H*W]
    return { omega, coupling };
}

// One unrolled Kuramoto step (in place into `next`), mirroring torch.roll exactly:
// neighbour at offset (dy,dx) is theta[(r-dy) mod H][(c-dx) mod W].
export function kuramotoStep(theta, next, omega, coupling, offsets, H, W, dt) {
    const HW = H * W;
    const nOff = offsets.length;
    for (let r = 0; r < H; r++) {
        for (let c = 0; c < W; c++) {
            const idx = r * W + c;
            const ti = theta[idx];
            let drive = 0;
            for (let k = 0; k < nOff; k++) {
                const dy = offsets[k][0], dx = offsets[k][1];
                const nr = ((r - dy) % H + H) % H;
                const nc = ((c - dx) % W + W) % W;
                drive += coupling[k * HW + idx] * Math.sin(theta[nr * W + nc] - ti);
            }
            next[idx] = ti + dt * (omega[idx] + drive / nOff);
        }
    }
    return next;
}

// Run the full relaxation from a given init theta. Returns the final theta and,
// if keepTrajectory, every intermediate field (for animating the relaxation).
export function runSegmentation(model, image, initTheta, { keepTrajectory = false } = {}) {
    const H = model.meta.size, W = model.meta.size;
    const { omega, coupling } = encodeScene(model, image, H, W);
    let theta = Float32Array.from(initTheta);
    let scratch = new Float32Array(H * W);
    const trajectory = keepTrajectory ? [] : null;
    for (let s = 0; s < model.meta.steps; s++) {
        kuramotoStep(theta, scratch, omega, coupling, model.meta.offsets, H, W, model.meta.dt);
        const tmp = theta; theta = scratch; scratch = tmp;
        if (keepTrajectory) trajectory.push(Float32Array.from(theta));
    }
    return { theta, omega, trajectory };
}

// Threshold-free segmentation quality: fraction of foreground pixel pairs whose
// phase agreement (>0.5 vs <0.5) matches whether they share an instance label.
export function pairwiseAccuracy(theta, labels, H, W, samples = 4000, rand = Math.random) {
    const fg = [];
    for (let i = 0; i < H * W; i++) if (labels[i] > 0) fg.push(i);
    if (fg.length < 2) return null;
    let correct = 0;
    for (let n = 0; n < samples; n++) {
        const a = fg[(rand() * fg.length) | 0];
        const b = fg[(rand() * fg.length) | 0];
        const agree = 0.5 * (1 + Math.cos(theta[a] - theta[b])) > 0.5;
        const same = labels[a] === labels[b];
        if (agree === same) correct++;
    }
    return correct / samples;
}
