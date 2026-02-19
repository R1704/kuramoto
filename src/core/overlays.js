/**
 * Overlay Drawing Module
 *
 * Canvas overlay rendering for graph topology and RC task visualization.
 */

/**
 * Project world coordinates to screen coordinates using view projection matrix.
 * @param {Float32Array} viewProj - 4x4 view projection matrix
 * @param {number} wx - World x coordinate
 * @param {number} wy - World y coordinate
 * @param {number} wz - World z coordinate
 * @param {number} w - Screen width
 * @param {number} h - Screen height
 * @returns {{visible: boolean, x: number, y: number}} Screen coordinates
 */
export function projectWorldToScreen(viewProj, wx, wy, wz, w, h) {
    const x = wx;
    const y = wy;
    const z = wz;
    const cx = viewProj[0] * x + viewProj[4] * y + viewProj[8] * z + viewProj[12];
    const cy = viewProj[1] * x + viewProj[5] * y + viewProj[9] * z + viewProj[13];
    const cz = viewProj[2] * x + viewProj[6] * y + viewProj[10] * z + viewProj[14];
    const cw = viewProj[3] * x + viewProj[7] * y + viewProj[11] * z + viewProj[15];
    if (cw <= 0.00001) return { visible: false, x: 0, y: 0 };
    const ndcX = cx / cw;
    const ndcY = cy / cw;
    const ndcZ = cz / cw;
    if (ndcZ < -1.2 || ndcZ > 1.2) return { visible: false, x: 0, y: 0 };
    const sx = (ndcX * 0.5 + 0.5) * w;
    const sy = (1.0 - (ndcY * 0.5 + 0.5)) * h;
    return { visible: isFinite(sx) && isFinite(sy), x: sx, y: sy };
}

/**
 * Map normalized dot coordinates to screen coordinates.
 * @param {number} nx - Normalized x (0-1)
 * @param {number} ny - Normalized y (0-1)
 * @param {Float32Array} viewProj - View projection matrix (for 3D mode)
 * @param {Object} options - Configuration options
 * @param {HTMLCanvasElement} options.rcOverlay - RC overlay canvas
 * @param {Object} options.STATE - Application state
 * @param {Float32Array} options.rcOverlayLastThetaLayer - Last theta layer data
 * @returns {{visible: boolean, x: number, y: number}} Screen coordinates
 */
export function mapDotNormToScreen(nx, ny, viewProj, options) {
    const { rcOverlay, STATE, rcOverlayLastThetaLayer } = options;
    if (!rcOverlay) return { visible: false, x: 0, y: 0 };
    const w = rcOverlay.width;
    const h = rcOverlay.height;

    if (STATE.viewMode === 1) {
        // Match 2D shader UV convention: (0,0)=top-left.
        const zoom = (STATE.zoom && STATE.zoom > 0) ? STATE.zoom : 1.0;
        let u = nx;
        let v = ny;
        u = (u - 0.5) / zoom + (STATE.panX || 0.0) + 0.5;
        v = (v - 0.5) / zoom + (STATE.panY || 0.0) + 0.5;
        if (u < 0 || u > 1 || v < 0 || v > 1) return { visible: false, x: 0, y: 0 };
        return { visible: true, x: u * w, y: v * h };
    }

    if (!viewProj) return { visible: false, x: 0, y: 0 };
    const grid = STATE.gridSize;
    const cx = Math.min(grid - 1, Math.max(0, Math.floor(nx * grid)));
    const cy = Math.min(grid - 1, Math.max(0, Math.floor(ny * grid)));
    const gx = cx + 0.5;
    const gy = cy + 0.5;
    const wx = gx * 0.5 - grid * 0.25;
    const wz = gy * 0.5 - grid * 0.25;

    let thetaVal = null;
    if (rcOverlayLastThetaLayer && rcOverlayLastThetaLayer.length === grid * grid) {
        thetaVal = rcOverlayLastThetaLayer[cy * grid + cx];
    }
    const h3 = thetaVal !== null && isFinite(thetaVal) ? Math.sin(thetaVal) * 2.0 : 0.0;
    const layer = Math.min(Math.max(0, STATE.activeLayer ?? 0), (STATE.layerCount || 1) - 1);
    const wy = h3 + (STATE.layerZOffset || 0.0) * layer;
    return projectWorldToScreen(viewProj, wx, wy, wz, w, h);
}

