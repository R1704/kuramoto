/**
 * Sparkline Utilities Module
 *
 * Canvas resizing and rendering for sparkline charts.
 */

/**
 * Resize canvas to match display size with device pixel ratio.
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 */
export function resizeSparkCanvas(canvas, ctx) {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
}

/**
 * Render a sparkline chart on canvas.
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Float32Array} data - Data array to render
 * @param {Object} opts - Rendering options
 * @param {number} opts.yMin - Minimum Y value
 * @param {number} opts.yMax - Maximum Y value
 * @param {string} opts.color - Line color
 */
export function renderSparkline(canvas, ctx, data, opts) {
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, w, h);

    const yMin = opts.yMin;
    const yMax = opts.yMax;
    const denom = Math.max(1e-8, yMax - yMin);

    ctx.strokeStyle = opts.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * (w - 2) + 1;
        const v = data[i];
        const t = (v - yMin) / denom;
        const y = (1 - Math.min(1, Math.max(0, t))) * (h - 2) + 1;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const last = data[data.length - 1];
    const tt = (last - yMin) / denom;
    const yy = (1 - Math.min(1, Math.max(0, tt))) * (h - 2) + 1;
    ctx.fillStyle = opts.color;
    ctx.beginPath();
    ctx.arc(w - 3, yy, 3, 0, Math.PI * 2);
    ctx.fill();
}
