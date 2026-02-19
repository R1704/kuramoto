export function bindKeyboard() {
        window.addEventListener('keydown', e => {
            // Rule switching
            if (e.key >= '0' && e.key <= '5') {
                this.state.ruleMode = parseInt(e.key);
                this.cb.onParamChange();
                this.updateDisplay();
                this.syncURL();
            }
            // Reset
            else if (e.key === 'r' || e.key === 'R') {
                this.cb.onReset();
                this.syncURL();
            }
            // Toggle global coupling
            else if (e.key === 'g' || e.key === 'G') {
                this.state.globalCoupling = !this.state.globalCoupling;
                this.cb.onParamChange();
                this.updateDisplay();
                this.syncURL();
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
                        this.syncURL();
                    }
                } else {
                    // Up: Increase coupling strength
                    this.state.K0 = Math.min(3.0, this.state.K0 + 0.1);
                    this.cb.onParamChange();
                    this.updateDisplay();
                       this.syncURL();
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
                           this.syncURL();
                    }
                } else {
                    // Down: Decrease coupling strength
                    this.state.K0 = Math.max(0.0, this.state.K0 - 0.1);
                    this.cb.onParamChange();
                    this.updateDisplay();
                       this.syncURL();
                }
            }
            // Adjust range
            else if (e.key === 'ArrowLeft') {
                e.preventDefault(); // Prevent scrolling
                if (!this.state.globalCoupling) {
                    this.state.range = Math.max(1, this.state.range - 1);
                    this.cb.onParamChange();
                    this.updateDisplay();
                       this.syncURL();
                }
            }
            else if (e.key === 'ArrowRight') {
                e.preventDefault(); // Prevent scrolling
                if (!this.state.globalCoupling) {
                    this.state.range = Math.min(8, this.state.range + 1);
                    this.cb.onParamChange();
                    this.updateDisplay();
                       this.syncURL();
                }
            }
            // Cycle palettes (c) and data layers (shift+c)
            else if ((e.key === 'c' || e.key === 'C') && !e.shiftKey) {
                this.state.colormapPalette = (this.state.colormapPalette + 1) % 6;
                this.cb.onParamChange();
                this.updateDisplay();
                   this.syncURL();
            } else if (e.key === 'C' && e.shiftKey) {
                const layerCount = this.state.manifoldMode === 's1' ? 9 : 7;
                this.state.colormap = (this.state.colormap + 1) % layerCount;
                this.cb.onParamChange();
                this.updateDisplay();
                   this.syncURL();
            }
            // Pause/Resume
            else if (e.key === ' ') {
                e.preventDefault();
                this.cb.onPause();
                   this.syncURL();
            }
            // Speed controls
            else if (e.key === '[' && !e.shiftKey) {
                this.state.timeScale = Math.max(0.1, this.state.timeScale * 0.5);
                this.cb.onParamChange();
                this.updateDisplay();
                   this.syncURL();
            }
            else if (e.key === ']' && !e.shiftKey) {
                this.state.timeScale = Math.min(4.0, this.state.timeScale * 2.0);
                this.cb.onParamChange();
                this.updateDisplay();
                   this.syncURL();
            }
            // Toggle 2D/3D view with V key
            else if (e.key === 'v' || e.key === 'V') {
                this.state.viewMode = this.state.viewMode === 0 ? 1 : 0;
                this.cb.onParamChange();
                this.updateDisplay();
                   this.syncURL();
            }
            // Reset zoom/pan with Z key (in 2D mode)
            else if (e.key === 'z' || e.key === 'Z') {
                if (this.state.viewMode === 1) {
                    this.state.zoom = 1.0;
                    this.state.panX = 0.0;
                    this.state.panY = 0.0;
                    this.cb.onParamChange();
                       this.syncURL();
                }
            }
            // Zoom in/out with +/- keys (in 2D mode)
            else if (e.key === '=' || e.key === '+') {
                if (this.state.viewMode === 1) {
                    this.state.zoom = Math.min(10.0, this.state.zoom * 1.2);
                    this.cb.onParamChange();
                       this.syncURL();
                }
            }
            else if (e.key === '-' || e.key === '_') {
                if (this.state.viewMode === 1) {
                    this.state.zoom = Math.max(0.5, this.state.zoom / 1.2);
                    this.cb.onParamChange();
                       this.syncURL();
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
                   this.syncURL();
            }
            // Toggle log scale for susceptibility plot (L key)
            else if (e.key === 'l' && !e.shiftKey && !e.ctrlKey) {
                if (this.cb.onToggleLogScale) {
                    this.cb.onToggleLogScale();
                }
                   this.syncURL();
            }
            // Cycle active layer down/up with Shift+[ / Shift+]
            else if (e.key === '{' || (e.key === '[' && e.shiftKey)) {
                this.state.activeLayer = Math.max(0, (this.state.activeLayer ?? 0) - 1);
                if (this.cb.onParamChange) this.cb.onParamChange();
                this.updateDisplay();
                   this.syncURL();
            }
            else if (e.key === '}' || (e.key === ']' && e.shiftKey)) {
                const maxLayer = Math.max(0, (this.state.layerCount ?? 1) - 1);
                this.state.activeLayer = Math.min(maxLayer, (this.state.activeLayer ?? 0) + 1);
                if (this.cb.onParamChange) this.cb.onParamChange();
                this.updateDisplay();
                   this.syncURL();
            }
        });
}
