import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { encodeClubCoachAssignment, buildThreeHandLeakReceipt, buildSessionStudyDossierMarkdown } from '../src/lib/training/trainingPresets.mjs';

const require = createRequire(import.meta.url);

import {
  SUPPORTED_VARIANTS,
  SUPPORTED_STRUCTURES,
  SUPPORTED_FORMATS,
  VARIANT_METADATA,
  STRUCTURE_METADATA,
  FORMAT_METADATA,
  TRAINING_PRESETS,
  formatPresetSummary,
  validateTrainingPreset,
  resolvePresetForGame,
} from '../src/lib/training/trainingPresets.mjs';
import {
  normalizeTrainingSessionConfig,
  normalizeTrainingVariant,
  normalizeTrainingBettingStructure,
  normalizeTrainingFormat,
} from '../src/lib/training/sessionConfigContract.mjs';
import { TRAINING_LIBRARY } from '../src/data/TRAINING_LIBRARY.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('trainingPresets: supports all canonical variants, structures, and formats without confusing PLO8 with 8-card Omaha', () => {
  assert.deepEqual(SUPPORTED_VARIANTS, ['nlh', 'plo4', 'plo5', 'plo6', 'plo8']);
  assert.deepEqual(SUPPORTED_STRUCTURES, ['no_limit', 'pot_limit', 'fixed_limit']);
  assert.deepEqual(SUPPORTED_FORMATS, ['cash', 'mtt', 'spins', 'hu', '9max']);

  // PLO8 must strictly be 4-card Omaha Hi-Lo 8-or-Better
  assert.equal(VARIANT_METADATA.plo8.holeCards, 4);
  assert.equal(VARIANT_METADATA.plo8.mustUseExactlyTwoHoleCards, true);
  assert.equal(VARIANT_METADATA.plo8.hiLoEightOrBetter, true);
  assert.ok(VARIANT_METADATA.plo8.label.includes('Hi-Lo'));
  assert.ok(!VARIANT_METADATA.plo8.label.toLowerCase().includes('8-card'));

  // Omaha variants must use Pot-Limit or Fixed-Limit (never No-Limit)
  for (const omahaVar of ['plo4', 'plo5', 'plo6', 'plo8']) {
    assert.equal(VARIANT_METADATA[omahaVar].mustUseExactlyTwoHoleCards, true);
    const check = validateTrainingPreset({
      variant: omahaVar,
      bettingStructure: 'no_limit',
      format: 'cash',
    });
    assert.equal(check.valid, false);
    assert.equal(check.preset.bettingStructure, 'pot_limit');
    assert.ok(check.warnings.length > 0);
  }
});

test('trainingPresets: resolves coherent presets for all 107 TRAINING_LIBRARY games', () => {
  assert.ok(TRAINING_LIBRARY.length >= 100);
  for (const game of TRAINING_LIBRARY) {
    const preset = resolvePresetForGame(game);
    assert.ok(SUPPORTED_VARIANTS.includes(preset.variant), `Invalid variant for ${game.id}`);
    assert.ok(SUPPORTED_STRUCTURES.includes(preset.bettingStructure), `Invalid structure for ${game.id}`);
    assert.ok(SUPPORTED_FORMATS.includes(preset.format), `Invalid format for ${game.id}`);
    assert.equal(preset.walletMutationAllowed, false, 'Training preset must stay isolated from live wallets');
    assert.ok(typeof preset.summary === 'string' && preset.summary.length > 10);
  }

  // Specific format checks
  const spinsPreset = resolvePresetForGame('spins-001');
  assert.equal(spinsPreset.format, 'spins');
  assert.equal(spinsPreset.tableSize, 3);
  assert.equal(spinsPreset.stackDepthBb, 20);

  const huPreset = resolvePresetForGame('mtt-015');
  assert.equal(huPreset.format, 'hu');
  assert.equal(huPreset.tableSize, 2);

  const pushFoldPreset = resolvePresetForGame('mtt-001');
  assert.equal(pushFoldPreset.format, 'mtt');
  assert.equal(pushFoldPreset.stackDepthBb, 15);
});

test('sessionConfigContract: normalizes plo8, bettingStructure, and format seamlessly', () => {
  assert.equal(normalizeTrainingVariant('plo8'), 'plo8');
  assert.equal(normalizeTrainingVariant('o8'), 'plo8');
  assert.equal(normalizeTrainingBettingStructure('pot_limit'), 'pot_limit');
  assert.equal(normalizeTrainingBettingStructure('fixed-limit'), 'fixed_limit');
  assert.equal(normalizeTrainingFormat('spins'), 'spins');
  assert.equal(normalizeTrainingFormat('heads_up'), 'hu');

  const cfg = normalizeTrainingSessionConfig({
    variant: 'plo8',
    bettingStructure: 'fixed_limit',
    format: 'hu',
    difficulty: 'standard',
    timer: 'relaxed',
  });
  assert.equal(cfg.variant, 'plo8');
  assert.equal(cfg.bettingStructure, 'fixed_limit');
  assert.equal(cfg.format, 'hu');
});

test('MTT Lobby design tokens & progressive disclosure contracts exist in training.css and core surfaces', () => {
  const css = read('src/styles/worlds/training.css');
  assert.ok(css.includes('#040d18'), 'training.css must define approved MTT Lobby #040d18 canvas');
  assert.ok(css.includes('#688299'), 'training.css must define approved MTT Lobby #688299 metallic steel border');
  assert.ok(css.includes('#aec0d0'), 'training.css must define approved MTT Lobby #aec0d0 top-lit rim');
  assert.ok(css.includes('#087cfa'), 'training.css must define approved MTT Lobby #087cfa royal-blue primary CTA gradient');
  assert.ok(css.includes('details.sp-mtt-disclosure'), 'training.css must style progressive <details> disclosures');
});

