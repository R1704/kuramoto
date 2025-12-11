export const MAX_GRAPH_DEGREE = 16; // Keep in sync with shaders.js (MAX_GRAPH_DEGREE)

class RNG {
    constructor(seed = 1) {
        this.state = (seed >>> 0) || 1;
    }
    next() {
        // Mulberry32
        this.state |= 0;
        this.state = (this.state + 0x6D2B79F5) | 0;
        let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    nextInt(max) {
        return Math.floor(this.next() * max);
    }
}

function hasNeighbor(neighbors, counts, node, target, maxDegree) {
    const base = node * maxDegree;
    const count = counts[node];
    for (let i = 0; i < count; i++) {
        if (neighbors[base + i] === target) return true;
    }
    return false;
}

function removeNeighbor(neighbors, weights, counts, node, target, maxDegree) {
    const base = node * maxDegree;
    const count = counts[node];
    for (let i = 0; i < count; i++) {
        if (neighbors[base + i] === target) {
            const lastIdx = base + count - 1;
            neighbors[base + i] = neighbors[lastIdx];
            weights[base + i] = weights[lastIdx];
            counts[node] = count - 1;
            return true;
        }
    }
    return false;
}

function addEdge(neighbors, weights, counts, a, b, maxDegree, weight, flags) {
    if (a === b) return false;
    if (hasNeighbor(neighbors, counts, a, b, maxDegree)) return false;
    if (counts[a] >= maxDegree || counts[b] >= maxDegree) {
        flags.clamped = true;
        return false;
    }
    const baseA = a * maxDegree;
    const baseB = b * maxDegree;
    neighbors[baseA + counts[a]] = b;
    weights[baseA + counts[a]] = weight;
    counts[a]++;
    neighbors[baseB + counts[b]] = a;
    weights[baseB + counts[b]] = weight;
    counts[b]++;
    return true;
}

function degreeStats(counts) {
    let sum = 0;
    let max = 0;
    for (let i = 0; i < counts.length; i++) {
        sum += counts[i];
        if (counts[i] > max) max = counts[i];
    }
    return { avg: counts.length ? sum / counts.length : 0, max };
}

function buildGridTopology(gridSize, maxDegree) {
    const n = gridSize * gridSize;
    const neighbors = new Uint32Array(n * maxDegree);
    const weights = new Float32Array(n * maxDegree);
    const counts = new Uint32Array(n);
    const flags = { clamped: false };

    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            const i = r * gridSize + c;
            const right = r * gridSize + ((c + 1) % gridSize);
            const down = ((r + 1) % gridSize) * gridSize + c;
            addEdge(neighbors, weights, counts, i, right, maxDegree, 1, flags);
            addEdge(neighbors, weights, counts, i, down, maxDegree, 1, flags);
        }
    }
    const stats = degreeStats(counts);
    return { neighbors, weights, counts, avgDegree: stats.avg, maxUsedDegree: stats.max, clamped: flags.clamped, mode: 'grid' };
}

function buildWattsStrogatz(gridSize, maxDegree, kInput, rewireProb, seed) {
    const n = gridSize * gridSize;
    const neighbors = new Uint32Array(n * maxDegree);
    const weights = new Float32Array(n * maxDegree);
    const counts = new Uint32Array(n);
    const flags = { clamped: false };
    const rng = new RNG(seed);

    // Ensure even k and within bounds
    const maxUsable = Math.max(0, Math.min(maxDegree, n - 1));
    let kEven = Math.min(maxUsable, Math.max(0, Math.round(kInput)));
    kEven = kEven - (kEven % 2);
    if (kEven < 2 && maxUsable >= 2) kEven = 2;
    const halfK = kEven > 0 ? Math.max(1, Math.floor(kEven / 2)) : 0;
    const p = Math.min(1, Math.max(0, rewireProb));

    // Ring lattice
    for (let i = 0; i < n; i++) {
        for (let step = 1; step <= halfK; step++) {
            const j = (i + step) % n;
            addEdge(neighbors, weights, counts, i, j, maxDegree, 1, flags);
        }
    }

    // Rewire forward edges only to avoid double-processing
    for (let i = 0; i < n; i++) {
        for (let step = 1; step <= halfK; step++) {
            const j = (i + step) % n;
            if (i > j) continue; // process edge once
            if (rng.next() > p) continue;

            // Remove existing edge
            removeNeighbor(neighbors, weights, counts, i, j, maxDegree);
            removeNeighbor(neighbors, weights, counts, j, i, maxDegree);

            // Pick a new target
            let candidate = -1;
            for (let attempt = 0; attempt < 24; attempt++) {
                const cand = rng.nextInt(n);
                if (cand === i) continue;
                if (hasNeighbor(neighbors, counts, i, cand, maxDegree)) continue;
                if (counts[cand] >= maxDegree) continue;
                candidate = cand;
                break;
            }

            if (candidate >= 0) {
                addEdge(neighbors, weights, counts, i, candidate, maxDegree, 1, flags);
            } else {
                // Restore original if no candidate found
                addEdge(neighbors, weights, counts, i, j, maxDegree, 1, flags);
            }
        }
    }

    const stats = degreeStats(counts);
    return {
        neighbors,
        weights,
        counts,
        avgDegree: stats.avg,
        maxUsedDegree: stats.max,
        clamped: flags.clamped,
        mode: 'watts_strogatz',
    };
}

