export class TimeSeriesPlot {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.warn(`Canvas ${canvasId} not found`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        
        this.maxPoints = options.maxPoints || 300;
        this.yMin = options.yMin ?? 0;
        this.yMax = options.yMax ?? 1;
        this.autoScale = options.autoScale || false;
        this.color = options.color || '#4CAF50';
        this.fillColor = options.fillColor || null;
        this.showGrid = options.showGrid !== false;
        this.showValue = options.showValue !== false;
        this.showYAxis = options.showYAxis || false;  // Show Y axis with labels
        this.label = options.label || '';
        this.lineWidth = options.lineWidth || 1.5;
        this.logScale = options.logScale || false;  // Log scale for Y axis
        this.leftMargin = options.showYAxis ? 35 : 0;  // Space for Y axis labels
        
        // High-DPI support
        this.setupHiDPI();
    }
    
    /**
     * Toggle log scale mode
     */
    setLogScale(enabled) {
        this.logScale = enabled;
    }
    
    /**
     * Convert value to Y position, handling log scale
     */
    valueToY(value, yMin, yMax, H) {
        if (this.logScale && value > 0) {
            // Use log scale
            const logMin = Math.log10(Math.max(yMin, 1e-6));
            const logMax = Math.log10(Math.max(yMax, 1e-5));
            const logVal = Math.log10(Math.max(value, 1e-6));
            return H - ((logVal - logMin) / (logMax - logMin)) * H;
        } else {
            // Linear scale
            return H - ((value - yMin) / (yMax - yMin)) * H;
        }
    }
    
    setupHiDPI() {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.displayWidth = rect.width;
        this.displayHeight = rect.height;
    }
    
    /**
     * Render the plot with given data
     * @param {Float32Array} data - Array of values to plot
     */
    render(data) {
        if (!this.canvas || !this.ctx) return;
        
        const W = this.displayWidth;
        const H = this.displayHeight;
        const ctx = this.ctx;
        
        // Auto-scale Y axis if enabled
        let yMin = this.yMin;
        let yMax = this.yMax;
        if (this.autoScale && data.length > 0) {
            let min = Infinity, max = -Infinity;
            for (let i = 0; i < data.length; i++) {
                if (data[i] !== 0) { // Ignore uninitialized values
                    min = Math.min(min, data[i]);
                    max = Math.max(max, data[i]);
                }
            }
            if (min !== Infinity) {
                const range = max - min || 1;
                yMin = min - range * 0.1;
                yMax = max + range * 0.1;
            }
        }
        
        // Calculate plot area (with optional left margin for Y axis)
        const plotLeft = this.leftMargin;
        const plotWidth = W - plotLeft;
        
        // Clear
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, W, H);
        
        // Draw Y axis if enabled
        if (this.showYAxis && !this.logScale) {
            ctx.strokeStyle = '#444';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(plotLeft, 0);
            ctx.lineTo(plotLeft, H);
            ctx.stroke();
            
            // Y axis labels
            ctx.fillStyle = '#888';
            ctx.font = '9px monospace';
            ctx.textAlign = 'right';
            
            const numTicks = 4;
            for (let i = 0; i <= numTicks; i++) {
                const t = i / numTicks;
                const val = yMin + t * (yMax - yMin);
                const py = H - t * H;
                
                // Tick mark
                ctx.beginPath();
                ctx.moveTo(plotLeft - 3, py);
                ctx.lineTo(plotLeft, py);
                ctx.stroke();
                
                // Label (format based on value magnitude)
                let label;
                if (Math.abs(val) >= 100) {
                    label = val.toFixed(0);
                } else if (Math.abs(val) >= 1) {
                    label = val.toFixed(1);
                } else {
                    label = val.toFixed(2);
                }
                ctx.fillText(label, plotLeft - 5, py + 3);
            }
        }
        
        // Grid (in plot area)
        if (this.showGrid) {
            ctx.strokeStyle = '#2a2a3a';
            ctx.lineWidth = 0.5;
            
            // Horizontal grid lines
            for (let y = 0; y <= 1; y += 0.25) {
                const py = H - y * H;
                ctx.beginPath();
                ctx.moveTo(plotLeft, py);
                ctx.lineTo(W, py);
                ctx.stroke();
            }
            
            // Vertical grid lines
            for (let x = 0; x <= 1; x += 0.25) {
                const px = plotLeft + x * plotWidth;
                ctx.beginPath();
                ctx.moveTo(px, 0);
                ctx.lineTo(px, H);
                ctx.stroke();
            }
        }
        
        // Data line
        if (data.length < 2) return;
        
        // Find first non-zero value (start of actual data)
        let startIdx = 0;
        for (let i = 0; i < data.length; i++) {
            if (data[i] !== 0) {
                startIdx = i;
                break;
            }
        }
        
        // Draw filled area if fillColor is set
        if (this.fillColor) {
            ctx.fillStyle = this.fillColor;
            ctx.beginPath();
            
            const firstX = plotLeft + (startIdx / this.maxPoints) * plotWidth;
            ctx.moveTo(firstX, H);
            
            for (let i = startIdx; i < data.length; i++) {
                const x = plotLeft + (i / this.maxPoints) * plotWidth;
                const y = this.valueToY(data[i], yMin, yMax, H);
                ctx.lineTo(x, Math.max(0, Math.min(H, y)));
            }
            
            ctx.lineTo(plotLeft + plotWidth, H);
            ctx.closePath();
            ctx.fill();
        }
        
        // Draw line
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.lineWidth;
        ctx.beginPath();
        
        for (let i = startIdx; i < data.length; i++) {
            const x = plotLeft + (i / this.maxPoints) * plotWidth;
            const y = this.valueToY(data[i], yMin, yMax, H);
            if (i === startIdx) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // Current value marker
        const lastVal = data[data.length - 1];
        const lastY = this.valueToY(lastVal, yMin, yMax, H);
        const markerX = plotLeft + plotWidth - 3;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(markerX, lastY, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Value label
        if (this.showValue) {
            ctx.fillStyle = '#fff';
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(lastVal.toFixed(3), markerX - 5, lastY - 6);
        }
        
        // Axis label
        if (this.label) {
            ctx.fillStyle = '#666';
            ctx.font = '9px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(this.label, plotLeft + 4, 12);
        }
    }
}


/**
 * Phase Diagram Plot - local mean R vs K with error bars
 */