/**
 * Draw the Reservoir Computing task overlay (moving dot visualization).
 * @param {Float32Array} viewProj - View projection matrix
 * @param {Object} options - Drawing options
 * @param {HTMLCanvasElement} options.rcOverlay - RC overlay canvas
 * @param {CanvasRenderingContext2D} options.rcOverlayCtx - RC overlay context
 * @param {Object} options.STATE - Application state
 * @param {Object} options.reservoir - Reservoir computer instance
 * @param {Object} options.rcCritSweepRunner - RC criticality sweep runner
 * @param {Function} options.resizeCanvasesToDisplay - Canvas resize function
 * @param {Float32Array} options.rcOverlayLastThetaLayer - Last theta layer data
 * @param {Array} options.rcDotTrail - Dot trail history
 * @param {number} options.rcDotTrailMax - Maximum trail length
 */
export function drawRCTaskOverlay(viewProj, options) {
    const {
        rcOverlay,
        rcOverlayCtx,
        STATE,
        reservoir,
        rcCritSweepRunner,
        resizeCanvasesToDisplay,
        rcOverlayLastThetaLayer,
        rcDotTrail,
        rcDotTrailMax
    } = options;

    if (!rcOverlayCtx || !rcOverlay) return;
    resizeCanvasesToDisplay();
    const w = rcOverlay.width;
    const h = rcOverlay.height;
    rcOverlayCtx.clearRect(0, 0, w, h);

    const sweepActive = rcCritSweepRunner && rcCritSweepRunner.isRunning && rcCritSweepRunner.isRunning();
    const show = (STATE.rcEnabled && STATE.rcTask === 'moving_dot') || (sweepActive && STATE.rcTask === 'moving_dot');
    if (!show) return;

    const x = reservoir.tasks?.currentDotX ?? 0.5;
    const xNext = reservoir.tasks?.currentDotXNext ?? null;
    const y = reservoir.tasks?.movingDotY ?? 0.5;

    const p = mapDotNormToScreen(x, y, viewProj, { rcOverlay, STATE, rcOverlayLastThetaLayer });
    if (!p.visible) return;

    // Update trail in normalized coords
    if (rcDotTrail.length === 0 || rcDotTrail[rcDotTrail.length - 1].x !== x || rcDotTrail[rcDotTrail.length - 1].y !== y) {
        rcDotTrail.push({ x, y });
        if (rcDotTrail.length > rcDotTrailMax) rcDotTrail.shift();
    }

    if (rcDotTrail.length >= 2) {
        rcOverlayCtx.strokeStyle = 'rgba(255, 152, 0, 0.25)';
        rcOverlayCtx.lineWidth = 2;
        rcOverlayCtx.beginPath();
        let started = false;
        for (let i = 0; i < rcDotTrail.length; i++) {
            const pp = mapDotNormToScreen(rcDotTrail[i].x, rcDotTrail[i].y, viewProj, { rcOverlay, STATE, rcOverlayLastThetaLayer });
            if (!pp.visible) continue;
            if (!started) { rcOverlayCtx.moveTo(pp.x, pp.y); started = true; }
            else rcOverlayCtx.lineTo(pp.x, pp.y);
        }
        if (started) rcOverlayCtx.stroke();
    }

    rcOverlayCtx.fillStyle = 'rgba(255, 152, 0, 0.95)';
    rcOverlayCtx.beginPath();
    rcOverlayCtx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    rcOverlayCtx.fill();

    if (xNext !== null && Number.isFinite(xNext)) {
        const gp = mapDotNormToScreen(xNext, y, viewProj, { rcOverlay, STATE, rcOverlayLastThetaLayer });
        if (gp.visible) {
            rcOverlayCtx.strokeStyle = 'rgba(255, 152, 0, 0.5)';
            rcOverlayCtx.lineWidth = 2;
            rcOverlayCtx.beginPath();
            rcOverlayCtx.arc(gp.x, gp.y, 9, 0, Math.PI * 2);
            rcOverlayCtx.stroke();
        }
    }
}

