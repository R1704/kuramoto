function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
    const t = clamp((value - edge0) / Math.max(1e-5, edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

function wrapIndex(value, size) {
    return ((value % size) + size) % size;
}

function sampleLayerField(field, gridSize, layer, c, r) {
    const layerSize = gridSize * gridSize;
    const cc = wrapIndex(c, gridSize);
    const rr = wrapIndex(r, gridSize);
    const idx = layer * layerSize + rr * gridSize + cc;
    return Number.isFinite(field?.[idx]) ? field[idx] : 0;
}

function kernelWeight(dx, dy, state) {
    const sigma = Math.max(1e-5, state.sigma ?? 1.2);
    const sigma2 = Math.max(1e-5, state.sigma2 ?? 3.0);
    const beta = state.beta ?? 0.35;
    const shape = Math.round(state.kernelShape ?? 0);
    if (shape === 7) {
        const r = Math.sqrt(dx * dx + dy * dy);
        const ringRadius = 1.5 * sigma2;
        const shellWidth = Math.max(0.3, sigma * 0.5);
        const d = r - ringRadius;
        return Math.exp(-(d * d) / (2 * shellWidth * shellWidth));
    }
    const d2 = dx * dx + dy * dy;
    const w1 = Math.exp(-d2 / (2 * sigma * sigma));
    const w2 = Math.exp(-d2 / (2 * sigma2 * sigma2));
    return w1 - beta * w2;
}

function growthSelect(u, state) {
    const mu = state.growthMu ?? 0.15;
    const sigma = Math.max(1e-5, state.growthSigma ?? 0.03);
    const mode = Math.round(state.growthMode ?? 0);
    if (mode === 1) {
        return Math.abs(u - mu) < sigma ? 1 : -1;
    }
    if (mode === 2) {
        const d1 = u - mu;
        const d2 = u - 2 * mu;
        const g1 = Math.exp(-(d1 * d1) / (2 * sigma * sigma));
        const g2 = Math.exp(-(d2 * d2) / (2 * sigma * sigma));
        return 2 * (g1 - 0.5 * g2) - 1;
    }
    const d = u - mu;
    return 2 * Math.exp(-(d * d) / (2 * sigma * sigma)) - 1;
}

export function computeKuramotoNcaProbe({ theta, matter, state, gridSize, layer = 0, c, r }) {
    if (!theta || !matter || !state || state.ruleMode !== 7) return null;
    const grid = Math.max(1, Math.floor(gridSize || state.gridSize || 1));
    const activeLayer = clamp(Math.floor(layer || 0), 0, Math.max(0, Math.floor(state.layerCount || 1) - 1));
    const col = clamp(Math.floor(c ?? grid / 2), 0, grid - 1);
    const row = clamp(Math.floor(r ?? grid / 2), 0, grid - 1);
    const centerTheta = sampleLayerField(theta, grid, activeLayer, col, row);
    const centerMatter = clamp(sampleLayerField(matter, grid, activeLayer, col, row), 0, 1);
    const range = Math.floor(clamp((state.sigma2 ?? 3.0) * 3.0, 1.0, 8.0));

    let matterExc = 0;
    let matterSupport = 0;
    let matterInh = 0;
    let posTotal = 0;
    let negTotal = 0;
    let fieldX = 0;
    let fieldY = 0;
    let dominantExc = null;
    let dominantInh = null;

    for (let dr = -range; dr <= range; dr++) {
        for (let dc = -range; dc <= range; dc++) {
            if (dc === 0 && dr === 0) continue;
            const w = kernelWeight(dc, dr, state);
            if (Math.abs(w) < 0.0001) continue;
            const a = clamp(sampleLayerField(matter, grid, activeLayer, col + dc, row + dr), 0, 1);
            const t = sampleLayerField(theta, grid, activeLayer, col + dc, row + dr);
            if (w > 0) {
                const contribution = w * a;
                matterExc += contribution;
                const affinity = 0.5 + 0.5 * Math.cos(t - centerTheta);
                const affinityMix = state.ncaPhaseAffinity ?? 0.7;
                matterSupport += contribution * (1 - affinityMix + affinityMix * affinity);
                fieldX += contribution * Math.cos(t);
                fieldY += contribution * Math.sin(t);
                posTotal += w;
                if (!dominantExc || contribution > dominantExc.contribution) {
                    dominantExc = { dc, dr, weight: w, matter: a, contribution };
                }
            } else {
                const contribution = -w * a;
                matterInh += contribution;
                negTotal += -w;
                if (!dominantInh || contribution > dominantInh.contribution) {
                    dominantInh = { dc, dr, weight: w, matter: a, contribution };
                }
            }
        }
    }

    const excDensity = matterSupport / Math.max(posTotal, 1e-5);
    const inhDensity = matterInh / Math.max(negTotal, 1e-5);
    const growthInput = clamp(excDensity - (state.beta ?? 0.35) * inhDensity, 0, 1);
    const livingMassFloor = Math.max(0.05 * posTotal, 1e-5);
    const fieldNorm = Math.max(matterExc, livingMassFloor);
    const localX = fieldX / fieldNorm;
    const localY = fieldY / fieldNorm;
    const localR = clamp(Math.hypot(localX, localY), 0, 1);
    const growth = growthSelect(growthInput, state);
    const coherenceMin = state.ncaCoherenceMin ?? 0.18;
    const coherenceMax = Math.max(coherenceMin + 0.01, state.ncaCoherenceMax ?? 0.65);
    const ablationMode = Math.round(state.ncaAblationMode ?? 0);
    // Mode 2 pins the gate open in the shader; mirror it so the probe matches what runs.
    const coherenceGate = ablationMode === 2 ? 1 : smoothstep(coherenceMin, coherenceMax, localR);
    const growthPositive = Math.max(growth, 0);
    const growthNegative = Math.max(-growth, 0);
    // Collapsed dynamics — mirrors rule_kuramoto_nca exactly: one coherence-gated
    // saturating growth term, one structural death term (G- tail plus passive leak).
    const birth = coherenceGate * coherenceGate * growthPositive * (1 - centerMatter);
    const death = (growthNegative + (state.ncaMatterDecay ?? 0.01)) * centerMatter;
    const matterDelta = (state.ncaGrowthK ?? 0.35) * (birth - death);
    const torque = Math.cos(centerTheta) * localY - Math.sin(centerTheta) * localX;

    return {
        c: col,
        r: row,
        layer: activeLayer,
        theta: centerTheta,
        matter: centerMatter,
        excDensity,
        inhDensity,
        growthInput,
        localR,
        coherenceGate,
        growth,
        growthPositive,
        growthNegative,
        birth,
        death,
        matterDelta,
        phaseDelta: (state.ncaPhaseK ?? 1.0) * torque,
        dominantExc,
        dominantInh,
        range,
    };
}
