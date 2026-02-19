import { drawRCTaskOverlay, drawGraphOverlay } from '../../core/overlays.js';

export function createFrameLoop(ctx) {
    return function frame() {
        const {
            STATE,
            device,
            sim,
            renderer,
            camera,
            canvas,
            stats,
            reservoir,
            ui,
            lyapunovCalc,
            experimentRunner,
            rcCritSweepRunner,
            rcModeCompareRunner,
            phaseSpacePlot,
            resizeCanvasesToDisplay,
            getStatsInterval,
            getActiveLayerIndex,
            getActiveLayerThetaForRC,
            writeRCInputWeights,
            stepLLE,
            drawRCPlot,
            renderPhaseSpace,
            updateRCDisplay,
            updateStatsView,
            onFrameError,
            rcOverlay,
            rcOverlayCtx,
            graphOverlay,
            graphOverlayCtx,
            rcDotTrail,
            rcDotTrailMax,
            runtime,
            config
        } = ctx;

        try {
            const frameNow = performance.now();
            if (!STATE.paused) STATE.frameTime += STATE.dt * STATE.timeScale;

            if (STATE.rcEnabled) {
                const layerNow = getActiveLayerIndex();
                if (layerNow !== runtime.rcActiveLayerSeen) {
                    runtime.rcActiveLayerSeen = layerNow;
                    writeRCInputWeights();
                }
            }

            camera.viewMode = STATE.viewMode;
            sim.updateParams(STATE);

            const encoder = device.createCommandEncoder();
            let didComputeStats = false;

            const experimentActive = experimentRunner && experimentRunner.isRunning();
            const rcSweepActive = rcCritSweepRunner && rcCritSweepRunner.isRunning();
            const rcModeCompareActive = rcModeCompareRunner && rcModeCompareRunner.isRunning();

            if (experimentActive) {
                experimentRunner.encodeSteps(encoder, STATE.delaySteps, STATE.globalCoupling);
            } else if (rcSweepActive) {
                rcCritSweepRunner.encodeSteps(encoder, STATE.delaySteps, STATE.globalCoupling);
            } else if (rcModeCompareActive) {
                rcModeCompareRunner.encodeSteps(encoder, STATE.delaySteps, STATE.globalCoupling);
            } else {
                runtime.statsFrameCounter++;
                const shouldComputeStats = STATE.showStatistics && runtime.statsFrameCounter >= getStatsInterval();
                if (shouldComputeStats) runtime.statsFrameCounter = 0;
                didComputeStats = shouldComputeStats;

                sim.step(encoder, STATE.delaySteps, STATE.globalCoupling, shouldComputeStats);
                if (shouldComputeStats) {
                    sim.requestGlobalOrderReadback(encoder);
                }
            }

            resizeCanvasesToDisplay();
            const viewProj = camera.getMatrix(canvas.width / canvas.height, STATE.gridSize);
            const viewModeStr = STATE.viewMode === 0 ? '3d' : '2d';
            renderer.draw(
                encoder,
                sim,
                viewProj,
                STATE.gridSize * STATE.gridSize,
                viewModeStr,
                STATE.renderAllLayers,
                STATE.activeLayer,
                STATE.selectedLayers
            );

            device.queue.submit([encoder.finish()]);

            drawRCTaskOverlay(viewProj, {
                rcOverlay,
                rcOverlayCtx,
                STATE,
                reservoir,
                rcCritSweepRunner,
                resizeCanvasesToDisplay,
                rcOverlayLastThetaLayer: runtime.rcOverlayLastThetaLayer,
                rcDotTrail,
                rcDotTrailMax
            });

            const gaugeOverlayLive = STATE.manifoldMode === 's1'
                && (STATE.overlayGaugeLinks || STATE.overlayPlaquetteSign || (STATE.overlayProbeEnabled && runtime.overlayMouseNorm?.inside));
            const overlayLive = STATE.viewMode === 1
                && (STATE.graphOverlayEnabled || gaugeOverlayLive);
            if (runtime.overlayDirty || overlayLive) {
                drawGraphOverlay(sim.topologyInfo, {
                    graphOverlay,
                    graphOverlayCtx,
                    STATE,
                    sim,
                    resizeCanvasesToDisplay,
                    gaugeOverlayData: runtime.gaugeOverlayData,
                    gaugeProbeData: runtime.gaugeProbeData,
                    overlayMouseNorm: runtime.overlayMouseNorm
                });
                runtime.overlayDirty = false;
            }

            if (!rcSweepActive && !rcModeCompareActive && STATE.rcEnabled && !STATE.paused && STATE.manifoldMode === 's1') {
                if (STATE.rcTraining || STATE.rcInference) {
                    const nowMs = performance.now();
                    if (!runtime.rcReadPending && (nowMs - runtime.lastRCReadMs) >= config.RC_READ_MIN_MS) {
                        runtime.rcReadPending = true;
                        sim.readTheta().then((theta) => {
                            if (theta) {
                                try {
                                    const thetaLayer = getActiveLayerThetaForRC(theta);
                                    reservoir.step(thetaLayer);
                                    if (STATE.rcTask === 'moving_dot') {
                                        runtime.rcOverlayLastThetaLayer = thetaLayer;
                                    }
                                    if (reservoir.tasks && reservoir.tasks.taskType === 'moving_dot') {
                                        writeRCInputWeights();
                                    }
                                    sim.setInputSignal(reservoir.getInputSignal());
                                    updateRCDisplay();
                                    drawRCPlot();
                                    renderPhaseSpace(theta);

                                    if (STATE.rcInference && runtime.rcTestRemaining > 0) {
                                        runtime.rcTestRemaining--;
                                        if (runtime.rcTestRemaining <= 0) {
                                            STATE.rcInference = false;
                                            reservoir.stopInference();
                                            STATE.rcTestNRMSE = reservoir.computeTestNRMSE();

                                            const trainBtn = document.getElementById('rc-train-btn');
                                            const stopBtn = document.getElementById('rc-stop-btn');
                                            const testBtn = document.getElementById('rc-test-btn');
                                            if (trainBtn) trainBtn.disabled = false;
                                            if (stopBtn) stopBtn.disabled = true;
                                            if (testBtn) testBtn.disabled = false;
                                            updateRCDisplay();
                                        }
                                    }
                                } catch (e) {
                                    console.error('RC step error:', e);
                                }
                            }
                        }).catch((e) => {
                            console.error('RC readTheta error:', e);
                        }).finally(() => {
                            runtime.rcReadPending = false;
                            runtime.lastRCReadMs = performance.now();
                        });
                    }
                } else {
                    const demoSignal = Math.sin(performance.now() * 0.002) * STATE.rcInputStrength;
                    sim.setInputSignal(demoSignal);
                }
            }

            if (STATE.manifoldMode !== 's1' && lyapunovCalc.isRunning) {
                lyapunovCalc.stop();
            }

            if (experimentActive) {
                experimentRunner.afterSubmit();
                updateStatsView();
            } else if (rcSweepActive) {
                rcCritSweepRunner.afterSubmit();
                updateStatsView();
            } else if (rcModeCompareActive) {
                rcModeCompareRunner.afterSubmit();
                updateStatsView();
            } else if (STATE.showStatistics) {
                const canReadback = sim.readbackPending && (frameNow - runtime.lastStatsReadbackMs >= config.STATS_READBACK_MIN_MS);
                if (canReadback) {
                    const didComputeStatsThisFrame = didComputeStats;
                    sim.processReadback().then((result) => {
                        if (result && !STATE.paused) {
                            stats.update(result.cos, result.sin, result.localStats);
                            runtime.lastStatsReadbackMs = frameNow;
                        }

                        if (runtime.kScanner && runtime.kScanner.phase !== 'done' && runtime.kScanner.phase !== 'idle') {
                            const scanner = stats.createKScanner(sim, STATE);
                            runtime.kScanner = scanner.step(runtime.kScanner);
                            const progress = document.getElementById('kscan-progress');
                            if (progress) {
                                progress.textContent = `${Math.round(stats.scanProgress * 100)}%`;
                            }
                            if (runtime.kScanner.phase === 'done') {
                                document.getElementById('kscan-btn')?.classList.remove('active');
                                const doneProgress = document.getElementById('kscan-progress');
                                if (doneProgress) doneProgress.textContent = 'Done!';
                                ui.updateDisplay();
                            }
                        }

                        if (lyapunovCalc.isRunning && didComputeStatsThisFrame) {
                            stepLLE();
                        }
                    });
                }

                updateStatsView();
            }

            if (phaseSpacePlot && STATE.phaseSpaceEnabled && !(STATE.rcTraining || STATE.rcInference) && !rcSweepActive && !rcModeCompareActive) {
                runtime.phaseSpaceCounter++;
                const interval = STATE.gridSize >= 512 ? config.PHASE_SAMPLE_INTERVAL * 2 : config.PHASE_SAMPLE_INTERVAL;
                if (runtime.phaseSpaceCounter >= interval && !runtime.phaseSpacePending) {
                    runtime.phaseSpaceCounter = 0;
                    runtime.phaseSpacePending = true;
                    sim.readTheta().then((theta) => {
                        runtime.phaseSpacePending = false;
                        renderPhaseSpace(theta);
                    }).catch(() => {
                        runtime.phaseSpacePending = false;
                    });
                }
            }

            runtime.frameErrorCount = 0;
        } catch (e) {
            console.error('Frame error:', e);
            runtime.frameErrorCount = (runtime.frameErrorCount || 0) + 1;
            if (!runtime.frameErrorShown && runtime.frameErrorCount >= 3) {
                runtime.frameErrorShown = true;
                if (typeof onFrameError === 'function') {
                    onFrameError(e);
                }
            }
        }

        requestAnimationFrame(frame);
    };
}