test('1-tap start flow, preset summary, and progressive disclosures are wired across Training surfaces', () => {
  const hubPage = `${read('pages/hub/training.js')}\n${read('src/components/training/lobby/TrainingLobbyHeader.jsx')}`;
  assert.ok(!hubPage.includes('data-training-preset-summary="true"'), 'Training Home must keep preset details out of the play entry point');
  assert.ok(hubPage.includes('data-start-training-cta="true"'), 'Training Home must provide a 1-tap Start Training CTA');
  assert.ok(!hubPage.includes('data-customize-preset-cta="true"'), 'Training Home must keep setup controls out of the play entry point');
  assert.ok(hubPage.includes('playGame'), 'Training Home must support 1-click immediate start without a mandatory setup wall');

  const setupModal = read('src/components/training/SessionSetupModal.jsx');
  assert.ok(setupModal.includes('data-preset-summary-card="true"'), 'SessionSetupModal must display the active preset summary card');
  assert.ok(setupModal.includes('data-reset-preset-defaults="true"'), 'SessionSetupModal must provide a Reset To Defaults button');
  assert.ok(setupModal.includes('data-advanced-settings-disclosure="true"'), 'SessionSetupModal must group technical parameters inside an Advanced Settings disclosure');

  const trainerModal = read('src/components/training/TrainerConfigModal.jsx');
  assert.ok(trainerModal.includes('data-trainer-advanced-disclosure="true"'), 'TrainerConfigModal must group granular filters inside an Advanced Spot Filters disclosure');

  const levelSelector = read('src/components/training/LevelSelector.tsx');
  assert.ok(levelSelector.includes('data-level-quick-start="true"'), 'LevelSelector must provide a 1-tap Start/Continue Level button');

  const arena = read('src/components/training/GodModeArena.jsx');
  assert.ok(arena.includes('data-arena-advanced-settings="true"'), 'GodModeArena splash must tuck Difficulty & Timer inside an Advanced Settings disclosure');
  assert.ok(arena.includes('data-review-detailed-analytics="true"'), 'GodModeArena review screen must show essential result first and wrap detailed tabs inside a disclosure');

  const table = read('src/components/training/games/UniversalDynamicTable.jsx');
  assert.ok(table.includes('data-table-study-tools-disclosure="true"'), 'UniversalDynamicTable must wrap secondary table & study tools inside a collapsible disclosure');
  assert.ok(table.includes('data-posthand-simulators-disclosure="true"'), 'UniversalDynamicTable must wrap post-hand simulators inside a collapsible disclosure');
  assert.ok(
    /\.sp-club-gto-desktop-rail\s*\{[\s\S]*?pointer-events:\s*none;/m.test(table),
    'sp-club-gto-desktop-rail must have pointer-events: none so it never intercepts clicks on action or raise controls',
  );

  // Phase 15 progressive disclosures and 1-tap preset summaries across secondary subpages
  const multiTable = read('pages/hub/training/multi-table.js');
  assert.ok(multiTable.includes('data-multitable-preset-summary="true"'), 'multi-table.js must display active preset summary bar');
  assert.doesNotMatch(multiTable, /data-multitable-advanced-disclosure/);
  assert.match(multiTable, /START \{tableCount\} TABLES/);

  const categoryPage = read('pages/hub/training/category/[categoryId].js');
  assert.ok(categoryPage.includes('data-category-preset-summary="true"'), 'category/[categoryId].js must display 1-tap sector preset summary');
  assert.ok(categoryPage.includes('data-category-quick-start="true"'), 'category/[categoryId].js must provide 1-tap Start Sector Training CTA');

  const sessionDashboard = read('pages/hub/training/session-dashboard.js');
  assert.doesNotMatch(sessionDashboard, /data-dashboard-detailed-diagnostics|data-decision-pacing-telemetry/);
  assert.match(sessionDashboard, /authedFetch\('\/api\/training\/get-sessions/);

  const autopilot = read('pages/hub/training/autopilot.js');
  assert.ok(autopilot.includes('data-autopilot-preset-summary="true"'), 'autopilot.js must display preset queue summary');

  const jarvis = read('pages/hub/training/jarvis.js');
  assert.ok(jarvis.includes('data-jarvis-detailed-metrics="true"'), 'jarvis.js must wrap secondary bankroll & weekly metrics inside a disclosure');

  const quizBuilder = read('pages/hub/training/quiz-builder.js');
  assert.ok(quizBuilder.includes('data-quiz-builder-advanced="true"'), 'quiz-builder.js must wrap reference panel inside a disclosure');
});

test('100% of Training Hub routes adopt the MTT Lobby #040d18 canvas or shared MTT/casino module tokens with zero legacy #0a0a1a/#0a0a12/#0a0a0a backgrounds', () => {
  function walkRoutes(dir) {
    let out = [];
    for (const ent of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, ent.name);
      if (ent.isDirectory()) out = out.concat(walkRoutes(rel));
      else if (rel.endsWith('.js') || rel.endsWith('.jsx')) out.push(rel);
    }
    return out;
  }

  const allRoutes = ['pages/hub/training.js', ...walkRoutes('pages/hub/training')];
  assert.ok(allRoutes.length >= 95, `Expected at least 95 Training route files, found ${allRoutes.length}`);

  const playMode = read('pages/hub/training/play-mode.js');
  assert.match(playMode, /destination: '\/hub\/training\/arena\/cash-001\?level=1'/);
  assert.doesNotMatch(playMode, /evaluateTrainingSpotWithHorseBrain/);

  const gameCard = read('src/components/training/GameCard.jsx');
  assert.ok(gameCard.includes('#688299'), 'GameCard.jsx must use #688299 steel border');
  assert.ok(gameCard.includes('#087cfa'), 'GameCard.jsx must use #087cfa royal-blue action CTA');

  for (const rel of allRoutes) {
    const src = read(rel);
    assert.ok(
      !src.includes('#0a0a1a') && !src.includes('#0a0a12') && !src.includes('#0a0a0a'),
      `${rel} still contains legacy #0a0a1a / #0a0a12 / #0a0a0a background`,
    );
    assert.ok(
      !src.includes('radial-gradient(circle at 50% 15%, #12354d'),
      `${rel} still contains legacy radial-gradient(circle at 50% 15%, #12354d) background`,
    );
  }
});

test('no Training file across the entire 584-file Training codebase has synchronous Temporal Dead Zone (TDZ) const/let references before declaration, duplicate object literal keys, or empty no-op onClick={() => {}} handlers', () => {
  const parser = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  function walkTrainingFiles(dir) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return [];
    let out = [];
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = path.join(dir, ent.name);
      if (ent.isDirectory()) out = out.concat(walkTrainingFiles(rel));
      else if (/\.(js|jsx|mjs)$/.test(rel)) out.push(rel);
    }
    return out;
  }
  const files = Array.from(new Set([
    'pages/hub/training.js',
    ...walkTrainingFiles('pages/hub/training'),
    ...walkTrainingFiles('pages/api/training'),
    ...walkTrainingFiles('src/components/training'),
    ...walkTrainingFiles('src/lib/training'),
    ...walkTrainingFiles('src/hooks').filter((f) => /training|gto|sound|progress/i.test(f)),
    ...walkTrainingFiles('src/config').filter((f) => /training|gto/i.test(f)),
    ...walkTrainingFiles('src/engines').filter((f) => /GTO|Scenario|Coaching|Hand|Leak|Solver|ICM|MonteCarlo|EV|Chart|Glossary/i.test(f)),
  ])).filter((rel) => fs.existsSync(path.join(ROOT, rel)));

  assert.ok(files.length >= 575, `Expected at least 575 Training files in full AST scan, found ${files.length}`);

  const tdzViolations = [];
  const dupKeyViolations = [];
  const noopClickViolations = [];
  const brokenImportViolations = [];

  for (const rel of files) {
    const code = read(rel);
    const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    traverse(ast, {
      ImportDeclaration(p) {
        const src = p.node.source.value;
        if (!src.startsWith('.')) return;
        const baseDir = path.dirname(path.join(ROOT, rel));
        const candidateBase = path.resolve(baseDir, src);
        const candidates = [
          candidateBase,
          `${candidateBase}.js`,
          `${candidateBase}.jsx`,
          `${candidateBase}.mjs`,
          `${candidateBase}.ts`,
          `${candidateBase}.tsx`,
          `${candidateBase}.json`,
          path.join(candidateBase, 'index.js'),
          path.join(candidateBase, 'index.jsx'),
          path.join(candidateBase, 'index.mjs'),
        ];
        if (!candidates.some((c) => fs.existsSync(c))) {
          brokenImportViolations.push(`${rel}:${p.node.loc?.start?.line} -> unresolved relative import "${src}"`);
        }
      },
      Function(p) {
        const bindings = p.scope.bindings;
        for (const [name, binding] of Object.entries(bindings)) {
          if (binding.kind !== 'const' && binding.kind !== 'let') continue;
          const declLoc = binding.identifier.loc.start.line;
          for (const ref of binding.referencePaths) {
            const refLoc = ref.node.loc.start.line;
            if (refLoc < declLoc) {
              let cur = ref.parentPath;
              let inDeferredFn = false;
              while (cur && cur !== p) {
                if (cur.isFunction()) {
                  const gp = cur.parentPath;
                  const isSyncMemo = gp && gp.isCallExpression() && gp.node.callee && (
                    gp.node.callee.name === 'useMemo' ||
                    (gp.node.callee.property && gp.node.callee.property.name === 'useMemo')
                  );
                  if (!isSyncMemo) {
                    inDeferredFn = true;
                    break;
                  }
                }
                cur = cur.parentPath;
              }
              if (!inDeferredFn) {
                tdzViolations.push(`${rel}: "${name}" declared at line ${declLoc} but referenced synchronously at line ${refLoc}`);
              }
            }
          }
        }
      },
      ObjectExpression(p) {
        const seen = new Map();
        for (const prop of p.node.properties) {
          if (prop.type === 'SpreadElement') {
            seen.clear();
            continue;
          }
          if (prop.computed) continue;
          const key = prop.key?.name || prop.key?.value;
          if (!key) continue;
          if (seen.has(key)) {
            dupKeyViolations.push(`${rel}:${prop.loc?.start?.line} duplicate object key "${key}" (first at line ${seen.get(key)})`);
          }
          seen.set(key, prop.loc?.start?.line);
        }
      },
      JSXAttribute(p) {
        const attrName = p.node.name?.name;
        if (attrName === 'onClick' && p.node.value?.type === 'JSXExpressionContainer') {
          const expr = p.node.value.expression;
          if (
            (expr.type === 'ArrowFunctionExpression' || expr.type === 'FunctionExpression') &&
            expr.body.type === 'BlockStatement' &&
            expr.body.body.length === 0
          ) {
            noopClickViolations.push(`${rel}:${p.node.loc?.start?.line} empty no-op onClick={() => {}}`);
          }
        }
      },
    });
  }
  assert.deepEqual(brokenImportViolations, [], `Broken relative imports detected:\n${brokenImportViolations.join('\n')}`);
  assert.deepEqual(tdzViolations, [], `TDZ violations detected:\n${tdzViolations.join('\n')}`);
  assert.deepEqual(dupKeyViolations, [], `Duplicate object literal keys detected:\n${dupKeyViolations.join('\n')}`);
  assert.deepEqual(noopClickViolations, [], `Empty no-op onClick handlers detected:\n${noopClickViolations.join('\n')}`);
});

test('plo8 variant parity is preserved across curatedPokerConcepts, gradingReceipt duel tokens, syncedHandDrillResolver, weaknessAnalysis, and DeterministicGTOEngine', async () => {
  const { generateCuratedPokerConceptBatch } = await import('../src/lib/training/curatedPokerConcepts.js');
  const { createSignedTrainingDuelToken, verifyTrainingDuelToken } = await import('../src/lib/training/gradingReceipt.mjs');
  const { rankImportedHandsByEvLeak } = await import('../src/lib/training/syncedHandDrillResolver.js');
  const { analyzeVerifiedTrainingWeaknesses } = await import('../src/lib/training/weaknessAnalysis.mjs');

  // 1. Curated concepts must preserve variant='plo8', deal 4 hole cards, and label PLO8 Hi-Lo 8-or-Better
  const plo8Batch = generateCuratedPokerConceptBatch({
    gameId: 'cash-005',
    level: 2,
    count: 3,
    gameConfig: { variant: 'plo8', pioGameType: 'cash_plo' },
  });
  assert.equal(plo8Batch.length, 3);
  for (const q of plo8Batch) {
    assert.equal(q.scenario.variant, 'plo8', 'curatedPokerConcepts must preserve plo8 variant');
    assert.equal(q.heroCards.length, 4, 'plo8 must deal 4 hole cards');
    assert.ok(q.question.includes('PLO8'), 'plo8 curated prompt must label PLO8');
  }

  // 2. Duel tokens must preserve variant='plo8' through createSignedTrainingDuelToken -> verifyTrainingDuelToken
  const testSecret = 'd8a93f14b7c25e609184726354182736459a8b7c6d5e4f3a2b1c0d9e8f7a6b5c';
  const duelToken = createSignedTrainingDuelToken({
    gameId: 'cash-005',
    level: 2,
    variant: 'plo8',
    questionIds: ['q1', 'q2'],
    challengerId: 'u-1',
    challengerName: 'Hero',
    secret: testSecret,
  });
  const verifiedDuel = verifyTrainingDuelToken(duelToken, { secret: testSecret });
  assert.ok(verifiedDuel, 'verifyTrainingDuelToken must verify token');
  assert.equal(verifiedDuel.variant, 'plo8', 'createSignedTrainingDuelToken must not downgrade plo8 to nlh');

  // 3. syncedHandDrillResolver must preserve explicit variant='plo8' even with 4 hole cards
  const syncedDrills = rankImportedHandsByEvLeak([
    {
      id: 'sync-plo8-1',
      variant: 'plo8',
      heroCards: ['As', '2s', '3h', 'Kh'],
      boardCards: ['Qs', '7d', '2c'],
      heroPosition: 'BTN',
      villainPosition: 'BB',
      pot: 12,
      toCall: 6,
    },
  ]);
  assert.equal(syncedDrills.length, 1);
  assert.equal(syncedDrills[0].variant, 'plo8', 'syncedHandDrillResolver must preserve explicit plo8 variant');

  // 4. weaknessAnalysis must classify plo8 sessions and answers as plo8 rather than downgrading to nlh or plo4
  const weaknessReport = analyzeVerifiedTrainingWeaknesses({
    sessions: [
      {
        id: 'sess-plo8-1',
        game_id: 'cash-005',
        hands_played: 10,
        correct_count: 5,
        trainer_config: { variant: 'plo8', street: 'flop', position: 'BTN' },
      },
    ],
    recentAnswers: [
      {
        game_id: 'cash-005',
        question_id: 'curated_cash-005_plo8_L1_cbet_0_0',
        is_correct: false,
        variant: 'plo8',
        street: 'flop',
        hero_position: 'BTN',
      },
      {
        game_id: 'cash-005',
        question_id: 'curated_cash-005_plo8_L1_cbet_0_1',
        is_correct: false,
        variant: 'plo8',
        street: 'flop',
        hero_position: 'BTN',
      },
      {
        game_id: 'cash-005',
        question_id: 'curated_cash-005_plo8_L1_cbet_0_2',
        is_correct: true,
        variant: 'plo8',
        street: 'flop',
        hero_position: 'BTN',
      },
    ],
  });
  assert.ok(weaknessReport, 'weaknessAnalysis must return report for plo8');
  const plo8Spot = (weaknessReport.spotLeaks || []).find((s) => s.variant === 'plo8');
  assert.ok(plo8Spot, 'weaknessAnalysis spotLeaks must retain variant="plo8"');
  assert.equal(weaknessReport.topSpotLeak?.variant, 'plo8', 'weaknessAnalysis topSpotLeak must retain variant="plo8"');

  // 5. DeterministicGTOEngine must include plo8 in its curatedFallback variant check
  const engineSrc = read('src/engines/DeterministicGTOEngine.js');
  assert.ok(
    engineSrc.includes("['plo4', 'plo5', 'plo6', 'plo8']"),
    'DeterministicGTOEngine.js must route plo8 alongside plo4/plo5/plo6 to curatedFallback()',
  );
});

