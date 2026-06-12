import { ExperimentRunner } from '../../experiments/index.js';
import { createExperimentController } from '../controllers/experimentController.js';

export function initExperimentControllers({
    device,
    sim,
    stats,
    state,
    ui,
    resetSimulation,
    getLastExternalCanvas,
    downloadJSON,
    onUpdate,
    getOrganisms,
}) {
    const experimentRunner = new ExperimentRunner({
        device,
        sim,
        stats,
        getState: () => state,
        getOrganisms,
        onUpdate: (info) => onUpdate?.(info),
    });

    const experimentController = createExperimentController({
        state,
        sim,
        stats,
        runner: experimentRunner,
        resetSimulation,
        getLastExternalCanvas,
        downloadJSON,
    });
    experimentController.updateUI({ running: false, phase: 'idle', stepIndex: 0, totalSteps: 0, configHash: null, summary: null });
    experimentController.bindButtons();
    experimentController.attachToUIManager(ui);

    return { experimentRunner, experimentController };
}
