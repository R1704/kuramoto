import { screenPxToScreenUvGpu } from '../../core/viewTransform2d.js';

export function initEventWiring({
    canvas,
    context,
    device,
    format,
    renderer,
    graphOverlay,
    rcOverlay,
    organismOverlay,
    runtime,
}) {
    const resizeCanvasesToDisplay = () => {
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const displayW = rect.width || canvas.clientWidth || canvas.width;
        const displayH = rect.height || canvas.clientHeight || canvas.height;
        const w = Math.max(1, Math.round(displayW * dpr));
        const h = Math.max(1, Math.round(displayH * dpr));

        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            context.configure({ device, format, alphaMode: 'opaque' });
            renderer.resize(w, h);
            runtime.overlayDirty = true;
        }

        if (graphOverlay) {
            if (graphOverlay.width !== w || graphOverlay.height !== h) {
                graphOverlay.width = w;
                graphOverlay.height = h;
            }
        }

        if (rcOverlay) {
            if (rcOverlay.width !== w || rcOverlay.height !== h) {
                rcOverlay.width = w;
                rcOverlay.height = h;
            }
        }

        if (organismOverlay) {
            if (organismOverlay.width !== w || organismOverlay.height !== h) {
                organismOverlay.width = w;
                organismOverlay.height = h;
            }
        }
    };

    const updateOverlayMouse = (evt, inside = true) => {
        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;
        const uv = screenPxToScreenUvGpu(x, y, rect.width, rect.height);
        runtime.overlayMouseNorm.x = Math.min(1, Math.max(0, uv.u));
        runtime.overlayMouseNorm.y = Math.min(1, Math.max(0, uv.v));
        runtime.overlayMouseNorm.inside = inside;
        runtime.overlayDirty = true;
    };

    resizeCanvasesToDisplay();
    window.addEventListener('resize', resizeCanvasesToDisplay, { passive: true });
    if (canvas && 'ResizeObserver' in window) {
        const ro = new ResizeObserver(() => resizeCanvasesToDisplay());
        ro.observe(canvas);
    }
    canvas.addEventListener('mousemove', (evt) => updateOverlayMouse(evt, true), { passive: true });
    canvas.addEventListener('mouseleave', () => {
        runtime.overlayMouseNorm.inside = false;
        runtime.overlayDirty = true;
    }, { passive: true });

    return {
        resizeCanvasesToDisplay,
    };
}
