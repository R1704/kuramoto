// Snapshot encoding helpers for theta/omega arrays.

export function encodeFloat32ToBase64(f32) {
    const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);

    // Convert bytes to binary string in chunks to avoid call stack limits.
    const chunkSize = 0x8000;
    const parts = [];
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const sub = bytes.subarray(i, i + chunkSize);
        let s = '';
        for (let j = 0; j < sub.length; j++) {
            s += String.fromCharCode(sub[j]);
        }
        parts.push(s);
    }
    return btoa(parts.join(''));
}

export function decodeBase64ToFloat32(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Float32Array(bytes.buffer);
}

export function estimateBase64SizeBytes(byteLength) {
    // base64 expands by ~4/3 plus a bit of padding.
    return Math.ceil(byteLength / 3) * 4;
}
