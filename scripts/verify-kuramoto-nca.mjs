import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const compute = read('src/shaders/sources/compute.js');
const render = read('src/shaders/sources/render.js');
const buffers = read('src/simulation/buffers.js');
const pipelines = read('src/simulation/pipelines.js');
const readback = read('src/simulation/readback.js');
const simulation = read('src/simulation/Simulation.js');
const defaults = read('src/app/defaultState.js');
const html = read('index.html');
const controls = read('src/ui/bindings/controls.js');
const display = read('src/ui/view/updateDisplay.js');
const uiManager = read('src/ui/UIManager.js');
const manifolds = read('src/manifolds/ManifoldRegistry.js');
const presets = read('src/patterns/presets.js');
const patterns = read('src/patterns/patterns.js');
const bootstrap = read('src/app/bootstrap.js');
const experiments = read('src/experiments/experiments.js');
const ncaProbe = read('src/analysis/kuramotoNcaProbe.js');
const analysisController = read('src/app/controllers/analysisController.js');
const discoveryUi = read('src/app/runtime/discoveryUi.js');
const detector = read('src/organisms/StructureDetector.js');
const frameLoop = read('src/app/render/frameLoop.js');
const roadmap = read('ROADMAP.md');
const docs = read('DOCUMENTATION.md');

