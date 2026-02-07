/**
 * Error Display Module
 *
 * Display error messages in the canvas container.
 */

/**
 * Show error message in the canvas area.
 * @param {string} message - Error message to display
 */
export function showError(message) {
    const container = document.getElementById('canvas-container');
    if (container) {
        // Detect Safari
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const safariNote = isSafari ? `
            <p style="margin-top: 15px; color: #ffaa00; font-size: 13px;">
                <strong>Safari Users:</strong><br>
                1. Open Safari → Settings → Advanced<br>
                2. Check "Show features for web developers"<br>
                3. Then: Develop → Feature Flags → Enable "WebGPU"<br>
                4. Restart Safari
            </p>
        ` : '';
        
        container.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: #ff6b6b;
                background: #1a1a2e;
                padding: 40px;
                text-align: center;
                font-family: system-ui, sans-serif;
            ">
                <h2 style="margin-bottom: 20px;">⚠️ WebGPU Error</h2>
                <p style="max-width: 500px; line-height: 1.6;">${message}</p>
                ${safariNote}
                <p style="margin-top: 20px; color: #888; font-size: 14px;">
                    WebGPU requires:<br>
                    • Chrome 113+ / Edge 113+ (Windows, macOS, ChromeOS)<br>
                    • Safari 17+ (macOS Sonoma / iOS 17) with WebGPU enabled<br>
                    • Firefox Nightly with dom.webgpu.enabled
                </p>
            </div>
        `;
    }
    console.error('WebGPU Error:', message);
}
