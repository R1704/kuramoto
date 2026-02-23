import { drawRCTaskOverlay, drawGraphOverlay } from '../../core/overlays.js';
import { canUseGaugeOverlay } from '../../utils/gaugeSupport.js';

function isRunnerActive(runner) {
    return !!(runner && typeof runner.isRunning === 'function' && runner.isRunning());
}

function isCadenceReady(now, lastMs, minIntervalMs) {
    return (now - (lastMs || 0)) >= minIntervalMs;
}

function runFrameLoopSmokeChecks(ctx) {
    const requiredKeys = ['STATE', 'device', 'sim', 'renderer', 'camera', 'canvas', 'runtime'];
    const missing = requiredKeys.filter((key) => !ctx?.[key]);
    if (missing.length) {
        console.warn('[smoke] frameLoop missing context:', missing.join(', '));
    }
}

export function createFrameLoop(ctx) {
    runFrameLoopSmokeChecks(ctx);
    return function frame() {
        const frameStart = performance.now();
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
            audioEngine,
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

            const experimentActive = isRunnerActive(experimentRunner);
            const rcSweepActive = isRunnerActive(rcCritSweepRunner);
            const rcModeCompareActive = isRunnerActive(rcModeCompareRunner);

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
            const audioActive = !!(audioEngine && audioEngine.isRunning && audioEngine.isRunning()
                && STATE.audioEmpyreanEnabled
                && STATE.manifoldMode === 's1'
                && STATE.topologyMode === 'grid'
                && !experimentActive
                && !rcSweepActive
                && !rcModeCompareActive);
            const wantsAudioMetrics = audioActive;
            if (!wantsAudioMetrics) {
                runtime.audioPhaseBins.fill(0);
                runtime.audioPhasePans.fill(0);
                runtime.audioIntensity = 0;
                runtime.audioCoherence = 0;
                runtime.audioGradient = 0;
                runtime.audioOrder = 0;
            }
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
            if (wantsAudioMetrics && isCadenceReady(frameNow, runtime.lastPrismaticMetricsRequestMs, 36)) {
                sim.requestPrismaticMetricsReadback(encoder);
                runtime.lastPrismaticMetricsRequestMs = frameNow;
            }

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

            const gaugeOverlayLive = canUseGaugeOverlay(STATE)
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
                    if (!runtime.rcReadPending && isCadenceReady(nowMs, runtime.lastRCReadMs, config.RC_READ_MIN_MS)) {
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
                const canReadback = sim.readbackPending && isCadenceReady(frameNow, runtime.lastStatsReadbackMs, config.STATS_READBACK_MIN_MS);
                if (canReadback) {
                    const didComputeStatsThisFrame = didComputeStats;
                    const readbackStart = performance.now();
                    sim.processReadback().then((result) => {
                        if (result && !STATE.paused) {
                            stats.update(result.cos, result.sin, result.localStats);
                            runtime.lastStatsReadbackMs = frameNow;
                        }
                        runtime.lastReadbackDurationMs = performance.now() - readbackStart;

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

            if (sim.prismaticMetricsPending && !runtime.prismaticMetricsReadPending) {
                runtime.prismaticMetricsReadPending = true;
                sim.processPrismaticMetricsReadback().then((metrics) => {
                    if (wantsAudioMetrics && metrics?.phaseBins && metrics?.phasePans) {
                        const n = Math.min(runtime.audioPhaseBins.length, metrics.phaseBins.length);
                        for (let i = 0; i < n; i++) {
                            runtime.audioPhaseBins[i] = metrics.phaseBins[i];
                            runtime.audioPhasePans[i] = metrics.phasePans[i];
                        }
                        for (let i = n; i < runtime.audioPhaseBins.length; i++) {
                            runtime.audioPhaseBins[i] = 0;
                            runtime.audioPhasePans[i] = 0;
                        }
                        runtime.audioIntensity = metrics.intensity ?? 0;
                        runtime.audioCoherence = metrics.coherence ?? 0;
                        runtime.audioGradient = metrics.gradient ?? 0;
                        runtime.audioOrder = metrics.order ?? 0;
                        runtime.lastPrismaticMetricsMs = performance.now();
                    }
                }).finally(() => {
                    runtime.prismaticMetricsReadPending = false;
                });
            }

            if (audioEngine) {
                audioEngine.update({
                    R: stats?.R ?? 0,
                    localR: stats?.localR ?? stats?.R ?? 0,
                    gradient: stats?.gradient ?? 0,
                    phaseBins: runtime.audioPhaseBins,
                    phasePans: runtime.audioPhasePans,
                    intensity: runtime.audioIntensity ?? 0,
                    coherence: runtime.audioCoherence ?? 0,
                    layerGradient: runtime.audioGradient ?? 0,
                    layerOrder: runtime.audioOrder ?? 0
                }, STATE);
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

        runtime.frameDurationMs = performance.now() - frameStart;

        requestAnimationFrame(frame);
    };
}
