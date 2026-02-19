/**
 * Overlay Drawing Module
 *
 * Canvas overlay rendering for graph topology and RC task visualization.
 */
import { simCellToScreenPx, simUvToScreenUv } from './viewTransform2d.js';

function wrapIndex(v, n) {
    let x = v % n;
    if (x < 0) x += n;
    return x;
}

function sampleGaugeLayerValue(gaugeOverlayData, layer, grid, c, r, axis) {
    if (!gaugeOverlayData) return 0;
    const src = axis === 'x' ? gaugeOverlayData.ax : gaugeOverlayData.ay;
    if (!src) return 0;
    const cw = wrapIndex(c, grid);
    const rw = wrapIndex(r, grid);
    const sampleGrid = gaugeOverlayData.sampleGrid || 0;
    const sampleStride = Math.max(1, Math.floor(gaugeOverlayData.stride || 1));
    if (sampleGrid > 0 && gaugeOverlayData.layer === layer) {
        const sc = Math.min(sampleGrid - 1, Math.floor(cw / sampleStride));
        const sr = Math.min(sampleGrid - 1, Math.floor(rw / sampleStride));
        return src[sr * sampleGrid + sc] || 0;
    }
    const layerOffset = layer * grid * grid;
    return src[layerOffset + rw * grid + cw] || 0;
}

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
        // RC dot coordinates are in simulation UV space; map to screen UV.
        const mapped = simUvToScreenUv(nx, ny, STATE.zoom, STATE.panX, STATE.panY);
        if (!mapped.visible) return { visible: false, x: 0, y: 0 };
        return { visible: true, x: mapped.u * w, y: mapped.v * h };
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
    const zoom = STATE.zoom || 1.0;
    const panX = STATE.panX || 0.0;
    const panY = STATE.panY || 0.0;
    const toScreen = (c, r) => simCellToScreenPx(c, r, grid, w, h, zoom, panX, panY);
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
            const c0 = i % grid;
            const r0 = Math.floor(i / grid);
            const p0 = toScreen(c0, r0);
            if (!p0.visible) continue;
            for (let j = 0; j < deg; j++) {
                const nbr = neighbors[base + j];
                if (nbr <= i) continue;
                if (rand() > prob) continue;
                const p1 = toScreen(nbr % grid, Math.floor(nbr / grid));
                if (!p1.visible) continue;
                const jitter = 0.002;
                const jx = (rand() - 0.5) * w * jitter;
                const jy = (rand() - 0.5) * h * jitter;
                graphOverlayCtx.beginPath();
                graphOverlayCtx.moveTo(p0.x + jx, p0.y + jy);
                graphOverlayCtx.lineTo(p1.x - jx, p1.y - jy);
                graphOverlayCtx.stroke();
                drawn++;
                if (drawn >= maxEdges) break;
            }
            if (drawn >= maxEdges) break;
        }
    }

    if ((showGaugeLinks || showPlaquetteSign) && gaugeOverlayData?.ax && gaugeOverlayData?.ay) {
        const layer = Math.min(Math.max(0, STATE.activeLayer ?? 0), (sim.layers || 1) - 1);
        const dataStride = Math.max(1, Math.floor(gaugeOverlayData.stride || 1));
        const stride = Math.max(dataStride, Math.max(6, Math.floor(grid / 48)));

        if (showGaugeLinks) {
            graphOverlayCtx.strokeStyle = 'rgba(58, 188, 255, 0.6)';
            graphOverlayCtx.lineWidth = 1;
            for (let r = 0; r < grid; r += stride) {
                for (let c = 0; c < grid; c += stride) {
                    const ax = sampleGaugeLayerValue(gaugeOverlayData, layer, grid, c, r, 'x');
                    const ay = sampleGaugeLayerValue(gaugeOverlayData, layer, grid, c, r, 'y');
                    const startU = (c + 0.5) / grid;
                    const startV = (r + 0.5) / grid;
                    const scaleSim = 0.45 / grid;
                    const endU = startU + Math.max(-1.5, Math.min(1.5, ax)) * scaleSim;
                    const endV = startV + Math.max(-1.5, Math.min(1.5, ay)) * scaleSim;
                    const p0 = simUvToScreenUv(startU, startV, zoom, panX, panY);
                    const p1 = simUvToScreenUv(endU, endV, zoom, panX, panY);
                    if (!p0.visible && !p1.visible) continue;
                    graphOverlayCtx.beginPath();
                    graphOverlayCtx.moveTo(p0.u * w, p0.v * h);
                    graphOverlayCtx.lineTo(p1.u * w, p1.v * h);
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
                    const flux = sampleGaugeLayerValue(gaugeOverlayData, layer, grid, c, r, 'x')
                        + sampleGaugeLayerValue(gaugeOverlayData, layer, grid, c + 1, r, 'y')
                        - sampleGaugeLayerValue(gaugeOverlayData, layer, grid, c, r + 1, 'x')
                        - sampleGaugeLayerValue(gaugeOverlayData, layer, grid, c, r, 'y');
                    if (Math.abs(flux) < 1e-3) continue;
                    const p = toScreen(c, r);
                    if (!p.visible) continue;
                    graphOverlayCtx.fillStyle = flux >= 0 ? 'rgba(255, 173, 58, 0.8)' : 'rgba(128, 224, 255, 0.85)';
                    graphOverlayCtx.fillText(flux >= 0 ? '+' : '−', p.x, p.y);
                }
            }
        }
    }

    if (showProbe && gaugeProbeData) {
        const probePos = toScreen(gaugeProbeData.c, gaugeProbeData.r);
        const px = probePos.visible ? probePos.x : overlayMouseNorm.x * w;
        const py = probePos.visible ? probePos.y : overlayMouseNorm.y * h;
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
