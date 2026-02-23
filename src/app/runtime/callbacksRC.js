export function createRCCallbacks({
    STATE,
    sim,
    reservoir,
    writeRCInputWeights,
    updateRCDisplay,
    stateAdapter
}) {
    return {
        onRCEnable: (enabled) => {
            STATE.rcEnabled = enabled;
            if (enabled) {
                reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
                const weights = reservoir.getInputWeights();
                const nonZero = weights.filter((w) => w > 0).length;
                const maxWeight = Math.max(...weights);
                console.log(`RC enabled: ${nonZero} input neurons, max weight=${maxWeight.toFixed(3)}, region=${STATE.rcInputRegion}`);
                writeRCInputWeights();
            } else {
                sim.setInputSignal(0);
                console.log('RC disabled');
            }
            stateAdapter.syncURL(true);
        },
        onRCConfigure: () => {
            reservoir.setFeatureBudget(STATE.rcMaxFeatures);
            reservoir.setHistoryLength(STATE.rcHistoryLength);
            reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
            reservoir.setTask(STATE.rcTask);
            writeRCInputWeights();
            stateAdapter.syncURL(true);
        },
        onRCStartTraining: () => {
            if (!STATE.rcEnabled) {
                alert('Enable Reservoir Computing first');
                return;
            }
            reservoir.setFeatureBudget(STATE.rcMaxFeatures);
            reservoir.setHistoryLength(STATE.rcHistoryLength);
            reservoir.configure(STATE.rcInputRegion, STATE.rcOutputRegion, STATE.rcInputStrength);
            reservoir.setTask(STATE.rcTask);
            writeRCInputWeights();
            reservoir.startTraining();
            STATE.rcTraining = true;
            STATE.rcInference = false;
            updateRCDisplay();
            stateAdapter.syncURL(true);
        },
        onRCStopTraining: () => {
            STATE.rcTraining = false;
            const nrmse = reservoir.stopTraining();
            STATE.rcNRMSE = nrmse;
            updateRCDisplay();
            stateAdapter.syncURL(true);
        },
        onRCStartInference: () => {
            if (reservoir.startInference()) {
                STATE.rcInference = true;
                STATE.rcTraining = false;
                updateRCDisplay();
                stateAdapter.syncURL(true);
            }
        },
        onRCStopInference: () => {
            reservoir.stopInference();
            STATE.rcInference = false;
            updateRCDisplay();
            stateAdapter.syncURL(true);
        }
    };
}
