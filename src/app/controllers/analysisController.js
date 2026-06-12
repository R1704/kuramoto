import { computeNcaViability, computeOrganismPhaseStats } from '../../experiments/experiments.js';
import { StructureDetector } from '../../organisms/index.js';

export function extrapolateKc(data) {
    const n = data.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (const point of data) {
        const x = 1 / Math.sqrt(point.N * point.N);
        const y = point.Kc;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return intercept;
}

function toFinite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function makeRangeValues(from, to, steps, isInt = false) {
    const n = Math.max(2, Math.floor(steps));
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = n <= 1 ? 0 : i / (n - 1);
        const raw = from + (to - from) * t;
        out[i] = isInt ? Math.round(raw) : raw;
    }
    return out;
}

function makeCandidateState(state, param, value) {
    return {
        ruleMode: state.ruleMode,
        manifoldMode: state.manifoldMode,
        topologyMode: state.topologyMode,
        colormap: state.colormap,
        viewMode: state.viewMode,
        [param]: value,
        ncaPhaseK: state.ncaPhaseK,
        ncaGrowthK: state.ncaGrowthK,
        ncaMatterDecay: state.ncaMatterDecay,
        ncaCoherenceMin: state.ncaCoherenceMin,
        ncaCoherenceMax: state.ncaCoherenceMax,
        ncaAblationMode: state.ncaAblationMode,
        ncaPhaseAffinity: state.ncaPhaseAffinity,
        growthMu: state.growthMu,
        growthSigma: state.growthSigma,
        growthMode: state.growthMode,
        sigma: state.sigma,
        sigma2: state.sigma2,
        beta: state.beta,
    };
}

function makeCandidateUrl(candidateState) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(candidateState || {})) {
        if (value === undefined || value === null) continue;
        params.set(key, `${value}`);
    }
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    return `${path}?${params.toString()}`;
}

function waitAnimationFrames(frameCount, isCanceled) {
    return new Promise((resolve) => {
        let remaining = Math.max(0, frameCount | 0);
        const tick = () => {
            if (isCanceled()) {
                resolve();
                return;
            }
            if (remaining <= 0) {
                resolve();
                return;
            }
            remaining--;
            requestAnimationFrame(tick);
        };
        tick();
    });
}

function toCSV(results) {
    const lines = ['rank,step,param,value,R,localR,chi,matterMean,matterMass,ncaViabilityScore,ncaRegime'];
    results.forEach((row, idx) => {
        lines.push([
            row.rank ?? '',
            idx + 1,
            row.param,
            row.value,
            row.metrics?.R ?? '',
            row.metrics?.localR ?? '',
            row.metrics?.chi ?? '',
            row.metrics?.matterMean ?? '',
            row.metrics?.matterMass ?? '',
            row.metrics?.ncaViabilityScore ?? '',
            row.metrics?.ncaRegime ?? '',
        ].join(','));
    });
    return lines.join('\n');
}

