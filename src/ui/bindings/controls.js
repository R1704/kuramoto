export function bindZoomPan() {
        const canvas = document.getElementById('canvas');
        if (!canvas) return;
        
        // Mouse wheel for zoom (in 2D mode)
        canvas.addEventListener('wheel', (e) => {
            if (this.state.viewMode !== 1) return; // Only in 2D mode
            e.preventDefault();

            const rect = canvas.getBoundingClientRect();
            const cx = (e.clientX - rect.left) / rect.width - 0.5;
            const cy = (1.0 - (e.clientY - rect.top) / rect.height) - 0.5;

            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const prevZoom = this.state.zoom;
            const newZoom = Math.max(1.0, Math.min(10.0, prevZoom * zoomFactor)); // keep at least canvas-sized

            // Keep cursor position stable by adjusting pan
            const invPrev = 1.0 / prevZoom;
            const invNew = 1.0 / newZoom;
            this.state.panX += cx * (invPrev - invNew);
            this.state.panY += cy * (invPrev - invNew);

            this.state.zoom = newZoom;
            this.cb.onParamChange();
        }, { passive: false });

        // Disable drag panning in 2D (keep fixed) but allow double-click reset
        canvas.addEventListener('dblclick', () => {
            if (this.state.viewMode !== 1) return;
            this.state.zoom = 1.0;
            this.state.panX = 0.0;
            this.state.panY = 0.0;
            this.cb.onParamChange();
        });
}

