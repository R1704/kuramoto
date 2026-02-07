// Helper function to evaluate kernel with all shape support
function evaluateMexhatKernelForShape(dx, dy, shape, state) {
    const s1 = state.sigma;
    const s2 = state.sigma2;
    const beta = state.beta;
    
    // Shape 0: Isotropic (circular)
    if (shape === 0) {
        const dist2 = dx * dx + dy * dy;
        const w1 = Math.exp(-dist2 / (2 * s1 * s1));
        const w2 = Math.exp(-dist2 / (2 * s2 * s2));
        return w1 - beta * w2;
    }
    
    // Shape 1: Anisotropic (elliptical with rotation)
    else if (shape === 1) {
        const angle = state.kernelOrientation || 0;
        const aspect = state.kernelAspect || 1.0;
        
        // Rotate coordinates
        const cos_a = Math.cos(angle);
        const sin_a = Math.sin(angle);
        const dx_rot = dx * cos_a + dy * sin_a;
        const dy_rot = -dx * sin_a + dy * cos_a;
        
        // Scale y by aspect ratio
        const dy_scaled = dy_rot / aspect;
        const dist2 = dx_rot * dx_rot + dy_scaled * dy_scaled;
        
        const w1 = Math.exp(-dist2 / (2 * s1 * s1));
        const w2 = Math.exp(-dist2 / (2 * s2 * s2));
        return w1 - beta * w2;
    }
    
    // Shape 2: Multi-scale (sum of multiple scales)
    else if (shape === 2) {
        const dist2 = dx * dx + dy * dy;
        const weight2 = state.kernelScale2Weight || 0;
        const weight3 = state.kernelScale3Weight || 0;
        
        // Base scale
        const w1_base = Math.exp(-dist2 / (2 * s1 * s1));
        const w2_base = Math.exp(-dist2 / (2 * s2 * s2));
        const base = w1_base - beta * w2_base;
        
        // 2× scale
        const sigma_2x = s1 * 2;
        const sigma2_2x = s2 * 2;
        const w1_2x = Math.exp(-dist2 / (2 * sigma_2x * sigma_2x));
        const w2_2x = Math.exp(-dist2 / (2 * sigma2_2x * sigma2_2x));
        const scale2 = w1_2x - beta * w2_2x;
        
        // 3× scale
        const sigma_3x = s1 * 3;
        const sigma2_3x = s2 * 3;
        const w1_3x = Math.exp(-dist2 / (2 * sigma_3x * sigma_3x));
        const w2_3x = Math.exp(-dist2 / (2 * sigma2_3x * sigma2_3x));
        const scale3 = w1_3x - beta * w2_3x;
        
        return base + weight2 * scale2 + weight3 * scale3;
    }
    
    // Shape 3: Asymmetric (directional)
    else if (shape === 3) {
        const angle = state.kernelAsymmetricOrientation || 0;
        const asymmetry = state.kernelAsymmetry || 0;
        
        const pointAngle = Math.atan2(dy, dx);
        const angleDiff = pointAngle - angle;
        const directionalFactor = 1.0 + asymmetry * Math.cos(angleDiff);
        
        const dist2 = dx * dx + dy * dy;
        const w1 = Math.exp(-dist2 / (2 * s1 * s1));
        const w2 = Math.exp(-dist2 / (2 * s2 * s2));
        return directionalFactor * (w1 - beta * w2);
    }
    
    // Shape 4: Step/rectangular
    else if (shape === 4) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < s1) {
            return 1.0;
        } else if (dist < s2) {
            return -beta;
        } else {
            return 0.0;
        }
    }
    
    // Shape 5: Multi-ring
    else if (shape === 5) {
        const r = Math.sqrt(dx * dx + dy * dy);
        const r_norm = r / s2; // normalize to [0, 1]
        const numRings = state.kernelRings || 3;
        const ringWidths = state.kernelRingWidths || [0.2, 0.4, 0.6, 0.8, 1.0];
        const ringWeights = state.kernelRingWeights || [1.0, -0.6, 0.8, -0.4, 0.5];
        
        // Find which ring we're in
        for (let i = 0; i < numRings && i < 5; i++) {
            if (r_norm < ringWidths[i]) {
                // We're in ring i
                const ringInner = i > 0 ? ringWidths[i - 1] : 0.0;
                const ringOuter = ringWidths[i];
                const ringCenter = (ringInner + ringOuter) * 0.5 * s2;
                
                // Gaussian within ring
                const distFromCenter = Math.abs(r - ringCenter);
                const gaussian = Math.exp(-distFromCenter * distFromCenter / (2 * s1 * s1));
                return ringWeights[i] * gaussian;
            }
        }
        
        return 0.0; // outside all rings
    }
    
    // Shape 6: Gabor
    else if (shape === 6) {
        const dist2 = dx * dx + dy * dy;
        const w1 = Math.exp(-dist2 / (2 * s1 * s1)); // excitatory envelope
        const w2 = Math.exp(-dist2 / (2 * s2 * s2)); // inhibitory envelope
        const envelope = w1 - beta * w2; // Mexican-hat envelope
        
        // Spatial frequency components
        const k = state.kernelSpatialFreqMag || 2.0;
        const theta = state.kernelSpatialFreqAngle || 0.0;
        const k_x = k * Math.cos(theta);
        const k_y = k * Math.sin(theta);
        
        // Sinusoidal carrier with phase offset
        const phase = k_x * dx + k_y * dy + (state.kernelGaborPhase || 0.0);
        const carrier = Math.cos(phase);
        
        return envelope * carrier;
    }
    
    // Default to isotropic
    const dist2 = dx * dx + dy * dy;
    const w1 = Math.exp(-dist2 / (2 * s1 * s1));
    const w2 = Math.exp(-dist2 / (2 * s2 * s2));
    return w1 - beta * w2;
}

