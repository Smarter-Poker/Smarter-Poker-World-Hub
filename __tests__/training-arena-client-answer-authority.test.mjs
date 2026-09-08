import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('the Arena hook cannot statically reach authored answer banks', () => {
  const hook = read('src/hooks/useGTOTrainer.js');

  for (const privateModule of [
    'DeterministicGTOEngine',
    'curatedPokerConcepts',
    'psychologyQuestionBank',
    'solverRanges',
  ]) {
    assert.doesNotMatch(hook, new RegExp(`(?:import|require\\()(?:(?!\\n).)*${privateModule}`));
  }
  assert.match(hook, /createServerFeedbackOnlyInsightBoundary/);
  assert.match(hook, /Unknown insight methods[\s\S]*return null/);
  assert.match(hook, /const serverEvidence = recorded\?\.evidence/);
  assert.match(hook, /const feedback = recorded\?\.feedback/);
});

test('retired browser-authored modes have no component, state, or grading path in the Arena', () => {
  const arena = read('src/components/training/GodModeArena.jsx');

  for (const retiredSurface of [
    'HandHistoryImportModal',
    'FlashcardMode',
    'DrillMode',
    'DrillCountdown',
    'importedQuestion',
    'importedFeedback',
    'flashcardState',
    'drillState',
    'generateFlashcards',
    'generateQuickFireQuestion',
    'importHandToTrainingQuestion',
  ]) {
    assert.doesNotMatch(arena, new RegExp(retiredSurface));
  }

  assert.match(arena, /question=\{questionWithFilteredOptions\}/);
  assert.match(arena, /onAnswer=\{handleSubmitAnswer\}/);
  assert.match(arena, /showFeedback=\{showFeedback\}/);
  assert.match(arena, /onNextHand=\{answerSaveError \? null : handleNextQuestion\}/);
});

test('session setup and normalization cannot advertise or revive pseudo Arena modes', () => {
  const setup = read('src/components/training/SessionSetupModal.jsx');
  const contract = read('src/lib/training/sessionConfigContract.mjs');

  assert.doesNotMatch(setup, /MODE_OPTIONS|Training Mode|Flashcards|Speed Drill|Import HH/);
  assert.doesNotMatch(contract, /\['(?:flashcard|flashcards|speed|speed-drill|quick-fire|drill|import|import-hh|hand-history)'/);
  assert.doesNotMatch(contract, /initialTrainingPhase/);
  assert.match(contract, /tables: requestedTables/);
});
