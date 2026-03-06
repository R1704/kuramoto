import { splitStateByPersistence } from '../defaultState.js';

export function createSnapshotController(options) {
    const {
        state,
        sim,
        stats,
        renderer,
        lyapunovCalc,
        reservoir,
        getUI,
        stateAdapter,
        drawKernel,
        regenerateTopology,
        normalizeSeed,
        ensureLayerParams,
        normalizeSelectedLayers,
        applyLayerParamsToState,
        syncStateToLayerParams,
        encodeFloat32ToBase64,
        decodeBase64ToFloat32,
        estimateBase64SizeBytes,
        downloadJSON,
        formatBytes,
        isExperimentRunning,
        cancelExperiment,
        rebuildLayerCount,
        isGridResizeInProgress,
        setGridResizeInProgress,
    } = options;

    const snapshotStatusEl = document.getElementById('snapshot-status');
    const setSnapshotStatus = (text) => {
        if (snapshotStatusEl) snapshotStatusEl.textContent = text;
    };

    const resizeGridForSnapshot = async (newSize) => {
        if (isGridResizeInProgress()) return;
        setGridResizeInProgress(true);
        try {
            sim.resize(newSize);
            state.gridSize = newSize;
            renderer.rebuildMesh(newSize);
            stats.resize(newSize * newSize * state.layerCount);
            lyapunovCalc.resize(newSize * newSize * state.layerCount);
            reservoir.resize(newSize);
            renderer.invalidateBindGroup();
            regenerateTopology();
            drawKernel(state);
        } finally {
            setGridResizeInProgress(false);
        }
    };

    const captureSnapshot = async () => {
        if (isExperimentRunning()) {
            setSnapshotStatus('cancel rollout first');
            return;
        }
        if (state.manifoldMode !== 's1') {
            setSnapshotStatus('snapshot not supported for S2 yet');
            return;
        }

        const includeTheta = !!document.getElementById('snapshot-theta-toggle')?.checked;
        const includeOmega = !!document.getElementById('snapshot-omega-toggle')?.checked;
        const includeGauge = !!document.getElementById('snapshot-gauge-toggle')?.checked;
        const activeLayerOnly = !!document.getElementById('snapshot-active-layer-only-toggle')?.checked;
        const layerSize = sim.gridSize * sim.gridSize;
        const layers = sim.layers || 1;
        const activeLayer = Math.min(Math.max(0, state.activeLayer ?? 0), Math.max(0, layers - 1));

        setSnapshotStatus('reading...');

        let theta = null;
        let omega = null;
        let gauge = null;

        if (includeTheta) {
            theta = state.manifoldMode === 's2' ? await sim.readS2() : await sim.readTheta();
            if (!theta) {
                setSnapshotStatus('theta read failed');
                return;
            }
        }
        if (includeOmega) {
            omega = state.manifoldMode === 's2' ? sim.omegaVecData : sim.getOmega();
            if (!omega) {
                omega = null;
            }
        }
        if (includeGauge && typeof sim.readGaugeField === 'function') {
            gauge = await sim.readGaugeField();
            if (!gauge) {
                setSnapshotStatus('gauge read failed');
                return;
            }
        }

        if (activeLayerOnly && layers > 1) {
            if (theta && theta.length === sim.N) {
                theta = theta.subarray(activeLayer * layerSize, activeLayer * layerSize + layerSize);
            } else if (theta && theta.length === sim.N * 4) {
                const start = activeLayer * layerSize * 4;
                theta = theta.subarray(start, start + layerSize * 4);
            }
            if (omega && omega.length === sim.N) {
                omega = omega.subarray(activeLayer * layerSize, activeLayer * layerSize + layerSize);
            } else if (omega && omega.length === sim.N * 4) {
                const start = activeLayer * layerSize * 4;
                omega = omega.subarray(start, start + layerSize * 4);
            }
            if (gauge?.ax && gauge.ax.length === sim.N) {
                gauge.ax = gauge.ax.subarray(activeLayer * layerSize, activeLayer * layerSize + layerSize);
            }
            if (gauge?.ay && gauge.ay.length === sim.N) {
                gauge.ay = gauge.ay.subarray(activeLayer * layerSize, activeLayer * layerSize + layerSize);
            }
            const layerGraphSize = layerSize * sim.maxGraphDegree;
            if (gauge?.graph && gauge.graph.length === sim.N * sim.maxGraphDegree) {
                const graphStart = activeLayer * layerGraphSize;
                gauge.graph = gauge.graph.subarray(graphStart, graphStart + layerGraphSize);
            }
        }

        setSnapshotStatus('encoding...');
        const { modelState, runtimeState } = splitStateByPersistence(state);
        const snapshot = {
            type: 'kuramoto_state_snapshot',
            version: 2,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            meta: {
                gridSize: sim.gridSize,
                layerCount: layers,
                activeLayer,
                activeLayerOnly,
                manifoldMode: state.manifoldMode,
            },
            // Backward-compatible full state blob.
            state: JSON.parse(JSON.stringify(state)),
            // Structured split for new consumers.
            modelState: JSON.parse(JSON.stringify(modelState)),
            runtimeState: JSON.parse(JSON.stringify(runtimeState)),
            buffers: {},
        };

        let approxBytes = 0;

        if (theta) {
            snapshot.buffers.theta = {
                dtype: 'f32',
                encoding: 'base64',
                length: theta.length,
                vecSize: state.manifoldMode === 's2' ? 4 : 1,
                base64: encodeFloat32ToBase64(theta),
            };
            approxBytes += estimateBase64SizeBytes(theta.byteLength);
        }

        if (omega) {
            snapshot.buffers.omega = {
                dtype: 'f32',
                encoding: 'base64',
                length: omega.length,
                vecSize: state.manifoldMode === 's2' ? 4 : 1,
                base64: encodeFloat32ToBase64(omega),
            };
            approxBytes += estimateBase64SizeBytes(omega.byteLength);
        }

        if (gauge?.ax && gauge?.ay) {
            snapshot.buffers.gauge = {
                dtype: 'f32',
                encoding: 'base64',
                axLength: gauge.ax.length,
                ayLength: gauge.ay.length,
                axBase64: encodeFloat32ToBase64(gauge.ax),
                ayBase64: encodeFloat32ToBase64(gauge.ay),
            };
            approxBytes += estimateBase64SizeBytes(gauge.ax.byteLength);
            approxBytes += estimateBase64SizeBytes(gauge.ay.byteLength);
            if (gauge.graph && gauge.graph.length > 0) {
                snapshot.buffers.gauge.graphLength = gauge.graph.length;
                snapshot.buffers.gauge.graphBase64 = encodeFloat32ToBase64(gauge.graph);
                approxBytes += estimateBase64SizeBytes(gauge.graph.byteLength);
            }
        }

        const json = JSON.stringify(snapshot, null, 2);
        const filename = `kuramoto_snapshot_${snapshot.timestamp.replace(/[:.]/g, '-')}.json`;
        downloadJSON(json, filename);
        setSnapshotStatus(`saved ~${formatBytes(approxBytes)}`);
    };

    const applySnapshot = async (snapshot) => {
        if (!snapshot || snapshot.type !== 'kuramoto_state_snapshot') {
            throw new Error('Not a kuramoto_state_snapshot');
        }
        if (snapshot.version !== undefined && snapshot.version !== 1 && snapshot.version !== 2) {
            throw new Error(`Unsupported snapshot version: ${snapshot.version}`);
        }

        const snapManifold = snapshot.meta?.manifoldMode ?? snapshot.state?.manifoldMode ?? 's1';
        if (snapManifold !== 's1') {
            throw new Error('S2 snapshots are not supported yet');
        }

        if (isExperimentRunning()) {
            cancelExperiment();
        }

        const targetGrid = snapshot.meta?.gridSize ?? snapshot.state?.gridSize;
        const targetLayers = snapshot.meta?.layerCount ?? snapshot.state?.layerCount;
        const targetManifold = snapshot.meta?.manifoldMode ?? snapshot.state?.manifoldMode ?? state.manifoldMode;
        if (!Number.isFinite(targetGrid) || !Number.isFinite(targetLayers)) {
            throw new Error('Snapshot missing gridSize/layerCount');
        }

        if (targetLayers !== state.layerCount) {
            await rebuildLayerCount(targetLayers);
        }

        if (targetGrid !== state.gridSize) {
            await resizeGridForSnapshot(targetGrid);
        }

        const splitState = (snapshot.modelState || snapshot.runtimeState)
            ? { ...(snapshot.modelState || {}), ...(snapshot.runtimeState || {}) }
            : null;
        Object.assign(state, snapshot.state || splitState || {});
        state.manifoldMode = targetManifold || state.manifoldMode || 's1';
        state.seed = normalizeSeed(state.seed);
        state.layerCount = Math.max(1, Math.min(8, Math.floor(state.layerCount || 1)));
        state.activeLayer = Math.min(Math.max(0, Math.floor(state.activeLayer || 0)), state.layerCount - 1);

        ensureLayerParams(state, state.layerCount);
        normalizeSelectedLayers(state, state.layerCount);
        applyLayerParamsToState(state, state.activeLayer);
        syncStateToLayerParams(state, state.selectedLayers);
        sim.writeLayerParams(state.layerParams);
        sim.updateFullParams(state);
        sim.setManifoldMode(state.manifoldMode);

        const layerSize = sim.gridSize * sim.gridSize;
        const layers = sim.layers || 1;
        const activeLayer = Math.min(Math.max(0, state.activeLayer ?? 0), Math.max(0, layers - 1));

        if (snapshot.buffers?.theta?.base64) {
            const thetaDecoded = decodeBase64ToFloat32(snapshot.buffers.theta.base64);
            const vecSize = snapshot.buffers.theta.vecSize || 1;
            if (state.manifoldMode === 's2' && vecSize === 4) {
                if (thetaDecoded.length === sim.N * 4) {
                    sim.writeS2(thetaDecoded);
                } else if (thetaDecoded.length === layerSize * 4 && layers > 1) {
                    const full = new Float32Array(sim.N * 4);
                    full.set(thetaDecoded, activeLayer * layerSize * 4);
                    sim.writeS2(full);
                } else {
                    throw new Error(`S2 theta length mismatch: ${thetaDecoded.length}`);
                }
            } else if (thetaDecoded.length === sim.N) {
                sim.writeTheta(thetaDecoded);
            } else if (thetaDecoded.length === layerSize && layers > 1) {
                const full = new Float32Array(sim.N);
                full.set(thetaDecoded, activeLayer * layerSize);
                sim.writeTheta(full);
            } else {
                throw new Error(`Theta length mismatch: ${thetaDecoded.length} (expected ${sim.N} or ${layerSize})`);
            }
        }

        if (snapshot.buffers?.omega?.base64) {
            const omegaDecoded = decodeBase64ToFloat32(snapshot.buffers.omega.base64);
            const vecSize = snapshot.buffers.omega.vecSize || 1;
            if (state.manifoldMode === 's2' && vecSize === 4) {
                if (omegaDecoded.length === sim.N * 4) {
                    sim.writeOmegaVec(omegaDecoded);
                } else if (omegaDecoded.length === layerSize * 4 && layers > 1) {
                    const full = new Float32Array(sim.N * 4);
                    full.set(omegaDecoded, activeLayer * layerSize * 4);
                    sim.writeOmegaVec(full);
                } else {
                    throw new Error(`S2 omega length mismatch: ${omegaDecoded.length}`);
                }
            } else if (omegaDecoded.length === sim.N) {
                sim.writeOmega(omegaDecoded);
                sim.storeOmega(omegaDecoded);
            } else if (omegaDecoded.length === layerSize && layers > 1) {
                const full = new Float32Array(sim.N);
                full.set(omegaDecoded, activeLayer * layerSize);
                sim.writeOmega(full);
                sim.storeOmega(full);
            } else {
                throw new Error(`Omega length mismatch: ${omegaDecoded.length} (expected ${sim.N} or ${layerSize})`);
            }
        }

        if (snapshot.buffers?.gauge?.axBase64 && snapshot.buffers?.gauge?.ayBase64) {
            const axDecoded = decodeBase64ToFloat32(snapshot.buffers.gauge.axBase64);
            const ayDecoded = decodeBase64ToFloat32(snapshot.buffers.gauge.ayBase64);
            let axWrite = null;
            let ayWrite = null;

            if (axDecoded.length === sim.N && ayDecoded.length === sim.N) {
                axWrite = axDecoded;
                ayWrite = ayDecoded;
            } else if (layers > 1 && axDecoded.length === layerSize && ayDecoded.length === layerSize) {
                axWrite = new Float32Array(sim.N);
                ayWrite = new Float32Array(sim.N);
                const offset = activeLayer * layerSize;
                axWrite.set(axDecoded, offset);
                ayWrite.set(ayDecoded, offset);
            } else {
                throw new Error(`Gauge length mismatch: ax=${axDecoded.length}, ay=${ayDecoded.length}`);
            }

            if (typeof sim.writeGaugeField === 'function') {
                sim.writeGaugeField(axWrite, ayWrite);
            }

            if (snapshot.buffers.gauge.graphBase64 && typeof sim.writeGraphGauge === 'function') {
                const graphDecoded = decodeBase64ToFloat32(snapshot.buffers.gauge.graphBase64);
                const expected = sim.N * sim.maxGraphDegree;
                const layerGraphSize = layerSize * sim.maxGraphDegree;
                if (graphDecoded.length === expected) {
                    sim.writeGraphGauge(graphDecoded);
                } else if (layers > 1 && graphDecoded.length === layerGraphSize) {
                    const fullGraph = new Float32Array(expected);
                    fullGraph.set(graphDecoded, activeLayer * layerGraphSize);
                    sim.writeGraphGauge(fullGraph);
                } else {
                    throw new Error(`Gauge graph length mismatch: ${graphDecoded.length}`);
                }
            }
        }

        stats.reset();
        const ui = getUI();
        if (ui?.updateDisplay) ui.updateDisplay();
        stateAdapter.syncURL(true);
        drawKernel(state);
    };

    const bindControls = () => {
        const snapshotSaveBtn = document.getElementById('snapshot-save-btn');
        if (snapshotSaveBtn) snapshotSaveBtn.addEventListener('click', () => {
            void captureSnapshot();
        });
        const snapshotLoadInput = document.getElementById('snapshot-load-input');
        if (snapshotLoadInput) {
            snapshotLoadInput.addEventListener('change', () => {
                const file = snapshotLoadInput.files && snapshotLoadInput.files[0];
                if (!file) return;
                setSnapshotStatus('loading...');
                file.text().then(async (text) => {
                    const snap = JSON.parse(text);
                    await applySnapshot(snap);
                    setSnapshotStatus('loaded');
                }).catch((e) => {
                    console.error('Snapshot load failed:', e);
                    setSnapshotStatus('load failed');
                }).finally(() => {
                    snapshotLoadInput.value = '';
                });
            });
        }
    };

    return {
        bindControls,
        setSnapshotStatus,
        captureSnapshot,
        applySnapshot,
    };
}
