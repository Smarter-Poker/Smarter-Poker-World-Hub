import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('the browser cannot grade a blind Training question locally', () => {
  const hook = read('src/hooks/useGTOTrainer.js');
  const start = hook.indexOf('const submitAnswer = useCallback');
  const end = hook.indexOf('const advanceToNextStreet = useCallback', start);
  const submit = hook.slice(start, end);

  assert.doesNotMatch(hook, /import .*gradeTrainingAnswer/);
  assert.doesNotMatch(submit, /gradeTrainingAnswer\(/);
  assert.doesNotMatch(submit, /classifyMove\(/);
  assert.doesNotMatch(submit, /selectedOptionId === .*correctAnswer/);
  assert.match(submit, /const serverEvidence = recorded\?\.evidence/);
  assert.match(submit, /const feedback = recorded\?\.feedback/);
  assert.match(submit, /const isCorrect = serverEvidence\.isCorrect === true/);
  assert.match(submit, /feedback\?\.continuation\?\.actionId/);
  assert.match(submit, /multiStreetHandRef\.current = new MultiStreetHand\(currentQuestion\)/);
  assert.match(submit, /onPersisted: finalizePersistedAnswer/);
  assert.match(submit, /await persistPendingAnswer\(entry\)/);
  assert.match(hook, /function containsPreAnswerGradingData/);
  assert.match(hook, /'rngguidance'/);
  assert.match(hook, /'targetactionid'/);
  assert.match(hook, /Training delivery exposed private grading data/);
});

test('the answer request submits identity and choice, never a client verdict', () => {
  const hook = read('src/hooks/useGTOTrainer.js');
  const start = hook.indexOf('const recordAnswer = useCallback');
  const end = hook.indexOf('const persistPendingAnswer = useCallback', start);
  const recorder = hook.slice(start, end);
  const bodyStart = recorder.indexOf('body: JSON.stringify({');
  const bodyEnd = recorder.indexOf('}),', bodyStart);
  const body = recorder.slice(bodyStart, bodyEnd);

  assert.match(body, /gradingReceipt: submission\.gradingReceipt/);
  assert.match(body, /selectedAnswer/);
  assert.doesNotMatch(body, /isCorrect|classification|evLoss|correctAnswer/);
  assert.match(recorder, /payload\?\.evidence/);
  assert.match(recorder, /payload\?\.feedback/);
});

test('record-question reveals coaching data only after canonical grading persistence', () => {
  const api = read('pages/api/training/record-question.js');
  const insertAt = api.indexOf("from('training_answers').insert(evidenceRow)");
  const responseAt = api.indexOf('feedback: {', insertAt);

  assert.ok(insertAt > 0);
  assert.ok(responseAt > insertAt);
  assert.match(api, /getImmutableQuestionSnapshot\(receiptPayload\.snapshotKey\)/);
  assert.match(api, /verifyTrainingGradingReceipt\(/);
  assert.match(api, /gradeTrainingAnswer\(\{/);
  assert.match(api, /correctAnswer: servedQuestion\.correctAnswer/);
  assert.match(api, /explanation: servedQuestion\.explanation/);
  assert.match(api, /continuation: revealedContinuationAction/);
  assert.ok(
    api.indexOf('continuation: revealedContinuationAction') > insertAt,
    'continuation eligibility must be revealed only after durable answer persistence',
  );
  assert.match(api, /const persistedClassification = canonicalGrade\.classification/);
  assert.match(api, /hero_position: String\(canonicalScenario\.heroPosition/);
  assert.match(api, /villain_position: String\(canonicalScenario\.villainPosition/);
  assert.match(api, /street: String\(canonicalScenario\.street/);
  assert.match(api, /spot_type: String\(canonicalSpotType\)/);
  assert.doesNotMatch(api, /const \{[\s\S]{0,240}heroPosition[\s\S]{0,240}\} = req\.body/);
});

test('the felt never invents a pre-answer mix or fallback answer key', () => {
  const table = read('src/components/training/games/UniversalDynamicTable.jsx');

  assert.match(table, /const correctAnswer = question\?\.correctAnswer \|\| question\?\.correct \|\| null/);
  assert.doesNotMatch(table, /const correctAnswer = .*\|\| 'a'/);
  assert.doesNotMatch(table, /return simulateGTOFrequencies\(/);
  assert.match(table, /question\?_gradingContext|question\?\._gradingContext/);
  assert.doesNotMatch(table, /rngGuidance|rngTargetActionId/);
  assert.match(table, /\? \{ rngRoll, rngMode: rngHighLow \}/);
  assert.match(table, /question\?\._gradingContext\?\.difficultyMode \|\| question\?\._difficultyApplied/);
  assert.match(table, /gradingPending: true/);
});
