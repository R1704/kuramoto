/**
 * Download Utilities Module
 *
 * Helper functions for downloading data as files.
 */

/**
 * Download data as a CSV file.
 * @param {string} csv - CSV content
 * @param {string} filename - Output filename
 */
export function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Download data as a JSON file.
 * @param {string} json - JSON content
 * @param {string} filename - Output filename
 */
export function downloadJSON(json, filename) {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Format byte size to human-readable string.
 * @param {number} n - Byte count
 * @returns {string} Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(n) {
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
