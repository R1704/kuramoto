function normalize3(v) {
    const len = Math.hypot(v[0], v[1], v[2]);
    if (!Number.isFinite(len) || len <= 1e-9) return [0, 0, 0];
    return [v[0] / len, v[1] / len, v[2] / len];
}

function cross3(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}

function addScaled3(a, b, s) {
    return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}

function getCameraEye(camera) {
    const tgt = camera?.tgt || [0, 0, 0];
    const dist = camera?.dist ?? 28;
    const theta = camera?.theta ?? (Math.PI * 0.5);
    const phi = camera?.phi ?? 1.0;
    return [
        tgt[0] + dist * Math.sin(phi) * Math.cos(theta),
        tgt[1] + dist * Math.cos(phi),
        tgt[2] + dist * Math.sin(phi) * Math.sin(theta)
    ];
}

export function screenPxToWorldRay(screenX, screenY, width, height, camera) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    const ndcX = (screenX / width) * 2.0 - 1.0;
    const ndcY = 1.0 - (screenY / height) * 2.0;
    const aspect = width / height;
    const fov = 0.785;
    const tanHalfFov = Math.tan(fov * 0.5);

    const origin = getCameraEye(camera);
    const target = camera?.tgt || [0, 0, 0];
    const forward = normalize3([target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]]);

    let right = normalize3(cross3(forward, [0, 1, 0]));
    if (Math.hypot(right[0], right[1], right[2]) < 1e-6) {
        right = [1, 0, 0];
    }
    const up = normalize3(cross3(right, forward));

    let dir = addScaled3(forward, right, ndcX * aspect * tanHalfFov);
    dir = addScaled3(dir, up, ndcY * tanHalfFov);
    dir = normalize3(dir);
    return { origin, dir };
}

export function intersectRayPlane(rayOrigin, rayDir, planeY) {
    const dy = rayDir?.[1] ?? 0;
    if (Math.abs(dy) < 1e-6) return null;
    const t = (planeY - (rayOrigin?.[1] ?? 0)) / dy;
    if (!Number.isFinite(t) || t < 0) return null;
    return [
        rayOrigin[0] + rayDir[0] * t,
        rayOrigin[1] + rayDir[1] * t,
        rayOrigin[2] + rayDir[2] * t
    ];
}

export function worldXZToSimCell(worldX, worldZ, grid) {
    if (!Number.isFinite(grid) || grid <= 0) {
        return { c: 0, r: 0, inside: false, simU: 0, simV: 0 };
    }
    // Shader uses x = gx * 0.5 - cols * 0.25 and z = gy * 0.5 - rows * 0.25.
    // Invert that mapping so picking is world-locked to the rendered grid.
    const gx = worldX * 2.0 + grid * 0.5;
    const gy = worldZ * 2.0 + grid * 0.5;
    const simU = gx / grid;
    const simV = gy / grid;
    if (!Number.isFinite(simU) || !Number.isFinite(simV) || simU < 0 || simU > 1 || simV < 0 || simV > 1) {
        return { c: 0, r: 0, inside: false, simU, simV };
    }
    const c = Math.min(grid - 1, Math.max(0, Math.floor(gx)));
    const r = Math.min(grid - 1, Math.max(0, Math.floor(gy)));
    return { c, r, inside: true, simU, simV };
}

export function projectScreenToSimCell3D(screenX, screenY, width, height, camera, grid, planeY) {
    const ray = screenPxToWorldRay(screenX, screenY, width, height, camera);
    if (!ray) return { c: 0, r: 0, inside: false, simU: 0, simV: 0 };
    const hit = intersectRayPlane(ray.origin, ray.dir, planeY);
    if (!hit) return { c: 0, r: 0, inside: false, simU: 0, simV: 0 };
    return worldXZToSimCell(hit[0], hit[2], grid);
}
