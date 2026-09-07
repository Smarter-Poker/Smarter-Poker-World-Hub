import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('every signed Training delivery and grading endpoint is private and uncacheable', () => {
  for (const endpoint of [
    'pages/api/training/batch-preload.js',
    'pages/api/training/custom-train.js',
    'pages/api/training/get-question.js',
    'pages/api/training/next-street.js',
    'pages/api/training/record-question.js',
    'pages/api/training/reissue-questions.js',
    'pages/api/training/save-progress.js',
    'pages/api/training/save-session.js',
  ]) {
    const source = read(endpoint);
    assert.match(source, /setHeader\('Cache-Control', 'private, no-store'\)/, endpoint);
    assert.match(source, /setHeader\('Vary', 'Authorization'\)/, endpoint);
  }
});

test('the Arena carries one stable signed-delivery session through every endpoint', () => {
  const hook = read('src/hooks/useGTOTrainer.js');

  assert.match(hook, /const trainingSessionIdRef = useRef\(null\)/);
  assert.match(hook, /trainingSessionGameIdRef\.current !== gameId/);
  assert.match(hook, /externalSessionId = null/);
  assert.match(hook, /externalSessionIdRef\.current !== normalizedExternalSessionId/);
  assert.match(hook, /trainingSessionIdRef\.current = normalizedExternalSessionId \|\| createClientTrainingSessionId\(\)/);
  assert.match(hook, /trainingSessionId,/);
  assert.match(hook, /sessionId: trainingSessionId/g);
  assert.match(hook, /sessionId: submission\.sessionId/);
  assert.match(hook, /attemptId: submission\.attemptId/);
  assert.match(hook, /snapshotKey: submission\.snapshotKey/);
  assert.match(hook, /sessionTargetHands: submission\.sessionTargetHands/);
  assert.match(hook, /decisionOrdinal: submission\.decisionOrdinal/);
  assert.match(hook, /assertSignedTrainingDelivery\(data, trainingSessionId/);

  const signedChecks = hook.match(/assertSignedTrainingDelivery\(/g) || [];
  assert.ok(signedChecks.length >= 6, 'every live, prefetch, continuation, and offline path is sealed');
});

test('custom requests carry config while next-street sends only the signed parent receipt', () => {
  const hook = read('src/hooks/useGTOTrainer.js');
  const customStart = hook.indexOf("if (isCustomTrainerConfig(trainerConfig))");
  const customEnd = hook.indexOf('} else {', customStart);
  const custom = hook.slice(customStart, customEnd);

  assert.match(custom, /gameId,/);
  assert.match(custom, /level: effectiveLevel\.toString\(\)/);
  assert.match(custom, /difficulty: resolveDeliveryDifficulty\(trainerConfig\)/);
  assert.match(custom, /sessionId: trainingSessionId/);
  assert.match(custom, /trainerConfig\.targetStreet \|\| trainerConfig\.street/);
  assert.match(custom, /trainerConfig\.spotType/);
  assert.match(custom, /trainerConfig\.questionsCount/);

  const nextStreetStart = hook.indexOf('const advanceToNextStreet = useCallback');
  const nextStreetEnd = hook.indexOf('/**\n   * Save progress to database', nextStreetStart);
  const nextStreet = hook.slice(nextStreetStart, nextStreetEnd);
  assert.match(nextStreet, /authedFetch\('\/api\/training\/next-street', \{/);
  assert.match(nextStreet, /method: 'POST'/);
  assert.match(nextStreet, /JSON\.stringify\(\{ gradingReceipt: activeContext\.receipt \}\)/);
  assert.match(nextStreet, /attemptId: activeContext\.attemptId/);
  assert.match(nextStreet, /decisionOrdinal: Number\(activeContext\.decisionOrdinal\) \+ 1/);
  assert.match(nextStreet, /assertSignedTrainingDelivery\(data, activeContext\.sessionId, \{/);
  assert.doesNotMatch(nextStreet, /new URLSearchParams/);
  assert.doesNotMatch(nextStreet, /heroHand: hand\.heroHand/);
  assert.doesNotMatch(nextStreet, /pot: hand\.pot\.toString/);
  assert.match(nextStreet, /setAnswerSaveError\(/);
  assert.match(nextStreet, /const nextQ = hand\.applyServerContinuation\(data\)/);
  assert.match(nextStreet, /response\.status === 404 && data\?\.code === 'TRAINING_CONTINUATION_SOLVER_MISS'/);
  assert.match(nextStreet, /hand\.finishAtSolverBoundary\(data\.code\)/);
  assert.match(nextStreet, /return 'solver-boundary'/);
  assert.match(nextStreet, /return null/);
  assert.doesNotMatch(nextStreet, /setIsMultiStreetActive\(false\)/);
  assert.doesNotMatch(nextStreet, /multiStreetHandRef\.current = null/);

  const nextQuestionStart = hook.indexOf('const nextQuestion = useCallback');
  const nextQuestionEnd = hook.indexOf('/**\n   * Start next level', nextQuestionStart);
  const nextQuestion = hook.slice(nextQuestionStart, nextQuestionEnd);
  assert.match(nextQuestion, /const advanced = await advanceToNextStreet\(\)/);
  assert.match(nextQuestion, /if \(advanced === true\) return/);
  assert.match(nextQuestion, /advanced === null \|\| advanced === false[\s\S]*setShowFeedback\(true\)[\s\S]*return/);
  assert.match(nextQuestion, /advanced === 'solver-boundary'[\s\S]*setHandSummary\(finishedHand\.getHandSummary\(\)\)[\s\S]*setIsMultiStreetActive\(false\)/);
});

test('configuration changes rotate the attempt and reset it before refetching', () => {
  const hook = read('src/hooks/useGTOTrainer.js');

  assert.match(hook, /const deliveryContractKey = createDeliveryContractKey\([\s\S]*gameId,[\s\S]*trainingSessionId,[\s\S]*trainerConfig,[\s\S]*selectedLevel/);
  assert.match(hook, /const sessionConfigContractKey = createDeliveryFamilyKey\(gameId, selectedLevel, trainerConfig\)/);
  assert.match(hook, /questionsCount: Number\(trainerConfig\?\.questionsCount\)/);
  assert.match(hook, /spotType: String\(trainerConfig\?\.spotType \|\| 'any'\)\.toLowerCase\(\)/);
  assert.match(hook, /loadedSessionConfigContractRef\.current !== sessionConfigContractKey/);
  assert.match(hook, /pendingSessionConfigContractRef\.current = sessionConfigContractKey/);
  assert.match(hook, /persistenceResult\?\.ok !== true[\s\S]*return;[\s\S]*pendingConfigContract[\s\S]*resetAttemptRuntimeRef\.current\(\)[\s\S]*activateFreshTrainingSession\('config'\)/);
  assert.match(hook, /loadedDeliveryContractRef\.current === deliveryContractKey/);
  assert.match(hook, /if \(showFeedback\) return/);
  assert.match(hook, /preloadRef\.current\(\)/);
  assert.doesNotMatch(hook, /applyDifficultyToQuestion/);
});

test('stale delivery responses cannot overwrite a newer session generation', () => {
  const hook = read('src/hooks/useGTOTrainer.js');
  assert.match(hook, /const deliveryGenerationRef = useRef\(0\)/);
  assert.match(hook, /deliveryGenerationRef\.current \+= 1/);
  assert.match(hook, /const captureTrainingLease = useCallback/);
  assert.match(hook, /lease\.generation === deliveryGenerationRef\.current/);
  assert.match(hook, /lease\.sessionId === trainingSessionIdRef\.current/);
  assert.ok((hook.match(/isTrainingLeaseActive\(requestLease\)/g) || []).length >= 12);
  assert.match(hook, /RECOVERABLE_ATTEMPT_START_CODES\.has\(err\?\.code\)/);
  assert.match(hook, /budget\.familyKey === familyKey && budget\.used/);
  assert.match(hook, /activateFreshTrainingSession\('attempt-recovery'\)/);
});

test('manual Next cannot outrun an immutable signed answer retry', () => {
  const hook = read('src/hooks/useGTOTrainer.js');

  assert.match(hook, /gradingReceipt: gradingContext\.receipt/);
  assert.match(hook, /submissionId: gradingContext\.submissionId/);
  assert.match(hook, /sessionId: gradingContext\.sessionId/);
  assert.match(hook, /attemptId: gradingContext\.attemptId/);
  assert.match(hook, /snapshotKey: gradingContext\.snapshotKey/);
  assert.match(hook, /countsTowardCompletion: gradingContext\.countsTowardCompletion/);
  assert.match(hook, /practiceOnly: gradingContext\.practiceOnly/);
  assert.match(hook, /assertRecordedAnswerAcknowledgement\(payload, submission\)/);
  assert.match(hook, /payload\?\.success !== true[\s\S]*payload\?\.submissionId[\s\S]*payload\?\.sessionId[\s\S]*payload\?\.attemptId[\s\S]*payload\?\.snapshotKey/);
  assert.match(hook, /if \(persistenceResult\?\.ok !== true\)[\s\S]*setAnswerSaveError[\s\S]*return/);
  assert.match(hook, /retryAnswerPersistence[\s\S]*persistPendingAnswer\(entry, \{ retry: true \}\)/);
  assert.match(hook, /navigator\.onLine === false[\s\S]*cannot be graded or credited/);
  assert.match(hook, /if \(!userId \|\| !gameId\) \{[\s\S]*ok: false/);
  assert.doesNotMatch(hook, /skipped: true/);
});

test('an expired signed hand has an explicit fresh-hand recovery and never retries the stale receipt', () => {
  const hook = read('src/hooks/useGTOTrainer.js');
  const arena = read('src/components/training/GodModeArena.jsx');
  const retryStart = hook.indexOf('const retryAnswerPersistence = useCallback');
  const retryEnd = hook.indexOf('/**\n   * Submit answer', retryStart);
  const retry = hook.slice(retryStart, retryEnd);

  assert.match(hook, /setAnswerSaveRequiresRefresh\(true\)/);
  assert.match(retry, /if \(entry\.result\?\.refreshRequired\)/);
  assert.match(retry, /await fetchSingleQuestion\(selectedLevel, questionNumber, \{ throwOnError: true \}\)/);
  assert.match(retry, /pendingAnswerPersistenceRef\.current = null/);
  assert.ok(
    retry.indexOf('await fetchSingleQuestion') < retry.indexOf('pendingAnswerPersistenceRef.current = null'),
    'the recovery token must survive until the fresh signed hand arrives',
  );
  assert.match(retry, /Keep the expired entry as a recovery token/);
  assert.doesNotMatch(
    retry.slice(retry.indexOf('if (entry.result?.refreshRequired)'), retry.indexOf('const result = await persistPendingAnswer')),
    /recordAnswer\(|persistPendingAnswer\(/,
  );
  assert.match(arena, /answerSaveRequiresRefresh \? 'Hand Expired'/);
  assert.match(arena, /answerSaveRequiresRefresh \? 'Load Fresh Hand' : 'Retry Save'/);
  assert.match(arena, /No Result Was Recorded\. Load A Fresh Signed Hand To Continue\./);
});

test('optional browser projections cannot suppress a persisted server verdict', () => {
  const hook = read('src/hooks/useGTOTrainer.js');
  const start = hook.indexOf('const finalizePersistedAnswer =');
  const end = hook.indexOf('// Preserve one immutable submission', start);
  const finalize = hook.slice(start, end);

  assert.match(finalize, /const finalizePersistedAnswer = \(recorded\) =>/);
  assert.match(finalize, /server has already graded and persisted/);
  assert.match(finalize, /catch \(projectionError\)/);
  assert.match(finalize, /finally \{[\s\S]*setFeedbackResult\(isCorrect \? 'correct' : 'wrong'\)/);
  assert.match(finalize, /setExplanation\(renderedExplanation\)/);
  assert.match(finalize, /setShowFeedback\(true\)/);
  assert.match(finalize, /setLastSelectedAction\(selectedOptionId\)/);
});

test('completion rewards displayed by the Arena come only from the settled server result', () => {
  const hook = read('src/hooks/useGTOTrainer.js');
  const arena = read('src/components/training/GodModeArena.jsx');

  assert.match(hook, /setDiamondsEarned\(Number\(completion\.diamondsEarned\) \|\| 0\)/);
  assert.match(hook, /setGameComplete\(true\)[\s\S]*try \{[\s\S]*trainingSounds\.play[\s\S]*catch \(soundError\)[\s\S]*Completion sound failed \(non-critical\)/);
  assert.match(arena, /diamondReward: diamondsEarned/);
  assert.match(arena, /const totalReward = Number\(diamondsEarned\) \|\| 0/);
  assert.match(arena, /SERVER SETTLED/);
  assert.doesNotMatch(arena, /calculateSessionDiamonds|getDiamondReward|checkSpeedBonus|speedBonusDiamonds/);
});

test('legacy questionGenerator is unreachable and cannot create unsigned submissions', () => {
  const utilityPath = path.join(ROOT, 'src/components/training/utils/questionGenerator.js');
  const utility = fs.readFileSync(utilityPath, 'utf8');
  const roots = ['src', 'pages'];
  const reachableImports = [];

  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name) && fullPath !== utilityPath) {
        const source = fs.readFileSync(fullPath, 'utf8');
        if (/from\s+['"][^'"]*questionGenerator|require\(['"][^'"]*questionGenerator/.test(source)) {
          reachableImports.push(path.relative(ROOT, fullPath));
        }
      }
    }
  };
  for (const root of roots) visit(path.join(ROOT, root));

  assert.deepEqual(reachableImports, []);
  assert.match(utility, /gameId,/);
  assert.match(utility, /gradingReceipt/);
  assert.match(utility, /submissionId/);
  assert.match(utility, /sessionId/);
  assert.match(utility, /attemptId/);
  assert.match(utility, /snapshotKey/);
  assert.match(utility, /sessionTargetHands/);
  assert.match(utility, /decisionOrdinal/);
  assert.match(utility, /A signed training question is required/);
  assert.match(utility, /const immutableSubmission = JSON\.stringify/);
  assert.match(utility, /response\.status === 429 \|\| response\.status >= 500/);
  assert.match(utility, /payload\?\.success !== true[\s\S]*payload\?\.attemptId[\s\S]*payload\?\.snapshotKey/);
  assert.doesNotMatch(utility, /catch \(err\).*Handled exception/);
});

test('every Arena host supplies one render-stable session identity', () => {
  const arena = read('src/components/training/GodModeArena.jsx');
  const warmup = read('pages/hub/training/quick-warmup.js');
  const autopilot = read('pages/hub/training/autopilot.js');
  const directArena = read('pages/hub/training/arena/[gameId].js');

  assert.match(arena, /useGTOTrainer\(gameId, engineType, level, trainerConfig, sessionId\)/);
  assert.match(warmup, /setArenaSessionId\(createWarmupRunId\(\)\)/);
  assert.match(warmup, /sessionId=\{arenaSessionId\}/);
  assert.doesNotMatch(warmup, /sessionId=\{`warmup-\$\{Date\.now\(\)\}`\}/);
  assert.match(autopilot, /setAutopilotRunId\(createAutopilotRunId\(\)\)/);
  assert.match(autopilot, /sessionId=\{`\$\{autopilotRunId\}-\$\{currentSpotIdx\}`\}/);
  assert.match(autopilot, /key=\{`\$\{autopilotRunId\}:\$\{currentSpotIdx\}:/);
  assert.doesNotMatch(autopilot, /sessionId=\{`autopilot-\$\{Date\.now\(\)\}`\}/);
  assert.match(directArena, /userId=\{userId\}/);
});

test('preload-only callers cannot discard receipts or outlive them', () => {
  const intro = read('src/components/training/GameIntroSplash.jsx');
  const preloader = read('pages/hub/training/gto-preloader.js');
  const cache = read('src/lib/training/offlineQuestionCache.js');

  assert.doesNotMatch(intro, /\/api\/training\/get-question/);
  assert.match(preloader, /const levelSessionId = `\$\{packSessionId\}-level-\$\{level\}`/);
  assert.match(preloader, /sessionId: levelSessionId/);
  assert.match(preloader, /assertSignedPackPayload\(payload, levelSessionId\)/);
  assert.match(preloader, /levelSessionIds/);
  assert.match(preloader, /version: 3/);
  assert.match(cache, /export const OFFLINE_QUESTION_CACHE_VERSION = 3/);
  assert.match(preloader, /OFFLINE_PACK_DELIVERY_CONTRACT/);
  assert.match(cache, /deliveryContract/);
  assert.match(cache, /questions\.every\(hasCompleteOfflineGradingContext\)/);
  assert.match(cache, /Math\.min\(\.\.\.expiries\)/);
  assert.match(cache, /RECEIPT_EXPIRY_SAFETY_MS/);
  assert.match(cache, /offlineQuestionCacheKey\(gameId, level, userId, contract\)/);
  assert.match(cache, /consumeOfflineQuestion/);
});

test('offline cache accepts only one complete signed attempt with unique JTIs', async () => {
  const {
    createOfflineQuestionCacheContract,
    getOfflineQuestionCacheTtl,
    offlineQuestionCacheKey,
  } = await import('../src/lib/training/offlineQuestionCache.js');
  const now = 1_000_000;
  const makeQuestion = (id, handOrdinal) => ({
    id,
    _gradingContext: {
      receipt: `receipt-${id}`,
      submissionId: `jti-${id}`,
      sessionId: 'session-one',
      attemptId: 'attempt-one',
      snapshotKey: `snapshot-${id}`,
      sessionKind: 'campaign',
      difficultyMode: 'grouped',
      sessionTargetHands: 20,
      handOrdinal,
      decisionOrdinal: 1,
      countsTowardCompletion: true,
      practiceOnly: false,
      expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
    },
  });
  const valid = Array.from(
    { length: 20 },
    (_, index) => makeQuestion(`q${index + 1}`, index + 1),
  );

  assert.equal(getOfflineQuestionCacheTtl(valid, now), 9 * 60 * 1000);
  assert.equal(getOfflineQuestionCacheTtl(valid.slice(1), now), 0);
  assert.equal(getOfflineQuestionCacheTtl(valid.map((question, index) => (
    index === 1
      ? { ...question, _gradingContext: { ...question._gradingContext, attemptId: 'attempt-two' } }
      : question
  )), now), 0);
  assert.equal(getOfflineQuestionCacheTtl(valid.map((question, index) => (
    index === 1
      ? { ...question, _gradingContext: { ...question._gradingContext, submissionId: 'jti-q1' } }
      : question
  )), now), 0);
  assert.equal(getOfflineQuestionCacheTtl(valid.map((question, index) => (
    index === 0
      ? { ...question, _gradingContext: { ...question._gradingContext, snapshotKey: null } }
      : question
  )), now), 0);
  assert.equal(getOfflineQuestionCacheTtl(valid.map((question, index) => (
    index === 1
      ? { ...question, _gradingContext: { ...question._gradingContext, snapshotKey: 'snapshot-q1' } }
      : question
  )), now), 0);
  assert.equal(getOfflineQuestionCacheTtl(valid.map((question, index) => (
    index === 1
      ? { ...question, _gradingContext: { ...question._gradingContext, difficultyMode: 'exact' } }
      : question
  )), now), 0);

  const fullContract = createOfflineQuestionCacheContract({
    difficulty: 'standard', gameMode: 'full', handSelection: 'all',
  });
  const riverContract = createOfflineQuestionCacheContract({
    difficulty: 'expert', gameMode: 'street', handSelection: 'all', targetStreet: 'river',
  });
  assert.notEqual(fullContract, riverContract);
  assert.notEqual(
    offlineQuestionCacheKey('cash-001', 1, 'user-one', fullContract),
    offlineQuestionCacheKey('cash-001', 1, 'user-one', riverContract),
  );
});

test('cache recovery preserves its attempt while deliberate replays remain practice-only', () => {
  const hook = read('src/hooks/useGTOTrainer.js');
  const arena = read('src/components/training/GodModeArena.jsx');

  assert.match(hook, /authedFetch\('\/api\/training\/reissue-questions'/);
  assert.match(hook, /const reissueBody = \{[\s\S]*questionIds,[\s\S]*sessionId: sessionIdOverride/);
  assert.match(hook, /sessionKind,[\s\S]*parentAttemptId,[\s\S]*requestedHands: questionIds\.length/);
  assert.match(hook, /if \(attemptId\) reissueBody\.attemptId = attemptId/);
  assert.match(hook, /attemptId: cachedAttemptId/);
  assert.match(hook, /activateFreshTrainingSession\('offline-resume', cachedSessionId\)/);
  assert.match(hook, /assertSignedTrainingDelivery\(cachedPayload, cachedSessionId\)/);
  assert.match(hook, /createChildTrainingSessionId\(trainingSessionIdRef\.current, 'retrain'\)/);
  assert.match(hook, /const prefetchSessionId = createChildTrainingSessionId\([\s\S]*`prefetch-L\$\{nextLevel\}`/);
  assert.match(hook, /assertSignedTrainingDelivery\(data, prefetchSessionId\)/);
  assert.match(hook, /reissueSignedQuestions\(mistakes, nextSessionId, selectedLevel, \{/);
  assert.match(hook, /parentAttemptId: parentAttemptIds\[0\]/);
  assert.match(hook, /activateFreshTrainingSession\('retry'\)/);
  assert.match(hook, /activateFreshTrainingSession\('reset'\)/);
  assert.match(hook, /Using signed prefetch for level/);
  assert.doesNotMatch(hook, /reissueSignedQuestions\(\s*prefetched\.questions/);
  assert.match(hook, /setEffectiveQuestionsPerLevel\(signedTargetHands\)/);
  assert.match(hook, /const loadedQuestion = await fetchSingleQuestion\([\s\S]*setQuestionNumber\(\(prev\) => prev \+ 1\)/);
  assert.doesNotMatch(hook, /setEffectiveQuestionsPerLevel\(Math\.min\(/);
  assert.match(arena, /sessionId: trainingSessionId \|\| sessionId \|\| null/);
});
