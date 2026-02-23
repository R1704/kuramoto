import { canShowGaugeLayers, canUseGaugeOverlay, getGaugeStatusText, isGaugeS1 } from '../../utils/gaugeSupport.js';
import { updateCoreSliderSection, updateTopologySection } from './displaySections.js';
import { applyGaugePrismaticAudioGating } from './displayGating.js';

export function updateDisplay() {
        const getEl = this.getEl || ((id) => document.getElementById(id));
        // Update all sliders to match state
        const update = (id, val) => {
            const el = getEl(id);
            if(el) el.value = val;
            const disp = getEl(id.replace('slider', 'value'));
            if(disp && typeof val === 'number') disp.textContent = val.toFixed(2);
        };
        updateCoreSliderSection(this.state, update);
        const layerCount = Math.max(1, this.state.layerCount ?? 1);
        const lcVal = getEl('layer-count-value');
        if (lcVal) lcVal.textContent = layerCount;
        const layerCountInput = getEl('layer-count-input');
        if (layerCountInput) layerCountInput.value = layerCount;
        const layerKernelToggle = getEl('layer-kernel-toggle');
        if (layerKernelToggle) layerKernelToggle.checked = !!this.state.layerKernelEnabled;
        this.updateLayerTabs();
        const activeLayerInput = getEl('active-layer-input');
        const activeLayerVal = getEl('active-layer-value');
        if (!Array.isArray(this.state.selectedLayers) || this.state.selectedLayers.length === 0) {
            this.state.selectedLayers = [this.state.activeLayer ?? 0];
        }
        if (activeLayerInput) {
            activeLayerInput.max = Math.max(0, layerCount - 1);
            activeLayerInput.value = Math.min(layerCount - 1, Math.max(0, this.state.activeLayer ?? 0));
        }
        if (activeLayerVal) activeLayerVal.textContent = this.state.activeLayer ?? 0;
        const coupUpVal = getEl('layer-coupling-up-value');
        if (coupUpVal) coupUpVal.textContent = (this.state.layerCouplingUp ?? 0).toFixed(2);
        const coupDownVal = getEl('layer-coupling-down-value');
        if (coupDownVal) coupDownVal.textContent = (this.state.layerCouplingDown ?? 0).toFixed(2);
        const zOffVal = getEl('layer-z-offset-value');
        if (zOffVal) zOffVal.textContent = (this.state.layerZOffset ?? 0).toFixed(2);
        const renderAllToggle = getEl('render-all-layers-toggle');
        if (renderAllToggle) renderAllToggle.checked = !!this.state.renderAllLayers;

        updateTopologySection({ state: this.state, getEl });
        const isWS = this.state.topologyMode === 'ws' || this.state.topologyMode === 'watts_strogatz';
        const isBA = this.state.topologyMode === 'ba' || this.state.topologyMode === 'barabasi_albert';
        const maxDeg = this.state.topologyMaxDegree || 16;
        const wsK = getEl('ws-k-slider');
        const wsKVal = getEl('ws-k-value');
        if (wsK) wsK.max = maxDeg;
        if (wsK) wsK.value = this.state.topologyWSK ?? 4;
        if (wsKVal) wsKVal.textContent = this.state.topologyWSK ?? 0;
        const wsP = getEl('ws-p-slider');
        const wsPVal = getEl('ws-p-value');
        if (wsP) wsP.value = this.state.topologyWSRewire ?? 0.2;
        if (wsPVal) wsPVal.textContent = (this.state.topologyWSRewire ?? 0).toFixed(2);
        const baM0 = getEl('ba-m0-slider');
        const baM0Val = getEl('ba-m0-value');
        if (baM0) baM0.max = maxDeg;
        if (baM0) baM0.value = this.state.topologyBAM0 ?? 5;
        if (baM0Val) baM0Val.textContent = this.state.topologyBAM0 ?? 0;
        const baM = getEl('ba-m-slider');
        const baMVal = getEl('ba-m-value');
        if (baM) baM.max = maxDeg;
        if (baM) baM.value = this.state.topologyBAM ?? 3;
        if (baMVal) baMVal.textContent = this.state.topologyBAM ?? 0;
        const topoSeed = getEl('topology-seed-input');
        if (topoSeed) topoSeed.value = this.state.topologySeed ?? 1;
        const topoSeedVal = getEl('topology-seed-value');
        if (topoSeedVal) topoSeedVal.textContent = this.state.topologySeed ?? 1;
        const avg = this.state.topologyAvgDegree ?? 0;
        const metaText = `avg deg ${avg.toFixed(2)} | max ${maxDeg}`;
        const topoMeta = getEl('topology-meta');
        if (topoMeta) topoMeta.textContent = metaText;
        const topoAvgLabel = getEl('topology-avgdegree');
        if (topoAvgLabel) topoAvgLabel.textContent = metaText;
        const topoWarn = getEl('topology-warning');
        if (topoWarn) {
            if (this.state.topologyClamped) {
                topoWarn.style.display = 'block';
                topoWarn.textContent = `Clamped at max degree ${maxDeg}`;
            } else {
                topoWarn.style.display = 'none';
            }
        }
        const overlayToggle = getEl('graph-overlay-toggle');
        if (overlayToggle) overlayToggle.checked = !!this.state.graphOverlayEnabled;

        const seedInput = getEl('seed-input');
        if (seedInput) seedInput.value = this.state.seed ?? 1;
        const seedVal = getEl('seed-value');
        if (seedVal) seedVal.textContent = this.state.seed ?? 1;

        const expWarmup = getEl('exp-warmup-input');
        if (expWarmup) expWarmup.value = this.state.expWarmupSteps ?? 200;
        const expMeasure = getEl('exp-measure-input');
        if (expMeasure) expMeasure.value = this.state.expMeasureSteps ?? 600;
        const expSPF = getEl('exp-stepsperframe-input');
        if (expSPF) expSPF.value = this.state.expStepsPerFrame ?? 2;
        const expReadback = getEl('exp-readback-input');
        if (expReadback) expReadback.value = this.state.expReadbackEvery ?? 4;
        const expReset = getEl('exp-reset-toggle');
        if (expReset) expReset.checked = !!this.state.expResetAtStart;

        const statsToggle = getEl('show-statistics-toggle');
        if (statsToggle) statsToggle.checked = !!this.state.showStatistics;
        const analysisGrid = getEl('analysis-grid');
        if (analysisGrid) analysisGrid.style.opacity = this.state.showStatistics ? '1' : '0.7';

    // Organisms panel
    const organismsToggle = getEl('organisms-enabled-toggle');
    if (organismsToggle) organismsToggle.checked = !!this.state.organismsEnabled;
    const organismOverlayToggle = getEl('organism-overlay-toggle');
    if (organismOverlayToggle) organismOverlayToggle.checked = !!this.state.organismOverlay;
    update('organism-threshold-slider', this.state.organismThreshold);
    update('organism-min-area-slider', this.state.organismMinArea);

    const manifoldSelect = getEl('manifold-select');
        if (manifoldSelect) manifoldSelect.value = this.state.manifoldMode || 's1';
        const gaugeEnabledToggle = getEl('gauge-enabled-toggle');
        if (gaugeEnabledToggle) gaugeEnabledToggle.checked = !!this.state.gaugeEnabled;
        const gaugeModeSelect = getEl('gauge-mode-select');
        if (gaugeModeSelect) gaugeModeSelect.value = this.state.gaugeMode || 'static';
        const phaseLagEnabledToggle = getEl('phase-lag-enabled-toggle');
        if (phaseLagEnabledToggle) phaseLagEnabledToggle.checked = !!this.state.phaseLagEnabled;
        const prismaticStyleEnabledToggle = getEl('prismatic-style-enabled-toggle');
        if (prismaticStyleEnabledToggle) prismaticStyleEnabledToggle.checked = !!this.state.prismaticStyleEnabled;
        const prismaticDynamicsEnabledToggle = getEl('prismatic-dynamics-enabled-toggle');
        if (prismaticDynamicsEnabledToggle) prismaticDynamicsEnabledToggle.checked = !!this.state.prismaticDynamicsEnabled;
        const interactionForceEnabledToggle = getEl('interaction-force-enabled-toggle');
        if (interactionForceEnabledToggle) interactionForceEnabledToggle.checked = !!this.state.interactionForceEnabled;
        const audioEmpyreanEnabledToggle = getEl('audio-empyrean-enabled-toggle');
        if (audioEmpyreanEnabledToggle) audioEmpyreanEnabledToggle.checked = !!this.state.audioEmpyreanEnabled;
        const audioEmpyreanModeSelect = getEl('audio-empyrean-mode-select');
        if (audioEmpyreanModeSelect) audioEmpyreanModeSelect.value = this.state.audioEmpyreanMode || 'ambient';
        const audioCoherenceLockToggle = getEl('audio-coherence-lock-toggle');
        if (audioCoherenceLockToggle) audioCoherenceLockToggle.checked = this.state.audioCoherenceLock !== false;
        const prismaticStyleBaseSelect = getEl('prismatic-style-base-select');
        if (prismaticStyleBaseSelect) prismaticStyleBaseSelect.value = this.state.prismaticStyleBaseLayerMode || 'active';
        const audioStartStopBtn = getEl('audio-empyrean-start-stop-btn');
        if (audioStartStopBtn) audioStartStopBtn.textContent = this.state.audioEmpyreanRunning ? 'Stop Audio' : 'Start Audio';
        const audioSourceStatus = getEl('audio-source-status');
        if (audioSourceStatus) {
            const layerNames = [
                'Phase',
                'Velocity',
                'Curvature',
                'Order',
                'Chirality',
                'Phase+Gradient',
                'Image Texture',
                'Gauge Flux',
                'Covariant Gradient',
                'Prismatic Style'
            ];
            const layerIdx = Math.max(0, Math.min(layerNames.length - 1, Math.round(this.state.colormap || 0)));
            const source = (this.state.colormap === 9 && this.state.prismaticStyleEnabled)
                ? 'Active Prismatic style bus'
                : 'Active layer/style bus';
            const lockTxt = this.state.audioCoherenceLock === false ? 'unlock' : 'lock';
            audioSourceStatus.textContent = `Audio source: ${source} | profile: ${layerNames[layerIdx]} (${lockTxt}, ~36ms)`;
        }
        const gaugeInitPatternSelect = getEl('gauge-init-pattern-select');
        if (gaugeInitPatternSelect) gaugeInitPatternSelect.value = this.state.gaugeInitPattern || 'zero';
        const vizAutoNormToggle = getEl('viz-gauge-autonorm-toggle');
        if (vizAutoNormToggle) vizAutoNormToggle.checked = this.state.vizGaugeAutoNormalize !== false;
        const vizSignedFluxToggle = getEl('viz-gauge-signed-flux-toggle');
        if (vizSignedFluxToggle) vizSignedFluxToggle.checked = !!this.state.vizGaugeSignedFlux;
        const overlayGaugeLinksToggle = getEl('overlay-gauge-links-toggle');
        if (overlayGaugeLinksToggle) overlayGaugeLinksToggle.checked = !!this.state.overlayGaugeLinks;
        const overlayPlaquetteSignToggle = getEl('overlay-plaquette-sign-toggle');
        if (overlayPlaquetteSignToggle) overlayPlaquetteSignToggle.checked = !!this.state.overlayPlaquetteSign;
        const overlayProbeToggle = getEl('overlay-probe-toggle');
        if (overlayProbeToggle) overlayProbeToggle.checked = this.state.overlayProbeEnabled !== false;
        const gaugeGraphSeedInput = getEl('gauge-graph-seed-input');
        const gaugeGraphSeedVal = getEl('gauge-graph-seed-value');
        const gaugeGraphSeed = Math.max(1, Math.floor(this.state.gaugeGraphSeed ?? 1));
        if (gaugeGraphSeedInput) gaugeGraphSeedInput.value = gaugeGraphSeed;
        if (gaugeGraphSeedVal) gaugeGraphSeedVal.textContent = gaugeGraphSeed;
        const gaugeStatus = getEl('gauge-status');
        if (gaugeStatus) {
            gaugeStatus.textContent = getGaugeStatusText(this.state);
        }

        const dynStatus = getEl('discovery-dynamics-status');
        if (dynStatus) {
            const mode = this.state.manifoldMode || 's1';
            const topo = this.state.topologyMode || 'grid';
            const gaugeModeTxt = this.state.gaugeEnabled ? (this.state.gaugeMode || 'static') : 'off';
            const styleTxt = this.state.prismaticStyleEnabled ? 'on' : 'off';
            const dynTxt = this.state.prismaticDynamicsEnabled ? 'on' : 'off';
            const forceTxt = this.state.interactionForceEnabled ? 'on' : 'off';
            const layer = this.state.colormap ?? 0;
            const inactive = [];
            if (!isGaugeS1(this.state)) inactive.push('gauge off');
            if (this.state.gaugeEnabled && (this.state.gaugeMode || 'static') === 'dynamic' && topo !== 'grid') inactive.push('dynamic gauge gated');
            if (this.state.prismaticDynamicsEnabled && topo !== 'grid') inactive.push('prismatic dynamics grid-only');
            if (this.state.interactionForceEnabled && topo !== 'grid') inactive.push('force grid-only');
            dynStatus.textContent = `manifold:${mode} | topology:${topo} | rule:${this.state.ruleMode} | gauge:${gaugeModeTxt} | style:${styleTxt} | dyn:${dynTxt} | force:${forceTxt} | layer:${layer}${inactive.length ? ` | inactive: ${inactive.join(', ')}` : ''}`;
        }
        
        // Update kernel shape controls
        const kernelShapeSelect = getEl('kernel-shape-select');
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

        const layerSelect = getEl('data-layer-select');
        if (layerSelect) {
            const showGaugeLayers = canShowGaugeLayers(this.state);
            const gaugeFluxOption = getEl('data-layer-gauge-flux');
            const covGradOption = getEl('data-layer-cov-gradient');
            const prismaticOption = getEl('data-layer-prismatic-style');
            if (gaugeFluxOption) gaugeFluxOption.hidden = !showGaugeLayers;
            if (covGradOption) covGradOption.hidden = !showGaugeLayers;
            if (prismaticOption) prismaticOption.hidden = !showGaugeLayers;
            const safeLayer = showGaugeLayers ? this.state.colormap : Math.min(this.state.colormap, 6);
            layerSelect.value = safeLayer;
        }
        const paletteSelect = getEl('palette-select');
        if (paletteSelect) paletteSelect.value = this.state.colormapPalette;
        const vizStatus = getEl('discovery-viz-status');
        if (vizStatus) {
            const layer = this.state.colormap ?? 0;
            const extra = [];
            if (layer >= 7 && !canShowGaugeLayers(this.state)) extra.push('gauge layers hidden on S2/S3');
            if ((this.state.overlayGaugeLinks || this.state.overlayPlaquetteSign || this.state.overlayProbeEnabled) && !canUseGaugeOverlay(this.state)) {
                extra.push('overlays require S1 + grid + 2D');
            }
            vizStatus.textContent = `layer:${layer} | palette:${this.state.colormapPalette ?? 0} | fluxGain:${(this.state.vizFluxGain ?? 1).toFixed(2)} | covGain:${(this.state.vizCovGradGain ?? 1).toFixed(2)}${extra.length ? ` | note: ${extra.join(', ')}` : ''}`;
        }
        
        // Update kernel orientation display to show degrees
        const orientationDisp = getEl('kernel-orientation-value');
        if (orientationDisp) {
            orientationDisp.textContent = Math.round(this.state.kernelOrientation * 180 / Math.PI) + '°';
        }
        const asymmetricOrientationDisp = getEl('kernel-asymmetric-orientation-value');
        if (asymmetricOrientationDisp) {
            asymmetricOrientationDisp.textContent = Math.round(this.state.kernelAsymmetricOrientation * 180 / Math.PI) + '°';
        }
        
        const freqAngleDisp = getEl('kernel-freq-angle-value');
        if (freqAngleDisp) {
            freqAngleDisp.textContent = Math.round(this.state.kernelSpatialFreqAngle * 180 / Math.PI) + '°';
        }
        
        const gaborPhaseDisp = getEl('kernel-gabor-phase-value');
        if (gaborPhaseDisp) {
            gaborPhaseDisp.textContent = Math.round(this.state.kernelGaborPhase * 180 / Math.PI) + '°';
        }
        
        // Show/hide kernel shape-specific controls
        // Show controls based on PRIMARY kernel selection only
        const primaryShape = this.state.kernelShape;
        
        const anisotropicControls = getEl('anisotropic-controls');
        if (anisotropicControls) {
            anisotropicControls.style.display = primaryShape === 1 ? 'flex' : 'none';
        }
        
        const multiscaleControls = getEl('multiscale-controls');
        if (multiscaleControls) {
            multiscaleControls.style.display = primaryShape === 2 ? 'flex' : 'none';
        }
        
        const asymmetricControls = getEl('asymmetric-controls');
        if (asymmetricControls) {
            asymmetricControls.style.display = primaryShape === 3 ? 'flex' : 'none';
        }
        
        const multiringControls = getEl('multiring-controls');
        if (multiringControls) {
            multiringControls.style.display = primaryShape === 5 ? 'flex' : 'none';
        }
        
        const gaborControls = getEl('gabor-controls');
        if (gaborControls) {
            gaborControls.style.display = primaryShape === 6 ? 'flex' : 'none';
        }
        
        // Update individual ring controls visibility and values
        // Show rings based on primary kernel (multi-ring only)
        const showRings = primaryShape === 5;
        
        for (let i = 1; i <= 5; i++) {
            const ringControl = getEl(`ring-${i}-controls`);
            if (ringControl) {
                ringControl.style.display = (showRings && i <= this.state.kernelRings) ? 'flex' : 'none';
            }
            
            // Update ring slider values
            const widthSlider = getEl(`ring-${i}-width-slider`);
            const weightSlider = getEl(`ring-${i}-weight-slider`);
            const widthDisp = getEl(`ring-${i}-width-value`);
            const weightDisp = getEl(`ring-${i}-weight-value`);
            
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
        const secondaryDropdown = getEl('kernel-secondary-dropdown');
        if (secondaryDropdown) {
            // Set dropdown value (-1 for None, or the actual secondary kernel)
            const dropdownValue = this.state.kernelCompositionEnabled ? this.state.kernelSecondary : -1;
            secondaryDropdown.value = dropdownValue;
        }
        
        const secondaryParams = getEl('secondary-kernel-params');
        if (secondaryParams) {
            secondaryParams.style.display = this.state.kernelCompositionEnabled ? 'flex' : 'none';
        }
        
        // Show/hide mix ratio container
        const mixRatioContainer = getEl('kernel-mix-ratio-container');
        if (mixRatioContainer) {
            mixRatioContainer.style.display = this.state.kernelCompositionEnabled ? 'block' : 'none';
        }
        
        // Show/hide secondary kernel shape-specific parameter indicators
        if (this.state.kernelCompositionEnabled) {
            const secondaryShape = this.state.kernelSecondary || 0;
            
            const secAnisotropic = getEl('secondary-anisotropic-controls');
            if (secAnisotropic) {
                secAnisotropic.style.display = secondaryShape === 1 ? 'flex' : 'none';
                // Update secondary slider values to match state
                if (secondaryShape === 1) {
                    update('secondary-kernel-orientation-slider', this.state.kernelOrientation);
                    update('secondary-kernel-aspect-slider', this.state.kernelAspect);
                    const secOrientDisp = getEl('secondary-kernel-orientation-value');
                    if (secOrientDisp) secOrientDisp.textContent = Math.round(this.state.kernelOrientation * 180 / Math.PI) + '°';
                }
            }
            
            const secMultiscale = getEl('secondary-multiscale-controls');
            if (secMultiscale) {
                secMultiscale.style.display = secondaryShape === 2 ? 'flex' : 'none';
                if (secondaryShape === 2) {
                    update('secondary-kernel-scale2-slider', this.state.kernelScale2Weight);
                    update('secondary-kernel-scale3-slider', this.state.kernelScale3Weight);
                }
            }
            
            const secAsymmetric = getEl('secondary-asymmetric-controls');
            if (secAsymmetric) {
                secAsymmetric.style.display = secondaryShape === 3 ? 'flex' : 'none';
                if (secondaryShape === 3) {
                    update('secondary-kernel-asymmetric-orientation-slider', this.state.kernelAsymmetricOrientation);
                    update('secondary-kernel-asymmetry-slider', this.state.kernelAsymmetry);
                    const secAsymOrientDisp = getEl('secondary-kernel-asymmetric-orientation-value');
                    if (secAsymOrientDisp) secAsymOrientDisp.textContent = Math.round(this.state.kernelAsymmetricOrientation * 180 / Math.PI) + '°';
                }
            }
            
            const secMultiring = getEl('secondary-multiring-controls');
            if (secMultiring) {
                secMultiring.style.display = secondaryShape === 5 ? 'flex' : 'none';
                if (secondaryShape === 5) {
                    // Update number of rings slider
                    update('secondary-kernel-rings-slider', this.state.kernelRings);
                    
                    // Update all secondary multi-ring slider values
                    for (let i = 1; i <= 5; i++) {
                        // Show/hide individual ring controls based on kernelRings
                        const ringControl = getEl(`secondary-ring-${i}-controls`);
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
            
            const secGabor = getEl('secondary-gabor-controls');
            if (secGabor) {
                secGabor.style.display = secondaryShape === 6 ? 'flex' : 'none';
                if (secondaryShape === 6) {
                    update('secondary-kernel-spatial-freq-slider', this.state.kernelSpatialFreqMag);
                    update('secondary-kernel-freq-angle-slider', this.state.kernelSpatialFreqAngle);
                    update('secondary-kernel-gabor-phase-slider', this.state.kernelGaborPhase);
                    const secFreqAngleDisp = getEl('secondary-kernel-freq-angle-value');
                    if (secFreqAngleDisp) secFreqAngleDisp.textContent = Math.round(this.state.kernelSpatialFreqAngle * 180 / Math.PI) + '°';
                    const secPhaseDisp = getEl('secondary-kernel-gabor-phase-value');
                    if (secPhaseDisp) secPhaseDisp.textContent = Math.round(this.state.kernelGaborPhase * 180 / Math.PI) + '°';
                }
            }
        }
        
        update('kernel-mix-ratio-slider', this.state.kernelMixRatio);
        
        // Update rule mode select
        const ruleSelect = getEl('rule-select');
        if (ruleSelect) ruleSelect.value = this.state.ruleMode;
        
        // Update rule description
        const ruleDesc = getEl('rule-desc');
        if (ruleDesc) ruleDesc.textContent = this.ruleDescriptions[this.state.ruleMode] || '';
        
        // Show/hide rule-specific controls
        const harmonicControl = getEl('harmonic-control');
        if (harmonicControl) harmonicControl.style.display = this.state.ruleMode === 3 ? 'flex' : 'none';
        
        const harmonic3Control = getEl('harmonic3-control');
        if (harmonic3Control) harmonic3Control.style.display = this.state.ruleMode === 3 ? 'flex' : 'none';
        
        const delayControl = getEl('delay-control');
        if (delayControl) delayControl.style.display = this.state.ruleMode === 5 ? 'flex' : 'none';

    // Lenia growth controls
    const leniaControls = getEl('lenia-controls');
    if (leniaControls) leniaControls.style.display = this.state.ruleMode === 6 ? 'block' : 'none';
    // Growth params use 3-decimal precision
    const growthMuSlider = getEl('growth-mu-slider');
    if (growthMuSlider) growthMuSlider.value = this.state.growthMu;
    const growthMuDisp = getEl('growth-mu-value');
    if (growthMuDisp && this.state.growthMu != null) growthMuDisp.textContent = this.state.growthMu.toFixed(3);
    const growthSigmaSlider = getEl('growth-sigma-slider');
    if (growthSigmaSlider) growthSigmaSlider.value = this.state.growthSigma;
    const growthSigmaDisp = getEl('growth-sigma-value');
    if (growthSigmaDisp && this.state.growthSigma != null) growthSigmaDisp.textContent = this.state.growthSigma.toFixed(3);
    const growthModeSelect = getEl('growth-mode-select');
    if (growthModeSelect) growthModeSelect.value = this.state.growthMode;

    const kernelSection = getEl('kernel-section');
    const showKernel = this.state.ruleMode === 4 || this.state.ruleMode === 6 || this.state.layerKernelEnabled;
        if (kernelSection) kernelSection.style.display = showKernel ? 'flex' : 'none';
        const kernelVisuals = getEl('kernel-visuals');
        if (kernelVisuals) kernelVisuals.style.display = showKernel ? 'flex' : 'none';
        
        // Update global coupling indicator and range control
        const globalInd = getEl('global-indicator');
        if (globalInd) globalInd.style.display = this.state.globalCoupling ? 'flex' : 'none';
        
        const rangeControl = getEl('range-control');
        const rangeSlider = getEl('range-slider');
        const rangeValue = getEl('range-value');
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
        const delaySlider = getEl('delay-slider');
        if (delaySlider) delaySlider.disabled = this.state.manifoldMode !== 's1';
        applyGaugePrismaticAudioGating({ state: this.state, getEl });
        const vizFluxGain = getEl('viz-flux-gain-slider');
        if (vizFluxGain) vizFluxGain.disabled = this.state.manifoldMode !== 's1';
        const vizCovGain = getEl('viz-cov-grad-gain-slider');
        if (vizCovGain) vizCovGain.disabled = this.state.manifoldMode !== 's1';
        const vizAuto = getEl('viz-gauge-autonorm-toggle');
        if (vizAuto) vizAuto.disabled = this.state.manifoldMode !== 's1';
        const vizSigned = getEl('viz-gauge-signed-flux-toggle');
        if (vizSigned) vizSigned.disabled = this.state.manifoldMode !== 's1';
        const overlayGauge = getEl('overlay-gauge-links-toggle');
        if (overlayGauge) overlayGauge.disabled = this.state.manifoldMode !== 's1';
        const overlayPlaquette = getEl('overlay-plaquette-sign-toggle');
        if (overlayPlaquette) overlayPlaquette.disabled = this.state.manifoldMode !== 's1';
        const phaseLagToggle = getEl('phase-lag-enabled-toggle');
        if (phaseLagToggle) phaseLagToggle.disabled = this.state.manifoldMode !== 's1';
        const phaseLagEta = getEl('phase-lag-eta-slider');
        if (phaseLagEta) phaseLagEta.disabled = this.state.manifoldMode !== 's1' || !this.state.phaseLagEnabled;
        const sweepParamSelect = getEl('sweep-param-select');
        if (sweepParamSelect) sweepParamSelect.value = this.state.sweepParam || 'gaugeCharge';
        const sweepFromInput = getEl('sweep-from-input');
        if (sweepFromInput) sweepFromInput.value = this.state.sweepFrom ?? 0;
        const sweepToInput = getEl('sweep-to-input');
        if (sweepToInput) sweepToInput.value = this.state.sweepTo ?? 2;
        const sweepStepsInput = getEl('sweep-steps-input');
        if (sweepStepsInput) sweepStepsInput.value = this.state.sweepSteps ?? 5;
        const sweepSettleInput = getEl('sweep-settle-frames-input');
        if (sweepSettleInput) sweepSettleInput.value = this.state.sweepSettleFrames ?? 180;
        
        const thetaSelect = getEl('theta-pattern-select');
        if (thetaSelect) thetaSelect.value = this.state.thetaPattern;
        
        const omegaSelect = getEl('omega-pattern-select');
        if (omegaSelect) omegaSelect.value = this.state.omegaPattern;
        
        const timeDisplay = getEl('time-scale-display');
        if (timeDisplay) timeDisplay.textContent = this.state.timeScale.toFixed(1) + '×';
        
        const pauseBtn = getEl('pause-btn');
        if (pauseBtn) pauseBtn.textContent = this.state.paused ? 'Resume' : 'Pause';
        
        const phaseSection = getEl('phase-space-section');
        if (phaseSection) phaseSection.style.display = 'block';
        
        // Update smoothing mode select
        const smoothingSelect = getEl('smoothing-mode-select');
        if (smoothingSelect) smoothingSelect.value = this.state.smoothingMode ?? 0;
        const surfaceSelect = getEl('surface-mode-select');
        if (surfaceSelect) surfaceSelect.value = this.state.surfaceMode || 'mesh';
        
        // Update view mode buttons
        const view3dBtn = getEl('view-3d-btn');
        const view2dBtn = getEl('view-2d-btn');
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
        const gridSizeInput = getEl('grid-size-input');
        const gridSizeSlider = getEl('grid-size-slider');
        const gridSizeValue = getEl('grid-size-value');
        if (gridSizeInput) gridSizeInput.value = this.state.gridSize;
        if (gridSizeSlider) gridSizeSlider.value = this.state.gridSize;
        if (gridSizeValue) gridSizeValue.textContent = this.state.gridSize;
        
        // Show/hide visualizer panel based on whether kernel is being used
        // Always show visualizer panel since it contains statistics
        const visualizerPanel = getEl('visualizer-panel');
        if (visualizerPanel) {
            visualizerPanel.style.display = 'flex';
        }
        
        // Update kernel visualization if kernel-based rule is active
        if ((this.state.ruleMode === 4 || this.state.ruleMode === 6) && this.cb.onDrawKernel) {
            this.cb.onDrawKernel();
        }


        // Show/hide external input controls
        const externalInputControls = getEl('external-input-controls');
        if (externalInputControls) {
            externalInputControls.style.display = this.state.omegaPattern === 'image' ? 'block' : 'none';
        }

        // RC injection mode select
        const rcInjectionSelect = getEl('rc-injection-mode');
        if (rcInjectionSelect) rcInjectionSelect.value = this.state.rcInjectionMode || 'freq_mod';
        
        const rcFeatureBudget = getEl('rc-feature-budget');
        const rcFeatureBudgetVal = getEl('rc-feature-budget-val');
        if (rcFeatureBudget) rcFeatureBudget.value = this.state.rcMaxFeatures;
        if (rcFeatureBudgetVal) rcFeatureBudgetVal.textContent = this.state.rcMaxFeatures;

        const rcEnabled = getEl('rc-enabled');
        if (rcEnabled) {
            rcEnabled.checked = !!this.state.rcEnabled && this.state.manifoldMode === 's1';
            rcEnabled.disabled = this.state.manifoldMode !== 's1';
        }
        const rcContent = getEl('rc-content');
        if (rcContent) rcContent.style.opacity = this.state.rcEnabled && this.state.manifoldMode === 's1' ? '1' : '0.5';
        const rcTaskSelect = getEl('rc-task-select');
        if (rcTaskSelect) rcTaskSelect.value = this.state.rcTask || 'sine';
        const rcInputRegion = getEl('rc-input-region');
        if (rcInputRegion) rcInputRegion.value = this.state.rcInputRegion || 'center';
        const rcOutputRegion = getEl('rc-output-region');
        if (rcOutputRegion) rcOutputRegion.value = this.state.rcOutputRegion || 'random';
        const rcInputStrength = getEl('rc-input-strength');
        if (rcInputStrength) rcInputStrength.value = this.state.rcInputStrength;
        const rcInputStrengthVal = getEl('rc-input-strength-val');
        if (rcInputStrengthVal) rcInputStrengthVal.textContent = this.state.rcInputStrength.toFixed(1);

        // Interaction sliders
        const setVal = (id, val) => { const el = getEl(id); if (el) el.value = val; };
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
        const getEl = this.getEl || ((id) => document.getElementById(id));
        const tabBar = getEl('layer-tabs');
        if (!tabBar) return;
        this.clearElementCache?.();
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
                const activeLayerInput = getEl('active-layer-input');
                const activeLayerVal = getEl('active-layer-value');
                if (activeLayerInput) activeLayerInput.value = i;
                if (activeLayerVal) activeLayerVal.textContent = i;
                if (this.cb.onLayerSelect) {
                    // Pass previous selection so main.js can save params correctly
                    this.cb.onLayerSelect(i, nextSelected, prevSelected, prevActive);
                }
            });
            tabBar.appendChild(btn);
        }
        const note = getEl('layer-tab-note');
        if (note) {
            const active = this.state.activeLayer ?? 0;
            const selected = Array.isArray(this.state.selectedLayers) ? this.state.selectedLayers : [active];
            const label = selected.length > 1
                ? `Editing Layers ${selected.join(', ')}`
                : `Editing Layer ${active}`;
            note.textContent = label;
        }
        const debug = getEl('layer-tab-debug');
        if (debug) {
            const active = this.state.activeLayer ?? 0;
            const selected = Array.isArray(this.state.selectedLayers) ? this.state.selectedLayers : [active];
            debug.textContent = `Active: ${active} | Selected: ${selected.join(', ')}`;
        }
}
