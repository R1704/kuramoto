import { Presets, drawKernel, resetSimulation } from '../../patterns/index.js';
import { makeRng } from '../../utils/index.js';
import { normalizeSelectedLayers, syncStateToLayerParams } from '../../state/layerParams.js';

export async function loadPreset({ name, sim, ui, state, lastExternalCanvas }) {
    console.log('Loading preset:', name);

    if (!Presets[name]) {
        console.warn('Preset not found:', name);
        resetSimulation(sim, state, lastExternalCanvas);
        return;
    }

    normalizeSelectedLayers(state, state.layerCount);
    const targets = state.selectedLayers;
    const applyAll = targets.length >= state.layerCount;

    let baseTheta = null;
    let baseOmega = null;
    let baseGauge = null;
    if (!applyAll) {
        baseTheta = sim.thetaData ? new Float32Array(sim.thetaData) : await sim.readTheta();
        baseOmega = sim.getOmega() ? new Float32Array(sim.getOmega()) : null;
        if (typeof sim.readGaugeField === 'function') {
            baseGauge = await sim.readGaugeField();
            if (!baseGauge && sim.gaugeXData && sim.gaugeYData) {
                baseGauge = {
                    ax: new Float32Array(sim.gaugeXData),
                    ay: new Float32Array(sim.gaugeYData),
                    graph: sim.graphGaugeData ? new Float32Array(sim.graphGaugeData) : null
                };
            }
        }
    }

    const rng = makeRng(state.seed, `preset:${name}`);
    Presets[name](state, sim, rng);
    if (state.manifoldMode !== 's1' && state.colormap >= 7) {
        state.colormap = 0;
    }

    syncStateToLayerParams(state, targets);
    sim.writeLayerParams(state.layerParams);

    if (!applyAll && baseTheta) {
        const presetTheta = sim.thetaData ? new Float32Array(sim.thetaData) : null;
        if (presetTheta) {
            const layerSize = sim.gridSize * sim.gridSize;
            const combined = new Float32Array(baseTheta);
            targets.forEach((layerIdx) => {
                const targetOffset = layerIdx * layerSize;
                combined.set(presetTheta.subarray(0, layerSize), targetOffset);
            });
            sim.writeTheta(combined);
        }
    }

    if (!applyAll && baseOmega) {
        const presetOmega = sim.getOmega();
        if (presetOmega) {
            const layerSize = sim.gridSize * sim.gridSize;
            const combinedOmega = new Float32Array(baseOmega);
            targets.forEach((layerIdx) => {
                const targetOffset = layerIdx * layerSize;
                combinedOmega.set(presetOmega.subarray(0, layerSize), targetOffset);
            });
            sim.writeOmega(combinedOmega);
            sim.storeOmega(combinedOmega);
        }
    }

    if (name === 'flux_lattice' && !applyAll && baseGauge && sim.gaugeXData && sim.gaugeYData && typeof sim.writeGaugeField === 'function') {
        const layerSize = sim.gridSize * sim.gridSize;
        const combinedAx = (baseGauge.ax && baseGauge.ax.length === sim.N) ? new Float32Array(baseGauge.ax) : new Float32Array(sim.N);
        const combinedAy = (baseGauge.ay && baseGauge.ay.length === sim.N) ? new Float32Array(baseGauge.ay) : new Float32Array(sim.N);
        targets.forEach((layerIdx) => {
            const targetOffset = layerIdx * layerSize;
            combinedAx.set(sim.gaugeXData.subarray(0, layerSize), targetOffset);
            combinedAy.set(sim.gaugeYData.subarray(0, layerSize), targetOffset);
        });
        sim.writeGaugeField(combinedAx, combinedAy);

        const maxDegree = sim.maxGraphDegree || 16;
        const edgeCount = sim.N * maxDegree;
        const edgeLayerSize = layerSize * maxDegree;
        if (typeof sim.writeGraphGauge === 'function' && sim.graphGaugeData && sim.graphGaugeData.length === edgeCount) {
            const combinedGraph = (baseGauge.graph && baseGauge.graph.length === edgeCount)
                ? new Float32Array(baseGauge.graph)
                : new Float32Array(edgeCount);
            targets.forEach((layerIdx) => {
                const targetOffset = layerIdx * edgeLayerSize;
                combinedGraph.set(sim.graphGaugeData.subarray(0, edgeLayerSize), targetOffset);
            });
            sim.writeGraphGauge(combinedGraph);
        }
    }

    ui.updateDisplay();
    sim.updateFullParams(state);
    sim.setManifoldMode(state.manifoldMode);
    drawKernel(state);
}
