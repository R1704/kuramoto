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
    const lines = ['step,param,value,R,localR,chi'];
    results.forEach((row, idx) => {
        lines.push([
            idx + 1,
            row.param,
            row.value,
            row.metrics?.R ?? '',
            row.metrics?.localR ?? '',
            row.metrics?.chi ?? '',
        ].join(','));
    });
    return lines.join('\n');
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
}) {
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
            omegaVec: null,
            gauge: null,
        };

        if (manifold === 's1') {
            baseline.theta = await sim.readTheta();
            if (!baseline.theta && sim.thetaData) baseline.theta = new Float32Array(sim.thetaData);
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
        const isIntParam = param === 'range';
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
                sim.updateFullParams(state);
                sim.setManifoldMode(state.manifoldMode);
                ui?.updateDisplay?.();

                await waitAnimationFrames(settleFrames, () => cancelRequested);

                const metrics = {
                    R: toFinite(stats?.R, 0),
                    localR: toFinite(stats?.localR, 0),
                    chi: toFinite(stats?.chi, 0),
                };
                const thumbnail = captureThumbnail ? captureThumbnail() : null;
                const row = { param, value: state[param], metrics, thumbnail };
                lastResults.push(row);
                onResult?.(row, i, values.length, lastResults);
                onStatus?.(`running (${i + 1}/${values.length})`);
            }
        } finally {
            await restoreBaseline(baseline);
            state[param] = oldValue;
            state.paused = oldPaused;
            sim.updateFullParams(state);
            sim.setManifoldMode(state.manifoldMode);
            ui?.updateDisplay?.();
            running = false;
            const canceled = cancelRequested;
            wasCanceled = canceled;
            cancelRequested = false;
            onStatus?.(canceled ? 'canceled' : 'done');
            onDone?.({ canceled, results: lastResults });
        }

        return { canceled: wasCanceled, results: lastResults };
    };

    const cancel = () => {
        cancelRequested = true;
    };

    const getResults = () => lastResults.slice();
    const exportJSON = () => ({ generatedAt: new Date().toISOString(), results: getResults() });
    const exportCSV = () => toCSV(getResults());

    return {
        run,
        cancel,
        isRunning: () => running,
        getResults,
        exportJSON,
        exportCSV,
    };
}
