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

function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function readMean(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    return Number.isFinite(value?.mean) ? value.mean : 0;
}

function readMaybe(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    return Number.isFinite(value?.mean) ? value.mean : null;
}

/**
 * Area-and-coherence-weighted circular spread of per-organism mean phases.
 * 0 = every organism sits at one shared phase (a single global domain),
 * 1 = organism phases are spread/balanced around the circle (distinct domains).
 * Organisms without phase data (no theta readback) are skipped; returns null
 * when nothing usable remains, so callers can fall back or re-weight.
 */
export function computeOrganismPhaseStats(structures) {
    if (!Array.isArray(structures) || structures.length === 0) return null;
    let wSum = 0;
    let x = 0;
    let y = 0;
    let coherentCount = 0;
    for (const s of structures) {
        if (!Number.isFinite(s?.meanPhase) || !Number.isFinite(s?.phaseR)) continue;
        const w = Math.max(0, s.area || 0) * Math.max(0, s.phaseR);
        if (w <= 0) continue;
        wSum += w;
        x += w * Math.cos(s.meanPhase);
        y += w * Math.sin(s.meanPhase);
        coherentCount++;
    }
    if (wSum <= 0 || coherentCount === 0) return null;
    return {
        phaseDiversity: 1 - Math.hypot(x, y) / wSum,
        coherentCount,
    };
}

/**
 * Viability re-target (standing fault #5): the old score rewarded persistence +
 * coherence + largest-region, which is maximized by the trivial globally
 * synchronized blob. This version rewards what the model is *for* — several
 * persistent organisms, each internally coherent, holding DISTINCT phases —
 * and explicitly discounts the uniform-sync fixed point. Temporal variability
 * (metastability) earns score when time-series data exists; missing inputs
 * drop out of the weighting instead of silently counting as zero.
 */
export function computeNcaViability(metrics) {
    const ruleMode = Number(metrics?.ruleMode ?? 0);
    if (ruleMode !== 7) {
        return { score: 0, regime: 'not_nca' };
    }

    const gridSize = Math.max(1, Number(metrics?.gridSize ?? 1));
    const cells = gridSize * gridSize;
    const matterMean = readMean(metrics?.matterMean);
    const matterMass = readMaybe(metrics?.matterMass);
    const livingCoherence = readMean(metrics?.livingCoherenceMean);
    const globalR = readMaybe(metrics?.globalR);
    const globalRStd = readMaybe(metrics?.globalRStd);
    const organismCount = readMean(metrics?.organismCount);
    const largestArea = readMean(metrics?.largestOrganismArea);
    const meanPersistence = readMaybe(metrics?.meanTrackPersistence);
    const phaseDiversity = readMaybe(metrics?.phaseDiversity);

    // Soft saturation x/(x+k): reaches 0.5 at k, stays strictly increasing —
    // hard clamps made every healthy multi-domain regime score exactly 1.0,
    // so sweeps could separate regimes but never rank within them.
    const soft = (x, k) => {
        const v = Math.max(0, x);
        return v / (v + k);
    };

    // Matter: alive but not overgrown.
    const matterPresent = clamp01((matterMean - 0.002) / 0.04);
    const overgrowthPenalty = 1 - clamp01((matterMean - 0.32) / 0.25);
    const matterScore = matterPresent * overgrowthPenalty;

    // Structure: several organisms, none owning the living mass outright.
    const countScore = soft(organismCount - 1, 9);
    const livingMass = matterMass !== null && matterMass > 0 ? matterMass : cells * Math.max(matterMean, 1e-6);
    const dominance = clamp01(largestArea / Math.max(1, livingMass));
    const dominancePenalty = 1 - clamp01((dominance - 0.5) / 0.5);
    const persistenceScore = meanPersistence !== null ? soft(meanPersistence, 20) : null;
    const structureScore = (persistenceScore !== null
        ? 0.7 * countScore + 0.3 * persistenceScore
        : countScore) * dominancePenalty;

    // Phase: locally coherent AND globally diverse — the binding signature.
    // Both factors enter directly (they live in [0,1] already) so differences
    // inside healthy regimes keep ranking. Fallback when no per-organism
    // phases exist: the localR-vs-globalR gap (high local order with low
    // global order = multiple domains).
    const coherenceScore = clamp01(livingCoherence);
    let diversity = phaseDiversity;
    if (diversity === null && globalR !== null) {
        diversity = clamp01((livingCoherence - globalR) / 0.5);
    }
    const phaseScore = diversity !== null
        ? coherenceScore * clamp01(diversity)
        : coherenceScore * 0.25;

    // Dynamism: metastability band — frozen (std~0) and noise-dominated both lose.
    const dynamismScore = globalRStd !== null
        ? clamp01(globalRStd / 0.01) * (1 - clamp01((globalRStd - 0.15) / 0.25))
        : null;

    const parts = [
        [0.25, matterScore],
        [0.30, structureScore],
        [0.30, phaseScore],
        [0.15, dynamismScore],
    ].filter(([, v]) => v !== null);
    let weightTotal = 0;
    let weighted = 0;
    for (const [w, v] of parts) {
        weightTotal += w;
        weighted += w * v;
    }
    let score = clamp01(weightTotal > 0 ? weighted / weightTotal : 0);

    // The trivial attractor: all living matter locked to one phase.
    const uniformSync = diversity !== null && diversity < 0.1 && livingCoherence > 0.8;
    if (uniformSync) score *= 0.5;

    let regime = 'transitional';
    if (matterMean < 0.002) {
        regime = 'extinct';
    } else if (matterMean > 0.55) {
        regime = 'overgrown';
    } else if (uniformSync) {
        regime = 'uniform_sync';
    } else if (organismCount >= 2 && diversity !== null && diversity >= 0.35 && structureScore > 0.3) {
        regime = 'multi_domain';
    } else if (organismCount >= 1 && (meanPersistence ?? 0) >= 8) {
        regime = 'coherent_organism';
    } else if (score < 0.25) {
        regime = 'inert';
    } else if (matterScore > 0.4 && coherenceScore > 0.4) {
        regime = 'coherent_matter';
    }

    return { score, regime };
}

