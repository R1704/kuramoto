/**
 * Legacy state entrypoint.
 *
 * Canonical defaults now live in src/app/defaultState.js.
 */
import { createInitialState as createAppInitialState } from '../app/defaultState.js';

function makeState() {
    const state = createAppInitialState();
    if (!Object.prototype.hasOwnProperty.call(state, 'layerParams')) {
        state.layerParams = null;
    }
    return state;
}

export const INITIAL_STATE = Object.freeze(makeState());

export function createInitialState() {
    return makeState();
}