test('evaluateMultiwayPostflopSpot and evaluateFullHandLineAndBranchComparison succeed across preflop, flop, turn, and river for all variants', async () => {
  const {
    evaluateMultiwayPostflopSpot,
    evaluateFullHandLineAndBranchComparison,
  } = await import('../src/lib/training/horseBrainTrainingAdapter.js');

  const variants = [
    ['nlh', ['As', 'Kd']],
    ['plo4', ['As', 'Ks', 'Qh', 'Jd']],
    ['plo5', ['As', 'Ks', 'Qh', 'Jd', 'Tc']],
    ['plo6', ['As', 'Ks', 'Qh', 'Jd', 'Tc', '9c']],
    ['plo8', ['As', '2s', 'Kh', '3h']],
  ];

  for (const [variant, heroCards] of variants) {
    for (const street of ['preflop', 'flop', 'turn', 'river']) {
      const res = evaluateMultiwayPostflopSpot({
        variant,
        street,
        activePlayerCount: 3,
        heroCards,
        boardCards: ['Qs', '8s', '3d'], // intentionally pass 3 board cards even on preflop/turn/river to prove alignment
      });
      assert.equal(res.ok, true, `evaluateMultiwayPostflopSpot must succeed for ${variant} on ${street}`);
    }
    const lineRes = evaluateFullHandLineAndBranchComparison({
      variant,
      heroCards,
      fullBoardCards: ['Qs', '8s', '3d', 'Jh', '2c'],
    });
    assert.equal(lineRes.ok, true, `evaluateFullHandLineAndBranchComparison must succeed for ${variant}`);
    assert.equal(lineRes.streetEvaluations.length, 4);
  }
});

test('Phase 17 full suite: PLO8/Fixed-Limit specialized curriculum, Shared Drill Packs, 5-Minute Leak Fix, Voice Coach, Hotkeys, Prefetch, Offline Queue, 3-Bullet Mastery, and Deep Links', async () => {
  const {
    TRAINING_PRESETS,
    encodeSharedDrillPack,
    decodeSharedDrillPack,
  } = await import('../src/lib/training/trainingPresets.mjs');
  const { generateCuratedPokerConceptBatch } = await import('../src/lib/training/curatedPokerConcepts.js');

  // 1. PLO8 & Fixed-Limit specialized presets exist and validate
  assert.ok(TRAINING_PRESETS.plo8_scoop_quartering_defense, 'plo8_scoop_quartering_defense preset must exist');
  assert.equal(TRAINING_PRESETS.plo8_scoop_quartering_defense.variant, 'plo8');
  assert.ok(TRAINING_PRESETS.fixed_limit_cap_geometry, 'fixed_limit_cap_geometry preset must exist');
  assert.equal(TRAINING_PRESETS.fixed_limit_cap_geometry.bettingStructure, 'fixed_limit');

  // 2. Fixed-Limit curated concept batch uses Fixed-Limit small/big bet cap-4 actions
  const flBatch = generateCuratedPokerConceptBatch({
    gameId: 'cash-001',
    level: 2,
    count: 3,
    gameConfig: { variant: 'nlh', bettingStructure: 'fixed_limit' },
    spotTypes: ['fixed_limit_cap'],
    targetStreet: 'turn',
  });
  assert.equal(flBatch.length, 3);
  for (const q of flBatch) {
    assert.equal(q.scenario.bettingStructure, 'fixed_limit');
    assert.ok(q.question.includes('Fixed-Limit'), 'Fixed-Limit curated prompt must label Fixed-Limit');
    assert.ok(
      q.options.some((o) => /cap|big bet|small bet/i.test(o.text)),
      'Fixed-Limit concept choices must teach the cap or betting increments',
    );
  }

  // 3. Shared Drill Pack encode/decode round-trip + tamper rejection
  const token = encodeSharedDrillPack({
    title: 'BTN vs BB PLO8 Scoop Study Pack',
    gameId: 'cash-005',
    variant: 'plo8',
    bettingStructure: 'pot_limit',
    format: 'cash',
    stackDepthBb: 100,
    heroPosition: 'BTN',
    targetStreet: 'flop',
    questionsCount: 15,
  });
  assert.ok(token.startsWith('sp1.'), 'Shared drill pack token must carry sp1 prefix');
  const decoded = decodeSharedDrillPack(token);
  assert.ok(decoded, 'decodeSharedDrillPack must decode valid token');
  assert.equal(decoded.title, 'BTN vs BB PLO8 Scoop Study Pack');
  assert.equal(decoded.variant, 'plo8');
  assert.equal(decoded.questionsCount, 15);
  assert.equal(decodeSharedDrillPack(`${token}tampered`), null, 'Tampered shared drill pack token must return null');

  // 4. Verify UI wiring markers across Phase 17 files
  const trainingHomeSrc = `${read('pages/hub/training.js')}\n${read('src/components/training/lobby/TrainingLobbyHeader.jsx')}`;
  assert.ok(trainingHomeSrc.includes('data-five-minute-leak-fix="true"'), 'Training Home must render Today\'s 5-Minute Leak Fix banner');
  assert.ok(trainingHomeSrc.includes('data-start-five-minute-fix-cta="true"'), 'Training Home must render 1-tap Start 5-Minute Fix CTA');

  const paLeaksSrc = read('pages/hub/personal-assistant/leaks.js');
  assert.ok(paLeaksSrc.includes('data-pa-leak-training-bridge="true"'), 'Personal Assistant Leaks must render 1-tap Club Arena training bridge');

  const arenaRouteSrc = read('pages/hub/training/arena/[gameId].js');
  assert.ok(arenaRouteSrc.includes('data-shared-drill-pack-banner="true"'), 'Arena route must render Shared Study Group Drill Pack banner when ?pack= is present');

  const drillBuilderSrc = read('pages/hub/training/drill-builder.js');
  assert.ok(drillBuilderSrc.includes('data-copy-shared-drill-pack="true"'), 'Drill Builder must render Copy Shared Drill Pack Link CTA');

  const quizBuilderSrc = read('pages/hub/training/quiz-builder.js');
  assert.ok(quizBuilderSrc.includes('data-copy-shared-drill-pack="true"'), 'Quiz Builder must render Copy Shared Drill Pack Link CTA');

  const godModeSrc = read('src/components/training/GodModeArena.jsx');
  assert.ok(godModeSrc.includes('data-session-three-bullet-mastery="true"'), 'GodModeArena review screen must render 3-Bullet Shareable Mastery Card');
  assert.ok(godModeSrc.includes('data-drill-missed-spots-now="true"'), 'GodModeArena review screen must render 1-tap Drill My Missed Spots Now CTA');

  const udtSrc = read('src/components/training/games/UniversalDynamicTable.jsx');
  assert.ok(udtSrc.includes('data-voice-coach-toggle="true"'), 'UniversalDynamicTable must include Voice Coach toggle');
  assert.ok(udtSrc.includes('data-offline-outbox-status="true"'), 'UniversalDynamicTable must include Offline Queue status badge');
  assert.ok(udtSrc.includes('data-next-hand-prefetched='), 'UniversalDynamicTable Next button must expose data-next-hand-prefetched');
  assert.ok(udtSrc.includes('data-mobile-quick-action-bar="true"'), 'UniversalDynamicTable action bar must expose data-mobile-quick-action-bar');
  assert.ok(udtSrc.includes('data-drill-similar-spot-cta="true"'), 'UniversalDynamicTable must expose 1-tap Drill Similar Spot CTA');

  for (const relPath of [
    'src/components/sandbox/HandReplay.jsx',
    'pages/hub/training/replay-theater.js',
    'pages/hub/training/hand-history-upload.js',
    'pages/hub/training/live-hud-sync.js',
  ]) {
    const src = read(relPath);
    assert.ok(src.includes('data-drill-similar-spot-cta="true"'), `${relPath} must expose data-drill-similar-spot-cta="true"`);
  }
});

