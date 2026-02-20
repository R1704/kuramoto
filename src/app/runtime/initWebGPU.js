export async function initWebGPU({ showError, canvasId = 'canvas' }) {
    if (!navigator.gpu) {
        showError('WebGPU is not supported in your browser. Please use Chrome 113+, Edge 113+, or Safari 17+ with WebGPU enabled.');
        return null;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        showError('Failed to get WebGPU adapter. Your GPU may not be supported, or WebGPU may be disabled.');
        return null;
    }

    if (adapter.requestAdapterInfo) {
        try {
            const adapterInfo = await adapter.requestAdapterInfo();
            console.log('WebGPU Adapter:', adapterInfo.vendor, adapterInfo.architecture, adapterInfo.device);
        } catch (e) {
            console.log('Could not get adapter info:', e.message);
        }
    }
    console.log('Adapter features:', [...adapter.features]);

    let device;
    try {
        const requiredFeatures = [];
        if (adapter.features.has('float32-filterable')) {
            requiredFeatures.push('float32-filterable');
        }

        const requiredLimits = {};
        const maxStorageBuffers = adapter.limits?.maxStorageBuffersPerShaderStage;
        // Main S1 compute pipeline currently binds 10 storage buffers.
        const requiredStorageBuffers = 10;
        if (typeof maxStorageBuffers === 'number') {
            if (maxStorageBuffers < requiredStorageBuffers) {
                showError(
                    `WebGPU adapter limit too low: maxStorageBuffersPerShaderStage=${maxStorageBuffers}, `
                    + `required=${requiredStorageBuffers}.`
                );
                return null;
            }
            requiredLimits.maxStorageBuffersPerShaderStage = requiredStorageBuffers;
        }

        device = await adapter.requestDevice({
            requiredFeatures,
            requiredLimits,
        });
    } catch (e) {
        showError('Failed to get WebGPU device: ' + e.message);
        return null;
    }

    device.lost.then((info) => {
        console.error('WebGPU device lost:', info.message);
        if (info.reason !== 'destroyed') {
            showError('WebGPU device was lost: ' + info.message + '. Please refresh the page.');
        }
    });

    const canvas = document.getElementById(canvasId);
    const context = canvas?.getContext('webgpu');
    if (!context) {
        showError('Failed to get WebGPU context from canvas.');
        return null;
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });

    return { adapter, device, canvas, context, format };
}
