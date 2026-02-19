/**
 * Utils Module
 * 
 * Shared utilities and helpers.
 */

export { Mat4, Vec3, Camera } from './common.js';
export { makeRng, normalizeSeed, cryptoSeedFallback } from './rng.js';
export { loadStateFromURL, updateURLFromState } from './urlstate.js';
export { encodeFloat32ToBase64, decodeBase64ToFloat32, estimateBase64SizeBytes } from './stateio.js';
export { resizeSparkCanvas, renderSparkline } from './sparklines.js';
export { showError } from './errors.js';
export { downloadCSV, downloadJSON, formatBytes } from './downloads.js';
export { isGaugeS1, isGaugeDynamicAllowed, isGaugeDynamicActive, canShowGaugeLayers, canUseGaugeOverlay, getGaugeStatusText } from './gaugeSupport.js';