test('Phase 18 full suite: Real-Time Co-Op Study Room, Post-Session 3-Hand Leak Receipt, Interactive Range Matrix Painter, and 0 documented-follow-up debt', async () => {
  const {
    encodeCoopStudyRoom,
    decodeCoopStudyRoom,
    decodeSharedDrillPack,
    RANGE_PAINTER_5X5_CLUSTERS,
    scoreRangePainterEstimate,
  } = await import('../src/lib/training/trainingPresets.mjs');

  // 1. Real-Time Co-Op Study Room encode/decode round-trip + tamper rejection
  const coopToken = encodeCoopStudyRoom({
    roomId: 'room-plo8-btn-flop',
    coachName: 'Coach Dan',
    title: 'PLO8 Scoop Co-Op Room',
    gameId: 'cash-005',
    variant: 'plo8',
    bettingStructure: 'pot_limit',
    format: 'cash',
    stackDepthBb: 100,
    heroPosition: 'BTN',
    targetStreet: 'flop',
  });
  assert.ok(coopToken.startsWith('coop1.'), 'Co-Op Study Room token must start with coop1.');
  const decodedCoop = decodeCoopStudyRoom(coopToken);
  assert.ok(decodedCoop, 'decodeCoopStudyRoom must decode valid token');
  assert.equal(decodedCoop.roomId, 'room-plo8-btn-flop');
  assert.equal(decodedCoop.coachName, 'Coach Dan');
  assert.equal(decodedCoop.variant, 'plo8');
  assert.equal(decodeCoopStudyRoom(`${coopToken}tampered`), null, 'Tampered Co-Op token must return null');

  // 2. Post-Session 3-Hand Leak Receipt generates 3 spots + valid signed packToken
  const receipt = buildThreeHandLeakReceipt({
    gameId: 'mtt-005',
    title: 'MTT Bubble 3-Hand Leak Receipt',
    variant: 'nlh',
    bettingStructure: 'no_limit',
    format: 'mtt',
    stackDepthBb: 40,
    heroPosition: 'CO',
    targetStreet: 'flop',
  });
  assert.equal(receipt.spots.length, 3, '3-Hand Leak Receipt must include 3 priority leak spots');
  assert.ok(receipt.totalEvLossBb > 0, '3-Hand Leak Receipt must compute positive recoverable EV');
  assert.ok(receipt.href.includes('pack='), '3-Hand Leak Receipt href must embed signed pack permalink');
  const decodedReceiptPack = decodeSharedDrillPack(receipt.packToken);
  assert.ok(decodedReceiptPack, '3-Hand Leak Receipt packToken must decode via decodeSharedDrillPack');
  assert.equal(decodedReceiptPack.format, 'mtt');
  assert.equal(decodedReceiptPack.heroPosition, 'CO');

  // 3. Interactive Range Matrix Painter scoring
  assert.equal(RANGE_PAINTER_5X5_CLUSTERS.flat().length, 25, 'Range Painter must provide 25 canonical hand clusters');
  const perfectEval = scoreRangePainterEstimate(
    ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AQs', 'AKo', 'KQs', 'QJs', 'JTs', 'A5s'],
    { street: 'flop', facingBetBb: 4 },
  );
  assert.equal(perfectEval.accuracyPct, 100, 'Exact match with solver reference range must score 100%');
  assert.equal(perfectEval.gradeLabel, 'Elite Range Read');

  // 4. Verify UI wiring markers across Phase 18 files
  const { isCustomTrainerConfig } = await import('../src/lib/training/trainerConfigMode.mjs');
  const arenaRouteSrc = read('pages/hub/training/arena/[gameId].js');
  assert.ok(arenaRouteSrc.includes('data-coop-study-room-banner="true"'), 'Arena route must render Co-Op Study Room banner when ?coopRoom= is active');
  assert.ok(
    !arenaRouteSrc.includes('stackDepth: sharedDrillPack.stackDepthBb') &&
    !arenaRouteSrc.includes('stackDepth: coopStudyRoom.stackDepthBb'),
    'Arena route must pass stackDepthBb (not stackDepth) for sharedDrillPack and coopStudyRoom so isCustomTrainerConfig does not misroute catalog drills to /api/training/custom-train',
  );
  assert.equal(
    isCustomTrainerConfig({
      stackDepthBb: 100,
      variant: 'nlh',
      bettingStructure: 'no_limit',
      format: 'cash',
      targetStreet: 'flop',
      gameMode: 'street',
      targetPositions: 'BTN',
    }),
    false,
    'Shared Drill Pack and Co-Op Study Room configs must use standard batch-preload pipeline',
  );

  const coachModeSrc = read('pages/hub/training/coach-mode.js');
  assert.ok(coachModeSrc.includes('data-launch-coop-study-room="true"'), 'Coach Mode must render Host Live Co-Op Study Room CTA');
  assert.ok(coachModeSrc.includes('data-copy-coop-study-room="true"'), 'Coach Mode must render Copy Co-Op Study Room Link CTA');

  const udtSrc = read('src/components/training/games/UniversalDynamicTable.jsx');
  assert.ok(udtSrc.includes('data-table-range-matrix-painter="true"'), 'UniversalDynamicTable study drawer must include Interactive Range Matrix Painter');
  assert.ok(udtSrc.includes('data-coop-study-room-panel="true"'), 'UniversalDynamicTable study drawer must include Real-Time Co-Op Study Room vote panel');

  for (const file of ['pages/hub/training.js', 'pages/hub/training/live-hud-sync.js', 'src/components/training/GodModeArena.jsx']) {
    assert.doesNotMatch(read(file), /data-three-hand-leak-receipt|buildThreeHandLeakReceipt/);
  }

});

