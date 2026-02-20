import { normalizeSelectedLayers } from '../../state/layerParams.js';
import { screenPxToSimCell } from '../../core/viewTransform2d.js';

export function initDrawing({ canvas, state, getSimulation, getDrawCellFromEvent, onPointerUpdate }) {
    if (!canvas) return;

    let isDrawing = false;
    let isForcing = false;
    let drawPending = false;
    const radius = 3;
    let currentMode = 'draw';

    const updatePointer = (cell, active, evt = null) => {
        if (typeof onPointerUpdate === 'function') {
            onPointerUpdate(cell, active, evt);
        }
    };

    const setForceFlag = (on) => {
        if (typeof window !== 'undefined') {
            window.__KURAMOTO_PRISMATIC_POINTER_ACTIVE__ = !!on;
        }
    };

    const resolveCell = (evt) => {
        if (typeof getDrawCellFromEvent === 'function') {
            return getDrawCellFromEvent(evt);
        }
        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;
        return screenPxToSimCell(
            x,
            y,
            state.gridSize,
            rect.width,
            rect.height,
            state.zoom,
            state.panX,
            state.panY
        );
    };

    const updateForcePointer = (evt) => {
        const mapped = resolveCell(evt);
        if (!mapped?.inside) {
            updatePointer(null, false, evt);
            return;
        }
        updatePointer(mapped, true, evt);
    };

    const applyStroke = (evt, mode) => {
        if (!evt.metaKey) {
            isDrawing = false;
            updatePointer(null, false);
            return;
        }
        if (drawPending) return;
        drawPending = true;

        const mapped = resolveCell(evt);
        if (!mapped?.inside) {
            updatePointer(null, false);
            drawPending = false;
            return;
        }
        const gx = mapped.c;
        const gy = mapped.r;
        updatePointer(mapped, true);

        const sim = getSimulation();
        if (!sim) {
            updatePointer(null, false);
            drawPending = false;
            return;
        }

        sim.readTheta().then((theta) => {
            if (!theta) {
                drawPending = false;
                return;
            }
            const TWO_PI = 6.28318530718;
            const layerSize = state.gridSize * state.gridSize;
            normalizeSelectedLayers(state, state.layerCount);
            const targets = state.selectedLayers;

            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const x = (gx + dx + state.gridSize) % state.gridSize;
                    const y = (gy + dy + state.gridSize) % state.gridSize;
                    const base = y * state.gridSize + x;
                    targets.forEach((layerIdx) => {
                        const idx = layerIdx * layerSize + base;
                        theta[idx] = mode === 'erase' ? 0 : Math.random() * TWO_PI;
                    });
                }
            }
            sim.writeTheta(theta);
        }).finally(() => {
            drawPending = false;
        });
    };

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.metaKey) {
            currentMode = e.shiftKey ? 'erase' : 'draw';
            state.drawMode = currentMode;
            isDrawing = true;
            isForcing = false;
            setForceFlag(false);
            applyStroke(e, currentMode);
            return;
        }
        const forceEnabled = !!state.interactionForceEnabled
            && state.manifoldMode === 's1'
            && state.topologyMode === 'grid';
        if (forceEnabled) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            isForcing = true;
            isDrawing = false;
            setForceFlag(true);
            updateForcePointer(e);
            return;
        }
        setForceFlag(false);
    }, { capture: true });
    window.addEventListener('mousemove', (e) => {
        if (isDrawing) {
            applyStroke(e, currentMode);
            return;
        }
        if (isForcing) {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            updateForcePointer(e);
        }
    }, { capture: true, passive: false });
    window.addEventListener('mouseup', (e) => {
        if (isForcing) {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
        }
        isDrawing = false;
        isForcing = false;
        setForceFlag(false);
        updatePointer(null, false);
    }, { capture: true, passive: false });
    canvas.addEventListener('mouseenter', (e) => {
        if (isForcing) updateForcePointer(e);
    });
    canvas.addEventListener('mouseleave', () => {
        if (!isDrawing && !isForcing) updatePointer(null, false);
        if (isForcing) {
            setForceFlag(false);
            updatePointer(null, false);
        }
    });
}
