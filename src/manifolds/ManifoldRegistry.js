/**
 * ManifoldRegistry - Centralized metadata and feature flags for each manifold type
 */

export const ManifoldRegistry = {
  s1: {
    id: 's1',
    name: 'S¹ (Circle)',
    dimension: 1,
    stateSize: 1,           // floats per oscillator
    textureFormat: 'r32float',
    atomicSize: 8,          // bytes for reduction (2 × i32: cos_sum, sin_sum)

    features: {
      ruleMode: true,
      delay: true,
      harmonics: true,
      kernel: true,
      reservoir: true,
      layerKernel: true,
      globalCoupling: true,
      phaseSpace: true,
      lyapunov: true
    },

    patterns: ['random', 'gradient', 'spiral', 'checkerboard', 'target', 'synchronized', 'image'],
    omegaPatterns: ['uniform', 'random', 'gradient', 'center_fast', 'checkerboard'],

    visualization: {
      heightMap: 'sin(θ)',
      colorMap: 'phase-palette',
      gradientSupported: true
    }
  },

  s2: {
    id: 's2',
    name: 'S² (Sphere)',
    dimension: 3,
    stateSize: 4,           // floats per oscillator (x, y, z, w=1)
    textureFormat: 'rgba32float',
    atomicSize: 12,         // bytes for reduction (3 × i32: x_sum, y_sum, z_sum)

    features: {
      ruleMode: false,      // Only mean-field coupling works
      delay: false,         // Not implemented for S²
      harmonics: false,     // Not applicable
      kernel: true,         // Grid kernel works
      reservoir: false,     // Not implemented
      layerKernel: true,
      globalCoupling: false, // Not implemented for S²
      phaseSpace: false,     // S¹ phase space visualization only
      lyapunov: false        // S¹ Lyapunov calculation only
    },

    patterns: ['random', 'synchronized'],
    omegaPatterns: ['uniform', 'random'],

    visualization: {
      heightMap: 'z',
      colorMap: 'vector-rgb',
      gradientSupported: true
    }
  },

  s3: {
    id: 's3',
    name: 'S³ (3-Sphere)',
    dimension: 4,
    stateSize: 4,           // floats per oscillator (x, y, z, w quaternion)
    textureFormat: 'rgba32float',
    atomicSize: 16,         // bytes for reduction (4 × i32: x, y, z, w sums)

    features: {
      ruleMode: false,      // Only mean-field coupling
      delay: false,         // Not implemented
      harmonics: false,     // Not applicable
      kernel: true,         // Grid kernel works
      reservoir: false,     // Not implemented
      layerKernel: true,
      globalCoupling: false, // Not implemented for S³
      phaseSpace: false,     // S¹ phase space visualization only
      lyapunov: false        // S¹ Lyapunov calculation only
    },

    patterns: ['random', 'gradient', 'synchronized'],
    omegaPatterns: ['uniform', 'random'],

    visualization: {
      heightMap: 'w',
      colorMap: 'quaternion-rgb',
      gradientSupported: true
    }
  }
};

/**
 * Get manifold by ID with fallback to s1
 */
export function getManifold(id) {
  return ManifoldRegistry[id] || ManifoldRegistry.s1;
}

/**
 * Check if a feature is supported for the given manifold
 */
export function isFeatureSupported(manifoldId, feature) {
  const manifold = getManifold(manifoldId);
  return manifold.features[feature] === true;
}

/**
 * Get list of supported patterns for a manifold
 */
export function getSupportedPatterns(manifoldId) {
  return getManifold(manifoldId).patterns;
}

/**
 * Get list of supported omega patterns for a manifold
 */
export function getSupportedOmegaPatterns(manifoldId) {
  return getManifold(manifoldId).omegaPatterns;
}

/**
 * Check if pattern is supported for the given manifold
 */
export function isPatternSupported(manifoldId, pattern) {
  return getManifold(manifoldId).patterns.includes(pattern);
}

/**
 * Get all manifold IDs
 */
export function getManifoldIds() {
  return Object.keys(ManifoldRegistry);
}