export function bindControls() {
        const bind = (id, key, type = 'float', evt = 'input') => {
            const el = document.getElementById(id);
            if (!el) return;
            this.elements[key] = el;
            el.addEventListener(evt, () => {
                let val = type === 'int' ? parseInt(el.value) : parseFloat(el.value);
                if (type === 'bool') val = el.checked;
                this.state[key] = val;
                
                // Update display value if exists
                const disp = document.getElementById(id.replace('slider', 'value').replace('select', 'value'));
                if (disp) disp.textContent = val.toFixed ? val.toFixed(type === 'int' ? 0 : 2) : val;
                
                this.cb.onParamChange();
            });
        };

        const basicControls = [
            ['k0-slider', 'K0'],
            ['dt-slider', 'dt'],
            ['range-slider', 'range', 'int'],
            ['harmonic-slider', 'harmonicA'],
            ['harmonic3-slider', 'harmonicB'],
            ['sigma-slider', 'sigma'],
            ['sigma2-slider', 'sigma2'],
            ['beta-slider', 'beta'],
            ['delay-slider', 'delaySteps', 'int'],
            ['noise-slider', 'noiseStrength'],
            ['leak-slider', 'leak'],
            ['gauge-charge-slider', 'gaugeCharge'],
            ['gauge-matter-coupling-slider', 'gaugeMatterCoupling'],
            ['gauge-stiffness-slider', 'gaugeStiffness'],
            ['gauge-damping-slider', 'gaugeDamping'],
            ['gauge-noise-slider', 'gaugeNoise'],
            ['gauge-dt-scale-slider', 'gaugeDtScale'],
            ['gauge-init-amplitude-slider', 'gaugeInitAmplitude'],
            ['gauge-flux-bias-slider', 'gaugeFluxBias'],
            ['phase-lag-eta-slider', 'phaseLagEta'],
            ['prismatic-k-slider', 'prismaticK'],
            ['prismatic-friction-slider', 'prismaticFriction'],
            ['prismatic-energy-decay-slider', 'prismaticEnergyDecay'],
            ['prismatic-energy-mix-slider', 'prismaticEnergyMix'],
            ['prismatic-drag-radius-px-slider', 'prismaticDragRadiusPx', 'int'],
            ['prismatic-drag-peak-force-slider', 'prismaticDragPeakForce'],
            ['prismatic-target-phase-slider', 'prismaticTargetPhase'],
            ['prismatic-cell-px-slider', 'prismaticCellPx', 'int'],
            ['prismatic-trail-fade-slider', 'prismaticTrailFade'],
            ['prismatic-glow-scale-slider', 'prismaticGlowScale', 'int'],
            ['prismatic-core-threshold-slider', 'prismaticCoreThreshold'],
            ['prismatic-core-scale-slider', 'prismaticCoreScale'],
            ['prismatic-style-blend-slider', 'prismaticStyleBlend'],
            ['interaction-force-falloff-slider', 'interactionForceFalloff'],
            ['viz-flux-gain-slider', 'vizFluxGain'],
            ['viz-cov-grad-gain-slider', 'vizCovGradGain'],
            ['audio-empyrean-master-slider', 'audioEmpyreanMaster'],
            ['audio-empyrean-bells-slider', 'audioEmpyreanBells'],
            ['audio-empyrean-bass-slider', 'audioEmpyreanBass'],
            ['audio-empyrean-reverb-mix-slider', 'audioEmpyreanReverbMix'],
            ['audio-empyrean-reverb-time-slider', 'audioEmpyreanReverbTime'],
            ['layer-coupling-up-slider', 'layerCouplingUp'],
            ['layer-coupling-down-slider', 'layerCouplingDown'],
            ['layer-z-offset-slider', 'layerZOffset'],
        ];
        basicControls.forEach(([id, key, type]) => bind(id, key, type || 'float'));

        const layerKernelToggle = document.getElementById('layer-kernel-toggle');
        if (layerKernelToggle) {
            layerKernelToggle.addEventListener('change', () => {
                this.state.layerKernelEnabled = layerKernelToggle.checked;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }

        // Topology controls
        const topologySelect = document.getElementById('topology-select');
        if (topologySelect) {
            topologySelect.addEventListener('change', () => {
                this.state.topologyMode = topologySelect.value;
                if (this.cb.onTopologyChange) this.cb.onTopologyChange();
                this.updateDisplay();
            });
        }
        const manifoldSelect = document.getElementById('manifold-select');
        if (manifoldSelect) {
            manifoldSelect.addEventListener('change', () => {
                this.state.manifoldMode = manifoldSelect.value;
                this.cb.onParamChange();
            });
        }
        const gaugeEnabledToggle = document.getElementById('gauge-enabled-toggle');
        if (gaugeEnabledToggle) {
            gaugeEnabledToggle.addEventListener('change', () => {
                this.state.gaugeEnabled = gaugeEnabledToggle.checked;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const gaugeModeSelect = document.getElementById('gauge-mode-select');
        if (gaugeModeSelect) {
            gaugeModeSelect.addEventListener('change', () => {
                this.state.gaugeMode = gaugeModeSelect.value;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const phaseLagEnabledToggle = document.getElementById('phase-lag-enabled-toggle');
        if (phaseLagEnabledToggle) {
            phaseLagEnabledToggle.addEventListener('change', () => {
                this.state.phaseLagEnabled = phaseLagEnabledToggle.checked;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const prismaticStyleEnabledToggle = document.getElementById('prismatic-style-enabled-toggle');
        if (prismaticStyleEnabledToggle) {
            prismaticStyleEnabledToggle.addEventListener('change', () => {
                this.state.prismaticStyleEnabled = prismaticStyleEnabledToggle.checked;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const prismaticDynamicsEnabledToggle = document.getElementById('prismatic-dynamics-enabled-toggle');
        if (prismaticDynamicsEnabledToggle) {
            prismaticDynamicsEnabledToggle.addEventListener('change', () => {
                this.state.prismaticDynamicsEnabled = prismaticDynamicsEnabledToggle.checked;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const interactionForceEnabledToggle = document.getElementById('interaction-force-enabled-toggle');
        if (interactionForceEnabledToggle) {
            interactionForceEnabledToggle.addEventListener('change', () => {
                this.state.interactionForceEnabled = interactionForceEnabledToggle.checked;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const audioEmpyreanEnabledToggle = document.getElementById('audio-empyrean-enabled-toggle');
        if (audioEmpyreanEnabledToggle) {
            audioEmpyreanEnabledToggle.addEventListener('change', () => {
                this.state.audioEmpyreanEnabled = audioEmpyreanEnabledToggle.checked;
                if (this.cb.onParamChange) this.cb.onParamChange();
                if (this.cb.onEmpyreanAudioEnabledChange) this.cb.onEmpyreanAudioEnabledChange(audioEmpyreanEnabledToggle.checked);
                this.updateDisplay();
            });
        }
        const audioEmpyreanStartStopBtn = document.getElementById('audio-empyrean-start-stop-btn');
        if (audioEmpyreanStartStopBtn) {
            audioEmpyreanStartStopBtn.addEventListener('click', () => {
                if (this.cb.onEmpyreanAudioToggle) this.cb.onEmpyreanAudioToggle();
            });
        }
        const audioEmpyreanModeSelect = document.getElementById('audio-empyrean-mode-select');
        if (audioEmpyreanModeSelect) {
            audioEmpyreanModeSelect.addEventListener('change', () => {
                this.state.audioEmpyreanMode = audioEmpyreanModeSelect.value;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const audioCoherenceLockToggle = document.getElementById('audio-coherence-lock-toggle');
        if (audioCoherenceLockToggle) {
            audioCoherenceLockToggle.addEventListener('change', () => {
                this.state.audioCoherenceLock = audioCoherenceLockToggle.checked;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const prismaticStyleBaseSelect = document.getElementById('prismatic-style-base-select');
        if (prismaticStyleBaseSelect) {
            prismaticStyleBaseSelect.addEventListener('change', () => {
                this.state.prismaticStyleBaseLayerMode = prismaticStyleBaseSelect.value;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const gaugeInitPatternSelect = document.getElementById('gauge-init-pattern-select');
        if (gaugeInitPatternSelect) {
            gaugeInitPatternSelect.addEventListener('change', () => {
                this.state.gaugeInitPattern = gaugeInitPatternSelect.value;
                this.cb.onParamChange();
            });
        }
        const applyGaugeInitBtn = document.getElementById('apply-gauge-init-btn');
        if (applyGaugeInitBtn) {
            applyGaugeInitBtn.addEventListener('click', () => {
                if (this.cb.onApplyGaugeInit) this.cb.onApplyGaugeInit();
            });
        }
        const gaugeGraphSeedInput = document.getElementById('gauge-graph-seed-input');
        if (gaugeGraphSeedInput) {
            gaugeGraphSeedInput.addEventListener('change', () => {
                const next = Math.max(1, parseInt(gaugeGraphSeedInput.value, 10) || 1);
                this.state.gaugeGraphSeed = next;
                const disp = document.getElementById('gauge-graph-seed-value');
                if (disp) disp.textContent = `${next}`;
                gaugeGraphSeedInput.value = `${next}`;
                this.cb.onParamChange();
            });
        }
        const vizAutoNormToggle = document.getElementById('viz-gauge-autonorm-toggle');
        if (vizAutoNormToggle) {
            vizAutoNormToggle.addEventListener('change', () => {
                this.state.vizGaugeAutoNormalize = vizAutoNormToggle.checked;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const vizSignedFluxToggle = document.getElementById('viz-gauge-signed-flux-toggle');
        if (vizSignedFluxToggle) {
            vizSignedFluxToggle.addEventListener('change', () => {
                this.state.vizGaugeSignedFlux = vizSignedFluxToggle.checked;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const overlayGaugeLinksToggle = document.getElementById('overlay-gauge-links-toggle');
        if (overlayGaugeLinksToggle) {
            overlayGaugeLinksToggle.addEventListener('change', () => {
                this.state.overlayGaugeLinks = overlayGaugeLinksToggle.checked;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const overlayPlaquetteSignToggle = document.getElementById('overlay-plaquette-sign-toggle');
        if (overlayPlaquetteSignToggle) {
            overlayPlaquetteSignToggle.addEventListener('change', () => {
                this.state.overlayPlaquetteSign = overlayPlaquetteSignToggle.checked;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const overlayProbeToggle = document.getElementById('overlay-probe-toggle');
        if (overlayProbeToggle) {
            overlayProbeToggle.addEventListener('change', () => {
                this.state.overlayProbeEnabled = overlayProbeToggle.checked;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const wsKSlider = document.getElementById('ws-k-slider');
        if (wsKSlider) {
            wsKSlider.addEventListener('change', () => {
                this.state.topologyWSK = parseInt(wsKSlider.value);
                const disp = document.getElementById('ws-k-value');
                if (disp) disp.textContent = this.state.topologyWSK;
                if (this.cb.onTopologyChange) this.cb.onTopologyChange();
            });
        }
        const wsPSlider = document.getElementById('ws-p-slider');
        if (wsPSlider) {
            wsPSlider.addEventListener('change', () => {
                this.state.topologyWSRewire = parseFloat(wsPSlider.value);
                const disp = document.getElementById('ws-p-value');
                if (disp) disp.textContent = this.state.topologyWSRewire.toFixed(2);
                if (this.cb.onTopologyChange) this.cb.onTopologyChange();
            });
        }
        const baM0Slider = document.getElementById('ba-m0-slider');
        if (baM0Slider) {
            baM0Slider.addEventListener('change', () => {
                this.state.topologyBAM0 = parseInt(baM0Slider.value);
                const disp = document.getElementById('ba-m0-value');
                if (disp) disp.textContent = this.state.topologyBAM0;
                if (this.cb.onTopologyChange) this.cb.onTopologyChange();
            });
        }
        const baMSlider = document.getElementById('ba-m-slider');
        if (baMSlider) {
            baMSlider.addEventListener('change', () => {
                this.state.topologyBAM = parseInt(baMSlider.value);
                const disp = document.getElementById('ba-m-value');
                if (disp) disp.textContent = this.state.topologyBAM;
                if (this.cb.onTopologyChange) this.cb.onTopologyChange();
            });
        }
        const topologySeedInput = document.getElementById('topology-seed-input');
        if (topologySeedInput) {
            topologySeedInput.addEventListener('change', () => {
                this.state.topologySeed = parseInt(topologySeedInput.value) || 1;
                if (this.cb.onTopologyChange) this.cb.onTopologyChange();
            });
        }
        const topoRegenBtn = document.getElementById('topology-regenerate-btn');
        if (topoRegenBtn) {
            topoRegenBtn.addEventListener('click', () => {
                if (this.cb.onTopologyRegenerate) {
                    this.cb.onTopologyRegenerate();
                } else if (this.cb.onTopologyChange) {
                    this.cb.onTopologyChange();
                }
            });
        }
        const graphOverlayToggle = document.getElementById('graph-overlay-toggle');
        if (graphOverlayToggle) {
            graphOverlayToggle.addEventListener('change', () => {
                this.state.graphOverlayEnabled = graphOverlayToggle.checked;
                if (this.cb.onOverlayToggle) {
                    this.cb.onOverlayToggle(graphOverlayToggle.checked);
                }
            });
        }

        // Scale sliders
        bind('scale-slider', 'scaleBase');
        bind('scale-radial-slider', 'scaleRadial');
        bind('scale-random-slider', 'scaleRandom');
        bind('scale-ring-slider', 'scaleRing');

        // Flow sliders
        bind('flow-radial-slider', 'flowRadial');
        bind('flow-rotate-slider', 'flowRotate');
        bind('flow-swirl-slider', 'flowSwirl');
        bind('flow-bubble-slider', 'flowBubble');
        bind('flow-ring-slider', 'flowRing');
        bind('flow-vortex-slider', 'flowVortex');
        bind('flow-vertical-slider', 'flowVertical');

        // Orientation sliders
        bind('orient-radial-slider', 'orientRadial');
        bind('orient-circles-slider', 'orientCircles');
        bind('orient-swirl-slider', 'orientSwirl');
        bind('orient-bubble-slider', 'orientBubble');
        bind('orient-linear-slider', 'orientLinear');
        

        const activeLayerInput = document.getElementById('active-layer-input');
        if (activeLayerInput) {
            activeLayerInput.addEventListener('change', () => {
                const maxLayer = Math.max(0, (this.state.layerCount ?? 1) - 1);
                let val = parseInt(activeLayerInput.value);
                if (isNaN(val)) val = 0;
                val = Math.min(maxLayer, Math.max(0, val));
                activeLayerInput.value = val;
                if (this.cb.onLayerSelect) {
                    // Capture previous state before modifying
                    const prevActive = this.state.activeLayer ?? 0;
                    const prevSelected = Array.isArray(this.state.selectedLayers) 
                        ? [...this.state.selectedLayers] 
                        : [prevActive];
                    this.state.activeLayer = val;
                    this.state.selectedLayers = [val];
                    this.cb.onLayerSelect(val, [val], prevSelected, prevActive);
                } else {
                    this.state.activeLayer = val;
                    this.cb.onParamChange();
                    this.updateDisplay();
                }
            });
        }
        const renderAllToggle = document.getElementById('render-all-layers-toggle');
        if (renderAllToggle) {
            renderAllToggle.addEventListener('change', () => {
                this.state.renderAllLayers = renderAllToggle.checked;
                if (this.cb.onParamChange) this.cb.onParamChange();
            });
        }
        
        // Kernel shape controls
        const kernelShapeSelect = document.getElementById('kernel-shape-select');
        if (kernelShapeSelect) {
            kernelShapeSelect.addEventListener('change', () => {
                this.state.kernelShape = parseInt(kernelShapeSelect.value);
                this.cb.onParamChange();
                this.updateDisplay(); // Update visibility of shape-specific controls
            });
        }
        
        bind('kernel-orientation-slider', 'kernelOrientation');
        bind('kernel-aspect-slider', 'kernelAspect');
        bind('kernel-scale2-slider', 'kernelScale2Weight');
        bind('kernel-scale3-slider', 'kernelScale3Weight');
        bind('kernel-asymmetry-slider', 'kernelAsymmetry');
        bind('kernel-rings-slider', 'kernelRings', 'int');
        
        // Gabor kernel parameters
        bind('kernel-spatial-freq-slider', 'kernelSpatialFreqMag');
        bind('kernel-freq-angle-slider', 'kernelSpatialFreqAngle');
        bind('kernel-gabor-phase-slider', 'kernelGaborPhase');
        
        // Secondary kernel parameters (bind to same state - each kernel uses what it needs)
        bind('secondary-kernel-orientation-slider', 'kernelOrientation');
        bind('secondary-kernel-aspect-slider', 'kernelAspect');
        bind('secondary-kernel-scale2-slider', 'kernelScale2Weight');
        bind('secondary-kernel-scale3-slider', 'kernelScale3Weight');
        bind('secondary-kernel-asymmetric-orientation-slider', 'kernelAsymmetricOrientation');
        bind('secondary-kernel-asymmetry-slider', 'kernelAsymmetry');
        bind('secondary-kernel-spatial-freq-slider', 'kernelSpatialFreqMag');
        bind('secondary-kernel-freq-angle-slider', 'kernelSpatialFreqAngle');
        bind('secondary-kernel-gabor-phase-slider', 'kernelGaborPhase');
        
        // Note: Secondary multi-ring controls use custom handlers below (they use arrays)
        
        // Bind individual ring width/weight sliders
        for (let i = 1; i <= 5; i++) {
            const widthSlider = document.getElementById(`ring-${i}-width-slider`);
            const weightSlider = document.getElementById(`ring-${i}-weight-slider`);
            
            if (widthSlider) {
                widthSlider.addEventListener('input', () => {
                    this.state.kernelRingWidths[i - 1] = parseFloat(widthSlider.value);
                    const disp = document.getElementById(`ring-${i}-width-value`);
                    if (disp) disp.textContent = parseFloat(widthSlider.value).toFixed(2);
                    this.cb.onParamChange();
                });
            }
            
            if (weightSlider) {
                weightSlider.addEventListener('input', () => {
                    this.state.kernelRingWeights[i - 1] = parseFloat(weightSlider.value);
                    const disp = document.getElementById(`ring-${i}-weight-value`);
                    if (disp) disp.textContent = parseFloat(weightSlider.value).toFixed(2);
                    this.cb.onParamChange();
                });
            }
        }
        
        // Special handler for kernelRings to update ring control visibility
        const ringsSlider = document.getElementById('kernel-rings-slider');
        if (ringsSlider) {
            ringsSlider.addEventListener('input', () => {
                this.state.kernelRings = parseInt(ringsSlider.value);
                const disp = document.getElementById('kernel-rings-value');
                if (disp) disp.textContent = this.state.kernelRings;
                this.updateDisplay(); // Update ring control visibility
                this.cb.onParamChange();
            });
        }
        
        // Secondary number of rings slider
        const secondaryRingsSlider = document.getElementById('secondary-kernel-rings-slider');
        if (secondaryRingsSlider) {
            secondaryRingsSlider.addEventListener('input', () => {
                this.state.kernelRings = parseInt(secondaryRingsSlider.value);
                const disp = document.getElementById('secondary-kernel-rings-value');
                if (disp) disp.textContent = this.state.kernelRings;
                // Also update primary display
                const primaryDisp = document.getElementById('kernel-rings-value');
                if (primaryDisp) primaryDisp.textContent = this.state.kernelRings;
                this.updateDisplay(); // Update ring control visibility
                this.cb.onParamChange();
            });
        }
        
        // Secondary kernel dropdown (no checkbox, -1 = None)
        const secondaryDropdown = document.getElementById('kernel-secondary-dropdown');
        if (secondaryDropdown) {
            secondaryDropdown.addEventListener('change', () => {
                const secondaryValue = parseInt(secondaryDropdown.value);
                this.state.kernelSecondary = secondaryValue;
                this.state.kernelCompositionEnabled = secondaryValue >= 0; // Enable composition if not "None"
                
                // Show/hide secondary kernel parameters
                const secondaryParams = document.getElementById('secondary-kernel-params');
                if (secondaryParams) {
                    secondaryParams.style.display = secondaryValue >= 0 ? 'flex' : 'none';
                }
                
                // Show/hide mix ratio container
                const mixRatioContainer = document.getElementById('kernel-mix-ratio-container');
                if (mixRatioContainer) {
                    mixRatioContainer.style.display = secondaryValue >= 0 ? 'block' : 'none';
                }
                
                this.updateDisplay(); // Update shape-specific controls visibility
                this.cb.onParamChange();
            });
        }
        
        const mixRatioSlider = document.getElementById('kernel-mix-ratio-slider');
        if (mixRatioSlider) {
            mixRatioSlider.addEventListener('input', () => {
                this.state.kernelMixRatio = parseFloat(mixRatioSlider.value);
                const disp = document.getElementById('kernel-mix-ratio-value');
                if (disp) disp.textContent = parseFloat(mixRatioSlider.value).toFixed(2);
                this.cb.onParamChange();
            });
        }
        
        // Update kernel orientation display to show degrees (for anisotropic)
        const orientationEl = document.getElementById('kernel-orientation-slider');
        if (orientationEl) {
            orientationEl.addEventListener('input', () => {
                const radians = parseFloat(orientationEl.value);
                this.state.kernelOrientation = radians;
                const disp = document.getElementById('kernel-orientation-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        // Update asymmetric orientation display (separate slider)
        const asymmetricOrientationEl = document.getElementById('kernel-asymmetric-orientation-slider');
        if (asymmetricOrientationEl) {
            asymmetricOrientationEl.addEventListener('input', () => {
                const radians = parseFloat(asymmetricOrientationEl.value);
                this.state.kernelAsymmetricOrientation = radians;
                const disp = document.getElementById('kernel-asymmetric-orientation-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        // Gabor frequency angle display (in degrees)
        const freqAngleEl = document.getElementById('kernel-freq-angle-slider');
        if (freqAngleEl) {
            freqAngleEl.addEventListener('input', () => {
                const radians = parseFloat(freqAngleEl.value);
                this.state.kernelSpatialFreqAngle = radians;
                const disp = document.getElementById('kernel-freq-angle-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        // Gabor phase display (in degrees)
        const gaborPhaseEl = document.getElementById('kernel-gabor-phase-slider');
        if (gaborPhaseEl) {
            gaborPhaseEl.addEventListener('input', () => {
                const radians = parseFloat(gaborPhaseEl.value);
                this.state.kernelGaborPhase = radians;
                const disp = document.getElementById('kernel-gabor-phase-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        // Secondary kernel angle displays (all in degrees)
        const secOrientationEl = document.getElementById('secondary-kernel-orientation-slider');
        if (secOrientationEl) {
            secOrientationEl.addEventListener('input', () => {
                const radians = parseFloat(secOrientationEl.value);
                this.state.kernelOrientation = radians;
                const disp = document.getElementById('secondary-kernel-orientation-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                // Also update primary display
                const primaryDisp = document.getElementById('kernel-orientation-value');
                if (primaryDisp) primaryDisp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        const secAsymOrientationEl = document.getElementById('secondary-kernel-asymmetric-orientation-slider');
        if (secAsymOrientationEl) {
            secAsymOrientationEl.addEventListener('input', () => {
                const radians = parseFloat(secAsymOrientationEl.value);
                this.state.kernelAsymmetricOrientation = radians;
                const disp = document.getElementById('secondary-kernel-asymmetric-orientation-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                // Also update primary display
                const primaryDisp = document.getElementById('kernel-asymmetric-orientation-value');
                if (primaryDisp) primaryDisp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        const secFreqAngleEl = document.getElementById('secondary-kernel-freq-angle-slider');
        if (secFreqAngleEl) {
            secFreqAngleEl.addEventListener('input', () => {
                const radians = parseFloat(secFreqAngleEl.value);
                this.state.kernelSpatialFreqAngle = radians;
                const disp = document.getElementById('secondary-kernel-freq-angle-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                // Also update primary display
                const primaryDisp = document.getElementById('kernel-freq-angle-value');
                if (primaryDisp) primaryDisp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        const secGaborPhaseEl = document.getElementById('secondary-kernel-gabor-phase-slider');
        if (secGaborPhaseEl) {
            secGaborPhaseEl.addEventListener('input', () => {
                const radians = parseFloat(secGaborPhaseEl.value);
                this.state.kernelGaborPhase = radians;
                const disp = document.getElementById('secondary-kernel-gabor-phase-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                // Also update primary display
                const primaryDisp = document.getElementById('kernel-gabor-phase-value');
                if (primaryDisp) primaryDisp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        // Secondary multi-ring controls need custom handlers (arrays, not simple bind)
        for (let i = 1; i <= 5; i++) {
            const widthSlider = document.getElementById(`secondary-kernel-ring${i}-width-slider`);
            const weightSlider = document.getElementById(`secondary-kernel-ring${i}-weight-slider`);
            
            if (widthSlider) {
                widthSlider.addEventListener('input', () => {
                    this.state.kernelRingWidths[i - 1] = parseFloat(widthSlider.value);
                    const disp = document.getElementById(`secondary-kernel-ring${i}-width-value`);
                    if (disp) disp.textContent = parseFloat(widthSlider.value).toFixed(2);
                    // Also update primary display
                    const primaryDisp = document.getElementById(`ring-${i}-width-value`);
                    if (primaryDisp) primaryDisp.textContent = parseFloat(widthSlider.value).toFixed(2);
                    this.cb.onParamChange();
                });
            }
            
            if (weightSlider) {
                weightSlider.addEventListener('input', () => {
                    this.state.kernelRingWeights[i - 1] = parseFloat(weightSlider.value);
                    const disp = document.getElementById(`secondary-kernel-ring${i}-weight-value`);
                    if (disp) disp.textContent = parseFloat(weightSlider.value).toFixed(2);
                    // Also update primary display
                    const primaryDisp = document.getElementById(`ring-${i}-weight-value`);
                    if (primaryDisp) primaryDisp.textContent = parseFloat(weightSlider.value).toFixed(2);
                    this.cb.onParamChange();
                });
            }
        }
        
        // Rule select with special handling to update UI visibility
        const ruleSelect = document.getElementById('rule-select');
        if (ruleSelect) {
            ruleSelect.addEventListener('change', () => {
                this.state.ruleMode = parseInt(ruleSelect.value);
                this.cb.onParamChange();
                this.updateDisplay(); // Update visibility of rule-specific controls
            });
        }

        const growthModeSelect = document.getElementById('growth-mode-select');
        if (growthModeSelect) {
            growthModeSelect.addEventListener('change', () => {
                this.state.growthMode = parseInt(growthModeSelect.value);
                this.cb.onParamChange();
            });
        }

        // Growth params with 3-decimal precision display
        for (const [id, key] of [['growth-mu-slider', 'growthMu'], ['growth-sigma-slider', 'growthSigma']]) {
            const el = document.getElementById(id);
            if (!el) continue;
            this.elements[key] = el;
            el.addEventListener('input', () => {
                const val = parseFloat(el.value);
                this.state[key] = val;
                const disp = document.getElementById(id.replace('slider', 'value'));
                if (disp) disp.textContent = val.toFixed(3);
                this.cb.onParamChange();
            });
        }

        bind('data-layer-select', 'colormap', 'int', 'change');
        bind('palette-select', 'colormapPalette', 'int', 'change');

        // Respect state loaded from URL/defaults; do not force analysis toggles on.
        const statsToggle = document.getElementById('show-statistics-toggle');
        if (statsToggle) {
            statsToggle.addEventListener('change', () => {
                this.state.showStatistics = !!statsToggle.checked;
                if (this.cb.onToggleStatistics) {
                    this.cb.onToggleStatistics(this.state.showStatistics);
                } else if (this.cb.onParamChange) {
                    this.cb.onParamChange();
                }
                this.updateDisplay();
            });
        }
        // Organism detection controls
        const organismsToggle = document.getElementById('organisms-enabled-toggle');
        if (organismsToggle) {
            organismsToggle.addEventListener('change', () => {
                this.state.organismsEnabled = !!organismsToggle.checked;
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        const organismOverlayToggle = document.getElementById('organism-overlay-toggle');
        if (organismOverlayToggle) {
            organismOverlayToggle.addEventListener('change', () => {
                this.state.organismOverlay = !!organismOverlayToggle.checked;
                this.cb.onParamChange();
            });
        }
        const organismThresholdSlider = document.getElementById('organism-threshold-slider');
        if (organismThresholdSlider) {
            this.elements.organismThreshold = organismThresholdSlider;
            organismThresholdSlider.addEventListener('input', () => {
                const val = parseFloat(organismThresholdSlider.value);
                this.state.organismThreshold = val;
                const disp = document.getElementById('organism-threshold-value');
                if (disp) disp.textContent = val.toFixed(2);
                this.cb.onParamChange();
            });
        }
        const organismMinAreaSlider = document.getElementById('organism-min-area-slider');
        if (organismMinAreaSlider) {
            this.elements.organismMinArea = organismMinAreaSlider;
            organismMinAreaSlider.addEventListener('input', () => {
                const val = parseInt(organismMinAreaSlider.value);
                this.state.organismMinArea = val;
                const disp = document.getElementById('organism-min-area-value');
                if (disp) disp.textContent = val;
                this.cb.onParamChange();
            });
        }

        // Surface mode (3D)
        const surfaceSelect = document.getElementById('surface-mode-select');
        if (surfaceSelect) {
            surfaceSelect.addEventListener('change', () => {
                this.state.surfaceMode = surfaceSelect.value;
                if (this.cb.onSurfaceModeChange) {
                    this.cb.onSurfaceModeChange(surfaceSelect.value);
                } else if (this.cb.onParamChange) {
                    this.cb.onParamChange();
                }
            });
        }
        bind('omega-amplitude-slider', 'omegaAmplitude');
        
        
        // Smoothing mode select
        const smoothingSelect = document.getElementById('smoothing-mode-select');
        if (smoothingSelect) {
            smoothingSelect.addEventListener('change', () => {
                this.state.smoothingMode = parseInt(smoothingSelect.value);
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        
        // Selects for patterns
        // Import updateURLFromState lazily (avoid circular import issues) and call when patterns change
        const bindSelect = (id, key) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', () => {
                this.state[key] = el.value;
                this.cb.onPatternChange(key); // Trigger pattern application
                try {
                    // dynamic import to avoid static circular dependency
                    this.syncURL();
                } catch (e) {}
            });
        };
        
        bindSelect('theta-pattern-select', 'thetaPattern');
        bindSelect('omega-pattern-select', 'omegaPattern');

        const seedInput = document.getElementById('seed-input');
        if (seedInput) {
            seedInput.addEventListener('change', () => {
                const v = parseInt(seedInput.value);
                this.state.seed = Number.isFinite(v) ? v : this.state.seed;
                if (this.cb.onSeedChange) {
                    this.cb.onSeedChange(this.state.seed);
                } else if (this.cb.onParamChange) {
                    this.cb.onParamChange();
                }
                this.updateDisplay();
            });
        }
        const reseedBtn = document.getElementById('reseed-btn');
        if (reseedBtn) {
            reseedBtn.addEventListener('click', () => {
                if (this.cb.onReseed) {
                    this.cb.onReseed();
                }
            });
        }

        const expWarmup = document.getElementById('exp-warmup-input');
        const expMeasure = document.getElementById('exp-measure-input');
        const expSPF = document.getElementById('exp-stepsperframe-input');
        const expReadback = document.getElementById('exp-readback-input');
        const expReset = document.getElementById('exp-reset-toggle');
        const expRunBtn = document.getElementById('exp-run-btn');
        const expCancelBtn = document.getElementById('exp-cancel-btn');
        const expExportBtn = document.getElementById('exp-export-btn');

        const onExpConfig = () => {
            this.state.expWarmupSteps = parseInt(expWarmup?.value || this.state.expWarmupSteps || 0);
            this.state.expMeasureSteps = parseInt(expMeasure?.value || this.state.expMeasureSteps || 1);
            this.state.expStepsPerFrame = parseInt(expSPF?.value || this.state.expStepsPerFrame || 1);
            this.state.expReadbackEvery = parseInt(expReadback?.value || this.state.expReadbackEvery || 1);
            this.state.expResetAtStart = !!expReset?.checked;
            if (this.cb.onExperimentConfigChange) {
                this.cb.onExperimentConfigChange();
            }
        };

        if (expWarmup) expWarmup.addEventListener('change', () => { onExpConfig(); this.updateDisplay(); });
        if (expMeasure) expMeasure.addEventListener('change', () => { onExpConfig(); this.updateDisplay(); });
        if (expSPF) expSPF.addEventListener('change', () => { onExpConfig(); this.updateDisplay(); });
        if (expReadback) expReadback.addEventListener('change', () => { onExpConfig(); this.updateDisplay(); });
        if (expReset) expReset.addEventListener('change', () => { onExpConfig(); this.updateDisplay(); });
        if (expRunBtn) expRunBtn.addEventListener('click', () => { if (this.cb.onExperimentRun) this.cb.onExperimentRun(); });
        if (expCancelBtn) expCancelBtn.addEventListener('click', () => { if (this.cb.onExperimentCancel) this.cb.onExperimentCancel(); });
        if (expExportBtn) expExportBtn.addEventListener('click', () => { if (this.cb.onExperimentExport) this.cb.onExperimentExport(); });

        // External input controls (image/video)
        this.externalInputCanvas = document.getElementById('image-preview');
        this.externalInputCtx = this.externalInputCanvas ? this.externalInputCanvas.getContext('2d') : null;
        this.videoElement = document.getElementById('video-input');
        this.videoStream = null;
        
        const imageUpload = document.getElementById('image-upload');
        if (imageUpload) {
            imageUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const img = new Image();
                    img.onload = () => {
                        this.loadExternalImage(img);
                    };
                    img.src = URL.createObjectURL(file);
                }
            });
        }
        
        const webcamBtn = document.getElementById('webcam-btn');
        if (webcamBtn) {
            webcamBtn.onclick = () => this.toggleWebcam();
        }
        
        // Show/hide external input controls based on pattern selection
        const omegaPatternSelect = document.getElementById('omega-pattern-select');
        if (omegaPatternSelect) {
            omegaPatternSelect.addEventListener('change', () => {
                this.updateDisplay();
            });
        }

        // Time controls
        const timeDisplay = document.getElementById('time-scale-display');
        const updateTimeDisplay = () => {
            if(timeDisplay) timeDisplay.textContent = this.state.timeScale.toFixed(1) + '×';
        };

        document.getElementById('slow-btn').onclick = () => {
            this.state.timeScale = Math.max(0.1, this.state.timeScale * 0.5);
            updateTimeDisplay();
            this.cb.onParamChange();
        };
        document.getElementById('fast-btn').onclick = () => {
            this.state.timeScale = Math.min(4.0, this.state.timeScale * 2.0);
            updateTimeDisplay();
            this.cb.onParamChange();
        };
        document.getElementById('normal-btn').onclick = () => {
            this.state.timeScale = 1.0;
            updateTimeDisplay();
            this.cb.onParamChange();
        };
        
        // Buttons
        document.getElementById('pause-btn').onclick = () => this.cb.onPause();
        document.getElementById('reset-btn').onclick = () => this.cb.onReset();
        document.getElementById('randomize-btn').onclick = () => this.cb.onRandomize();
        
        // Presets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.onclick = () => this.cb.onPreset(btn.dataset.preset);
        });

        const applyInitBtn = document.getElementById('apply-init-btn');
        if (applyInitBtn) {
            applyInitBtn.onclick = () => {
                if (this.cb.onApplyInit) this.cb.onApplyInit();
            };
        }
        
        // View mode toggle
        const view3dBtn = document.getElementById('view-3d-btn');
        const view2dBtn = document.getElementById('view-2d-btn');
        if (view3dBtn && view2dBtn) {
            view3dBtn.onclick = () => {
                this.state.viewMode = 0;
                view3dBtn.classList.add('active');
                view2dBtn.classList.remove('active');
                this.cb.onParamChange();
            };
            view2dBtn.onclick = () => {
                this.state.viewMode = 1;
                view2dBtn.classList.add('active');
                view3dBtn.classList.remove('active');
                this.cb.onParamChange();
            };
        }
        
        // Grid size controls - enforce 64-pixel alignment for bytesPerRow texture copy compatibility
        // WebGPU requires bytesPerRow (grid_size * 4 bytes) to be 256-byte aligned
        // So grid_size must be multiple of 64 (64 * 4 = 256)
        const gridSizeInput = document.getElementById('grid-size-input');
        const gridSizeSlider = document.getElementById('grid-size-slider');
        const gridSizeValue = document.getElementById('grid-size-value');
        const applyGridBtn = document.getElementById('apply-grid-btn');
        const layerCountInput = document.getElementById('layer-count-input');
        const applyLayerCountBtn = document.getElementById('apply-layer-count-btn');
        
        // Helper to align grid size to nearest multiple of 64
        const alignGridSize = (size) => {
            const aligned = Math.round(size / 64) * 64;
            // Clamp to valid range
            return Math.max(64, Math.min(1024, aligned));
        };
        
        if (gridSizeInput && gridSizeValue) {
            gridSizeInput.oninput = () => {
                const requested = parseInt(gridSizeInput.value);
                const aligned = alignGridSize(requested);

                gridSizeValue.textContent = aligned;
                if (gridSizeSlider) {
                    gridSizeSlider.value = aligned;
                }
                if (aligned !== requested) {
                    gridSizeInput.value = aligned;
                }
            };
        }

        if (gridSizeSlider && gridSizeValue) {
            gridSizeSlider.oninput = () => {
                const requested = parseInt(gridSizeSlider.value);
                const aligned = alignGridSize(requested);

                gridSizeValue.textContent = aligned;
                if (gridSizeInput) {
                    gridSizeInput.value = aligned;
                }
                if (aligned !== requested) {
                    gridSizeSlider.value = aligned;
                }
            };
        }
        
        if (applyGridBtn && gridSizeInput) {
            applyGridBtn.onclick = () => {
                const requested = parseInt(gridSizeInput.value);
                const aligned = alignGridSize(requested);
                
                // Warn user if adjustment was made
                if (aligned !== requested) {
                    console.warn(`Grid size ${requested} adjusted to ${aligned} (must be multiple of 64 for bytesPerRow alignment)`);
                }
                
                if (this.cb.onResizeGrid) {
                    this.cb.onResizeGrid(aligned);
                }
            };
        }

        if (applyLayerCountBtn && layerCountInput) {
            applyLayerCountBtn.onclick = () => {
                const requested = parseInt(layerCountInput.value);
                const clamped = Math.max(1, Math.min(8, requested));
                if (clamped !== requested) {
                    layerCountInput.value = clamped;
                }
                if (this.cb.onLayerCountChange) {
                    this.cb.onLayerCountChange(clamped);
                }
            };
        }
        
        // Statistics panel controls
        const kscanBtn = document.getElementById('kscan-btn');
        if (kscanBtn) {
            kscanBtn.onclick = () => {
                if (this.cb.onStartKScan) {
                    this.cb.onStartKScan();
                }
            };
        }
        
        const findKcBtn = document.getElementById('findkc-btn');
        if (findKcBtn) {
            findKcBtn.onclick = () => {
                if (this.cb.onFindKc) {
                    this.cb.onFindKc();
                }
            };
        }
        
        const exportStatsBtn = document.getElementById('export-stats-btn');
        if (exportStatsBtn) {
            exportStatsBtn.onclick = () => {
                if (this.cb.onExportStats) {
                    this.cb.onExportStats();
                }
            };
        }
        
        const exportPDBtn = document.getElementById('export-pd-btn');
        if (exportPDBtn) {
            exportPDBtn.onclick = () => {
                if (this.cb.onExportPhaseDiagram) {
                    this.cb.onExportPhaseDiagram();
                }
            };
        }

        const sweepParamSelect = document.getElementById('sweep-param-select');
        const sweepFromInput = document.getElementById('sweep-from-input');
        const sweepToInput = document.getElementById('sweep-to-input');
        const sweepStepsInput = document.getElementById('sweep-steps-input');
        const sweepSettleInput = document.getElementById('sweep-settle-frames-input');
        const sweepRunBtn = document.getElementById('sweep-run-btn');
        const sweepCancelBtn = document.getElementById('sweep-cancel-btn');
        const sweepExportJsonBtn = document.getElementById('sweep-export-json-btn');
        const sweepExportCsvBtn = document.getElementById('sweep-export-csv-btn');
        const sweepRangeFrustrationBtn = document.getElementById('sweep-range-frustration-btn');
        const sweepRangeFeedbackBtn = document.getElementById('sweep-range-feedback-btn');
        const sweepRangeStiffnessBtn = document.getElementById('sweep-range-stiffness-btn');

        const onSweepConfig = () => {
            this.state.sweepParam = sweepParamSelect?.value || this.state.sweepParam || 'gaugeCharge';
            this.state.sweepFrom = parseFloat(sweepFromInput?.value ?? this.state.sweepFrom ?? 0);
            this.state.sweepTo = parseFloat(sweepToInput?.value ?? this.state.sweepTo ?? 2);
            this.state.sweepSteps = Math.max(2, Math.min(12, parseInt(sweepStepsInput?.value ?? this.state.sweepSteps ?? 5, 10) || 5));
            this.state.sweepSettleFrames = Math.max(30, Math.min(1200, parseInt(sweepSettleInput?.value ?? this.state.sweepSettleFrames ?? 180, 10) || 180));
            if (sweepStepsInput) sweepStepsInput.value = `${this.state.sweepSteps}`;
            if (sweepSettleInput) sweepSettleInput.value = `${this.state.sweepSettleFrames}`;
            if (this.cb.onSweepConfigChange) this.cb.onSweepConfigChange();
        };

        if (sweepParamSelect) sweepParamSelect.addEventListener('change', () => { onSweepConfig(); this.updateDisplay(); });
        if (sweepFromInput) sweepFromInput.addEventListener('change', () => { onSweepConfig(); this.updateDisplay(); });
        if (sweepToInput) sweepToInput.addEventListener('change', () => { onSweepConfig(); this.updateDisplay(); });
        if (sweepStepsInput) sweepStepsInput.addEventListener('change', () => { onSweepConfig(); this.updateDisplay(); });
        if (sweepSettleInput) sweepSettleInput.addEventListener('change', () => { onSweepConfig(); this.updateDisplay(); });
        if (sweepRunBtn) sweepRunBtn.addEventListener('click', () => { if (this.cb.onRunSweep) this.cb.onRunSweep(); });
        if (sweepCancelBtn) sweepCancelBtn.addEventListener('click', () => { if (this.cb.onCancelSweep) this.cb.onCancelSweep(); });
        if (sweepExportJsonBtn) sweepExportJsonBtn.addEventListener('click', () => { if (this.cb.onExportSweepJSON) this.cb.onExportSweepJSON(); });
        if (sweepExportCsvBtn) sweepExportCsvBtn.addEventListener('click', () => { if (this.cb.onExportSweepCSV) this.cb.onExportSweepCSV(); });
        if (sweepRangeFrustrationBtn) {
            sweepRangeFrustrationBtn.addEventListener('click', () => {
                if (sweepParamSelect) sweepParamSelect.value = 'gaugeCharge';
                if (sweepFromInput) sweepFromInput.value = '0';
                if (sweepToInput) sweepToInput.value = '2.5';
                if (sweepStepsInput) sweepStepsInput.value = '6';
                if (sweepSettleInput) sweepSettleInput.value = '180';
                onSweepConfig();
                this.updateDisplay();
            });
        }
        if (sweepRangeFeedbackBtn) {
            sweepRangeFeedbackBtn.addEventListener('click', () => {
                if (sweepParamSelect) sweepParamSelect.value = 'gaugeMatterCoupling';
                if (sweepFromInput) sweepFromInput.value = '0.5';
                if (sweepToInput) sweepToInput.value = '2.5';
                if (sweepStepsInput) sweepStepsInput.value = '6';
                if (sweepSettleInput) sweepSettleInput.value = '220';
                onSweepConfig();
                this.updateDisplay();
            });
        }
        if (sweepRangeStiffnessBtn) {
            sweepRangeStiffnessBtn.addEventListener('click', () => {
                if (sweepParamSelect) sweepParamSelect.value = 'gaugeStiffness';
                if (sweepFromInput) sweepFromInput.value = '0.05';
                if (sweepToInput) sweepToInput.value = '0.9';
                if (sweepStepsInput) sweepStepsInput.value = '6';
                if (sweepSettleInput) sweepSettleInput.value = '220';
                onSweepConfig();
                this.updateDisplay();
            });
        }

        const compareCaptureABtn = document.getElementById('compare-capture-a-btn');
        const compareCaptureBBtn = document.getElementById('compare-capture-b-btn');
        const compareRestoreABtn = document.getElementById('compare-restore-a-btn');
        const compareRestoreBBtn = document.getElementById('compare-restore-b-btn');
        if (compareCaptureABtn) compareCaptureABtn.addEventListener('click', () => { if (this.cb.onCompareCapture) this.cb.onCompareCapture('a'); });
        if (compareCaptureBBtn) compareCaptureBBtn.addEventListener('click', () => { if (this.cb.onCompareCapture) this.cb.onCompareCapture('b'); });
        if (compareRestoreABtn) compareRestoreABtn.addEventListener('click', () => { if (this.cb.onCompareRestore) this.cb.onCompareRestore('a'); });
        if (compareRestoreBBtn) compareRestoreBBtn.addEventListener('click', () => { if (this.cb.onCompareRestore) this.cb.onCompareRestore('b'); });
}
