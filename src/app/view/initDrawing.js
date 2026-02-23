import { screenPxToSimCell } from '../../core/viewTransform2d.js';

export function initDrawing({ canvas, state, getDrawCellFromEvent, onPointerUpdate }) {
    if (!canvas) return;

    let isForcing = false;

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

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.metaKey) {
            isForcing = false;
            setForceFlag(false);
            updatePointer(null, false);
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
            setForceFlag(true);
            updateForcePointer(e);
            return;
        }
        setForceFlag(false);
    }, { capture: true });
    window.addEventListener('mousemove', (e) => {
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
        isForcing = false;
        setForceFlag(false);
        updatePointer(null, false);
    }, { capture: true, passive: false });
    canvas.addEventListener('mouseenter', (e) => {
        if (isForcing) updateForcePointer(e);
    });
    canvas.addEventListener('mouseleave', () => {
        if (!isForcing) updatePointer(null, false);
        if (isForcing) {
            setForceFlag(false);
            updatePointer(null, false);
        }
    });
}
