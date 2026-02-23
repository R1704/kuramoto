// Utilities to read/write a compact representation of important STATE fields to the URL
// so the app can be shared via link and restored exactly.
import { URL_STATE_DEFAULTS, URL_STATE_SCHEMA, alignUrlGridSize } from '../state/urlSchema.js';

const DEFAULTS = URL_STATE_DEFAULTS;
const SCHEMA = URL_STATE_SCHEMA;

function encodeArray(arr) {
    if (!Array.isArray(arr)) return '';
    return arr.map(v => Number(v).toString()).join(',');
}

function decodeArray(s) {
    if (!s) return [];
    return s.split(',').map(v => parseFloat(v));
}

export function loadStateFromURL(state) {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if ([...params.keys()].length === 0) return; // nothing to do

    for (const key of Object.keys(SCHEMA)) {
        if (!params.has(key)) continue;
        const type = SCHEMA[key];
        const raw = params.get(key);
        try {
            if (type === 'float') state[key] = parseFloat(raw);
            else if (type === 'int') state[key] = parseInt(raw);
            else if (type === 'bool') state[key] = (raw === '1' || raw === 'true');
            else if (type === 'str') state[key] = raw;
            else if (type === 'arrayFloat') state[key] = decodeArray(raw);
        } catch (e) {
            // ignore parse errors and leave default
        }
    }

    // Ensure arrays have expected length and defaults if missing
    if (!Array.isArray(state.kernelRingWidths) || state.kernelRingWidths.length < 5) {
        state.kernelRingWidths = (DEFAULTS.kernelRingWidths || []).slice();
    }
    if (!Array.isArray(state.kernelRingWeights) || state.kernelRingWeights.length < 5) {
        state.kernelRingWeights = (DEFAULTS.kernelRingWeights || []).slice();
    }

    // Align grid size to safe values
    if (state.gridSize) state.gridSize = alignUrlGridSize(state.gridSize);

}

export function updateURLFromState(state, replace = true) {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();

    for (const [key, type] of Object.entries(SCHEMA)) {
        const val = state[key];
        if (val === undefined) continue;
        // Only include when different from default to keep URLs shorter
        if (DEFAULTS[key] !== undefined) {
            const def = DEFAULTS[key];
            // For arrays, do a simple string compare
            if (Array.isArray(def) && Array.isArray(val) && encodeArray(def) === encodeArray(val)) continue;
            if (!Array.isArray(def) && def === val) continue;
        }

        if (type === 'float' || type === 'int' || type === 'str') {
            params.set(key, String(val));
        } else if (type === 'bool') {
            params.set(key, val ? '1' : '0');
        } else if (type === 'arrayFloat') {
            params.set(key, encodeArray(val));
        }
    }

    const qs = params.toString();
    const newUrl = window.location.pathname + (qs ? `?${qs}` : '');
    try {
        if (replace) window.history.replaceState({}, '', newUrl);
        else window.history.pushState({}, '', newUrl);
    } catch (e) {
        // ignore history errors in odd contexts
    }
}
