export const Mat4 = {
    perspective: (fov, aspect, near, far) => {
        const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
        return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
    },
    ortho: (left, right, bottom, top, near, far) => {
        const lr = 1 / (left - right);
        const bt = 1 / (bottom - top);
        const nf = 1 / (near - far);
        return new Float32Array([
            -2*lr, 0, 0, 0,
            0, -2*bt, 0, 0,
            0, 0, 2*nf, 0,
            (left+right)*lr, (top+bottom)*bt, (far+near)*nf, 1
        ]);
    },
    lookAt: (eye, tgt) => {
        const z = Vec3.normalize([eye[0]-tgt[0], eye[1]-tgt[1], eye[2]-tgt[2]]);
        const x = Vec3.normalize(Vec3.cross([0,1,0], z));
        const y = Vec3.cross(z, x);
        return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -Vec3.dot(x,eye),-Vec3.dot(y,eye),-Vec3.dot(z,eye),1]);
    },
    mul: (a, b) => {
        const r = new Float32Array(16);
        for (let i=0;i<4;i++) for (let j=0;j<4;j++) for (let k=0;k<4;k++) r[i*4+j]+=a[k*4+j]*b[i*4+k];
        return r;
    }
};

export const Vec3 = {
    normalize: (v) => { const l = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return l>0?[v[0]/l,v[1]/l,v[2]/l]:[0,0,0]; },
    cross: (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
    dot: (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
};

export class Camera {
    constructor(canvas) {
        this.dist = 28;
        // Rotate default 180° so drawing aligns without manual spin
        this.theta = 3.14159265359/2;
        this.phi = 1.0;
        this.tgt = [0, 0, 0];
        this.drag = false;
        this.pan = false;
        this.mx = 0;
        this.my = 0;
        this.viewMode = 0; // 0 = 3D, 1 = 2D
        
        this.setupEvents(canvas);
    }

    setupEvents(canvas) {
        canvas.onmousedown = e => {
            if (e.metaKey) {
                // Allow draw/erase without moving camera
                return;
            }
            // In 2D mode, left-click pans; in 3D mode, left-click rotates
            if (e.button === 0) {
                if (this.viewMode === 1) {
                    this.pan = true;
                } else {
                    this.drag = true;
                }
            } else if (e.button === 2) { 
                this.pan = true; 
                e.preventDefault(); 
            }
            this.mx = e.clientX; this.my = e.clientY;
        };
        canvas.onmousemove = e => {
            // If user is holding Cmd for drawing/erasing, never move camera
            if (e.metaKey) { this.drag = false; this.pan = false; return; }
            if (this.drag) {
                this.theta -= (e.clientX - this.mx) * 0.01;
                this.phi = Math.max(0.1, Math.min(3.04, this.phi + (e.clientY - this.my) * 0.01));
            } else if (this.pan) {
                const s = this.dist * 0.001;
                if (this.viewMode === 1) {
                    // 2D mode: simple XZ panning (reversed X to match intuitive drag)
                    this.tgt[0] -= (e.clientX - this.mx) * s * 2;
                    this.tgt[2] += (e.clientY - this.my) * s * 2;
                } else {
                    // 3D mode: existing panning
                    this.tgt[0] -= (e.clientX - this.mx) * s * Math.sin(this.theta);
                    this.tgt[2] += (e.clientX - this.mx) * s * Math.cos(this.theta);
                    this.tgt[1] += (e.clientY - this.my) * s;
                }
            }
            this.mx = e.clientX; this.my = e.clientY;
        };
        canvas.onmouseup = () => { this.drag = false; this.pan = false; };
        canvas.onwheel = e => {
            e.preventDefault();
            const maxDist = this.viewMode === 1 ? 300 : 1200;
            this.dist = Math.max(2, Math.min(maxDist, this.dist * (1 + e.deltaY * 0.001)));
        };
        canvas.oncontextmenu = e => e.preventDefault();
    }

    getMatrix(aspect, gridSize = 128) {
        if (this.viewMode === 1) {
            // 2D mode: orthographic top-down view
            // Geometry is in XZ plane (y≈0), so we need to look down the -Y axis
            const halfSize = gridSize * 0.25;
            // Adjust zoom to better match 3D perspective scale
            const zoom = this.dist / 124; // Increased divisor for tighter initial zoom
            const w = halfSize * zoom;
            const h = w / aspect;
            
            // Ortho projection
            const proj = Mat4.ortho(-w, w, -h, h, -100, 100);
            
            // View matrix: rotate 90° around X to look down at XZ plane from above
            // This transforms: X→X, Y→Z, Z→-Y
            const view = new Float32Array([
                1, 0, 0, 0,
                0, 0, -1, 0,
                0, 1, 0, 0,
                -this.tgt[0], -this.tgt[2], 0, 1
            ]);
            
            return Mat4.mul(proj, view);
        } else {
            // 3D mode: perspective projection
            const eye = [
                this.tgt[0] + this.dist * Math.sin(this.phi) * Math.cos(this.theta),
                this.tgt[1] + this.dist * Math.cos(this.phi),
                this.tgt[2] + this.dist * Math.sin(this.phi) * Math.sin(this.theta)
            ];
            const proj = Mat4.perspective(0.785, aspect, 0.1, 4000);
            const view = Mat4.lookAt(eye, this.tgt);
            return Mat4.mul(proj, view);
        }
    }
}
