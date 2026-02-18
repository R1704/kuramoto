import { renderSparkline } from '../../utils/index.js';

function renderLocalHistogram(canvas, bins) {
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const maxVal = Math.max(...bins, 1e-6);
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, width, height);
    const barWidth = width / bins.length;
    for (let i = 0; i < bins.length; i++) {
        const barHeight = (bins[i] / maxVal) * (height - 6);
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(i * barWidth + 1, height - barHeight - 2, barWidth - 2, barHeight);
    }
    ctx.strokeStyle = '#333';
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    ctx.fillStyle = '#777';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('0', 8, height - 2);
    ctx.fillText('1', width - 8, height - 2);
}

export function createStatsViewUpdater({ state, sparkline }) {
    let fps = 0;
    let frameCount = 0;
    let lastTime = performance.now();
    let plotUpdateCounter = 0;

    return function updateStatsView({ sim, stats, R_plot, chi_plot, phaseDiagramPlot }) {
        frameCount++;
        const now = performance.now();
        if (now - lastTime > 1000) {
            fps = Math.round(frameCount * 1000 / (now - lastTime));
            const fpsEl = document.getElementById('fps');
            const countEl = document.getElementById('count');
            const gridEl = document.getElementById('grid');
            if (fpsEl) fpsEl.textContent = fps;
            if (countEl) countEl.textContent = sim.N.toLocaleString();
            if (gridEl) gridEl.textContent = `${sim.gridSize}×${sim.gridSize}`;
            frameCount = 0;
            lastTime = now;
        }

        plotUpdateCounter++;
        if (plotUpdateCounter < 3 || !stats) {
            return;
        }
        plotUpdateCounter = 0;

        const R_el = document.getElementById('stat-R');
        const globalR_el = document.getElementById('stat-globalR');
        const chi_el = document.getElementById('stat-chi');
        const Kc_el = document.getElementById('stat-Kc');

        if (R_el) R_el.textContent = stats.localR.toFixed(3);
        if (globalR_el) globalR_el.textContent = stats.R.toFixed(3);

        if (chi_el) {
            const chi = stats.chi;
            if (chi < 0.001) {
                chi_el.textContent = chi.toExponential(1);
            } else if (chi < 1) {
                chi_el.textContent = chi.toFixed(4);
            } else {
                chi_el.textContent = chi.toFixed(2);
            }
        }

        if (Kc_el && stats.estimatedKc !== null) {
            Kc_el.textContent = stats.estimatedKc.toFixed(2);
        }

        const R_bar = document.getElementById('stat-R-bar');
        if (R_bar) {
            const r = Math.min(1, Math.max(0, stats.localR));
            R_bar.style.width = `${r * 100}%`;
        }

        if (R_plot && R_plot.canvas) {
            R_plot.render(stats.getRecentR(300, true));
        }

        if (chi_plot && chi_plot.canvas) {
            chi_plot.render(stats.getRecentChi(300));
        }

        const nowMs = performance.now();
        if (!state.sparklinePaused && sparkline.rCanvas && sparkline.chiCanvas && sparkline.rCtx && sparkline.chiCtx && sparkline.rBuf && sparkline.chiBuf) {
            if (nowMs - sparkline.lastDrawMs >= sparkline.minMs) {
                sparkline.lastDrawMs = nowMs;
                if (sparkline.statusEl) {
                    sparkline.statusEl.textContent = state.showStatistics ? '' : 'compute off';
                }
                if (state.showStatistics) {
                    stats.fillRecentR(sparkline.rBuf, true);
                    stats.fillRecentChi(sparkline.chiBuf);
                } else {
                    sparkline.rBuf.fill(0);
                    sparkline.chiBuf.fill(0);
                }

                renderSparkline(sparkline.rCanvas, sparkline.rCtx, sparkline.rBuf, { yMin: 0, yMax: 1, color: '#4CAF50' });

                let maxChi = 0;
                for (let i = 0; i < sparkline.chiBuf.length; i++) {
                    maxChi = Math.max(maxChi, sparkline.chiBuf[i]);
                }
                const chiMax = Math.max(1e-6, maxChi);
                renderSparkline(sparkline.chiCanvas, sparkline.chiCtx, sparkline.chiBuf, { yMin: 0, yMax: chiMax, color: '#FF9800' });
            }
        }

        const chiStdEl = document.getElementById('stat-chi-std');
        if (chiStdEl) {
            const std = stats.N > 0 ? Math.sqrt(Math.max(0, stats.chi) / stats.N) : 0;
            chiStdEl.textContent = std < 1 ? std.toFixed(4) : std.toFixed(3);
        }

        const chiFill = document.getElementById('stat-chi-fill');
        const chiMarker = document.getElementById('stat-chi-marker');
        const chiMinEl = document.getElementById('stat-chi-scale-min');
        const chiMaxEl = document.getElementById('stat-chi-scale-max');
        if (chi_plot && (chiFill || chiMarker || chiMinEl || chiMaxEl)) {
            const yMin = Number.isFinite(chi_plot.lastYMin) ? chi_plot.lastYMin : 0;
            const yMax = Number.isFinite(chi_plot.lastYMax) ? chi_plot.lastYMax : Math.max(1, stats.chi);
            const denom = Math.max(1e-8, yMax - yMin);
            const frac = Math.min(1, Math.max(0, (stats.chi - yMin) / denom));
            const pct = frac * 100;
            if (chiFill) chiFill.style.width = `${pct}%`;
            if (chiMarker) chiMarker.style.left = `${pct}%`;
            if (chiMinEl) chiMinEl.textContent = yMin.toFixed(yMin < 1 ? 3 : 1);
            if (chiMaxEl) chiMaxEl.textContent = yMax.toFixed(yMax < 1 ? 3 : 1);
        }

        const histCanvas = document.getElementById('local-hist');
        if (histCanvas && stats.localHist) {
            renderLocalHistogram(histCanvas, stats.localHist);
        }

        if (phaseDiagramPlot && phaseDiagramPlot.canvas && stats.phaseDiagramData.length > 0) {
            phaseDiagramPlot.setCurrentK(sim.lastGlobalOrder ? state.K0 : state.K0);
            phaseDiagramPlot.render(stats.phaseDiagramData, stats.estimatedKc);
        }
    };
}
