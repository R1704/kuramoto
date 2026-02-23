function clamp01(v) {
    return Math.min(1, Math.max(0, v));
}

function makeImpulseResponse(ctx, seconds = 6.0, decay = 2.8) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const ir = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < length; i++) {
            const t = i / length;
            const env = Math.pow(1.0 - t, decay);
            data[i] = (Math.random() * 2.0 - 1.0) * env;
        }
    }
    return ir;
}

const AUDIO_LAYER_PROFILES = Object.freeze({
    0: {
        name: 'Phase',
        outputTrim: 0.92,
        bellBusTrim: 1.0,
        bassBusTrim: 0.95,
        reverbScale: 1.0,
        panSpread: 1.0,
        bellGateAmbient: 0.010,
        bellGatePulse: 0.024,
        bellAmpAmbient: 0.075,
        bellAmpPulse: 0.095,
        bellAmpIntensity: 0.090,
        fmScaleAmbient: 390,
        fmScalePulse: 500,
        fmGradientWeight: 0.70,
        bassCoherenceWeight: 0.58,
        bassOrderWeight: 0.42,
        bassIntensityWeight: 0.08,
        bassLevelBase: 0.075,
        bassLevelIntensity: 0.130,
        bassPulseAmbient: 0.045,
        bassPulsePulse: 0.095,
        bassFilterBase: 920,
        bassFilterSpan: 800,
        bassFilterGrad: 70
    },
    1: {
        name: 'Velocity',
        outputTrim: 0.88,
        bellBusTrim: 1.12,
        bassBusTrim: 0.82,
        reverbScale: 0.82,
        panSpread: 1.05,
        bellGateAmbient: 0.018,
        bellGatePulse: 0.032,
        bellAmpAmbient: 0.090,
        bellAmpPulse: 0.115,
        bellAmpIntensity: 0.115,
        fmScaleAmbient: 470,
        fmScalePulse: 520,
        fmGradientWeight: 0.95,
        bassCoherenceWeight: 0.40,
        bassOrderWeight: 0.28,
        bassIntensityWeight: 0.22,
        bassLevelBase: 0.060,
        bassLevelIntensity: 0.110,
        bassPulseAmbient: 0.060,
        bassPulsePulse: 0.120,
        bassFilterBase: 1040,
        bassFilterSpan: 740,
        bassFilterGrad: 110
    },
    2: {
        name: 'Curvature',
        outputTrim: 0.86,
        bellBusTrim: 1.15,
        bassBusTrim: 0.78,
        reverbScale: 0.78,
        panSpread: 1.0,
        bellGateAmbient: 0.020,
        bellGatePulse: 0.036,
        bellAmpAmbient: 0.094,
        bellAmpPulse: 0.118,
        bellAmpIntensity: 0.120,
        fmScaleAmbient: 500,
        fmScalePulse: 520,
        fmGradientWeight: 1.00,
        bassCoherenceWeight: 0.35,
        bassOrderWeight: 0.24,
        bassIntensityWeight: 0.24,
        bassLevelBase: 0.055,
        bassLevelIntensity: 0.105,
        bassPulseAmbient: 0.070,
        bassPulsePulse: 0.135,
        bassFilterBase: 1100,
        bassFilterSpan: 760,
        bassFilterGrad: 120
    },
    3: {
        name: 'Order',
        outputTrim: 0.90,
        bellBusTrim: 0.92,
        bassBusTrim: 1.10,
        reverbScale: 1.08,
        panSpread: 0.92,
        bellGateAmbient: 0.006,
        bellGatePulse: 0.020,
        bellAmpAmbient: 0.070,
        bellAmpPulse: 0.088,
        bellAmpIntensity: 0.080,
        fmScaleAmbient: 330,
        fmScalePulse: 420,
        fmGradientWeight: 0.55,
        bassCoherenceWeight: 0.66,
        bassOrderWeight: 0.56,
        bassIntensityWeight: 0.05,
        bassLevelBase: 0.090,
        bassLevelIntensity: 0.145,
        bassPulseAmbient: 0.035,
        bassPulsePulse: 0.080,
        bassFilterBase: 860,
        bassFilterSpan: 760,
        bassFilterGrad: 60
    },
    4: {
        name: 'Chirality',
        outputTrim: 0.90,
        bellBusTrim: 1.05,
        bassBusTrim: 0.88,
        reverbScale: 0.90,
        panSpread: 1.35,
        bellGateAmbient: 0.014,
        bellGatePulse: 0.030,
        bellAmpAmbient: 0.084,
        bellAmpPulse: 0.108,
        bellAmpIntensity: 0.100,
        fmScaleAmbient: 430,
        fmScalePulse: 520,
        fmGradientWeight: 0.82,
        bassCoherenceWeight: 0.48,
        bassOrderWeight: 0.32,
        bassIntensityWeight: 0.16,
        bassLevelBase: 0.070,
        bassLevelIntensity: 0.120,
        bassPulseAmbient: 0.055,
        bassPulsePulse: 0.110,
        bassFilterBase: 980,
        bassFilterSpan: 780,
        bassFilterGrad: 85
    },
    5: {
        name: 'Phase+Gradient',
        outputTrim: 0.91,
        bellBusTrim: 1.0,
        bassBusTrim: 0.94,
        reverbScale: 0.96,
        panSpread: 1.02,
        bellGateAmbient: 0.012,
        bellGatePulse: 0.026,
        bellAmpAmbient: 0.080,
        bellAmpPulse: 0.100,
        bellAmpIntensity: 0.095,
        fmScaleAmbient: 410,
        fmScalePulse: 500,
        fmGradientWeight: 0.80,
        bassCoherenceWeight: 0.54,
        bassOrderWeight: 0.36,
        bassIntensityWeight: 0.12,
        bassLevelBase: 0.078,
        bassLevelIntensity: 0.130,
        bassPulseAmbient: 0.050,
        bassPulsePulse: 0.100,
        bassFilterBase: 940,
        bassFilterSpan: 800,
        bassFilterGrad: 80
    },
    6: {
        name: 'Image Texture',
        outputTrim: 0.84,
        bellBusTrim: 0.86,
        bassBusTrim: 0.78,
        reverbScale: 1.25,
        panSpread: 0.86,
        bellGateAmbient: 0.008,
        bellGatePulse: 0.022,
        bellAmpAmbient: 0.068,
        bellAmpPulse: 0.086,
        bellAmpIntensity: 0.072,
        fmScaleAmbient: 290,
        fmScalePulse: 380,
        fmGradientWeight: 0.48,
        bassCoherenceWeight: 0.52,
        bassOrderWeight: 0.40,
        bassIntensityWeight: 0.04,
        bassLevelBase: 0.060,
        bassLevelIntensity: 0.100,
        bassPulseAmbient: 0.032,
        bassPulsePulse: 0.072,
        bassFilterBase: 780,
        bassFilterSpan: 640,
        bassFilterGrad: 55
    },
    7: {
        name: 'Gauge Flux',
        outputTrim: 0.87,
        bellBusTrim: 1.12,
        bassBusTrim: 0.84,
        reverbScale: 0.90,
        panSpread: 1.12,
        bellGateAmbient: 0.016,
        bellGatePulse: 0.032,
        bellAmpAmbient: 0.092,
        bellAmpPulse: 0.114,
        bellAmpIntensity: 0.110,
        fmScaleAmbient: 500,
        fmScalePulse: 520,
        fmGradientWeight: 0.96,
        bassCoherenceWeight: 0.42,
        bassOrderWeight: 0.30,
        bassIntensityWeight: 0.20,
        bassLevelBase: 0.062,
        bassLevelIntensity: 0.115,
        bassPulseAmbient: 0.065,
        bassPulsePulse: 0.125,
        bassFilterBase: 1080,
        bassFilterSpan: 760,
        bassFilterGrad: 115
    },
    8: {
        name: 'Covariant Gradient',
        outputTrim: 0.86,
        bellBusTrim: 1.16,
        bassBusTrim: 0.82,
        reverbScale: 0.84,
        panSpread: 1.15,
        bellGateAmbient: 0.018,
        bellGatePulse: 0.034,
        bellAmpAmbient: 0.094,
        bellAmpPulse: 0.118,
        bellAmpIntensity: 0.120,
        fmScaleAmbient: 520,
        fmScalePulse: 520,
        fmGradientWeight: 1.00,
        bassCoherenceWeight: 0.40,
        bassOrderWeight: 0.28,
        bassIntensityWeight: 0.22,
        bassLevelBase: 0.060,
        bassLevelIntensity: 0.110,
        bassPulseAmbient: 0.070,
        bassPulsePulse: 0.135,
        bassFilterBase: 1120,
        bassFilterSpan: 760,
        bassFilterGrad: 125
    },
    9: {
        name: 'Prismatic Style',
        outputTrim: 0.95,
        bellBusTrim: 1.06,
        bassBusTrim: 1.00,
        reverbScale: 1.12,
        panSpread: 1.0,
        bellGateAmbient: 0.008,
        bellGatePulse: 0.022,
        bellAmpAmbient: 0.082,
        bellAmpPulse: 0.102,
        bellAmpIntensity: 0.095,
        fmScaleAmbient: 420,
        fmScalePulse: 520,
        fmGradientWeight: 0.74,
        bassCoherenceWeight: 0.58,
        bassOrderWeight: 0.44,
        bassIntensityWeight: 0.10,
        bassLevelBase: 0.085,
        bassLevelIntensity: 0.140,
        bassPulseAmbient: 0.048,
        bassPulsePulse: 0.100,
        bassFilterBase: 900,
        bassFilterSpan: 820,
        bassFilterGrad: 80
    }
});

