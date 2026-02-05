function stableStringify(value) {
    if (value === null || value === undefined) return String(value);
    const t = typeof value;
    if (t === 'number' || t === 'boolean') return JSON.stringify(value);
    if (t === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return '[' + value.map(v => stableStringify(v)).join(',') + ']';
    }
    if (t === 'object') {
        const keys = Object.keys(value).sort();
        return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
    }
    return JSON.stringify(String(value));
}

function fnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

function meanStd(arr) {
    if (!arr || arr.length === 0) return { mean: 0, std: 0 };
    let sum = 0;
    for (const v of arr) sum += v;
    const mean = sum / arr.length;
    let varSum = 0;
    for (const v of arr) {
        const d = v - mean;
        varSum += d * d;
    }
    const variance = arr.length > 1 ? (varSum / (arr.length - 1)) : 0;
    return { mean, std: Math.sqrt(variance) };
}

function downsample(series, maxPoints = 300) {
    if (!series || series.length <= maxPoints) return series || [];
    const out = [];
    const step = series.length / maxPoints;
    for (let i = 0; i < maxPoints; i++) {
        out.push(series[Math.floor(i * step)]);
    }
    return out;
}

export class ExperimentRunner {
    constructor({ device, sim, stats, getState, onUpdate }) {
        this.device = device;
        this.sim = sim;
        this.stats = stats;
        this.getState = getState;
        this.onUpdate = onUpdate;

        this.running = false;
        this.canceled = false;
        this.phase = 'idle';

        this.protocol = null;
        this.snapshot = null;
        this.configHash = null;

        this.totalSteps = 0;
        this.stepIndex = 0;
        this.lastReadbackStep = 0;

        this.samples = {
            step: [],
            globalR: [],
            localMeanR: [],
            chi: [],
            gradient: [],
            syncFraction: [],
        };

        this.summary = null;
        this.pendingProcess = false;

        this.finishRequested = false;
        this.finishStatus = null;
        this.pendingSampleStepRel = null;
    }

    setSimulation(sim, stats) {
        this.sim = sim;
        this.stats = stats;
    }

    isRunning() {
        return this.running;
    }

    start(protocol, snapshot) {
        if (this.running) return false;
        if (!protocol) return false;

        this.protocol = {
            resetAtStart: !!protocol.resetAtStart,
            warmupSteps: Math.max(0, Math.floor(protocol.warmupSteps || 0)),
            measureSteps: Math.max(1, Math.floor(protocol.measureSteps || 1)),
            stepsPerFrame: Math.max(1, Math.floor(protocol.stepsPerFrame || 1)),
            readbackEvery: Math.max(1, Math.floor(protocol.readbackEvery || 1)),
        };

        this.snapshot = snapshot;
        const hashStr = stableStringify({ state: snapshot, protocol: this.protocol });
        this.configHash = fnv1a32(hashStr).toString(16).padStart(8, '0');

        this.totalSteps = this.protocol.warmupSteps + this.protocol.measureSteps;
        this.stepIndex = 0;
        this.lastReadbackStep = 0;
        this.phase = this.protocol.warmupSteps > 0 ? 'warmup' : 'measure';
        this.running = true;
        this.canceled = false;
        this.summary = null;
        this.pendingProcess = false;

        this.finishRequested = false;
        this.finishStatus = null;
        this.pendingSampleStepRel = null;

        for (const k of Object.keys(this.samples)) {
            this.samples[k] = [];
        }

        this._emit();
        return true;
    }

    cancel() {
        if (!this.running) return;
        this.canceled = true;
    }

