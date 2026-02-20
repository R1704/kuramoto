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

        const master = clamp01(state?.audioEmpyreanMaster ?? 0.55);
        const bellsAmt = clamp01(state?.audioEmpyreanBells ?? 0.45);
        const bassAmt = clamp01(state?.audioEmpyreanBass ?? 0.5);
        const reverbMix = clamp01(state?.audioEmpyreanReverbMix ?? 0.45);
        const reverbTime = Math.max(1.0, Math.min(20.0, state?.audioEmpyreanReverbTime ?? 8.0));
        const mode = state?.audioEmpyreanMode === 'pulse' ? 'pulse' : 'ambient';
        if (Math.abs(reverbTime - this.lastReverbTime) > 0.35) {
            this.reverb.buffer = makeImpulseResponse(this.ctx, reverbTime, 2.8);
            this.lastReverbTime = reverbTime;
        }

        this.masterGain.gain.setTargetAtTime(master * 0.92, now, 0.06);
        this.dryGain.gain.setTargetAtTime(1.0 - reverbMix * 0.45, now, 0.08);
        this.wetGain.gain.setTargetAtTime(reverbMix * 0.9, now, 0.08);
        this.bellBus.gain.setTargetAtTime(0.7 * bellsAmt, now, 0.08);
        this.bassBus.gain.setTargetAtTime(0.85 * bassAmt, now, 0.08);

        const orderR = clamp01(metrics?.R ?? 0);
        const intensity = clamp01(metrics?.intensity ?? 0);
        const coherence = clamp01(metrics?.coherence ?? (metrics?.layerOrder ?? orderR));
        const grad = clamp01(metrics?.layerGradient ?? metrics?.gradient ?? 0);
        const layerOrder = clamp01(metrics?.layerOrder ?? orderR);
        const pulseRate = mode === 'pulse' ? 0.09 : 0.04;
        const bassContour = clamp01(0.55 * coherence + 0.45 * layerOrder);
        const bassPulse = Math.abs(Math.sin(now * pulseRate * Math.max(0.15, bassContour * 1.8)));
        const bassLevel = (0.08 + 0.14 * intensity) * bassContour * bassPulse;
        this.bassFilter.frequency.setTargetAtTime(900 - 820 * bassContour + 80 * (1.0 - grad), now, 0.08);
        this.bassVoices.forEach(({ gain }) => {
            gain.gain.setTargetAtTime(bassLevel, now, 0.09);
        });

        const bins = metrics?.phaseBins || [];
        const pans = metrics?.phasePans || [];
        const voiceCount = this.bellVoices.length;
        for (let i = 0; i < voiceCount; i++) {
            const mass = clamp01(bins[i] ?? 0);
            const pan = Math.max(-1.0, Math.min(1.0, pans[i] ?? (i / Math.max(1, voiceCount - 1)) * 2.0 - 1.0));
            const gate = mode === 'pulse' ? 0.025 : 0.008;
            const ampScale = mode === 'pulse' ? (0.10 + 0.10 * intensity) : (0.08 + 0.09 * intensity);
            const fmScale = mode === 'pulse' ? 520 : 400;
            const amp = mass > gate ? Math.min(0.12, (mass - gate) * ampScale) : 0.0;
            const fmDepth = Math.min(520, mass * fmScale * (0.6 + 0.7 * grad));
            const voice = this.bellVoices[i];
            voice.gain.gain.setTargetAtTime(amp, now, 0.11);
            voice.modGain.gain.setTargetAtTime(fmDepth, now, 0.10);
            voice.pan.pan.setTargetAtTime(pan, now, 0.10);
        }
    }
}
