import { isFeatureSupported } from '../../manifolds/ManifoldRegistry.js';

export function updateDisplay() {
        // Update all sliders to match state
        const update = (id, val) => {
            const el = document.getElementById(id);
            if(el) el.value = val;
            const disp = document.getElementById(id.replace('slider', 'value'));
            if(disp && typeof val === 'number') disp.textContent = val.toFixed(2);
        };
        
        update('k0-slider', this.state.K0);
        update('range-slider', this.state.range);
        update('dt-slider', this.state.dt);
        update('harmonic-slider', this.state.harmonicA);
        update('harmonic3-slider', this.state.harmonicB);
        update('sigma-slider', this.state.sigma);
        update('sigma2-slider', this.state.sigma2);
        update('beta-slider', this.state.beta);
        update('delay-slider', this.state.delaySteps);
        update('noise-slider', this.state.noiseStrength);
        update('leak-slider', this.state.leak);
        update('gauge-charge-slider', this.state.gaugeCharge ?? 1.0);
        update('gauge-matter-coupling-slider', this.state.gaugeMatterCoupling ?? 1.0);
        update('gauge-stiffness-slider', this.state.gaugeStiffness ?? 0.2);
        update('gauge-damping-slider', this.state.gaugeDamping ?? 0.05);
        update('gauge-noise-slider', this.state.gaugeNoise ?? 0.0);
        update('gauge-dt-scale-slider', this.state.gaugeDtScale ?? 1.0);
        update('gauge-init-amplitude-slider', this.state.gaugeInitAmplitude ?? 0.5);
        update('gauge-flux-bias-slider', this.state.gaugeFluxBias ?? 0.0);
        update('layer-coupling-up-slider', this.state.layerCouplingUp ?? 0);
        update('layer-coupling-down-slider', this.state.layerCouplingDown ?? 0);
        update('omega-amplitude-slider', this.state.omegaAmplitude);
        const layerCount = Math.max(1, this.state.layerCount ?? 1);
        const lcVal = document.getElementById('layer-count-value');
        if (lcVal) lcVal.textContent = layerCount;
        const layerCountInput = document.getElementById('layer-count-input');
        if (layerCountInput) layerCountInput.value = layerCount;
        const layerKernelToggle = document.getElementById('layer-kernel-toggle');
        if (layerKernelToggle) layerKernelToggle.checked = !!this.state.layerKernelEnabled;
        this.updateLayerTabs();
        const activeLayerInput = document.getElementById('active-layer-input');
        const activeLayerVal = document.getElementById('active-layer-value');
        if (!Array.isArray(this.state.selectedLayers) || this.state.selectedLayers.length === 0) {
            this.state.selectedLayers = [this.state.activeLayer ?? 0];
        }
        if (activeLayerInput) {
            activeLayerInput.max = Math.max(0, layerCount - 1);
            activeLayerInput.value = Math.min(layerCount - 1, Math.max(0, this.state.activeLayer ?? 0));
        }
        if (activeLayerVal) activeLayerVal.textContent = this.state.activeLayer ?? 0;
        const coupUpVal = document.getElementById('layer-coupling-up-value');
        if (coupUpVal) coupUpVal.textContent = (this.state.layerCouplingUp ?? 0).toFixed(2);
        const coupDownVal = document.getElementById('layer-coupling-down-value');
        if (coupDownVal) coupDownVal.textContent = (this.state.layerCouplingDown ?? 0).toFixed(2);
        const zOffVal = document.getElementById('layer-z-offset-value');
        if (zOffVal) zOffVal.textContent = (this.state.layerZOffset ?? 0).toFixed(2);
        const renderAllToggle = document.getElementById('render-all-layers-toggle');
        if (renderAllToggle) renderAllToggle.checked = !!this.state.renderAllLayers;
        
        const topoSelect = document.getElementById('topology-select');
        if (topoSelect) topoSelect.value = this.state.topologyMode || 'grid';
        const isWS = this.state.topologyMode === 'ws' || this.state.topologyMode === 'watts_strogatz';
        const isBA = this.state.topologyMode === 'ba' || this.state.topologyMode === 'barabasi_albert';
        const wsControls = document.getElementById('ws-controls');
        if (wsControls) wsControls.style.display = isWS ? 'block' : 'none';
        const baControls = document.getElementById('ba-controls');
        if (baControls) baControls.style.display = isBA ? 'block' : 'none';
        const maxDeg = this.state.topologyMaxDegree || 16;
        const wsK = document.getElementById('ws-k-slider');
        const wsKVal = document.getElementById('ws-k-value');
        if (wsK) wsK.max = maxDeg;
        if (wsK) wsK.value = this.state.topologyWSK ?? 4;
        if (wsKVal) wsKVal.textContent = this.state.topologyWSK ?? 0;
        const wsP = document.getElementById('ws-p-slider');
        const wsPVal = document.getElementById('ws-p-value');
        if (wsP) wsP.value = this.state.topologyWSRewire ?? 0.2;
        if (wsPVal) wsPVal.textContent = (this.state.topologyWSRewire ?? 0).toFixed(2);
        const baM0 = document.getElementById('ba-m0-slider');
        const baM0Val = document.getElementById('ba-m0-value');
        if (baM0) baM0.max = maxDeg;
        if (baM0) baM0.value = this.state.topologyBAM0 ?? 5;
        if (baM0Val) baM0Val.textContent = this.state.topologyBAM0 ?? 0;
        const baM = document.getElementById('ba-m-slider');
        const baMVal = document.getElementById('ba-m-value');
        if (baM) baM.max = maxDeg;
        if (baM) baM.value = this.state.topologyBAM ?? 3;
        if (baMVal) baMVal.textContent = this.state.topologyBAM ?? 0;
        const topoSeed = document.getElementById('topology-seed-input');
        if (topoSeed) topoSeed.value = this.state.topologySeed ?? 1;
        const topoSeedVal = document.getElementById('topology-seed-value');
        if (topoSeedVal) topoSeedVal.textContent = this.state.topologySeed ?? 1;
        const avg = this.state.topologyAvgDegree ?? 0;
        const metaText = `avg deg ${avg.toFixed(2)} | max ${maxDeg}`;
        const topoMeta = document.getElementById('topology-meta');
        if (topoMeta) topoMeta.textContent = metaText;
        const topoAvgLabel = document.getElementById('topology-avgdegree');
        if (topoAvgLabel) topoAvgLabel.textContent = metaText;
        const topoWarn = document.getElementById('topology-warning');
        if (topoWarn) {
            if (this.state.topologyClamped) {
                topoWarn.style.display = 'block';
                topoWarn.textContent = `Clamped at max degree ${maxDeg}`;
            } else {
                topoWarn.style.display = 'none';
            }
        }
        const overlayToggle = document.getElementById('graph-overlay-toggle');
        if (overlayToggle) overlayToggle.checked = !!this.state.graphOverlayEnabled;

        const seedInput = document.getElementById('seed-input');
        if (seedInput) seedInput.value = this.state.seed ?? 1;
        const seedVal = document.getElementById('seed-value');
        if (seedVal) seedVal.textContent = this.state.seed ?? 1;

        const expWarmup = document.getElementById('exp-warmup-input');
        if (expWarmup) expWarmup.value = this.state.expWarmupSteps ?? 200;
        const expMeasure = document.getElementById('exp-measure-input');
        if (expMeasure) expMeasure.value = this.state.expMeasureSteps ?? 600;
        const expSPF = document.getElementById('exp-stepsperframe-input');
        if (expSPF) expSPF.value = this.state.expStepsPerFrame ?? 2;
        const expReadback = document.getElementById('exp-readback-input');
        if (expReadback) expReadback.value = this.state.expReadbackEvery ?? 4;
        const expReset = document.getElementById('exp-reset-toggle');
        if (expReset) expReset.checked = !!this.state.expResetAtStart;

        const statsToggle = document.getElementById('show-statistics-toggle');
        if (statsToggle) statsToggle.checked = !!this.state.showStatistics;
        const analysisGrid = document.getElementById('analysis-grid');
        if (analysisGrid) analysisGrid.style.opacity = this.state.showStatistics ? '1' : '0.7';

        const manifoldSelect = document.getElementById('manifold-select');
        if (manifoldSelect) manifoldSelect.value = this.state.manifoldMode || 's1';
        const gaugeEnabledToggle = document.getElementById('gauge-enabled-toggle');
        if (gaugeEnabledToggle) gaugeEnabledToggle.checked = !!this.state.gaugeEnabled;
        const gaugeModeSelect = document.getElementById('gauge-mode-select');
        if (gaugeModeSelect) gaugeModeSelect.value = this.state.gaugeMode || 'static';
        const gaugeInitPatternSelect = document.getElementById('gauge-init-pattern-select');
        if (gaugeInitPatternSelect) gaugeInitPatternSelect.value = this.state.gaugeInitPattern || 'zero';
        const gaugeStatus = document.getElementById('gauge-status');
        if (gaugeStatus) {
            if (this.state.manifoldMode !== 's1') {
                gaugeStatus.textContent = 'Gauge disabled outside S1 manifold.';
            } else if ((this.state.gaugeMode || 'static') === 'dynamic' && this.state.topologyMode !== 'grid') {
                gaugeStatus.textContent = 'Dynamic gauge requires grid topology (WS/BA uses static gauge links).';
            } else {
                gaugeStatus.textContent = 'S1 only. Dynamic gauge requires grid topology.';
            }
        }
        
        // Update kernel shape controls
        const kernelShapeSelect = document.getElementById('kernel-shape-select');
        if (kernelShapeSelect) kernelShapeSelect.value = this.state.kernelShape;
        
        update('kernel-orientation-slider', this.state.kernelOrientation);
        update('kernel-aspect-slider', this.state.kernelAspect);
        update('kernel-scale2-slider', this.state.kernelScale2Weight);
        update('kernel-scale3-slider', this.state.kernelScale3Weight);
        update('kernel-asymmetric-orientation-slider', this.state.kernelAsymmetricOrientation);
        update('kernel-asymmetry-slider', this.state.kernelAsymmetry);
        update('kernel-rings-slider', this.state.kernelRings);
        
        // Gabor parameters
        update('kernel-spatial-freq-slider', this.state.kernelSpatialFreqMag);
        update('kernel-freq-angle-slider', this.state.kernelSpatialFreqAngle);
        update('kernel-gabor-phase-slider', this.state.kernelGaborPhase);

        const layerSelect = document.getElementById('data-layer-select');
        if (layerSelect) layerSelect.value = this.state.colormap;
        const paletteSelect = document.getElementById('palette-select');
        if (paletteSelect) paletteSelect.value = this.state.colormapPalette;
        
        // Update kernel orientation display to show degrees
        const orientationDisp = document.getElementById('kernel-orientation-value');
        if (orientationDisp) {
            orientationDisp.textContent = Math.round(this.state.kernelOrientation * 180 / Math.PI) + '°';
        }
        const asymmetricOrientationDisp = document.getElementById('kernel-asymmetric-orientation-value');
        if (asymmetricOrientationDisp) {
            asymmetricOrientationDisp.textContent = Math.round(this.state.kernelAsymmetricOrientation * 180 / Math.PI) + '°';
        }
        
        const freqAngleDisp = document.getElementById('kernel-freq-angle-value');
        if (freqAngleDisp) {
            freqAngleDisp.textContent = Math.round(this.state.kernelSpatialFreqAngle * 180 / Math.PI) + '°';
        }
        
        const gaborPhaseDisp = document.getElementById('kernel-gabor-phase-value');
        if (gaborPhaseDisp) {
            gaborPhaseDisp.textContent = Math.round(this.state.kernelGaborPhase * 180 / Math.PI) + '°';
        }
        
        // Show/hide kernel shape-specific controls
        // Show controls based on PRIMARY kernel selection only
        const primaryShape = this.state.kernelShape;
        
        const anisotropicControls = document.getElementById('anisotropic-controls');
        if (anisotropicControls) {
            anisotropicControls.style.display = primaryShape === 1 ? 'flex' : 'none';
        }
        
        const multiscaleControls = document.getElementById('multiscale-controls');
        if (multiscaleControls) {
            multiscaleControls.style.display = primaryShape === 2 ? 'flex' : 'none';
        }
        
        const asymmetricControls = document.getElementById('asymmetric-controls');
        if (asymmetricControls) {
            asymmetricControls.style.display = primaryShape === 3 ? 'flex' : 'none';
        }
        
        const multiringControls = document.getElementById('multiring-controls');
        if (multiringControls) {
            multiringControls.style.display = primaryShape === 5 ? 'flex' : 'none';
        }
        
        const gaborControls = document.getElementById('gabor-controls');
        if (gaborControls) {
            gaborControls.style.display = primaryShape === 6 ? 'flex' : 'none';
        }
        
        // Update individual ring controls visibility and values
        // Show rings based on primary kernel (multi-ring only)
        const showRings = primaryShape === 5;
        
        for (let i = 1; i <= 5; i++) {
            const ringControl = document.getElementById(`ring-${i}-controls`);
            if (ringControl) {
                ringControl.style.display = (showRings && i <= this.state.kernelRings) ? 'flex' : 'none';
            }
            
            // Update ring slider values
            const widthSlider = document.getElementById(`ring-${i}-width-slider`);
            const weightSlider = document.getElementById(`ring-${i}-weight-slider`);
            const widthDisp = document.getElementById(`ring-${i}-width-value`);
            const weightDisp = document.getElementById(`ring-${i}-weight-value`);
            
            if (widthSlider && this.state.kernelRingWidths[i - 1] !== undefined) {
                widthSlider.value = this.state.kernelRingWidths[i - 1];
                if (widthDisp) widthDisp.textContent = this.state.kernelRingWidths[i - 1].toFixed(2);
            }
            
            if (weightSlider && this.state.kernelRingWeights[i - 1] !== undefined) {
                weightSlider.value = this.state.kernelRingWeights[i - 1];
                if (weightDisp) weightDisp.textContent = this.state.kernelRingWeights[i - 1].toFixed(2);
            }
        }
        
        // Update secondary kernel dropdown and parameters visibility
        const secondaryDropdown = document.getElementById('kernel-secondary-dropdown');
        if (secondaryDropdown) {
            // Set dropdown value (-1 for None, or the actual secondary kernel)
            const dropdownValue = this.state.kernelCompositionEnabled ? this.state.kernelSecondary : -1;
            secondaryDropdown.value = dropdownValue;
        }
        
        const secondaryParams = document.getElementById('secondary-kernel-params');
        if (secondaryParams) {
            secondaryParams.style.display = this.state.kernelCompositionEnabled ? 'flex' : 'none';
        }
        
        // Show/hide mix ratio container
        const mixRatioContainer = document.getElementById('kernel-mix-ratio-container');
        if (mixRatioContainer) {
            mixRatioContainer.style.display = this.state.kernelCompositionEnabled ? 'block' : 'none';
        }
        
        // Show/hide secondary kernel shape-specific parameter indicators
        if (this.state.kernelCompositionEnabled) {
            const secondaryShape = this.state.kernelSecondary || 0;
            
            const secAnisotropic = document.getElementById('secondary-anisotropic-controls');
            if (secAnisotropic) {
                secAnisotropic.style.display = secondaryShape === 1 ? 'flex' : 'none';
                // Update secondary slider values to match state
                if (secondaryShape === 1) {
                    update('secondary-kernel-orientation-slider', this.state.kernelOrientation);
                    update('secondary-kernel-aspect-slider', this.state.kernelAspect);
                    const secOrientDisp = document.getElementById('secondary-kernel-orientation-value');
                    if (secOrientDisp) secOrientDisp.textContent = Math.round(this.state.kernelOrientation * 180 / Math.PI) + '°';
                }
            }
            
            const secMultiscale = document.getElementById('secondary-multiscale-controls');
            if (secMultiscale) {
                secMultiscale.style.display = secondaryShape === 2 ? 'flex' : 'none';
                if (secondaryShape === 2) {
                    update('secondary-kernel-scale2-slider', this.state.kernelScale2Weight);
                    update('secondary-kernel-scale3-slider', this.state.kernelScale3Weight);
                }
            }
            
            const secAsymmetric = document.getElementById('secondary-asymmetric-controls');
            if (secAsymmetric) {
                secAsymmetric.style.display = secondaryShape === 3 ? 'flex' : 'none';
                if (secondaryShape === 3) {
                    update('secondary-kernel-asymmetric-orientation-slider', this.state.kernelAsymmetricOrientation);
                    update('secondary-kernel-asymmetry-slider', this.state.kernelAsymmetry);
                    const secAsymOrientDisp = document.getElementById('secondary-kernel-asymmetric-orientation-value');
                    if (secAsymOrientDisp) secAsymOrientDisp.textContent = Math.round(this.state.kernelAsymmetricOrientation * 180 / Math.PI) + '°';
                }
            }
            
            const secMultiring = document.getElementById('secondary-multiring-controls');
            if (secMultiring) {
                secMultiring.style.display = secondaryShape === 5 ? 'flex' : 'none';
                if (secondaryShape === 5) {
                    // Update number of rings slider
                    update('secondary-kernel-rings-slider', this.state.kernelRings);
                    
                    // Update all secondary multi-ring slider values
                    for (let i = 1; i <= 5; i++) {
                        // Show/hide individual ring controls based on kernelRings
                        const ringControl = document.getElementById(`secondary-ring-${i}-controls`);
                        if (ringControl) {
                            ringControl.style.display = (i <= this.state.kernelRings) ? 'flex' : 'none';
                        }
                        
                        // Update slider values
                        if (this.state.kernelRingWidths[i - 1] !== undefined) {
                            update(`secondary-kernel-ring${i}-width-slider`, this.state.kernelRingWidths[i - 1]);
                        }
                        if (this.state.kernelRingWeights[i - 1] !== undefined) {
                            update(`secondary-kernel-ring${i}-weight-slider`, this.state.kernelRingWeights[i - 1]);
                        }
                    }
                }
            }
            
            const secGabor = document.getElementById('secondary-gabor-controls');
            if (secGabor) {
                secGabor.style.display = secondaryShape === 6 ? 'flex' : 'none';
                if (secondaryShape === 6) {
                    update('secondary-kernel-spatial-freq-slider', this.state.kernelSpatialFreqMag);
                    update('secondary-kernel-freq-angle-slider', this.state.kernelSpatialFreqAngle);
                    update('secondary-kernel-gabor-phase-slider', this.state.kernelGaborPhase);
                    const secFreqAngleDisp = document.getElementById('secondary-kernel-freq-angle-value');
                    if (secFreqAngleDisp) secFreqAngleDisp.textContent = Math.round(this.state.kernelSpatialFreqAngle * 180 / Math.PI) + '°';
                    const secPhaseDisp = document.getElementById('secondary-kernel-gabor-phase-value');
                    if (secPhaseDisp) secPhaseDisp.textContent = Math.round(this.state.kernelGaborPhase * 180 / Math.PI) + '°';
                }
            }
        }
        
        update('kernel-mix-ratio-slider', this.state.kernelMixRatio);
        
        // Update rule mode select
        const ruleSelect = document.getElementById('rule-select');
        if (ruleSelect) ruleSelect.value = this.state.ruleMode;
        
        // Update rule description
        const ruleDesc = document.getElementById('rule-desc');
        if (ruleDesc) ruleDesc.textContent = this.ruleDescriptions[this.state.ruleMode] || '';
        
        // Show/hide rule-specific controls
        const harmonicControl = document.getElementById('harmonic-control');
        if (harmonicControl) harmonicControl.style.display = this.state.ruleMode === 3 ? 'flex' : 'none';
        
        const harmonic3Control = document.getElementById('harmonic3-control');
        if (harmonic3Control) harmonic3Control.style.display = this.state.ruleMode === 3 ? 'flex' : 'none';
        
        const delayControl = document.getElementById('delay-control');
        if (delayControl) delayControl.style.display = this.state.ruleMode === 5 ? 'flex' : 'none';
        
        const kernelSection = document.getElementById('kernel-section');
        const showKernel = this.state.ruleMode === 4 || this.state.layerKernelEnabled;
        if (kernelSection) kernelSection.style.display = showKernel ? 'flex' : 'none';
        const kernelVisuals = document.getElementById('kernel-visuals');
        if (kernelVisuals) kernelVisuals.style.display = showKernel ? 'flex' : 'none';
        
        // Update global coupling indicator and range control
        const globalInd = document.getElementById('global-indicator');
        if (globalInd) globalInd.style.display = this.state.globalCoupling ? 'flex' : 'none';
        
        const rangeControl = document.getElementById('range-control');
        const rangeSlider = document.getElementById('range-slider');
        const rangeValue = document.getElementById('range-value');
        const rangeDisabled = this.state.globalCoupling || this.state.manifoldMode !== 's1';
        if (rangeDisabled) {
            if (rangeControl) rangeControl.classList.add('disabled');
            if (rangeSlider) rangeSlider.disabled = true;
            if (rangeValue) rangeValue.style.opacity = '0.5';
        } else {
            if (rangeControl) rangeControl.classList.remove('disabled');
            if (rangeSlider) rangeSlider.disabled = false;
            if (rangeValue) rangeValue.style.opacity = '1';
        }

        if (ruleSelect) ruleSelect.disabled = this.state.manifoldMode !== 's1';
        const delaySlider = document.getElementById('delay-slider');
        if (delaySlider) delaySlider.disabled = this.state.manifoldMode !== 's1';
        const gaugeMode = this.state.gaugeMode || 'static';
        const gaugeEnabled = !!this.state.gaugeEnabled && this.state.manifoldMode === 's1';
        const gaugeModeEl = document.getElementById('gauge-mode-select');
        if (gaugeModeEl) gaugeModeEl.disabled = this.state.manifoldMode !== 's1';
        const applyGaugeInitBtn = document.getElementById('apply-gauge-init-btn');
        if (applyGaugeInitBtn) applyGaugeInitBtn.disabled = !gaugeEnabled;
        const gaugeControlIds = [
            'gauge-charge-slider',
            'gauge-matter-coupling-slider',
            'gauge-stiffness-slider',
            'gauge-damping-slider',
            'gauge-noise-slider',
            'gauge-dt-scale-slider',
            'gauge-init-pattern-select',
            'gauge-init-amplitude-slider',
            'gauge-flux-bias-slider'
        ];
        gaugeControlIds.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (id === 'gauge-stiffness-slider' || id === 'gauge-damping-slider' || id === 'gauge-noise-slider' || id === 'gauge-dt-scale-slider') {
                el.disabled = !gaugeEnabled || (gaugeMode === 'dynamic' && this.state.topologyMode !== 'grid');
            } else {
                el.disabled = !gaugeEnabled;
            }
        });
        
        const thetaSelect = document.getElementById('theta-pattern-select');
        if (thetaSelect) thetaSelect.value = this.state.thetaPattern;
        
        const omegaSelect = document.getElementById('omega-pattern-select');
        if (omegaSelect) omegaSelect.value = this.state.omegaPattern;
        
        const timeDisplay = document.getElementById('time-scale-display');
        if (timeDisplay) timeDisplay.textContent = this.state.timeScale.toFixed(1) + '×';
        
        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) pauseBtn.textContent = this.state.paused ? 'Resume' : 'Pause';
        
        const phaseSection = document.getElementById('phase-space-section');
        if (phaseSection) phaseSection.style.display = 'block';
        
        // Update smoothing mode select
        const smoothingSelect = document.getElementById('smoothing-mode-select');
        if (smoothingSelect) smoothingSelect.value = this.state.smoothingMode ?? 0;
        const surfaceSelect = document.getElementById('surface-mode-select');
        if (surfaceSelect) surfaceSelect.value = this.state.surfaceMode || 'mesh';
        
        // Update view mode buttons
        const view3dBtn = document.getElementById('view-3d-btn');
        const view2dBtn = document.getElementById('view-2d-btn');
        if (view3dBtn && view2dBtn) {
            if (this.state.viewMode === 0) {
                view3dBtn.classList.add('active');
                view2dBtn.classList.remove('active');
            } else {
                view2dBtn.classList.add('active');
                view3dBtn.classList.remove('active');
            }
        }

        // Update grid size display
        const gridSizeInput = document.getElementById('grid-size-input');
        const gridSizeSlider = document.getElementById('grid-size-slider');
        const gridSizeValue = document.getElementById('grid-size-value');
        if (gridSizeInput) gridSizeInput.value = this.state.gridSize;
        if (gridSizeSlider) gridSizeSlider.value = this.state.gridSize;
        if (gridSizeValue) gridSizeValue.textContent = this.state.gridSize;
        
        // Show/hide visualizer panel based on whether kernel is being used
        // Always show visualizer panel since it contains statistics
        const visualizerPanel = document.getElementById('visualizer-panel');
        if (visualizerPanel) {
            visualizerPanel.style.display = 'flex';
        }
        
        // Update kernel visualization if Mexican-hat rule is active
        if (this.state.ruleMode === 4 && this.cb.onDrawKernel) {
            this.cb.onDrawKernel();
        }


        // Show/hide external input controls
        const externalInputControls = document.getElementById('external-input-controls');
        if (externalInputControls) {
            externalInputControls.style.display = this.state.omegaPattern === 'image' ? 'block' : 'none';
        }

        // RC injection mode select
        const rcInjectionSelect = document.getElementById('rc-injection-mode');
        if (rcInjectionSelect) rcInjectionSelect.value = this.state.rcInjectionMode || 'freq_mod';
        
        const rcFeatureBudget = document.getElementById('rc-feature-budget');
        const rcFeatureBudgetVal = document.getElementById('rc-feature-budget-val');
        if (rcFeatureBudget) rcFeatureBudget.value = this.state.rcMaxFeatures;
        if (rcFeatureBudgetVal) rcFeatureBudgetVal.textContent = this.state.rcMaxFeatures;

        const rcEnabled = document.getElementById('rc-enabled');
        if (rcEnabled) {
            rcEnabled.checked = !!this.state.rcEnabled && this.state.manifoldMode === 's1';
            rcEnabled.disabled = this.state.manifoldMode !== 's1';
        }
        const rcContent = document.getElementById('rc-content');
        if (rcContent) rcContent.style.opacity = this.state.rcEnabled && this.state.manifoldMode === 's1' ? '1' : '0.5';
        const rcTaskSelect = document.getElementById('rc-task-select');
        if (rcTaskSelect) rcTaskSelect.value = this.state.rcTask || 'sine';
        const rcInputRegion = document.getElementById('rc-input-region');
        if (rcInputRegion) rcInputRegion.value = this.state.rcInputRegion || 'center';
        const rcOutputRegion = document.getElementById('rc-output-region');
        if (rcOutputRegion) rcOutputRegion.value = this.state.rcOutputRegion || 'random';
        const rcInputStrength = document.getElementById('rc-input-strength');
        if (rcInputStrength) rcInputStrength.value = this.state.rcInputStrength;
        const rcInputStrengthVal = document.getElementById('rc-input-strength-val');
        if (rcInputStrengthVal) rcInputStrengthVal.textContent = this.state.rcInputStrength.toFixed(1);

        // Interaction sliders
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        setVal('scale-slider', this.state.scaleBase);
        setVal('scale-radial-slider', this.state.scaleRadial);
        setVal('scale-random-slider', this.state.scaleRandom);
        setVal('scale-ring-slider', this.state.scaleRing);
        setVal('flow-radial-slider', this.state.flowRadial);
        setVal('flow-rotate-slider', this.state.flowRotate);
        setVal('flow-swirl-slider', this.state.flowSwirl);
        setVal('flow-bubble-slider', this.state.flowBubble);
        setVal('flow-ring-slider', this.state.flowRing);
        setVal('flow-vortex-slider', this.state.flowVortex);
        setVal('flow-vertical-slider', this.state.flowVertical);
        setVal('orient-radial-slider', this.state.orientRadial);
        setVal('orient-circles-slider', this.state.orientCircles);
        setVal('orient-swirl-slider', this.state.orientSwirl);
        setVal('orient-bubble-slider', this.state.orientBubble);
        setVal('orient-linear-slider', this.state.orientLinear);
}