export class ExperimentRunner {
    constructor({ device, sim, stats, getState, getOrganisms, onUpdate }) {
        this.device = device;
        this.sim = sim;
        this.stats = stats;
        this.getState = getState;
        this.getOrganisms = getOrganisms;
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
            matterMean: [],
            matterMass: [],
            livingCoherenceMean: [],
            organismCount: [],
            largestOrganismArea: [],
            meanTrackPersistence: [],
            phaseDiversity: [],
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
        this.sim.processReadback().then(async result => {
            if (!result) return;
            if (!this.stats) return;

            this.stats.update(result.cos, result.sin, result.localStats);

            const stepRel = this.pendingSampleStepRel;
            if (stepRel !== null && stepRel !== undefined && stepRel >= 1 && stepRel <= this.protocol.measureSteps) {
                const matter = await this._sampleMatterMetrics();
                const organisms = this._sampleOrganismMetrics();
                this.samples.step.push(stepRel);
                this.samples.globalR.push(result.R);
                this.samples.localMeanR.push(result.localStats?.meanR ?? 0);
                this.samples.chi.push(this.stats.chi);
                this.samples.gradient.push(result.localStats?.gradient ?? 0);
                this.samples.syncFraction.push(result.localStats?.syncFraction ?? 0);
                this.samples.matterMean.push(matter.mean);
                this.samples.matterMass.push(matter.mass);
                this.samples.livingCoherenceMean.push(organisms.livingCoherence ?? result.localStats?.meanR ?? 0);
                this.samples.organismCount.push(organisms.count);
                this.samples.largestOrganismArea.push(organisms.largestArea);
                this.samples.meanTrackPersistence.push(organisms.meanPersistence);
                if (Number.isFinite(organisms.phaseDiversity)) {
                    this.samples.phaseDiversity.push(organisms.phaseDiversity);
                }
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
                matterMean: downsample(this.samples.matterMean),
                matterMass: downsample(this.samples.matterMass),
                livingCoherenceMean: downsample(this.samples.livingCoherenceMean),
                organismCount: downsample(this.samples.organismCount),
                largestOrganismArea: downsample(this.samples.largestOrganismArea),
                meanTrackPersistence: downsample(this.samples.meanTrackPersistence),
                phaseDiversity: downsample(this.samples.phaseDiversity),
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
        const matterMean = meanStd(this.samples.matterMean);
        const matterMass = meanStd(this.samples.matterMass);
        const livingCoherenceMean = meanStd(this.samples.livingCoherenceMean);
        const organismCount = meanStd(this.samples.organismCount);
        const largestOrganismArea = meanStd(this.samples.largestOrganismArea);
        const meanTrackPersistence = meanStd(this.samples.meanTrackPersistence);
        const chiMax = this.samples.chi.length ? Math.max(...this.samples.chi) : 0;
        const chiMean = meanStd(this.samples.chi).mean;
        const phaseDiversity = this.samples.phaseDiversity.length ? meanStd(this.samples.phaseDiversity) : null;
        const state = this.getState?.() || this.snapshot || {};
        const viability = computeNcaViability({
            ruleMode: state.ruleMode,
            gridSize: this.sim?.gridSize || state.gridSize,
            matterMean,
            matterMass,
            livingCoherenceMean,
            globalR,
            globalRStd: globalR.std,
            organismCount,
            largestOrganismArea,
            meanTrackPersistence,
            phaseDiversity,
        });

        this.summary = {
            samples: this.samples.globalR.length,
            globalR_mean: globalR.mean,
            globalR_std: globalR.std,
            localMeanR_mean: localMeanR.mean,
            localMeanR_std: localMeanR.std,
            gradient_mean: gradient.mean,
            syncFraction_mean: syncFraction.mean,
            matterMean_mean: matterMean.mean,
            matterMass_mean: matterMass.mean,
            livingCoherenceMean_mean: livingCoherenceMean.mean,
            organismCount_mean: organismCount.mean,
            largestOrganismArea_mean: largestOrganismArea.mean,
            meanTrackPersistence_mean: meanTrackPersistence.mean,
            phaseDiversity_mean: phaseDiversity ? phaseDiversity.mean : null,
            ncaViabilityScore: viability.score,
            ncaRegime: viability.regime,
            chi_mean: chiMean,
            chi_max: chiMax,
        };

        this._emit();
    }

    async _sampleMatterMetrics() {
        const state = this.getState?.() || {};
        if (state.ruleMode !== 7 || !this.sim?.readMatterField) {
            return { mean: 0, mass: 0 };
        }
        const data = await this.sim.readMatterField();
        if (!data || data.length === 0) {
            return { mean: 0, mass: 0 };
        }
        const grid = this.sim.gridSize || 1;
        const layerSize = grid * grid;
        const layer = Math.min(Math.max(0, Math.floor(state.activeLayer ?? 0)), Math.max(0, (this.sim.layers || 1) - 1));
        const start = layer * layerSize;
        const end = Math.min(start + layerSize, data.length);
        let sum = 0;
        for (let i = start; i < end; i++) {
            const v = Number.isFinite(data[i]) ? data[i] : 0;
            sum += Math.max(0, Math.min(1, v));
        }
        const count = Math.max(1, end - start);
        return { mean: sum / count, mass: sum };
    }

    _sampleOrganismMetrics() {
        const organisms = this.getOrganisms?.();
        const structures = organisms?.structures || [];
        const tracks = organisms?.tracks || [];
        let largestArea = 0;
        let areaSum = 0;
        let weightedR = 0;
        for (const s of structures) {
            const area = Math.max(0, s?.area || 0);
            largestArea = Math.max(largestArea, area);
            areaSum += area;
            weightedR += area * (s?.meanR || 0);
        }
        let persistenceSum = 0;
        for (const t of tracks) {
            persistenceSum += Array.isArray(t?.history) ? t.history.length : 0;
        }
        const phaseStats = computeOrganismPhaseStats(structures);
        return {
            count: Number.isFinite(organisms?.count) ? organisms.count : tracks.length,
            largestArea,
            meanPersistence: tracks.length ? persistenceSum / tracks.length : 0,
            livingCoherence: areaSum > 0 ? weightedR / areaSum : null,
            phaseDiversity: phaseStats ? phaseStats.phaseDiversity : null,
        };
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
        this.reservoir.configure(
            this.snapshot?.rcInputRegion ?? 'center',
            this.snapshot?.rcOutputRegion ?? 'random',
            this.snapshot?.rcInputStrength ?? 2.0,
            this.snapshot?.rcInputWidth ?? 0.1,
            this.snapshot?.rcOutputWidth ?? 0.1
        );
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

export class RCInjectionModeCompareRunner {
    constructor({ device, sim, stats, reservoir, writeRCInputWeights, setInputSignal, getActiveLayerTheta, setInjectionMode, resetSimulation, onUpdate }) {
        this.device = device;
        this.sim = sim;
        this.stats = stats;
        this.reservoir = reservoir;
        this.writeRCInputWeights = writeRCInputWeights;
        this.setInputSignal = setInputSignal;
        this.getActiveLayerTheta = getActiveLayerTheta;
        this.setInjectionMode = setInjectionMode;
        this.resetSimulation = resetSimulation;
        this.onUpdate = onUpdate;

        this.active = false;
        this.cancelRequested = false;

        this.protocol = null;
        this.snapshot = null;
        this.configHash = null;

        this.modes = ['freq_mod', 'phase_drive', 'coupling_mod'];
        this.modeIdx = 0;
        this.mode = null;
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
            warmupSamples: Math.max(0, Math.floor(protocol.warmupSamples ?? 30)),
            trainSamples: Math.max(1, Math.floor(protocol.trainSamples ?? 300)),
            testSamples: Math.max(1, Math.floor(protocol.testSamples ?? 200)),
            statsEvery: Math.max(1, Math.floor(protocol.statsEvery ?? 4)),
        };

        this.snapshot = stateSnapshot;
        const hashStr = stableStringify({ state: stateSnapshot, protocol: this.protocol, type: 'rc_injection_mode_compare' });
        this.configHash = fnv1a32(hashStr).toString(16).padStart(8, '0');

        const baselineTheta = await this.sim.readTheta();
        const baselineOmega = this.sim.getOmega() ? new Float32Array(this.sim.getOmega()) : null;
        this.baseline = {
            theta: baselineTheta ? new Float32Array(baselineTheta) : null,
            omega: baselineOmega,
            injectionMode: stateSnapshot?.rcInjectionMode,
            K0: stateSnapshot?.K0,
        };

        this.cancelRequested = false;
        this.results = [];
        this.modeIdx = 0;
        this.mode = null;
        this.phase = 'initializing';
        this.sampleInPhase = 0;

        this.active = true;
        this._startMode(this.modes[this.modeIdx]);
        this._emit();
        return true;
    }

    cancel() {
        if (!this.active) return;
        this.cancelRequested = true;
    }

    encodeSteps(encoder, delaySteps, globalCoupling) {
        if (!this.active) return;

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
                if (!result) return;
                this.stats.update(result.cos, result.sin, result.localStats);
                if (this.phase === 'test' && this.current) {
                    if (this.sampleInPhase > this.protocol.warmupSamples) {
                        this.current.localMeanR.push(result.localStats?.meanR ?? 0);
                        this.current.chi.push(this.stats.chi);
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
            type: 'rc_injection_mode_compare',
            timestamp: new Date().toISOString(),
            configHash: this.configHash,
            url: (typeof window !== 'undefined') ? window.location.href : null,
            state: this.snapshot,
            protocol: this.protocol,
            results: this.results,
        };
    }

    exportCSV() {
        let csv = 'mode,trainNRMSE,testNRMSE,localMeanR_mean,chi_mean,chi_max\n';
        for (const r of this.results) {
            csv += `${r.mode},${r.trainNRMSE.toFixed(6)},${r.testNRMSE.toFixed(6)},${r.localMeanR_mean.toFixed(6)},${r.chi_mean.toFixed(6)},${r.chi_max.toFixed(6)}\n`;
        }
        return csv;
    }

    async restoreBaseline() {
        if (!this.baseline) return;
        if (this.baseline.theta) {
            this.sim.writeTheta(this.baseline.theta);
        }
        if (this.baseline.omega) {
            this.sim.writeOmega(this.baseline.omega);
            this.sim.storeOmega(this.baseline.omega);
        }
        if (this.setInjectionMode && this.baseline.injectionMode) {
            this.setInjectionMode(this.baseline.injectionMode);
        }
    }

    _startMode(mode) {
        this.mode = mode;
        this.current = {
            mode,
            localMeanR: [],
            chi: [],
            trainNRMSE: Infinity,
            testNRMSE: Infinity,
        };

        this.stats.reset();
        this.resetSimulation();
        if (this.setInjectionMode) {
            this.setInjectionMode(mode);
        }

        this.reservoir.setTask(this.snapshot?.rcTask ?? 'sine');
        this.reservoir.setHistoryLength(this.snapshot?.rcHistoryLength ?? 20);
        this.reservoir.setFeatureBudget(this.snapshot?.rcMaxFeatures ?? 512);
        this.reservoir.configure(
            this.snapshot?.rcInputRegion ?? 'center',
            this.snapshot?.rcOutputRegion ?? 'random',
            this.snapshot?.rcInputStrength ?? 2.0,
            this.snapshot?.rcInputWidth ?? 0.1,
            this.snapshot?.rcOutputWidth ?? 0.1
        );
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
                this.reservoir.warmupSteps = Math.max(this.reservoir.warmupSteps || 15, this.protocol.warmupSamples);
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
                    mode: this.current.mode,
                    trainNRMSE: isFinite(this.current.trainNRMSE) ? this.current.trainNRMSE : Infinity,
                    testNRMSE: isFinite(this.current.testNRMSE) ? this.current.testNRMSE : Infinity,
                    localMeanR_mean: localStats.mean,
                    chi_mean: chiStats.mean,
                    chi_max: chiMax,
                });

                this.modeIdx++;
                if (this.modeIdx >= this.modes.length) {
                    void this._finish('done');
                } else {
                    // Restore baseline state before next mode for strict fairness
                    if (this.baseline && this.baseline.theta) {
                        this.sim.writeTheta(this.baseline.theta);
                    }
                    if (this.baseline && this.baseline.omega) {
                        this.sim.writeOmega(this.baseline.omega);
                        this.sim.storeOmega(this.baseline.omega);
                    }
                    this._startMode(this.modes[this.modeIdx]);
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
            mode: this.mode,
            modeIdx: this.modeIdx,
            modeTotal: this.modes.length,
            configHash: this.configHash,
            results: this.results,
        });
    }
}
