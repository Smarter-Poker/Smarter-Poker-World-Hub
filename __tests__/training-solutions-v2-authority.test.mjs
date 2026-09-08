import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync('pages/hub/training/solutions.js', 'utf8');
const api = fs.readFileSync('pages/api/training/browse-solutions.js', 'utf8');

const EXPECTED_EXPOSED_CONTRACTS = Object.freeze({
  hu_cash: [40, 100, 200],
  postflop_complete: [100],
  mtt_6max_chipev: [10, 20, 40, 100],
});

function exposedGameTypes(source) {
  const block = source.match(/const GAME_TYPES = \[([\s\S]*?)\n\];/)?.[1] || '';
  return [...block.matchAll(/value: '([^']+)'/g)].map((match) => match[1]);
}

function exposedStackDepths(source) {
  const block = source.match(/const STACK_DEPTHS = \{([\s\S]*?)\n\};/)?.[1] || '';
  return Object.fromEntries([...block.matchAll(/(\w+): \[([^\]]*)\]/g)].map((match) => [
    match[1],
    match[2].split(',').map((value) => Number(value.trim())).filter(Number.isFinite),
  ]));
}

test('Solutions exposes only real Training family/stack contracts and requests flop explicitly', () => {
  assert.deepEqual(exposedGameTypes(page), Object.keys(EXPECTED_EXPOSED_CONTRACTS));
  assert.deepEqual(exposedStackDepths(page), EXPECTED_EXPOSED_CONTRACTS);
  assert.match(page, /const BROWSE_STREET = 'flop'/);
  assert.match(page, /street: BROWSE_STREET/);
  assert.doesNotMatch(page, /_icm/,
    'the chip-EV Solutions catalog must not expose unsealed ICM filters');

  for (const [family, stacks] of Object.entries(EXPECTED_EXPOSED_CONTRACTS)) {
    assert.match(
      api,
      new RegExp(`${family}: \\[${stacks.join(', ')}\\]`),
      `${family} does not match the server browse contract`,
    );
  }
  assert.doesNotMatch(page, /turn_spin|river_mtt|spin_3max|spin_hu/);
});

test('Solutions reads only the active serving catalog in one bounded RPC', () => {
  assert.match(api, /training_solver_spot_candidates_v1/);
  assert.match(api, /validateSolverRowIdentity/);
  assert.match(api, /const SOLVER_QUERY_TIMEOUT_MS = 8_000/);
  assert.match(api, /query\.abortSignal\(controller\.signal\)/);
  assert.doesNotMatch(api, /\.from\(['"]solved_spots_gold['"]\)/);
  assert.doesNotMatch(api, /customSolverProvenanceIsComplete/,
    'field-shaped provenance is not a serving-authority check');
});

test('Solutions renders only fields backed by the provenance-complete v2 response', () => {
  for (const unsupported of [
    'CardSelectorModal',
    'RunoutHeatmap',
    'EquityMatchup',
    'SolverLineSummary',
    'BlockerScorePanel',
    'SolverTreeViewer',
    'tree-navigate',
    'runout-report',
    'rangeEquity',
    "colorMode=\"equity\"",
    "colorMode=\"eqr\"",
    "colorMode=\"blocker\"",
  ]) {
    assert.ok(!page.includes(unsupported), `unsupported Solutions feature remains: ${unsupported}`);
  }

  assert.match(page, /\{ key: 'grid', label: '13×13 Grid' \}/);
  assert.match(page, /\{ key: 'ev', label: 'Hand EV' \}/);
  assert.match(page, /\{ key: 'report', label: 'Audited Report' \}/);
  assert.match(page, /showEVOverlay/);
  assert.match(page, /AuditedStrategyReport/);
  assert.match(page, /classifyAllHands/);
  assert.match(page, /groupByClassification/);
  assert.match(page, /\/api\/training\/bookmark-solution/);
});

test('Solutions fails closed unless list and detail provenance contracts validate', () => {
  assert.match(page, /const BROWSE_AUTHORITY = 'provenance_complete_piosolver_v2_only'/);
  assert.match(page, /function isAuditedListResponse\(data, expected\)/);
  assert.match(page, /data\.returnedCount === data\.spots\.length/);
  assert.match(page, /data\.total === null/);
  assert.match(page, /data\.totalIsExact === false/);
  assert.match(page, /typeof data\.hasMore === 'boolean'/);
  assert.match(page, /!isAuditedListResponse\(data, \{ gameType, stackDepth, page \}\)/);
  assert.match(page, /const requestId = \+\+listRequestId\.current/);
  assert.match(page, /requestId !== listRequestId\.current/);
  assert.doesNotMatch(page, /setTotalSpots|setTotalPages|totalSpots|totalPages|data\.total \|\|/);

  assert.match(page, /function isAuditedSpot\(spot\)/);
  assert.match(page, /provenance\?\.verified === true/);
  assert.match(page, /provenance\.source === 'PioSOLVER'/);
  assert.match(page, /provenance\.qualityStatus === 'validated'/);
  assert.match(page, /\^\[0-9a-f\]\{40\}\$\/i\.test\(String\(provenance\.pipelineCommit/);
  assert.match(page, /handEVs\.every\(Number\.isFinite\)/);
  assert.match(page, /!isAuditedSpot\(data\.spot\)/);
  assert.match(page, /const requestId = \+\+detailRequestId\.current/);
  assert.match(page, /requestId !== detailRequestId\.current/);
  assert.match(page, /No Unverified Fallback Will Be Shown/);
  assert.match(page, /No Legacy Or Partial Strategy Will Be Displayed/);
});

test('Solutions pagination never invents a total and provenance is visible', () => {
  assert.match(page, /disabled=\{!hasMore\}/);
  assert.match(page, /Page \{page\} • \{returnedCount\} Returned/);
  assert.match(page, /data-testid=\{spot \? 'solver-provenance-seal' : 'solver-catalog-authority-seal'\}/);
  assert.match(page, /Audited PioSOLVER • Provenance-Complete V2 Only/);
  assert.match(page, /Legacy, Partial, And Unverified Solver Rows Are Never Displayed/);
  assert.match(page, /Solver \{provenance\.solverVersion\} • Machine \{provenance\.machineId\}/);
  assert.match(page, /Manifest \{provenance\.manifestVersion\} • Pipeline \{provenance\.pipelineCommit\.slice\(0, 8\)\}/);
});