const checks = [
    {
        name: 'Rule 7 dispatches KuramotoNCA',
        pass: /fn rule_kuramoto_nca\(/.test(compute)
            && /else if \(mode == 7\)/.test(compute)
            && /rule_kuramoto_nca\(i32\(global_c\)/.test(compute),
        hint: 'Expected WGSL Rule 7 to call rule_kuramoto_nca.',
    },
    {
        name: 'KuramotoNCA uniforms exist (collapsed set)',
        pass: /nca_phase_k: f32/.test(compute)
            && /nca_growth_k: f32/.test(compute)
            && /nca_matter_decay: f32/.test(compute)
            && /nca_coherence_min: f32/.test(compute)
            && /nca_coherence_max: f32/.test(compute)
            && !/nca_sync_feedback/.test(compute)
            && !/nca_hidden_memory/.test(compute),
        hint: 'Expected the collapsed KuramotoNCA parameter set (sync_feedback and hidden_memory removed).',
    },
    {
        name: 'matter textures are bound in compute pipeline',
        pass: /MATTER_IN/.test(pipelines)
            && /MATTER_OUT/.test(pipelines)
            && /matterTextures\[currentMatterIdx\]/.test(pipelines)
            && /matterTextures\[nextMatterIdx\]/.test(pipelines),
        hint: 'Expected S1 bind group to provide matter ping-pong textures.',
    },
    {
        name: 'hidden morphogen plumbing is fully removed (fault #4)',
        pass: !/HIDDEN_IN/.test(pipelines)
            && !/hiddenTextures/.test(pipelines)
            && !/hiddenTextures/.test(buffers)
            && !/loadHiddenGlobal/.test(compute)
            && !/hidden_in/.test(compute)
            && !/hidden_out/.test(compute)
            && !/currentHiddenIdx/.test(simulation),
        hint: 'Expected the hidden EMA texture ping-pong, bindings, and loads to be gone everywhere.',
    },
    {
        name: 'simulation exposes matter read and write APIs',
        pass: /writeMatter/.test(simulation)
            && /readMatterField/.test(simulation)
            && /export function writeMatter/.test(buffers)
            && /export async function readMatterField/.test(readback),
        hint: 'Expected Simulation.writeMatter() and Simulation.readMatterField().',
    },
    {
        name: 'Rule 7 writes living coherence to order buffer',
        pass: /order\[i\] = nca\.matter_next \* nca\.local_r/.test(compute),
        hint: 'Expected order_i to encode matter-weighted local coherence for organism detection.',
    },
    {
        name: 'render shader supports matter data layer',
        pass: /@group\(0\) @binding\(12\) var matter_tex/.test(render)
            && /loadMatterRender/.test(render)
            && /layer_choice == 10/.test(render),
        hint: 'Expected render binding and colormap mode for matter.',
    },
    {
        name: 'state defaults and UI expose KuramotoNCA controls',
        pass: /ncaPhaseK: 1\.0/.test(defaults)
            && /ncaGrowthK: 0\.35/.test(defaults)
            && /ncaMatterDecay: 0\.01/.test(defaults)
            && /ncaCoherenceMin: 0\.18/.test(defaults)
            && /ncaCoherenceMax: 0\.65/.test(defaults)
            && /nca-phase-k-slider/.test(html)
            && /nca-growth-k-slider/.test(controls)
            && /nca-coherence-min-slider/.test(html)
            && /nca-coherence-max-slider/.test(controls)
            && /nca-controls/.test(display),
        hint: 'Expected defaults, HTML controls, bindings, and display update support.',
    },
    {
        name: 'UI names Rule 6 and Rule 7 correctly',
        pass: /Lenia: G\(K\*rho\)/.test(uiManager)
            && /KuramotoNCA/.test(uiManager)
            && /value="7">(7: )?KuramotoNCA/.test(html),
        hint: 'Expected Rule 6 density wording and Rule 7 labels.',
    },
    {
        name: 'KuramotoNCA preset seeds matter',
        pass: /kuramoto_nca_orbium/.test(presets)
            && /kuramoto_nca_mitosis/.test(presets)
            && /kuramoto_nca_filament/.test(presets)
            && /kuramoto_nca_droplets/.test(presets)
            && /sim\.writeMatter/.test(presets)
            && /data-preset="kuramoto_nca_mitosis"/.test(html)
            && /data-preset="kuramoto_nca_filament"/.test(html)
            && /data-preset="kuramoto_nca_droplets"/.test(html),
        hint: 'Expected KuramotoNCA presets to seed matter and appear in the UI.',
    },
    {
        name: 'KuramotoNCA growth separates excitation and inhibition',
        pass: /matter_exc/.test(compute)
            && /matter_inh/.test(compute)
            && /pos_total/.test(compute)
            && /neg_total/.test(compute)
            && /lp\.beta \* inh_density/.test(compute),
        hint: 'Expected Rule 7 growth to expose a legible excitation-inhibition matter signal.',
    },
    {
        name: 'KuramotoNCA matter update is collapsed to growth + structural decay (fault #3)',
        pass: /let birth = coherence_gate \* coherence_gate \* growth_pos \* \(1\.0 - matter_i\)/.test(compute)
            && /let death = \(growth_neg \+ lp\.nca_matter_decay\) \* matter_i/.test(compute)
            && /let da = lp\.nca_growth_k \* \(birth - death\)/.test(compute)
            && !/incoherence_death/.test(compute)
            && !/overcrowding_death/.test(compute)
            && !/coherent_birth/.test(compute),
        hint: 'Expected one coherence-gated saturating growth term and one structural death term (G- tail + leak), nothing else.',
    },
    {
        name: 'hidden morphogen EMA is removed from the rule and probe (fault #4)',
        pass: !/memory_gate/.test(compute)
            && !/memory_death/.test(compute)
            && !/hidden_avg/.test(compute)
            && !/hidden_next/.test(compute)
            && !/hiddenActivation/.test(ncaProbe)
            && !/memoryGate/.test(ncaProbe)
            && !/ncaHiddenMemory/.test(defaults)
            && !/nca-hidden-memory-slider/.test(html)
            && !/ncaSyncFeedback/.test(defaults)
            && !/nca-sync-feedback-slider/.test(html),
        hint: 'Expected the hidden EMA, its gate/death terms, params, and UI to be gone.',
    },
    {
        name: 'KuramotoNCA oscillator perception is matter-normalized',
        pass: /field = field \+ w \* a_j \* vec2<f32>\(cos\(theta_j\), sin\(theta_j\)\)/.test(compute)
            && /let local_field = field \/ field_norm/.test(compute)
            && /smoothstep\(lp\.nca_coherence_min, max\(lp\.nca_coherence_min \+ 0\.01, lp\.nca_coherence_max\), local_r\)/.test(compute),
        hint: 'Expected local oscillator direction M_i to be normalized by living excitatory matter and gated by local coherence.',
    },
    {
        name: 'Rule 7 manual selection seeds visible matter',
        pass: /onRuleModeChange/.test(controls)
            && /makeDefaultMatterSeed/.test(patterns)
            && /writeMatter\(makeDefaultMatterSeed\(sim\)\)/.test(bootstrap)
            && /this\.state\.colormap = 10/.test(controls),
        hint: 'Expected switching to Rule 7 manually to seed matter and switch to the Matter layer.',
    },
    {
        name: 'S1 keeps external webcam omega input available',
        pass: /omegaPatterns:\s*\[[^\]]*'image'/.test(manifolds)
            && /webcam-btn/.test(html),
        hint: 'Expected Image/Video Input, including webcam, to remain available for S1 omega patterns.',
    },
    {
        name: 'experiments export matter and organism metrics',
        pass: /matterMean/.test(experiments)
            && /matterMass/.test(experiments)
            && /livingCoherenceMean/.test(experiments)
            && /organismCount/.test(experiments)
            && /meanTrackPersistence/.test(experiments),
        hint: 'Expected experiment samples/summary to include matter and organism metrics.',
    },
    {
        name: 'experiments score KuramotoNCA viability',
        pass: /function computeNcaViability/.test(experiments)
            && /ncaViabilityScore/.test(experiments)
            && /ncaRegime/.test(experiments)
            && /exp-nca-summary/.test(html)
            && /viability/.test(roadmap)
            && /viability/.test(docs),
        hint: 'Expected rollout summaries and UI/docs to expose a KuramotoNCA viability score.',
    },
    {
        name: 'KuramotoNCA probe explains local update terms',
        pass: /export function computeKuramotoNcaProbe/.test(ncaProbe)
            && /excDensity/.test(ncaProbe)
            && /inhDensity/.test(ncaProbe)
            && /growthInput/.test(ncaProbe)
            && /localR/.test(ncaProbe)
            && /coherenceGate/.test(ncaProbe)
            && /growthPositive/.test(ncaProbe)
            && /matterDelta/.test(ncaProbe)
            && /dominantExc/.test(ncaProbe)
            && /dominantInh/.test(ncaProbe)
            && /computeKuramotoNcaProbe/.test(read('src/app/runtime/initOverlayDiagnostics.js'))
            && /nca-probe-summary/.test(html)
            && /nca-probe-top-exc/.test(html)
            && /nca-probe-top-inh/.test(html)
            && /NCA probe/i.test(docs)
            && /probe/i.test(roadmap),
        hint: 'Expected Phase 2 NCA probe to compute and display local Rule 7 update terms.',
    },
    {
        name: 'KuramotoNCA sweep ranks parameter candidates',
        pass: /computeNcaViability/.test(analysisController)
            && /readMatterField/.test(analysisController)
            && /ncaViabilityScore/.test(analysisController)
            && /rankSweepResults/.test(analysisController)
            && /applyBestResult/.test(analysisController)
            && /candidateState/.test(analysisController)
            && /candidateUrl/.test(analysisController)
            && /onApplyBestSweep/.test(read('src/app/runtime/callbacksAnalysis.js'))
            && /onExportBestSweepURL/.test(read('src/app/runtime/callbacksAnalysis.js'))
            && /ncaPhaseK/.test(html)
            && /ncaGrowthK/.test(html)
            && /ncaCoherenceMin/.test(html)
            && /ncaCoherenceMax/.test(html)
            && /nca-sweep-range-btn/.test(html)
            && /sweep-apply-best-btn/.test(html)
            && /sweep-export-best-url-btn/.test(html)
            && /viability/.test(discoveryUi)
            && /ncaViabilityScore/.test(discoveryUi)
            && /parameter sweep/i.test(docs)
            && /viability/i.test(roadmap),
        hint: 'Expected parameter sweep to expose KuramotoNCA ranges and rank candidates by viability.',
    },
    {
        name: 'docs record separate matter and oscillator roles',
        pass: /matter-plus-unit-oscillator/i.test(roadmap)
            && /unit oscillator/i.test(docs)
            && /matter.*alive/i.test(docs),
        hint: 'Expected roadmap/docs to document the KuraNCA substrate.',
    },
    {
        name: 'docs record the collapsed coherence-gated model',
        pass: /coherence-gated/i.test(roadmap)
            && /structural/i.test(docs)
            && !/Incoherence Death/.test(html)
            && /unit-vector oscillator/i.test(read('docs/superpowers/specs/2026-05-13-kuranca-coherence-gated-model.md')),
        hint: 'Expected docs to describe the collapsed growth/decay model and the old death-term UI to be gone.',
    },
    {
        name: 'Rule 7 supports ablation modes in the shader',
        pass: /nca_ablation_mode: f32/.test(compute)
            && /if \(ablation == 2\) \{ coherence_gate = 1\.0; \}/.test(compute)
            && /mode == 7 && i32\(lp\.nca_ablation_mode \+ 0\.5\) == 1/.test(compute)
            && /omega_eff = 0\.0;/.test(compute),
        hint: 'Expected WGSL nca_ablation_mode with gate override (mode 2) and omega zeroing (mode 1).',
    },
    {
        name: 'ablation mode is wired through state, buffers, and URL',
        pass: /ncaAblationMode: 0/.test(defaults)
            && /data\[base \+ 62\] = lp\?\.ncaAblationMode \?\? 0;/.test(buffers)
            && /ncaAblationMode: state\.ncaAblationMode \?\? 0/.test(read('src/state/layerParams.js'))
            && /ncaAblationMode: 'int'/.test(read('src/state/urlSchema.js')),
        hint: 'Expected ncaAblationMode in defaults, layer params slot 62, and URL schema.',
    },
    {
        name: 'ablation harness UI exists and sweeps as integer',
        pass: /nca-ablation-select/.test(html)
            && /value="ncaAblationMode"/.test(html)
            && /nca-ablation-sweep-btn/.test(html)
            && /nca-ablation-select/.test(controls)
            && /nca-ablation-sweep-btn/.test(controls)
            && /param === 'range' \|\| param === 'ncaAblationMode'/.test(analysisController)
            && /ncaAblationMode: state\.ncaAblationMode/.test(analysisController)
            && /nca-ablation-select/.test(display),
        hint: 'Expected NCA ablation select, sweep option, shortcut button, and integer sweep handling.',
    },
    {
        name: 'probe and docs agree with ablation semantics',
        pass: /ncaAblationMode/.test(ncaProbe)
            && /ablation/i.test(docs)
            && /frozen oscillator/i.test(docs)
            && /ablation/i.test(roadmap),
        hint: 'Expected NCA probe to respect gate-off mode and docs to describe the ablation protocol.',
    },
    {
        name: 'Lenia shell kernel (shape 7) exists',
        pass: /shape == 7/.test(compute)
            && /ring_radius = 1\.5 \* s2/.test(compute)
            && /Lenia Shell/.test(html),
        hint: 'Expected a nonnegative smooth ring kernel as kernel shape 7 with a UI option.',
    },
    {
        name: 'Rule 6 is true matter Lenia',
        pass: /fn rule_lenia_matter\(/.test(compute)
            && /mode == 6\) \{[\s\S]{0,400}rule_lenia_matter/.test(compute)
            && /mode == 6\) \{[\s\S]{0,400}order\[i\] = nca_matter_next/.test(compute)
            && !/phaseDensity/.test(compute),
        hint: 'Expected rule 6 to evolve the matter field (not a phase-density proxy) and expose matter for detection.',
    },
    {
        name: 'oscillator perception uses a living-mass floor',
        pass: /living_mass_floor/.test(compute)
            && /0\.05 \* pos_total/.test(compute)
            && /livingMassFloor/.test(ncaProbe),
        hint: 'Expected rule 7 field normalization to treat near-empty neighborhoods as incoherent, mirrored in the probe.',
    },
    {
        name: 'matter layer renders with perceptual gain',
        pass: (render.match(/sqrt\(matter_val\)/g) || []).length >= 2,
        hint: 'Expected sqrt gain on matter values in both 2D and 3D render paths.',
    },
    {
        name: 'migration presets: moving-organism regime (anisotropic kernel wind)',
        pass: /lenia_migration/.test(presets)
            && /kuramoto_nca_migration/.test(presets)
            && /lenia_migration[\s\S]{0,900}kernelCompositionEnabled = true/.test(presets)
            && /lenia_migration[\s\S]{0,900}kernelSecondary = 3/.test(presets)
            && /data-preset="lenia_migration"/.test(html)
            && /data-preset="kuramoto_nca_migration"/.test(html)
            && /migration/i.test(docs),
        hint: 'Expected migration presets (ring kernel + directional secondary, mix 0.6) with UI buttons and docs.',
    },
    {
        name: 'Living Phase layer makes phase identity visible on matter',
        pass: (render.match(/layer_choice == 11/g) || []).length >= 2
            && /value="11">Living Phase/.test(html)
            && /colormap = 11/.test(presets)
            && /nextRuleMode === 7[\s\S]{0,200}colormap = 11/.test(controls)
            && /colormap === 10 \|\| this\.state\.colormap === 11/.test(controls),
        hint: 'Expected render layer 11 (hue = phase, brightness = matter) in both paths, a UI option, rule-7 presets defaulting to it, and rule-switch handling.',
    },
    {
        name: 'growth params survive URL and matter seeds cover rule 6',
        pass: /growthMu: 'float'/.test(read('src/state/urlSchema.js'))
            && /growthSigma: 'float'/.test(read('src/state/urlSchema.js'))
            && /growthMode: 'int'/.test(read('src/state/urlSchema.js'))
            && /ruleMode === 7 \|\| STATE\.ruleMode === 6|ruleMode === 6 \|\| STATE\.ruleMode === 7/.test(read('src/patterns/patterns.js').replace(/STATE\./g, ''))
                || (/ruleMode === 7 \|\| .*ruleMode === 6/.test(read('src/patterns/patterns.js'))),
        hint: 'Expected growthMu/Sigma/Mode in urlSchema and matter seeding for rule 6 as well as rule 7.',
    },
    {
        name: 'NCA Range sweeps an attractor-changing parameter',
        pass: /nca-sweep-range-btn/.test(controls)
            && /sweepParamSelect\.value = 'growthMu'/.test(controls)
            && !/nca-sweep-range-btn'\);[\s\S]{0,600}sweepParamSelect\.value = 'ncaGrowthK'/.test(controls),
        hint: 'Expected the NCA Range shortcut to sweep growthMu (ncaGrowthK only rescales time and cannot change the attractor).',
    },
    {
        name: 'lenia presets seed matter with the shell kernel',
        pass: /lenia_orbium[\s\S]{0,800}kernelShape = 7/.test(presets)
            && /lenia_orbium[\s\S]{0,1600}writeKuramotoNcaSeed|lenia_orbium[\s\S]{0,1600}writeMatter/.test(presets)
            && /lenia_orbium[\s\S]{0,800}colormap = 10/.test(presets),
        hint: 'Expected lenia_* presets to seed the matter field, use kernel shape 7, and show the Matter layer.',
    },
    {
        name: 'phase binding: matter support is phase-selective',
        pass: /nca_phase_affinity: f32/.test(compute)
            && /matter_support/.test(compute)
            && /0\.5 \+ 0\.5 \* cos\(theta_j - t\)/.test(compute)
            && /mix\(1\.0, affinity, lp\.nca_phase_affinity\)/.test(compute)
            && /matter_support \/ max\(pos_total, 1e-5\)/.test(compute)
            && /let field_norm = max\(matter_exc, living_mass_floor\)/.test(compute),
        hint: 'Expected growth input u to use phase-affinity-weighted matter support while field normalization stays phase-blind.',
    },
    {
        name: 'phase binding is wired through state, UI, sweep, and probe',
        pass: /ncaPhaseAffinity: 0\.7/.test(defaults)
            && /data\[base \+ 63\] = lp\?\.ncaPhaseAffinity \?\? 0\.7;/.test(buffers)
            && /ncaPhaseAffinity: state\.ncaPhaseAffinity \?\? 0\.7/.test(read('src/state/layerParams.js'))
            && /ncaPhaseAffinity: 'float'/.test(read('src/state/urlSchema.js'))
            && /nca-phase-affinity-slider/.test(html)
            && /value="ncaPhaseAffinity"/.test(html)
            && /nca-phase-affinity-slider/.test(controls)
            && /ncaPhaseAffinity: state\.ncaPhaseAffinity/.test(analysisController)
            && /matterSupport/.test(ncaProbe),
        hint: 'Expected ncaPhaseAffinity in defaults, slot 63, URL schema, NCA slider, sweep options, candidate state, and the probe.',
    },
    {
        name: 'mitosis preset demonstrates binding with opposite-phase lobes',
        pass: /kuramoto_nca_mitosis[\s\S]{0,1200}Math\.PI/.test(presets)
            && /binding/i.test(docs)
            && /ncaPhaseAffinity/.test(docs),
        hint: 'Expected the mitosis preset to seed opposite-phase lobes and docs to describe phase binding.',
    },
    {
        name: 'organism detector computes per-structure phase',
        pass: /thetaData/.test(detector)
            && /meanPhase/.test(detector)
            && /phaseR/.test(detector),
        hint: 'Expected StructureDetector.detect to take theta and emit circular meanPhase + internal phaseR per structure.',
    },
    {
        name: 'frame loop feeds theta to organism detection (sequentially)',
        pass: /await sim\.readOrderField\(\)/.test(frameLoop)
            && /await sim\.readTheta\(\)/.test(frameLoop)
            && /layerTheta/.test(frameLoop)
            && !/Promise\.all\(\[sim\.readOrderField/.test(frameLoop)
            && !/Promise\.all\(\[\s*sim\.readOrderField/.test(analysisController),
        hint: 'Expected organism detection to read theta after the order field (readbacks share a pending-guard mutex; concurrent reads return null).',
    },
    {
        name: 'viability rewards multi-domain structure and penalizes uniform sync (fault #5)',
        pass: /computeOrganismPhaseStats/.test(experiments)
            && /phaseDiversity/.test(experiments)
            && /multi_domain/.test(experiments)
            && /uniform_sync/.test(experiments)
            && /dominance/.test(experiments),
        hint: 'Expected computeNcaViability to score phase diversity, blob dominance, and dynamism, with multi_domain/uniform_sync regimes.',
    },
    {
        name: 'sweep ranks with real organism and phase data',
        pass: /StructureDetector/.test(analysisController)
            && /computeOrganismPhaseStats/.test(analysisController)
            && !/organismCount: 0/.test(analysisController)
            && !/meanTrackPersistence: 0/.test(analysisController)
            && /globalR/.test(analysisController),
        hint: 'Expected the sweep call site to detect organisms from readback instead of passing fake zeros.',
    },
    {
        name: 'leaving rules 6/7 leaves the matter-backed layers',
        pass: /nextRuleMode === 7/.test(controls)
            && /nextRuleMode === 6/.test(controls)
            && /colormap === 10 \|\| this\.state\.colormap === 11/.test(controls),
        hint: 'Expected rule switching to move the display off the frozen Matter/Living Phase layers for rules 0-5.',
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
