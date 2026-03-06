export function captureCanvasThumbnail(canvas, width = 96, height = 96) {
    try {
        const thumb = document.createElement('canvas');
        thumb.width = width;
        thumb.height = height;
        const ctx = thumb.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(canvas, 0, 0, width, height);
        return thumb.toDataURL('image/png');
    } catch (e) {
        return null;
    }
}

export function renderSweepResults(root, results = []) {
    if (!root) return;
    root.innerHTML = '';
    results.forEach((row) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'sweep-row';
        const val = Number.isFinite(row.value) ? row.value : 0;
        const r = Number.isFinite(row.metrics?.R) ? row.metrics.R : 0;
        const localR = Number.isFinite(row.metrics?.localR) ? row.metrics.localR : 0;
        const chi = Number.isFinite(row.metrics?.chi) ? row.metrics.chi : 0;
        rowEl.innerHTML = `
            <img class="sweep-thumb" alt="sweep thumbnail" src="${row.thumbnail || ''}">
            <div>
                <div style="font-size:11px; color:#ddd;">${row.param} = ${val.toFixed(3)}</div>
                <div>R=${r.toFixed(3)} | localR=${localR.toFixed(3)}</div>
                <div>chi=${chi.toFixed(4)}</div>
            </div>
        `;
        root.appendChild(rowEl);
    });
}

export function setSweepUIState({ running, statusText = null, lastExport }) {
    const runBtn = document.getElementById('sweep-run-btn');
    const cancelBtn = document.getElementById('sweep-cancel-btn');
    const exportJsonBtn = document.getElementById('sweep-export-json-btn');
    const exportCsvBtn = document.getElementById('sweep-export-csv-btn');
    const statusEl = document.getElementById('sweep-status');
    if (runBtn) runBtn.disabled = !!running;
    if (cancelBtn) cancelBtn.disabled = !running;
    if (exportJsonBtn) exportJsonBtn.disabled = !!running || !lastExport;
    if (exportCsvBtn) exportCsvBtn.disabled = !!running || !lastExport;
    if (statusEl && statusText !== null) statusEl.textContent = statusText;
}

export function setCompareUIState(compareSnapshots) {
    const a = compareSnapshots?.a || null;
    const b = compareSnapshots?.b || null;
    const aThumb = document.getElementById('compare-a-thumb');
    const bThumb = document.getElementById('compare-b-thumb');
    const aMeta = document.getElementById('compare-a-meta');
    const bMeta = document.getElementById('compare-b-meta');
    const diffMeta = document.getElementById('compare-diff-meta');
    const restoreA = document.getElementById('compare-restore-a-btn');
    const restoreB = document.getElementById('compare-restore-b-btn');
    if (restoreA) restoreA.disabled = !a;
    if (restoreB) restoreB.disabled = !b;
    if (aThumb) aThumb.src = a?.thumbnail || '';
    if (bThumb) bThumb.src = b?.thumbnail || '';
    if (aMeta) {
        aMeta.textContent = a
            ? `${a.state.manifoldMode}/${a.state.topologyMode} R=${(a.metrics?.R ?? 0).toFixed(3)} χ=${(a.metrics?.chi ?? 0).toFixed(4)}`
            : 'empty';
    }
    if (bMeta) {
        bMeta.textContent = b
            ? `${b.state.manifoldMode}/${b.state.topologyMode} R=${(b.metrics?.R ?? 0).toFixed(3)} χ=${(b.metrics?.chi ?? 0).toFixed(4)}`
            : 'empty';
    }
    if (diffMeta) {
        if (a && b) {
            const dR = (b.metrics?.R ?? 0) - (a.metrics?.R ?? 0);
            const dChi = (b.metrics?.chi ?? 0) - (a.metrics?.chi ?? 0);
            diffMeta.textContent = `ΔR: ${dR.toFixed(4)} | Δχ: ${dChi.toFixed(5)}`;
        } else {
            diffMeta.textContent = 'ΔR: — | Δχ: —';
        }
    }
}
