export class PhaseSpacePlot {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.warn(`Canvas ${canvasId} not found`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        this.maxPoints = options.maxPoints || 2000;
        this.pointSize = options.pointSize || 2;
        this.ringColor = options.ringColor || '#333';
        this.pointColor = options.pointColor || 'rgba(74, 158, 255, 0.8)';
        this.bg = options.bg || '#0f0f1a';
        this.axisColor = options.axisColor || '#1f1f2f';
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

    /**
     * Render from a theta array (Float32Array of radians)
     */
    render(thetaArray) {
        if (!this.canvas || !this.ctx || !thetaArray) return;

        const ctx = this.ctx;
        const W = this.displayWidth;
        const H = this.displayHeight;
        const cx = W / 2;
        const cy = H / 2;
        const radius = Math.min(W, H) * 0.44;

        // Clear background
        ctx.fillStyle = this.bg;
        ctx.fillRect(0, 0, W, H);

        // Draw axes
        ctx.strokeStyle = this.axisColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - radius, cy);
        ctx.lineTo(cx + radius, cy);
        ctx.moveTo(cx, cy - radius);
        ctx.lineTo(cx, cy + radius);
        ctx.stroke();

        // Draw unit circle
        ctx.strokeStyle = this.ringColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Subsample
        const total = thetaArray.length;
        const step = Math.max(1, Math.floor(total / this.maxPoints));
        const offset = 0;

        ctx.fillStyle = this.pointColor;
        ctx.beginPath();
        for (let i = offset; i < total && i < offset + step * this.maxPoints; i += step) {
            const theta = thetaArray[i];
            const x = cx + radius * Math.cos(theta);
            const y = cy - radius * Math.sin(theta);
            ctx.moveTo(x + this.pointSize, y);
            ctx.arc(x, y, this.pointSize, 0, Math.PI * 2);
        }
        ctx.fill();
    }
}