export function rankSweepResults(results) {
    return results
        .slice()
        .sort((a, b) => {
            const av = Number.isFinite(a.metrics?.ncaViabilityScore) ? a.metrics.ncaViabilityScore : -1;
            const bv = Number.isFinite(b.metrics?.ncaViabilityScore) ? b.metrics.ncaViabilityScore : -1;
            return bv - av;
        })
        .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

export function createDiscoverySweepController({
    state,
    sim,
    stats,
    ui,
    onStatus,
    onResult,
    onDone,
    captureThumbnail,
    syncParams,
}) {
    // Layer-backed params (growth/NCA/kernel/gauge) need the full sync path; the bare
    // updateFullParams fallback only covers global params like K0/range/dt.
    const pushParams = () => {
        if (typeof syncParams === 'function') {
            syncParams();
        } else {
            sim.updateFullParams(state);
            sim.setManifoldMode(state.manifoldMode);
        }
    };
    let running = false;
    let cancelRequested = false;
    let lastResults = [];

    const captureBaseline = async () => {
        const manifold = state.manifoldMode || 's1';
        const baseline = {
            manifold,
            theta: null,
            vec: null,
            omega: null,
            matter: null,
            omegaVec: null,
            gauge: null,
        };

        if (manifold === 's1') {
            baseline.theta = await sim.readTheta();
            if (!baseline.theta && sim.thetaData) baseline.theta = new Float32Array(sim.thetaData);
            if (typeof sim.readMatterField === 'function') {
                baseline.matter = await sim.readMatterField();
            }
            baseline.omega = sim.getOmega() ? new Float32Array(sim.getOmega()) : null;
            if (typeof sim.readGaugeField === 'function') {
                baseline.gauge = await sim.readGaugeField();
            }
            if (!baseline.gauge && sim.gaugeXData && sim.gaugeYData) {
                baseline.gauge = {
                    ax: new Float32Array(sim.gaugeXData),
                    ay: new Float32Array(sim.gaugeYData),
                    graph: sim.graphGaugeData ? new Float32Array(sim.graphGaugeData) : null,
                };
            }
        } else {
            baseline.vec = await sim.readS2();
            if (!baseline.vec && sim.s2Data) baseline.vec = new Float32Array(sim.s2Data);
            baseline.omegaVec = sim.omegaVecData ? new Float32Array(sim.omegaVecData) : null;
        }
        return baseline;
    };

    const restoreBaseline = async (baseline) => {
        if (!baseline) return;
        if (baseline.manifold === 's1') {
            if (baseline.theta) sim.writeTheta(baseline.theta);
            if (baseline.matter && typeof sim.writeMatter === 'function') {
                sim.writeMatter(baseline.matter);
            }
            if (baseline.omega) {
                sim.writeOmega(baseline.omega);
                sim.storeOmega(baseline.omega);
            }
            if (baseline.gauge?.ax && baseline.gauge?.ay && typeof sim.writeGaugeField === 'function') {
                sim.writeGaugeField(baseline.gauge.ax, baseline.gauge.ay);
            }
            if (baseline.gauge?.graph && typeof sim.writeGraphGauge === 'function') {
                sim.writeGraphGauge(baseline.gauge.graph);
            }
        } else {
            if (baseline.vec) sim.writeS2(baseline.vec);
            if (baseline.omegaVec && typeof sim.writeOmegaVec === 'function') {
                sim.writeOmegaVec(baseline.omegaVec);
            }
        }
    };

    // The sweep detects organisms itself from readback instead of borrowing the
    // overlay's throttled detection (which is off by default and racy vs settle).
    const sweepDetector = new StructureDetector();
    const sampleSweepOrganisms = async () => {
        if (state.ruleMode !== 7 || typeof sim.readOrderField !== 'function') return null;
        // Sequential: readbacks share a pending-guard mutex; concurrent calls return null.
        const orderData = await sim.readOrderField();
        if (!orderData) return null;
        const thetaData = typeof sim.readTheta === 'function' ? await sim.readTheta() : null;
        const grid = sim.gridSize || state.gridSize || 1;
        const layerSize = grid * grid;
        const layer = Math.min(Math.max(0, Math.floor(state.activeLayer ?? 0)), Math.max(0, (sim.layers || 1) - 1));
        const layerOrder = orderData.subarray(layer * layerSize, (layer + 1) * layerSize);
        const layerTheta = thetaData ? thetaData.subarray(layer * layerSize, (layer + 1) * layerSize) : undefined;
        sweepDetector.threshold = state.organismThreshold ?? 0.5;
        sweepDetector.minArea = state.organismMinArea ?? 4;
        const structures = sweepDetector.detect(layerOrder, grid, undefined, layerTheta);
        let areaSum = 0;
        let weightedR = 0;
        for (const s of structures) {
            areaSum += s.area;
            weightedR += s.area * (s.meanR || 0);
        }
        return {
            structures,
            count: structures.length,
            largestArea: structures.length ? structures[0].area : 0,
            livingCoherence: areaSum > 0 ? weightedR / areaSum : null,
        };
    };

    const sampleMatterMetrics = async () => {
        if (state.ruleMode !== 7 || typeof sim.readMatterField !== 'function') {
            return { mean: 0, mass: 0 };
        }
        const matter = await sim.readMatterField();
        if (!matter || matter.length === 0) return { mean: 0, mass: 0 };
        const grid = sim.gridSize || state.gridSize || 1;
        const layerSize = grid * grid;
        const layer = Math.min(Math.max(0, Math.floor(state.activeLayer ?? 0)), Math.max(0, (sim.layers || 1) - 1));
        const start = layer * layerSize;
        const end = Math.min(start + layerSize, matter.length);
        let mass = 0;
        for (let i = start; i < end; i++) {
            const v = Number.isFinite(matter[i]) ? matter[i] : 0;
            mass += Math.max(0, Math.min(1, v));
        }
        const count = Math.max(1, end - start);
        return { mean: mass / count, mass };
    };

    const run = async ({
        param,
        from,
        to,
        steps,
        settleFrames,
    }) => {
        if (running) return { canceled: true, results: lastResults };
        running = true;
        cancelRequested = false;
        lastResults = [];

        const oldValue = state[param];
        const oldPaused = !!state.paused;
        const isIntParam = param === 'range' || param === 'ncaAblationMode';
        const values = makeRangeValues(from, to, steps, isIntParam);
        const baseline = await captureBaseline();
        state.paused = false;
        let wasCanceled = false;

        onStatus?.(`running (0/${values.length})`);

        try {
            for (let i = 0; i < values.length; i++) {
                if (cancelRequested) break;

                await restoreBaseline(baseline);
                state[param] = values[i];
                pushParams();
                ui?.updateDisplay?.();

                await waitAnimationFrames(settleFrames, () => cancelRequested);

                const metrics = {
                    R: toFinite(stats?.R, 0),
                    localR: toFinite(stats?.localR, 0),
                    chi: toFinite(stats?.chi, 0),
                };
                if (state.ruleMode === 7) {
                    const matter = await sampleMatterMetrics();
                    const organisms = await sampleSweepOrganisms();
                    const phaseStats = computeOrganismPhaseStats(organisms?.structures);
                    const viability = computeNcaViability({
                        ruleMode: state.ruleMode,
                        gridSize: sim.gridSize || state.gridSize,
                        matterMean: matter.mean,
                        matterMass: matter.mass,
                        livingCoherenceMean: organisms?.livingCoherence ?? metrics.localR,
                        globalR: metrics.R,
                        organismCount: organisms?.count ?? 0,
                        largestOrganismArea: organisms?.largestArea ?? 0,
                        meanTrackPersistence: null,
                        phaseDiversity: phaseStats?.phaseDiversity ?? null,
                    });
                    metrics.matterMean = matter.mean;
                    metrics.matterMass = matter.mass;
                    metrics.organismCount = organisms?.count ?? 0;
                    metrics.phaseDiversity = phaseStats?.phaseDiversity ?? null;
                    metrics.ncaViabilityScore = viability.score;
                    metrics.ncaRegime = viability.regime;
                }
                const thumbnail = captureThumbnail ? captureThumbnail() : null;
                const candidateState = makeCandidateState(state, param, state[param]);
                const row = { param, value: state[param], metrics, thumbnail, candidateState, candidateUrl: makeCandidateUrl(candidateState) };
                lastResults.push(row);
                const rankedResults = state.ruleMode === 7 ? rankSweepResults(lastResults) : lastResults;
                onResult?.(row, i, values.length, rankedResults);
                onStatus?.(`running (${i + 1}/${values.length})`);
            }
        } finally {
            await restoreBaseline(baseline);
            state[param] = oldValue;
            state.paused = oldPaused;
            pushParams();
            ui?.updateDisplay?.();
            running = false;
            const canceled = cancelRequested;
            wasCanceled = canceled;
            cancelRequested = false;
            onStatus?.(canceled ? 'canceled' : 'done');
            const rankedResults = state.ruleMode === 7 ? rankSweepResults(lastResults) : lastResults;
            lastResults = rankedResults;
            onDone?.({ canceled, results: lastResults });
        }

        return { canceled: wasCanceled, results: lastResults };
    };

    const cancel = () => {
        cancelRequested = true;
    };

    const getResults = () => lastResults.slice();
    const applyBestResult = () => {
        if (running) return null;
        const best = lastResults.find(row => row && row.param);
        if (!best) return null;
        if (best.candidateState) Object.assign(state, best.candidateState);
        else state[best.param] = best.value;
        pushParams();
        ui?.updateDisplay?.();
        return best;
    };
    const exportBestResultURL = () => {
        const best = lastResults.find(row => row && row.param);
        return best?.candidateUrl || null;
    };
    const exportJSON = () => ({ generatedAt: new Date().toISOString(), results: getResults() });
    const exportCSV = () => toCSV(getResults());

    return {
        run,
        cancel,
        isRunning: () => running,
        getResults,
        applyBestResult,
        exportBestResultURL,
        exportJSON,
        exportCSV,
    };
}
