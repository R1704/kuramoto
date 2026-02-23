function formatNumericValue(value, type) {
    if (!Number.isFinite(value)) return '';
    if (type === 'int') return `${Math.round(value)}`;
    return value.toFixed(2);
}

export function alignGridSize(size) {
    const aligned = Math.round(size / 64) * 64;
    return Math.max(64, Math.min(1024, aligned));
}

export function bindStateValue({
    getEl,
    elements,
    state,
    callbacks,
    id,
    key,
    type = 'float',
    evt = 'input',
    updateDisplay = null
}) {
    const el = getEl(id);
    if (!el) return;
    elements[key] = el;
    el.addEventListener(evt, () => {
        let val = type === 'int' ? parseInt(el.value, 10) : parseFloat(el.value);
        if (type === 'bool') val = !!el.checked;
        state[key] = val;
        const disp = getEl(id.replace('slider', 'value').replace('select', 'value'));
        if (disp) disp.textContent = type === 'bool' ? `${val}` : formatNumericValue(val, type);
        callbacks.onParamChange?.();
        if (updateDisplay) updateDisplay();
    });
}

export function bindToggle({
    getEl,
    state,
    callbacks,
    id,
    key,
    onChange = null,
    refreshDisplay = false,
    onParam = true
}) {
    const el = getEl(id);
    if (!el) return;
    el.addEventListener('change', () => {
        state[key] = !!el.checked;
        if (onParam) callbacks.onParamChange?.();
        if (onChange) onChange(state[key], el);
        if (refreshDisplay) callbacks.updateDisplay?.();
    });
}

export function bindSelect({
    getEl,
    state,
    callbacks,
    id,
    key,
    onChange = null,
    refreshDisplay = false,
    onParam = true
}) {
    const el = getEl(id);
    if (!el) return;
    el.addEventListener('change', () => {
        state[key] = el.value;
        if (onParam) callbacks.onParamChange?.();
        if (onChange) onChange(state[key], el);
        if (refreshDisplay) callbacks.updateDisplay?.();
    });
}

export function bindAction({ getEl, id, onClick }) {
    const el = getEl(id);
    if (!el) return;
    el.addEventListener('click', () => {
        onClick?.();
    });
}
