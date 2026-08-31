import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

test('Training runtime and strict cache reseeder share one 107-game solver contract', () => {
  const stdout = execFileSync(process.execPath, ['scripts/training-solver-contract-audit.js'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const report = JSON.parse(stdout);

  assert.equal(report.success, true, report.failures.join('\n'));
  assert.deepEqual(report.failures, []);
  assert.equal(report.totals.games, 107);
  assert.equal(report.totals.pioGames, 84);
  assert.equal(report.totals.chartGames, 2);
  assert.equal(report.totals.scenarioGames, 21);
  assert.equal(report.totals.pioFamilyStackContracts, 25);
  assert.equal(report.totals.preflopGames, 2);
  assert.equal(report.totals.forcedRiverGames, 1);
});

test('canonical solver exports carry complete machine and artifact provenance', () => {
  const launcher = fs.readFileSync('scripts/preflop-deep/run_machine.py', 'utf8');
  const orchestrator = fs.readFileSync('scripts/preflop-deep/orchestrate.py', 'utf8');
  const migration = fs.readFileSync(
    'supabase/migrations/20260831141500_training_solver_provenance.sql',
    'utf8',
  );

  assert.match(launcher, /PIPELINE_COMMIT/);
  assert.match(launcher, /PIO_SOLVER_VERSION is required for certifiable exports/);
  assert.match(launcher, /PioSOLVER binary checksum does not match APPROVED_PIO_BINARY_CHECKSUM/);
  for (const field of [
    'solver_version',
    'solver_binary_checksum',
    'machine_id',
    'pipeline_commit',
    'manifest_version',
    'manifest_checksum',
    'source_artifact_checksum',
    'quality_status',
    'audited_at',
  ]) {
    assert.match(orchestrator, new RegExp(`"${field}"`), `${field} is missing from the worker payload`);
    assert.match(migration, new RegExp(`\\b${field}\\b`), `${field} is missing from the warehouse schema`);
  }
  assert.match(orchestrator, /hashlib\.sha256\(manifest_text\.encode\(\)\)\.hexdigest\(\)/);
  assert.match(orchestrator, /"quality_status": "validated"/);
  assert.match(orchestrator, /"solver_binary_checksum": PIO_BINARY_CHECKSUM/);
  assert.match(migration, /solved_spots_gold_v2_provenance_check/);
  assert.match(migration, /coalesce\(pipeline_commit, ''\) ~ '\^\[0-9a-f\]\{40\}\$'/);
  assert.match(migration, /coalesce\(new\.solver_binary_checksum, ''\) !~ '\^\[0-9a-f\]\{64\}\$'/);
});

test('solver hosts fail closed on unapproved manifests, ranges, and ICM objectives', () => {
  const launcher = fs.readFileSync('scripts/preflop-deep/run_machine.py', 'utf8');
  const orchestrator = fs.readFileSync('scripts/preflop-deep/orchestrate.py', 'utf8');
  const migration = fs.readFileSync('supabase/migrations/20260831141500_training_solver_provenance.sql', 'utf8');
  const manifest = JSON.parse(fs.readFileSync('scripts/preflop-deep/phases.json', 'utf8'));
  assert.equal(manifest.version, 4);
  assert.equal(manifest.release_gate.solver_ready, false);
  assert.match(launcher, /PIPELINE_COMMIT is required; solver hosts may not follow a moving main branch/);
  assert.doesNotMatch(launcher, /repos\/%s\/commits\/main/);
  assert.match(launcher, /APPROVED_MANIFEST_CHECKSUM is required before PioSOLVER launches/);
  assert.match(launcher, /APPROVED_PIO_BINARY_CHECKSUM is required before PioSOLVER launches/);
  assert.match(launcher, /RANGE_DIRECTORY is required before PioSOLVER launches/);
  assert.match(orchestrator, /manifest checksum does not match APPROVED_MANIFEST_CHECKSUM/);
  assert.match(orchestrator, /manifest release gate is closed/);
  assert.match(orchestrator, /range checksum mismatch/);
  assert.match(orchestrator, /PioSOLVER chip-EV worker cannot certify ICM phases/);
  assert.match(orchestrator, /PioSOLVER worker only accepts the explicit chip_ev objective/);
  assert.match(orchestrator, /"river": river_oop/);
  assert.match(orchestrator, /for rc in river_cards\(b4\)/);
  assert.match(orchestrator, /for start in range\(0, len\(unique\), 75\)/);
  assert.match(orchestrator, /states = row_states\(\[target\[4\] for target in targets\]\)/);
  assert.doesNotMatch(orchestrator, /def ensure_ranges/);
  assert.match(orchestrator, /quality_status.*validated/s);
  assert.match(migration, /solved_spots_gold_require_provenance/);
  assert.match(migration, /requires a validated v2 artifact and complete solver provenance/);
});

test('harvested solver rows record the phase state instead of hardcoded 100 BB flop metadata', () => {
  const harvester = fs.readFileSync('scripts/preflop-deep/pio_harvest.py', 'utf8');
  const orchestrator = fs.readFileSync('scripts/preflop-deep/orchestrate.py', 'utf8');
  assert.match(harvester, /"street": resolved_street/);
  assert.match(harvester, /"pot_bb": pot_chips \/ CHIPS_PER_BB/);
  assert.match(harvester, /"eff_stack_bb": eff_chips \/ CHIPS_PER_BB/);
  assert.match(harvester, /"rake": rake/);
  assert.match(harvester, /\(prefix, game_type, position, stack_bb, board\)/);
  assert.doesNotMatch(harvester, /"street": "flop", "hero": player/);
  assert.doesNotMatch(harvester, /"pot_bb": POT_CHIPS \/ CHIPS_PER_BB/);
  assert.match(orchestrator, /pot, eff, rake,[\s\S]*\{6: "flop", 8: "turn", 10: "river"\}\[len\(full\)\],[\s\S]*gt, stack/);
  assert.ok(
    harvester.indexOf('"set_rake %s" % rake') < harvester.indexOf('"build_tree"'),
    'rake must be applied before the Pio tree is built',
  );
});

test('solver replacement discovery includes legacy validated rows until full provenance certifies them', () => {
  const orchestrator = fs.readFileSync('scripts/preflop-deep/orchestrate.py', 'utf8');
  const boardDiscovery = orchestrator.slice(
    orchestrator.indexOf('def boards_for('),
    orchestrator.indexOf('def solve(', orchestrator.indexOf('def boards_for(')),
  );
  assert.doesNotMatch(boardDiscovery, /quality_status\.neq\.validated/);
  assert.match(orchestrator, /not states\[target\[4\]\]\[1\]/);
  assert.match(orchestrator, /def certified_row\(r\):/);
});

test('Python solver pipeline functionally emits exact river state and parameterized metadata', () => {
  const code = String.raw`
import os, sys
sys.path.insert(0, '.')
import pio_harvest as h
def pio(command):
    if command.startswith('show_children'):
        return 'r:0:c r:0:b400'
    if command.startswith('show_strategy'):
        return ('0.4 ' * 1326) + '\n' + ('0.6 ' * 1326)
    if command.startswith('calc_ev'):
        return '125 ' * 1326
    raise AssertionError(command)
scenario_hash, matrix = h.harvest_node(
    pio, 'r:0', 'OOP', 'AsKdQcJh2s', 'BB', 'BB', 'BTN',
    1.25, 2.5, 0.3, 700, 19300, '5 10 3 1', 'river', 'hu_cash', 200,
)
assert scenario_hash == 'river_hu_cash_BB_200bb_AsKdQcJh2s'
assert matrix['street'] == 'river'
assert matrix['pot_bb'] == 7
assert matrix['eff_stack_bb'] == 193
assert matrix['rake'] == '5 10 3 1'
assert matrix['actions'][1]['size_chips'] == 400
assert matrix['actions'][1]['size_pct'] is None
assert h.validate_row(matrix)['ev_ok'] is True
os.environ.update({
    'SUPABASE_URL': 'https://example.supabase.co',
    'SUPABASE_SERVICE_ROLE_KEY': 'test',
    'PIPELINE_COMMIT': 'a' * 40,
    'PIO_SOLVER_VERSION': 'test',
    'PIO_BINARY_CHECKSUM': 'b' * 64,
    'APPROVED_MANIFEST_CHECKSUM': 'c' * 64,
    'RANGE_DIRECTORY': '.',
})
import orchestrate
phase = {'game_type': 'hu_cash', 'stack': 100, 'pot_chips': 550,
         'streets': ['river'], 'harvest': [{'hero': 'OOP', 'position': 'BB'}]}
targets = orchestrate.expand_targets(phase, 'AsKdQc')
assert len(targets) == 49 * 48
assert all(target[0].startswith('r:0:c:b412:c:') for target in targets)
assert all(':c:b1030:c:' in target[0] for target in targets)
assert all(target[4].startswith('river_hu_cash_BB_100bb_') for target in targets)
`;
  execFileSync('python3', ['-c', code], {
    cwd: 'scripts/preflop-deep',
    encoding: 'utf8',
  });
});

test('Training rejects frequency-only legacy rows without real hand EVs', () => {
  const runtime = fs.readFileSync('src/engines/DeterministicGTOEngine.js', 'utf8');
  const reseeder = fs.readFileSync('scripts/reseed-deterministic-cache.js', 'utf8');
  const failClosed = "if (!handEVs || typeof handEVs !== 'object' || Object.keys(handEVs).length === 0) return null;";
  assert.ok(runtime.includes(failClosed));
  assert.ok(reseeder.includes(failClosed));
  assert.match(reseeder, /return v2ToAppMatrix\(scenario\.strategy_matrix_v2\)/);
  assert.match(reseeder, /return sanitizeLegacyMatrix\(structuredClone\(scenario\.strategy_matrix\)\)/);
  assert.match(reseeder, /const pure = !corrupted && maximum >= 0\.98/);
  assert.match(runtime, /&& Number\.isFinite\(handEVs\[h\]\)/);
  assert.match(reseeder, /if \(!Number\.isFinite\(handEVs\[h\]\)\) return false;/);
  assert.doesNotMatch(runtime, /const heroHandEV = handEVs\[heroHand\] \|\| 0;/);
  assert.doesNotMatch(reseeder, /const heroHandEV = handEVs\[heroHand\] \|\| 0;/);
});

test('the shared v2 bridge rejects partially corrupt solver rows', () => {
  const bridge = fs.readFileSync('src/utils/v2Matrix.js', 'utf8');
  assert.match(bridge, /if \(codes\.length < 2 \|\| evs\.length !== 1326\) return null;/);
  assert.match(bridge, /if \(!Number\.isFinite\(v\) \|\| v < 0 \|\| v > 1\.02\) return null;/);
  assert.match(bridge, /if \(Math\.abs\(total - 1\) > 0\.05 \|\| !Number\.isFinite\(evs\[idx\]\)\) return null;/);
});

test('v2 bridge functionally fails closed on one corrupt live combo', async () => {
  const { deriveNodePotState, v2ToAppMatrix } = await import('../src/utils/v2Matrix.js');
  const matrix = {
    actions: ['c', 'b50'],
    frequencies: {
      c: new Array(1326).fill(0.4),
      b50: new Array(1326).fill(0.6),
    },
    hand_evs_bb: new Array(1326).fill(1.25),
    pot_bb: 5.5,
    node: 'r:0:c:b412:c:3c:c',
    hero: 'IP',
    position: 'BTN',
    oop_player: 'BB',
    ip_player: 'BTN',
  };
  const bridged = v2ToAppMatrix(matrix);
  assert.ok(bridged);
  assert.deepEqual(deriveNodePotState(matrix.node, 550), {
    potChips: 1374,
    facingBetChips: 0,
    actor: 1,
  });
  assert.equal(bridged.pot, 1374);
  assert.equal(bridged.pot_bb, 13.74);
  assert.equal(bridged.node_state_exact, true);
  matrix.frequencies.b50[100] = 2;
  assert.equal(v2ToAppMatrix(matrix), null);
  matrix.frequencies.b50[100] = 0.6;
  matrix.hand_evs_bb[100] = null;
  assert.equal(v2ToAppMatrix(matrix), null);
  matrix.hand_evs_bb[100] = 1.25;
  matrix.node = 'r:0:c:allin';
  assert.equal(v2ToAppMatrix(matrix), null);
});

test('runtime cannot fall back to legacy when authoritative v2 is invalid', () => {
  const source = fs.readFileSync('src/engines/deterministicEnginePatches.js', 'utf8');
  assert.match(source, /row\.strategy_matrix = m;/);
  assert.doesNotMatch(source, /if \(m\) row\.strategy_matrix = m;/);
  assert.match(source, /else row\.__invalidV2 = true;/);
});

test('targeted solver practice fails closed instead of teaching another spot', () => {
  const engine = fs.readFileSync('src/engines/DeterministicGTOEngine.js', 'utf8');
  const patches = fs.readFileSync('src/engines/deterministicEnginePatches.js', 'utf8');
  assert.match(engine, /if \(targeted\.length === 0\) return curatedFallback\(\);/);
  assert.match(engine, /questions\.length > 0 \? questions : curatedFallback\(\)/);
  assert.doesNotMatch(engine, /sortedScenarios = \[\.\.\.targeted, \.\.\.others\]/);
  assert.match(engine, /matched 0 scenarios; failing closed/);
  assert.match(engine, /Context filter rejected every action/);
  assert.doesNotMatch(engine, /Context filter removed all actions[\s\S]*restoring originals/);
  assert.match(patches, /if \(filtered\.length === 0\) return null;/);
  assert.doesNotMatch(patches, /if \(filtered\.length > 0\) allData = filtered;/);
});

test('multi-street play requires the exact runout and solver sizing copy uses chip geometry', () => {
  const engine = fs.readFileSync('src/engines/DeterministicGTOEngine.js', 'utf8');
  const patches = fs.readFileSync('src/engines/deterministicEnginePatches.js', 'utf8');
  const nextStreetPatch = patches.slice(
    patches.indexOf('engine.queryNextStreet ='),
    patches.indexOf('return engine;', patches.indexOf('engine.queryNextStreet =')),
  );
  assert.match(nextStreetPatch, /const exactMatches = await queryMatches\(`%\$\{boardStr\}`/);
  assert.doesNotMatch(nextStreetPatch, /partialMatches|isApproximateBoard|semantic match/);
  assert.match(nextStreetPatch, /similar texture is not the same decision/i);
  assert.match(nextStreetPatch, /solvedHero !== requestedHero \|\| solvedVillain !== requestedVillain/);
  assert.match(nextStreetPatch, /Math\.abs\(Number\(matrix\.pot_bb\) - requestedPot\) > 0\.05/);
  assert.match(engine, /solverPotChips,[\s\S]*gameCategory/);
  assert.match(engine, /hasExactSolverPot/);
  assert.match(engine, /Math\.round\(\(parseInt\(sizeMatch\[1\]\) \/ Number\(ctx\.solverPotChips\)\) \* 100\)/);
  assert.match(engine, /nextStreetContinuationAction: continuationBet/);
});

test('warehouse questions carry a complete provenance seal or remain unverified', () => {
  const patches = fs.readFileSync('src/engines/deterministicEnginePatches.js', 'utf8');
  const reseeder = fs.readFileSync('scripts/reseed-deterministic-cache.js', 'utf8');
  const grader = fs.readFileSync('src/lib/training/solverDecisionEvidence.js', 'utf8');
  for (const field of [
    'solverVersion', 'solverBinaryChecksum', 'machineId', 'pipelineCommit', 'manifestVersion', 'manifestChecksum',
    'sourceArtifactChecksum', 'qualityStatus', 'auditedAt',
  ]) {
    assert.match(patches, new RegExp(field));
    assert.match(reseeder, new RegExp(field));
    assert.match(grader, new RegExp(field));
  }
  assert.match(patches, /LEGACY_UNVERIFIED/);
  assert.match(reseeder, /LEGACY_UNVERIFIED/);
  assert.match(grader, /WAREHOUSE_SOURCES\.has\(source\).*hasCompleteWarehouseProvenance/s);
});

test('unsealed warehouse questions disclose legacy evidence and remove exact-solver claims', async () => {
  const {
    enforceSolverClaimHonesty,
    isVerifiedSolverQuestion,
  } = await import('../src/lib/training/solverDecisionEvidence.js');
  const question = {
    source: 'DETERMINISTIC_SOLVER',
    dataQuality: 'SOLVER_EXACT',
    question: 'What is the GTO play?',
    explanation: 'The GTO solver picks Raise.',
    heroHand: 'AKs',
    boardCards: ['Ah', '7d', '2c'],
    scenario: { street: 'flop' },
    options: [{ id: 'r', text: 'Raise' }, { id: 'c', text: 'Check' }],
    correctAnswer: 'r',
    gtoFrequencies: { r: 75, c: 25 },
  };
  const disclosed = enforceSolverClaimHonesty(question);
  assert.equal(isVerifiedSolverQuestion(disclosed), false);
  assert.equal(disclosed.source, 'LEGACY_STRATEGY_ARCHIVE');
  assert.equal(disclosed.dataQuality, 'LEGACY_UNVERIFIED');
  assert.match(disclosed.question, /archived flop decision/i);
  assert.doesNotMatch(`${disclosed.question} ${disclosed.explanation}`, /what is the gto play|gto solver|solver picks/i);
  assert.match(disclosed.explanation, /highest recorded action at 75%/i);
});

test('chart questions retain their separately audited source and the unsafe ad-hoc writer is retired', () => {
  const engine = fs.readFileSync('src/engines/DeterministicGTOEngine.js', 'utf8');
  const solverBuilder = engine.slice(
    engine.indexOf('buildQuestionFromScenario(scenario'),
    engine.indexOf('// CHART ENGINE (Push/Fold)'),
  );
  const chartBuilder = engine.slice(engine.indexOf('buildChartQuestion(chart, level)'));
  assert.match(solverBuilder, /source: 'DETERMINISTIC_SOLVER'/);
  assert.doesNotMatch(solverBuilder, /source: 'CHART'/);
  assert.match(chartBuilder, /memory_charts_gold is the separately audited chart corpus/);
  assert.match(chartBuilder, /source: 'CHART'/);
  assert.equal(fs.existsSync('scripts/preflop-deep/run_and_ingest.py'), false);
  assert.equal(fs.existsSync('scripts/preflop-deep/run_batch.py'), false);
  assert.equal(fs.existsSync('scripts/preflop-deep/turn_extract.py'), false);
});

test('cache lineage audit checks every row without duplicate-hash multiplication', () => {
  const audit = fs.readFileSync('scripts/audit-training-cache-provenance.js', 'utf8');
  assert.match(audit, /warehouse AS \([\s\S]*GROUP BY (?:s\.)?scenario_hash/);
  assert.match(audit, /pioContractMismatchRows/);
  assert.match(audit, /exactGameLevelCells/);
  assert.match(audit, /levelsWithExactRows/);
  assert.match(audit, /family_mismatch/);
  assert.match(audit, /forced_street_mismatch/);
});

test('question API has one fail-closed solver reader and no permissive legacy fallback', () => {
  const source = fs.readFileSync('pages/api/training/get-question.js', 'utf8');
  assert.doesNotMatch(source, /generateQuestionFromPIO/);
  assert.doesNotMatch(source, /LEGACY PIO ENGINE — FINAL FALLBACK/);
  assert.match(source, /deterministic engine is the sole solver reader/);
  assert.match(source, /return an honest unavailable/);
});

test('solver gaps fall back to four-choice curated concepts without fake solver metrics', async () => {
  const { generateCuratedPokerConceptBatch } = await import('../src/lib/training/curatedPokerConcepts.js');
  const { enforceTrainingQuestionContract, validateTrainingQuestion } = await import('../src/lib/training/questionContract.mjs');
  const questions = generateCuratedPokerConceptBatch({
    gameId: 'mtt-002', level: 3, count: 8,
    gameConfig: { pioGameType: 'mtt_6max_icm', pioStackDepth: 20 },
    spotTypes: ['rfi', 'bb_defense'], stackDepths: [20], positions: ['BTN', 'BB'],
  });
  assert.equal(questions.length, 8);
  for (const question of questions) {
    const authoredChoices = question.options.map((option) => option.text);
    const contracted = enforceTrainingQuestionContract(question);
    assert.equal(question.source, 'CURATED_SCENARIO');
    assert.equal(question.dataQuality, 'CURATED');
    assert.equal(question.scenario.spotType, 'icm');
    assert.equal(contracted.options.length, 4);
    assert.deepEqual(contracted.options.map((option) => option.text), authoredChoices);
    assert.ok(contracted.options.some((option) => option.id === contracted.correctAnswer));
    assert.deepEqual(validateTrainingQuestion(contracted).issues, []);
    assert.equal(question.gtoFrequencies, undefined);
    assert.equal(question.evData, undefined);
    assert.doesNotMatch(`${question.question} ${question.explanation}`, /solver[- ]exact|according to gto/i);
  }
});

test('facing-a-3-bet concept choices are validated as concepts rather than mislabeled betting actions', async () => {
  const { generateCuratedPokerConceptBatch } = await import('../src/lib/training/curatedPokerConcepts.js');
  const { enforceTrainingQuestionContract, validateTrainingQuestion } = await import('../src/lib/training/questionContract.mjs');
  const questions = generateCuratedPokerConceptBatch({
    gameId: 'cash-007', level: 1, count: 7,
    gameConfig: { pioGameType: 'hu_cash', pioStackDepth: 100 },
    spotTypes: ['vs3bet'], stackDepths: [100], positions: ['BTN', 'BB'],
  });
  assert.equal(questions.length, 7);
  for (const question of questions) {
    const contracted = enforceTrainingQuestionContract(question);
    assert.equal(contracted.scenario.isConceptQuestion, true);
    assert.equal(contracted.options.length, 4);
    assert.deepEqual(validateTrainingQuestion(contracted).issues, []);
  }
});

test('forced-street curated fallback never teaches a preflop topic on a river contract', async () => {
  const { generateCuratedPokerConceptBatch } = await import('../src/lib/training/curatedPokerConcepts.js');
  const [question] = generateCuratedPokerConceptBatch({
    gameId: 'cash-012', level: 2, count: 1,
    gameConfig: { pioGameType: 'postflop_complete', pioStackDepth: 100, pioStreet: 'river' },
    spotTypes: ['bb_defense', 'river_value', 'river_bluff'], stackDepths: [100],
  });
  assert.equal(question.scenario.street, 'river');
  assert.ok(['river_value', 'river_bluff'].includes(question.scenario.spotType));
  assert.equal(question.boardCards.length, 5);
});

test('single-topic curated sessions provide 25 distinct prompts and rotating distractors', async () => {
  const { generateCuratedPokerConceptBatch } = await import('../src/lib/training/curatedPokerConcepts.js');
  const questions = generateCuratedPokerConceptBatch({
    gameId: 'mtt-002', level: 3, count: 25,
    gameConfig: { pioGameType: 'mtt_6max_icm', pioStackDepth: 20 },
    stackDepths: [20], positions: ['BTN'],
  });
  assert.equal(questions.length, 25);
  assert.equal(new Set(questions.map((question) => question.question)).size, 25);
  assert.ok(new Set(questions.map((question) => question.options.map((option) => option.text).join('|'))).size > 4);
});

test('historical chart percentages are reconstructed losslessly rather than invented', async () => {
  const { normalizeAuditedChartQuestion, isVerifiedSolverQuestion } = await import('../src/lib/training/solverDecisionEvidence.js');
  const question = {
    type: 'CHART', source: 'DETERMINISTIC_SOLVER',
    options: [
      { id: 'push', text: 'Push All-In', frequency: 73 },
      { id: 'fold', text: 'Fold', frequency: 27 },
    ],
  };
  normalizeAuditedChartQuestion(question);
  assert.deepEqual(question.gtoFrequencies, { push: 73, fold: 27 });
  assert.equal(question.source, 'CHART');
  assert.equal(isVerifiedSolverQuestion(question), true);
  const incomplete = { type: 'CHART', options: [{ id: 'push', frequency: 73 }] };
  normalizeAuditedChartQuestion(incomplete);
  assert.equal(incomplete.gtoFrequencies, undefined);
});

test('Training never presents frequency-derived action EV as measured solver output', () => {
  const engine = fs.readFileSync('src/engines/DeterministicGTOEngine.js', 'utf8');
  const reseeder = fs.readFileSync('scripts/reseed-deterministic-cache.js', 'utf8');
  const localRangeBuilder = engine.slice(
    engine.indexOf('generateFromLocalSolverRanges(gameConfig, level)'),
    engine.indexOf('_preflopActionHistory('),
  );
  const warehouseBuilder = engine.slice(
    engine.indexOf('buildQuestionFromScenario(scenario'),
    engine.indexOf('// CHART ENGINE (Push/Fold)'),
  );
  const cacheBuilder = reseeder.slice(
    reseeder.indexOf('function buildQuestionFromScenario('),
    reseeder.indexOf('async function generatePIOBatch('),
  );
  assert.match(localRangeBuilder, /no per-action EV is claimed/);
  assert.doesNotMatch(localRangeBuilder, /actionEVs|correctEV|worstEV/);
  assert.match(warehouseBuilder, /SOLVER_NODE_HAND_EV_ONLY/);
  assert.doesNotMatch(warehouseBuilder, /actionEVs/);
  assert.match(cacheBuilder, /SOLVER_NODE_HAND_EV_ONLY/);
  assert.doesNotMatch(cacheBuilder, /actionEVs/);
});