function getAudioProfile(colormap) {
    const idx = Math.max(0, Math.min(9, Math.round(colormap ?? 0)));
    return AUDIO_LAYER_PROFILES[idx] || AUDIO_LAYER_PROFILES[0];
}

export class EmpyreanAudioEngine {
    constructor() {
        this.ctx = null;
        this.ready = false;
        this.running = false;
        this.lastUpdateMs = 0;
        this.lastReverbTime = 0;

        this.masterGain = null;
        this.dryGain = null;
        this.wetGain = null;
        this.reverb = null;
        this.delay = null;
        this.compressor = null;
        this.bassFilter = null;
        this.bassBus = null;
        this.bellBus = null;

        this.bassVoices = [];
        this.bellVoices = [];
        this.bellScaleHz = [130.81, 155.56, 196.0, 233.08, 261.63, 311.13, 392.0, 523.25];
    }

    async ensureStarted() {
        if (this.ready) return;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) throw new Error('WebAudio is not supported in this browser.');

        this.ctx = new Ctx({ latencyHint: 'interactive' });
        if (this.ctx.state !== 'running') {
            await this.ctx.resume();
        }

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.0;
        this.dryGain = this.ctx.createGain();
        this.wetGain = this.ctx.createGain();
        this.reverb = this.ctx.createConvolver();
        this.delay = this.ctx.createDelay(1.0);
        this.compressor = this.ctx.createDynamicsCompressor();
        this.bassFilter = this.ctx.createBiquadFilter();
        this.bassBus = this.ctx.createGain();
        this.bellBus = this.ctx.createGain();