export function updateLayerTabs() {
        const tabBar = document.getElementById('layer-tabs');
        if (!tabBar) return;
        const count = Math.max(1, this.state.layerCount ?? 1);
        tabBar.style.display = count > 1 ? 'flex' : 'none';
        tabBar.replaceChildren();
        const selected = Array.isArray(this.state.selectedLayers) ? this.state.selectedLayers : [];
        for (let i = 0; i < count; i++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            const isActive = i === (this.state.activeLayer ?? 0);
            const isSelected = selected.includes(i);
            btn.className = 'layer-tab-btn' + (isActive ? ' active' : '') + (isSelected ? ' selected' : '');
            btn.textContent = `Layer ${i}`;
            btn.addEventListener('click', (event) => {
                const multi = event.metaKey || event.ctrlKey || event.shiftKey;
                // Capture PREVIOUS selection before modifying state
                const prevActive = this.state.activeLayer ?? 0;
                const prevSelected = Array.isArray(this.state.selectedLayers) ? [...this.state.selectedLayers] : [prevActive];
                
                let nextSelected = Array.isArray(this.state.selectedLayers) ? [...this.state.selectedLayers] : [];
                if (multi) {
                    if (!nextSelected.includes(i)) {
                        nextSelected.push(i);
                    } else if (nextSelected.length > 1) {
                        nextSelected = nextSelected.filter(idx => idx !== i);
                    }
                } else {
                    nextSelected = [i];
                }
                nextSelected = nextSelected.filter((v, idx, arr) => arr.indexOf(v) === idx).sort((a, b) => a - b);
                this.state.activeLayer = i;
                this.state.selectedLayers = nextSelected;
                const activeLayerInput = document.getElementById('active-layer-input');
                const activeLayerVal = document.getElementById('active-layer-value');
                if (activeLayerInput) activeLayerInput.value = i;
                if (activeLayerVal) activeLayerVal.textContent = i;
                if (this.cb.onLayerSelect) {
                    // Pass previous selection so main.js can save params correctly
                    this.cb.onLayerSelect(i, nextSelected, prevSelected, prevActive);
                }
            });
            tabBar.appendChild(btn);
        }
        const note = document.getElementById('layer-tab-note');
        if (note) {
            const active = this.state.activeLayer ?? 0;
            const selected = Array.isArray(this.state.selectedLayers) ? this.state.selectedLayers : [active];
            const label = selected.length > 1
                ? `Editing Layers ${selected.join(', ')}`
                : `Editing Layer ${active}`;
            note.textContent = label;
        }
        const debug = document.getElementById('layer-tab-debug');
        if (debug) {
            const active = this.state.activeLayer ?? 0;
            const selected = Array.isArray(this.state.selectedLayers) ? this.state.selectedLayers : [active];
            debug.textContent = `Active: ${active} | Selected: ${selected.join(', ')}`;
        }
}
