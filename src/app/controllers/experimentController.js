export function createExperimentController(options) {
    const {
        state,
        sim,
        stats,
        runner,
        resetSimulation,
        getLastExternalCanvas,
        downloadJSON,
    } = options;

    let lastExport = null;
    let prevPaused = null;
    let lastRolloutClickMs = 0;

    const updateUI = (info) => {
        const statusEl = document.getElementById('exp-status');
        const progressEl = document.getElementById('exp-progress');
        const runBtn = document.getElementById('exp-run-btn');
        const cancelBtn = document.getElementById('exp-cancel-btn');
        const exportBtn = document.getElementById('exp-export-btn');

        if (statusEl) {
            statusEl.textContent = info.running ? info.phase : (info.phase || 'idle');
        }

        if (progressEl) {
            if (info.running) {
                progressEl.textContent = `${info.stepIndex} / ${info.totalSteps} steps`;
            } else if (info.summary) {
                progressEl.textContent = `done | hash ${info.configHash} | samples ${info.summary.samples}`;
            } else if (info.phase === 'canceled') {
                progressEl.textContent = 'canceled';
            } else {
                progressEl.textContent = '';
            }
        }

        if (runBtn) runBtn.disabled = info.running || !state.showStatistics;
        if (cancelBtn) cancelBtn.disabled = !info.running;
        if (exportBtn) exportBtn.disabled = !lastExport;
    };

    const handleRunnerUpdate = (info) => {
        updateUI(info);
        if (!info.running && (info.phase === 'done' || info.phase === 'canceled')) {
            lastExport = runner.exportJSON();
            if (prevPaused !== null) {
                state.paused = prevPaused;
                prevPaused = null;
            }
            updateUI({ ...info, summary: lastExport.summary });
        }
    };

    const runRollout = () => {
        const now = performance.now();
        if (now - lastRolloutClickMs < 100) return;
        lastRolloutClickMs = now;

        const statusEl = document.getElementById('exp-status');
        if (statusEl) statusEl.textContent = 'starting...';

        try {
            if (!state.showStatistics) {
                if (statusEl) statusEl.textContent = 'enable Compute to run';
                return;
            }
            if (!runner) {
                if (statusEl) statusEl.textContent = 'runner not initialized';
                return;
            }
            if (runner.isRunning()) return;
            if (state.rcTraining || state.rcInference) {
                if (statusEl) statusEl.textContent = 'stop RC to run';
                alert('Stop RC training/inference before running a rollout');
                return;
            }

            if (state.expResetAtStart) {
                resetSimulation(sim, state, getLastExternalCanvas());
            }
            stats.reset();

            lastExport = null;
            prevPaused = state.paused;
            state.paused = false;

            const snapshot = JSON.parse(JSON.stringify(state));
            const protocol = {
                resetAtStart: !!state.expResetAtStart,
                warmupSteps: state.expWarmupSteps,
                measureSteps: state.expMeasureSteps,
                stepsPerFrame: state.expStepsPerFrame,
                readbackEvery: state.expReadbackEvery,
            };

            const ok = runner.start(protocol, snapshot);
            if (!ok && statusEl) statusEl.textContent = 'failed to start';
        } catch (e) {
            console.error('Experiment run failed:', e);
            if (statusEl) statusEl.textContent = 'error (see console)';
        }
    };

    const cancelRollout = () => {
        if (runner) runner.cancel();
    };

    const exportRollout = () => {
        if (!lastExport) return;
        const json = JSON.stringify(lastExport, null, 2);
        downloadJSON(json, `kuramoto_rollout_${lastExport.configHash || 'run'}.json`);
    };

    const bindButtons = () => {
        const expRunBtn = document.getElementById('exp-run-btn');
        if (expRunBtn) expRunBtn.addEventListener('click', runRollout);
        const expCancelBtn = document.getElementById('exp-cancel-btn');
        if (expCancelBtn) expCancelBtn.addEventListener('click', cancelRollout);
        const expExportBtn = document.getElementById('exp-export-btn');
        if (expExportBtn) expExportBtn.addEventListener('click', exportRollout);
    };

    const attachToUIManager = (ui) => {
        if (!ui || !ui.cb) return;
        ui.cb.onExperimentRun = runRollout;
        ui.cb.onExperimentCancel = cancelRollout;
        ui.cb.onExperimentExport = exportRollout;
    };

    const hasExport = () => !!lastExport;

    return {
        updateUI,
        handleRunnerUpdate,
        runRollout,
        cancelRollout,
        exportRollout,
        bindButtons,
        attachToUIManager,
        hasExport,
    };
}
