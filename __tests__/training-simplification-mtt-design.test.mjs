import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

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
  const hubPage = read('pages/hub/training.js');
  assert.ok(hubPage.includes('data-training-preset-summary="true"'), 'Training Home must display the active preset summary');
  assert.ok(hubPage.includes('data-start-training-cta="true"'), 'Training Home must provide a 1-tap Start Training CTA');
  assert.ok(hubPage.includes('data-customize-preset-cta="true"'), 'Training Home must provide a secondary Customize Preset button');
  assert.ok(hubPage.includes('quickStartDrill'), 'Training Home must support 1-click immediate start without a mandatory setup wall');

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
  assert.ok(multiTable.includes('data-multitable-advanced-disclosure="true"'), 'multi-table.js must wrap per-pane rotation & drill grid inside an advanced disclosure');

  const categoryPage = read('pages/hub/training/category/[categoryId].js');
  assert.ok(categoryPage.includes('data-category-preset-summary="true"'), 'category/[categoryId].js must display 1-tap sector preset summary');
  assert.ok(categoryPage.includes('data-category-quick-start="true"'), 'category/[categoryId].js must provide 1-tap Start Sector Training CTA');

  const sessionDashboard = read('pages/hub/training/session-dashboard.js');
  assert.ok(sessionDashboard.includes('data-dashboard-detailed-diagnostics="true"'), 'session-dashboard.js must wrap specialized split-pot & pacing diagnostics inside a disclosure');

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

  const canonicalRedirect = read('src/components/training/CanonicalTrainingRedirect.jsx');
  assert.ok(canonicalRedirect.includes('#040d18'), 'CanonicalTrainingRedirect.jsx must use #040d18 MTT Lobby canvas');
  assert.ok(canonicalRedirect.includes('#688299'), 'CanonicalTrainingRedirect.jsx must use #688299 steel border');
  assert.ok(canonicalRedirect.includes("'plo8'"), 'CanonicalTrainingRedirect.jsx must include plo8 variant tab');

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
