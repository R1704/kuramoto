// Lenia bestiary loader: decode and spawn any organism from the bundled bestiary
// (src/patterns/leniaBestiary.json, built by scripts/build-lenia-bestiary.mjs from
// Bert Chan's reference animals.json). Only kn=1/gn=1/<=5-ring/R<=28 species are
// bundled — exactly the set our kernel shape 9 (exact multi-ring Lenia bell) and
// growthMode 0 (exponential growth) reproduce faithfully.

// Top-level await: this module is always dynamically imported, so the bundle only
// loads when the picker is first used. fetch (not a JSON import assertion) keeps it
// portable across browsers and dev servers.
const _resp = await fetch(new URL('./leniaBestiary.json', import.meta.url));
export const LENIA_BESTIARY = await _resp.json();

// Char -> intensity, exact port of Board.ch2val from the reference LeniaND.py.
function ch2val(c) {
    if (c === '.' || c === 'b') return 0;
    if (c === 'o') return 255;
    if (c.length === 1) return c.charCodeAt(0) - 65 + 1; // ord('A')
    return (c.charCodeAt(0) - 112) * 24 + (c.charCodeAt(1) - 65 + 25); // ord('p'), ord('A')
}

// Decode a 2D Lenia RLE cell string to a row-major float grid in [0,1].
// Exact port of Board.rle2arr (2D case): '$' ends a row, digits repeat the last
// token, and the 'p'..'y'/'@' prefix chars form two-char intensity codes.
export function decodeCells(rle) {
    const rows = [];
    let cur = [];
    let last = '';
    let count = '';
    const st = rle.replace(/!$/, '') + '$';
    for (const ch of st) {
        if (ch >= '0' && ch <= '9') {
            count += ch;
        } else if ('pqrstuvwxy@'.includes(ch)) {
            last = ch;
        } else {
            const tok = last + ch;
            if (tok !== '$') {
                const v = ch2val(tok) / 255;
                const n = count ? parseInt(count, 10) : 1;
                for (let i = 0; i < n; i++) cur.push(v);
            } else {
                rows.push(cur);
                const n = count ? parseInt(count, 10) : 1;
                for (let i = 1; i < n; i++) rows.push([]);
                cur = [];
            }
            last = '';
            count = '';
        }
    }
    const w = rows.reduce((mx, r) => Math.max(mx, r.length), 0);
    return rows.map((r) => {
        const padded = r.slice();
        while (padded.length < w) padded.push(0);
        return padded;
    });
}

export function getAnimal(name) {
    return LENIA_BESTIARY.find((a) => a.name === name) || null;
}

// Configure state for an animal and implant `count` copies, spread across the grid.
// Sets the exact Lenia kernel (shape 9 + ring weights from b), radius R -> sigma2,
// growth (m,s) -> growthMu/Sigma, and dt = 1/T. Rule 6 (true matter Lenia) by default;
// pass ruleMode 7 to run it under the coherence-gated oscillator model.
export function spawnAnimal(state, sim, name, opts = {}) {
    const animal = getAnimal(name);
    if (!animal) return false;
    const count = Math.max(1, Math.floor(opts.count ?? 1));
    const ruleMode = opts.ruleMode ?? 6;
    const rand = opts.rand ?? Math.random;

    const cells = decodeCells(animal.cells);
    const ph = cells.length;
    const pw = cells.length ? cells[0].length : 0;

    state.ruleMode = ruleMode;
    state.K0 = 1.0;
    state.sigma2 = animal.R; // kernel radius R
    state.sigma = 3.2; // unused by shape 9
    state.beta = 0.0;
    state.kernelShape = 9; // exact multi-ring Lenia bell
    state.kernelCompositionEnabled = false;
    state.kernelRings = animal.b.length;
    const w = [1, 0, 0, 0, 0];
    for (let i = 0; i < animal.b.length && i < 5; i++) w[i] = animal.b[i];
    state.kernelRingWeights = w;
    state.growthMu = animal.m;
    state.growthSigma = animal.s;
    state.growthMode = 0; // exponential = Lenia gn=1
    state.dt = 1 / animal.T;
    state.growthK = state.growthK ?? 1.0;
    state.noiseStrength = 0.0;
    state.leak = 0.0;
    state.viewMode = 1;
    state.colormap = ruleMode === 7 ? 11 : 10;
    state.colormapPalette = 1;
    state.organismsEnabled = true;
    state.organismOverlay = true;
    state.organismThreshold = 0.1;
    state.organismMinArea = 6;

    const grid = sim.gridSize;
    const layers = sim.layers || 1;
    const matter = new Float32Array(grid * grid * layers);
    const theta = new Float32Array(grid * grid * layers);

    // Spread copies on a loose ring so they do not start in contact.
    const sites = [];
    if (count === 1) {
        sites.push([0.5, 0.5]);
    } else {
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            sites.push([0.5 + 0.28 * Math.cos(a), 0.5 + 0.28 * Math.sin(a)]);
        }
    }

    for (let s = 0; s < sites.length; s++) {
        const [fx, fy] = sites[s];
        const ox = Math.round(fx * grid) - Math.floor(pw / 2);
        const oy = Math.round(fy * grid) - Math.floor(ph / 2);
        const phase = ruleMode === 7 ? (s / Math.max(1, sites.length)) * Math.PI * 2 : 0;
        for (let py = 0; py < ph; py++) {
            for (let px = 0; px < pw; px++) {
                const v = cells[py][px];
                if (v <= 0) continue;
                const gx = ((ox + px) % grid + grid) % grid;
                const gy = ((oy + py) % grid + grid) % grid;
                const idx = gy * grid + gx;
                if (v > matter[idx]) {
                    matter[idx] = v;
                    theta[idx] = phase;
                }
            }
        }
    }

    if (ruleMode === 7) {
        // random ambient phase so a swimmer's identity is not biased toward a uniform field
        for (let i = 0; i < theta.length; i++) {
            if (matter[i] === 0) theta[i] = rand() * Math.PI * 2;
        }
    }

    sim.writeMatter(matter);
    sim.writeTheta(theta);
    if (typeof sim.writeOmega === 'function') sim.writeOmega(new Float32Array(grid * grid * layers));
    return true;
}
