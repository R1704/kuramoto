export function loadExternalImage(img) {
        if (!this.externalInputCanvas || !this.externalInputCtx) return;
        
        // Draw image to canvas and show preview
        this.externalInputCanvas.width = 128;
        this.externalInputCanvas.height = 128;
        this.externalInputCtx.drawImage(img, 0, 0, 128, 128);
        this.externalInputCanvas.style.display = 'block';
        
        // Notify callback with image data
        if (this.cb.onExternalInput) {
            this.cb.onExternalInput(this.externalInputCanvas);
        }
}

export function toggleWebcam() {
        if (this.videoStream) {
            // Stop webcam
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
            if (this.videoElement) this.videoElement.style.display = 'none';
            if (this.externalInputCanvas) this.externalInputCanvas.style.display = 'none';
            const webcamBtn = document.getElementById('webcam-btn');
            if (webcamBtn) webcamBtn.textContent = '📷 Use Webcam';
        } else {
            // Start webcam
            navigator.mediaDevices.getUserMedia({ video: { width: 128, height: 128 } })
                .then(stream => {
                    this.videoStream = stream;
                    if (this.videoElement) {
                        this.videoElement.srcObject = stream;
                        this.videoElement.play();
                        // Keep video element hidden - we only show the canvas preview
                        this.videoElement.style.display = 'none';
                    }
                    const webcamBtn = document.getElementById('webcam-btn');
                    if (webcamBtn) webcamBtn.textContent = '⏹️ Stop Webcam';
                    
                    // Start capturing frames
                    this.captureVideoFrame();
                })
                .catch(err => {
                    console.error('Error accessing webcam:', err);
                    alert('Could not access webcam');
                });
        }
}

export function captureVideoFrame() {
        if (!this.videoStream || !this.videoElement || !this.externalInputCanvas || !this.externalInputCtx) return;
        
        // Draw video frame to canvas
        this.externalInputCanvas.width = 128;
        this.externalInputCanvas.height = 128;
        this.externalInputCtx.drawImage(this.videoElement, 0, 0, 128, 128);
        this.externalInputCanvas.style.display = 'block';
        
        // Notify callback with image data
        if (this.cb.onExternalInput) {
            this.cb.onExternalInput(this.externalInputCanvas);
        }
        
        // Continue capturing if webcam is active
        if (this.videoStream) {
            requestAnimationFrame(() => this.captureVideoFrame());
        }
}
