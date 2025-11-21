export function drawKernel(state) {
    const kernelCanvas = document.getElementById('kernel-canvas-1d');
    const kernel2DCanvas = document.getElementById('kernel-canvas-2d');
    
    if (!kernelCanvas || !kernel2DCanvas) return;
    
    const kernelCtx = kernelCanvas.getContext('2d');
    const kernel2DCtx = kernel2DCanvas.getContext('2d');
    
    draw1DKernel(kernelCtx, kernelCanvas, state);
    draw2DKernel(kernel2DCtx, kernel2DCanvas, state);
}

function draw1DKernel(ctx, canvas, state) {
    const w = canvas.width;
    const h = canvas.height;
    
    // Clear
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, w, h);
    
    // Grid
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = (h - 20) * i / 4 + 10;
        ctx.beginPath();
        ctx.moveTo(30, y);
        ctx.lineTo(w - 10, y);
        ctx.stroke();
    }
    
    // Axes
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, h - 10);
    ctx.lineTo(w - 10, h - 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(30, 10);
    ctx.lineTo(30, h - 10);
    ctx.stroke();
    
    // Labels
    ctx.fillStyle = '#666';
    ctx.font = '10px Monaco';
    ctx.textAlign = 'right';
    ctx.fillText('1', 25, 15);
    ctx.fillText('0', 25, h - 7);
    ctx.fillText('-1', 25, h - 7 + (h - 20) / 2);
    ctx.textAlign = 'center';
    ctx.fillText('distance', w / 2, h - 2);
    
    // Compute kernel values
    const maxDist = state.ruleMode === 4 ? state.sigma2 * 3.5 : state.range * 3;
    const points = [];
    let minW = 0, maxW = 1;
    
    for (let px = 0; px < w - 40; px++) {
        const dist = (px / (w - 40)) * maxDist;
        let weight = 0;
        
        if (state.ruleMode === 4) {
            // Mexican-hat
            const w1 = Math.exp(-dist * dist / (2 * state.sigma * state.sigma));
            const w2 = Math.exp(-dist * dist / (2 * state.sigma2 * state.sigma2));
            weight = w1 - state.beta * w2;
        } else {
            // Gaussian falloff (default for other rules)
            weight = Math.exp(-dist * dist / (2 * state.range * state.range));
        }
        
        points.push({ x: px + 30, w: weight, dist: dist });
        minW = Math.min(minW, weight);
        maxW = Math.max(maxW, weight);
    }
    
    // Normalize to [-1, 1] range
    const range = Math.max(Math.abs(minW), Math.abs(maxW));
    
    // Draw neighborhood range cutoff (if not global coupling and not Mexican-hat)
    if (!state.globalCoupling && state.ruleMode !== 4) {
        const cutoffX = 30 + (state.range / maxDist) * (w - 40);
        ctx.strokeStyle = '#ff9900';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cutoffX, 10);
        ctx.lineTo(cutoffX, h - 10);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Label
        ctx.fillStyle = '#ff9900';
        ctx.font = '9px Monaco';
        ctx.textAlign = 'center';
        ctx.fillText('range', cutoffX, h - 12);
    }
    
    // Draw coupling strength indicator (horizontal line at K0)
    const k0Level = h - 10 - ((state.K0 / 3.0 + 1) / 2) * (h - 20); // Map K0 [0-3] to display
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(30, k0Level);
    ctx.lineTo(w - 10, k0Level);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
    
    // K0 label
    ctx.fillStyle = '#00ff88';
    ctx.font = '9px Monaco';
    ctx.textAlign = 'right';
    ctx.fillText(`K=${state.K0.toFixed(1)}`, 26, k0Level - 2);
    
    // Draw curve
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const normW = p.w / (range > 0 ? range : 1);
        const y = h - 10 - ((normW + 1) / 2) * (h - 20);
        if (i === 0) ctx.moveTo(p.x, y);
        else ctx.lineTo(p.x, y);
    }
    ctx.stroke();
    
    // Fill areas
    ctx.globalAlpha = 0.2;
    
    // Positive (excitation)
    ctx.fillStyle = '#4a9eff';
    ctx.beginPath();
    ctx.moveTo(30, h - 10);
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const normW = Math.max(0, p.w / (range > 0 ? range : 1));
        const y = h - 10 - ((normW + 1) / 2) * (h - 20);
        ctx.lineTo(p.x, y);
    }
    ctx.lineTo(w - 10, h - 10);
    ctx.closePath();
    ctx.fill();
    
    // Negative (inhibition)
    ctx.fillStyle = '#ff4a4a';
    ctx.beginPath();
    ctx.moveTo(30, h - 10);
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const normW = Math.min(0, p.w / (range > 0 ? range : 1));
        const y = h - 10 - ((normW + 1) / 2) * (h - 20);
        ctx.lineTo(p.x, y);
    }
    ctx.lineTo(w - 10, h - 10);
    ctx.closePath();
    ctx.fill();
    
    ctx.globalAlpha = 1.0;
    
    // Zero line
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(30, h - 10 - (h - 20) / 2);
    ctx.lineTo(w - 10, h - 10 - (h - 20) / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Global coupling indicator
    if (state.globalCoupling) {
        ctx.fillStyle = '#5fd35f';
        ctx.font = 'bold 10px Monaco';
        ctx.textAlign = 'center';
        ctx.fillText('GLOBAL', w / 2, 22);
    }
}

