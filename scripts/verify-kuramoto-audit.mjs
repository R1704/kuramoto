import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const computePath = path.join(root, 'src/shaders/sources/compute.js');
const htmlPath = path.join(root, 'index.html');
const readmePath = path.join(root, 'README.md');
const agentsPath = path.join(root, 'AGENTS.md');
const devServerPath = path.join(root, 'scripts/dev-server.mjs');
const compute = fs.readFileSync(computePath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const readme = fs.readFileSync(readmePath, 'utf8');
const agents = fs.readFileSync(agentsPath, 'utf8');
const devServer = fs.existsSync(devServerPath) ? fs.readFileSync(devServerPath, 'utf8') : '';

const checks = [
    {
        name: 'scaled dynamics include modifier-updated dtheta',
        pass: /let dtheta_scaled = dtheta \* \(K_scaled \/ max\(lp\.K0, 1e-6\)\);/.test(compute),
        hint: 'Expected dtheta_scaled to use dtheta after noise/RC modifiers, not stale dtheta_base.',
    },
    {
        name: 'Lenia growth evolves the matter field',
        pass: /fn rule_lenia_matter\(/.test(compute)
            && !/fn phaseDensity\(theta: f32\) -> f32/.test(compute),
        hint: 'Expected Rule 6 to apply growth to living matter (2026-06-10 audit: the phase-density proxy could not sustain organisms by construction).',
    },
    {
        name: 'Dynamics advanced panels are collapsible',
        pass: /const initCollapsiblePanels = \(\) =>/.test(html)
            && /gauge-panel/.test(html)
            && /kernel-section/.test(html)
            && /collapsed-panel/.test(html),
        hint: 'Expected index.html to collapse advanced Dynamics panels by default.',
    },
    {
        name: 'HTML provides an inline favicon',
        pass: /<link rel="icon" href="data:image\/svg\+xml,/.test(html),
        hint: 'Expected an inline favicon link to avoid a noisy favicon.ico 404 in browser verification.',
    },
    {
        name: 'local dev server disables stale module caching',
        pass: /Cache-Control/.test(devServer)
            && /no-store/.test(devServer)
            && /node scripts\/dev-server\.mjs/.test(readme)
            && /node scripts\/dev-server\.mjs/.test(agents),
        hint: 'Expected scripts/dev-server.mjs and docs to prefer the no-cache dev server for ES module work.',
    },
];

let failed = 0;
for (const check of checks) {
    if (check.pass) {
        console.log(`PASS ${check.name}`);
    } else {
        failed++;
        console.error(`FAIL ${check.name}`);
        console.error(`  ${check.hint}`);
    }
}

if (failed > 0) {
    process.exit(1);
}
