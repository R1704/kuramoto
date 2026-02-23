import { bindControls, bindZoomPan } from './bindings/controls.js';
import { bindKeyboard } from './bindings/keyboard.js';
import { updateDisplay, updateLayerTabs } from './view/updateDisplay.js';
import { updateManifoldVisibility, updatePatternOptions } from './view/manifoldVisibility.js';
import { loadExternalImage, toggleWebcam, captureVideoFrame } from './externalInput.js';
import { createElementAccessor } from './dom/getEl.js';

export class UIManager {
    constructor(state, callbacks) {
        this.state = state;
        this.cb = callbacks;
        this.elements = {};
        const dom = createElementAccessor();
        this.getEl = dom.getEl;
        this.clearElementCache = dom.clearElementCache;

        this.ruleDescriptions = [
            'Classic: dθ/dt = ω + K·sin(θⱼ - θᵢ)',
            'Coherence-gated: Coupling weakens in synchronized regions',
            'Curvature-aware: Stronger coupling at phase gradients',
            'Harmonics: Uses 2nd+3rd harmonics for multi-clusters',
            'Mexican-hat: Short excitation + long inhibition',
            'Delay-coupled: Uses delayed phase from past timesteps',
            'Lenia: G(K*θ) — growth function on kernel convolution'
        ];

        this.bindControls();
        this.bindKeyboard();
        this.bindZoomPan();
    }

    syncURL() {
        if (this.cb?.onURLSync) {
            this.cb.onURLSync();
        }
    }

    bindZoomPan() {
        bindZoomPan.call(this);
    }

    bindControls() {
        bindControls.call(this);
    }

    bindKeyboard() {
        bindKeyboard.call(this);
    }

    updateDisplay() {
        updateDisplay.call(this);
    }

    updateLayerTabs() {
        updateLayerTabs.call(this);
    }

    updateManifoldVisibility(manifoldId) {
        updateManifoldVisibility.call(this, manifoldId);
    }

    updatePatternOptions(manifoldId) {
        updatePatternOptions.call(this, manifoldId);
    }

    loadExternalImage(img) {
        loadExternalImage.call(this, img);
    }

    toggleWebcam() {
        toggleWebcam.call(this);
    }

    captureVideoFrame() {
        captureVideoFrame.call(this);
    }
}
