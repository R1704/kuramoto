// Behavioral checks for computeNcaViability (standing fault #5 re-target).
// The metric must rank: multi-domain organisms > single uniform-sync blob,
// and floor extinct/overgrown states — the OPPOSITE of the old metric, which
// rewarded the trivial globally synchronized blob.
import { computeNcaViability, computeOrganismPhaseStats } from '../src/experiments/experiments.js';

const GRID = 256;

const scenarios = {
    multiDomain: computeNcaViability({
        ruleMode: 7,
        gridSize: GRID,
        matterMean: 0.2,
        matterMass: 0.2 * GRID * GRID,
        livingCoherenceMean: 0.85,
        globalR: 0.2,
        globalRStd: 0.03,
        organismCount: 12,
        largestOrganismArea: 600,
        meanTrackPersistence: 15,
        phaseDiversity: 0.8,
    }),
    uniformSyncBlob: computeNcaViability({
        ruleMode: 7,
        gridSize: GRID,
        matterMean: 0.2,
        matterMass: 0.2 * GRID * GRID,
        livingCoherenceMean: 0.95,
        globalR: 0.95,
        globalRStd: 0.0005,
        organismCount: 1,
        largestOrganismArea: 0.2 * GRID * GRID,
        meanTrackPersistence: 50,
        phaseDiversity: 0.02,
    }),
    spotLatticeSharedPhase: computeNcaViability({
        // Many organisms but all phase-locked to one global phase: structure is
        // fine, but the phase term must not reward it like distinct domains.
        ruleMode: 7,
        gridSize: GRID,
        matterMean: 0.25,
        matterMass: 0.25 * GRID * GRID,
        livingCoherenceMean: 0.9,
        globalR: 0.85,
        globalRStd: 0.001,
        organismCount: 400,
        largestOrganismArea: 60,
        meanTrackPersistence: 30,
        phaseDiversity: 0.03,
    }),
    extinct: computeNcaViability({
        ruleMode: 7,
        gridSize: GRID,
        matterMean: 0.0001,
        livingCoherenceMean: 0,
        organismCount: 0,
        largestOrganismArea: 0,
        meanTrackPersistence: 0,
    }),
    overgrown: computeNcaViability({
        ruleMode: 7,
        gridSize: GRID,
        matterMean: 0.7,
        livingCoherenceMean: 0.9,
        organismCount: 1,
        largestOrganismArea: 0.9 * GRID * GRID,
        meanTrackPersistence: 40,
        phaseDiversity: 0.01,
    }),
    sweepSnapshotNoTemporalData: computeNcaViability({
        // Sweep call site: no persistence, no temporal std — must still rank sanely.
        ruleMode: 7,
        gridSize: GRID,
        matterMean: 0.22,
        matterMass: 0.22 * GRID * GRID,
        livingCoherenceMean: 0.85,
        globalR: 0.3,
        organismCount: 50,
        largestOrganismArea: 80,
        meanTrackPersistence: null,
        phaseDiversity: 0.6,
    }),
};

// Within-regime ranking: the real 2026-06-12 binding-experiment endpoints.
// Pure Lenia merged to fewer/larger organisms with lower phase diversity than
// binding-only; both are healthy multi_domain states, and the score must still
// rank them (the first metric revision saturated both at exactly 1.0).
const bindingOnly = computeNcaViability({
    ruleMode: 7, gridSize: 256,
    matterMean: 0.2615, matterMass: 0.2615 * 256 * 256,
    livingCoherenceMean: 0.923, globalR: null,
    organismCount: 566, largestOrganismArea: 60,
    meanTrackPersistence: null, phaseDiversity: 0.901,
});
const pureLenia = computeNcaViability({
    ruleMode: 7, gridSize: 256,
    matterMean: 0.2754, matterMass: 0.2754 * 256 * 256,
    livingCoherenceMean: 0.925, globalR: null,
    organismCount: 317, largestOrganismArea: 120,
    meanTrackPersistence: null, phaseDiversity: 0.819,
});

const phaseStatsTwoDomains = computeOrganismPhaseStats([
    { area: 100, meanPhase: 0, phaseR: 0.95 },
    { area: 100, meanPhase: Math.PI, phaseR: 0.95 },
]);
const phaseStatsOneDomain = computeOrganismPhaseStats([
    { area: 100, meanPhase: 0.5, phaseR: 0.95 },
    { area: 100, meanPhase: 0.5, phaseR: 0.95 },
]);

const checks = [
    ['multi-domain outranks uniform sync blob',
        scenarios.multiDomain.score > 2 * scenarios.uniformSyncBlob.score],
    ['multi-domain outranks phase-locked spot lattice',
        scenarios.multiDomain.score > scenarios.spotLatticeSharedPhase.score],
    ['multi-domain regime label', scenarios.multiDomain.regime === 'multi_domain'],
    ['uniform sync regime label', scenarios.uniformSyncBlob.regime === 'uniform_sync'],
    ['phase-locked lattice flagged as uniform sync', scenarios.spotLatticeSharedPhase.regime === 'uniform_sync'],
    ['extinct floors', scenarios.extinct.regime === 'extinct' && scenarios.extinct.score < 0.1],
    ['overgrown labeled', scenarios.overgrown.regime === 'overgrown'],
    ['snapshot without temporal data still scores high for diverse structure',
        scenarios.sweepSnapshotNoTemporalData.score > 0.6],
    ['anti-phase organism pair has near-max diversity', phaseStatsTwoDomains.phaseDiversity > 0.95],
    ['same-phase organism pair has near-zero diversity', phaseStatsOneDomain.phaseDiversity < 0.05],
    ['score ranks WITHIN healthy regimes (no saturation ties)',
        bindingOnly.score > pureLenia.score && bindingOnly.score < 1 && pureLenia.score > 0.5],
];

let failed = 0;
for (const [name, pass] of checks) {
    if (pass) {
        console.log(`PASS ${name}`);
    } else {
        failed++;
        console.error(`FAIL ${name}`);
    }
}
console.log('\nScores:', Object.fromEntries(Object.entries(scenarios).map(([k, v]) => [k, `${v.score.toFixed(3)} (${v.regime})`])));
if (failed > 0) process.exit(1);