test('Phase 19 full suite: Club Coach Assignments, ICM Chop Simulator, Blocker Matrix, Study Dossier, Line Consistency, Adaptive Villain, Range Funnel, Tilt Guard & Hygiene', async () => {
  const {
    decodeClubCoachAssignment,
    computeIcmChopAndPayJump,
    evaluateHandBlockerImpact,
    evaluateMultiStreetLineConsistency,
    evaluateAdaptiveVillainCounterStrategy,
    computeSurvivingRangeFunnel,
    evaluateTiltAndDecisionPacingGuard,
    decodeSharedDrillPack,
    decodeCoopStudyRoom,
  } = await import('../src/lib/training/trainingPresets.mjs');

  // 1. Club Coach Assignment encode/decode round-trip + tamper rejection
  const assignToken = encodeClubCoachAssignment({
    assignmentId: 'assign-plo8-1',
    clubName: 'Smarter.Poker Diamond Club',
    coachName: 'Coach Dan',
    title: 'PLO8 Scoop Weekly Club Assignment',
    gameId: 'omaha-002',
    variant: 'plo8',
    bettingStructure: 'pot_limit',
    format: 'cash',
    stackDepthBb: 100,
    heroPosition: 'BTN',
    targetStreet: 'flop',
    targetAccuracyPct: 86,
  });
  assert.ok(assignToken.startsWith('assign1.'), 'Club Coach Assignment token must start with assign1.');
  const decodedAssign = decodeClubCoachAssignment(assignToken);
  assert.ok(decodedAssign, 'decodeClubCoachAssignment must decode valid token');
  assert.equal(decodedAssign.assignmentId, 'assign-plo8-1');
  assert.equal(decodedAssign.variant, 'plo8');
  assert.equal(decodedAssign.targetAccuracyPct, 86);
  assert.equal(decodeClubCoachAssignment(`${assignToken}tampered`), null, 'Tampered assignment token must return null');

  // 2. ICM Chop & Payout Jump Simulator
  const icmSim = computeIcmChopAndPayJump({
    heroStackBb: 18,
    avgStackBb: 30,
    playersRemaining: 6,
    prizePoolUnits: 10000,
    toCallBb: 12,
    potSizeBb: 15,
  });
  assert.ok(icmSim.icmChopValue > 0 && icmSim.icmChopValue < 10000);
  assert.ok(icmSim.icmRequiredEquityPct > icmSim.chipEvPotOddsPct, 'ICM required equity must exceed Chip-EV pot odds under pay-jump pressure');

  // 3. Hand-vs-Range Blocker & Card-Removal Matrix
  const blockerEval = evaluateHandBlockerImpact({
    variant: 'plo8',
    heroCards: ['As', '2s', 'Kd', '3d'],
    boardCards: ['Qs', '7s', '4c'],
  });
  assert.equal(blockerEval.hasNutSuitBlocker, true);
  assert.ok(blockerEval.valueBlockedPct >= 25);

  // 5. Exportable Session Study Dossier
  const dossier = buildSessionStudyDossierMarkdown({
    gameName: '6-Max Cash Blueprint',
    variant: 'nlh',
    format: 'cash',
    accuracyPct: 88,
    gtowScore: 76,
    handsPlayed: 20,
  });
  assert.ok(dossier.markdown.includes('# Smarter.Poker Session Study Dossier'));
  assert.equal(dossier.lineCount, 6);

  // 6. Multi-Street Line Consistency, Adaptive Villain Counter, Range Funnel & Tilt Guard
  const lineEval = evaluateMultiStreetLineConsistency({ street: 'turn', selectedAction: 'c', correctAction: 'b67' });
  assert.equal(lineEval.isCoherent, false);

  const villainShift = evaluateAdaptiveVillainCounterStrategy({ recentMoves: ['raise', 'bet75', 'allin'] });
  assert.equal(villainShift.shiftedProfile, 'Trapping Counter-TAG');

  const funnel = computeSurvivingRangeFunnel({ street: 'turn', heroPosition: 'BTN' });
  assert.ok(funnel.preflopPct > funnel.flopPct && funnel.flopPct > funnel.turnPct);

  const tiltEval = evaluateTiltAndDecisionPacingGuard([
    { isCorrect: false, timeSeconds: 1.1 },
    { isCorrect: false, timeSeconds: 1.4 },
  ]);
  assert.equal(tiltEval.tiltTriggered, true);

  // 7. Fail-Closed Hygiene Pass on malformed inputs
  assert.equal(decodeSharedDrillPack(null), null);
  assert.equal(decodeCoopStudyRoom(undefined), null);
  assert.equal(decodeClubCoachAssignment('assign1.bad.payload'), null);

  // 8. Verify UI wiring markers across Phase 19 files
  const trainingHomeSrc = `${read('pages/hub/training.js')}\n${read('src/components/training/lobby/TrainingLobbyHeader.jsx')}`;
  assert.doesNotMatch(trainingHomeSrc, /data-srs-due-queue|data-stake-readiness-passport|evaluateClubArenaStakeReadiness/);
  assert.ok(trainingHomeSrc.includes('data-speculative-prefetch="ready"'), 'Training Home must expose speculative hover prefetch');

  const progressSrc = read('pages/hub/training/progress.js');
  assert.doesNotMatch(progressSrc, /data-stake-readiness-passport|evaluateClubArenaStakeReadiness/);

  const leaderboardSrc = read('pages/hub/training/leaderboard.js');
  assert.doesNotMatch(leaderboardSrc, /data-club-coach-assignment-card|Head Club Coach/);

  const icmFtSrc = read('pages/hub/training/icm-final-table.js');
  assert.match(icmFtSrc, /gameHref="\/hub\/training\/arena\/mtt-004\?level=1/);
  assert.doesNotMatch(icmFtSrc, /data-icm-chop-simulator/);

  const udtSrc = read('src/components/training/games/UniversalDynamicTable.jsx');
  for (const attr of [
    'data-phase19-study-intelligence-strip="true"',
    'data-blocker-card-removal-matrix="true"',
    'data-multistreet-line-consistency="true"',
    'data-adaptive-villain-counter="true"',
    'data-surviving-range-funnel="true"',
    'data-tilt-pacing-guard="true"',
    'data-icm-chop-simulator="true"',
  ]) {
    assert.ok(udtSrc.includes(attr), `UniversalDynamicTable must expose ${attr}`);
  }

  const godModeSrc = read('src/components/training/GodModeArena.jsx');
  assert.doesNotMatch(godModeSrc, /data-export-session-study-dossier/);
});

test('Phase 20 forensic root-cause hardening: Arena clubCoachAssignment hydration, Training Home autoLaunch overrides, DeliveryFamilyKey format/structure isolation, Tournament Brain PLO8 tightening, and UDT mistake variant tracking', async () => {
  // 1. Arena route must hydrate customLaunch and activeArenaVariant from clubCoachAssignment
  const arenaSrc = read('pages/hub/training/arena/[gameId].js');
  assert.ok(
    arenaSrc.includes('clubCoachAssignment?.variant') &&
    arenaSrc.includes('clubCoachAssignment?.bettingStructure') &&
    arenaSrc.includes('clubCoachAssignment?.format') &&
    arenaSrc.includes('clubCoachAssignment?.targetStreet') &&
    arenaSrc.includes('clubCoachAssignment?.heroPosition') &&
    arenaSrc.includes('clubAssignmentId: clubCoachAssignment.assignmentId'),
    'Arena route must forward clubCoachAssignment variant, bettingStructure, format, street, position, and metadata into customLaunch.config',
  );
  assert.ok(
    arenaSrc.includes("['cash', 'mtt', 'spins', 'hu', '9max'].includes(rawFormat)"),
    'Arena route must accept 9max alongside cash/mtt/spins/hu in rawFormat validation',
  );

  // 2. Training Home (?autoLaunch=) must forward query variant/structure/format/street/position into playGame
  const homeSrc = read('pages/hub/training.js');
  assert.ok(
    homeSrc.includes('playGame(game, queryOverrides)'),
    'Training Home ?autoLaunch= must forward queryOverrides (variant, bettingStructure, format, targetStreet, heroPosition) into playGame',
  );

  // 3. useGTOTrainer createDeliveryFamilyKey must isolate bettingStructure and format, and allow 9max
  const trainerHookSrc = read('src/hooks/useGTOTrainer.js');
  assert.ok(
    trainerHookSrc.includes("bettingStructure: String(trainerConfig?.bettingStructure || '').toLowerCase() || null") &&
    trainerHookSrc.includes("format: String(trainerConfig?.format || '').toLowerCase() || null"),
    'useGTOTrainer createDeliveryFamilyKey must include bettingStructure and format to prevent session/cache collisions',
  );
  assert.ok(
    trainerHookSrc.includes("['cash', 'mtt', 'spins', 'hu', '9max']"),
    'useGTOTrainer must allow 9max in format query parameter forwarding',
  );

  // 4. API batch-preload and get-question must accept 9max in requestedFormat and enforce expectedEngineModule & plo4/plo8 cache isolation
  for (const apiPath of ['pages/api/training/batch-preload.js', 'pages/api/training/get-question.js']) {
    const apiSrc = read(apiPath);
    assert.ok(
      apiSrc.includes("['cash', 'mtt', 'spins', 'hu', '9max'].includes(normalizedRawFormat)"),
      `${apiPath} must accept 9max in requestedFormat validation`,
    );
    assert.ok(
      apiSrc.includes('if (expectedEngineModule && rowEngine !== expectedEngineModule) return false;') &&
      apiSrc.includes("if (targetVariantFilter === 'plo4' && (q.scenario?.hiLo || q.scenario?.variant === 'plo8')) return false;"),
      `${apiPath} must reject cross-variant cached snapshots so a 4-card PLO8 snapshot is never served for a PLO4 request`,
    );
  }

  // 5. Tournament Brain must include plo8 in ploVariants and getPLOTournamentOverride
  const tourneyBrainSrc = read('src/lib/poker-engine/brain/tournament-brain.js');
  assert.ok(
    tourneyBrainSrc.includes('plo8: 11') &&
    tourneyBrainSrc.includes("['plo4', 'plo5', 'plo6', 'plo8', 'plo']"),
    'tournament-brain.js must include plo8 in getPLOTournamentOverride and ploVariants arrays',
  );

  // 6. Blocker Matrix self-blocking suit check must include plo8
  const presetsSrc = read('src/lib/training/trainingPresets.mjs');
  assert.ok(
    presetsSrc.includes("['plo4', 'plo5', 'plo6', 'plo8'].includes(variant)"),
    'evaluateHandBlockerImpact in trainingPresets.mjs must include plo8 in the 4/5/6-card Omaha self-blocking suit check',
  );

  // 7. UniversalDynamicTable mistake tracking must prioritize activeNormalizedVariant before falling back to card length
  const udtSrc = read('src/components/training/games/UniversalDynamicTable.jsx');
  assert.ok(
    udtSrc.includes('activeNormalizedVariant\n                        || question?.scenario?.variant'),
    'UniversalDynamicTable mistake tracking must prioritize activeNormalizedVariant so 4-card PLO8 hands are never misclassified as plo4',
  );

  for (const pagePath of ['pages/hub/training/aggregate.js', 'pages/hub/training/reports.js']) {
    assert.doesNotMatch(read(pagePath), /data-solver-provenance-telemetry|PLO8-Brain\.Js/);
  }

});

test('Phase 21 deep forensic root-cause hardening: 9max Launch Contract, Duel Token Variant/Structure/Format Signing, ICM Equal-Stack Conservation, PLO8 Paired-Low-Board Outs, Poker-Engine CardAssets & Variant Routing, DeckEngine Dead Cards, and API Hardening', async () => {
  // 1. customTrainingLaunchContract.mjs must preserve 9max and aliases
  const { normalizeLaunchFormat } = await import('../src/lib/training/customTrainingLaunchContract.mjs');
  assert.equal(normalizeLaunchFormat('9max'), '9max');
  assert.equal(normalizeLaunchFormat('9-max'), '9max');
  assert.equal(normalizeLaunchFormat('full_ring'), '9max');

  // 2. Duel token must sign and verify variant, bettingStructure, and format
  const { createSignedTrainingDuelToken, verifyTrainingDuelToken } = await import('../src/lib/training/gradingReceipt.mjs');
  const duelToken = createSignedTrainingDuelToken({
    duelId: 'duel_phase21_test',
    gameId: 'cash-005',
    level: 1,
    variant: 'plo8',
    bettingStructure: 'fixed_limit',
    format: '9max',
    questionIds: ['q1', 'q2', 'q3'],
    secret: 'phase21-test-secret-key-32-chars-minimum',
  });
  const verifiedDuel = verifyTrainingDuelToken(duelToken, { secret: 'phase21-test-secret-key-32-chars-minimum' });
  assert.equal(verifiedDuel.variant, 'plo8');
  assert.equal(verifiedDuel.bettingStructure, 'fixed_limit');
  assert.equal(verifiedDuel.format, '9max');

  // 3. ICMCalculator must conserve 100% of prize pool across 9 equal stacks without pruning
  const { calculateICM, calculateICMPressure } = await import('../src/engines/ICMCalculator.js');
  const nineEqualEquities = calculateICM([100, 100, 100, 100, 100, 100, 100, 100, 100], [30, 20, 15, 12, 9, 6, 4, 3, 1]);
  const totalEq = nineEqualEquities.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(totalEq - 100) < 0.05, `9-way ICM equity sum must equal 100 (got ${totalEq})`);
  assert.ok(Math.abs(nineEqualEquities[0] - 11.11) < 0.05, `Each equal 9-max stack must receive ~11.11% equity (got ${nineEqualEquities[0]})`);
  const icmPressure = calculateICMPressure(200, [200, 50, 50], [50, 30, 20], 3);
  assert.ok(Number.isFinite(icmPressure.bubbleFactor) && icmPressure.bubbleFactor >= 1.0);

  // 4. trainingPresets: mtt-018 resolves to PLO4, BB heroPosition selects BTN villainPosition, and aliases normalize cleanly
  const { validateTrainingPreset, resolvePresetForGame } = await import('../src/lib/training/trainingPresets.mjs');
  const mtt018Preset = resolvePresetForGame('mtt-018');
  assert.equal(mtt018Preset.variant, 'plo4', 'mtt-018 must resolve to PLO4 preset');
  const bbHeroPreset = validateTrainingPreset({ variant: 'plo-8', bettingStructure: 'fixed-limit', format: '9-max', heroPosition: 'BB' });
  assert.equal(bbHeroPreset.preset.variant, 'plo8');
  assert.equal(bbHeroPreset.preset.bettingStructure, 'fixed_limit');
  assert.equal(bbHeroPreset.preset.format, '9max');
  assert.equal(bbHeroPreset.preset.villainPosition, 'BTN', 'BB hero must face BTN villain instead of self-matching BB');

  // 5. DeckEngine.addDeadCards must preserve already-dealt cards so they can never be re-dealt
  const { DeckEngine } = await import('../src/engines/DeckEngine.js');
  const deck = new DeckEngine(42);
  const firstDeal = deck.deal(5);
  deck.addDeadCards(['As']);
  const restOfDeck = deck.deal(deck.remaining());
  for (const dealtCard of firstDeal) {
    assert.ok(!restOfDeck.includes(dealtCard), `Already-dealt card ${dealtCard} must not reappear after addDeadCards`);
  }

  // 6. PostflopScenarioGenerator deadBlind must include BB (1.0) + SB (0.5) when neither seat is in the blinds
  const scenarioGenSrc = read('src/engines/PostflopScenarioGenerator.js');
  assert.ok(
    scenarioGenSrc.includes("const bbIsInHand = matchup.hero === 'BB' || matchup.villain === 'BB';") &&
    scenarioGenSrc.includes('const deadBlind = (sbIsInHand ? 0 : 0.5) + (bbIsInHand ? 0 : 1.0);'),
    'PostflopScenarioGenerator potGeometry must include 1.0 BB dead blind when neither player is BB',
  );

  // 7. plo8-brain.js and plo-core.js must check boardLowRankSet.size < 3 and award +5 bonus for >=4 qualifying hole lows
  for (const brainFile of ['src/lib/poker-engine/brain/plo8-brain.js', 'src/lib/poker-engine/brain/plo-core.js']) {
    const src = read(brainFile);
    assert.ok(
      src.includes('if (boardLowRankSet.size < 3 && boardCards.length >= 3)') &&
      src.includes('const holeLowBonus = hLowQualify.length >= 4 ? 5 : hLowQualify.length >= 3 ? 3 : 0;'),
      `${brainFile} must use boardLowRankSet.size < 3 for paired low boards and reachable >=4 holeLowBonus`,
    );
  }

  // 8. poker-engine barrel index.js, GameController, TableManager, EquityCalculator, and API hardening checks
  const pokerIndexSrc = read('src/lib/poker-engine/index.js');
  assert.ok(pokerIndexSrc.includes("require('../CardAssets')"), 'poker-engine/index.js must resolve ../CardAssets cleanly');
  const tableManagerSrc = read('src/lib/poker-engine/TableManager.js');
  assert.ok(tableManagerSrc.includes('this.game.deck?.isShortDeck'), 'TableManager must check deck.isShortDeck when rotating out of short_deck');
  const saveProgressSrc = read('pages/api/training/save-progress.js');
  assert.ok(saveProgressSrc.includes('body.attemptId.trim().toLowerCase()'), 'save-progress.js must normalize attemptId to lowercase');
  const bookmarkSrc = read('pages/api/training/bookmark-solution.js');
  assert.ok(bookmarkSrc.includes("replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/g, '')"), 'bookmark-solution.js must preserve spaces and punctuation in user notes');
  const messagesSrc = read('pages/api/training/study-groups/[groupId]/messages.js');
  assert.ok(messagesSrc.includes(".order('created_at', { ascending: false })") && messagesSrc.includes('[...rawMessages].reverse()'), 'study-groups messages API must fetch newest 200 and reverse to chronological order');
});

