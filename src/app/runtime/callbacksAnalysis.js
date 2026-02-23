export function createAnalysisCallbacks({
    STATE,
    stateAdapter,
    isActionBlocked,
    getDiscoverySweepController,
    getDiscoverySweepLastExport,
    setSweepUIState,
    downloadJSON,
    downloadCSV,
    captureCompareSnapshot,
    restoreCompareSnapshot
}) {
    return {
        onExperimentConfigChange: () => {
            if (isActionBlocked()) return;
            stateAdapter.syncURL(true);
        },
        onSweepConfigChange: () => {
            stateAdapter.syncURL(true);
        },
        onRunSweep: async () => {
            const sweep = getDiscoverySweepController();
            if (!sweep || sweep.isRunning()) return;
            if (isActionBlocked()) return;
            if (!STATE.showStatistics) {
                alert('Enable statistics to run parameter sweep.');
                return;
            }
            const param = STATE.sweepParam || 'gaugeCharge';
            const from = Number.isFinite(STATE.sweepFrom) ? STATE.sweepFrom : 0;
            const to = Number.isFinite(STATE.sweepTo) ? STATE.sweepTo : 2;
            const steps = Number.isFinite(STATE.sweepSteps) ? STATE.sweepSteps : 5;
            const settleFrames = Number.isFinite(STATE.sweepSettleFrames) ? STATE.sweepSettleFrames : 180;
            setSweepUIState(true, 'running (0/0)');
            await sweep.run({ param, from, to, steps, settleFrames });
            stateAdapter.syncURL(true);
        },
        onCancelSweep: () => {
            const sweep = getDiscoverySweepController();
            if (!sweep || !sweep.isRunning()) return;
            sweep.cancel();
            setSweepUIState(true, 'canceling...');
        },
        onExportSweepJSON: () => {
            const data = getDiscoverySweepLastExport();
            if (!data) return;
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            downloadJSON(data, `kuramoto_sweep_${ts}.json`);
        },
        onExportSweepCSV: () => {
            const sweep = getDiscoverySweepController();
            if (!sweep) return;
            const csv = sweep.exportCSV();
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            downloadCSV(csv, `kuramoto_sweep_${ts}.csv`);
        },
        onCompareCapture: (slot) => {
            if (slot !== 'a' && slot !== 'b') return;
            void captureCompareSnapshot(slot);
        },
        onCompareRestore: (slot) => {
            if (slot !== 'a' && slot !== 'b') return;
            void restoreCompareSnapshot(slot);
        }
    };
}
