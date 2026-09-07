import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const STRATEGY = read('src/engines/PostflopStrategyEngine.js');
const SCENARIOS = read('src/engines/PostflopScenarioGenerator.js');
const MASTER = read('src/games/SolverScenarioGenerator.js');
const DATABASE = read('src/games/ScenarioDatabase.js');
const DETERMINISTIC = read('src/engines/DeterministicGTOEngine.js');
const LOOKUP_TABLES = read('src/config/postflopSolverData.js');
const GAME_ENGINE = read('src/games/GameEngine.js');
const MEMORY = read('pages/hub/memory-games.js');
const JARVIS = read('src/components/memory-games/JarvisExplanationDialog.jsx');
const TABLE = read('src/components/training/games/UniversalDynamicTable.jsx');
const ADAPTIVE = read('pages/api/gto/generate-adaptive.js');
const EV = read('src/engines/EVCalculator.js');
const HAND_ANALYZER = read('src/engines/HandAnalyzer.js');
const ACTION_TREE = read('src/engines/ActionTreeEngine.js');
const RUNOUT = read('src/components/training/RunoutStrategyMatrix.jsx');
const RANGE_VIEWER = read('src/components/training/PostflopRangeViewer.jsx');
const BOARD_EXPLORER = read('src/components/training/BoardExplorer.jsx');
const MULTI_STREET = read('src/components/training/MultiStreetNavigator.jsx');
const REPLAY = read('src/components/training/SolverComparisonReplay.jsx');

for (const [file, source] of [
  ['PostflopStrategyEngine.js', STRATEGY],
  ['PostflopScenarioGenerator.js', SCENARIOS],
  ['SolverScenarioGenerator.js', MASTER],
  ['ScenarioDatabase.js', DATABASE],
  ['DeterministicGTOEngine.js', DETERMINISTIC],
  ['postflopSolverData.js', LOOKUP_TABLES],
  ['GameEngine.js', GAME_ENGINE],
  ['memory-games.js', MEMORY],
  ['JarvisExplanationDialog.jsx', JARVIS],
  ['UniversalDynamicTable.jsx', TABLE],
  ['generate-adaptive.js', ADAPTIVE],
  ['EVCalculator.js', EV],
  ['HandAnalyzer.js', HAND_ANALYZER],
  ['ActionTreeEngine.js', ACTION_TREE],
  ['RunoutStrategyMatrix.jsx', RUNOUT],
  ['PostflopRangeViewer.jsx', RANGE_VIEWER],
  ['BoardExplorer.jsx', BOARD_EXPLORER],
  ['MultiStreetNavigator.jsx', MULTI_STREET],
  ['SolverComparisonReplay.jsx', REPLAY],
]) {
  test(`${file} parses after the authority-boundary changes`, () => {
    assert.doesNotThrow(() => parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
    }));
  });
}

test('the local postflop engine exposes explicit non-authoritative provenance', () => {
  assert.match(STRATEGY, /POSTFLOP_HEURISTIC_PROVENANCE/);
  for (const contract of [
    /authority:\s*'illustrative_local_heuristic'/,
    /authoritative:\s*false/,
    /solverVerified:\s*false/,
    /exactEVAvailable:\s*false/,
    /practiceOnly:\s*true/,
    /frequencyAuthority:\s*'illustrative_heuristic_weight'/,
  ]) assert.match(STRATEGY, contract);

  assert.doesNotMatch(STRATEGY, /solver-approximate|solver-calibrated|solver freq|calibrated to PioSolver/i);
  assert.match(LOOKUP_TABLES, /Source authority:\s*illustrative local heuristic; practice only/i);
  assert.doesNotMatch(LOOKUP_TABLES, /PioSolver-Calibrated|match solver output within|Aggregated from PioSolver/i);
});