    encodeSteps(encoder, delaySteps, globalCoupling) {
        if (!this.running) return;

        const remaining = this.totalSteps - this.stepIndex;
        const nSteps = Math.min(this.protocol.stepsPerFrame, remaining);

        for (let i = 0; i < nSteps; i++) {
            this.stepIndex++;

            if (this.phase === 'warmup' && this.stepIndex > this.protocol.warmupSteps) {
                this.phase = 'measure';
            }

            const shouldReadback =
                this.phase === 'measure' &&
                (this.stepIndex - this.protocol.warmupSteps) % this.protocol.readbackEvery === 0;

            this.sim.step(encoder, delaySteps, globalCoupling, shouldReadback);
            if (shouldReadback) {
                this.sim.requestGlobalOrderReadback(encoder);
                this.lastReadbackStep = this.stepIndex;
                this.pendingSampleStepRel = this.stepIndex - this.protocol.warmupSteps;
            }

            if (this.canceled) {
                break;
            }
        }

        if (this.canceled) {
            this.finishRequested = true;
            this.finishStatus = 'canceled';
            this.phase = 'finalizing';
            if (!this.sim.readbackPending && !this.pendingProcess) {
                this._finish('canceled');
            } else {
                this._emit();
            }
        } else if (this.stepIndex >= this.totalSteps) {
            this.finishRequested = true;
            this.finishStatus = 'done';
            this.phase = 'finalizing';
            if (!this.sim.readbackPending && !this.pendingProcess) {
                this._finish('done');
            } else {
                this._emit();
            }
        } else {
            this._emit();
        }
    }

    afterSubmit() {
        if (this.phase === 'idle') return;
        if (this.pendingProcess) return;
        if (!this.sim.readbackPending) return;

        this.pendingProcess = true;
        this.sim.processReadback().then(result => {
            if (!result) return;
            if (!this.stats) return;

            this.stats.update(result.cos, result.sin, result.localStats);

            const stepRel = this.pendingSampleStepRel;
            if (stepRel !== null && stepRel !== undefined && stepRel >= 1 && stepRel <= this.protocol.measureSteps) {
                this.samples.step.push(stepRel);
                this.samples.globalR.push(result.R);
                this.samples.localMeanR.push(result.localStats?.meanR ?? 0);
                this.samples.chi.push(this.stats.chi);
                this.samples.gradient.push(result.localStats?.gradient ?? 0);
                this.samples.syncFraction.push(result.localStats?.syncFraction ?? 0);
            }
            this.pendingSampleStepRel = null;

            if (!this.running) {
                this._emit();
            }
        }).finally(() => {
            this.pendingProcess = false;

            if (this.finishRequested && !this.sim.readbackPending && !this.pendingProcess) {
                this._finish(this.finishStatus || 'done');
            }
        });
    }

    exportJSON() {
        const state = this.snapshot || null;
        const protocol = this.protocol || null;
        const summary = this.summary || null;
        const url = (typeof window !== 'undefined') ? window.location.href : null;

        return {
            type: 'kuramoto_rollout',
            timestamp: new Date().toISOString(),
            configHash: this.configHash,
            url,
            state,
            protocol,
            summary,
            timeseries: {
                step: downsample(this.samples.step),
                globalR: downsample(this.samples.globalR),
                localMeanR: downsample(this.samples.localMeanR),
                chi: downsample(this.samples.chi),
                gradient: downsample(this.samples.gradient),
                syncFraction: downsample(this.samples.syncFraction),
            },
        };
    }

    _finish(status) {
        this.running = false;
        this.phase = status;
        this.finishRequested = false;
        this.finishStatus = null;

        const globalR = meanStd(this.samples.globalR);
        const localMeanR = meanStd(this.samples.localMeanR);
        const gradient = meanStd(this.samples.gradient);
        const syncFraction = meanStd(this.samples.syncFraction);
        const chiMax = this.samples.chi.length ? Math.max(...this.samples.chi) : 0;
        const chiMean = meanStd(this.samples.chi).mean;

        this.summary = {
            samples: this.samples.globalR.length,
            globalR_mean: globalR.mean,
            globalR_std: globalR.std,
            localMeanR_mean: localMeanR.mean,
            localMeanR_std: localMeanR.std,
            gradient_mean: gradient.mean,
            syncFraction_mean: syncFraction.mean,
            chi_mean: chiMean,
            chi_max: chiMax,
        };

        this._emit();
    }

    _emit() {
        if (!this.onUpdate) return;
        this.onUpdate({
            running: this.running,
            phase: this.phase,
            stepIndex: this.stepIndex,
            totalSteps: this.totalSteps,
            warmupSteps: this.protocol?.warmupSteps ?? 0,
            measureSteps: this.protocol?.measureSteps ?? 0,
            configHash: this.configHash,
            summary: this.summary,
        });
    }
}
