import { alignGridSize, bindAction, bindSelect, bindStateValue, bindToggle } from './bindHelpers.js';

export function bindZoomPan() {
        const getEl = this.getEl || ((id) => document.getElementById(id));
        const canvas = getEl('canvas');
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
        const getEl = this.getEl || ((id) => document.getElementById(id));
        const callbackProxy = {
            onParamChange: this.cb.onParamChange,
            updateDisplay: this.updateDisplay?.bind(this)
        };
        const bind = (id, key, type = 'float', evt = 'input') => bindStateValue({
            getEl,
            elements: this.elements,
            state: this.state,
            callbacks: this.cb,
            id,
            key,
            type,
            evt
        });

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

        bindToggle({
            getEl,
            state: this.state,
            callbacks: callbackProxy,
            id: 'layer-kernel-toggle',
            key: 'layerKernelEnabled',
            refreshDisplay: true
        });

        // Topology controls
        bindSelect({
            getEl,
            state: this.state,
            callbacks: callbackProxy,
            id: 'topology-select',
            key: 'topologyMode',
            onParam: false,
            onChange: () => this.cb.onTopologyChange?.(),
            refreshDisplay: true
        });
        bindSelect({
            getEl,
            state: this.state,
            callbacks: callbackProxy,
            id: 'manifold-select',
            key: 'manifoldMode'
        });
        [
            'gauge-enabled-toggle:gaugeEnabled',
            'phase-lag-enabled-toggle:phaseLagEnabled',
            'prismatic-style-enabled-toggle:prismaticStyleEnabled',
            'prismatic-dynamics-enabled-toggle:prismaticDynamicsEnabled',
            'interaction-force-enabled-toggle:interactionForceEnabled',
            'audio-coherence-lock-toggle:audioCoherenceLock'
        ].forEach((entry) => {
            const [id, key] = entry.split(':');
            bindToggle({
                getEl,
                state: this.state,
                callbacks: callbackProxy,
                id,
                key,
                refreshDisplay: true
            });
        });
        bindToggle({
            getEl,
            state: this.state,
            callbacks: callbackProxy,
            id: 'audio-empyrean-enabled-toggle',
            key: 'audioEmpyreanEnabled',
            refreshDisplay: true,
            onChange: (enabled) => this.cb.onEmpyreanAudioEnabledChange?.(enabled)
        });
        bindSelect({
            getEl,
            state: this.state,
            callbacks: callbackProxy,
            id: 'gauge-mode-select',
            key: 'gaugeMode',
            refreshDisplay: true
        });
        bindSelect({
            getEl,
            state: this.state,
            callbacks: callbackProxy,
            id: 'audio-empyrean-mode-select',
            key: 'audioEmpyreanMode',
            refreshDisplay: true
        });
        bindSelect({
            getEl,
            state: this.state,
            callbacks: callbackProxy,
            id: 'prismatic-style-base-select',
            key: 'prismaticStyleBaseLayerMode',
            refreshDisplay: true
        });
        bindSelect({
            getEl,
            state: this.state,
            callbacks: callbackProxy,
            id: 'gauge-init-pattern-select',
            key: 'gaugeInitPattern'
        });
        bindAction({
            getEl,
            id: 'audio-empyrean-start-stop-btn',
            onClick: () => this.cb.onEmpyreanAudioToggle?.()
        });
        bindAction({
            getEl,
            id: 'apply-gauge-init-btn',
            onClick: () => this.cb.onApplyGaugeInit?.()
        });
        const gaugeGraphSeedInput = getEl('gauge-graph-seed-input');
        if (gaugeGraphSeedInput) {
            gaugeGraphSeedInput.addEventListener('change', () => {
                const next = Math.max(1, parseInt(gaugeGraphSeedInput.value, 10) || 1);
                this.state.gaugeGraphSeed = next;
                const disp = getEl('gauge-graph-seed-value');
                if (disp) disp.textContent = `${next}`;
                gaugeGraphSeedInput.value = `${next}`;
                this.cb.onParamChange();
            });
        }
        [
            'viz-gauge-autonorm-toggle:vizGaugeAutoNormalize',
            'viz-gauge-signed-flux-toggle:vizGaugeSignedFlux',
            'overlay-gauge-links-toggle:overlayGaugeLinks',
            'overlay-plaquette-sign-toggle:overlayPlaquetteSign',
            'overlay-probe-toggle:overlayProbeEnabled'
        ].forEach((entry) => {
            const [id, key] = entry.split(':');
            bindToggle({
                getEl,
                state: this.state,
                callbacks: callbackProxy,
                id,
                key,
                refreshDisplay: true
            });
        });
        const wsKSlider = getEl('ws-k-slider');
        if (wsKSlider) {
            wsKSlider.addEventListener('change', () => {
                this.state.topologyWSK = parseInt(wsKSlider.value);
                const disp = getEl('ws-k-value');
                if (disp) disp.textContent = this.state.topologyWSK;
                if (this.cb.onTopologyChange) this.cb.onTopologyChange();
            });
        }
        const wsPSlider = getEl('ws-p-slider');
        if (wsPSlider) {
            wsPSlider.addEventListener('change', () => {
                this.state.topologyWSRewire = parseFloat(wsPSlider.value);
                const disp = getEl('ws-p-value');
                if (disp) disp.textContent = this.state.topologyWSRewire.toFixed(2);
                if (this.cb.onTopologyChange) this.cb.onTopologyChange();
            });
        }
        const baM0Slider = getEl('ba-m0-slider');
        if (baM0Slider) {
            baM0Slider.addEventListener('change', () => {
                this.state.topologyBAM0 = parseInt(baM0Slider.value);
                const disp = getEl('ba-m0-value');
                if (disp) disp.textContent = this.state.topologyBAM0;
                if (this.cb.onTopologyChange) this.cb.onTopologyChange();
            });
        }
        const baMSlider = getEl('ba-m-slider');
        if (baMSlider) {
            baMSlider.addEventListener('change', () => {
                this.state.topologyBAM = parseInt(baMSlider.value);
                const disp = getEl('ba-m-value');
                if (disp) disp.textContent = this.state.topologyBAM;
                if (this.cb.onTopologyChange) this.cb.onTopologyChange();
            });
        }
        const topologySeedInput = getEl('topology-seed-input');
        if (topologySeedInput) {
            topologySeedInput.addEventListener('change', () => {
                this.state.topologySeed = parseInt(topologySeedInput.value) || 1;
                if (this.cb.onTopologyChange) this.cb.onTopologyChange();
            });
        }
        const topoRegenBtn = getEl('topology-regenerate-btn');
        if (topoRegenBtn) {
            topoRegenBtn.addEventListener('click', () => {
                if (this.cb.onTopologyRegenerate) {
                    this.cb.onTopologyRegenerate();
                } else if (this.cb.onTopologyChange) {
                    this.cb.onTopologyChange();
                }
            });
        }
        const graphOverlayToggle = getEl('graph-overlay-toggle');
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
        

        const activeLayerInput = getEl('active-layer-input');
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
        const renderAllToggle = getEl('render-all-layers-toggle');
        if (renderAllToggle) {
            renderAllToggle.addEventListener('change', () => {
                this.state.renderAllLayers = renderAllToggle.checked;
                if (this.cb.onParamChange) this.cb.onParamChange();
            });
        }
        
        // Kernel shape controls
        const kernelShapeSelect = getEl('kernel-shape-select');
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
            const widthSlider = getEl(`ring-${i}-width-slider`);
            const weightSlider = getEl(`ring-${i}-weight-slider`);
            
            if (widthSlider) {
                widthSlider.addEventListener('input', () => {
                    this.state.kernelRingWidths[i - 1] = parseFloat(widthSlider.value);
                    const disp = getEl(`ring-${i}-width-value`);
                    if (disp) disp.textContent = parseFloat(widthSlider.value).toFixed(2);
                    this.cb.onParamChange();
                });
            }
            
            if (weightSlider) {
                weightSlider.addEventListener('input', () => {
                    this.state.kernelRingWeights[i - 1] = parseFloat(weightSlider.value);
                    const disp = getEl(`ring-${i}-weight-value`);
                    if (disp) disp.textContent = parseFloat(weightSlider.value).toFixed(2);
                    this.cb.onParamChange();
                });
            }
        }
        
        // Special handler for kernelRings to update ring control visibility
        const ringsSlider = getEl('kernel-rings-slider');
        if (ringsSlider) {
            ringsSlider.addEventListener('input', () => {
                this.state.kernelRings = parseInt(ringsSlider.value);
                const disp = getEl('kernel-rings-value');
                if (disp) disp.textContent = this.state.kernelRings;
                this.updateDisplay(); // Update ring control visibility
                this.cb.onParamChange();
            });
        }
        
        // Secondary number of rings slider
        const secondaryRingsSlider = getEl('secondary-kernel-rings-slider');
        if (secondaryRingsSlider) {
            secondaryRingsSlider.addEventListener('input', () => {
                this.state.kernelRings = parseInt(secondaryRingsSlider.value);
                const disp = getEl('secondary-kernel-rings-value');
                if (disp) disp.textContent = this.state.kernelRings;
                // Also update primary display
                const primaryDisp = getEl('kernel-rings-value');
                if (primaryDisp) primaryDisp.textContent = this.state.kernelRings;
                this.updateDisplay(); // Update ring control visibility
                this.cb.onParamChange();
            });
        }
        
        // Secondary kernel dropdown (no checkbox, -1 = None)
        const secondaryDropdown = getEl('kernel-secondary-dropdown');
        if (secondaryDropdown) {
            secondaryDropdown.addEventListener('change', () => {
                const secondaryValue = parseInt(secondaryDropdown.value);
                this.state.kernelSecondary = secondaryValue;
                this.state.kernelCompositionEnabled = secondaryValue >= 0; // Enable composition if not "None"
                
                // Show/hide secondary kernel parameters
                const secondaryParams = getEl('secondary-kernel-params');
                if (secondaryParams) {
                    secondaryParams.style.display = secondaryValue >= 0 ? 'flex' : 'none';
                }
                
                // Show/hide mix ratio container
                const mixRatioContainer = getEl('kernel-mix-ratio-container');
                if (mixRatioContainer) {
                    mixRatioContainer.style.display = secondaryValue >= 0 ? 'block' : 'none';
                }
                
                this.updateDisplay(); // Update shape-specific controls visibility
                this.cb.onParamChange();
            });
        }
        
        const mixRatioSlider = getEl('kernel-mix-ratio-slider');
        if (mixRatioSlider) {
            mixRatioSlider.addEventListener('input', () => {
                this.state.kernelMixRatio = parseFloat(mixRatioSlider.value);
                const disp = getEl('kernel-mix-ratio-value');
                if (disp) disp.textContent = parseFloat(mixRatioSlider.value).toFixed(2);
                this.cb.onParamChange();
            });
        }
        
        // Update kernel orientation display to show degrees (for anisotropic)
        const orientationEl = getEl('kernel-orientation-slider');
        if (orientationEl) {
            orientationEl.addEventListener('input', () => {
                const radians = parseFloat(orientationEl.value);
                this.state.kernelOrientation = radians;
                const disp = getEl('kernel-orientation-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        // Update asymmetric orientation display (separate slider)
        const asymmetricOrientationEl = getEl('kernel-asymmetric-orientation-slider');
        if (asymmetricOrientationEl) {
            asymmetricOrientationEl.addEventListener('input', () => {
                const radians = parseFloat(asymmetricOrientationEl.value);
                this.state.kernelAsymmetricOrientation = radians;
                const disp = getEl('kernel-asymmetric-orientation-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        // Gabor frequency angle display (in degrees)
        const freqAngleEl = getEl('kernel-freq-angle-slider');
        if (freqAngleEl) {
            freqAngleEl.addEventListener('input', () => {
                const radians = parseFloat(freqAngleEl.value);
                this.state.kernelSpatialFreqAngle = radians;
                const disp = getEl('kernel-freq-angle-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        // Gabor phase display (in degrees)
        const gaborPhaseEl = getEl('kernel-gabor-phase-slider');
        if (gaborPhaseEl) {
            gaborPhaseEl.addEventListener('input', () => {
                const radians = parseFloat(gaborPhaseEl.value);
                this.state.kernelGaborPhase = radians;
                const disp = getEl('kernel-gabor-phase-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        // Secondary kernel angle displays (all in degrees)
        const secOrientationEl = getEl('secondary-kernel-orientation-slider');
        if (secOrientationEl) {
            secOrientationEl.addEventListener('input', () => {
                const radians = parseFloat(secOrientationEl.value);
                this.state.kernelOrientation = radians;
                const disp = getEl('secondary-kernel-orientation-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                // Also update primary display
                const primaryDisp = getEl('kernel-orientation-value');
                if (primaryDisp) primaryDisp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        const secAsymOrientationEl = getEl('secondary-kernel-asymmetric-orientation-slider');
        if (secAsymOrientationEl) {
            secAsymOrientationEl.addEventListener('input', () => {
                const radians = parseFloat(secAsymOrientationEl.value);
                this.state.kernelAsymmetricOrientation = radians;
                const disp = getEl('secondary-kernel-asymmetric-orientation-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                // Also update primary display
                const primaryDisp = getEl('kernel-asymmetric-orientation-value');
                if (primaryDisp) primaryDisp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        const secFreqAngleEl = getEl('secondary-kernel-freq-angle-slider');
        if (secFreqAngleEl) {
            secFreqAngleEl.addEventListener('input', () => {
                const radians = parseFloat(secFreqAngleEl.value);
                this.state.kernelSpatialFreqAngle = radians;
                const disp = getEl('secondary-kernel-freq-angle-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                // Also update primary display
                const primaryDisp = getEl('kernel-freq-angle-value');
                if (primaryDisp) primaryDisp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        const secGaborPhaseEl = getEl('secondary-kernel-gabor-phase-slider');
        if (secGaborPhaseEl) {
            secGaborPhaseEl.addEventListener('input', () => {
                const radians = parseFloat(secGaborPhaseEl.value);
                this.state.kernelGaborPhase = radians;
                const disp = getEl('secondary-kernel-gabor-phase-value');
                if (disp) disp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                // Also update primary display
                const primaryDisp = getEl('kernel-gabor-phase-value');
                if (primaryDisp) primaryDisp.textContent = Math.round(radians * 180 / Math.PI) + '°';
                this.cb.onParamChange();
            });
        }
        
        // Secondary multi-ring controls need custom handlers (arrays, not simple bind)
        for (let i = 1; i <= 5; i++) {
            const widthSlider = getEl(`secondary-kernel-ring${i}-width-slider`);
            const weightSlider = getEl(`secondary-kernel-ring${i}-weight-slider`);
            
            if (widthSlider) {
                widthSlider.addEventListener('input', () => {
                    this.state.kernelRingWidths[i - 1] = parseFloat(widthSlider.value);
                    const disp = getEl(`secondary-kernel-ring${i}-width-value`);
                    if (disp) disp.textContent = parseFloat(widthSlider.value).toFixed(2);
                    // Also update primary display
                    const primaryDisp = getEl(`ring-${i}-width-value`);
                    if (primaryDisp) primaryDisp.textContent = parseFloat(widthSlider.value).toFixed(2);
                    this.cb.onParamChange();
                });
            }
            
            if (weightSlider) {
                weightSlider.addEventListener('input', () => {
                    this.state.kernelRingWeights[i - 1] = parseFloat(weightSlider.value);
                    const disp = getEl(`secondary-kernel-ring${i}-weight-value`);
                    if (disp) disp.textContent = parseFloat(weightSlider.value).toFixed(2);
                    // Also update primary display
                    const primaryDisp = getEl(`ring-${i}-weight-value`);
                    if (primaryDisp) primaryDisp.textContent = parseFloat(weightSlider.value).toFixed(2);
                    this.cb.onParamChange();
                });
            }
        }
        
        // Rule select with special handling to update UI visibility
        const ruleSelect = getEl('rule-select');
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
        const statsToggle = getEl('show-statistics-toggle');
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
        const surfaceSelect = getEl('surface-mode-select');
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
        const smoothingSelect = getEl('smoothing-mode-select');
        if (smoothingSelect) {
            smoothingSelect.addEventListener('change', () => {
                this.state.smoothingMode = parseInt(smoothingSelect.value);
                this.cb.onParamChange();
                this.updateDisplay();
            });
        }
        
        // Selects for patterns
        // Import updateURLFromState lazily (avoid circular import issues) and call when patterns change
        const bindPatternSelect = (id, key) => {
            const el = getEl(id);
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
        
        bindPatternSelect('theta-pattern-select', 'thetaPattern');
        bindPatternSelect('omega-pattern-select', 'omegaPattern');

        const seedInput = getEl('seed-input');
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
        const reseedBtn = getEl('reseed-btn');
        if (reseedBtn) {
            reseedBtn.addEventListener('click', () => {
                if (this.cb.onReseed) {
                    this.cb.onReseed();
                }
            });
        }

        const expWarmup = getEl('exp-warmup-input');
        const expMeasure = getEl('exp-measure-input');
        const expSPF = getEl('exp-stepsperframe-input');
        const expReadback = getEl('exp-readback-input');
        const expReset = getEl('exp-reset-toggle');
        const expRunBtn = getEl('exp-run-btn');
        const expCancelBtn = getEl('exp-cancel-btn');
        const expExportBtn = getEl('exp-export-btn');

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
        this.externalInputCanvas = getEl('image-preview');
        this.externalInputCtx = this.externalInputCanvas ? this.externalInputCanvas.getContext('2d') : null;
        this.videoElement = getEl('video-input');
        this.videoStream = null;
        
        const imageUpload = getEl('image-upload');
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
        
        const webcamBtn = getEl('webcam-btn');
        if (webcamBtn) {
            webcamBtn.onclick = () => this.toggleWebcam();
        }
        
        // Show/hide external input controls based on pattern selection
        const omegaPatternSelect = getEl('omega-pattern-select');
        if (omegaPatternSelect) {
            omegaPatternSelect.addEventListener('change', () => {
                this.updateDisplay();
            });
        }

        // Time controls
        const timeDisplay = getEl('time-scale-display');
        const updateTimeDisplay = () => {
            if(timeDisplay) timeDisplay.textContent = this.state.timeScale.toFixed(1) + '×';
        };

        const slowBtn = getEl('slow-btn');
        if (slowBtn) slowBtn.onclick = () => {
            this.state.timeScale = Math.max(0.1, this.state.timeScale * 0.5);
            updateTimeDisplay();
            this.cb.onParamChange();
        };
        const fastBtn = getEl('fast-btn');
        if (fastBtn) fastBtn.onclick = () => {
            this.state.timeScale = Math.min(4.0, this.state.timeScale * 2.0);
            updateTimeDisplay();
            this.cb.onParamChange();
        };
        const normalBtn = getEl('normal-btn');
        if (normalBtn) normalBtn.onclick = () => {
            this.state.timeScale = 1.0;
            updateTimeDisplay();
            this.cb.onParamChange();
        };
        
        // Buttons
        const pauseBtn = getEl('pause-btn');
        const resetBtn = getEl('reset-btn');
        const randomizeBtn = getEl('randomize-btn');
        if (pauseBtn) pauseBtn.onclick = () => this.cb.onPause();
        if (resetBtn) resetBtn.onclick = () => this.cb.onReset();
        if (randomizeBtn) randomizeBtn.onclick = () => this.cb.onRandomize();
        
        // Presets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.onclick = () => this.cb.onPreset(btn.dataset.preset);
        });

        const applyInitBtn = getEl('apply-init-btn');
        if (applyInitBtn) {
            applyInitBtn.onclick = () => {
                if (this.cb.onApplyInit) this.cb.onApplyInit();
            };
        }
        
        // View mode toggle
        const view3dBtn = getEl('view-3d-btn');
        const view2dBtn = getEl('view-2d-btn');
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
        const gridSizeInput = getEl('grid-size-input');
        const gridSizeSlider = getEl('grid-size-slider');
        const gridSizeValue = getEl('grid-size-value');
        const applyGridBtn = getEl('apply-grid-btn');
        const layerCountInput = getEl('layer-count-input');
        const applyLayerCountBtn = getEl('apply-layer-count-btn');
        
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
        const kscanBtn = getEl('kscan-btn');
        if (kscanBtn) {
            kscanBtn.onclick = () => {
                if (this.cb.onStartKScan) {
                    this.cb.onStartKScan();
                }
            };
        }
        
        const findKcBtn = getEl('findkc-btn');
        if (findKcBtn) {
            findKcBtn.onclick = () => {
                if (this.cb.onFindKc) {
                    this.cb.onFindKc();
                }
            };
        }
        
        const exportStatsBtn = getEl('export-stats-btn');
        if (exportStatsBtn) {
            exportStatsBtn.onclick = () => {
                if (this.cb.onExportStats) {
                    this.cb.onExportStats();
                }
            };
        }
        
        const exportPDBtn = getEl('export-pd-btn');
        if (exportPDBtn) {
            exportPDBtn.onclick = () => {
                if (this.cb.onExportPhaseDiagram) {
                    this.cb.onExportPhaseDiagram();
                }
            };
        }

        const sweepParamSelect = getEl('sweep-param-select');
        const sweepFromInput = getEl('sweep-from-input');
        const sweepToInput = getEl('sweep-to-input');
        const sweepStepsInput = getEl('sweep-steps-input');
        const sweepSettleInput = getEl('sweep-settle-frames-input');
        const sweepRunBtn = getEl('sweep-run-btn');
        const sweepCancelBtn = getEl('sweep-cancel-btn');
        const sweepExportJsonBtn = getEl('sweep-export-json-btn');
        const sweepExportCsvBtn = getEl('sweep-export-csv-btn');
        const sweepRangeFrustrationBtn = getEl('sweep-range-frustration-btn');
        const sweepRangeFeedbackBtn = getEl('sweep-range-feedback-btn');
        const sweepRangeStiffnessBtn = getEl('sweep-range-stiffness-btn');

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

        const compareCaptureABtn = getEl('compare-capture-a-btn');
        const compareCaptureBBtn = getEl('compare-capture-b-btn');
        const compareRestoreABtn = getEl('compare-restore-a-btn');
        const compareRestoreBBtn = getEl('compare-restore-b-btn');
        if (compareCaptureABtn) compareCaptureABtn.addEventListener('click', () => { if (this.cb.onCompareCapture) this.cb.onCompareCapture('a'); });
        if (compareCaptureBBtn) compareCaptureBBtn.addEventListener('click', () => { if (this.cb.onCompareCapture) this.cb.onCompareCapture('b'); });
        if (compareRestoreABtn) compareRestoreABtn.addEventListener('click', () => { if (this.cb.onCompareRestore) this.cb.onCompareRestore('a'); });
        if (compareRestoreBBtn) compareRestoreBBtn.addEventListener('click', () => { if (this.cb.onCompareRestore) this.cb.onCompareRestore('b'); });
}
