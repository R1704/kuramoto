const REQUIRED_CONTROL_IDS = [
    'canvas',
    'topology-select',
    'manifold-select',
    'data-layer-select',
    'pause-btn',
    'reset-btn',
    'randomize-btn',
    'view-2d-btn',
    'view-3d-btn'
];

const REQUIRED_CALLBACKS = [
    'onParamChange',
    'onPause',
    'onReset',
    'onRandomize',
    'onPreset',
    'onURLSync'
];

const REQUIRED_SIM_KEYS = [
    'pipeline',
    'paramsBuf',
    'gaugeParamsBuf',
    'interactionParamsBuf',
    'thetaTextures',
    'orderBuf'
];

export function runStartupSmokeChecks({ ui, sim }) {
    try {
        const missingControls = REQUIRED_CONTROL_IDS.filter((id) => !document.getElementById(id));
        if (missingControls.length) {
            console.warn('[smoke] missing controls:', missingControls.join(', '));
        }

        const missingCallbacks = REQUIRED_CALLBACKS.filter((key) => typeof ui?.cb?.[key] !== 'function');
        if (missingCallbacks.length) {
            console.warn('[smoke] missing callbacks:', missingCallbacks.join(', '));
        }

        const missingSim = REQUIRED_SIM_KEYS.filter((key) => !sim?.[key]);
        if (missingSim.length) {
            console.warn('[smoke] missing simulation resources:', missingSim.join(', '));
        }
    } catch (err) {
        console.warn('[smoke] startup checks failed:', err);
    }
}
