/**
 * StateManager
 * 
 * Centralized immutable state management with subscription pattern.
 * Replaces the scattered STATE object with a proper store.
 */

import { INITIAL_STATE, createInitialState } from './initialState.js';
import { 
    makeLayerParamsFromState, 
    applyLayerParamsToState, 
    syncStateToLayerParams,
    ensureLayerParams,
    normalizeSelectedLayers 
} from './layerParams.js';

export class StateManager {
    constructor() {
        this.state = createInitialState();
        this.subscribers = new Map();
        this.subId = 0;
        
        // Track batch updates
        this.batchDepth = 0;
        this.pendingChanges = new Set();
    }
    
    /**
     * Get current state (read-only clone for safety)
     * @returns {Object} Current state
     */
    get() {
        return this.state;
    }
    
    /**
     * Get a specific state value
     * @param {string} key - State key
     * @returns {*} State value
     */
    getValue(key) {
        return this.state[key];
    }
    
    /**
     * Set a state value
     * @param {string} key - State key
     * @param {*} value - New value
     * @param {boolean} notify - Whether to notify subscribers
     */
    set(key, value, notify = true) {
        const oldValue = this.state[key];
        this.state[key] = value;
        
        if (notify && oldValue !== value) {
            if (this.batchDepth > 0) {
                this.pendingChanges.add(key);
            } else {
                this._notify(key, value, oldValue);
            }
        }
    }
    
    /**
     * Set multiple state values at once
     * @param {Object} updates - Key-value pairs to update
     * @param {boolean} notify - Whether to notify subscribers
     */
    setMultiple(updates, notify = true) {
        const changed = [];
        
        for (const [key, value] of Object.entries(updates)) {
            const oldValue = this.state[key];
            this.state[key] = value;
            if (oldValue !== value) {
                changed.push({ key, value, oldValue });
            }
        }
        
        if (notify && changed.length > 0) {
            if (this.batchDepth > 0) {
                changed.forEach(c => this.pendingChanges.add(c.key));
            } else {
                changed.forEach(c => this._notify(c.key, c.value, c.oldValue));
            }
        }
    }
    
    /**
     * Batch multiple updates and notify once at the end
     * @param {Function} fn - Function to execute in batch context
     */
    batch(fn) {
        this.batchDepth++;
        try {
            fn();
        } finally {
            this.batchDepth--;
            if (this.batchDepth === 0 && this.pendingChanges.size > 0) {
                const changes = Array.from(this.pendingChanges);
                this.pendingChanges.clear();
                
                // Notify for each unique changed key
                changes.forEach(key => {
                    this._notify(key, this.state[key], undefined);
                });
            }
        }
    }
    
    /**
     * Subscribe to state changes
     * @param {string} key - State key to watch (or '*' for all)
     * @param {Function} callback - Callback(newValue, oldValue, key)
     * @returns {Function} Unsubscribe function
     */
    subscribe(key, callback) {
        const id = ++this.subId;
        
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, new Map());
        }
        
        this.subscribers.get(key).set(id, callback);
        
        return () => {
            const subs = this.subscribers.get(key);
            if (subs) {
                subs.delete(id);
                if (subs.size === 0) {
                    this.subscribers.delete(key);
                }
            }
        };
    }
    
    /**
     * Notify subscribers of a state change
     * @private
     */
    _notify(key, newValue, oldValue) {
        // Notify specific key subscribers
        const specificSubs = this.subscribers.get(key);
        if (specificSubs) {
            specificSubs.forEach(cb => {
                try {
                    cb(newValue, oldValue, key);
                } catch (e) {
                    console.error('State subscriber error:', e);
                }
            });
        }
        
        // Notify wildcard subscribers
        const wildcardSubs = this.subscribers.get('*');
        if (wildcardSubs) {
            wildcardSubs.forEach(cb => {
                try {
                    cb(newValue, oldValue, key);
                } catch (e) {
                    console.error('State wildcard subscriber error:', e);
                }
            });
        }
    }
    
    /**
     * Layer-specific: Apply layer parameters to state
     * @param {number} layerIdx - Layer index
     */
    applyLayerParams(layerIdx) {
        applyLayerParamsToState(this.state, layerIdx);
        this._notify('layerParamsApplied', layerIdx, null);
    }
    
    /**
     * Layer-specific: Sync state to layer parameters
     * @param {number|number[]} indices - Layer indices to sync
     */
    syncToLayerParams(indices) {
        syncStateToLayerParams(this.state, indices);
        this._notify('layerParamsSynced', indices, null);
    }
    
    /**
     * Layer-specific: Ensure layer params exist for count
     * @param {number} count - Target layer count
     */
    ensureLayerParams(count) {
        ensureLayerParams(this.state, count);
    }
    
    /**
     * Layer-specific: Normalize selected layers
     * @param {number} count - Total layer count
     */
    normalizeSelectedLayers(count) {
        normalizeSelectedLayers(this.state, count);
    }
    
    /**
     * Reset state to initial values
     * @param {Object} overrides - Optional overrides for initial state
     */
    reset(overrides = {}) {
        this.state = { ...createInitialState(), ...overrides };
        this._notify('reset', this.state, null);
    }
    
    /**
     * Export state for URL serialization
     * @returns {Object} Serializable state subset
     */
    exportForURL() {
        // Return only essential state that should persist in URL
        const essential = [
            'seed', 'dt', 'timeScale', 'K0', 'range', 'ruleMode',
            'harmonicA', 'harmonicB', 'sigma', 'sigma2', 'beta',
            'kernelShape', 'gridSize', 'layerCount', 'layerParams',
            'viewMode', 'manifoldMode', 'surfaceMode', 'thetaPattern',
            'omegaPattern', 'topologyMode', 'rcEnabled', 'rcTask',
            'showStatistics', 'sparklinePaused'
        ];
        
        const exported = {};
        essential.forEach(key => {
            if (this.state[key] !== undefined) {
                exported[key] = this.state[key];
            }
        });
        
        return exported;
    }
}

// Singleton instance for global access
let globalStateManager = null;

/**
 * Get or create global state manager instance
 * @returns {StateManager} Global state manager
 */
export function getStateManager() {
    if (!globalStateManager) {
        globalStateManager = new StateManager();
    }
    return globalStateManager;
}

/**
 * Set global state manager instance (for testing or custom initialization)
 * @param {StateManager} manager - State manager instance
 */
export function setStateManager(manager) {
    globalStateManager = manager;
}