function draw2DKernel(ctx, canvas, state) {
    const w2 = canvas.width;
    const h2 = canvas.height;
    
    // Clear
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, w2, h2);
    
    // Compute 2D kernel grid
    const gridSize = 60; // 60x60 samples for smooth visualization
    const centerX = gridSize / 2;
    const centerY = gridSize / 2;
    const maxDistDraw = state.ruleMode === 4 ? state.sigma2 * 3.5 : state.range * 3;
    
    let minWeight2D = Infinity;
    let maxWeight2D = -Infinity;
    const weights2D = [];
    
    for (let gy = 0; gy < gridSize; gy++) {
        const row = [];
        for (let gx = 0; gx < gridSize; gx++) {
            const dx = (gx - centerX) / gridSize * maxDistDraw * 2;
            const dy = (gy - centerY) / gridSize * maxDistDraw * 2;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            let weight = 0;
            if (state.ruleMode === 4) {
                // Mexican-hat kernel
                const w1 = Math.exp(-dist * dist / (2 * state.sigma * state.sigma));
                const w2 = Math.exp(-dist * dist / (2 * state.sigma2 * state.sigma2));
                weight = w1 - state.beta * w2;
            } else {
                // Gaussian falloff for other rules
                weight = Math.exp(-dist * dist / (2 * state.range * state.range));
            }
            
            row.push(weight);
            minWeight2D = Math.min(minWeight2D, weight);
            maxWeight2D = Math.max(maxWeight2D, weight);
        }
        weights2D.push(row);
    }
    
    // Render heatmap
    const cellW = w2 / gridSize;
    const cellH = h2 / gridSize;
    const range2D = Math.max(Math.abs(minWeight2D), Math.abs(maxWeight2D));
    
    for (let gy = 0; gy < gridSize; gy++) {
        for (let gx = 0; gx < gridSize; gx++) {
            const weight = weights2D[gy][gx];
            const normWeight = weight / (range2D > 0 ? range2D : 1);
            
            // Color mapping: blue (excitation) to red (inhibition)
            let r, g, b;
            if (normWeight > 0) {
                // Positive: blue tones
                r = 0;
                g = Math.floor(normWeight * 160);
                b = Math.floor(normWeight * 255);
            } else {
                // Negative: red tones
                const absNorm = Math.abs(normWeight);
                r = Math.floor(absNorm * 255);
                g = 0;
                b = 0;
            }
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(gx * cellW, gy * cellH, cellW + 1, cellH + 1);
        }
    }
    
    // Draw center marker
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w2 / 2, h2 / 2, 4, 0, 2 * Math.PI);
    ctx.stroke();
    
    // Draw range circle (if not global and not Mexican-hat)
    if (!state.globalCoupling && state.ruleMode !== 4) {
        const rangeRadius = (state.range / maxDistDraw) * (w2 / 2);
        ctx.strokeStyle = '#ff9900';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(w2 / 2, h2 / 2, rangeRadius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // Color scale legend
    ctx.fillStyle = '#666';
    ctx.font = '9px Monaco';
    ctx.textAlign = 'left';
    ctx.fillText('Excite', 5, h2 - 5);
    ctx.textAlign = 'right';
    ctx.fillText('Inhibit', w2 - 5, h2 - 5);
}