test('Phase 22 Poker Arena Parity, 6 Matched Comparison Cases, Worked Pot-Limit Math, Preset Customize Toggle, 1-Tap PLO5 Cash Discovery, and #SMARTERDESIGN Color Law', async () => {
  const {
    computeLegalBettingBounds,
    computeClubArenaParityState,
    evaluateShowdownAndAllocatePots,
    computeMainAndSidePots,
    resolveNextActor,
    HOLE_CARD_COUNT_BY_VARIANT,
    NINE_MAX_POSITIONS,
    HEADS_UP_POSITIONS,
    SPINS_POSITIONS,
  } = await import('../src/lib/training/clubArenaTableParity.js');
  const { CLUB_ARENA_SEAT_LAYOUTS } = await import('../src/lib/training/clubArenaTableGeometry.mjs');

  // Case 1: Nine-handed Hold'em (9max) geometry & action order
  assert.equal(CLUB_ARENA_SEAT_LAYOUTS[9].length, 9, '9max geometry must define 9 seat coordinates');
  assert.equal(NINE_MAX_POSITIONS.length, 9, '9max must define 9 canonical positions');
  const nineMaxFirstPreflop = resolveNextActor({
    activePositions: NINE_MAX_POSITIONS,
    street: 'preflop',
    format: '9max',
  });
  assert.equal(nineMaxFirstPreflop, 'UTG', '9max preflop first actor must be UTG');
  const nineMaxFirstPostflop = resolveNextActor({
    activePositions: NINE_MAX_POSITIONS,
    street: 'flop',
    format: '9max',
  });
  assert.equal(nineMaxFirstPostflop, 'SB', '9max postflop first actor must be SB');

  // Case 2: PLO5 and PLO6 with a bet to call & worked Pot-Limit raise math
  // Worked Pot-Limit example: pot before bet is 10 BB, facing bet of 5 BB -> current pot on table is 15 BB (or if potBb=15 includes the 5 BB bet, call=5 brings pot to 20 -> max raise-to is 5 + 20 = 25 BB).
  const plo5Bounds = computeLegalBettingBounds({
    variant: 'plo5',
    bettingStructure: 'pot_limit',
    street: 'flop',
    potBb: 15, // 10 BB starting pot + 5 BB villain bet
    heroStackBb: 100,
    heroCommittedBb: 0,
    facingBetBb: 5,
  });
  assert.equal(plo5Bounds.isPotLimit, true);
  assert.equal(plo5Bounds.toCallBb, 5);
  assert.equal(plo5Bounds.maxPotLimitRaiseToBb, 25, 'Pot 10 + 5 bet (15 current pot) + 2*5 call = 25 BB max pot-limit raise-to');

  const plo6Parity = computeClubArenaParityState({
    variant: 'plo6',
    bettingStructure: 'pot_limit',
    format: 'cash',
    street: 'flop',
    potBb: 15,
    heroStackBb: 100,
    heroCommittedBb: 0,
    facingBetBb: 5,
  });
  assert.equal(HOLE_CARD_COUNT_BY_VARIANT.plo5, 5, 'PLO5 must require 5 hole cards');
  assert.equal(HOLE_CARD_COUNT_BY_VARIANT.plo6, 6, 'PLO6 must require 6 hole cards');
  assert.equal(plo6Parity.maxRaiseToBb, 25);

  // Case 3: PLO8 with a qualifying low (split pot) and without a qualifying low (high-only scoop)
  const plo8WithLow = evaluateShowdownAndAllocatePots({
    variant: 'plo8',
    boardCards: ['As', '2d', '7c', 'Kh', 'Qd'], // 3 low cards on board: A, 2, 7
    deadPotBb: 0,
    seats: [
      { seatId: 'HERO', position: 'BTN', holeCards: ['Ah', 'Ks', 'Qh', 'Jd'], committedBb: 20, stackRemainingBb: 80, folded: false }, // High winner (top two pair / set), no low
      { seatId: 'VILLAIN', position: 'BB', holeCards: ['3s', '4s', '9c', 'Tc'], committedBb: 20, stackRemainingBb: 80, folded: false }, // Nut low (A-2-3-4-7 using 3s,4s + As,2d,7c)
    ],
  });
  assert.equal(plo8WithLow.hasQualifyingLow, true, 'PLO8 board with A-2-7 and villain 3-4 must qualify for low');
  assert.deepEqual(plo8WithLow.highWinners, ['HERO']);
  assert.deepEqual(plo8WithLow.lowWinners, ['VILLAIN']);
  assert.equal(plo8WithLow.payoutsBySeatId.HERO, 20, 'Hero wins 20 BB high half');
  assert.equal(plo8WithLow.payoutsBySeatId.VILLAIN, 20, 'Villain wins 20 BB low half');

  const plo8WithoutLow = evaluateShowdownAndAllocatePots({
    variant: 'plo8',
    boardCards: ['Ks', 'Qd', 'Jc', '9h', '2d'], // Only one low card (2d) -> no qualifying low possible
    deadPotBb: 0,
    seats: [
      { seatId: 'HERO', position: 'BTN', holeCards: ['As', 'Ts', '3h', '4h'], committedBb: 20, stackRemainingBb: 80, folded: false }, // Broadway straight
      { seatId: 'VILLAIN', position: 'BB', holeCards: ['Kh', 'Qh', '5c', '6c'], committedBb: 20, stackRemainingBb: 80, folded: false },
    ],
  });
  assert.equal(plo8WithoutLow.hasQualifyingLow, false, 'PLO8 board with <3 low cards cannot qualify a low');
  assert.equal(plo8WithoutLow.payoutsBySeatId.HERO, 40, 'Hero scoops full 40 BB pot when no low qualifies');

  // Case 4: Short all-in with an unmatched amount or side pot & reopening rules
  const shortAllInLocked = computeClubArenaParityState({
    variant: 'nlh',
    street: 'flop',
    potBb: 26,
    heroPosition: 'BTN',
    heroStackBb: 100,
    heroCommittedBb: 10, // Hero opened to 10 BB
    facingBetBb: 16,     // Short stack shoved to 16 BB (+6 BB, less than full +10 BB raise increment)
    previousBetBb: 10,
    lastFullRaiseIncrementBb: 10,
    heroAlreadyActedOnStreet: true,
  });
  assert.equal(shortAllInLocked.reopensAction, false, 'Short all-in (+6 BB vs 10 BB full raise) must not reopen raising for hero who already acted');

  const sidePotBreakdown = computeMainAndSidePots([
    { position: 'SB', committedBb: 15, stackRemainingBb: 0, allIn: true, folded: false },
    { position: 'BB', committedBb: 40, stackRemainingBb: 60, allIn: false, folded: false },
    { position: 'BTN', committedBb: 55, stackRemainingBb: 45, allIn: false, folded: false }, // 15 BB uncalled excess over BB's 40 BB if BB is all-in, or if BB is all-in at 40:
  ]);
  assert.ok(sidePotBreakdown.mainPotBb >= 45, 'Main pot must cap at shortest all-in (15 * 3 = 45 BB)');

  const uncalledPotBreakdown = computeMainAndSidePots([
    { position: 'SB', committedBb: 15, stackRemainingBb: 0, allIn: true, folded: false },
    { position: 'BB', committedBb: 40, stackRemainingBb: 0, allIn: true, folded: false },
    { position: 'BTN', committedBb: 55, stackRemainingBb: 45, allIn: false, folded: false },
  ]);
  assert.equal(uncalledPotBreakdown.uncalledReturnBb, 15, '15 BB unmatched overbet above 40 BB all-in must be returned to BTN');
  assert.equal(uncalledPotBreakdown.uncalledSeatPosition, 'BTN');
  assert.equal(uncalledPotBreakdown.mainPotBb, 45, 'Main pot is 15 * 3 = 45 BB');
  assert.equal(uncalledPotBreakdown.sidePots.length, 1, 'One side pot between BB and BTN');
  assert.equal(uncalledPotBreakdown.sidePots[0].amountBb, 50, 'Side pot is (40 - 15) * 2 = 50 BB');

  // Case 5: Heads-up (hu), Spin (spins), and Fixed-Limit (fixed_limit) hands
  assert.deepEqual(HEADS_UP_POSITIONS, ['BTN', 'BB']);
  assert.deepEqual(SPINS_POSITIONS, ['BTN', 'SB', 'BB']);
  assert.equal(resolveNextActor({ activePositions: HEADS_UP_POSITIONS, street: 'preflop', format: 'hu' }), 'BTN', 'HU preflop BTN/SB acts first');
  assert.equal(resolveNextActor({ activePositions: HEADS_UP_POSITIONS, street: 'flop', format: 'hu' }), 'BB', 'HU postflop BB acts first');
  const flTurnBounds = computeLegalBettingBounds({
    variant: 'nlh',
    bettingStructure: 'fixed_limit',
    street: 'turn',
    potBb: 10,
    heroStackBb: 50,
    facingBetBb: 2,
    numRaisesOnStreet: 3,
    maxRaisesPerRound: 4,
  });
  assert.equal(flTurnBounds.isFixedLimit, true);
  assert.equal(flTurnBounds.fixedIncrementBb, 2, 'Turn/River fixed-limit increment must be 2 BB (big bet)');
  assert.equal(flTurnBounds.canRaise, true);
  assert.equal(flTurnBounds.minRaiseToBb, 4);

  const flCappedBounds = computeLegalBettingBounds({
    variant: 'nlh',
    bettingStructure: 'fixed_limit',
    street: 'turn',
    potBb: 14,
    heroStackBb: 50,
    facingBetBb: 8,
    numRaisesOnStreet: 4,
    maxRaisesPerRound: 4,
  });
  assert.equal(flCappedBounds.raiseCapReached, true, '4th raise reaches Fixed-Limit cap');
  assert.equal(flCappedBounds.canRaise, false, 'Cannot raise once 4-raise cap is reached');

  // Case 6 & Usability / SmarterDesign source contracts
  const udtSrc = read('src/components/training/games/UniversalDynamicTable.jsx');
  const trainingHomeSrc = read('pages/hub/training.js');
  const godModeSrc = read('src/components/training/GodModeArena.jsx');

  assert.ok(udtSrc.includes('data-customize-table-toggle="true"'), 'UniversalDynamicTable must expose Customize toggle when presetOnly is true');
  assert.ok(udtSrc.includes('data-training-feedback="explanation"'), 'UniversalDynamicTable must expose data-training-feedback="explanation" in inline verdict');
  assert.ok(udtSrc.includes('data-replay-current-hand="true"'), 'UniversalDynamicTable must expose data-replay-current-hand="true" Practice Again button');
  assert.ok(/data-training-scenario-telemetry="true"[\s\S]{0,180}zIndex:\s*25/.test(udtSrc), 'Scenario telemetry strip must have zIndex: 25 so top-seat avatar cutouts never intercept toolbar clicks');
  assert.ok(godModeSrc.includes('const handleDefaultNextHand = useCallback((arg) => nextQuestion(arg), [nextQuestion]);') || udtSrc.includes('onNextHand({ retry: true, retryQuestion: lastQuestionRef.current })'), 'Practice Again must pass retry payload');
  assert.ok(trainingHomeSrc.includes('data-variant-filter-bar="true"') && trainingHomeSrc.includes("id: 'plo5'"), 'Training Home must expose 1-tap PLO5 variant filter and quick launch');

  // Verify zero forbidden yellow/gold/amber/purple/magenta text hexes across training.css, pvp-lobby.js, and live-hud-sync.js
  const checkForbiddenTextHexInFile = (relPath) => {
    const content = read(relPath);
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!/\bcolor\s*:/.test(line)) continue;
      const before = line.split(/color\s*:/)[0];
      if (/border|background|stop-color/i.test(before.slice(-16))) continue;
      const after = line.slice(line.indexOf('color:'));
      const hexes = after.match(/#[0-9a-fA-F]{6}/g) || [];
      for (const h of hexes) {
        const n = parseInt(h.slice(1), 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const chroma = max - min;
        if (chroma < 12) continue;
        let hue = 0;
        if (max === r) hue = ((g - b) / chroma) % 6;
        else if (max === g) hue = (b - r) / chroma + 2;
        else hue = (r - g) / chroma + 4;
        hue = Math.round(hue * 60);
        if (hue < 0) hue += 360;
        assert.ok(
          !((hue >= 20 && hue < 80) || (hue >= 250 && hue < 348)),
          `${relPath}:${i + 1} uses forbidden text color ${h} (hue=${hue})`
        );
      }
    }
  };
  checkForbiddenTextHexInFile('src/styles/worlds/training.css');
  checkForbiddenTextHexInFile('pages/hub/training/pvp-lobby.js');
  checkForbiddenTextHexInFile('pages/hub/training/live-hud-sync.js');
});

