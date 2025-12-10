export class UIManager {
    constructor(state, callbacks) {
        this.state = state;
        this.cb = callbacks;
        this.elements = {};
        
        this.ruleDescriptions = [
            'Classic: dθ/dt = ω + K·sin(θⱼ - θᵢ)',
            'Coherence-gated: Coupling weakens in synchronized regions',
            'Curvature-aware: Stronger coupling at phase gradients',
            'Harmonics: Uses 2nd+3rd harmonics for multi-clusters',
            'Mexican-hat: Short excitation + long inhibition',
            'Delay-coupled: Uses delayed phase from past timesteps'
        ];
        
        this.bindControls();
        this.bindKeyboard();
        this.bindZoomPan();
    }
    
    bindZoomPan() {
        const canvas = document.getElementById('canvas');
        if (!canvas) return;
        
        // Mouse wheel for zoom (in 2D mode)
        canvas.addEventListener('wheel', (e) => {
            if (this.state.viewMode !== 1) return; // Only in 2D mode
            e.preventDefault();

            const rect = canvas.getBoundingClientRect();
            const cx = (e.clientX - rect.left) / rect.width - 0.5;
            const cy = (e.clientY - rect.top) / rect.height - 0.5;

            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const prevZoom = this.state.zoom;
            const newZoom = Math.max(1.0, Math.min(10.0, prevZoom * zoomFactor)); // keep at least canvas-sized

            // Keep cursor position stable by adjusting pan
            const invPrev = 1.0 / prevZoom;
            const invNew = 1.0 / newZoom;
            this.state.panX += cx * (invPrev - invNew);
            this.state.panY -= cy * (invPrev - invNew); // flip y

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

    bindControls() {
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

        bind('k0-slider', 'K0');
        bind('dt-slider', 'dt');
        bind('range-slider', 'range', 'int');
        bind('harmonic-slider', 'harmonicA');
        bind('harmonic3-slider', 'harmonicB');
        bind('sigma-slider', 'sigma');
        bind('sigma2-slider', 'sigma2');
        bind('beta-slider', 'beta');
        bind('delay-slider', 'delaySteps', 'int');
        bind('noise-slider', 'noiseStrength');
        bind('leak-slider', 'leak');

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
        
        // Phase space toggle
        const phaseToggle = document.getElementById('phase-space-toggle');
        if (phaseToggle) {
            phaseToggle.addEventListener('change', () => {
                this.state.phaseSpaceEnabled = phaseToggle.checked;
                if (this.cb.onPhaseSpaceToggle) {
                    this.cb.onPhaseSpaceToggle(phaseToggle.checked);
                }
                this.updateDisplay();
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
        
        bind('data-layer-select', 'colormap', 'int', 'change');
        bind('palette-select', 'colormapPalette', 'int', 'change');
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
        
        // Statistics enable/disable
        const statsEnabledCheck = document.getElementById('stats-enabled');
        if (statsEnabledCheck) {
            statsEnabledCheck.addEventListener('change', () => {
                this.state.showStatistics = statsEnabledCheck.checked;
                // Show/hide stats content
                const statsContent = document.getElementById('stats-content');
                if (statsContent) {
                    statsContent.style.opacity = this.state.showStatistics ? '1' : '0.3';
                }
            });
        }
        
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
        const bindSelect = (id, key) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', () => {
                this.state[key] = el.value;
                this.cb.onPatternChange(key); // Trigger pattern application
            });
        };
        
        bindSelect('theta-pattern-select', 'thetaPattern');
        bindSelect('omega-pattern-select', 'omegaPattern');

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
        const gridSizeValue = document.getElementById('grid-size-value');
        const applyGridBtn = document.getElementById('apply-grid-btn');
        
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
                
                // Update display with aligned value
                gridSizeValue.textContent = aligned;
                
                // Update input value if it got adjusted
                if (aligned !== requested) {
                    gridSizeInput.value = aligned;
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
    }

    bindKeyboard() {
        window.addEventListener('keydown', e => {
            // Rule switching
            if (e.key >= '0' && e.key <= '5') {
                this.state.ruleMode = parseInt(e.key);
                this.cb.onParamChange();
                this.updateDisplay();
            }
            // Reset
            else if (e.key === 'r' || e.key === 'R') {
                this.cb.onReset();
            }
            // Toggle global coupling
            else if (e.key === 'g' || e.key === 'G') {
                this.state.globalCoupling = !this.state.globalCoupling;
                this.cb.onParamChange();
                this.updateDisplay();
            }
            // Adjust grid size (Shift + arrows) or coupling strength/range (arrows alone)
            else if (e.key === 'ArrowUp') {
                e.preventDefault(); // Prevent scrolling
                if (e.shiftKey) {
                    // Shift+Up: Increase grid size (by 64 for bytesPerRow alignment)
                    const gridInput = document.getElementById('grid-size-input');
                    const newSize = Math.min(1024, this.state.gridSize + 64);
                    if (newSize >= 64 && newSize <= 1024 && this.cb.onResizeGrid) {
                        gridInput.value = newSize;
                        document.getElementById('grid-size-value').textContent = newSize;
                        this.cb.onResizeGrid(newSize);
                    }
                } else {
                    // Up: Increase coupling strength
                    this.state.K0 = Math.min(3.0, this.state.K0 + 0.1);
                    this.cb.onParamChange();
                    this.updateDisplay();
                }
            }
            else if (e.key === 'ArrowDown') {
                e.preventDefault(); // Prevent scrolling
                if (e.shiftKey) {
                    // Shift+Down: Decrease grid size (by 64 for bytesPerRow alignment)
                    const gridInput = document.getElementById('grid-size-input');
                    const newSize = Math.max(64, this.state.gridSize - 64);
                    if (newSize >= 64 && newSize <= 1024 && this.cb.onResizeGrid) {
                        gridInput.value = newSize;
                        document.getElementById('grid-size-value').textContent = newSize;
                        this.cb.onResizeGrid(newSize);
                    }
                } else {
                    // Down: Decrease coupling strength
                    this.state.K0 = Math.max(0.0, this.state.K0 - 0.1);
                    this.cb.onParamChange();
                    this.updateDisplay();
                }
            }
            // Adjust range
            else if (e.key === 'ArrowLeft') {
                e.preventDefault(); // Prevent scrolling
                if (!this.state.globalCoupling) {
                    this.state.range = Math.max(1, this.state.range - 1);
                    this.cb.onParamChange();
                    this.updateDisplay();
                }
            }
            else if (e.key === 'ArrowRight') {
                e.preventDefault(); // Prevent scrolling
                if (!this.state.globalCoupling) {
                    this.state.range = Math.min(8, this.state.range + 1);
                    this.cb.onParamChange();
                    this.updateDisplay();
                }
            }
            // Cycle palettes (c) and data layers (shift+c)
            else if ((e.key === 'c' || e.key === 'C') && !e.shiftKey) {
                this.state.colormapPalette = (this.state.colormapPalette + 1) % 6;
                this.cb.onParamChange();
                this.updateDisplay();
            } else if (e.key === 'C' && e.shiftKey) {
                this.state.colormap = (this.state.colormap + 1) % 7;
                this.cb.onParamChange();
                this.updateDisplay();
            }
            // Pause/Resume
            else if (e.key === ' ') {
                e.preventDefault();
                this.cb.onPause();
            }
            // Speed controls
            else if (e.key === '[') {
                this.state.timeScale = Math.max(0.1, this.state.timeScale * 0.5);
                this.cb.onParamChange();
                this.updateDisplay();
            }
            else if (e.key === ']') {
                this.state.timeScale = Math.min(4.0, this.state.timeScale * 2.0);
                this.cb.onParamChange();
                this.updateDisplay();
            }
            // Toggle 2D/3D view with V key
            else if (e.key === 'v' || e.key === 'V') {
                this.state.viewMode = this.state.viewMode === 0 ? 1 : 0;
                this.cb.onParamChange();
                this.updateDisplay();
            }
            // Toggle phase space plot
            else if (e.key === 'p' || e.key === 'P') {
                this.state.phaseSpaceEnabled = !this.state.phaseSpaceEnabled;
                if (this.cb.onPhaseSpaceToggle) {
                    this.cb.onPhaseSpaceToggle(this.state.phaseSpaceEnabled);
                }
                this.updateDisplay();
            }
            // Reset zoom/pan with Z key (in 2D mode)
            else if (e.key === 'z' || e.key === 'Z') {
                if (this.state.viewMode === 1) {
                    this.state.zoom = 1.0;
                    this.state.panX = 0.0;
                    this.state.panY = 0.0;
                    this.cb.onParamChange();
                }
            }
            // Zoom in/out with +/- keys (in 2D mode)
            else if (e.key === '=' || e.key === '+') {
                if (this.state.viewMode === 1) {
                    this.state.zoom = Math.min(10.0, this.state.zoom * 1.2);
                    this.cb.onParamChange();
                }
            }
            else if (e.key === '-' || e.key === '_') {
                if (this.state.viewMode === 1) {
                    this.state.zoom = Math.max(0.5, this.state.zoom / 1.2);
                    this.cb.onParamChange();
                }
            }
            // K-scan shortcut (K key)
            else if (e.key === 'k' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                if (this.cb.onStartKScan) {
                    this.cb.onStartKScan();
                }
            }
            // Go to Kc shortcut (Shift+K)
            else if (e.key === 'K' && e.shiftKey) {
                if (this.cb.onFindKc) {
                    this.cb.onFindKc();
                }
            }
            // Smoothing mode cycle (S key) - cycle through all modes
            else if (e.key === 's' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                // Cycle through all smoothing modes: 0=none, 1=bilinear, 2=bicubic, 3=gaussian
                const currentMode = this.state.smoothingMode ?? 1;
                this.state.smoothingMode = (currentMode + 1) % 4;  // Cycle 0->1->2->3->0
                const modes = ['None (Nearest)', 'Bilinear', 'Bicubic', 'Gaussian'];
                console.log(`Smoothing mode: ${modes[this.state.smoothingMode]}`);
                this.cb.onParamChange();
                this.updateDisplay();
            }
            // Toggle log scale for susceptibility plot (L key)
            else if (e.key === 'l' && !e.shiftKey && !e.ctrlKey) {
                if (this.cb.onToggleLogScale) {
                    this.cb.onToggleLogScale();
                }
            }
        });
    }

    updateDisplay() {
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
        update('omega-amplitude-slider', this.state.omegaAmplitude);
        
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
        if (kernelSection) kernelSection.style.display = this.state.ruleMode === 4 ? 'block' : 'none';
        
        // Update global coupling indicator and range control
        const globalInd = document.getElementById('global-indicator');
        if (globalInd) globalInd.style.display = this.state.globalCoupling ? 'flex' : 'none';
        
        const rangeControl = document.getElementById('range-control');
        const rangeSlider = document.getElementById('range-slider');
        const rangeValue = document.getElementById('range-value');
        if (this.state.globalCoupling) {
            if (rangeControl) rangeControl.classList.add('disabled');
            if (rangeSlider) rangeSlider.disabled = true;
            if (rangeValue) rangeValue.style.opacity = '0.5';
        } else {
            if (rangeControl) rangeControl.classList.remove('disabled');
            if (rangeSlider) rangeSlider.disabled = false;
            if (rangeValue) rangeValue.style.opacity = '1';
        }
        
        const thetaSelect = document.getElementById('theta-pattern-select');
        if (thetaSelect) thetaSelect.value = this.state.thetaPattern;
        
        const omegaSelect = document.getElementById('omega-pattern-select');
        if (omegaSelect) omegaSelect.value = this.state.omegaPattern;
        
        const timeDisplay = document.getElementById('time-scale-display');
        if (timeDisplay) timeDisplay.textContent = this.state.timeScale.toFixed(1) + '×';
        
        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) pauseBtn.textContent = this.state.paused ? 'Resume' : 'Pause';
        
        // Update statistics enabled checkbox
        const statsEnabledCheck = document.getElementById('stats-enabled');
        if (statsEnabledCheck) statsEnabledCheck.checked = this.state.showStatistics;
        const statsContent = document.getElementById('stats-content');
        if (statsContent) statsContent.style.opacity = this.state.showStatistics ? '1' : '0.3';
        
        // Phase space toggle and visibility
        const phaseToggle = document.getElementById('phase-space-toggle');
        if (phaseToggle) phaseToggle.checked = this.state.phaseSpaceEnabled !== false;
        const phaseSection = document.getElementById('phase-space-section');
        if (phaseSection) phaseSection.style.display = this.state.phaseSpaceEnabled ? 'block' : 'none';
        
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
        const gridSizeValue = document.getElementById('grid-size-value');
        if (gridSizeInput) gridSizeInput.value = this.state.gridSize;
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
    
    loadExternalImage(img) {
        if (!this.externalInputCanvas || !this.externalInputCtx) return;
        
        // Draw image to canvas and show preview
        this.externalInputCanvas.width = 128;
        this.externalInputCanvas.height = 128;
        this.externalInputCtx.drawImage(img, 0, 0, 128, 128);
        this.externalInputCanvas.style.display = 'block';
        
        // Notify callback with image data
        if (this.cb.onExternalInput) {
            this.cb.onExternalInput(this.externalInputCanvas);
        }
    }
    
    toggleWebcam() {
        if (this.videoStream) {
            // Stop webcam
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
            if (this.videoElement) this.videoElement.style.display = 'none';
            if (this.externalInputCanvas) this.externalInputCanvas.style.display = 'none';
            const webcamBtn = document.getElementById('webcam-btn');
            if (webcamBtn) webcamBtn.textContent = '📷 Use Webcam';
        } else {
            // Start webcam
            navigator.mediaDevices.getUserMedia({ video: { width: 128, height: 128 } })
                .then(stream => {
                    this.videoStream = stream;
                    if (this.videoElement) {
                        this.videoElement.srcObject = stream;
                        this.videoElement.play();
                        // Keep video element hidden - we only show the canvas preview
                        this.videoElement.style.display = 'none';
                    }
                    const webcamBtn = document.getElementById('webcam-btn');
                    if (webcamBtn) webcamBtn.textContent = '⏹️ Stop Webcam';
                    
                    // Start capturing frames
                    this.captureVideoFrame();
                })
                .catch(err => {
                    console.error('Error accessing webcam:', err);
                    alert('Could not access webcam');
                });
        }
    }
    
    captureVideoFrame() {
        if (!this.videoStream || !this.videoElement || !this.externalInputCanvas || !this.externalInputCtx) return;
        
        // Draw video frame to canvas
        this.externalInputCanvas.width = 128;
        this.externalInputCanvas.height = 128;
        this.externalInputCtx.drawImage(this.videoElement, 0, 0, 128, 128);
        this.externalInputCanvas.style.display = 'block';
        
        // Notify callback with image data
        if (this.cb.onExternalInput) {
            this.cb.onExternalInput(this.externalInputCanvas);
        }
        
        // Continue capturing if webcam is active
        if (this.videoStream) {
            requestAnimationFrame(() => this.captureVideoFrame());
        }
    }
}
