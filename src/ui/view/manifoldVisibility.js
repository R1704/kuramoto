import { getManifold } from '../../manifolds/ManifoldRegistry.js';

function setDisabled(getEl, id, disabled) {
    const el = getEl(id);
    if (el) el.disabled = !!disabled;
}

function applyOptionVisibility(selectEl, allowedValues) {
    if (!selectEl) return;
    const allowed = new Set(allowedValues);
    Array.from(selectEl.options).forEach((opt) => {
        opt.hidden = !allowed.has(opt.value);
    });
}

export function updateManifoldVisibility(manifoldId) {
    const getEl = this.getEl || ((id) => document.getElementById(id));
    const manifold = getManifold(manifoldId || this.state?.manifoldMode || 's1');
    const features = manifold.features || {};

    setDisabled(getEl, 'rule-select', !features.ruleMode);
    setDisabled(getEl, 'harmonic-slider', !features.harmonics);
    setDisabled(getEl, 'harmonic3-slider', !features.harmonics);
    setDisabled(getEl, 'delay-slider', !features.delay);
    setDisabled(getEl, 'gauge-enabled-toggle', !features.ruleMode);
    setDisabled(getEl, 'rc-enabled', !features.reservoir);
    setDisabled(getEl, 'lle-start-btn', !features.lyapunov);
    setDisabled(getEl, 'lle-stop-btn', !features.lyapunov);
}

export function updatePatternOptions(manifoldId) {
    const getEl = this.getEl || ((id) => document.getElementById(id));
    const manifold = getManifold(manifoldId || this.state?.manifoldMode || 's1');

    const thetaSelect = getEl('theta-pattern-select');
    const omegaSelect = getEl('omega-pattern-select');

    applyOptionVisibility(thetaSelect, manifold.patterns || []);
    applyOptionVisibility(omegaSelect, manifold.omegaPatterns || []);

    if (thetaSelect && !(manifold.patterns || []).includes(thetaSelect.value)) {
        thetaSelect.value = manifold.patterns?.[0] || 'random';
    }
    if (omegaSelect && !(manifold.omegaPatterns || []).includes(omegaSelect.value)) {
        omegaSelect.value = manifold.omegaPatterns?.[0] || 'random';
    }

    if (this.state) {
        if (!(manifold.patterns || []).includes(this.state.thetaPattern)) {
            this.state.thetaPattern = thetaSelect?.value || manifold.patterns?.[0] || 'random';
        }
        if (!(manifold.omegaPatterns || []).includes(this.state.omegaPattern)) {
            this.state.omegaPattern = omegaSelect?.value || manifold.omegaPatterns?.[0] || 'random';
        }
    }
}
