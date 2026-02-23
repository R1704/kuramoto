/**
 * StructureDetector — connected-component labeling on thresholded local R field.
 * Uses union-find with periodic boundary awareness.
 */

export class StructureDetector {
    constructor(options = {}) {
        this.threshold = options.threshold ?? 0.5;
        this.minArea = options.minArea ?? 4;
        this._nextId = 1;
    }

    /**
     * Detect coherent structures in the local order field.
     * @param {Float32Array} orderData - Per-cell local R values (single layer)
     * @param {number} gridSize - Width/height of grid
     * @param {number} [threshold] - Override threshold
     * @returns {Array<Structure>}
     */
    detect(orderData, gridSize, threshold) {
        const thr = threshold ?? this.threshold;
        const N = gridSize * gridSize;
        if (!orderData || orderData.length < N) return [];

        // 1. Threshold: mark cells above threshold
        const above = new Uint8Array(N);
        for (let i = 0; i < N; i++) {
            above[i] = orderData[i] >= thr ? 1 : 0;
        }

        // 2. Union-Find with periodic boundaries
        const parent = new Int32Array(N);
        const rank = new Uint8Array(N);
        for (let i = 0; i < N; i++) parent[i] = i;

        const find = (x) => {
            while (parent[x] !== x) {
                parent[x] = parent[parent[x]]; // path compression
                x = parent[x];
            }
            return x;
        };

        const union = (a, b) => {
            a = find(a);
            b = find(b);
            if (a === b) return;
            if (rank[a] < rank[b]) { const t = a; a = b; b = t; }
            parent[b] = a;
            if (rank[a] === rank[b]) rank[a]++;
        };

        // Connect 4-neighbors with periodic wrapping
        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                const i = r * gridSize + c;
                if (!above[i]) continue;

                // Right neighbor (periodic)
                const rc = (c + 1) % gridSize;
                const jr = r * gridSize + rc;
                if (above[jr]) union(i, jr);

                // Down neighbor (periodic)
                const rd = (r + 1) % gridSize;
                const jd = rd * gridSize + c;
                if (above[jd]) union(i, jd);
            }
        }

        // 3. Collect components
        const components = new Map(); // rootId → [cell indices]
        for (let i = 0; i < N; i++) {
            if (!above[i]) continue;
            const root = find(i);
            if (!components.has(root)) components.set(root, []);
            components.get(root).push(i);
        }

        // 4. Build Structure objects, filtering by minArea
        const structures = [];
        for (const [, cells] of components) {
            if (cells.length < this.minArea) continue;

            let sumR = 0, sinSum = 0, cosSum = 0;
            let minC = gridSize, maxC = 0, minR = gridSize, maxR = 0;
            // Use circular mean for centroid to handle wrapping
            let sinCX = 0, cosCX = 0, sinCY = 0, cosCY = 0;
            const angStep = (2 * Math.PI) / gridSize;

            for (const idx of cells) {
                const cr = Math.floor(idx / gridSize);
                const cc = idx % gridSize;
                sumR += orderData[idx];

                // Circular centroid computation (handles periodic wrapping)
                const angX = cc * angStep;
                const angY = cr * angStep;
                sinCX += Math.sin(angX);
                cosCX += Math.cos(angX);
                sinCY += Math.sin(angY);
                cosCY += Math.cos(angY);

                if (cc < minC) minC = cc;
                if (cc > maxC) maxC = cc;
                if (cr < minR) minR = cr;
                if (cr > maxR) maxR = cr;
            }

            const n = cells.length;
            // Circular mean → centroid in grid coords
            let centroidX = Math.atan2(sinCX / n, cosCX / n) / angStep;
            let centroidY = Math.atan2(sinCY / n, cosCY / n) / angStep;
            if (centroidX < 0) centroidX += gridSize;
            if (centroidY < 0) centroidY += gridSize;

            structures.push({
                id: this._nextId++,
                cells,
                centroidX,
                centroidY,
                area: n,
                meanR: sumR / n,
                boundingBox: { minC, maxC, minR, maxR },
            });
        }

        // Sort by area descending
        structures.sort((a, b) => b.area - a.area);
        return structures;
    }
}
