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

export class RCCriticalitySweepRunner {
    constructor({ device, sim, stats, reservoir, writeRCInputWeights, setInputSignal, getActiveLayerTheta, resetSimulation, setK, onUpdate }) {
        this.device = device;
        this.sim = sim;
        this.stats = stats;
        this.reservoir = reservoir;
        this.writeRCInputWeights = writeRCInputWeights;
        this.setInputSignal = setInputSignal;
        this.getActiveLayerTheta = getActiveLayerTheta;
        this.resetSimulation = resetSimulation;
        this.setK = setK;
        this.onUpdate = onUpdate;

        this.active = false;
        this.cancelRequested = false;

        this.protocol = null;
        this.snapshot = null;
        this.configHash = null;

        this.Ks = [];
        this.kIdx = 0;
        this.phase = 'idle';
        this.sampleInPhase = 0;

        this.pendingTheta = false;
        this.pendingStats = false;
        this.pendingStatsThisStep = false;
        this.stepSubmitted = false;

        this.results = [];
        this.current = null;

        this.baseline = null;
    }

    setSimulation(sim, stats) {
        this.sim = sim;
        this.stats = stats;
    }

    isRunning() {
        return this.active;
    }

    async start(protocol, stateSnapshot) {
        if (this.active) return false;
        this.protocol = {
            K_min: protocol.K_min ?? 0.2,
            K_max: protocol.K_max ?? 2.4,
            K_step: protocol.K_step ?? 0.2,
            warmupSamples: Math.max(0, Math.floor(protocol.warmupSamples ?? 50)),
            trainSamples: Math.max(1, Math.floor(protocol.trainSamples ?? 400)),
            testSamples: Math.max(1, Math.floor(protocol.testSamples ?? 200)),
            statsEvery: Math.max(1, Math.floor(protocol.statsEvery ?? 4)),
            delaySteps: Math.max(0, Math.floor(protocol.delaySteps ?? 10)),
            globalCoupling: !!protocol.globalCoupling,
        };

        this.snapshot = stateSnapshot;
        const hashStr = stableStringify({ state: stateSnapshot, protocol: this.protocol, type: 'rc_vs_criticality_sweep' });
        this.configHash = fnv1a32(hashStr).toString(16).padStart(8, '0');

        this.Ks = [];
        for (let k = this.protocol.K_min; k <= this.protocol.K_max + 1e-6; k += this.protocol.K_step) {
            this.Ks.push(parseFloat(k.toFixed(3)));
        }

        this.cancelRequested = false;
        this.results = [];
        this.kIdx = 0;
        this.phase = 'initializing';
        this.sampleInPhase = 0;

        // Preserve current sim state to restore after sweep.
        const baselineTheta = await this.sim.readTheta();
        const baselineOmega = this.sim.getOmega() ? new Float32Array(this.sim.getOmega()) : null;
        this.baseline = {
            K0: stateSnapshot?.K0,
            theta: baselineTheta ? new Float32Array(baselineTheta) : null,
            omega: baselineOmega,
        };

        this.active = true;
        this._startK(this.Ks[this.kIdx]);
        this._emit();
        return true;
    }

    cancel() {
        if (!this.active) return;
        this.cancelRequested = true;
    }

    encodeSteps(encoder, delaySteps, globalCoupling) {
        if (!this.active) return;

        // Pace simulation by theta samples: don't advance until the previous sample is processed.
        if (this.stepSubmitted || this.pendingTheta) return;

        const shouldComputeStats = this.phase === 'test' && (this.sampleInPhase % this.protocol.statsEvery === 0);
        this.pendingStatsThisStep = shouldComputeStats;
        this.sim.step(encoder, delaySteps, globalCoupling, shouldComputeStats);
        if (shouldComputeStats) {
            this.sim.requestGlobalOrderReadback(encoder);
        }

        this.stepSubmitted = true;
    }

    afterSubmit() {
        if (!this.active) return;

        if (!this.stepSubmitted) return;

        if (this.pendingStatsThisStep && !this.pendingStats && this.sim.readbackPending) {
            this.pendingStats = true;
            this.sim.processReadback().then(result => {
                if (result) {
                    this.stats.update(result.cos, result.sin, result.localStats);
                    if (this.phase === 'test' && this.current) {
                        if (this.sampleInPhase > this.protocol.warmupSamples) {
                            this.current.localMeanR.push(result.localStats?.meanR ?? 0);
                            this.current.chi.push(this.stats.chi);
                        }
                    }
                }
            }).finally(() => {
                this.pendingStats = false;
            });
        }

        if (!this.pendingTheta) {
            this.pendingTheta = true;
            this.sim.readTheta().then(thetaFull => {
                if (!thetaFull) return;
                const thetaLayer = this.getActiveLayerTheta(thetaFull);
                this.reservoir.step(thetaLayer);
                if (this.reservoir.tasks && this.reservoir.tasks.taskType === 'moving_dot') {
                    this.writeRCInputWeights();
                }
                this.setInputSignal(this.reservoir.getInputSignal());

                this.sampleInPhase++;
                this._advancePhaseIfNeeded();
            }).finally(() => {
                this.pendingTheta = false;
                this.pendingStatsThisStep = false;
                this.stepSubmitted = false;
            });
        }
    }