function evaluateMexhatKernel(dx, dy, state) {
    const primaryShape = state.kernelShape || 0;
    
    // Check if composition is enabled
    if (state.kernelCompositionEnabled) {
        const secondaryShape = state.kernelSecondary || 0;
        const mixRatio = state.kernelMixRatio !== undefined ? state.kernelMixRatio : 0.5;
        
        // Evaluate both kernels
        const primaryWeight = evaluateMexhatKernelForShape(dx, dy, primaryShape, state);
        const secondaryWeight = evaluateMexhatKernelForShape(dx, dy, secondaryShape, state);
        
        // Mix: 0 = all secondary, 1 = all primary
        return secondaryWeight * (1 - mixRatio) + primaryWeight * mixRatio;
    } else {
        // Single kernel mode
        return evaluateMexhatKernelForShape(dx, dy, primaryShape, state);
    }
}

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
            // Mexican-hat - evaluate along x-axis (dx=dist, dy=0)
            weight = evaluateMexhatKernel(dist, 0, state);
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
            
            let weight = 0;
            if (state.ruleMode === 4) {
                // Mexican-hat kernel with shape support
                weight = evaluateMexhatKernel(dx, dy, state);
            } else {
                // Gaussian falloff for other rules
                const dist = Math.sqrt(dx * dx + dy * dy);
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
    
    // Grid scale indicator (show how large the kernel is relative to grid)
    if (state.ruleMode === 4 && state.gridSize) {
        // Calculate what fraction of the grid the kernel covers
        const kernelExtent = maxDistDraw; // The distance shown in visualization
        const gridPixelSize = 1.0; // Each grid cell is 1 unit
        const gridPixelInViz = (gridPixelSize / maxDistDraw) * (w2 / 2); // Size of one grid cell in viz
        
        // Draw a small square in corner showing grid cell size
        const cornerX = 10;
        const cornerY = 10;
        const scaleSize = Math.max(2, Math.min(20, gridPixelInViz)); // Clamp between 2-20 pixels
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(cornerX, cornerY, scaleSize, scaleSize);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(cornerX, cornerY, scaleSize, scaleSize);
        
        // Label
        ctx.fillStyle = '#aaa';
        ctx.font = '8px Monaco';
        ctx.textAlign = 'left';
        ctx.fillText('1 grid cell', cornerX + scaleSize + 4, cornerY + scaleSize / 2 + 3);
        
        // Add kernel extent info
        ctx.fillStyle = '#888';
        ctx.font = '9px Monaco';
        ctx.textAlign = 'center';
        ctx.fillText(`Kernel: ${(state.sigma2 * 3.5).toFixed(1)} cells`, w2 / 2, h2 - 20);
    }
    
    // Color scale legend
    ctx.fillStyle = '#666';
    ctx.font = '9px Monaco';
    ctx.textAlign = 'left';
    ctx.fillText('Excite', 5, h2 - 5);
    ctx.textAlign = 'right';
    ctx.fillText('Inhibit', w2 - 5, h2 - 5);
}