function buildBarabasiAlbert(gridSize, maxDegree, m0Input, mInput, seed) {
    const n = gridSize * gridSize;
    const neighbors = new Uint32Array(n * maxDegree);
    const weights = new Float32Array(n * maxDegree);
    const counts = new Uint32Array(n);
    const flags = { clamped: false };
    const rng = new RNG(seed);

    const m = Math.max(1, Math.min(maxDegree, Math.round(mInput), n - 1));
    const m0 = Math.min(n, Math.max(m + 1, Math.min(maxDegree, Math.round(m0Input))));

    const degreeBag = [];

    const tryAddEdge = (a, b) => addEdge(neighbors, weights, counts, a, b, maxDegree, 1, flags);

    // Seed clique
    for (let i = 0; i < m0; i++) {
        for (let j = i + 1; j < m0; j++) {
            if (tryAddEdge(i, j)) {
                degreeBag.push(i, j);
            }
        }
    }

    const pickPreferential = (upperBound) => {
        if (!degreeBag.length) return -1;
        for (let attempt = 0; attempt < 32; attempt++) {
            const cand = degreeBag[rng.nextInt(degreeBag.length)];
            if (cand >= upperBound) continue; // only attach to existing nodes
            if (counts[cand] >= maxDegree) continue;
            return cand;
        }
        return -1;
    };

    for (let i = m0; i < n; i++) {
        let edgesAdded = 0;
        const seen = new Set();
        while (edgesAdded < m) {
            let target = pickPreferential(i);
            if (target < 0) {
                // Fallback to random target with capacity
                for (let attempt = 0; attempt < 32; attempt++) {
                    const cand = rng.nextInt(i);
                    if (cand === i || seen.has(cand)) continue;
                    if (counts[cand] >= maxDegree) continue;
                    target = cand;
                    break;
                }
            }
            if (target < 0) {
                flags.clamped = true;
                break;
            }
            if (seen.has(target)) continue;
            if (tryAddEdge(i, target)) {
                degreeBag.push(i, target);
                seen.add(target);
                edgesAdded++;
            } else {
                seen.add(target);
            }
        }
    }

    const stats = degreeStats(counts);
    return {
        neighbors,
        weights,
        counts,
        avgDegree: stats.avg,
        maxUsedDegree: stats.max,
        clamped: flags.clamped,
        mode: 'barabasi_albert',
    };
}

export function generateTopology(options) {
    const {
        mode = 'grid',
        gridSize = 64,
        maxDegree = MAX_GRAPH_DEGREE,
        seed = 1,
        wsK = 4,
        wsRewire = 0.2,
        baM0 = 5,
        baM = 3,
    } = options || {};

    const clampedDegree = Math.max(2, Math.min(MAX_GRAPH_DEGREE, Math.floor(maxDegree)));
    const safeGrid = Math.max(1, Math.floor(gridSize));

    if (mode === 'watts_strogatz' || mode === 'ws') {
        return buildWattsStrogatz(safeGrid, clampedDegree, wsK, wsRewire, seed >>> 0);
    }
    if (mode === 'barabasi_albert' || mode === 'ba') {
        return buildBarabasiAlbert(safeGrid, clampedDegree, baM0, baM, seed >>> 0);
    }
    return buildGridTopology(safeGrid, clampedDegree);
}
