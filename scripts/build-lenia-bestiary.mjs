// Build a filtered, app-ready Lenia bestiary from the reference animals.json.
//
// Source: https://github.com/Chakazul/Lenia (Python/animals.json), the canonical
// Lenia bestiary by Bert Chan. We keep only animals our engine can run faithfully:
// kernel core kn=1 (the exact exp bell, our kernel shape 9), growth gn=1
// (exponential = our growthMode 0), <=5 kernel rings (our ring-weight uniforms),
// and radius R<=28 (our matter-rule neighborhood cap). Everything else is dropped
// with a logged count so coverage stays honest.
//
// Usage: node scripts/build-lenia-bestiary.mjs [path-to-animals.json]
//   default source path: /tmp/animals.json (download it first), or pass a path.
// Output: src/patterns/leniaBestiary.json
//
// We store the compact RLE string (not the decoded grid) — the browser decodes it
// at spawn time, keeping the bundle ~10x smaller.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const src = process.argv[2] || '/tmp/animals.json';
const outPath = path.join(process.cwd(), 'src/patterns/leniaBestiary.json');

const MAX_R = 28;
const MAX_RINGS = 5;

function parseB(b) {
    const toks = Array.isArray(b) ? b : String(b).split(',');
    return toks.map((t) => {
        const s = String(t).trim();
        if (s.includes('/')) {
            const [n, d] = s.split('/').map(Number);
            return d ? n / d : 0;
        }
        return Number(s);
    });
}

const raw = JSON.parse(fs.readFileSync(src, 'utf8'));

let currentGroup = 'Misc';
const out = [];
const drop = { core: 0, growth: 0, rings: 0, radius: 0 };

for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const name = entry.name || '';
    // Taxonomy headers carry a name but no cells; use the "order:" level as the group.
    if (!entry.cells || !entry.params) {
        const m = /^order:\s*(.+)$/.exec(name);
        if (m) currentGroup = m[1].trim();
        continue;
    }
    const p = entry.params;
    if (p.kn !== 1) { drop.core++; continue; }
    if (p.gn !== 1) { drop.growth++; continue; }
    const b = parseB(p.b ?? '1');
    if (b.length > MAX_RINGS) { drop.rings++; continue; }
    if ((p.R ?? 0) > MAX_R || (p.R ?? 0) < 2) { drop.radius++; continue; }
    out.push({
        name,
        group: currentGroup,
        R: p.R,
        T: p.T,
        m: p.m,
        s: p.s,
        b,
        cells: entry.cells,
    });
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out));
const groups = [...new Set(out.map((a) => a.group))];
console.log(`Wrote ${out.length} animals across ${groups.length} groups to ${path.relative(process.cwd(), outPath)}`);
console.log('Dropped:', drop, `(unsupported core/growth/too-many-rings/radius>${MAX_R})`);
console.log('Groups:', groups.join(', '));
