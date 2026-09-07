import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  normalizeTrainingSessionConfig,
  normalizeTrainingSessionMode,
  withTrainingSessionDifficulty,
} from '../src/lib/training/sessionConfigContract.mjs';
import { isCustomTrainerConfig } from '../src/lib/training/trainerConfigMode.mjs';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

test('legacy browser-authored mode aliases retire to signed standard play', () => {
  assert.equal(normalizeTrainingSessionMode('flashcards'), 'standard');
  assert.equal(normalizeTrainingSessionMode('speed'), 'standard');
  assert.equal(normalizeTrainingSessionMode('speed-drill'), 'standard');
  assert.equal(normalizeTrainingSessionMode('import-hh'), 'standard');
  assert.equal(normalizeTrainingSessionMode('unknown'), 'standard');
});

test('scope, gameMode, and targetStreet form one canonical filtering contract', () => {
  const street = normalizeTrainingSessionConfig({
    scope: 'single-street',
    targetStreet: 'TURN',
  });
  assert.equal(street.scope, 'street');
  assert.equal(street.gameMode, 'street');
  assert.equal(street.targetStreet, 'turn');

  const defaultStreet = normalizeTrainingSessionConfig({ gameMode: 'street' });
  assert.equal(defaultStreet.targetStreet, 'flop');

  const spot = normalizeTrainingSessionConfig({
    gameMode: 'spot',
    targetStreet: 'river',
  });
  assert.equal(spot.scope, 'spot');
  assert.equal(spot.gameMode, 'spot');
  assert.equal(spot.targetStreet, null);
});

test('retired pseudo modes cannot silently alter the signed table contract', () => {
  for (const mode of ['flashcards', 'speed', 'import']) {
    const normalized = normalizeTrainingSessionConfig({ mode, tables: '4' });
    assert.equal(normalized.mode, 'standard');
    assert.equal(normalized.tables, '4');
  }
  assert.equal(normalizeTrainingSessionConfig({ mode: 'standard', tables: 4 }).tables, '4');
});

test('normalization preserves custom trainer fields without misclassifying preferences', () => {
  const preferences = normalizeTrainingSessionConfig({
    difficulty: 'expert',
    timer: 'blitz',
    handSelection: 'close',
  });
  assert.equal(isCustomTrainerConfig(preferences), false);

  const custom = normalizeTrainingSessionConfig({
    gameType: 'cash',
    stackDepth: 100,
    position: 'BTN',
  });
  assert.equal(custom.position, 'BTN');
  assert.equal(isCustomTrainerConfig(custom), true);
});

test('direct difficulty selection always produces an engine-visible config', () => {
  const direct = withTrainingSessionDifficulty(null, 'expert', {
    timer: 'quick',
    scope: 'street',
    targetStreet: 'river',
  });
  assert.equal(direct.difficulty, 'expert');
  assert.equal(direct.difficultyMode, 'exact');
  assert.equal(direct.timer, 'quick');
  assert.equal(direct.gameMode, 'street');
  assert.equal(direct.targetStreet, 'river');

  const reset = withTrainingSessionDifficulty(direct, 'invalid');
  assert.equal(reset.difficulty, 'standard');
  assert.equal(reset.difficultyMode, 'grouped');
});

test('custom trainer action grouping survives shared config normalization', () => {
  const exact = normalizeTrainingSessionConfig({
    gameType: 'cash',
    stackDepth: 100,
    difficultyMode: 'exact',
  });
  assert.equal(exact.difficultyMode, 'exact');

  const legacyExact = normalizeTrainingSessionConfig({ difficultyMode: 'standard' });
  assert.equal(legacyExact.difficultyMode, 'exact');

  const switchedTier = withTrainingSessionDifficulty(exact, 'beginner');
  assert.equal(switchedTier.difficultyMode, 'simple');
});

test('all setup and launch boundaries consume the shared contract', () => {
  const setup = read('src/components/training/SessionSetupModal.jsx');
  const hub = read('pages/hub/training.js');
  const multiTable = read('pages/hub/training/multi-table.js');
  const arena = read('src/components/training/GodModeArena.jsx');
  const trainer = read('src/hooks/useGTOTrainer.js');

  assert.match(setup, /normalizeTrainingSessionConfig/);
  assert.doesNotMatch(setup, /MODE_OPTIONS|id: 'flashcard'|id: 'drill'|Import HH|Speed Drill/);
  assert.doesNotMatch(setup, /title="Training Mode"|setMode\(|handleModeChange/);
  assert.match(setup, /title="Target Street"/);
  assert.match(setup, /targetStreet,/);

  assert.match(hub, /const sessionConfig = normalizeTrainingSessionConfig\(prefs\)/);
  assert.match(hub, /scope: sessionConfig\.scope/);
  assert.match(hub, /targetStreet: sessionConfig\.targetStreet/);
  assert.match(multiTable, /normalizeTrainingSessionConfig\(\{/);
  assert.match(multiTable, /scope: router\.query\.scope/);
  assert.match(multiTable, /targetStreet: router\.query\.targetStreet/);

  assert.match(arena, /const \[bootstrapSessionConfig\] = useState/);
  assert.doesNotMatch(arena, /initialTrainingPhase\(/);
  assert.match(arena, /initialConfig \? 'playing' : 'splash'/);
  assert.match(arena, /withTrainingSessionDifficulty\(/);
  assert.match(
    arena,
    /The Arena has one authority path:[\s\S]*?signed server-delivered question[\s\S]*?explicit manual Next/,
    'the Arena must document and enforce one signed, server-graded path',
  );
  assert.doesNotMatch(
    arena,
    /showModal: Boolean\(initialConfig\)|importedQuestion|importedFeedback/,
  );

  assert.match(trainer, /if \(trainerConfig\?\.difficulty\) return trainerConfig\.difficulty/);
  assert.match(trainer, /params\.set\('difficulty', resolveDeliveryDifficulty\(trainerConfig\)\)/);
  assert.match(trainer, /trainerConfig\?\.gameMode === 'street' && trainerConfig\?\.targetStreet/);
  assert.match(
    trainer,
    /const deliveryContractKey = createDeliveryContractKey\(\s*gameId,\s*trainingSessionId,\s*trainerConfig,\s*selectedLevel,\s*\)/,
  );
  assert.match(trainer, /loadedDeliveryContractRef\.current === deliveryContractKey/);
  assert.match(trainer, /preloadRef\.current\(\)/);
  assert.match(
    trainer,
    /showFeedback\s*\|\| nextQuestionInFlightRef\.current\s*\|\| submitAnswerInFlightRef\.current\s*\|\| pendingAnswerPersistenceRef\.current/,
    'a config change must not rotate the attempt while answer persistence is in flight',
  );
  assert.doesNotMatch(
    trainer,
    /setCurrentQuestion\(applyDifficultyToQuestion\(rawQuestion/,
    'signed questions must be refetched, never rewritten in the browser',
  );
  assert.match(trainer, /An explicit street is a hard contract/);
  assert.match(trainer, /must never filter a signed attempt/);
  const streetFilter = trainer.slice(
    trainer.indexOf('export function applyStreetFilter'),
    trainer.indexOf('const QUESTIONS_PER_LEVEL'),
  );
  assert.match(streetFilter, /throw new Error\(`The signed Training attempt contains a non-\$\{want\} question\.`\)/);
  assert.match(streetFilter, /return questions;/);
  assert.doesNotMatch(streetFilter, /questions\.filter/);
  assert.doesNotMatch(streetFilter, /return filtered\.length > 0 \? filtered : questions/);
  assert.doesNotMatch(trainer, /export function applyHandSelection/);
});
