import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const RETIRED_ROUTES = [
  ['pages/api/gto/gto-analysis.js', 'LEGACY_GTO_ANALYSIS_RETIRED'],
  ['pages/api/god-mode/fetch-hand.js', 'LEGACY_GOD_MODE_HAND_DELIVERY_RETIRED'],
  ['pages/api/god-mode/submit-action.js', 'LEGACY_GOD_MODE_GRADING_RETIRED'],
];

function compileRoute(relativePath) {
  const babel = require('@babel/core');
  const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
  const code = babel.transformSync(read(relativePath), {
    babelrc: false,
    configFile: false,
    filename: relativePath,
    plugins: [transformModulesCommonJs],
    sourceType: 'module',
  }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((specifier) => {
    assert.equal(specifier, '../../../src/utils/trainingApiUtils');
    return { withTiming() {} };
  }, module, module.exports);
  return module.exports.default;
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function sourceFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory)) {
      const absolute = join(directory, entry);
      if (statSync(absolute).isDirectory()) walk(absolute);
      else if (/\.(?:js|jsx|ts|tsx)$/.test(entry)) files.push(absolute);
    }
  };
  walk(join(ROOT, root));
  return files;
}

test('legacy solver and God Mode HTTP surfaces are hard retired', () => {
  for (const [file, code] of RETIRED_ROUTES) {
    const source = read(file);
    assert.match(source, /status\(410\)/, file);
    assert.match(source, new RegExp(code), file);
    assert.match(source, /private, no-store, max-age=0/, file);
    assert.doesNotMatch(source, /createClient|\.from\(|getGrokClient|getMockSolverNode|Math\.random/, file);

    const res = response();
    compileRoute(file)({ method: 'POST' }, res);
    assert.equal(res.statusCode, 410, file);
    assert.equal(res.body.success, false, file);
    assert.equal(res.body.code, code, file);
  }
});

test('PIOQueryService is a pure contract registry with no browser data path', () => {
  const source = read('src/services/PIOQueryService.js');
  assert.match(source, /async queryScenarios\(\)[\s\S]*return null;/);
  assert.match(source, /getGameConfig\(gameId\)[\s\S]*const configs = \{/);
  assert.doesNotMatch(source, /from ['"]\.\.\/lib\/supabase|\.from\(|solved_spots_gold|strategy_matrix\b/);
  assert.doesNotMatch(source, /querySolvedSpots|queryMemoryCharts|transformPIOData|getFrequenciesForHand|getEVForHand/);
});

test('retired legacy clients are not imported by a reachable page or component', () => {
  const excluded = new Set([
    'src/components/training/GameSession.tsx',
    'src/components/training/GTOAnalysisPanel.jsx',
  ]);
  const violations = [...sourceFiles('pages'), ...sourceFiles('src')]
    .map((absolute) => [relative(ROOT, absolute), readFileSync(absolute, 'utf8')])
    .filter(([file]) => !excluded.has(file))
    .filter(([, source]) => /(?:from|import\()\s*['"][^'"]*(?:GameSession|GTOAnalysisPanel)['"]/.test(source))
    .map(([file]) => file);
  assert.deepEqual(violations, []);
});

test('retired legacy clients are inert tombstones with no hidden HTTP fallback', () => {
  const session = read('src/components/training/GameSession.tsx');
  const panel = read('src/components/training/GTOAnalysisPanel.jsx');

  assert.match(session, /LEGACY_GAME_SESSION_RETIRED/);
  assert.match(session, /Server-Verified Attempt/);
  assert.doesNotMatch(session, /api\/god-mode\/fetch-hand|api\/god-mode\/submit-action|authedFetch|setTimeout/);

  assert.match(panel, /LEGACY_GTO_ANALYSIS_PANEL_RETIRED/);
  assert.match(panel, /Complete Provenance/);
  assert.doesNotMatch(panel, /api\/gto\/gto-analysis|authedFetch|Analyzing With PioSolver/);
});

test('DiamondEngine cannot resurrect browser-authored Memory Games writes', () => {
  const source = read('src/services/DiamondEngine.js');
  const start = source.indexOf('async logSession(');
  const end = source.indexOf('/**', start);
  const method = source.slice(start, end);
  assert.match(method, /success:\s*false/);
  assert.match(method, /server_authoritative_training_attempt_required/);
  assert.doesNotMatch(method, /\.from\(|insert\(|upsert\(|memory_game_sessions/);
});
