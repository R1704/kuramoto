// Deterministic RNG utilities for reproducible experiments.
//
// Design goals:
// - Small, dependency-free, stable across browsers.
// - Streamed: derive independent RNG streams from a single base seed to avoid
//   call-order fragility (adding one random call in RC shouldn't change presets).

function fnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export function normalizeSeed(seed) {
    const n = Number(seed);
    if (!Number.isFinite(n)) return 1;
    const i = Math.floor(n);
    return (i >>> 0) || 1;
}

export function makeRng(baseSeed, streamName = '') {
    let state = (normalizeSeed(baseSeed) ^ fnv1a32(String(streamName))) >>> 0;
    if (state === 0) state = 0x6d2b79f5;

    let spare = 0;
    let hasSpare = false;

    const nextU32 = () => {
        // xorshift32
        state ^= (state << 13) >>> 0;
        state ^= state >>> 17;
        state ^= (state << 5) >>> 0;
        return state >>> 0;
    };

    const float = () => nextU32() / 4294967296; // [0,1)

    const int = (minInclusive, maxInclusive) => {
        const min = Math.floor(minInclusive);
        const max = Math.floor(maxInclusive);
        if (max <= min) return min;
        const span = (max - min + 1) >>> 0;
        // Rejection to avoid modulo bias.
        const limit = Math.floor(4294967296 / span) * span;
        let r;
        do {
            r = nextU32();
        } while (r >= limit);
        return min + (r % span);
    };

    const normal = (mean = 0, std = 1) => {
        if (hasSpare) {
            hasSpare = false;
            return mean + std * spare;
        }

        // Box-Muller transform
        let u = 0;
        let v = 0;
        while (u === 0) u = float();
        while (v === 0) v = float();
        const mag = Math.sqrt(-2.0 * Math.log(u));
        const z0 = mag * Math.cos(2.0 * Math.PI * v);
        const z1 = mag * Math.sin(2.0 * Math.PI * v);
        spare = z1;
        hasSpare = true;
        return mean + std * z0;
    };

    return { nextU32, float, int, normal };
}

export function cryptoSeedFallback() {
    try {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        return (buf[0] >>> 0) || 1;
    } catch {
        // As a last resort; not used for reproducible runs.
        return (Date.now() >>> 0) || 1;
    }
}