test('every generated level 8-10 scenario is labeled illustrative and carries no invented EV delta', () => {
  assert.match(SCENARIOS, /\.\.\.POSTFLOP_HEURISTIC_PROVENANCE/);
  assert.match(SCENARIOS, /solverGenerated:\s*false/);
  assert.match(SCENARIOS, /resultLabel:\s*'Illustrative Local Heuristic'/);
  assert.doesNotMatch(SCENARIOS, /\bevDelta\s*:/);
  assert.doesNotMatch(SCENARIOS, /GTO-correct|GTO Wizard|solver-preferred|Use the solver's standard raise size/i);
});

test('the combined scenario catalog distinguishes preflop ranges from illustrative postflop practice', () => {
  assert.match(MASTER, /Levels 1-7[^\n]*preflop range/i);
  assert.match(MASTER, /Levels 8-10[^\n]*illustrative local postflop heuristic/i);
  assert.doesNotMatch(MASTER, /Levels 8-10:\s*Postflop scenarios from PostflopScenarioGenerator/);
  assert.match(DATABASE, /LEVEL_8_SCENARIOS\s*=\s*_solverScenarios\[8\]/);
  assert.match(DATABASE, /LEVEL_9_SCENARIOS\s*=\s*_solverScenarios\[9\]/);
  assert.match(DATABASE, /LEVEL_10_SCENARIOS\s*=\s*_solverScenarios\[10\]/);
  assert.match(MASTER, /practiceOnly[\s\S]*return null/);
});

test('authoritative training never substitutes the local postflop heuristic for warehouse evidence', () => {
  const singleStart = DETERMINISTIC.indexOf('async generateQuestion(');
  const singleEnd = DETERMINISTIC.indexOf('generateFromPostflopEngine(', singleStart);
  const batchStart = DETERMINISTIC.indexOf('async generateBatch(');
  const batchEnd = DETERMINISTIC.indexOf('const questions = [];', batchStart);
  assert.ok(singleStart >= 0 && singleEnd > singleStart);
  assert.ok(batchStart >= 0 && batchEnd > batchStart);

  assert.doesNotMatch(DETERMINISTIC.slice(singleStart, singleEnd), /level\s*>=\s*8[\s\S]*generateFromPostflopEngine/);
  assert.doesNotMatch(DETERMINISTIC.slice(batchStart, batchEnd), /level\s*>=\s*8[\s\S]*generatePostflopBatch/);
  assert.match(DETERMINISTIC, /source:\s*'LOCAL_POSTFLOP_HEURISTIC'/);
  assert.match(DETERMINISTIC, /type:\s*'PRACTICE'/);
  assert.match(DETERMINISTIC, /practiceOnly:\s*true/);
  assert.match(DETERMINISTIC, /solverVerified:\s*false/);
  assert.match(DETERMINISTIC, /Which action does the illustrative local model prefer\?/);
  assert.doesNotMatch(DETERMINISTIC, /source:\s*'POSTFLOP_ENGINE'/);
});

test('Range Lab and its Jarvis notice use local-practice language, never solver authority', () => {
  assert.doesNotMatch(MEMORY, /Solver-Accurate Training Challenge|Tap A Hand To Compare It With The Solver|Solver:\s*\{/);
  assert.match(MEMORY, /Creating A Unique Local Practice Challenge/);
  assert.match(MEMORY, /Local Key:/);
  assert.match(MEMORY, /Tap A Hand To Compare It With The Local Range Key/);
  assert.doesNotMatch(JARVIS, /strategic analysis/i);
  assert.match(JARVIS, /Local range-key notice/i);
  assert.match(MEMORY, /isIllustrativePostflopScenario/);
  assert.match(MEMORY, /isGradableRangeScenario/);
  assert.match(MEMORY, /setMode\('spot-trainer'\)/);
  assert.match(MEMORY, /Verified Spot Trainer/);
  assert.match(MEMORY, /PREFLOP_ONLY_LOCAL_MODES/);
  assert.match(MEMORY, /preflopPracticeLevel\s*=\s*Math\.min\(7/);
  assert.match(MEMORY, /const ALL_RANGE_LAB_SCENARIOS = \[/);
  assert.doesNotMatch(MEMORY, /const ALL_TRAINING_SCENARIOS = \[/);
  assert.doesNotMatch(MEMORY, /import \{[^}]*LEVEL_8_SCENARIOS/);
  assert.ok((MEMORY.match(/level=\{preflopPracticeLevel\}/g) || []).length >= 3);
  assert.match(JARVIS, /Loading Local Range-Key Notice/i);
  assert.doesNotMatch(JARVIS, /Generating Strategic Intelligence|request the analysis again/i);

  const startGame = MEMORY.indexOf('const startGame = async');
  const postflopTransfer = MEMORY.indexOf('if (Number(level) >= 8)', startGame);
  const aiRequest = MEMORY.indexOf('if (useAIGeneration)', startGame);
  assert.ok(startGame >= 0 && postflopTransfer > startGame && postflopTransfer < aiRequest,
    'postflop levels must transfer before the preflop AI range request');

  assert.match(MEMORY, /isPostflopScenario\(result\.scenario\) \|\| returnedLevel >= 8/);
  assert.match(MEMORY, /const levelConfig = getLevelConfig\(adaptiveLevel\)/);
  assert.match(MEMORY, /setCurrentLevel\(adaptiveLevel\)/);
  assert.match(ADAPTIVE, /level:\s*rangeLabLevelForRfiPosition\(position\)/);
});

test('postflop level labels match the generated street sequence', () => {
  assert.match(GAME_ENGINE, /level:\s*8,[^\n]*Flop[^\n]*Flop Decisions/);
  assert.match(GAME_ENGINE, /level:\s*9,[^\n]*Turn[^\n]*Turn Decisions/);
  assert.match(GAME_ENGINE, /level:\s*10,[^\n]*River[^\n]*River Decisions/);
});

test('the universal table renders the server-projected source classification without promoting local heuristics', () => {
  assert.match(TABLE, /import\s*\{\s*trainingSourcePresentation\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/lib\/training\/cacheTruthContract\.mjs['"]/);
  assert.match(TABLE, /trainingSourcePresentation\(infoPanelQuestion\?\.sourceClassification\)/);
  assert.doesNotMatch(TABLE, /trainingSourcePresentation\(infoPanelQuestion\)/);
  assert.doesNotMatch(TABLE, /MODELLED_SOURCES\s*=\s*\[[^\]]*'LOCAL_POSTFLOP_HEURISTIC'/);
});

test('legacy heuristic consumers cannot grade or present local weights as solved output', () => {
  assert.match(EV, /authority:\s*'illustrative_local_estimate'/);
  assert.match(EV, /solverVerified:\s*false/);
  assert.match(EV, /exactEVAvailable:\s*false/);
  assert.match(EV, /evLossMeasured:\s*false/);
  assert.match(HAND_ANALYZER, /Verified postflop solver evidence is required before this decision can be graded/);
  assert.match(HAND_ANALYZER, /actionUnavailable:\s*true/);
  assert.match(ACTION_TREE, /classification:\s*'practice_only'/);
  assert.match(ACTION_TREE, /score:\s*null/);
  assert.match(ACTION_TREE, /evLoss:\s*null/);
  assert.match(ACTION_TREE, /Retired browser-side scoring boundary/);
  assert.match(ACTION_TREE, /Authoritative[\s\S]*grading now happens only in the signed record-question transaction/);
  assert.doesNotMatch(ACTION_TREE, /score:\s*50, classification:\s*'unknown', evLoss:\s*0/);
  assert.doesNotMatch(ACTION_TREE, /score:\s*(?:10|25|40|60|80|100)/);

  assert.match(RUNOUT, /ILLUSTRATIVE RUNOUT MODEL/);
  assert.match(RUNOUT, /Not A Solved Node Or Exact EV/);
  assert.doesNotMatch(RUNOUT, /How Does The Optimal Action Change Per Card/);
  assert.match(RANGE_VIEWER, /Local Heuristic Weights, Not PioSOLVER Output Or Exact EV/);
  assert.doesNotMatch(RANGE_VIEWER, /Frequencies From PioSolver-Calibrated Strategy Matrices/);
  assert.doesNotMatch(RANGE_VIEWER, />\s*BEST\s*</);
  assert.match(BOARD_EXPLORER, /Illustrative Board Explorer/);
  assert.match(MULTI_STREET, /Illustrative Local Weights — Not Solver Frequencies/);
  assert.match(MULTI_STREET, /handData\.solverVerified === true \? 'VERIFIED SOLVER' : 'REFERENCE'/);
  assert.match(REPLAY, /Illustrative Local Estimates — Not Solved EV/);
  assert.doesNotMatch(REPLAY, />GTO<\/div>/);
});
