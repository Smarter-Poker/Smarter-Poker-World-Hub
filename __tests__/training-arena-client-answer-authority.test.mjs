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

test('psychology reveal retains the submitted option across replacement, remount, and a new decision', async () => {
  // React's act helper requires its non-production build, including inside Vercel's build:vercel subprocess.
  process.env.NODE_ENV = 'test';
  const { createRequire } = await import('node:module');
  // Each Node test file runs in its own process. Load React's act-enabled test build here.
  process.env.NODE_ENV = 'test';
  const require = createRequire(import.meta.url);
  const React = require('react');
  const { act, create } = require('react-test-renderer');
  const filename = 'src/components/training/GTOQuestionCard.jsx';
  const compiled = require('esbuild').transformSync(read(filename), { loader: 'jsx', format: 'cjs' }).code;
  const cardModule = { exports: {} };
  const deps = {
    react: React,
    'framer-motion': { motion: { div: 'div' }, AnimatePresence: React.Fragment, useReducedMotion: () => true },
    '../../contexts/TrainingSettingsContext': { useTrainingSettings: () => ({ viewMode: 'standard' }) },
    '../../utils/formatScenario': { formatScenario: () => '' },
    './TrainingQuestionReport': () => null,
  };
  Function('require', 'module', 'exports', compiled)(name => deps[name] ?? require(name), cardModule, cardModule.exports);
  const Card = cardModule.exports.default;
  const blind = { id: 'psy-001', _gradingContext: { submissionId: 'first' }, question: 'Which response?',
    options: [{ id: 'd', text: 'Refocus attention' }, { id: 'b', text: 'Distract yourself' }] };
  let submitted;
  let view;
  const render = (question, props = {}) => React.createElement(Card, {
    gameId: 'psy-001', question, onAnswer: id => { submitted = id; }, ...props,
  });
  const optionButton = text => view.root.findAllByProps({ 'data-training-answer-option': 'true' })
    .find(button => button.findAllByType('span').some(span => span.children.includes(text)));
  const verdict = () => view.root.findByProps({ 'data-training-feedback': 'verdict' });
  act(() => { view = create(render(blind)); });
  act(() => optionButton('Distract yourself').props.onClick());
  assert.equal(submitted, 'b');
  const selectedStyle = optionButton('Distract yourself').props.style;
  act(() => view.update(render({ ...blind, options: [...blind.options] })));
  assert.deepEqual(optionButton('Distract yourself').props.style, selectedStyle);

  // Replay can mount a fresh card with only the durable submission and the server reveal.
  const reveal = { ...blind, selectedAnswer: submitted, correctAnswer: 'd', explanation: 'Return your attention to the decision.' };
  const feedback = render(reveal, { showFeedback: true, feedbackResult: 'wrong' });
  act(() => view.update(feedback));
  for (const remount of [false, true]) {
    if (remount) {
      act(() => view.unmount());
      act(() => { view = create(feedback); });
    }
    assert.equal(verdict().props['data-selected-action'], 'b');
    assert.equal(verdict().props['data-correct-action'], 'd');
    assert.ok(verdict().findAllByType('div').some(node => node.children.includes('Distract yourself')));
    assert.ok(verdict().findAllByType('div').some(node => node.children.includes('Refocus attention')));
    assert.equal(verdict().findByProps({ 'data-training-feedback': 'explanation' }).children[0], reveal.explanation);
  }
  act(() => view.update(render(blind)));
  act(() => optionButton('Distract yourself').props.onClick());
  act(() => view.update(render({ ...blind, _gradingContext: { submissionId: 'second' } })));
  assert.notDeepEqual(optionButton('Distract yourself').props.style, selectedStyle);
  assert.equal(view.root.findAllByProps({ 'data-training-feedback': 'verdict' }).length, 0);
  act(() => view.unmount());
  assert.match(read('src/hooks/useGTOTrainer.js'), /\.\.\.feedback,\s*selectedAnswer: submission\.selectedAnswer/);
});
