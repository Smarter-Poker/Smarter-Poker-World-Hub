import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const RETIRED_SOLVER_RPCS = [
  'fn_pio_options_from_solver',
  'fn_chart_options_from_memory',
];

const RUNTIME_SOURCE_ROOTS = [
  '.github', 'app', 'config', 'engine', 'lib', 'pages', 'scripts', 'services',
  'src', 'supabase/functions', 'utils', 'worker',
];

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

function solverFunctionOperationPattern(rpc) {
  return new RegExp(
    `\\b(CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION|DROP\\s+FUNCTION(?:\\s+IF\\s+EXISTS)?)\\s+(?:public\\.)?${rpc}\\b`,
    'gi',
  );
}

function sourceFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(fullPath, files);
    } else if (/\.(?:c?js|mjs|jsx|ts|tsx|py|sh|sql|ya?ml)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

test('legacy client-callable solver extraction RPCs stay retired', () => {
  const migrationsDirectory = path.resolve('supabase/migrations');
  const migrations = fs.readdirSync(migrationsDirectory)
    .filter((filename) => filename.endsWith('.sql'))
    .sort();

  for (const rpc of RETIRED_SOLVER_RPCS) {
    let lastOperation = null;
    const operationPattern = solverFunctionOperationPattern(rpc);
    assert.match(
      `CREATE FUNCTION public.${rpc}() RETURNS integer LANGUAGE sql AS 'SELECT 1'`,
      solverFunctionOperationPattern(rpc),
      `${rpc} plain CREATE FUNCTION declarations must be detectable`,
    );
    assert.doesNotMatch(
      stripSqlComments(`SELECT 1; -- CREATE FUNCTION public.${rpc}() RETURNS integer`),
      solverFunctionOperationPattern(rpc),
      `${rpc} declarations inside trailing line comments must be ignored`,
    );
    assert.doesNotMatch(
      stripSqlComments(`/* CREATE OR REPLACE FUNCTION public.${rpc}() RETURNS integer */`),
      solverFunctionOperationPattern(rpc),
      `${rpc} declarations inside block comments must be ignored`,
    );

    for (const filename of migrations) {
      const activeSql = stripSqlComments(
        fs.readFileSync(path.join(migrationsDirectory, filename), 'utf8'),
      );
      for (const match of activeSql.matchAll(operationPattern)) {
        lastOperation = { filename, operation: match[1].toUpperCase() };
      }
    }

    assert.ok(lastOperation, `${rpc} has no auditable migration history`);
    assert.match(
      lastOperation.operation,
      /^DROP FUNCTION/,
      `${rpc} was recreated after its retirement by ${lastOperation.filename}`,
    );
    assert.equal(
      lastOperation.filename,
      '20260906101500_retire_legacy_solver_option_rpcs.sql',
      `${rpc} retirement is not pinned to the Phase 1 trust-lockdown migration`,
    );
  }

  const runtimeFiles = RUNTIME_SOURCE_ROOTS
    .filter((directory) => fs.existsSync(directory))
    .flatMap((directory) => sourceFiles(path.resolve(directory)));
  const offenders = [];
  for (const filename of runtimeFiles) {
    const source = fs.readFileSync(filename, 'utf8');
    for (const rpc of RETIRED_SOLVER_RPCS) {
      if (source.includes(rpc)) offenders.push(`${path.relative(process.cwd(), filename)}: ${rpc}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `runtime source still advertises or calls retired solver RPCs:\n${offenders.join('\n')}`,
  );
});

test('legacy V1 f can never become a Fold option at a solver policy boundary', async () => {
  const {
    hasUntrustedLegacyFoldChannel,
    inheritSolverMatrixTrust,
    selectTrustedLegacySolverMatrix,
    selectTrustedSolverMatrix,
  } = await import('../src/lib/training/solverMatrixTrust.js');

  const plausibleButUnsafeV1 = {
    actions: ['c', 'f'],
    frequencies: {
      c: { AKs: 0.6 },
      f: { AKs: 0.4 },
    },
    hand_evs: { AKs: 1.25 },
  };
  assert.equal(hasUntrustedLegacyFoldChannel(plausibleButUnsafeV1), true);
  assert.equal(selectTrustedLegacySolverMatrix(plausibleButUnsafeV1), null);
  assert.equal(selectTrustedSolverMatrix({ strategy_matrix: plausibleButUnsafeV1 }), null);
  assert.equal(selectTrustedLegacySolverMatrix({
    actions: ['c', 'b33'],
    frequencies: { c: { AKs: 0.6 }, b33: { AKs: 0.4 } },
  })?.actions[1], 'b33');

  const v2WithRealFoldAction = {
    combo_order: 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325',
    range_combo_order: 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325',
    source_combo_order_schema: 'piosolver.show_hand_order.v1',
    source_combo_order_sha256: '1'.repeat(64),
    oop_range_checksum: '2'.repeat(64),
    ip_range_checksum: '3'.repeat(64),
    training_game_contracts_sha256: '4'.repeat(64),
    actions: ['c', 'f'],
    frequencies: {
      c: new Array(1326).fill(0.6),
      f: new Array(1326).fill(0.4),
    },
    hand_evs_bb: new Array(1326).fill(1.25),
    pot_bb: 5.5,
    eff_stack_bb: 100,
    node: 'r:0:b500',
    board: ['Ah', 'Kd', '2c'],
    street: 'flop',
    hero: 'IP',
    position: 'BTN',
    oop_player: 'BB',
    ip_player: 'BTN',
    rake: '0 0',
    tree_geometry: 'srp_parameterized_v2',
    solver: 'PioSOLVER',
    exploitability_pct: 0.05,
    convergence: {
      schema: 'piosolver.calc-results.v1',
      source_command: 'calc_results',
      accuracy_fraction: 0.001,
      starting_pot_chips: 550,
      achieved_exploitability_chips: 0.275,
      achieved_exploitability_fraction: 0.0005,
    },
  };
  const selectedV2 = selectTrustedSolverMatrix({
    strategy_matrix: plausibleButUnsafeV1,
    strategy_matrix_v2: v2WithRealFoldAction,
  });
  assert.ok(selectedV2);
  assert.equal(
    selectTrustedSolverMatrix({ strategy_matrix_v2: v2WithRealFoldAction }),
    selectedV2,
    'repeated policy reads should reuse the already validated V2 bridge',
  );
  assert.deepEqual(selectedV2.actions, ['c', 'f']);
  assert.equal(selectedV2.source, 'pio_v2');
  assert.equal(
    selectTrustedLegacySolverMatrix({ ...selectedV2 }),
    null,
    'serialized or copied objects cannot forge process-local V2 trust',
  );
  const constrainedV2 = inheritSolverMatrixTrust(selectedV2, {
    ...selectedV2,
    frequencies: {
      c: { AKs: 0.6 },
      f: { AKs: 0.4 },
    },
  });
  assert.equal(selectTrustedLegacySolverMatrix(constrainedV2), constrainedV2);
  assert.equal(selectTrustedLegacySolverMatrix({
    ...plausibleButUnsafeV1,
    source: 'pio_v2',
  }), null, 'a JSON source label is not a trust seal');
  assert.equal(selectTrustedSolverMatrix({
    strategy_matrix: { actions: ['c', 'b33'], frequencies: {} },
    strategy_matrix_v2: { actions: ['c', 'f'], frequencies: {} },
  }), null, 'an invalid authoritative V2 payload must not fall back to V1');
  assert.equal(selectTrustedSolverMatrix({
    strategy_matrix: { actions: ['c', 'b33'], frequencies: {} },
    strategy_matrix_v2: '',
  }), null, 'a present but malformed V2 payload must fail closed even when falsey');
});

test('the runtime preserves validated V2 Fold while quarantining legacy V1 f', () => {
  const output = execFileSync(process.execPath, [
    '__tests__/solver-matrix-trust-runtime-probe.cjs',
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), {
    directCoreV2FoldPreserved: true,
    validV2FoldPreserved: true,
    legacyV1FoldQuarantined: true,
    mutatedLegacyV1FoldQuarantined: true,
    legacyV1Question: null,
  });
});

test('solver range presentation is owned by canonical policy metadata, never raw Pio targets', async () => {
  const {
    buildRangeActionPresentation,
    buildRangeGridData,
    rangeFrequencyPercentMultiplier,
  } = await import('../src/components/training/rangeGridData.js');
  const solverPolicy = {
    actions: [
      {
        id: 'check', sourceCode: 'c', family: 'check', label: 'Check', legal: true,
        size: { unit: 'none', chips: 0, bigBlinds: 0, potFraction: 0, exact: true },
      },
      {
        id: 'bet_75pct', sourceCode: 'b1442', family: 'bet', label: 'Bet 75% Pot', legal: true,
        size: {
          unit: 'pot_fraction', chips: 1030, bigBlinds: 10.3,
          potFraction: 10.3 / 13.74, exact: true,
        },
      },
      {
        id: 'raise_128_54pct', sourceCode: 'b3502', family: 'raise',
        label: 'Raise To 30.9 BB', legal: true,
        size: {
          unit: 'pot_fraction', chips: 3090, bigBlinds: 30.9,
          potFraction: 30.9 / 24.04, exact: true,
        },
      },
    ],
  };
  const canonicalRange = {
    check: { AKs: 0.4 },
    bet_75pct: { AKs: 0.6 },
    raise_128_54pct: { AKs: 0 },
  };
  const presentation = buildRangeActionPresentation(solverPolicy, canonicalRange);
  assert.equal(presentation.bet_75pct.label, 'Bet 75% Pot');
  assert.equal(presentation.bet_75pct.amountLabel, '10.30 BB');
  assert.equal(presentation.bet_75pct.displayLabel, 'Bet 75% Pot · 10.30 BB');
  assert.equal(presentation.bet_75pct.size.chips, 1030);
  assert.equal(presentation.bet_75pct.size.bigBlinds, 10.3);
  assert.equal(presentation.bet_75pct.color, 'var(--sp-accent-blue)');
  assert.equal(presentation.raise_128_54pct.label, 'Raise To 30.9 BB');
  assert.equal(presentation.raise_128_54pct.amountLabel, '30.90 BB');
  assert.equal(presentation.raise_128_54pct.displayLabel, 'Raise To 30.9 BB');
  assert.equal(presentation.raise_128_54pct.size.bigBlinds, 30.9);
  assert.equal(presentation.raise_128_54pct.color, 'var(--sp-accent-purple)');
  assert.equal(rangeFrequencyPercentMultiplier({ check: { AKs: 0.4 }, bet_75pct: { AKs: 0.6 } }), 100);
  assert.equal(rangeFrequencyPercentMultiplier({ check: { AKs: 40 }, bet_75pct: { AKs: 60 } }), 1);
  assert.deepEqual(buildRangeGridData({ check: { AKs: 40 }, bet_75pct: { AKs: 60 } }).AKs, {
    check: 40,
    bet_75pct: 60,
  }, 'historical 0-100 range matrices must not be inflated by another factor of 100');
  assert.equal(buildRangeActionPresentation(solverPolicy, {
    c: { AKs: 0.4 }, b1442: { AKs: 0.6 },
  }), null, 'source tokens cannot bypass canonical rebinding at the browser boundary');
  assert.equal(buildRangeActionPresentation({
    actions: [{
      ...solverPolicy.actions[1],
      size: { ...solverPolicy.actions[1].size, exact: false },
    }],
  }, { bet_75pct: { AKs: 1 } }), null,
  'an aggressive range legend cannot claim an exact amount without exact policy sizing');

  const tableSource = fs.readFileSync('src/components/training/games/UniversalDynamicTable.jsx', 'utf8');
  const localRangeStart = tableSource.indexOf('function RangeMatrixViewer');
  const localRangeEnd = tableSource.indexOf('// Short labels for range matrix legend');
  const localRangeSource = tableSource.slice(localRangeStart, localRangeEnd);
  assert.match(localRangeSource, /rangeActionMetadata\(cell\.bestAction, actionPresentation\)\?\.color/);
  assert.match(localRangeSource, /rangeActionMetadata\(a, actionPresentation\)\?\.displayLabel/);
  assert.doesNotMatch(localRangeSource, /match\(\/\^b|parseInt\([^)]*action|startsWith\(['"]b['"]\)/,
    'the local range view must not reconstruct policy semantics from bNNN');
  assert.match(tableSource, /<RangeGrid[\s\S]*?actionPresentation=\{rangeModeGrid\.actionPresentation\}/);
  assert.match(tableSource, /<RangeMatrixViewer[\s\S]*?actionPresentation=\{rangeModeGrid\?\.actionPresentation\}/);
  assert.equal((tableSource.match(/actionPresentation=\{/g) || []).length, 3,
    'every Universal Table range-rendering path must receive canonical presentation metadata');

  const rangeGridSource = fs.readFileSync('src/components/training/RangeGrid.jsx', 'utf8');
  assert.match(rangeGridSource, /getActionDisplay\(act, actionPresentation\)/);
  assert.match(rangeGridSource, /getActionColor\(maxAction, actionPresentation\)/);
  assert.match(rangeGridSource, /if \(hasOwnedPresentation\) return 'var\(--sp-fg-dim\)'/);
  assert.match(rangeGridSource, /actionPresentation=\{actionPresentation\}/);
});

test('the retired cache auditor cannot mint stale multi-street continuation math', () => {
  const source = fs.readFileSync('scripts/reseed-deterministic-cache.js', 'utf8');
  const builderStart = source.indexOf('function buildQuestionFromScenario');
  const builderEnd = source.indexOf('async function generatePIOBatch');
  const builder = source.slice(builderStart, builderEnd);
  assert.match(source, /Mutation mode is permanently retired/);
  assert.match(builder, /Pio cache question construction is permanently retired/);
  assert.match(builder, /return null;/);
  assert.match(source.slice(builderEnd), /Pio cache question construction is permanently retired/);
  assert.doesNotMatch(builder, /nextStreetContinuationAction|solverActionUnits/);
  assert.doesNotMatch(builder, /Number\(String\(action\)\.slice\(1\)\)\s*\/\s*solverPotChips/);
});

test('solver consumers are retired or enforce an exact source-aware trust boundary', () => {
  const retiredRoutes = new Map([
    ['pages/api/assistant/sandbox/analyze.js', 'SANDBOX_ANALYSIS_REQUIRES_VERIFIED_EVIDENCE'],
    ['pages/api/god-mode/fetch-hand.js', 'LEGACY_GOD_MODE_HAND_DELIVERY_RETIRED'],
    ['pages/api/god-mode/submit-action.js', 'LEGACY_GOD_MODE_GRADING_RETIRED'],
    ['pages/api/gto/gto-analysis.js', 'LEGACY_GTO_ANALYSIS_RETIRED'],
    ['pages/api/training/aggregate-report.js', 'SOLVER_AGGREGATE_REPORT_REQUIRES_AUDITED_COHORT'],
    ['pages/api/training/runout-report.js', 'SOLVER_RUNOUT_REPORT_REQUIRES_AUDITED_LINEAGE'],
    ['pages/api/training/tree-navigate.js', 'SOLVER_TREE_REQUIRES_AUDITED_NODE_LINEAGE'],
  ]);
  for (const [filename, retirementCode] of retiredRoutes) {
    const source = fs.readFileSync(filename, 'utf8');
    assert.match(source, /res\.status\(410\)\.json\(/, `${filename} is not hard-retired`);
    assert.match(source, /private, no-store, max-age=0/, `${filename} can cache retirement state`);
    assert.match(source, new RegExp(retirementCode), `${filename} lacks its explicit retirement code`);
    assert.doesNotMatch(
      source,
      /createClient|SUPABASE_SERVICE_ROLE_KEY|\.from\(|\.rpc\(|SolverPolicyService|Math\.random/,
      `${filename} still carries a solver/data execution path behind its retirement response`,
    );
  }

  const catalogBoundReaders = [
    'pages/api/training/browse-solutions.js',
    'pages/api/training/solver-api.js',
  ];
  for (const filename of catalogBoundReaders) {
    const source = fs.readFileSync(filename, 'utf8');
    assert.match(source, /training_solver_spot_candidates_v1/,
      `${filename} does not use the authority-joining catalog RPC`);
    assert.doesNotMatch(source, /\.from\(['"]solved_spots_gold['"]\)/,
      `${filename} can bypass active catalog authority`);
    assert.match(source, /strategy_matrix_v2/, `${filename} omits the authoritative matrix`);
    assert.doesNotMatch(
      source,
      /v2ToAppMatrix\([^)]*strategy_matrix_v2[^)]*\)\s*\|\|\s*[^;\n]*strategy_matrix/,
      `${filename} can fall back from invalid V2 to legacy V1`,
    );
  }

  const customTrainer = fs.readFileSync('pages/api/training/custom-train.js', 'utf8');
  assert.match(customTrainer, /new SolverPolicyService\(\{ db: getSupabase\(\) \}\)/);
  assert.match(customTrainer, /readSolvedRows\(\{/);
  assert.match(customTrainer, /applyDeterministicEnginePatches/);
  assert.match(customTrainer, /solverProvenance\?\.verified\s*===\s*true/);
  assert.doesNotMatch(customTrainer, /\.from\(['"]solved_spots_gold['"]\)/);

  for (const filename of [
    'pages/api/training/spot-drill.js',
    'src/engines/deterministicEnginePatches.js',
  ]) {
    const source = fs.readFileSync(filename, 'utf8');
    assert.match(source, /training_solver_spot_candidates_v1/,
      `${filename} does not read through the admitted solver catalog RPC`);
    assert.doesNotMatch(source, /\.from\(['"]solved_spots_gold['"]\)/,
      `${filename} bypasses catalog admission with a direct warehouse read`);
    assert.match(source, /strategy_matrix_v2/, `${filename} omits the authoritative matrix`);
  }

  const solverApi = fs.readFileSync('pages/api/training/solver-api.js', 'utf8');
  assert.match(solverApi, /p_scenario_hash: request\.scenarioHash/);
  assert.match(solverApi, /game_type: request\.pioGameType/);
  assert.match(solverApi, /p_street: request\.street/);
  assert.match(solverApi, /stack_depth: request\.stackDepth/);
  assert.match(solverApi, /p_position: request\.heroPosition/);
  assert.match(solverApi, /customSolverRowMatchesRequest\(row, request\)/);
  assert.match(solverApi, /exactCandidates\.length > 1[\s\S]*status: 'ambiguous'/);
  assert.match(solverApi, /source: 'training_solver_artifact_catalog'/);
  assert.match(solverApi, /matchQuality: 'exact_root_node'/);
  assert.match(solverApi, /isEstimate: false/);
  assert.match(solverApi, /res\.status\(422\)\.json\(\{[\s\S]*SOLVER_NODE_CONTEXT_REQUIRED/);
  assert.match(solverApi, /res\.status\(404\)\.json\(\{[\s\S]*AUDITED_SOLVER_ARTIFACT_NOT_FOUND/);
  assert.doesNotMatch(
    solverApi,
    /modeled_baseline|generateBaselineStrategy|\.from\(['"]solver_queue['"]\)|status: 'queued'|queued for precise solving/i,
  );

  const requiredWiring = new Map([
    ['scripts/trivia-deterministic-seed.js', /selectTrustedSolverMatrix\(/],
    ['src/engines/deterministicEnginePatches.js', /if\s*\(hasUntrustedLegacyFoldChannel\(matrix\)\s*&&\s*!selectTrustedLegacySolverMatrix\(matrix\)\)/],
  ]);

  for (const [filename, invariant] of requiredWiring) {
    const source = fs.readFileSync(filename, 'utf8');
    assert.match(source, invariant, `${filename} bypasses solver trust`);
    assert.doesNotMatch(
      source,
      /v2ToAppMatrix\([^)]*strategy_matrix_v2[^)]*\)\s*\|\|\s*[^;\n]*strategy_matrix/,
      `${filename} can fall back from invalid V2 to legacy V1`,
    );
  }

  assert.match(customTrainer, /readSolvedRows\(\{[\s\S]*gameTypes: pioGameTypes/);
  assert.match(customTrainer, /readSolvedRows\(\{[\s\S]*stackDepth: parsedStack/);
  assert.match(customTrainer, /street: safeStreet === 'all' \? undefined : safeStreet/);
  assert.match(customTrainer, /position: safePosition === 'any' \? undefined : safePosition/);
  assert.match(customTrainer, /customTrainingQuestionMatchesConfig\(contractedQuestion, customConfig\)/);
  assert.match(customTrainer, /prepareTrainingAttemptDelivery\(\{/);
  assert.match(customTrainer, /requireFullAttempt: true/);
  assert.match(customTrainer, /exactFiltersApplied: true/);

  const pioQueryService = fs.readFileSync('src/services/PIOQueryService.js', 'utf8');
  assert.match(pioQueryService, /async queryScenarios\(\)[\s\S]*Direct solver queries are retired[\s\S]*return null;/);
  assert.doesNotMatch(pioQueryService, /\.from\(|\.rpc\(|createClient|SUPABASE_SERVICE_ROLE_KEY/);

  const deterministicEngine = fs.readFileSync('src/engines/DeterministicGTOEngine.js', 'utf8');
  assert.match(deterministicEngine, /import \{ SolverPolicyService \}/);
  assert.match(deterministicEngine, /this\._solverPolicyService = new SolverPolicyService\(\{ db: this\.db \}\)/);
  assert.doesNotMatch(
    deterministicEngine,
    /\.select\(['"][^'"]*\bstrategy_matrix\b(?![^'"]*\bstrategy_matrix_v2\b)[^'"]*['"]\)/,
    'the base engine has a solved-spots projection that omits authoritative V2 data',
  );
  assert.match(
    deterministicEngine,
    /getMaxFrequency\(selectTrustedSolverMatrix\(scenario\)\)/,
    'difficulty filtering must not rank a raw V1 f channel before the trust boundary',
  );

  const offlineCache = fs.readFileSync('src/lib/training/offlineQuestionCache.js', 'utf8');
  assert.match(offlineCache, /OFFLINE_QUESTION_CACHE_VERSION = 3/);
  assert.match(
    offlineCache,
    /cached\.version !== OFFLINE_QUESTION_CACHE_VERSION/,
    'pre-boundary IndexedDB packs must never survive the solver trust release',
  );
  assert.match(offlineCache, /version: OFFLINE_QUESTION_CACHE_VERSION/);
});

test('live schema tombstones reject both retired RPC names on CREATE and ALTER', () => {
  const migration = fs.readFileSync(
    'supabase/migrations/20260906160000_guard_retired_solver_option_rpcs.sql',
    'utf8',
  );
  assert.match(migration, /CREATE EVENT TRIGGER trg_reject_retired_solver_option_rpc_ddl/);
  assert.match(migration, /WHEN TAG IN \('CREATE FUNCTION', 'ALTER FUNCTION'\)/);
  assert.match(migration, /pg_event_trigger_ddl_commands\(\)/);
  assert.match(migration, /retired solver option RPC recreation blocked/);
  assert.match(migration, /FOREACH v_name IN ARRAY ARRAY\[/);
  for (const rpc of RETIRED_SOLVER_RPCS) assert.match(migration, new RegExp(rpc));
  assert.doesNotMatch(migration, /\bCASCADE\b/);
});

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
  assert.match(orchestrator, /artifact_envelope = \{"scenario_hash": sh, "strategy_matrix_v2": sm\}/);
  assert.match(orchestrator, /WORKER_PROTOCOL = "smarter-poker\.solver-worker\.v2"/);
  assert.match(orchestrator, /hmac\.new\(WORKER_HMAC_SECRET, signature_message, hashlib\.sha256\)/);
  assert.match(orchestrator, /"X-SP-Solver-Nonce": nonce/);
  assert.match(orchestrator, /"ingest_artifact", \{"artifact": body\}/);
  assert.doesNotMatch(orchestrator, /\/rest\/v1\//);
  assert.doesNotMatch(orchestrator, /Authorization.*Bearer/);
  assert.match(orchestrator, /remove SUPABASE_SERVICE_ROLE_KEY; solver workers must use scoped signed ingestion/);
  assert.match(launcher, /FORBIDDEN_DATABASE_ENVIRONMENT/);
  assert.match(launcher, /remove legacy database environment variables; solver workers must use scoped signed ingestion/);
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
  assert.equal(manifest.execution_scope, 'training_backlog');
  assert.equal(manifest.release_gate.solver_ready, false);
  assert.match(launcher, /PIPELINE_COMMIT is required; solver hosts may not follow a moving main branch/);
  assert.doesNotMatch(launcher, /repos\/%s\/commits\/main/);
  assert.match(launcher, /APPROVED_MANIFEST_CHECKSUM is required before any pipeline code is installed/);
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
  assert.match(orchestrator, /states = row_states\(/);
  assert.match(orchestrator, /states\[target\[4\]\]\["count"\] == 1/);
  assert.match(orchestrator, /"row_states", \{"scenario_hashes": chunk\}/);
  assert.match(orchestrator, /"board_page"/);
  assert.match(orchestrator, /"heartbeat"/);
  assert.match(orchestrator, /isinstance\(receipt\.get\("replayed"\), bool\)/);
  assert.match(orchestrator, /not math\.isfinite\(value\)/);
  assert.match(orchestrator, /os\.replace\(temporary_path, backup_path\)/);
  assert.match(launcher, /pinned manifest bytes do not match APPROVED_MANIFEST_CHECKSUM/);
  assert.match(launcher, /pinned pipeline bundle does not match the approved manifest/);
  assert.match(launcher, /os\.replace\(temporary_path, destination\)/);
  assert.match(launcher, /BASE_DIRECTORY = os\.path\.dirname\(os\.path\.abspath\(__file__\)\)/);
  assert.match(launcher, /os\.chdir\(BASE_DIRECTORY\)/);
  assert.match(launcher, /calc_results returned a non-finite field/);
  assert.doesNotMatch(launcher, /except Exception:\s*expl = 0\.0/);
  assert.match(orchestrator, /manifest must pin the approved pipeline bundle checksum/);
  assert.match(orchestrator, /def canonical_phase_contracts\(phases\)/);
  assert.match(orchestrator, /phase_contracts_sha256/);
  assert.match(orchestrator, /phase streets, OOP\/IP nodes, chip geometry, /);
  assert.match(orchestrator, /phase_contract_by_id\[phase_id\]/);
  assert.match(orchestrator, /phase id and game type must be safe canonical tokens/);
  assert.match(orchestrator, /must discover canonical flop parents/);
  assert.match(orchestrator, /solver self-test is missing approved inputs/);
  assert.match(orchestrator, /board must contain %d unique canonical cards/);
  assert.match(manifest.pipeline_bundle_checksum, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    Object.keys(manifest.pipeline_files_sha256).sort(),
    ['orchestrate.py', 'pio_harvest.py', 'run_machine.py', 'tree_gen.py'],
  );
  const bundleDigest = createHash('sha256');
  for (const filename of ['run_machine.py', 'tree_gen.py', 'pio_harvest.py', 'orchestrate.py']) {
    const payload = fs.readFileSync(`scripts/preflop-deep/${filename}`);
    assert.equal(
      createHash('sha256').update(payload).digest('hex'),
      manifest.pipeline_files_sha256[filename],
      `${filename} is not individually sealed by the real manifest`,
    );
    bundleDigest.update(`${filename}\0`);
    bundleDigest.update(payload);
    bundleDigest.update('\0');
  }
  assert.equal(bundleDigest.digest('hex'), manifest.pipeline_bundle_checksum);
  assert.doesNotMatch(orchestrator, /def ensure_ranges/);
  assert.match(orchestrator, /quality_status.*validated/s);
  assert.match(migration, /solved_spots_gold_require_provenance/);
  assert.match(migration, /requires a validated v2 artifact and complete solver provenance/);
});

test('solver launcher gates Pio start, bounds silent stdout, and always reaps its child', () => {
  const launcher = fs.readFileSync('scripts/preflop-deep/run_machine.py', 'utf8');
  const launchFunction = launcher.slice(
    launcher.indexOf('def _launch_approved_solver():'),
    launcher.indexOf('_proc = _launch_approved_solver()'),
  );
  assert.ok(
    launchFunction.indexOf('orchestrate.validate_manifest(')
      < launchFunction.indexOf('subprocess.Popen('),
    'the full manifest/release gate must execute before the solver child can start',
  );
  assert.ok(
    launchFunction.indexOf('orchestrate._worker_request(')
      < launchFunction.indexOf('subprocess.Popen('),
    'the signed active-authority gateway preflight must execute before child launch',
  );
  assert.match(launcher, /threading\.Thread\([\s\S]*target=_pump_solver_stdout/);
  assert.match(launcher, /_stdout_queue\.get\(timeout=remaining\)/);
  assert.match(launcher, /deadline = time\.monotonic\(\) \+ timeout/);
  const boundedRead = launcher.slice(
    launcher.indexOf('def _read_until_end('),
    launcher.indexOf('\ndef pio('),
  );
  assert.doesNotMatch(boundedRead, /_proc\.stdout\.readline\(/);
  assert.match(
    launcher,
    /try:\n    orchestrate\.main\(\)\nfinally:\n    atexit\.unregister\(_cleanup_solver_process\)\n    _cleanup_solver_process/,
  );
  assert.match(launcher, /atexit\.register\(_cleanup_solver_process, _proc\)/);
  assert.match(launcher, /process\.terminate\(\)/);
  assert.match(launcher, /process\.wait\(timeout=grace_seconds\)/);
  assert.match(launcher, /process\.kill\(\)/);
  assert.ok(
    launcher.indexOf('\n_initialize_solver_transport()\n')
      < launcher.indexOf('\norchestrate.pio = pio\n'),
    'END framing and executable-version attestation must precede every solver setup command',
  );
  assert.match(launcher, /_write_solver_line\("set_end_string END"\)/);
  assert.match(launcher, /_write_solver_line\("show_version"\)/);
  assert.match(launcher, /_write_solver_line\("show_hand_order"\)/);
  assert.ok(
    launcher.indexOf('_write_solver_line("show_hand_order")')
      < launcher.indexOf('\norchestrate.pio = pio\n'),
    'live Pio combo order must be attested before any canonical range is sent',
  );
  assert.match(launcher, /pio\("calc_results"\)/);
  assert.doesNotMatch(launcher, /calc_exploitability/);
  assert.match(launcher, /local_launcher_bytes != payloads\["run_machine\.py"\]/);
  assert.match(launcher, /running launcher bytes do not match run_machine\.py at the protected PIPELINE_COMMIT/);
  assert.match(launcher, /if filename == "run_machine\.py":\n        continue/);

  execFileSync('python3', ['-c', String.raw`
import ast, atexit, hashlib, math, os, queue, subprocess, time

source = open('run_machine.py', encoding='utf-8').read()
tree = ast.parse(source)
wanted = {
    'SolverTransportFailure', '_launch_approved_solver',
    '_read_until_end', '_cleanup_solver_process',
    '_reject_legacy_database_environment', '_solver_child_environment',
    '_write_solver_line', '_validate_solver_response',
    '_parse_pio_hand_order', '_outbound_solver_command',
    '_canonicalize_solver_vector_response', '_validate_startup_handshake',
    '_initialize_solver_transport', '_wavg_bb', '_parse_calc_ev_vectors',
    '_parse_calc_results',
    '_assert_calc_results_ev_consistent', 'pio',
}
wanted_assignments = {
    'FORBIDDEN_DATABASE_ENVIRONMENT', 'PIO_CHILD_ENVIRONMENT_ALLOWLIST',
    'SOURCE_COMBO_ORDER_SCHEMA', 'ARTIFACT_COMBO_ORDER',
    'PIO_ACK_COMMANDS', '_last', '_SLOW',
    '_pio_to_canonical_combo_index', '_live_source_combo_order_sha256',
    'CALC_RESULTS_EV_TOLERANCE_CHIPS',
}
nodes = [
    node for node in tree.body
    if ((isinstance(node, ast.ClassDef) or isinstance(node, ast.FunctionDef))
        and node.name in wanted)
    or (isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id in wanted_assignments
                for target in node.targets))
]
module = ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[]))
scope = {
    'atexit': atexit, 'hashlib': hashlib, 'math': math, 'os': os, 'queue': queue,
    'subprocess': subprocess, 'time': time,
}
exec(compile(module, 'run_machine.py', 'exec'), scope)

for forbidden in scope['FORBIDDEN_DATABASE_ENVIRONMENT']:
    try:
        scope['_reject_legacy_database_environment']({forbidden.lower(): 'configured'})
        raise AssertionError('%s was not rejected' % forbidden)
    except SystemExit as error:
        assert forbidden.lower() in str(error)
scope['_reject_legacy_database_environment']({'SUPABASE_URL': '  '})

class HeldManifest:
    def validate_manifest(self, _text):
        raise SystemExit('manifest release gate is closed')

class NoLaunchSubprocess:
    PIPE = object()
    STDOUT = object()
    calls = 0
    @classmethod
    def Popen(cls, *_args, **_kwargs):
        cls.calls += 1
        raise AssertionError('Popen reached behind a closed release gate')

scope.update({
    'manifest_bytes': b'{"release_gate":{"solver_ready":false}}',
    'orchestrate': HeldManifest(),
    'PIO_EXE': 'never-launch.exe',
    'approved_manifest': 'a' * 64,
    'subprocess': NoLaunchSubprocess,
})
try:
    scope['_launch_approved_solver']()
    raise AssertionError('closed release gate was accepted')
except SystemExit as error:
    assert 'release gate is closed' in str(error)
assert NoLaunchSubprocess.calls == 0

class GatewayUnavailable:
    def __init__(self):
        self.requests = []
    def validate_manifest(self, _text):
        return {'version': 4}, 'wrong-shadowed-value'
    def _worker_request(self, operation, payload, version, checksum):
        self.requests.append((operation, payload, version, checksum))
        raise RuntimeError('signed gateway unavailable')

gateway = GatewayUnavailable()
scope['orchestrate'] = gateway
try:
    scope['_launch_approved_solver']()
    raise AssertionError('solver launched without an active-authority preflight')
except RuntimeError as error:
    assert 'signed gateway unavailable' in str(error)
assert NoLaunchSubprocess.calls == 0
assert len(gateway.requests) == 1
assert gateway.requests[0][0] == 'heartbeat'
assert gateway.requests[0][2] == 4
assert gateway.requests[0][3] == 'a' * 64

class GatewayAvailable:
    def validate_manifest(self, _text):
        return {'version': 4}, 'validated-checksum'
    def _worker_request(self, *_args):
        return {'ok': True}

class CaptureSubprocess:
    PIPE = object()
    STDOUT = object()
    kwargs = None
    @classmethod
    def Popen(cls, *_args, **kwargs):
        cls.kwargs = kwargs
        return object()

old_environment = dict(os.environ)
try:
    os.environ.clear()
    os.environ.update({
        'PATH': r'C:\\Windows\\System32',
        'SYSTEMROOT': r'C:\\Windows',
        'SOLVER_WORKER_HMAC_SECRET': 'f' * 64,
        'SUPABASE_SERVICE_ROLE_KEY': 'service-secret',
        'DATABASE_URL': 'postgres://secret',
        'AUTH_TOKEN': 'other-secret',
        'PIO_EXE': 'must-not-be-inherited.exe',
    })
    scope.update({
        'orchestrate': GatewayAvailable(),
        'subprocess': CaptureSubprocess,
        'PIO_EXE': 'approved-pio.exe',
    })
    scope['_launch_approved_solver']()
finally:
    os.environ.clear()
    os.environ.update(old_environment)

child_environment = CaptureSubprocess.kwargs['env']
assert child_environment == {
    'PATH': r'C:\\Windows\\System32',
    'SYSTEMROOT': r'C:\\Windows',
}
assert 'SOLVER_WORKER_HMAC_SECRET' not in child_environment
assert not any(key in child_environment for key in scope['FORBIDDEN_DATABASE_ENVIRONMENT'])

class Stream:
    def __init__(self):
        self.closed = False
        self.writes = []
        self.flushes = 0
    def write(self, value):
        self.writes.append(value)
    def flush(self):
        self.flushes += 1
    def close(self):
        self.closed = True

class Process:
    def __init__(self, exit_code=None, stubborn=False):
        self.exit_code = exit_code
        self.stubborn = stubborn
        self.terminated = 0
        self.killed = 0
        self.waits = []
        self.stdin = Stream()
        self.stdout = Stream()
    def poll(self):
        return self.exit_code
    def terminate(self):
        self.terminated += 1
    def kill(self):
        self.killed += 1
        self.exit_code = -9
    def wait(self, timeout):
        self.waits.append(timeout)
        if self.stubborn and not self.killed:
            raise subprocess.TimeoutExpired('pio', timeout)
        self.exit_code = 0 if self.exit_code is None else self.exit_code
        return self.exit_code

class Reader:
    def __init__(self):
        self.joins = []
    def join(self, timeout):
        self.joins.append(timeout)

def card(index):
    return '23456789TJQKA'[index // 4] + 'cdhs'[index % 4]

canonical_hand_order = [
    card(low) + card(high)
    for high in range(1, 52)
    for low in range(high)
]
assert len(canonical_hand_order) == 1326
# Deliberately use the reverse of Training's artifact order. This proves the
# launcher is mapping data, rather than accepting an accidental identity map.
pio_hand_order = list(reversed(canonical_hand_order))
pio_hand_order_text = ' '.join(pio_hand_order)
pio_hand_order_sha256 = hashlib.sha256(pio_hand_order_text.encode('ascii')).hexdigest()

stdout_queue = queue.Queue()
sentinel = object()
silent_process = Process()
scope.update({
    '_stdout_queue': stdout_queue,
    '_STDOUT_EOF': sentinel,
    '_proc': silent_process,
    'subprocess': subprocess,
})
started = time.monotonic()
try:
    scope['_read_until_end'](False, 0.02)
    raise AssertionError('silent solver did not time out')
except scope['SolverTransportFailure'] as error:
    assert "timeout waiting for solver 'END'" in str(error)
assert time.monotonic() - started < 0.5

exited_process = Process(exit_code=17)
scope['_proc'] = exited_process
scope['_stdout_queue'] = queue.Queue()
scope['_stdout_queue'].put(sentinel)
try:
    scope['_read_until_end'](False, 0.1)
    raise AssertionError('closed solver stdout was accepted')
except scope['SolverTransportFailure'] as error:
    assert 'exit code 17' in str(error)

scope['_proc'] = Process()
scope['_stdout_queue'] = queue.Queue()
scope['_stdout_queue'].put('first line\n')
scope['_stdout_queue'].put('END\n')
assert scope['_read_until_end'](False, 0.1) == 'first line'

# Asynchronous SOLVER messages have their own framing and cannot be mistaken
# for the response to the command currently waiting on the transport.
scope['_stdout_queue'] = queue.Queue()
for line in ['SOLVER: started\n', 'SOLVER:\n', 'running time: 1\n', 'END\n',
             'is_ready ok!\n', 'END\n']:
    scope['_stdout_queue'].put(line)
assert scope['_read_until_end'](False, 0.1) == 'is_ready ok!'

# The very first wire command installs END framing; only after that succeeds
# may show_version attest the live executable against the approved value.
handshake_process = Process()
handshake_reader = Reader()
scope.update({
    '_proc': handshake_process,
    '_stdout_reader': handshake_reader,
    '_stdout_queue': queue.Queue(),
    'approved_solver_version': 'PioSOLVER-edge 3.10.0 approved',
    'approved_source_combo_order_sha256': pio_hand_order_sha256,
    '_ph': type('Harvester', (), {
        'COMBO_ORDER': scope['ARTIFACT_COMBO_ORDER'],
    })(),
})
for line in ['startup banner\n', 'ERROR code 0:\n', 'OK!\n', 'Activation ok!\n',
             'set_end_string ok!\n', 'END\n',
             'PioSOLVER-edge 3.10.0 approved\n', 'END\n',
             pio_hand_order_text + '\n', 'END\n']:
    scope['_stdout_queue'].put(line)
scope['_initialize_solver_transport'](0.1)
assert handshake_process.stdin.writes == [
    'set_end_string END\n', 'show_version\n', 'show_hand_order\n',
]
assert handshake_process.terminated == 0
assert scope['_live_source_combo_order_sha256'] == pio_hand_order_sha256
assert scope['_pio_to_canonical_combo_index'] == list(reversed(range(1326)))
assert os.environ['PIO_SOURCE_COMBO_ORDER_SCHEMA'] == 'piosolver.show_hand_order.v1'
assert os.environ['PIO_SOURCE_COMBO_ORDER_SHA256'] == pio_hand_order_sha256

for corrupt_hand_order in [
    ' '.join(pio_hand_order[:-1]),
    ' '.join([pio_hand_order[0], *pio_hand_order[1:-1], pio_hand_order[0]]),
    'AcAc ' + ' '.join(pio_hand_order[1:]),
    'zzzz ' + ' '.join(pio_hand_order[1:]),
]:
    try:
        scope['_parse_pio_hand_order'](corrupt_hand_order)
        raise AssertionError('malformed show_hand_order was accepted')
    except scope['SolverTransportFailure']:
        pass

canonical_range_tokens = [str(index) for index in range(1326)]
canonical_range_command = 'set_range OOP ' + ' '.join(canonical_range_tokens)
wire_range_command = scope['_outbound_solver_command'](canonical_range_command)
assert wire_range_command.split()[2:] == list(reversed(canonical_range_tokens))
pio_vector = ' '.join(str(index) for index in range(1326))
canonical_vector = scope['_canonicalize_solver_vector_response'](
    'show_strategy r:0', pio_vector,
)
assert canonical_vector.split() == list(reversed(canonical_range_tokens))
canonical_ev_vector = scope['_canonicalize_solver_vector_response'](
    'calc_ev OOP r:0', pio_vector,
)
assert canonical_ev_vector.split() == list(reversed(canonical_range_tokens))

# A missing terminator/version acknowledgement fails closed and reaps the
# child immediately instead of waiting for interpreter shutdown.
bad_version_process = Process()
bad_version_reader = Reader()
scope.update({
    '_proc': bad_version_process,
    '_stdout_reader': bad_version_reader,
    '_stdout_queue': queue.Queue(),
})
for line in ['set_end_string ok!\n', 'END\n', 'approved\n', 'extra\n', 'END\n']:
    scope['_stdout_queue'].put(line)
try:
    scope['_initialize_solver_transport'](0.1)
    raise AssertionError('extra show_version output was accepted')
except scope['SolverTransportFailure'] as error:
    assert 'show_version does not match' in str(error)
assert bad_version_process.terminated == 1 and bad_version_process.stdin.closed

missing_end_process = Process()
missing_end_reader = Reader()
scope.update({
    '_proc': missing_end_process,
    '_stdout_reader': missing_end_reader,
    '_stdout_queue': queue.Queue(),
})
scope['_stdout_queue'].put('set_end_string ok!\n')
try:
    scope['_initialize_solver_transport'](0.01)
    raise AssertionError('handshake without END was accepted')
except scope['SolverTransportFailure'] as error:
    assert "timeout waiting for solver 'END'" in str(error)
assert missing_end_process.terminated == 1 and missing_end_process.stdin.closed

# Every setup acknowledgement is exact and every canonical ERROR is fatal.
command_process = Process()
scope.update({'_proc': command_process, '_stdout_queue': queue.Queue()})
scope['_stdout_queue'].put('set_board ok!\n')
scope['_stdout_queue'].put('END\n')
assert scope['pio']('set_board AsKdQc') == 'set_board ok!'
scope['_stdout_queue'] = queue.Queue()
scope['_stdout_queue'].put('set_range ok!\n')
scope['_stdout_queue'].put('END\n')
assert scope['pio'](canonical_range_command) == 'set_range ok!'
assert command_process.stdin.writes[-1].split()[2:] == list(reversed(canonical_range_tokens))
assert scope['_last']['OOP'] == [float(value) for value in canonical_range_tokens]
scope['_stdout_queue'] = queue.Queue()
scope['_stdout_queue'].put(pio_vector + '\n')
scope['_stdout_queue'].put('END\n')
assert scope['pio']('show_strategy r:0').split() == list(reversed(canonical_range_tokens))
scope['_stdout_queue'] = queue.Queue()
scope['_stdout_queue'].put(pio_vector + '\n')
scope['_stdout_queue'].put('END\n')
assert scope['pio']('calc_ev OOP r:0').split() == list(reversed(canonical_range_tokens))
scope['_stdout_queue'] = queue.Queue()
scope['_stdout_queue'].put('unexpected ok!\n')
scope['_stdout_queue'].put('END\n')
try:
    scope['pio']('set_pot 0 0 550')
    raise AssertionError('wrong setup acknowledgement was accepted')
except scope['SolverTransportFailure'] as error:
    assert 'invalid acknowledgement' in str(error)
scope['_last'] = {'OOP': ['old'], 'IP': None}
scope['_stdout_queue'] = queue.Queue()
scope['_stdout_queue'].put('ERROR: invalid range\n')
scope['_stdout_queue'].put('END\n')
try:
    scope['pio'](canonical_range_command)
    raise AssertionError('Pio ERROR response was accepted')
except scope['SolverTransportFailure'] as error:
    assert 'rejected set_range' in str(error)
assert scope['_last']['OOP'] == ['old'], 'failed setup must not relabel stale tree state'
try:
    scope['_validate_solver_response']('set_board AsKdQc', '[ERROR] invalid board')
    raise AssertionError('bracketed Pio ERROR response was accepted')
except scope['SolverTransportFailure']:
    pass

# calc_ev's second vector is matchup mass after blocker removal. It—not the
# original range—is the correct aggregation weight. This deliberately differs
# from a naive 50/50 range-weighted result.
ev_vector = [0.0] * 1326
ev_vector[1] = 100.0
matchup_vector = [0.0] * 1326
matchup_vector[0] = 1.0
matchup_vector[1] = 3.0
calc_ev_text = ' '.join(str(value) for value in ev_vector) + '\n' \
    + ' '.join(str(value) for value in matchup_vector)
parsed_ev, parsed_matchups = scope['_parse_calc_ev_vectors'](calc_ev_text)
assert scope['_wavg_bb'](parsed_ev, parsed_matchups) == 0.75
assert scope['_wavg_bb'](parsed_ev, [1.0, 1.0] + [0.0] * 1324) == 0.5
try:
    scope['_wavg_bb']([float('nan')] + [0.0] * 1325, [1.0] + [0.0] * 1325)
    raise AssertionError('non-finite live EV was silently dropped from matchup weighting')
except RuntimeError as error:
    assert 'non-finite live value' in str(error)
for corrupt_calc_ev in [
    ' '.join(str(value) for value in ev_vector),
    calc_ev_text + '\n' + ' '.join('0' for _ in range(1326)),
    ' '.join(str(value) for value in ev_vector) + '\n' + ' '.join(
        ['-1', *['0'] * 1325]
    ),
]:
    try:
        scope['_parse_calc_ev_vectors'](corrupt_calc_ev)
        raise AssertionError('malformed calc_ev vectors were accepted')
    except RuntimeError:
        pass

summary = scope['_parse_calc_results']('''running time: 52.977
EV OOP: 181.767
EV IP: 293.233
OOP's MES: 242.008
IP's MES: 343.408
Exploitable for: 55.209''')
assert summary['exploitability_chips'] == 55.209
assert summary['running_time_seconds'] == 52.977
scope['_assert_calc_results_ev_consistent'](1.81767, 2.93233, summary)
try:
    scope['_assert_calc_results_ev_consistent'](1.9, 2.93233, summary)
    raise AssertionError('mismatched vector/summary EV was accepted')
except scope['SolverTransportFailure'] as error:
    assert 'EV OOP' in str(error)
for corrupt in [
    "running time: 1\nEV OOP: 2",
    "running time: 1\nEV OOP: 2\nEV IP: 3\nOOP's MES: 4\nIP's MES: 5\nExploitable for: nan",
    "running time: 1\nEV OOP: 2\nEV IP: 3\nOOP's MES: 4\nIP's MES: 5\nExploitable for: -1",
    "running time: 1\nEV OOP: 2\nEV IP: 3\nOOP's MES: 4\nIP's MES: 5\nUnknown: 6",
]:
    try:
        scope['_parse_calc_results'](corrupt)
        raise AssertionError('malformed calc_results was accepted')
    except RuntimeError:
        pass

normal = Process()
reader = Reader()
scope['_cleanup_solver_process'](normal, reader, 0.01)
assert normal.terminated == 1 and normal.killed == 0
assert normal.stdin.closed and normal.stdout.closed and reader.joins == [1]

stubborn = Process(stubborn=True)
scope['_cleanup_solver_process'](stubborn, None, 0.01)
assert stubborn.terminated == 1 and stubborn.killed == 1
assert len(stubborn.waits) == 2 and stubborn.stdin.closed and stubborn.stdout.closed

# Model the launcher's finally path: a fatal no-output deadline still reaps the
# child instead of being swallowed by orchestrate's per-board Exception guard.
timed_out = Process()
scope['_proc'] = timed_out
scope['_stdout_queue'] = queue.Queue()
try:
    try:
        scope['_read_until_end'](False, 0.01)
    finally:
        scope['_cleanup_solver_process'](timed_out, None, 0.01)
except scope['SolverTransportFailure']:
    pass
assert timed_out.terminated == 1 and timed_out.stdin.closed and timed_out.stdout.closed
`], { cwd: 'scripts/preflop-deep', encoding: 'utf8' });
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
  assert.match(orchestrator, /not states\[target\[4\]\]\["certified"\]/);
  assert.match(orchestrator, /def certified_row\(r,/);
});

test('phase digest binds exact solve inputs beyond family and stack', () => {
  const orchestrator = fs.readFileSync('scripts/preflop-deep/orchestrate.py', 'utf8');
  assert.match(orchestrator, /PHASE_CONTRACT_FIELDS = \(/);
  for (const field of [
    'streets', 'pot_chips', 'eff_chips', 'rake', 'accuracy_fraction',
    'ip_range_checksum', 'oop_range_checksum', 'ip_player', 'oop_player', 'harvest',
  ]) {
    assert.match(orchestrator, new RegExp(`"${field}"`));
  }
  assert.match(orchestrator, /declared_phase_specs != expected_phase_specs/);
  assert.match(orchestrator, /declared_phase_digest != phase_contracts_checksum/);
  assert.match(orchestrator, /phase_contract_by_id\[phase_id\]/);
});

test('solver writer functionally binds certification to one exact active release and one row', () => {
  const code = String.raw`
import hashlib, json, os, sys, tempfile
sys.path.insert(0, '.')
for key in list(os.environ):
    if key.upper() in {
        'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_KEY',
        'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_ANON_KEY',
        'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_DB_URL',
        'SUPABASE_CONNECTION_POOL_URL', 'SUPABASE_DB_HOST', 'SUPABASE_DB_PORT',
        'SUPABASE_DB_USER', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DB_NAME',
        'SUPABASE_DB_SSL', 'SUPABASE_DB_CA', 'SUPABASE_JWT_SECRET',
        'SUPABASE_PROJECT_REF', 'FALLBACK_SUPABASE_URL', 'SUPABASE_URL_FALLBACK',
        'SUPABASE_URL_WITH_PASS', 'DATABASE_URL', 'DIRECT_URL', 'POSTGRES_URL',
        'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_PASSWORD',
        'PG_PASSWORD', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD',
    }:
        os.environ.pop(key, None)
os.environ.update({
    'SOLVER_WORKER_API_URL': 'https://smarter.poker/api/training/solver-worker',
    'SOLVER_WORKER_HMAC_SECRET': 'f' * 64,
    'PIPELINE_COMMIT': 'a' * 40,
    'PIO_SOLVER_VERSION': 'Pio-3.0-approved',
    'PIO_BINARY_CHECKSUM': 'b' * 64,
    'APPROVED_MANIFEST_CHECKSUM': 'c' * 64,
    'RANGE_DIRECTORY': '.',
})
import orchestrate as o

canonical_vector = {
    'strategy_matrix_v2': {
        'unicode': 'é😀',
        'position': 'BB',
        'nested': {'unit': 1.0, 'negative_zero': -0.0, 'a': 1e-7, 'A': 1e20},
        'frequencies': {'b525': [0.000001, 0.999999], 'c': [-0.0, 1.0]},
        'hand_evs_bb': [-12.3457, 0.125],
        'array': [True, None, 'line\n"quote"\\tail', -1.25e-7, 123],
        'combo_order': 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325',
    },
    'scenario_hash': 'unicode-é😀',
}
canonical_text = o.canonical_jsonb_text_v1(canonical_vector)
assert canonical_text == '{"scenario_hash":"unicode-é😀","strategy_matrix_v2":{"array":[true,null,"line\\n\\"quote\\"\\\\tail",-0.000000125,123],"combo_order":"card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325","frequencies":{"b525":[0.000001,0.999999],"c":[0.0,1.0]},"hand_evs_bb":[-12.3457,0.125],"nested":{"A":100000000000000000000,"a":0.0000001,"negative_zero":0.0,"unit":1.0},"position":"BB","unicode":"é😀"}}'
assert hashlib.sha256(canonical_text.encode('utf-8')).hexdigest() == 'db0bdf0ad8539d03e3dab9818577078d819dc2150a98a19ac6debecad1dd1b99'
try:
    o.canonical_jsonb_text_v1(float('nan'))
    raise AssertionError('non-finite artifact number was accepted')
except ValueError as error:
    assert 'finite JSON numbers' in str(error)

row = {
      'id': '70000000-0000-4000-8000-000000000007',
      'scenario_hash': 'hu_cash_BB_100bb_AsKdQc',
      'game_type': 'hu_cash',
      'stack_depth': 100,
      'street': 'flop',
      'admitted': True,
    'solved_v2_at': '2026-09-01T00:00:00Z',
    'quality_status': 'validated',
    'solver_version': 'Pio-3.0-approved',
    'solver_binary_checksum': 'b' * 64,
    'machine_id': 'M1',
    'pipeline_commit': 'a' * 40,
    'manifest_version': '5',
    'manifest_checksum': 'd' * 64,
    'source_artifact_checksum': 'e' * 64,
    'audited_at': '2026-09-01T00:00:00Z',
}
assert o.certified_row(row, 5, 'd' * 64, row['scenario_hash'])
assert not o.certified_row({**row, 'pipeline_commit': 'f' * 40}, 5, 'd' * 64, row['scenario_hash'])
assert not o.certified_row({**row, 'manifest_checksum': 'f' * 64}, 5, 'd' * 64, row['scenario_hash'])
assert not o.certified_row({**row, 'solver_version': 'different'}, 5, 'd' * 64, row['scenario_hash'])

calls = []
def worker_request(operation, payload, manifest_version, manifest_checksum):
    calls.append((operation, payload, manifest_version, manifest_checksum))
    if operation == 'row_states':
        return {'success': True, 'operation': operation, 'rows': [
            row, {**row, 'id': '80000000-0000-4000-8000-000000000008'}
        ]}
    if operation == 'ingest_artifact':
        artifact = payload['artifact']
        return {'success': True, 'operation': operation, 'receipt': {
            'artifact_id': artifact['id'],
            'scenario_hash': artifact['scenario_hash'],
            'source_artifact_checksum': artifact['source_artifact_checksum'],
            'replayed': False,
        }}
    raise AssertionError(operation)
o._worker_request = worker_request
state = o.row_state(row['scenario_hash'], 5, 'd' * 64)
assert state == {'count': 2, 'row_id': None, 'certified': False}
assert calls[0] == ('row_states', {'scenario_hashes': [row['scenario_hash']]}, 5, 'd' * 64)

matrix = {'node': 'r:0', 'frequencies': {'c': [1.0]}, 'hand_evs_bb': [1.0]}
assert o.patch_v2(row['id'], row['scenario_hash'], 'hu_cash', 100, 'flop', matrix, 5, 'd' * 64)
operation, payload, version, checksum = calls[-1]
assert operation == 'ingest_artifact'
assert version == 5 and checksum == 'd' * 64
artifact = payload['artifact']
assert set(artifact) == {
    'audited_at', 'game_type', 'id', 'machine_id', 'manifest_checksum',
    'manifest_version', 'pipeline_commit', 'quality_status', 'scenario_hash',
    'solved_v2_at', 'solver_binary_checksum', 'solver_version',
    'source_artifact_checksum', 'stack_depth', 'strategy_matrix_v2', 'street'
}
assert artifact['id'] == row['id']
assert artifact['game_type'] == 'hu_cash'
assert artifact['stack_depth'] == 100
assert artifact['street'] == 'flop'
assert artifact['machine_id'] == 'M1'
assert artifact['solved_v2_at'] == artifact['audited_at']
expected_source = hashlib.sha256(o.canonical_jsonb_text_v1({
    'scenario_hash': row['scenario_hash'], 'strategy_matrix_v2': matrix,
}).encode('utf-8')).hexdigest()
assert artifact['source_artifact_checksum'] == expected_source

with tempfile.TemporaryDirectory() as directory:
    o.RANGE_DIRECTORY = directory
    payload = ('nan ' * 1326).strip().encode()
    path = os.path.join(directory, 'bad.txt')
    open(path, 'wb').write(payload)
    try:
        o.load_range('bad.txt', hashlib.sha256(payload).hexdigest())
        raise AssertionError('non-finite range was accepted')
    except SystemExit as error:
        assert 'not a valid 1326-combo weight vector' in str(error)
`;
  execFileSync('python3', ['-c', code], {
    cwd: 'scripts/preflop-deep',
    encoding: 'utf8',
  });
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
        ranks, suits = '23456789TJQKA', 'cdhs'
        board = {'As', 'Kd', 'Qc', 'Jh', '2s'}
        vectors = [[], []]
        for high in range(1, 52):
            for low in range(high):
                blocked = {
                    ranks[low // 4] + suits[low % 4],
                    ranks[high // 4] + suits[high % 4],
                } & board
                vectors[0].append(0.0 if blocked else 0.4)
                vectors[1].append(0.0 if blocked else 0.6)
        return ' '.join(map(str, vectors[0])) + '\n' + ' '.join(map(str, vectors[1]))
    if command.startswith('calc_ev'):
        return '125 ' * 1326
    raise AssertionError(command)
scenario_hash, matrix = h.harvest_node(
    pio, 'r:0', 'OOP', 'AsKdQcJh2s', 'BB', 'BB', 'BTN',
    1.25, 2.5, 0.3, 700, 19300, '0.05 10', 'river', 'hu_cash', 200,
    0.005, 'a' * 64, 'b' * 64, 'c' * 64, 'd' * 64,
)
assert scenario_hash == 'river_hu_cash_BB_200bb_AsKdQcJh2s'
assert matrix['street'] == 'river'
assert matrix['pot_bb'] == 7
assert matrix['eff_stack_bb'] == 193
assert matrix['rake'] == '0.05 10'
assert matrix['actions'][1]['size_chips'] == 400
assert matrix['actions'][1]['size_semantics'] == 'cumulative_postflop_contribution_target'
assert matrix['actions'][1]['size_pct'] is None
assert h.action_meta('c', False) == {'code': 'c', 'key': 'check', 'size_pct': 0}
assert h.action_meta('c', True) == {'code': 'c', 'key': 'call', 'size_pct': 0}
assert h.action_meta('b900', True) == {
    'code': 'b900',
    'key': 'raise_chips_900',
    'size_chips': 900,
    'size_semantics': 'cumulative_postflop_contribution_target',
    'size_pct': None,
}
assert h.validate_row(matrix)['ev_ok'] is True
assert h.validate_row({**matrix, 'exploitability_pct': float('inf')})['ev_ok'] is False
assert h.validate_row({**matrix, 'frequencies': {'c': [1.0], 'b400': [0.0]}})['ev_ok'] is False
try:
    h.parse_strategy(('0.4 ' * 1325) + '\n' + ('0.6 ' * 1326), ['c', 'b400'])
    raise AssertionError('short strategy vector was accepted')
except ValueError as error:
    assert '1326 finite values' in str(error)
os.environ.update({
    'SOLVER_WORKER_API_URL': 'https://smarter.poker/api/training/solver-worker',
    'SOLVER_WORKER_HMAC_SECRET': 'f' * 64,
    'PIPELINE_COMMIT': 'a' * 40,
    'PIO_SOLVER_VERSION': 'test',
    'PIO_BINARY_CHECKSUM': 'b' * 64,
    'APPROVED_MANIFEST_CHECKSUM': 'c' * 64,
    'RANGE_DIRECTORY': '.',
})
for key in list(os.environ):
    if key.upper() in {
        'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_KEY',
        'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_ANON_KEY',
        'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_DB_URL',
        'SUPABASE_CONNECTION_POOL_URL', 'SUPABASE_DB_HOST', 'SUPABASE_DB_PORT',
        'SUPABASE_DB_USER', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DB_NAME',
        'SUPABASE_DB_SSL', 'SUPABASE_DB_CA', 'SUPABASE_JWT_SECRET',
        'SUPABASE_PROJECT_REF', 'FALLBACK_SUPABASE_URL', 'SUPABASE_URL_FALLBACK',
        'SUPABASE_URL_WITH_PASS', 'DATABASE_URL', 'DIRECT_URL', 'POSTGRES_URL',
        'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_PASSWORD',
        'PG_PASSWORD', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD',
    }:
        os.environ.pop(key, None)
import orchestrate
phase = {'game_type': 'hu_cash', 'stack': 100, 'pot_chips': 550,
         'streets': ['river'], 'harvest': [{'hero': 'OOP', 'position': 'BB'}]}
targets = orchestrate.expand_targets(phase, 'AsKdQc')
assert len(targets) == 49 * 48
assert all(target[0].startswith('r:0:c:b412:c:') for target in targets)
assert all(':c:b1442:c:' in target[0] for target in targets)
assert orchestrate.node_templates(550, 9750)['targets'] == {
    'flop': 412, 'turn': 1442, 'river': 4018,
}
assert abs((1442 - 412) / (550 + 2 * 412) - 0.75) < 0.001
assert abs((4018 - 1442) / (550 + 2 * 412 + 2 * (1442 - 412)) - 0.75) < 0.001
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
  assert.match(reseeder, /Pio cache question construction is permanently retired/);
  assert.match(runtime, /&& Number\.isFinite\(handEVs\[h\]\)/);
  assert.doesNotMatch(runtime, /const heroHandEV = handEVs\[heroHand\] \|\| 0;/);
  assert.doesNotMatch(reseeder, /const heroHandEV = handEVs\[heroHand\] \|\| 0;/);
});

test('the shared v2 bridge rejects partially corrupt solver rows', () => {
  const bridge = fs.readFileSync('src/utils/v2Matrix.js', 'utf8');
  assert.match(bridge, /v2\.combo_order !== V2_COMBO_ORDER/);
  assert.match(bridge, /if \(codes\.length < 2 \|\| evs\.length !== 1326\) return null;/);
  assert.match(bridge, /if \(!Number\.isFinite\(v\) \|\| v < 0 \|\| v > 1\) return null;/);
  assert.match(bridge, /Math\.abs\(total - 1\) > V2_FREQUENCY_SUM_TOLERANCE \+ floatingPointSlack/);
});

test('v2 bridge functionally fails closed on one corrupt live combo', async () => {
  const {
    V2_ACTION_SIZE_SEMANTICS,
    deriveNodePotState,
    v2ToAppMatrix,
  } = await import('../src/utils/v2Matrix.js');
  const matrix = {
    combo_order: 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325',
    range_combo_order: 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325',
    source_combo_order_schema: 'piosolver.show_hand_order.v1',
    source_combo_order_sha256: '1'.repeat(64),
    oop_range_checksum: '2'.repeat(64),
    ip_range_checksum: '3'.repeat(64),
    training_game_contracts_sha256: '4'.repeat(64),
    actions: ['c', 'b1442'],
    frequencies: {
      c: new Array(1326).fill(0.4),
      b1442: new Array(1326).fill(0.6),
    },
    hand_evs_bb: new Array(1326).fill(1.25),
    pot_bb: 5.5,
    eff_stack_bb: 97.5,
    node: 'r:0:c:b412:c:3c:c',
    board: ['Ah', 'Kd', '2c', '3c'],
    street: 'turn',
    hero: 'IP',
    position: 'BTN',
    oop_player: 'BB',
    ip_player: 'BTN',
    rake: '0 0',
    tree_geometry: 'srp_parameterized_v2',
    solver: 'PioSOLVER',
    exploitability_pct: 0.05,
    convergence: {
      schema: 'piosolver.calc-results.v1',
      source_command: 'calc_results',
      accuracy_fraction: 0.001,
      starting_pot_chips: 550,
      achieved_exploitability_chips: 0.275,
      achieved_exploitability_fraction: 0.0005,
    },
  };
  const bridged = v2ToAppMatrix(matrix);
  assert.ok(bridged);
  assert.deepEqual(deriveNodePotState(matrix.node, 550), {
    potChips: 1374,
    facingBetChips: 0,
    actor: 1,
    actorContributionChips: 412,
    opponentContributionChips: 412,
    streetBaselineChips: 412,
    actorStreetContributionChips: 0,
    opponentStreetContributionChips: 0,
    lastFullRaiseSizeChips: 0,
    wagerIsAllIn: false,
    raiseReopened: true,
  });
  assert.equal(bridged.pot, 1374);
  assert.equal(bridged.pot_bb, 13.74);
  assert.equal(bridged.node_state_exact, true);
  assert.equal(bridged.last_full_raise_size_chips, 0);
  assert.equal(bridged.wager_is_all_in, false);
  assert.equal(bridged.raise_reopened, true);
  const explicitActionSemantics = {
    ...matrix,
    actions: [
      { code: 'c', key: 'check', size_pct: 0 },
      {
        code: 'b1442',
        key: 'bet_chips_1442',
        size_chips: 1442,
        size_semantics: V2_ACTION_SIZE_SEMANTICS,
        size_pct: null,
      },
    ],
  };
  assert.ok(v2ToAppMatrix(explicitActionSemantics));
  explicitActionSemantics.actions[1].size_semantics = 'increment_at_current_node';
  assert.equal(v2ToAppMatrix(explicitActionSemantics), null,
    'runtime must reject metadata that contradicts the harvester cumulative-target contract');
  explicitActionSemantics.actions[1].size_semantics = V2_ACTION_SIZE_SEMANTICS;
  explicitActionSemantics.actions[1].size_chips = 1443;
  assert.equal(v2ToAppMatrix(explicitActionSemantics), null,
    'runtime must reject a compatibility size_chips value that disagrees with its raw token');
  assert.deepEqual(
    deriveNodePotState('r:0:c:b412:c:3c:b1442', 550),
    {
      potChips: 2404,
      facingBetChips: 1030,
      actor: 1,
      actorContributionChips: 412,
      opponentContributionChips: 1442,
      streetBaselineChips: 412,
      actorStreetContributionChips: 0,
      opponentStreetContributionChips: 1030,
      lastFullRaiseSizeChips: 1030,
      wagerIsAllIn: false,
      raiseReopened: true,
    },
    'turn targets remain cumulative across the runout while pot/facing use the actual increment',
  );
  assert.deepEqual(
    deriveNodePotState('r:0:c:b412:c:3c:b1442:c:4d:c:b4018', 550),
    {
      potChips: 6010,
      facingBetChips: 2576,
      actor: 0,
      actorContributionChips: 1442,
      opponentContributionChips: 4018,
      streetBaselineChips: 1442,
      actorStreetContributionChips: 0,
      opponentStreetContributionChips: 2576,
      lastFullRaiseSizeChips: 2576,
      wagerIsAllIn: false,
      raiseReopened: true,
    },
    'river targets remain cumulative across both prior streets',
  );
  assert.equal(
    deriveNodePotState('r:0:c:b412:3c', 550),
    null,
    'a runout cannot follow an unmatched wager',
  );
  assert.deepEqual(
    deriveNodePotState('r:0', 550, 9750),
    {
      potChips: 550,
      facingBetChips: 0,
      actor: 0,
      actorContributionChips: 0,
      opponentContributionChips: 0,
      streetBaselineChips: 0,
      actorStreetContributionChips: 0,
      opponentStreetContributionChips: 0,
      lastFullRaiseSizeChips: 0,
      wagerIsAllIn: false,
      raiseReopened: true,
    },
    'the untouched Flop root remains a legal OOP decision node',
  );
  assert.deepEqual(
    deriveNodePotState('r:0:c', 550, 9750),
    {
      potChips: 550,
      facingBetChips: 0,
      actor: 1,
      actorContributionChips: 0,
      opponentContributionChips: 0,
      streetBaselineChips: 0,
      actorStreetContributionChips: 0,
      opponentStreetContributionChips: 0,
      lastFullRaiseSizeChips: 0,
      wagerIsAllIn: false,
      raiseReopened: true,
    },
    'a single Flop check reaches the legal IP decision',
  );
  assert.equal(deriveNodePotState('r:0:b500:b200', 550, 9750), null,
    'an aggressive cumulative target below the amount faced is never a raise');
  assert.equal(deriveNodePotState('r:0:r500', 550, 9750), null,
    'rNNN is not a Pio aggressive-action token');
  assert.equal(deriveNodePotState('r:0:b500:r1000', 550, 9750), null,
    'rNNN remains invalid even when the actor is facing a wager');
  for (const malformed of ['r:0:B500', 'r:0:r-500', 'r:0:bet500']) {
    assert.equal(deriveNodePotState(malformed, 550, 9750), null,
      `${malformed} cannot bypass the canonical action-token grammar`);
  }
  assert.equal(deriveNodePotState('r:0:b50', 550, 9750), null,
    'a freely chosen postflop opening wager below one big blind is illegal');
  assert.equal(deriveNodePotState('r:0:b500:b800', 550, 9750), null,
    'a freely chosen re-raise below the prior full-raise size is illegal');
  assert.equal(deriveNodePotState('r:0:b500:b1000', 550, 9750)?.facingBetChips, 500,
    'a full minimum re-raise remains a legal decision path');
  assert.equal(deriveNodePotState('r:0:b500:b800', 550, 800)?.facingBetChips, 300,
    'a short under-minimum raise is legal only when it is the exact all-in target');
  assert.equal(deriveNodePotState('r:0:b500:b800', 550, 800)?.lastFullRaiseSizeChips, 500,
    'a short all-in preserves the prior full-raise size');
  assert.equal(deriveNodePotState('r:0:b500:b800', 550, 800)?.raiseReopened, false,
    'a short all-in never reopens aggressive action');
  const shortAllInPolicy = {
    ...matrix,
    node: 'r:0:b500:b800',
    board: ['Ah', 'Kd', '2c'],
    street: 'flop',
    hero: 'OOP',
    position: 'BB',
    eff_stack_bb: 8,
    actions: ['f', 'c'],
    frequencies: {
      f: new Array(1326).fill(0.5),
      c: new Array(1326).fill(0.5),
    },
  };
  const bridgedShortAllIn = v2ToAppMatrix(shortAllInPolicy);
  assert.ok(bridgedShortAllIn, 'Fold/Call remain legal when facing the exact short all-in');
  assert.equal(bridgedShortAllIn.raise_reopened, false);
  assert.equal(bridgedShortAllIn.wager_is_all_in, true);
  assert.equal(v2ToAppMatrix({
    ...shortAllInPolicy,
    actions: ['f', 'c', 'b900'],
    frequencies: {
      ...shortAllInPolicy.frequencies,
      b900: new Array(1326).fill(0),
    },
  }), null, 'an all-in wager cannot be followed by an advertised re-raise');
  assert.equal(deriveNodePotState('r:0:c:c:c', 550, 9750), null,
    'no action may occur after check-check closes the betting round');
  assert.equal(deriveNodePotState('r:0:Ts', 550, 9750), null,
    'a runout cannot be dealt before the prior betting round closes');
  assert.equal(deriveNodePotState('r:0:c:c:Ts:c:c:Ts', 550, 9750), null,
    'one physical runout card cannot be dealt twice');
  assert.equal(deriveNodePotState('r:00', 550, 9750), null,
    'a root lookalike cannot bypass the exact r:0 grammar');
  assert.equal(deriveNodePotState('r:0::c', 550, 9750), null,
    'an empty path token cannot be silently discarded');

  const facingAllIn = deriveNodePotState(
    'r:0:c:b412:c:2d:b1442:b9750',
    550,
    9750,
  );
  assert.equal(facingAllIn?.potChips, 11742);
  assert.equal(facingAllIn?.facingBetChips, 8308);
  assert.equal(facingAllIn?.actorContributionChips, 1442);
  assert.equal(facingAllIn?.opponentContributionChips, 9750);
  assert.equal(facingAllIn?.lastFullRaiseSizeChips, 8308);
  assert.equal(facingAllIn?.wagerIsAllIn, true);
  assert.equal(facingAllIn?.raiseReopened, false);
  assert.equal(deriveNodePotState(
    'r:0:c:b412:c:2d:b1442:b9750:c',
    550,
    9750,
  ), null, 'an all-in call is terminal, not another decision node');
  assert.equal(deriveNodePotState(
    'r:0:c:b412:c:2d:b1442:b9750:b9800',
    550,
    9750,
  ), null, 'no action can continue beyond the effective-stack all-in target');
  const missingOrder = { ...matrix };
  delete missingOrder.combo_order;
  assert.equal(v2ToAppMatrix(missingOrder), null);
  assert.equal(v2ToAppMatrix({ ...matrix, source_combo_order_sha256: '0'.repeat(64) }), null,
    'a matrix cannot self-attest an absent live Pio hand order');
  assert.equal(v2ToAppMatrix({ ...matrix, range_combo_order: 'piosolver-native' }), null,
    'range arrays must declare the canonical order used before launcher remapping');
  assert.equal(v2ToAppMatrix({ ...matrix, oop_range_checksum: null }), null,
    'artifact identity must retain the approved OOP range checksum');
  assert.equal(v2ToAppMatrix({ ...matrix, rake: '0 0 0 0' }), null,
    'the retired four-value rake shape can never satisfy the PioSOLVER 3 contract');
  assert.equal(v2ToAppMatrix({ ...matrix, rake: '1.01 0' }), null,
    'rake fraction cannot exceed the whole final pot');
  assert.equal(v2ToAppMatrix({ ...matrix, rake: '0.05  100' }), null,
    'rake must be one canonical two-token command payload');
  assert.equal(v2ToAppMatrix({ ...matrix, rake: '0.05 100.5' }), null,
    'PioSOLVER 3 rake cap must be a canonical nonnegative integer chip amount');
  assert.equal(v2ToAppMatrix({ ...matrix, rake: '5e-2 100' }), null,
    'rake fraction cannot use exponent notation in the command contract');
  const illegalOutgoing = {
    ...matrix,
    actions: ['f', 'c', 'b200'],
    frequencies: {
      f: new Array(1326).fill(0.2),
      c: new Array(1326).fill(0.5),
      b200: new Array(1326).fill(0.3),
    },
    node: 'r:0:b500',
    hero: 'IP',
  };
  assert.equal(v2ToAppMatrix(illegalOutgoing), null,
    'r:0:b500 cannot advertise b200 as a legal raise target');
  const nonPioRaiseToken = {
    ...matrix,
    actions: ['c', 'r500'],
    frequencies: {
      c: new Array(1326).fill(0.4),
      r500: new Array(1326).fill(0.6),
    },
    node: 'r:0',
    board: 'AhKd2c',
    street: 'flop',
    hero: 'OOP',
  };
  assert.equal(v2ToAppMatrix(nonPioRaiseToken), null,
    'an open/check node cannot advertise non-Pio rNNN');
  const malformedOutgoing = {
    ...nonPioRaiseToken,
    actions: ['c', 'B500'],
    frequencies: {
      c: new Array(1326).fill(0.4),
      B500: new Array(1326).fill(0.6),
    },
  };
  assert.equal(v2ToAppMatrix(malformedOutgoing), null,
    'outgoing Pio action tokens must use the exact lowercase grammar');
  const missingPassiveBranch = {
    ...matrix,
    actions: ['b200', 'b500'],
    frequencies: {
      b200: new Array(1326).fill(0.4),
      b500: new Array(1326).fill(0.6),
    },
    node: 'r:0',
    board: 'AhKd2c',
    street: 'flop',
    hero: 'OOP',
  };
  assert.equal(v2ToAppMatrix(missingPassiveBranch), null,
    'every nonterminal policy must expose Check/Call');
  const facingWithoutFold = {
    ...missingPassiveBranch,
    actions: ['c', 'b1000'],
    frequencies: {
      c: new Array(1326).fill(0.4),
      b1000: new Array(1326).fill(0.6),
    },
    node: 'r:0:b500',
    hero: 'IP',
  };
  assert.equal(v2ToAppMatrix(facingWithoutFold), null,
    'a policy facing a live wager must expose Fold');
  const facingWithoutCall = {
    ...facingWithoutFold,
    actions: ['f', 'b1000'],
    frequencies: {
      f: new Array(1326).fill(0.4),
      b1000: new Array(1326).fill(0.6),
    },
  };
  assert.equal(v2ToAppMatrix(facingWithoutCall), null,
    'a policy facing a live wager must expose Call');
  assert.equal(v2ToAppMatrix({ ...matrix, street: 'river' }), null,
    'street and board length must agree at the shared JavaScript boundary');
  assert.equal(v2ToAppMatrix({ ...matrix, board: ['Ah', 'Kd', '2c', '4d'] }), null,
    'node runout cards must match the exact board suffix');
  assert.equal(v2ToAppMatrix({
    ...matrix,
    node: 'r:0:c:c:4d:c',
    board: ['Ah', 'Kd', '2c', '3c', '4d'],
    street: 'river',
  }), null, 'a River node cannot expose only one of its two board runout cards');
  assert.equal(v2ToAppMatrix({ ...matrix, board: ['Ah', 'Kd', '2c', '2c'] }), null,
    'the shared JavaScript boundary rejects duplicate board cards');
  assert.equal(v2ToAppMatrix({ ...matrix, board: ['ah', 'Kd', '2c', '3c'] }), null,
    'the shared JavaScript boundary requires canonical card casing');
  const matrixWithFrequencies = (check, bet) => ({
    ...matrix,
    frequencies: {
      c: new Array(1326).fill(check),
      b1442: new Array(1326).fill(bet),
    },
  });
  assert.ok(v2ToAppMatrix(matrixWithFrequencies(0.49999, 0.5)),
    'the exact lower six-decimal rounding boundary remains readable');
  assert.ok(v2ToAppMatrix(matrixWithFrequencies(0.50001, 0.5)),
    'the exact upper six-decimal rounding boundary remains readable');
  assert.equal(v2ToAppMatrix(matrixWithFrequencies(0.49998, 0.5)), null,
    'a live-combo sum below the six-decimal rounding bound fails closed');
  assert.equal(v2ToAppMatrix(matrixWithFrequencies(0.50002, 0.5)), null,
    'a live-combo sum above the six-decimal rounding bound fails closed');
  assert.equal(v2ToAppMatrix(matrixWithFrequencies(-0.000001, 1)), null,
    'a negative action frequency cannot be cancelled by another action');
  assert.equal(v2ToAppMatrix(matrixWithFrequencies(1.000001, 0)), null,
    'an action frequency above one fails before sum normalization');
  matrix.frequencies.b1442[100] = 2;
  assert.equal(v2ToAppMatrix(matrix), null);
  matrix.frequencies.b1442[100] = 0.6;
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

test('targeted solver practice requires exact filters, provenance, and lineage instead of teaching another spot', () => {
  const engine = fs.readFileSync('src/engines/DeterministicGTOEngine.js', 'utf8');
  const patches = fs.readFileSync('src/engines/deterministicEnginePatches.js', 'utf8');
  const fetchSolverPool = patches.slice(
    patches.indexOf('engine.fetchSolverPool ='),
    patches.indexOf('// ●● PATCH 3', patches.indexOf('engine.fetchSolverPool =')),
  );
  assert.match(engine, /if \(targeted\.length === 0\) return curatedFallback\(\);/);
  assert.match(engine, /questions\.length > 0 \? questions : curatedFallback\(\)/);
  assert.doesNotMatch(engine, /sortedScenarios = \[\.\.\.targeted, \.\.\.others\]/);
  assert.match(engine, /matched 0 scenarios; failing closed/);
  assert.match(engine, /Context filter rejected every action/);
  assert.doesNotMatch(engine, /Context filter removed all actions[\s\S]*restoring originals/);
  assert.match(fetchSolverPool, /fetchAdmittedSolverCandidates\(this\.db/);
  assert.match(fetchSolverPool, /game_type: gameConfig\.pioGameType/);
  assert.match(fetchSolverPool, /stack_depth: depth/);
  assert.match(fetchSolverPool, /street,/);
  assert.doesNotMatch(fetchSolverPool, /accept: \(row\) => !street/);
  assert.doesNotMatch(fetchSolverPool, /\.from\('solved_spots_gold'\)/);
  assert.match(fetchSolverPool, /allData = allData\.map\(row => prepareSolverScenarioRow\(row\)\)\.filter\(Boolean\)/);
  assert.match(fetchSolverPool, /if \(allData\.length === 0\) return null/);
  assert.doesNotMatch(
    fetchSolverPool,
    /select\(['"][^'"]*\bstrategy_matrix\b(?![^'"]*\bstrategy_matrix_v2\b)[^'"]*['"]\)/,
    'targeted practice must never select only the unaudited legacy matrix',
  );
  assert.match(patches, /function provenanceIsComplete\(row\)/);
  assert.match(patches, /function rowMatchesContinuationLineage\(row, lineage\)/);
  assert.match(patches, /exactRows\.length === 1/);
});

test('multi-street play requires the exact runout and solver sizing copy uses chip geometry', () => {
  const engine = fs.readFileSync('src/engines/DeterministicGTOEngine.js', 'utf8');
  const patches = fs.readFileSync('src/engines/deterministicEnginePatches.js', 'utf8');
  const nextStreetPatch = patches.slice(
    patches.indexOf('engine.queryNextStreet ='),
    patches.indexOf('return engine;', patches.indexOf('engine.queryNextStreet =')),
  );
  assert.doesNotMatch(nextStreetPatch, /\.from\('training_solver_artifact_catalog'\)/);
  assert.match(nextStreetPatch, /fetchExactAdmittedArtifact\(/);
  assert.match(nextStreetPatch, /scenarioHash: lineage\.childScenarioHash/);
  assert.match(nextStreetPatch, /position: lineage\.heroPosition/);
  assert.match(nextStreetPatch, /street: lineage\.childStreet/);
  assert.doesNotMatch(nextStreetPatch, /\.from\('solved_spots_gold'\)/);
  assert.match(nextStreetPatch, /lineage\.childNode === `\$\{lineage\.parentNode\}:\$\{lineage\.continuationAction\}:c:\$\{lineage\.boardCards\.at\(-1\)\}:c`/);
  assert.match(nextStreetPatch, /orderedExactContinuationCandidates\(data, continuationLineages\)/);
  assert.match(nextStreetPatch, /isSolverRowIdentityValid|prepareSolverScenarioRow/);
  assert.doesNotMatch(nextStreetPatch, /partialMatches|isApproximateBoard|\.ilike\(|semantic match/);
  assert.doesNotMatch(nextStreetPatch, /requestedPot|Math\.abs\(Number\(matrix\.pot_bb\)/);
  assert.match(nextStreetPatch, /pot: childPot/);
  assert.match(nextStreetPatch, /stackDepth: childEffectiveStack/);
  assert.match(nextStreetPatch, /solverStackDepth: requestedStack/);
  assert.match(engine, /solverPotChips,[\s\S]*gameCategory/);
  assert.match(engine, /hasExactSolverPot/);
  assert.match(engine, /Math\.round\(\(parseInt\(sizeMatch\[1\]\) \/ Number\(ctx\.solverPotChips\)\) \* 100\)/);
  assert.match(engine, /nextStreetContinuationAction: continuationBet/);
});

test('live warehouse questions carry a complete provenance seal or remain unverified', () => {
  const patches = fs.readFileSync('src/engines/deterministicEnginePatches.js', 'utf8');
  const reseeder = fs.readFileSync('scripts/reseed-deterministic-cache.js', 'utf8');
  const grader = fs.readFileSync('src/lib/training/solverDecisionEvidence.js', 'utf8');
  const persistence = fs.readFileSync('src/lib/training/cacheTruthPersistence.mjs', 'utf8');
  const policyContract = fs.readFileSync('src/lib/training/solverPolicyContract.js', 'utf8');
  for (const field of [
    'solverVersion', 'solverBinaryChecksum', 'machineId', 'pipelineCommit', 'manifestVersion', 'manifestChecksum',
    'sourceArtifactChecksum', 'qualityStatus', 'auditedAt',
  ]) {
    assert.match(patches, new RegExp(field));
    assert.match(policyContract, new RegExp(field));
    if (field !== 'qualityStatus') assert.match(persistence, new RegExp(field));
  }
  assert.match(persistence, /sourceArtifact: source/);
  assert.match(patches, /LEGACY_UNVERIFIED/);
  assert.match(reseeder, /Pio cache question construction is permanently retired/);
  assert.match(grader, /sourceClassificationForQuestion/);
  assert.match(grader, /isSolverEvidenceClassification/);
  const verifier = grader.slice(
    grader.indexOf('export function isVerifiedSolverQuestion'),
    grader.indexOf('const SOLVER_CLAIM_RE'),
  );
  assert.doesNotMatch(verifier, /solverProvenance/);
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
  assert.equal(isVerifiedSolverQuestion(question), false);
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
  assert.match(cacheBuilder, /Pio cache question construction is permanently retired/);
  assert.doesNotMatch(cacheBuilder, /actionEVs/);
});
