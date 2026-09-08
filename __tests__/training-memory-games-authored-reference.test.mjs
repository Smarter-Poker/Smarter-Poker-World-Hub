import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const babel = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const GENERATOR_FILE = 'src/games/SolverScenarioGenerator.js';
const DATABASE_FILE = 'src/games/ScenarioDatabase.js';
const PAGE_FILE = 'pages/hub/memory-games.js';
const GENERATOR = read(GENERATOR_FILE);
const DATABASE = read(DATABASE_FILE);
const PAGE = read(PAGE_FILE);

function compile(relativePath, dependencies) {
  const compiled = babel.transformSync(read(relativePath), {
    babelrc: false,
    configFile: false,
    filename: relativePath,
    plugins: [transformModulesCommonJs],
    sourceType: 'module',
  }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `unexpected dependency: ${specifier}`);
    return dependencies[specifier];
  }, module, module.exports);
  return module.exports;
}

const spot = Object.freeze({
  AA: Object.freeze({ raise: 1, call: 0, fold: 0 }),
  '72o': Object.freeze({ raise: 0, call: 0, fold: 1 }),
});
const positions = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const map = (keys) => Object.fromEntries(keys.map((key) => [key, spot]));
const referenceCorpus = {
  RFI: map(positions),
  THREE_BET: map(['BTN_vs_UTG', 'SB_vs_UTG', 'BB_vs_UTG']),
  BB_DEFENSE: map(['vs_UTG', 'vs_CO', 'vs_BTN', 'vs_SB']),
  FOUR_BET: map(['UTG_vs_3bet']),
  SQUEEZE: map(['BTN_vs_UTG_open_MP_call']),
  COLD_CALL: map(['CO_vs_UTG']),
  RFI_20BB: map(positions),
  RFI_50BB: map(positions),
  RFI_200BB: map(positions),
  ALL_HANDS: ['AA', '72o'],
  getHandFrequencies: (range, hand) => range?.[hand] || { raise: 0, call: 0, fold: 1 },
  getRFIByDepth: () => spot,
};

function loadGenerator() {
  return compile(GENERATOR_FILE, {
    '../config/solverRanges': referenceCorpus,
    '../engines/PostflopScenarioGenerator': {
      generateAllPostflopScenarios: () => ({
        8: [{ id: 'flop-local', level: 8, street: 'flop', practiceOnly: true, authority: 'illustrative_local_heuristic' }],
        9: [],
        10: [],
      }),
    },
  });
}

test('Range Lab authority-boundary sources parse', () => {
  for (const [file, source] of [[GENERATOR_FILE, GENERATOR], [DATABASE_FILE, DATABASE], [PAGE_FILE, PAGE]]) {
    assert.doesNotThrow(() => parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
    }), file);
  }
});

test('every generated Levels 1-7 range carries explicit authored-practice provenance', () => {
  const generator = loadGenerator();
  const catalog = generator.generateAllSolverScenarios();
  const scenarios = [1, 2, 3, 4, 5, 6, 7].flatMap((level) => {
    assert.ok(catalog[level].length > 0, `level ${level} fixture must generate a scenario`);
    return catalog[level];
  });

  for (const scenario of scenarios) {
    assert.equal(scenario.authority, 'authored_local_reference');
    assert.equal(scenario.authorityStatus, 'practice_only');
    assert.equal(scenario.practiceOnly, true);
    assert.equal(scenario.solverGenerated, false);
    assert.equal(scenario.solverVerified, false);
    assert.match(scenario.evidenceDisclosure, /authored local preflop reference/i);
  }

  assert.ok(generator.pickWeightedHandFromScenario(catalog[1][0]), 'authored preflop practice remains playable');
  assert.equal(generator.pickWeightedHandFromScenario(catalog[8][0]), null, 'postflop heuristic cannot enter preflop grading');
});

test('the live Range Lab never presents the authored corpus as solver-exact authority', () => {
  assert.doesNotMatch(GENERATOR, /solverGenerated:\s*true/);
  assert.doesNotMatch(DATABASE, /PioSolver GTO data|fully solver-accurate/i);
  assert.doesNotMatch(PAGE, /Core GTO Training|GTO RANGE COMMAND|Master GTO Ranges|Current GTO grade/i);

  assert.match(PAGE, /Authored Range Practice/);
  assert.match(PAGE, /No Solver-Exact Or Account-Progress Claim/);
  assert.match(PAGE, /Free Local Practice \/ No Entry Fee/);
  assert.match(PAGE, /browser-owned answer map/);
  assert.match(PAGE, /cannot author sessions, ELO, challenge completions/);
  assert.match(PAGE, /if \(!user\?\.id && economyReady\) DiamondEngine\.award\(totalReward\)/);
});