/**
 * Draw the graph topology overlay (network edges).
 * @param {Object} topology - Topology data with counts and neighbors
 * @param {Object} options - Drawing options
 * @param {HTMLCanvasElement} options.graphOverlay - Graph overlay canvas
 * @param {CanvasRenderingContext2D} options.graphOverlayCtx - Graph overlay context
 * @param {Object} options.STATE - Application state
 * @param {Object} options.sim - Simulation instance
 * @param {Function} options.resizeCanvasesToDisplay - Canvas resize function
 */
export function drawGraphOverlay(topology, options) {
    const {
        graphOverlay,
        graphOverlayCtx,
        STATE,
        sim,
        resizeCanvasesToDisplay,
        gaugeOverlayData,
        gaugeProbeData,
        overlayMouseNorm
    } = options;

    if (!graphOverlayCtx || !graphOverlay) return;
    resizeCanvasesToDisplay();
    graphOverlayCtx.clearRect(0, 0, graphOverlay.width, graphOverlay.height);
    graphOverlay.style.display = 'none';
    const is2D = STATE.viewMode === 1;
    const canGaugeOverlay = is2D && STATE.manifoldMode === 's1' && STATE.topologyMode === 'grid';
    const showGraph = !!STATE.graphOverlayEnabled && is2D && STATE.topologyMode !== 'grid';
    const showGaugeLinks = !!STATE.overlayGaugeLinks && canGaugeOverlay && gaugeOverlayData?.ax && gaugeOverlayData?.ay;
    const showPlaquetteSign = !!STATE.overlayPlaquetteSign && canGaugeOverlay && gaugeOverlayData?.ax && gaugeOverlayData?.ay;
    const showProbe = !!STATE.overlayProbeEnabled && canGaugeOverlay && gaugeProbeData && overlayMouseNorm?.inside;
    if (!showGraph && !showGaugeLinks && !showPlaquetteSign && !showProbe) return;

    const grid = STATE.gridSize;
    const w = graphOverlay.width;
    const h = graphOverlay.height;
    graphOverlay.style.display = 'block';

    if (showGraph && topology?.counts && topology?.neighbors && grid <= 256) {
        const counts = topology.counts;
        const neighbors = topology.neighbors;
        const maxDeg = sim.maxGraphDegree;

        let edges = 0;
        for (let i = 0; i < counts.length; i++) edges += counts[i];
        edges = Math.max(1, Math.floor(edges / 2));

        const maxEdges = 400;
        const prob = Math.min(1, maxEdges / edges);
        let drawn = 0;
        let rng = STATE.topologySeed || 1;
        const rand = () => {
            rng = (rng * 1664525 + 1013904223) >>> 0;
            return rng / 4294967296;
        };

        graphOverlayCtx.strokeStyle = 'rgba(255,255,255,0.35)';
        graphOverlayCtx.lineWidth = 1.0;

        for (let i = 0; i < counts.length; i++) {
            const deg = Math.min(counts[i], maxDeg);
            if (!deg) continue;
            const base = i * maxDeg;
            const cx = ((i % grid) + 0.5) / grid * w;
            const cy = (Math.floor(i / grid) + 0.5) / grid * h;
            for (let j = 0; j < deg; j++) {
                const nbr = neighbors[base + j];
                if (nbr <= i) continue;
                if (rand() > prob) continue;
                const nx = ((nbr % grid) + 0.5) / grid * w;
                const ny = (Math.floor(nbr / grid) + 0.5) / grid * h;
                const jitter = 0.002;
                const jx = (rand() - 0.5) * w * jitter;
                const jy = (rand() - 0.5) * h * jitter;
                graphOverlayCtx.beginPath();
                graphOverlayCtx.moveTo(cx + jx, cy + jy);
                graphOverlayCtx.lineTo(nx - jx, ny - jy);
                graphOverlayCtx.stroke();
                drawn++;
                if (drawn >= maxEdges) break;
            }
            if (drawn >= maxEdges) break;
        }
    }

    if ((showGaugeLinks || showPlaquetteSign) && gaugeOverlayData?.ax && gaugeOverlayData?.ay) {
        const layer = Math.min(Math.max(0, STATE.activeLayer ?? 0), (sim.layers || 1) - 1);
        const layerOffset = layer * grid * grid;
        const stride = Math.max(6, Math.floor(grid / 48));

        if (showGaugeLinks) {
            graphOverlayCtx.strokeStyle = 'rgba(58, 188, 255, 0.6)';
            graphOverlayCtx.lineWidth = 1;
            for (let r = 0; r < grid; r += stride) {
                for (let c = 0; c < grid; c += stride) {
                    const idx = layerOffset + r * grid + c;
                    const ax = gaugeOverlayData.ax[idx] || 0;
                    const ay = gaugeOverlayData.ay[idx] || 0;
                    const px = (c + 0.5) / grid * w;
                    const py = (r + 0.5) / grid * h;
                    const scale = Math.min(w, h) / grid * 0.45;
                    const dx = Math.max(-1.5, Math.min(1.5, ax)) * scale;
                    const dy = Math.max(-1.5, Math.min(1.5, ay)) * scale;
                    graphOverlayCtx.beginPath();
                    graphOverlayCtx.moveTo(px, py);
                    graphOverlayCtx.lineTo(px + dx, py + dy);
                    graphOverlayCtx.stroke();
                }
            }
        }

        if (showPlaquetteSign) {
            graphOverlayCtx.font = '9px monospace';
            graphOverlayCtx.textAlign = 'center';
            graphOverlayCtx.textBaseline = 'middle';
            for (let r = 0; r < grid; r += stride) {
                for (let c = 0; c < grid; c += stride) {
                    const idx = layerOffset + r * grid + c;
                    const right = layerOffset + r * grid + ((c + 1) % grid);
                    const up = layerOffset + ((r + 1) % grid) * grid + c;
                    const flux = (gaugeOverlayData.ax[idx] || 0)
                        + (gaugeOverlayData.ay[right] || 0)
                        - (gaugeOverlayData.ax[up] || 0)
                        - (gaugeOverlayData.ay[idx] || 0);
                    if (Math.abs(flux) < 1e-3) continue;
                    const px = (c + 0.5) / grid * w;
                    const py = (r + 0.5) / grid * h;
                    graphOverlayCtx.fillStyle = flux >= 0 ? 'rgba(255, 173, 58, 0.8)' : 'rgba(128, 224, 255, 0.85)';
                    graphOverlayCtx.fillText(flux >= 0 ? '+' : '−', px, py);
                }
            }
        }
    }

    if (showProbe && gaugeProbeData) {
        const px = overlayMouseNorm.x * w;
        const py = overlayMouseNorm.y * h;
        const line1 = `cell (${gaugeProbeData.c},${gaugeProbeData.r}) L${gaugeProbeData.layer}`;
        const line2 = `theta=${gaugeProbeData.theta.toFixed(3)} qA=(${gaugeProbeData.ax.toFixed(3)},${gaugeProbeData.ay.toFixed(3)})`;
        const line3 = `D=(dx ${gaugeProbeData.covDx.toFixed(3)}, dy ${gaugeProbeData.covDy.toFixed(3)}) |D|=${gaugeProbeData.cov.toFixed(3)}`;
        const line4 = `flux=${gaugeProbeData.flux.toFixed(3)}`;
        graphOverlayCtx.font = '10px monospace';
        const boxW = Math.max(
            graphOverlayCtx.measureText(line1).width,
            graphOverlayCtx.measureText(line2).width,
            graphOverlayCtx.measureText(line3).width,
            graphOverlayCtx.measureText(line4).width
        ) + 12;
        const boxH = 62;
        const bx = Math.min(w - boxW - 6, Math.max(6, px + 10));
        const by = Math.min(h - boxH - 6, Math.max(6, py + 10));
        graphOverlayCtx.fillStyle = 'rgba(8, 12, 20, 0.88)';
        graphOverlayCtx.fillRect(bx, by, boxW, boxH);
        graphOverlayCtx.strokeStyle = 'rgba(100, 170, 255, 0.7)';
        graphOverlayCtx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
        graphOverlayCtx.fillStyle = 'rgba(220, 235, 255, 0.95)';
        graphOverlayCtx.textAlign = 'left';
        graphOverlayCtx.textBaseline = 'middle';
        graphOverlayCtx.fillText(line1, bx + 6, by + 13);
        graphOverlayCtx.fillText(line2, bx + 6, by + 27);
        graphOverlayCtx.fillText(line3, bx + 6, by + 41);
        graphOverlayCtx.fillText(line4, bx + 6, by + 55);
    }
}