    exportJSON() {
        return {
            type: 'rc_vs_criticality_sweep',
            timestamp: new Date().toISOString(),
            configHash: this.configHash,
            url: (typeof window !== 'undefined') ? window.location.href : null,
            state: this.snapshot,
            protocol: this.protocol,
            results: this.results,
        };
    }

    exportCSV() {
        let csv = 'K,trainNRMSE,testNRMSE,localMeanR_mean,chi_mean,chi_max\n';
        for (const r of this.results) {
            csv += `${r.K.toFixed(3)},${r.trainNRMSE.toFixed(6)},${r.testNRMSE.toFixed(6)},${r.localMeanR_mean.toFixed(6)},${r.chi_mean.toFixed(6)},${r.chi_max.toFixed(6)}\n`;
        }
        return csv;
    }

    async restoreBaseline() {
        if (!this.baseline) return;
        if (this.setK && Number.isFinite(this.baseline.K0)) {
            this.setK(this.baseline.K0);
        }
        if (this.baseline.theta) {
            this.sim.writeTheta(this.baseline.theta);
        }
        if (this.baseline.omega) {
            this.sim.writeOmega(this.baseline.omega);
            this.sim.storeOmega(this.baseline.omega);
        }
    }

    _startK(K) {
        this.current = {
            K,
            localMeanR: [],
            chi: [],
            trainNRMSE: Infinity,
            testNRMSE: Infinity,
        };
        this.stats.reset();
        if (this.setK) {
            this.setK(K);
        }
        this.resetSimulation();
        this.reservoir.setTask(this.snapshot?.rcTask ?? 'sine');
        this.reservoir.setHistoryLength(this.snapshot?.rcHistoryLength ?? 20);
        this.reservoir.setFeatureBudget(this.snapshot?.rcMaxFeatures ?? 512);
        this.reservoir.configure(this.snapshot?.rcInputRegion ?? 'center', this.snapshot?.rcOutputRegion ?? 'random', this.snapshot?.rcInputStrength ?? 2.0);
        this.writeRCInputWeights();

        this.reservoir.warmupSteps = Math.max(this.reservoir.warmupSteps || 15, this.protocol.warmupSamples);
        this.reservoir.startTraining();
        this.phase = 'warmup_train';
        this.sampleInPhase = 0;
        this._emit();
    }

    _advancePhaseIfNeeded() {
        if (!this.active) return;
        if (this.cancelRequested) {
            void this._finish('canceled');
            return;
        }

        if (this.phase === 'warmup_train') {
            if (this.sampleInPhase >= (this.protocol.warmupSamples + this.protocol.trainSamples)) {
                this.current.trainNRMSE = this.reservoir.stopTraining();
                // Start test window
                this.reservoir.startInference();
                this.phase = 'test';
                this.sampleInPhase = 0;
                this._emit();
            }
            return;
        }

        if (this.phase === 'test') {
            if (this.sampleInPhase >= (this.protocol.warmupSamples + this.protocol.testSamples)) {
                this.reservoir.stopInference();
                this.current.testNRMSE = this.reservoir.computeTestNRMSE();
                const localStats = meanStd(this.current.localMeanR);
                const chiStats = meanStd(this.current.chi);
                const chiMax = this.current.chi.length ? Math.max(...this.current.chi) : 0;

                this.results.push({
                    K: this.current.K,
                    trainNRMSE: isFinite(this.current.trainNRMSE) ? this.current.trainNRMSE : Infinity,
                    testNRMSE: isFinite(this.current.testNRMSE) ? this.current.testNRMSE : Infinity,
                    localMeanR_mean: localStats.mean,
                    chi_mean: chiStats.mean,
                    chi_max: chiMax,
                });

                this.kIdx++;
                if (this.kIdx >= this.Ks.length) {
                    void this._finish('done');
                } else {
                    this._startK(this.Ks[this.kIdx]);
                }
            }
        }
    }

    async _finish(status) {
        this.active = false;
        this.phase = status;
        this.setInputSignal(0);
        await this.restoreBaseline();
        this._emit();
    }

    _emit() {
        if (!this.onUpdate) return;
        this.onUpdate({
            running: this.active,
            phase: this.phase,
            kIdx: this.kIdx,
            kTotal: this.Ks.length,
            K: this.current ? this.current.K : null,
            configHash: this.configHash,
            results: this.results,
        });
    }
}
