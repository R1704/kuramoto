export class PhaseDiagramPlot {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.warn(`Canvas ${canvasId} not found`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        
        this.K_range = [0, 3];
        this.currentK = 0;
        this.estimatedKc = null;
        
        this.margin = { left: 35, right: 10, top: 15, bottom: 25 };
        
        this.setupHiDPI();
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
    
    setCurrentK(K) {
        this.currentK = K;
    }
    
    /**
     * Render phase diagram
     * @param {Array} data - Array of {K, R_mean, R_std, chi} objects
     * @param {number} estimatedKc - Estimated critical coupling
     */
    render(data, estimatedKc = null) {
        if (!this.canvas || !this.ctx) return;
        
        const W = this.displayWidth;
        const H = this.displayHeight;
        const ctx = this.ctx;
        const { left, right, top, bottom } = this.margin;
        const plotW = W - left - right;
        const plotH = H - top - bottom;
        
        this.estimatedKc = estimatedKc;
        
        // Clear
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, W, H);
        
        // Axes
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(left, H - bottom);
        ctx.lineTo(W - right, H - bottom);
        ctx.stroke();
        
        // Labels
        ctx.fillStyle = '#888';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('K', left + plotW / 2, H - 4);
        
        ctx.save();
        ctx.translate(10, top + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Local R̄', 0, 0);
        ctx.restore();
        
        // Tick labels
        ctx.fillStyle = '#666';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('1.0', left - 4, top + 4);
        ctx.fillText('0.5', left - 4, top + plotH / 2 + 4);
        ctx.fillText('0.0', left - 4, H - bottom + 4);

        // Midline grid
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, top + plotH / 2);
        ctx.lineTo(W - right, top + plotH / 2);
        ctx.stroke();
        
        ctx.textAlign = 'center';
        ctx.fillText('0', left, H - bottom + 12);
        ctx.fillText(this.K_range[1].toString(), W - right, H - bottom + 12);
        
        if (data.length < 2) {
            ctx.fillStyle = '#666';
            ctx.textAlign = 'center';
            ctx.fillText('Run K-scan to build phase diagram', W / 2, H / 2);
            return;
        }
        
        // Update K range from data
        const K_max = Math.max(...data.map(d => d.K));
        this.K_range[1] = Math.max(K_max, 2);
        
        // Draw error bars
        ctx.strokeStyle = 'rgba(74, 158, 255, 0.3)';
        ctx.lineWidth = 1;
        for (const point of data) {
            const x = left + (point.K / this.K_range[1]) * plotW;
            const yMean = top + (1 - point.R_mean) * plotH;
            const yTop = top + (1 - point.R_mean - point.R_std) * plotH;
            const yBot = top + (1 - point.R_mean + point.R_std) * plotH;
            
            ctx.beginPath();
            ctx.moveTo(x, Math.max(top, yTop));
            ctx.lineTo(x, Math.min(H - bottom, yBot));
            ctx.stroke();
        }
        
        // Draw R(K) line
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
            const point = data[i];
            const x = left + (point.K / this.K_range[1]) * plotW;
            const y = top + (1 - point.R_mean) * plotH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // Draw data points
        ctx.fillStyle = '#4CAF50';
        for (const point of data) {
            const x = left + (point.K / this.K_range[1]) * plotW;
            const y = top + (1 - point.R_mean) * plotH;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Mark K_c
        if (this.estimatedKc !== null) {
            const xKc = left + (this.estimatedKc / this.K_range[1]) * plotW;
            ctx.strokeStyle = '#FF5722';
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(xKc, top);
            ctx.lineTo(xKc, H - bottom);
            ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.fillStyle = '#FF5722';
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`Kc≈${this.estimatedKc.toFixed(2)}`, xKc + 4, top + 12);
        }
        
        // Current K marker
        const xCurrent = left + (this.currentK / this.K_range[1]) * plotW;
        ctx.fillStyle = '#2196F3';
        ctx.beginPath();
        ctx.arc(xCurrent, H - bottom, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Current K label
        ctx.fillStyle = '#2196F3';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`K=${this.currentK.toFixed(2)}`, xCurrent, H - bottom - 8);
    }
}

/**
 * Phase Space Plot (θ on unit circle)
 * Renders a subsampled scatter of oscillator phases on a unit circle.
 */
