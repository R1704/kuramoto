/**
 * StructureTracker — temporal tracking of detected structures across frames.
 * Greedy nearest-centroid matching with area similarity scoring.
 */

export class StructureTracker {
    constructor(options = {}) {
        this.maxDeathFrames = options.maxDeathFrames ?? 15;
        this.maxHistoryLength = options.maxHistoryLength ?? 300;
        this._nextTrackId = 1;
        this.tracks = new Map(); // trackId → Track
        this.frameCount = 0;
    }

    /**
     * Update tracks with newly detected structures.
     * @param {Array<Structure>} structures - From StructureDetector.detect()
     * @param {number} gridSize - For periodic distance calculation
     * @returns {{ active: Array<Track>, born: number, died: number }}
     */
    update(structures, gridSize) {
        this.frameCount++;
        const time = this.frameCount;

        // Get active tracks (not dead)
        const activeTracks = [];
        for (const track of this.tracks.values()) {
            if (!track.deathTime) activeTracks.push(track);
        }

        // Score matrix: [trackIdx][structIdx] → cost (lower = better match)
        const matched = this._greedyMatch(activeTracks, structures, gridSize);

        let born = 0, died = 0;

        // Update matched tracks
        const matchedStructIds = new Set();
        const matchedTrackIds = new Set();

        for (const { trackId, structIdx } of matched) {
            matchedTrackIds.add(trackId);
            matchedStructIds.add(structIdx);
            const track = this.tracks.get(trackId);
            const s = structures[structIdx];
            this._appendHistory(track, time, s, gridSize);
        }

        // Mark unmatched tracks: increment death counter or kill
        for (const track of activeTracks) {
            if (matchedTrackIds.has(track.id)) continue;
            track.missedFrames = (track.missedFrames || 0) + 1;
            if (track.missedFrames >= this.maxDeathFrames) {
                track.deathTime = time;
                died++;
            }
        }

        // Birth new tracks for unmatched structures
        for (let i = 0; i < structures.length; i++) {
            if (matchedStructIds.has(i)) continue;
            const s = structures[i];
            const track = {
                id: this._nextTrackId++,
                history: [],
                birthTime: time,
                deathTime: null,
                missedFrames: 0,
            };
            this._appendHistory(track, time, s, gridSize);
            this.tracks.set(track.id, track);
            born++;
        }

        // Prune old dead tracks (keep last 100 dead tracks max)
        this._pruneDeadTracks();

        // Return active tracks
        const active = [];
        for (const track of this.tracks.values()) {
            if (!track.deathTime) active.push(track);
        }

        return { active, born, died, totalTracked: this.tracks.size };
    }

    /**
     * Get all currently active (alive) tracks.
     */
    getActiveTracks() {
        const active = [];
        for (const track of this.tracks.values()) {
            if (!track.deathTime) active.push(track);
        }
        return active;
    }

    /**
     * Get latest state from a track's history.
     */
    getLatest(track) {
        return track.history.length > 0 ? track.history[track.history.length - 1] : null;
    }

    /**
     * Greedy nearest-centroid matching.
     * Score = periodic_distance(centroid) + area_difference_penalty
     */
    _greedyMatch(tracks, structures, gridSize) {
        if (tracks.length === 0 || structures.length === 0) return [];

        // Build cost matrix
        const costs = [];
        for (let ti = 0; ti < tracks.length; ti++) {
            const latest = this.getLatest(tracks[ti]);
            if (!latest) continue;
            for (let si = 0; si < structures.length; si++) {
                const s = structures[si];
                const dist = this._periodicDist(
                    latest.centroidX, latest.centroidY,
                    s.centroidX, s.centroidY, gridSize
                );
                // Area similarity: ratio penalty
                const areaRatio = Math.max(latest.area, s.area) /
                                  Math.max(1, Math.min(latest.area, s.area));
                const cost = dist + (areaRatio - 1) * gridSize * 0.1;
                costs.push({ ti, si, trackId: tracks[ti].id, cost });
            }
        }

        // Sort by cost ascending
        costs.sort((a, b) => a.cost - b.cost);

        // Greedy assignment
        const usedTracks = new Set();
        const usedStructs = new Set();
        const result = [];

        for (const { ti, si, trackId, cost } of costs) {
            if (usedTracks.has(ti) || usedStructs.has(si)) continue;
            // Max match distance: half grid size
            if (cost > gridSize * 0.5) continue;
            usedTracks.add(ti);
            usedStructs.add(si);
            result.push({ trackId, structIdx: si });
        }

        return result;
    }

    _periodicDist(x1, y1, x2, y2, gridSize) {
        let dx = Math.abs(x2 - x1);
        let dy = Math.abs(y2 - y1);
        if (dx > gridSize / 2) dx = gridSize - dx;
        if (dy > gridSize / 2) dy = gridSize - dy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    _appendHistory(track, time, structure, gridSize) {
        const prev = this.getLatest(track);
        let vx = 0, vy = 0;
        if (prev) {
            let dx = structure.centroidX - prev.centroidX;
            let dy = structure.centroidY - prev.centroidY;
            // Unwrap periodic
            if (dx > gridSize / 2) dx -= gridSize;
            if (dx < -gridSize / 2) dx += gridSize;
            if (dy > gridSize / 2) dy -= gridSize;
            if (dy < -gridSize / 2) dy += gridSize;
            const dt = time - prev.t;
            if (dt > 0) { vx = dx / dt; vy = dy / dt; }
        }

        track.history.push({
            t: time,
            centroidX: structure.centroidX,
            centroidY: structure.centroidY,
            area: structure.area,
            meanR: structure.meanR,
            vx, vy,
            velocity: Math.sqrt(vx * vx + vy * vy),
        });

        track.missedFrames = 0;

        // Trim history
        if (track.history.length > this.maxHistoryLength) {
            track.history = track.history.slice(-this.maxHistoryLength);
        }
    }

    _pruneDeadTracks() {
        const deadTracks = [];
        for (const track of this.tracks.values()) {
            if (track.deathTime) deadTracks.push(track);
        }
        // Keep at most 100 dead tracks (oldest pruned first)
        if (deadTracks.length > 100) {
            deadTracks.sort((a, b) => a.deathTime - b.deathTime);
            const toPrune = deadTracks.length - 100;
            for (let i = 0; i < toPrune; i++) {
                this.tracks.delete(deadTracks[i].id);
            }
        }
    }

    reset() {
        this.tracks.clear();
        this._nextTrackId = 1;
        this.frameCount = 0;
    }
}
