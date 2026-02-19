/**
 * Shared 2D view transforms.
 *
 * These helpers must stay consistent with the 2D shader mapping:
 * simUv = (screenUv - 0.5) / zoom + pan + 0.5
 */

function safeZoom(zoom) {
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1.0;
}

export function screenUvToSimUv(screenU, screenV, zoom, panX, panY) {
    const z = safeZoom(zoom);
    const u = (screenU - 0.5) / z + (panX || 0.0) + 0.5;
    const v = (screenV - 0.5) / z + (panY || 0.0) + 0.5;
    return { u, v, inside: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
}

export function simUvToScreenUv(simU, simV, zoom, panX, panY) {
    const z = safeZoom(zoom);
    const u = (simU - (panX || 0.0) - 0.5) * z + 0.5;
    const v = (simV - (panY || 0.0) - 0.5) * z + 0.5;
    return { u, v, visible: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
}

export function simCellToScreenPx(c, r, grid, width, height, zoom, panX, panY) {
    if (!Number.isFinite(grid) || grid <= 0 || width <= 0 || height <= 0) {
        return { x: 0, y: 0, visible: false };
    }
    const simU = (c + 0.5) / grid;
    const simV = (r + 0.5) / grid;
    const mapped = simUvToScreenUv(simU, simV, zoom, panX, panY);
    return {
        x: mapped.u * width,
        y: mapped.v * height,
        visible: mapped.visible,
    };
}

export function screenPxToSimCell(x, y, grid, width, height, zoom, panX, panY) {
    if (!Number.isFinite(grid) || grid <= 0 || width <= 0 || height <= 0) {
        return { c: 0, r: 0, inside: false, simU: 0, simV: 0 };
    }
    const screenU = x / width;
    const screenV = y / height;
    const mapped = screenUvToSimUv(screenU, screenV, zoom, panX, panY);
    if (!mapped.inside) {
        return { c: 0, r: 0, inside: false, simU: mapped.u, simV: mapped.v };
    }
    const c = Math.min(grid - 1, Math.max(0, Math.floor(mapped.u * grid)));
    const r = Math.min(grid - 1, Math.max(0, Math.floor(mapped.v * grid)));
    return { c, r, inside: true, simU: mapped.u, simV: mapped.v };
}
