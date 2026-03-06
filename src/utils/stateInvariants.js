import {
    canShowGaugeLayers,
    isEmpyreanAudioAllowed,
    isInteractionForceAllowed,
    isPhaseLagAllowed,
    isPrismaticDynamicsAllowed,
    isPrismaticStyleAllowed,
    isReservoirAllowed
} from './gaugeSupport.js';

export function clampGaugeLayerSelection(state) {
    if (!canShowGaugeLayers(state) && (state.colormap ?? 0) >= 7) {
        state.colormap = 0;
    }
}

export function enforceStateInvariants(state) {
    const result = {
        rcDisabled: false,
        audioStopped: false
    };

    if (!isReservoirAllowed(state)) {
        if (state.ruleMode !== 0) state.ruleMode = 0;
        if (state.harmonicA !== 0.0) state.harmonicA = 0.0;
        if (state.harmonicB !== 0.0) state.harmonicB = 0.0;
        if (state.delaySteps !== 0) state.delaySteps = 0;
        if (state.globalCoupling !== false) state.globalCoupling = false;
        if (state.rcEnabled) {
            state.rcEnabled = false;
            result.rcDisabled = true;
        }
        if (state.gaugeEnabled) state.gaugeEnabled = false;
        if (!isPhaseLagAllowed(state) && state.phaseLagEnabled) state.phaseLagEnabled = false;
        if (!isPrismaticStyleAllowed(state)) state.prismaticStyleEnabled = false;
        if (!isPrismaticDynamicsAllowed(state)) state.prismaticDynamicsEnabled = false;
        if (!isInteractionForceAllowed(state)) state.interactionForceEnabled = false;
        state.mouseForcePointerActive = false;
        if (!isEmpyreanAudioAllowed(state) && (state.audioEmpyreanEnabled || state.audioEmpyreanRunning)) {
            state.audioEmpyreanEnabled = false;
            state.audioEmpyreanRunning = false;
            result.audioStopped = true;
        }
    }

    if (state.gaugeEnabled && state.globalCoupling) {
        state.globalCoupling = false;
    }

    if (!isInteractionForceAllowed(state)) {
        state.mouseForcePointerActive = false;
        state.interactionForceEnabled = false;
    }

    if (!isPrismaticDynamicsAllowed(state)) {
        state.prismaticDynamicsEnabled = false;
    }

    if (!isEmpyreanAudioAllowed(state) && (state.audioEmpyreanEnabled || state.audioEmpyreanRunning)) {
        state.audioEmpyreanEnabled = false;
        state.audioEmpyreanRunning = false;
        result.audioStopped = true;
    }

    if (state.manifoldMode === 's2' || state.manifoldMode === 's3') {
        if (state.thetaPattern !== 'random' && state.thetaPattern !== 'synchronized') {
            state.thetaPattern = 'random';
        }
        if (state.omegaPattern !== 'random' && state.omegaPattern !== 'uniform') {
            state.omegaPattern = 'random';
        }
    }

    clampGaugeLayerSelection(state);
    return result;
}