        this.delay.delayTime.value = 0.18;
        this.bassFilter.type = 'lowpass';
        this.bassFilter.frequency.value = 180;
        this.bassFilter.Q.value = 0.7;
        this.bassBus.gain.value = 0.0;
        this.bellBus.gain.value = 0.0;
        this.compressor.threshold.value = -20;
        this.compressor.knee.value = 24;
        this.compressor.ratio.value = 6;
        this.compressor.attack.value = 0.01;
        this.compressor.release.value = 0.22;

        this.bellBus.connect(this.dryGain);
        this.bellBus.connect(this.delay);
        this.delay.connect(this.reverb);
        this.reverb.connect(this.wetGain);

        this.bassBus.connect(this.bassFilter);
        this.bassFilter.connect(this.dryGain);

        this.dryGain.connect(this.masterGain);
        this.wetGain.connect(this.masterGain);
        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);

        this.reverb.buffer = makeImpulseResponse(this.ctx, 8.0, 2.8);
        this.lastReverbTime = 8.0;

        const bassBase = 32.70;
        [0.5, 1.0].forEach((mult) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = bassBase * mult;
            gain.gain.value = 0.0;
            osc.connect(gain);
            gain.connect(this.bassBus);
            osc.start();
            this.bassVoices.push({ osc, gain });
        });

        this.bellScaleHz.forEach((freq) => {
            const carrier = this.ctx.createOscillator();
            const mod = this.ctx.createOscillator();
            const modGain = this.ctx.createGain();
            const gain = this.ctx.createGain();
            const pan = this.ctx.createStereoPanner();

            carrier.type = 'sine';
            mod.type = 'sine';
            carrier.frequency.value = freq;
            mod.frequency.value = freq * 3.0;
            modGain.gain.value = 0.0;
            gain.gain.value = 0.0;
            pan.pan.value = 0.0;

            mod.connect(modGain);
            modGain.connect(carrier.frequency);
            carrier.connect(gain);
            gain.connect(pan);
            pan.connect(this.bellBus);

            carrier.start();
            mod.start();
            this.bellVoices.push({ carrier, mod, modGain, gain, pan, baseFreq: freq });
        });

        this.ready = true;
    }

    isRunning() {
        return this.running;
    }

    async setRunning(next) {
        const shouldRun = !!next;
        if (shouldRun && !this.ready) {
            await this.ensureStarted();
        }
        this.running = shouldRun;
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        if (!this.running) {
            this.masterGain.gain.setTargetAtTime(0.0, now, 0.12);
            this.bassBus.gain.setTargetAtTime(0.0, now, 0.12);
            this.bellBus.gain.setTargetAtTime(0.0, now, 0.12);
        }
    }

    async toggleRunning() {
        await this.setRunning(!this.running);
        return this.running;
    }

    update(metrics, state) {
        if (!this.ready || !this.ctx || !this.running) return;
        const nowMs = performance.now();
        if ((nowMs - this.lastUpdateMs) < 24) return;
        this.lastUpdateMs = nowMs;

        const now = this.ctx.currentTime;
        const enabled = !!state?.audioEmpyreanEnabled
            && (state?.manifoldMode === 's1')
            && (state?.topologyMode === 'grid');
        const coherenceLocked = state?.audioCoherenceLock !== false;
        const styleVisible = (state?.colormap === 9) && !!state?.prismaticStyleEnabled;
        const sourceAllowed = !coherenceLocked || styleVisible || (state?.colormap !== 9);
        if (!enabled) {
            this.masterGain.gain.setTargetAtTime(0.0, now, 0.08);
            this.bassBus.gain.setTargetAtTime(0.0, now, 0.08);
            this.bellBus.gain.setTargetAtTime(0.0, now, 0.08);
            return;
        }
        if (!sourceAllowed) {
            this.masterGain.gain.setTargetAtTime(0.0, now, 0.08);
            this.bassBus.gain.setTargetAtTime(0.0, now, 0.08);
            this.bellBus.gain.setTargetAtTime(0.0, now, 0.08);
            return;
        }

        const profile = getAudioProfile(state?.colormap);
        const master = clamp01(state?.audioEmpyreanMaster ?? 0.55);
        const bellsAmt = clamp01(state?.audioEmpyreanBells ?? 0.45);
        const bassAmt = clamp01(state?.audioEmpyreanBass ?? 0.5);
        const reverbMix = clamp01(state?.audioEmpyreanReverbMix ?? 0.45);
        const shapedReverbMix = clamp01(reverbMix * profile.reverbScale);
        const reverbTime = Math.max(1.0, Math.min(20.0, state?.audioEmpyreanReverbTime ?? 8.0));
        const mode = state?.audioEmpyreanMode === 'pulse' ? 'pulse' : 'ambient';
        if (Math.abs(reverbTime - this.lastReverbTime) > 0.35) {
            this.reverb.buffer = makeImpulseResponse(this.ctx, reverbTime, 2.8);
            this.lastReverbTime = reverbTime;
        }

        this.masterGain.gain.setTargetAtTime(master * 0.92 * profile.outputTrim, now, 0.06);
        this.dryGain.gain.setTargetAtTime(1.0 - shapedReverbMix * 0.45, now, 0.08);
        this.wetGain.gain.setTargetAtTime(shapedReverbMix * 0.9, now, 0.08);
        this.bellBus.gain.setTargetAtTime(0.7 * bellsAmt * profile.bellBusTrim, now, 0.08);
        this.bassBus.gain.setTargetAtTime(0.85 * bassAmt * profile.bassBusTrim, now, 0.08);

        const orderR = clamp01(metrics?.R ?? 0);
        const intensity = clamp01(metrics?.intensity ?? 0);
        const coherence = clamp01(metrics?.coherence ?? (metrics?.layerOrder ?? orderR));
        const grad = clamp01(metrics?.layerGradient ?? metrics?.gradient ?? 0);
        const layerOrder = clamp01(metrics?.layerOrder ?? orderR);
        const pulseRate = mode === 'pulse' ? profile.bassPulsePulse : profile.bassPulseAmbient;
        const bassContour = clamp01(
            profile.bassCoherenceWeight * coherence
            + profile.bassOrderWeight * layerOrder
            + profile.bassIntensityWeight * intensity
        );
        const bassPulse = Math.abs(Math.sin(now * pulseRate * Math.max(0.15, bassContour * 1.8)));
        const bassLevel = (profile.bassLevelBase + profile.bassLevelIntensity * intensity) * bassContour * bassPulse;
        this.bassFilter.frequency.setTargetAtTime(
            profile.bassFilterBase - profile.bassFilterSpan * bassContour + profile.bassFilterGrad * (1.0 - grad),
            now,
            0.08
        );
        this.bassVoices.forEach(({ gain }) => {
            gain.gain.setTargetAtTime(bassLevel, now, 0.09);
        });

        const bins = metrics?.phaseBins || [];
        const pans = metrics?.phasePans || [];
        const voiceCount = this.bellVoices.length;
        for (let i = 0; i < voiceCount; i++) {
            const mass = clamp01(bins[i] ?? 0);
            const basePan = Math.max(-1.0, Math.min(1.0, pans[i] ?? (i / Math.max(1, voiceCount - 1)) * 2.0 - 1.0));
            const pan = Math.max(-1.0, Math.min(1.0, basePan * profile.panSpread));
            const gate = mode === 'pulse' ? profile.bellGatePulse : profile.bellGateAmbient;
            const ampScale = (mode === 'pulse' ? profile.bellAmpPulse : profile.bellAmpAmbient)
                + profile.bellAmpIntensity * intensity;
            const fmScale = mode === 'pulse' ? profile.fmScalePulse : profile.fmScaleAmbient;
            const amp = mass > gate ? Math.min(0.12, (mass - gate) * ampScale) : 0.0;
            const fmDepth = Math.min(520, mass * fmScale * (0.6 + profile.fmGradientWeight * grad));
            const voice = this.bellVoices[i];
            voice.gain.gain.setTargetAtTime(amp, now, 0.11);
            voice.modGain.gain.setTargetAtTime(fmDepth, now, 0.10);
            voice.pan.pan.setTargetAtTime(pan, now, 0.10);
        }
    }
}
