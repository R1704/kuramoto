import { updateURLFromState } from '../utils/index.js';

export function createStateAdapter(rawState) {
    return {
        get(key) {
            return rawState[key];
        },
        set(key, value) {
            rawState[key] = value;
            return value;
        },
        patch(updates) {
            Object.assign(rawState, updates);
            return rawState;
        },
        raw() {
            return rawState;
        },
        syncURL(replace = true) {
            updateURLFromState(rawState, replace);
        }
    };
}
