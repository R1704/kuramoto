export function renderRCModeComparePlot(rcModeCompareInfo) {
    const canvas = document.getElementById('rc-mode-compare-plot');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const results = rcModeCompareInfo.results || [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (results.length === 0) {
        ctx.fillStyle = '#666';
        ctx.font = '11px Monaco, monospace';
        ctx.fillText('No results yet', 10, 20);
        return;
    }

    const padding = 10;
    const width = canvas.width - padding * 2;
    const height = canvas.height - padding * 2;
    const max = Math.max(...results.map((r) => r.testNRMSE));
    const scaleMax = Math.max(0.5, Math.min(2.0, max));
    const barWidth = width / results.length;

    ctx.font = '10px Monaco, monospace';
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const value = Math.min(scaleMax, result.testNRMSE);
        const bh = (value / scaleMax) * height;
        const x = padding + i * barWidth;
        const y = padding + (height - bh);
        ctx.fillStyle = 'rgba(255, 152, 0, 0.7)';
        ctx.fillRect(x + 6, y, barWidth - 12, bh);
        ctx.fillStyle = '#aaa';
        ctx.fillText(result.mode.replace('_mod', ''), x + 6, canvas.height - 6);
    }
}

export function drawRCPlot(reservoir) {
    const canvas = document.getElementById('rc-plot');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    const predictions = reservoir.predictions;
    const targets = reservoir.targets;

    if (targets.length < 2) return;

    const allValues = [...predictions, ...targets].filter((v) => isFinite(v));
    if (allValues.length === 0) return;

    const yMin = Math.min(...allValues) - 0.1;
    const yMax = Math.max(...allValues) + 0.1;
    const yRange = yMax - yMin || 1;

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    const zeroY = height - (0 - yMin) / yRange * height;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(width, zeroY);
    ctx.stroke();

    ctx.strokeStyle = '#FF9800';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < targets.length; i++) {
        const x = (i / (targets.length - 1)) * width;
        const y = height - (targets[i] - yMin) / yRange * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (predictions.length > 0) {
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < predictions.length; i++) {
            if (!isFinite(predictions[i])) continue;
            const x = (i / (Math.max(predictions.length, targets.length) - 1)) * width;
            const y = height - (predictions[i] - yMin) / yRange * height;
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }

    ctx.fillStyle = '#FF9800';
    ctx.fillRect(width - 80, 5, 12, 3);
    ctx.fillStyle = '#888';
    ctx.font = '9px sans-serif';
    ctx.fillText('target', width - 65, 10);

    ctx.fillStyle = '#2196F3';
    ctx.fillRect(width - 80, 15, 12, 3);
    ctx.fillStyle = '#888';
    ctx.fillText('pred', width - 65, 20);
}

export function renderRCKSweepPlot(rcKsweepPlot, rcCritSweepInfo) {
    if (!rcKsweepPlot) return;
    const results = rcCritSweepInfo.results || [];
    if (!results || results.length === 0) {
        rcKsweepPlot.render(new Float32Array(0));
        return;
    }

    const sorted = [...results].sort((a, b) => a.K - b.K);
    const data = new Float32Array(sorted.length);
    for (let i = 0; i < sorted.length; i++) {
        data[i] = sorted[i].testNRMSE;
    }
    rcKsweepPlot.render(data);

    const canvas = rcKsweepPlot.canvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const left = rcKsweepPlot.leftMargin || 0;
    const plotWidth = width - left;
    const yAxis = height - 4;

    ctx.save();
    ctx.translate(0, 0);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, yAxis);
    ctx.lineTo(width, yAxis);
    ctx.stroke();

    ctx.fillStyle = '#777';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const ticks = [sorted[0].K, sorted[Math.floor(sorted.length / 2)].K, sorted[sorted.length - 1].K];
    ticks.forEach((k, idx) => {
        const t = idx / (ticks.length - 1 || 1);
        const x = left + t * plotWidth;
        ctx.beginPath();
        ctx.moveTo(x, yAxis);
        ctx.lineTo(x, yAxis + 4);
        ctx.stroke();
        ctx.fillText(k.toFixed(2), x, yAxis + 6);
    });
    ctx.restore();
}
