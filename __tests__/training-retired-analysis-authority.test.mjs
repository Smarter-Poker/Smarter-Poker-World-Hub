import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const RETIRED_ENDPOINTS = [
  ['pages/api/gto/explain-hand.js', 'GTO_EXPLANATION_REQUIRES_VERIFIED_ATTEMPT'],
  ['pages/api/gto/render-analysis-card.js', 'GTO_ANALYSIS_CARD_REQUIRES_VERIFIED_EVIDENCE'],
  ['pages/api/gto/analyze-game.js', 'GTO_GAME_ANALYSIS_REQUIRES_VERIFIED_SESSION'],
  ['pages/api/memory/elo.js', 'MEMORY_ELO_MUTATION_RETIRED'],
  ['pages/api/training/horse-opponent.js', 'LEGACY_HORSE_OPPONENT_RETIRED'],
  ['pages/api/training/tree-navigate.js', 'SOLVER_TREE_REQUIRES_AUDITED_NODE_LINEAGE'],
  ['pages/api/training/runout-report.js', 'SOLVER_RUNOUT_REPORT_REQUIRES_AUDITED_LINEAGE'],
  ['pages/api/training/aggregate-report.js', 'SOLVER_AGGREGATE_REPORT_REQUIRES_AUDITED_COHORT'],
];

// SolverPolicyService owns the machine-checkable inventory of retired solver
// surfaces. Its endpoint strings are declarations, not network callers. Keep
// that metadata explicit while continuing to scan every executable consumer.
const AUTHORITY_METADATA_FILES = new Set([
  path.join(ROOT, 'src/services/SolverPolicyService.js'),
]);

function walkJavaScript(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkJavaScript(absolute));
    else if (/\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

test('caller-authored analysis, rank, and disguised-opponent routes are hard retired', () => {
  for (const [relative, code] of RETIRED_ENDPOINTS) {
    const source = read(relative);
    assert.match(source, /status\(410\)/, relative);
    assert.match(source, /private, no-store, max-age=0/, relative);
    assert.match(source, new RegExp(code), relative);
    assert.doesNotMatch(source, /createClient|SUPABASE_SERVICE_ROLE_KEY|Math\.random|\.from\(|\.rpc\(/, relative);
  }
});

test('runtime source has no callers for retired authority endpoints', () => {
  const endpointPaths = [
    '/api/gto/explain-hand',
    '/api/gto/render-analysis-card',
    '/api/gto/analyze-game',
    '/api/memory/elo',
    '/api/training/horse-opponent',
    '/api/training/tree-navigate',
    '/api/training/runout-report',
    '/api/training/aggregate-report',
  ];
  const endpointFiles = new Set(RETIRED_ENDPOINTS.map(([relative]) => path.join(ROOT, relative)));
  const files = [
    ...walkJavaScript(path.join(ROOT, 'pages')),
    ...walkJavaScript(path.join(ROOT, 'src')),
    ...walkJavaScript(path.join(ROOT, 'scripts')),
  ].filter((file) => !endpointFiles.has(file) && !AUTHORITY_METADATA_FILES.has(file));

  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const endpoint of endpointPaths) {
      if (source.includes(endpoint)) offenders.push(`${path.relative(ROOT, file)} -> ${endpoint}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('retired endpoint metadata is declarative and cannot perform network calls', () => {
  const source = read('src/services/SolverPolicyService.js');
  const solverPolicyRetirements = [
    'pages/api/training/tree-navigate.js',
    'pages/api/training/runout-report.js',
    'pages/api/training/aggregate-report.js',
  ];
  for (const relative of solverPolicyRetirements) {
    assert.match(source, new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(source, /\b(?:fetch|authedFetch|axios)\s*\(/);
});

test('manual GTO panel bootstrap and ELO service cannot manufacture evidence', () => {
  const bootstrap = read('scripts/bootstrap-gto-panels.js');
  const elo = read('src/games/ELOService.js');
  assert.match(bootstrap, /intentionally non-operational|is retired/);
  assert.match(bootstrap, /process\.exitCode = 1/);
  assert.doesNotMatch(bootstrap, /solved_spots_gold|fetch\(|createClient/);
  assert.match(elo, /server_authoritative_ranked_match_required/);
  assert.doesNotMatch(elo, /authedFetch|\/api\/memory\/elo|\.rpc\(|\.from\(/);
});
