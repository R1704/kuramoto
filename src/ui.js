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
        
        // Rule select with special handling to update UI visibility
        const ruleSelect = document.getElementById('rule-select');
        if (ruleSelect) {
            ruleSelect.addEventListener('change', () => {
                this.state.ruleMode = parseInt(ruleSelect.value);
                this.cb.onParamChange();
                this.updateDisplay(); // Update visibility of rule-specific controls
            });
        }
        
        bind('colormap-select', 'colormap', 'int', 'change');
        bind('show-order', 'showOrder', 'bool', 'change');
        bind('omega-amplitude-slider', 'omegaAmplitude');
        
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
        
        // Grid size controls
        const gridSizeInput = document.getElementById('grid-size-input');
        const gridSizeValue = document.getElementById('grid-size-value');
        const applyGridBtn = document.getElementById('apply-grid-btn');
        
        if (gridSizeInput && gridSizeValue) {
            gridSizeInput.oninput = () => {
                gridSizeValue.textContent = gridSizeInput.value;
            };
        }
        
        if (applyGridBtn && gridSizeInput) {
            applyGridBtn.onclick = () => {
                const newSize = parseInt(gridSizeInput.value);
                if (newSize >= 32 && newSize <= 1024 && this.cb.onResizeGrid) {
                    this.cb.onResizeGrid(newSize);
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
                    // Shift+Up: Increase grid size
                    const gridInput = document.getElementById('grid-size-input');
                    const newSize = Math.min(1024, this.state.gridSize + 16);
                    if (newSize >= 32 && newSize <= 1024 && this.cb.onResizeGrid) {
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
                    // Shift+Down: Decrease grid size
                    const gridInput = document.getElementById('grid-size-input');
                    const newSize = Math.max(32, this.state.gridSize - 16);
                    if (newSize >= 32 && newSize <= 1024 && this.cb.onResizeGrid) {
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
            // Toggle order parameter overlay
            else if (e.key === 'o' || e.key === 'O') {
                this.state.showOrder = !this.state.showOrder;
                this.cb.onParamChange();
                this.updateDisplay();
            }
            // Cycle colormaps
            else if (e.key === 'c' || e.key === 'C') {
                // Cycle through colormaps, skip mode 4 (Image Texture) if no external input active
                const hasExternalInput = this.state.omegaPattern === 'image' || this.state.thetaPattern === 'image';
                const maxMode = hasExternalInput ? 5 : 4;
                this.state.colormap = (this.state.colormap + 1) % maxMode;
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
        update('omega-amplitude-slider', this.state.omegaAmplitude);
        
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
        
        const colormapSelect = document.getElementById('colormap-select');
        if (colormapSelect) colormapSelect.value = this.state.colormap;
        
        const timeDisplay = document.getElementById('time-scale-display');
        if (timeDisplay) timeDisplay.textContent = this.state.timeScale.toFixed(1) + '×';
        
        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) pauseBtn.textContent = this.state.paused ? 'Resume' : 'Pause';
        
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
        
        // Update kernel visualization if Mexican-hat rule is active
        if (this.state.ruleMode === 4 && this.cb.onDrawKernel) {
            this.cb.onDrawKernel();
        }
        
        // Show/hide external input controls
        const externalInputControls = document.getElementById('external-input-controls');
        if (externalInputControls) {
            externalInputControls.style.display = this.state.omegaPattern === 'image' ? 'block' : 'none';
        }
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