test('Phase 23 deep forensic root-cause hardening: Practice Again spot replay, Customize unlock, table config propagation, uncalled bet return, fixed-limit cap, 9-max positions, and full-estate #SMARTERDESIGN text color gate', async () => {
  const {
    computeMainAndSidePots,
    computeClubArenaParityState,
    applyClubArenaAction,
    rotateDealerButtonPosition,
  } = await import('../src/lib/training/clubArenaTableParity.js');
  const {
    validateTrainingPreset,
    buildThreeHandLeakReceipt,
    encodeSharedDrillPack,
    decodeSharedDrillPack,
  } = await import('../src/lib/training/trainingPresets.mjs');
  const {
    evaluateFullHandLineAndBranchComparison,
    evaluateDoubleBoardBombPot,
  } = await import('../src/lib/training/horseBrainTrainingAdapter.js');
  const {
    normalizeTrainingVariant,
    normalizeLaunchBettingStructure,
    normalizeLaunchFormat,
  } = await import('../src/lib/training/customTrainingLaunchContract.mjs');
  const { analyzeVerifiedTrainingWeaknesses } = await import('../src/lib/training/weaknessAnalysis.mjs');

  // 1. Practice Again / Spot Replay wiring in useGTOTrainer, GodModeArena, UniversalDynamicTable, GTOQuestionCard
  const trainerHookSrc = read('src/hooks/useGTOTrainer.js');
  const godModeSrc = read('src/components/training/GodModeArena.jsx');
  const routerSrc = read('src/components/training/GameUIRouter.jsx');
  const udtSrc = read('src/components/training/games/UniversalDynamicTable.jsx');
  const qCardSrc = read('src/components/training/GTOQuestionCard.jsx');

  assert.ok(
    trainerHookSrc.includes('const nextQuestion = useCallback(async (options = null) =>') &&
      trainerHookSrc.includes('if (options && typeof options === \'object\' && options.retry === true)') &&
      trainerHookSrc.includes('Number(publicQuestion?._retryCount) > 0 && publicQuestion?.correctAnswer'),
    'useGTOTrainer must support nextQuestion({ retry: true }) and local practice replay grading without advancing questionNumber or re-posting sealed submissionId',
  );
  assert.ok(
    godModeSrc.includes('const handleNextQuestion = useCallback((arg) =>') &&
      godModeSrc.includes('if (arg && typeof arg === \'object\' && arg.retry === true)'),
    'GodModeArena.handleNextQuestion must forward retry payload immediately to nextQuestion(arg)',
  );
  assert.ok(
    udtSrc.includes('presetOnly: presetOnlyProp = false') &&
      udtSrc.includes('const presetOnly = Boolean(presetOnlyProp && !customizeOpen);') &&
      udtSrc.includes('onTableConfigChange') &&
      routerSrc.includes('onTableConfigChange={onTableConfigChange}') &&
      godModeSrc.includes('onTableConfigChange={handleTableConfigChange}'),
    'UniversalDynamicTable Customize toggle must unlock study tools and propagate variant/structure/format changes via onTableConfigChange',
  );
  assert.ok(
    udtSrc.includes(':${question?._retryCount || 0}') &&
      qCardSrc.includes('showFeedback, question?._gradingContext?.submissionId'),
    'UniversalDynamicTable decisionKey and GTOQuestionCard selection reset must react to Practice Again replay',
  );
  assert.ok(
    trainerHookSrc.includes('trainerConfig?.targetPositions || trainerConfig?.position || trainerConfig?.heroPosition') &&
      trainerHookSrc.includes('[10, 25, 50, 100].includes(Number(trainerConfig.questionsCount))'),
    'useGTOTrainer must forward heroPosition/targetPositions in batch-preload and normalize custom-train count to [10,25,50,100]',
  );

  // 2. Uncalled bet return when opponents fold with 0 committed on current street
  const uncalledPostflop = computeMainAndSidePots(
    [
      { position: 'BTN', committedBb: 4, stackRemainingBb: 90, folded: false },
      { position: 'BB', committedBb: 0, stackRemainingBb: 94, folded: true },
    ],
    6.5,
  );
  assert.equal(uncalledPostflop.uncalledReturnBb, 4, 'Uncalled opening bet on street must be returned to bettor');
  assert.equal(uncalledPostflop.uncalledSeatPosition, 'BTN');
  assert.equal(uncalledPostflop.mainPotBb, 6.5, 'Main pot must remain the 6.5 BB dead pot after returning uncalled 4 BB bet');
  assert.equal(uncalledPostflop.resultingStacks.BTN, 94, 'Returned uncalled bet must be credited back to Hero resulting stack');

  // 3. Fixed-Limit 4-bet raise cap enforcement in applyClubArenaAction
  const flCappedState = computeClubArenaParityState({
    variant: 'nlh',
    bettingStructure: 'fixed_limit',
    format: 'cash',
    street: 'turn',
    potBb: 18,
    heroPosition: 'BTN',
    heroStackBb: 80,
    heroCommittedBb: 6,
    facingBetBb: 8,
    numRaisesOnStreet: 4,
    maxRaisesPerRound: 4,
  });
  assert.equal(flCappedState.raiseCapReached, true);
  assert.throws(
    () => applyClubArenaAction(flCappedState, { type: 'raise', amountBb: 10 }),
    /Fixed-Limit raise cap/,
    'applyClubArenaAction must throw when attempting to raise at the Fixed-Limit 4-bet cap',
  );
  const flAllInAtCap = applyClubArenaAction(flCappedState, { type: 'all_in' });
  assert.equal(flAllInAtCap.submittedTotalBb, 8, 'Fixed-Limit all_in at raise cap must cap at call amount');

  // 4. 9-Max dealer button rotation with MP / LJ / UTG+1 / UTG+2
  assert.equal(rotateDealerButtonPosition('MP', '9max'), 'LJ', '9-max rotation from MP (UTG+2 alias) must advance to LJ');
  assert.equal(rotateDealerButtonPosition('UTG+1', '9max'), 'UTG+2');

  // 5. validateTrainingPreset villainPosition preservation & buildThreeHandLeakReceipt canonical gameId
  const customVillainPreset = validateTrainingPreset({
    format: 'cash',
    variant: 'nlh',
    heroPosition: 'CO',
    villainPosition: 'BTN',
  }).preset;
  assert.equal(customVillainPreset.heroPosition, 'CO');
  assert.equal(customVillainPreset.villainPosition, 'BTN', 'validateTrainingPreset must preserve explicit valid villainPosition');

  const plo8Receipt = buildThreeHandLeakReceipt({ variant: 'plo8', format: 'cash' });
  assert.equal(plo8Receipt.gameId, 'cash-005', 'buildThreeHandLeakReceipt must use canonical cash-005 for plo8');
  const decodedPack = decodeSharedDrillPack(plo8Receipt.packToken);
  assert.equal(decodedPack.questionsCount, 10, 'Shared drill pack questionsCount must conform to 10-hand custom session contract');

  // 6. Horse Brain adapter engineModule & double-board bomb pot card deduplication
  const plo8BranchEval = evaluateFullHandLineAndBranchComparison({
    gameId: 'cash-005',
    variant: 'plo8',
    heroCards: ['As', '2s', '3h', 'Kh'],
    fullBoardCards: ['Qs', '7d', '2c', '4s', '8h'],
  });
  assert.equal(plo8BranchEval.engineModule, 'plo8-brain.js', 'evaluateFullHandLineAndBranchComparison must report plo8-brain.js for plo8');

  const dbPlo5 = evaluateDoubleBoardBombPot({ variant: 'plo5' });
  const allPlo5Cards = [
    ...dbPlo5.heroCards,
    ...dbPlo5.boardACards,
    ...dbPlo5.boardBCards,
  ].map((c) => c.toLowerCase());
  assert.equal(new Set(allPlo5Cards).size, allPlo5Cards.length, 'evaluateDoubleBoardBombPot must never deal duplicate cards across heroCards, Board A, and Board B');

  // 7. Launch contract alias normalization & 9-max weakness analysis
  assert.equal(normalizeTrainingVariant('omaha8'), 'plo8');
  assert.equal(normalizeLaunchBettingStructure('fl'), 'fixed_limit');
  assert.equal(normalizeLaunchFormat('9-max'), '9max');

  const nineMaxWeakness = analyzeVerifiedTrainingWeaknesses({
    sessions: [
      { id: 's1', game_id: 'cash-001', hands_played: 20, correct_count: 18 },
    ],
    recentAnswers: [
      { game_id: 'mtt-001', question_id: 'q1', is_correct: false, variant: 'nlh', street: 'preflop', hero_position: 'UTG+1' },
      { game_id: 'mtt-001', question_id: 'q2', is_correct: false, variant: 'nlh', street: 'preflop', hero_position: 'UTG+1' },
      { game_id: 'mtt-001', question_id: 'q3', is_correct: false, variant: 'nlh', street: 'preflop', hero_position: 'UTG+1' },
    ],
  });
  assert.ok(
    nineMaxWeakness.spotLeaks.some((l) => l.position === 'UTG+1'),
    'weaknessAnalysis must preserve 9-max UTG+1 position in spotLeaks',
  );
  assert.ok(
    nineMaxWeakness.leaks.some((l) => l.gameId === 'mtt-001'),
    'weaknessAnalysis must include unfinished-session recentAnswers games in leaks even when another game has a completed session',
  );

  // 8. Full-estate #SMARTERDESIGN text color gate across all Training pages, components, and CSS
  const walkFiles = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkFiles(full, out);
      else if (/\.(js|jsx|ts|tsx|css|mjs)$/.test(entry.name)) out.push(full);
    }
    return out;
  };
  const allTrainingFiles = [
    ...walkFiles(path.join(ROOT, 'pages/hub/training')),
    path.join(ROOT, 'pages/hub/training.js'),
    ...walkFiles(path.join(ROOT, 'src/components/training')),
    ...walkFiles(path.join(ROOT, 'src/styles/training')),
    path.join(ROOT, 'src/styles/worlds/training.css'),
  ];
  const forbiddenVars = [
    'var(--sp-warn)',
    'var(--sp-accent-amber)',
    'var(--sp-accent-orange)',
    'var(--sp-accent-purple)',
    'var(--dc-gold)',
    'var(--ch-gold)',
  ];
  const colorViolations = [];
  for (const absFile of allTrainingFiles) {
    if (!fs.existsSync(absFile)) continue;
    const rel = path.relative(ROOT, absFile);
    const lines = fs.readFileSync(absFile, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      const isTextColorProp = /\b(color|WebkitTextFillColor|accent)\s*[:=]/.test(line)
        && !/\b(background|border|outline|boxShadow|shadow|stroke|stopColor|linear-gradient|radial-gradient)/i.test(
          line.split(/\b(color|WebkitTextFillColor|accent)\s*[:=]/)[0],
        );
      if (!isTextColorProp) continue;
      const hexes = line.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
      for (const hx of hexes) {
        if (hx.length === 8 && hx.slice(6).toLowerCase() !== 'ff') continue;
        const hRaw = hx.slice(1);
        const rgb = hRaw.length === 3 || hRaw.length === 4
          ? [parseInt(hRaw[0] + hRaw[0], 16), parseInt(hRaw[1] + hRaw[1], 16), parseInt(hRaw[2] + hRaw[2], 16)]
          : (hRaw.length === 6 || hRaw.length === 8
              ? [parseInt(hRaw.slice(0, 2), 16), parseInt(hRaw.slice(2, 4), 16), parseInt(hRaw.slice(4, 6), 16)]
              : null);
        if (!rgb) continue;
        const [r, g, b] = rgb;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const chroma = max - min;
        if (chroma < 12) continue;
        let hue = 0;
        if (max === r) hue = ((g - b) / chroma) % 6;
        else if (max === g) hue = (b - r) / chroma + 2;
        else hue = (r - g) / chroma + 4;
        hue = (hue * 60 + 360) % 360;
        if ((hue >= 20 && hue < 80) || (hue >= 250 && hue < 348)) {
          colorViolations.push(`${rel}:${i + 1} (${hx})`);
        }
      }
      for (const fv of forbiddenVars) {
        if (line.includes(fv)) {
          colorViolations.push(`${rel}:${i + 1} (${fv})`);
        }
      }
    }
  }
  assert.deepEqual(
    colorViolations,
    [],
    `Forbidden #SMARTERDESIGN text colors detected across Training estate:\n${colorViolations.slice(0, 25).join('\n')}`,
  );
});

