import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || process.argv[2] || 8000);

const types = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.mjs', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.svg', 'image/svg+xml'],
    ['.ico', 'image/x-icon'],
]);

function resolvePath(urlPath) {
    const pathname = decodeURIComponent(new URL(urlPath, `http://localhost:${port}`).pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const resolved = path.resolve(root, relative);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        return null;
    }
    return resolved;
}

const server = http.createServer(async (req, res) => {
    const filePath = resolvePath(req.url || '/');
    if (!filePath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    try {
        const body = await fs.readFile(filePath);
        res.writeHead(200, {
            'Content-Type': types.get(path.extname(filePath)) || 'application/octet-stream',
            'Cache-Control': 'no-store, max-age=0',
            Pragma: 'no-cache',
            Expires: '0',
        });
        res.end(body);
    } catch (error) {
        res.writeHead(error?.code === 'ENOENT' ? 404 : 500, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store, max-age=0',
        });
        res.end(error?.code === 'ENOENT' ? 'Not found' : 'Server error');
    }
});

server.listen(port, () => {
    console.log(`Kuramoto dev server: http://localhost:${port}`);
    console.log('Serving with Cache-Control: no-store');
});
