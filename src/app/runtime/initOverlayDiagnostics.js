import { screenUvToSimUv } from '../../core/viewTransform2d.js';
import { canUseGaugeOverlay } from '../../utils/gaugeSupport.js';

function wrapPhase(v) {
    let x = v;
    const PI = Math.PI;
    const TWO_PI = Math.PI * 2;
    while (x <= -PI) x += TWO_PI;
    while (x > PI) x -= TWO_PI;
    return x;
}

export function initOverlayDiagnostics({ STATE, sim, runtime, getActiveLayerIndex }) {
    const sampleGauge = (gaugeData, layer, c, r, axis) => {
        if (!gaugeData) return 0;
        const src = axis === 'x' ? gaugeData.ax : gaugeData.ay;
        if (!src) return 0;
        const grid = sim.gridSize;
        const cw = ((c % grid) + grid) % grid;
        const rw = ((r % grid) + grid) % grid;
        const stride = Math.max(1, Math.floor(gaugeData.stride || 1));
        if ((gaugeData.sampleGrid || 0) > 0 && gaugeData.layer === layer) {
            const sampleGrid = gaugeData.sampleGrid;
            const sc = Math.min(sampleGrid - 1, Math.floor(cw / stride));
            const sr = Math.min(sampleGrid - 1, Math.floor(rw / stride));
            return src[sr * sampleGrid + sc] ?? 0;
        }
        const layerSize = grid * grid;
        return src[layer * layerSize + rw * grid + cw] ?? 0;
    };

    const getProbeCellFromMouse = () => {
        const mapped = screenUvToSimUv(runtime.overlayMouseNorm.x, runtime.overlayMouseNorm.y, STATE.zoom, STATE.panX, STATE.panY);
        if (!mapped.inside) return null;
        const grid = sim.gridSize;
        const c = Math.min(grid - 1, Math.max(0, Math.floor(mapped.u * grid)));
        const r = Math.min(grid - 1, Math.max(0, Math.floor(mapped.v * grid)));
        return { c, r };
    };

    const buildProbeData = (thetaNeighborhood, gaugeData, c, r, layer) => {
        if (!thetaNeighborhood || !gaugeData?.ax || !gaugeData?.ay) return null;
        const theta = thetaNeighborhood.center;
        const right = thetaNeighborhood.right;
        const up = thetaNeighborhood.up;
        const q = STATE.gaugeCharge ?? 1.0;
        const ax = sampleGauge(gaugeData, layer, c, r, 'x');
        const ay = sampleGauge(gaugeData, layer, c, r, 'y');
        const ayRight = sampleGauge(gaugeData, layer, c + 1, r, 'y');
        const axUp = sampleGauge(gaugeData, layer, c, r + 1, 'x');
        const covDx = wrapPhase(right - theta - q * ax);
        const covDy = wrapPhase(up - theta - q * ay);
        const flux = wrapPhase(ax + ayRight - axUp - ay);
        const cov = Math.sqrt(covDx * covDx + covDy * covDy);
        return { c, r, layer, theta, ax, ay, covDx, covDy, cov, flux };
    };

    const updateOverlayDiagnostics = () => {
        const wantsProbe = STATE.overlayProbeEnabled && runtime.overlayMouseNorm.inside;
        const overlayMode = canUseGaugeOverlay(STATE)
            && (STATE.overlayGaugeLinks || STATE.overlayPlaquetteSign || wantsProbe);

        if (!overlayMode) {
            if (runtime.gaugeProbeData || runtime.gaugeOverlayData) {
                runtime.gaugeProbeData = null;
                runtime.gaugeOverlayData = null;
                runtime.overlayDirty = true;
            }
            return;
        }

        const now = performance.now();
        const readbackBusy = runtime.rcReadPending || runtime.phaseSpacePending || sim.readbackPending;
        if (!runtime.gaugeOverlayReadPending && !runtime.probeReadPending && !readbackBusy && (now - runtime.lastGaugeOverlayReadMs) >= 180) {
            runtime.gaugeOverlayReadPending = true;
            const layer = getActiveLayerIndex();
            const stride = STATE.gridSize >= 768 ? 8 : (STATE.gridSize >= 512 ? 6 : (STATE.gridSize >= 256 ? 4 : 2));
            const t0 = performance.now();
            sim.readGaugeFieldDecimated(layer, stride).then((gaugeData) => {
                if (gaugeData?.ax && gaugeData?.ay) {
                    runtime.gaugeOverlayData = gaugeData;
                    runtime.lastGaugeOverlayReadMs = performance.now();
                    runtime.lastGaugeOverlayDurationMs = performance.now() - t0;
                    runtime.overlayDirty = true;
                }
            }).finally(() => {
                runtime.gaugeOverlayReadPending = false;
            });
            return;
        }

        if (!STATE.overlayProbeEnabled || !runtime.overlayMouseNorm.inside) {
            runtime.gaugeProbeData = null;
            return;
        }

        if (!runtime.gaugeOverlayData || runtime.gaugeOverlayReadPending || runtime.probeReadPending || readbackBusy) {
            return;
        }
        if ((now - runtime.lastProbeReadMs) < 220) return;
        const probeCell = getProbeCellFromMouse();
        if (!probeCell) {
            runtime.gaugeProbeData = null;
            return;
        }
        runtime.probeReadPending = true;
        const layer = getActiveLayerIndex();
        const t0 = performance.now();
        sim.readThetaNeighborhood(layer, probeCell.c, probeCell.r, 1).then((thetaNeighborhood) => {
            runtime.lastProbeReadMs = performance.now();
            runtime.lastProbeDurationMs = performance.now() - t0;
            runtime.gaugeProbeData = buildProbeData(thetaNeighborhood, runtime.gaugeOverlayData, probeCell.c, probeCell.r, layer);
            runtime.overlayDirty = true;
        }).finally(() => {
            runtime.probeReadPending = false;
        });
    };

    const updatePerfStatus = () => {
        const el = document.getElementById('discovery-perf-status');
        if (!el) return;
        const frameMs = runtime.frameDurationMs || 0;
        const statsMs = runtime.lastReadbackDurationMs || 0;
        const gaugeMs = runtime.lastGaugeOverlayDurationMs || 0;
        const probeMs = runtime.lastProbeDurationMs || 0;
        el.textContent = `frame:${frameMs.toFixed(1)}ms | stats:${statsMs.toFixed(1)}ms | gauge:${gaugeMs.toFixed(1)}ms | probe:${probeMs.toFixed(1)}ms`;
    };

    const overlayTimer = setInterval(updateOverlayDiagnostics, 120);
    const perfTimer = setInterval(updatePerfStatus, 350);

    return {
        dispose: () => {
            clearInterval(overlayTimer);
            clearInterval(perfTimer);
        }
    };
}