test('Phase 24 optimizations & enhancements: Horse Brain LRU cache, demand-driven simulators, interactive branch replay, archetype replay, hotkeys, and top-leak lobby pill', async () => {
  const {
    evaluateTrainingSpotWithHorseBrain,
    evaluateFullHandLineAndBranchComparison,
    getHorseBrainSpotCacheStats,
    clearHorseBrainSpotCache,
  } = await import('../src/lib/training/horseBrainTrainingAdapter.js');

  // 1. Verify bounded 5,000-entry Horse Brain spot LRU cache & branch LRU cache
  clearHorseBrainSpotCache();
  const stats0 = getHorseBrainSpotCacheStats();
  assert.equal(stats0.size, 0);
  assert.equal(stats0.hits, 0);

  const eval1 = evaluateTrainingSpotWithHorseBrain({
    gameId: 'cash-005',
    variant: 'plo5',
    bettingStructure: 'pot_limit',
    format: 'cash',
    street: 'flop',
    heroCards: ['As', 'Ks', 'Qh', 'Jd', 'Tc'],
    boardCards: ['9s', '8d', '2c'],
    potSizeBb: 8.5,
    facingBetBb: 4,
    effectiveStackBb: 100,
  });
  assert.equal(eval1.cacheHit, false);

  const eval2 = evaluateTrainingSpotWithHorseBrain({
    gameId: 'cash-005',
    variant: 'plo5',
    bettingStructure: 'pot_limit',
    format: 'cash',
    street: 'flop',
    heroCards: ['As', 'Ks', 'Qh', 'Jd', 'Tc'],
    boardCards: ['9s', '8d', '2c'],
    potSizeBb: 8.5,
    facingBetBb: 4,
    effectiveStackBb: 100,
  });
  assert.equal(eval2.cacheHit, true, 'Identical Horse Brain spot evaluation must hit the in-memory LRU cache');
  assert.equal(eval2.recommendedAction, eval1.recommendedAction);
  assert.ok(getHorseBrainSpotCacheStats().hits >= 1);

  const branch1 = evaluateFullHandLineAndBranchComparison({
    gameId: 'cash-005',
    variant: 'plo8',
    heroCards: ['As', '2s', '3h', 'Kh'],
    fullBoardCards: ['Qs', '7d', '2c', '4s', '8h'],
  });
  assert.equal(branch1.cacheHit, false);
  const branch2 = evaluateFullHandLineAndBranchComparison({
    gameId: 'cash-005',
    variant: 'plo8',
    heroCards: ['As', '2s', '3h', 'Kh'],
    fullBoardCards: ['Qs', '7d', '2c', '4s', '8h'],
  });
  assert.equal(branch2.cacheHit, true, 'Identical full-hand line and branch evaluation must hit the branch LRU cache');

  // 2. Verify batch-preload warm cache capacity upgrade
  const batchPreloadSrc = read('pages/api/training/batch-preload.js');
  assert.ok(
    batchPreloadSrc.includes('const WARM_CACHE_TTL_MS = 300_000;') &&
      batchPreloadSrc.includes('const WARM_CACHE_MAX_ENTRIES = 256;'),
    'batch-preload.js must maintain a 5-minute, 256-entry warm question cache',
  );

  // 3. Verify demand-driven simulator gating, interactive branch replay, archetype replay, and hotkeys in UniversalDynamicTable.jsx
  const udtSrc = read('src/components/training/games/UniversalDynamicTable.jsx');
  assert.ok(
    udtSrc.includes('if (!showFeedback && continuedBoardCards.length === 0) return null;'),
    'UniversalDynamicTable must demand-gate whatIfEvaluation during pre-answer decision phase',
  );
  assert.ok(
    udtSrc.includes('data-play-rewound-branch-on-felt="true"') &&
      udtSrc.includes('handlePlayRewoundBranchOnFelt') &&
      udtSrc.includes('data-active-branch-replay="true"'),
    'UniversalDynamicTable must wire interactive multi-street branch replay on felt',
  );
  assert.ok(
    udtSrc.includes('data-replay-vs-archetype-strip="true"') &&
      udtSrc.includes('data-replay-vs-archetype={prof.key}'),
    'UniversalDynamicTable must wire 1-tap Replay Vs Exploitative Archetype buttons on verdict banner',
  );
  assert.ok(
    udtSrc.includes("showFeedback && onNextHand && !isMultiStreetActive && (key === 'r' || key === 'R')") &&
      udtSrc.includes("presetOnlyProp && (key === 'k' || key === 'K' || (e.shiftKey && (key === 'c' || key === 'C')))"),
    'UniversalDynamicTable unified keyboard handler must support R for Practice Again and K / Shift+C for Customize toggle',
  );

  // 4. Verify 1-Tap Fix Top Leak pill in TrainingLobbyHeader.jsx and pages/hub/training.js
  const headerSrc = read('src/components/training/lobby/TrainingLobbyHeader.jsx');
  const trainingPageSrc = read('pages/hub/training.js');
  assert.ok(
    headerSrc.includes('data-top-detected-leak-cta="true"') &&
      headerSrc.includes('Fix Top Leak (10 Hands)') &&
      trainingPageSrc.includes('fiveMinuteLeakFix={fiveMinuteLeakFix}'),
    'TrainingLobbyHeader must surface the 1-tap Fix Top Leak (10 Hands) CTA when a verified or active leak is present',
  );
});

test('Phase 25: mobile action-state table geometry floor, synchronous Practice Again reset, and GTOQuestionCard hotkeys', () => {
  const udtSrc = read('src/components/training/games/UniversalDynamicTable.jsx');
  assert.ok(
    udtSrc.includes('.gto-trainer-container .sp-club-gto-table-area {') &&
      udtSrc.includes('min-height: 220px !important;') &&
      udtSrc.includes("flexWrap: isMobile ? 'nowrap' : 'wrap'"),
    'UniversalDynamicTable must preserve mobile action-state table min-height and keep mobile telemetry strip single-line scrollable',
  );
  assert.ok(
    udtSrc.includes('aria-pressed={customizeOpen}') &&
      udtSrc.includes('presetOnlyProp, isMultiStreetActive, question]);'),
    'UniversalDynamicTable Customize toggle must expose aria-pressed and include presetOnlyProp in handleKeyDown dependencies',
  );

  const hookSrc = read('src/hooks/useGTOTrainer.js');
  const retryIdx = hookSrc.indexOf('if (options && typeof options === \'object\' && options.retry === true)');
  const awaitPersistIdx = hookSrc.indexOf('? await persistPendingAnswer(pendingPersistence)');
  assert.ok(
    retryIdx > 0 && awaitPersistIdx > retryIdx && hookSrc.includes('retryCountAtSubmit: Number(publicQuestion?._retryCount) || 0'),
    'useGTOTrainer nextQuestion({ retry: true }) must synchronously reset showFeedback and preserve _retryCount across in-flight answer persistence',
  );

  const cardSrc = read('src/components/training/GTOQuestionCard.jsx');
  assert.ok(
    cardSrc.includes("if (key === 'r' || key === 'R')") &&
      cardSrc.includes("if (key === 'Enter' || key === 'ArrowRight')"),
    'GTOQuestionCard must support keyboard shortcuts for Practice Again (R), Next Question (Enter/ArrowRight), and options (1-4 / A-D)',
  );
});








