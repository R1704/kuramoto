import { normalizeSelectedLayers } from '../../state/layerParams.js';
import { screenUvToSimUv } from '../../core/viewTransform2d.js';

export function initDrawing({ canvas, state, getSimulation }) {
    if (!canvas) return;

    let isDrawing = false;
    let drawPending = false;
    const radius = 3;
    let currentMode = 'draw';

    const applyStroke = (evt, mode) => {
        if (!evt.metaKey) {
            isDrawing = false;
            return;
        }
        if (drawPending) return;
        drawPending = true;

        const rect = canvas.getBoundingClientRect();
        const nx = (evt.clientX - rect.left) / rect.width;
        const ny = (evt.clientY - rect.top) / rect.height;
        const mapped = screenUvToSimUv(nx, ny, state.zoom, state.panX, state.panY);
        if (!mapped.inside) {
            drawPending = false;
            return;
        }
        const gx = Math.floor(mapped.u * state.gridSize);
        const gy = Math.floor(mapped.v * state.gridSize);

        const sim = getSimulation();
        if (!sim) {
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
        if (!e.metaKey) return;
        currentMode = e.shiftKey ? 'erase' : 'draw';
        state.drawMode = currentMode;
        isDrawing = true;
        applyStroke(e, currentMode);
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        applyStroke(e, currentMode);
    });
    window.addEventListener('mouseup', () => {
        isDrawing = false;
    });
}
