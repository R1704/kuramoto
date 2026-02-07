/**
 * State Module
 * 
 * Centralized state management for the Kuramoto simulation.
 * 
 * @example
 * import { getStateManager, INITIAL_STATE } from './state/index.js';
 * 
 * const state = getStateManager();
 * state.set('K0', 1.5);
 * 
 * const unsubscribe = state.subscribe('K0', (newVal, oldVal) => {
 *   console.log(`K0 changed from ${oldVal} to ${newVal}`);
 * });
 */

export { StateManager, getStateManager, setStateManager } from './StateManager.js';
export { INITIAL_STATE, createInitialState } from './initialState.js';
export {
    makeLayerParamsFromState,
    applyLayerParamsToState,
    syncStateToLayerParams,
    ensureLayerParams,
    normalizeSelectedLayers
} from './layerParams.js';
