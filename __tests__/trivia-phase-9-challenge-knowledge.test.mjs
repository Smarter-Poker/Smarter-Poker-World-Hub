import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    orderDealerChoiceQuestions,
    PHASE9_KNOWLEDGE_CONTEXT,
    projectPhase9Recovery,
} from '../src/components/trivia/phase9/phase9RunModel.mjs';
import {
    createSoloRunRecovery,
    readSoloRunRecovery,
    writeSoloRunRecovery,
} from '../src/lib/trivia/soloRunRecovery.mjs';
import {
    isIneligibleEndlessHighScoreProjection,
    isPersistedEndlessHighScoreProjection,
    isTerminalEndlessHighScoreProjection,
} from '../src/lib/trivia/highScoreProjectionPolicy.mjs';
import { isRetiredTriviaRunError } from '../src/lib/trivia/runRecoveryPolicy.mjs';
import { createAccountOperationScope } from '../src/lib/trivia/accountOperationScope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key),
    };
}

test('knowledge rooms expose distinct archive, ruling, editorial and inventory contracts', () => {
    assert.deepEqual(Object.keys(PHASE9_KNOWLEDGE_CONTEXT).sort(), ['arcade', 'history', 'pro', 'rules']);
    assert.match(PHASE9_KNOWLEDGE_CONTEXT.arcade.summary, /wheel.*Diamonds.*streak shield.*free Arcade entry/i);
    assert.match(PHASE9_KNOWLEDGE_CONTEXT.history.summary, /Date or event context/i);
    assert.match(PHASE9_KNOWLEDGE_CONTEXT.rules.summary, /Tournament rules, cash-game procedure, and house rules can differ/i);
    assert.match(PHASE9_KNOWLEDGE_CONTEXT.pro.summary, /do not imply affiliation, sponsorship, or endorsement/i);
});

test('account recovery adopts only server-recorded answers and verdicts', () => {
    const projection = projectPhase9Recovery([
        { id: 'q1', state: 'answered', answerState: { storedDisplayIndex: 2, wasCorrect: true, outcome: 'correct' } },
        { id: 'q2', state: 'answered', answerState: { storedDisplayIndex: 0, wasCorrect: false, outcome: 'wrong' } },
        { id: 'q3', state: 'pending' },
    ]);
    assert.equal(projection.complete, false);
    assert.equal(projection.questionIndex, 2);
    assert.equal(projection.correctCount, 1);
    assert.equal(projection.wrongCount, 1);
    assert.deepEqual(projection.recordedAnswers, [
        { questionId: 'q1', displayIndex: 2 },
        { questionId: 'q2', displayIndex: 0 },
    ]);
    assert.equal(projection.verdicts[0].wasCorrect, true);
    assert.equal(projection.verdicts[1].wasCorrect, false);
});

test('Survival recovery counts a paid skip as a consumed non-correct slot without changing Endless misses', () => {
    const roster = [
        { id: 'q1', state: 'answered', answerState: { storedDisplayIndex: -1, wasCorrect: false, outcome: 'skip' } },
        { id: 'q2', state: 'answered', answerState: { storedDisplayIndex: 0, wasCorrect: false, outcome: 'wrong' } },
        { id: 'q3', state: 'pending' },
    ];
    assert.equal(projectPhase9Recovery(roster).wrongCount, 1);
    assert.equal(projectPhase9Recovery(roster, { countPaidSkipsAsWrong: true }).wrongCount, 2);
});

test('Endless resume uses server miss authority when timeout and paid skip share the same stored outcome', () => {
    const indistinguishableRoster = [
        { id: 'timeout', state: 'answered', answerState: { storedDisplayIndex: -1, wasCorrect: false, outcome: 'skip' } },
        { id: 'paid-skip', state: 'answered', answerState: { storedDisplayIndex: -1, wasCorrect: false, outcome: 'skip' } },
        { id: 'next', state: 'pending' },
    ];
    assert.equal(projectPhase9Recovery(indistinguishableRoster).wrongCount, 0,
        'the roster alone cannot distinguish a timeout from a paid skip');
    const recovered = projectPhase9Recovery(indistinguishableRoster, {
        authoritativeFailureCount: 1,
    });
    assert.equal(recovered.projectedWrongCount, 0);
    assert.equal(recovered.wrongCount, 1);

    const endless = read('pages/hub/trivia/endless.js');
    assert.match(endless, /authoritativeFailureCount: resumed\.nonPaidMissCount/);
    assert.match(endless, /resumed\.runMissLimitReached === true/);
    assert.match(endless, /skipReceipt\.nonPaidMissCount/);
    assert.match(endless, /skipReceipt\.runMissLimitReached/);
});

test('pending timeout custody survives reload and remains account, mode and session scoped', () => {
    const storage = memoryStorage();
    const accountId = '11111111-1111-4111-8111-111111111111';
    const otherAccountId = '22222222-2222-4222-8222-222222222222';
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const questionId = '44444444-4444-4444-8444-444444444444';
    const stored = writeSoloRunRecovery(storage, createSoloRunRecovery({
        mode: 'endless',
        accountId,
        sessionId,
        phase: 'active',
        pendingTimeoutQuestionId: questionId,
    }));

    assert.equal(stored.pendingTimeoutQuestionId, questionId);
    assert.equal(readSoloRunRecovery(storage, 'endless', accountId)?.pendingTimeoutQuestionId, questionId);
    assert.equal(readSoloRunRecovery(storage, 'survival', accountId), null);
    assert.equal(readSoloRunRecovery(storage, 'endless', otherAccountId), null);

    const cleared = writeSoloRunRecovery(storage, createSoloRunRecovery({
        ...stored,
        pendingTimeoutQuestionId: null,
    }));
    assert.equal(cleared.pendingTimeoutQuestionId, null);
    assert.equal(readSoloRunRecovery(storage, 'endless', accountId)?.sessionId, sessionId);
});

test('server-run hook persists a timeout before transport and rebinds out-of-order answers and paid skips', () => {
    const hook = read('src/hooks/useServerGradedRun.js');
    const answerStart = hook.indexOf('const answer = useCallback');
    const paidSkipStart = hook.indexOf('const paidSkip = useCallback', answerStart);
    const submitStart = hook.indexOf('const submit = useCallback', paidSkipStart);
    assert.ok(answerStart >= 0 && paidSkipStart > answerStart && submitStart > paidSkipStart);
    const answer = hook.slice(answerStart, paidSkipStart);
    const paidSkip = hook.slice(paidSkipStart, submitStart);

    const persistIndex = answer.indexOf('persistPendingTimeout(questionId, id)');
    const transportIndex = answer.indexOf("postJson(\n                '/api/trivia/session-answer'");
    const clearIndex = answer.indexOf('clearPendingTimeout(questionId, id)');
    assert.ok(persistIndex >= 0 && persistIndex < transportIndex,
        'the exact expired question must be durable before its request leaves');
    assert.ok(clearIndex > transportIndex,
        'timeout custody clears only after an authoritative response');
    assert.match(answer, /code === 'position_out_of_order'[\s\S]*persistPendingTimeout\(e\.payload\.priorQuestionId, id\)/);
    assert.match(paidSkip, /code === 'position_out_of_order'[\s\S]*persistPendingTimeout\(e\.payload\.priorQuestionId, id\)/);
    assert.match(hook, /pendingTimeoutQuestionId: recoverableSession\?\.pendingTimeoutQuestionId \|\| null/);
    assert.match(hook, /verified\.pendingTimeoutQuestionId !== written\.pendingTimeoutQuestionId/);
});

test('Endless and Survival fail closed on an unconfirmed timeout and expose an exact retry', () => {
    for (const page of ['endless', 'survival-game']) {
        const source = read(`pages/hub/trivia/${page}.js`);
        const gradeStart = source.indexOf('async function gradeAnswer');
        const gradeEnd = source.indexOf('// Side effects that used to key off', gradeStart);
        assert.ok(gradeStart >= 0 && gradeEnd > gradeStart);
        const gradeAnswer = source.slice(gradeStart, gradeEnd);

        assert.match(gradeAnswer, /else if \(displayIndex < 0\) \{[\s\S]*holdExpiredQuestionForRetry\(q\.id\)/);
        assert.doesNotMatch(gradeAnswer, /sessionAnswersRef\.current\.push|advanceToNextQuestion|setCurrentIndex\(prev|setCurrentQuestionIndex\(prev|missesRef\.current \+=|incorrectCountRef\.current \+=/,
            'a failed timeout may not mutate local score or advance the roster');
        assert.match(source, /serverRun\.answer\(\{\s*questionId: pendingTimeoutQuestionId,\s*displayIndex: -1,/);
        assert.match(source, /const pendingTimeoutId = timeoutRetryQuestionId \|\| serverRun\.pendingTimeoutQuestionId/);
        assert.match(source, /code === 'position_out_of_order'[\s\S]*priorQuestionId[\s\S]*holdExpiredQuestionForRetry/);
        assert.match(source, /Expired Answer Needs Confirmation/);
        assert.match(source, /aria-describedby="(?:endless|survival)-timeout-retry-copy"/);
        assert.match(source, /Retry Expired Answer/);
        assert.match(source, /disabled=\{trivia\.selectedAnswer !== null \|\| trivia\.showResult \|\| timeoutRetryRequired\}/);
    }
});

test('Dealer Choice uses a stable accessible round-robin without changing question identity', () => {
    const input = [
        { id: 'h1', displayCategory: 'history' },
        { id: 'h2', displayCategory: 'history' },
        { id: 'r1', displayCategory: 'rules' },
        { id: 'p1', displayCategory: 'pro' },
        { id: 'r2', displayCategory: 'rules' },
    ];
    const ordered = orderDealerChoiceQuestions(input, ['history', 'rules', 'pro']);
    assert.deepEqual(ordered.map(question => question.id), ['h1', 'r1', 'p1', 'h2', 'r2']);
    assert.deepEqual(new Set(ordered.map(question => question.id)), new Set(input.map(question => question.id)));
});

test('survival compatibility route is a server redirect with no client initialization surface', () => {
    const source = read('pages/hub/trivia/survival.js');
    assert.match(source, /getServerSideProps/);
    assert.match(source, /destination: LIVE_SURVIVAL_ROUTE/);
    assert.match(source, /return null/);
    assert.doesNotMatch(source, /useEffect|useRouter|useServerGradedRun|DiamondEngine|session-start/);
});

test('all Phase 9 game surfaces wire recovery, receipt or canonical redirect contracts', () => {
    const knowledge = read('pages/hub/trivia/[mode].js');
    for (const mode of ['arcade', 'history', 'rules', 'pro']) assert.match(knowledge, new RegExp(`['\"]${mode}['\"]`));
    assert.match(knowledge, /PHASE9_KNOWLEDGE_MODES/);
    assert.match(knowledge, /serverRun\.hasRecoverableSession/);
    assert.match(knowledge, /Phase9SettlementReceipt/);
    assert.doesNotMatch(knowledge, /className="mode-art-button"/);

    for (const page of ['endless', 'mixed', 'survival-game', 'time-attack']) {
        const source = read(`pages/hub/trivia/${page}.js`);
        assert.match(source, /serverRun\.hasRecoverableSession/);
        assert.match(source, /serverRun\.resume/);
        assert.match(source, /Phase9SettlementReceipt/);
        assert.match(source, /phase9-intro-layout/);
    }
});

test('challenge specifics remain explicit and truthful', () => {
    const endless = read('pages/hub/trivia/endless.js');
    assert.match(endless, /Pause Game/);
    assert.match(endless, /Resume Game/);
    assert.match(endless, /Phase9RunReview/);
    assert.match(endless, /Share Result/);

    const mixed = read('pages/hub/trivia/mixed.js');
    assert.match(mixed, /Dealer's Choice Rotation Order/);
    assert.match(mixed, /Category Breakdown/);

    const survival = read('pages/hub/trivia/survival-game.js');
    assert.match(survival, /Lives Remaining/);
    assert.match(survival, /Checkpoint/);
    assert.match(survival, /trivia:survival-level:v1/);

    const timePage = read('pages/hub/trivia/time-attack.js');
    const timeGame = read('src/components/trivia/TimeAttackGame.jsx');
    assert.equal((timePage.match(/Time Is Up/g) || []).length, 1);
    assert.equal((timeGame.match(/Time Is Up/g) || []).length, 1, 'component mentions terminal copy only in its explanatory comment');
    assert.match(timePage, /The Clock Will Not Be Restarted/);
    assert.match(timePage, /Personal Best/);
    assert.match(timePage, /Daily Cap/);
});

test('Endless trusts only the server high-score projection and reports partial persistence', () => {
    const endless = read('pages/hub/trivia/endless.js');
    assert.match(endless, /const \[highScorePersistenceError, setHighScorePersistenceError\]/);
    assert.match(endless, /const \[confirmedNewHighScore, setConfirmedNewHighScore\]/);
    assert.match(endless, /const \{ data, error \} = await supabase[\s\S]*?from\('endless_high_scores'\)/);
    assert.match(endless, /if \(error\) throw error/);
    assert.match(endless, /function applyAuthoritativeHighScoreProjection/);
    assert.match(endless, /function authoritativeEndlessSettlement/);
    assert.match(endless, /const projection = settlement\?\.highScoreProjection/);
    assert.match(endless, /isPersistedEndlessHighScoreProjection\(projection\)/);
    assert.match(endless, /setHighScore\(projection\.highScore\)/);
    assert.match(endless, /setConfirmedNewHighScore\(projection\.improved\)/);
    assert.match(endless, /isIneligibleEndlessHighScoreProjection\(projection\)/);
    assert.match(endless, /This Recovered Run Is Not Eligible For A High-Score Projection/);
    assert.match(endless, /Server High-Score Projection Is Still Pending/);
    assert.match(endless, /\{confirmedNewHighScore && \(/);
    assert.match(endless, /<dt>Best Streak<\/dt>\s*<dd>\{highScoreResolved \? formatTriviaDisplayNumber\(highScore\) : 'Unavailable'\}<\/dd>/);
    assert.doesNotMatch(endless, /formatTriviaDisplayNumber\(Math\.max\(highScore, streak\)\)/);
    assert.match(endless, /highScoreProjectionPending[\s\S]*?Retry Record Projection/);
    assert.match(endless, /isTerminalEndlessHighScoreProjection\(projection\)/);
    assert.match(endless, /const resumed = await serverRun\.resume\(\{ count: QUESTIONS_PER_SESSION \}\)/);
    assert.match(endless, /if \(!isTerminalEndlessHighScoreProjection\(/);
    assert.doesNotMatch(endless, /from\('endless_high_scores'\)[\s\S]{0,500}\.upsert\(/);
    assert.doesNotMatch(endless, /highScoreBaselineVerifiedRef|preGameHighScore/);
    assert.doesNotMatch(endless, /\{streak >= preGameHighScore/);
    assert.doesNotMatch(endless, /settled\.correct\) \? settled\.correct : streakRef\.current/);
    assert.doesNotMatch(endless, /Number\(settled\.correct\) \|\| 0/);
    assert.equal((endless.match(/applyAuthoritativeHighScoreProjection\(settled, operationScope\)/g) || []).length, 3,
        'normal settlement, lost-response recovery and explicit pending retry must apply the same projection receipt');
});

test('only complete server projection receipts are terminal or displayable as records', () => {
    const persisted = {
        status: 'persisted',
        highScore: 12,
        verifiedCorrect: 10,
        improved: true,
        replayed: false,
        projectionId: '11111111-1111-4111-8111-111111111111',
    };
    assert.equal(isPersistedEndlessHighScoreProjection(persisted), true);
    assert.equal(isTerminalEndlessHighScoreProjection(persisted), true);
    assert.equal(isTerminalEndlessHighScoreProjection({ ...persisted, projectionId: null }), false);
    assert.equal(isTerminalEndlessHighScoreProjection({ status: 'persisted', highScore: 12, improved: true }), false);
    assert.equal(isTerminalEndlessHighScoreProjection(undefined), false);
    const ineligible = {
        status: 'ineligible',
        reason: 'historical_run_boundary_overrun',
        highScore: null,
        improved: false,
    };
    assert.equal(isIneligibleEndlessHighScoreProjection(ineligible), true);
    assert.equal(isTerminalEndlessHighScoreProjection(ineligible), true);
});

test('challenge pages hide prior-account runs and retire terminal server sessions without retry loops', () => {
    for (const page of ['endless', 'survival-game']) {
        const source = read(`pages/hub/trivia/${page}.js`);
        assert.match(source, /accountBoundaryPending = shouldGateAccountOwnedRender\(\{/);
        assert.match(source, /Loading The Authoritative Run For This Account/);
        assert.match(source, /isRetiredTriviaRunError\(error\)|isRetiredTriviaRunError\(e\)/);
        assert.match(source, /Custody Was Retired; Start A Fresh/);
    }
    for (const code of ['session_not_found', 'session_closed', 'session_expired', 'session_not_resumable', 'session_mode_conflict', 'no_open_session']) {
        assert.equal(isRetiredTriviaRunError({ code }), true, code);
    }
    assert.equal(isRetiredTriviaRunError({ code: 'temporarily_unavailable' }), false);
});

test('an authentication-loading boundary invalidates a scheduled timeout before it can mutate the prior run', () => {
    const accountScope = createAccountOperationScope('account-a');
    const scheduledTimeout = accountScope.capture();
    accountScope.transition(null);
    assert.equal(accountScope.isCurrent(scheduledTimeout), false);

    for (const page of ['endless', 'survival-game']) {
        const source = read(`pages/hub/trivia/${page}.js`);
        assert.match(source, /const resolvedAccountId = authLoading\s*\? null/);
        assert.match(source, /accountOperationScopeRef\.current\.transition\(resolvedAccountId\)/);
        assert.match(source, /if \(!authLoading\) return;\s*timer\.setIsTimerRunning\(false\);[\s\S]*?setGameState/);
        assert.match(source, /function handleTimeOut\(\) \{\s*timer\.setIsTimerRunning\(false\);\s*setScreenShake\(false\);\s*if \(authLoading\) return;/);
        assert.match(source, /useServerGradedRun\([^\n]+\{ accountId: resolvedAccountId \}\)/);
    }
});

test('Survival recovers and settles only against the server-owned level boundary', () => {
    const page = read('pages/hub/trivia/survival-game.js');
    const hook = read('src/hooks/useServerGradedRun.js');
    const recovery = read('src/lib/trivia/soloRunRecovery.mjs');
    assert.doesNotMatch(page, /function readRecoveredLevel/);
    assert.match(page, /resumed\?\.survivalLevel \?\? resumed\?\.settlement\?\.survivalLevel/);
    assert.match(page, /servedLevel = authoritativeSurvivalLevel\(served\.survivalLevel\)/);
    assert.match(page, /settledLevel = authoritativeSurvivalLevel\(settled\.survivalLevel\)/);
    assert.match(page, /!Number\.isInteger\(resumed\?\.requiredCorrect\)[\s\S]*?resumed\.requiredCorrect !== recoveredConfig\.minCorrect/);
    assert.match(page, /!Number\.isInteger\(served\.requiredCorrect\)[\s\S]*?served\.requiredCorrect !== LEVEL_CONFIG\[servedLevel - 1\]\.minCorrect/);
    assert.match(page, /submittedCorrect = authoritativeSurvivalCorrect\(submitted\?\.correct\)/);
    assert.match(page, /serverCorrect = authoritativeSurvivalCorrect\(settled\.correct\)/);
    assert.doesNotMatch(page, /settled\.correct\) \? settled\.correct : correctCountRef\.current/);
    assert.match(page, /!serverRun\.sessionId && serverRun\.hasRecoverableSession[\s\S]*?serverRun\.resume\(\{ count: QUESTIONS_PER_LEVEL \}\)/);
    assert.match(hook, /survivalLevel: Number\.isInteger\(json\.survivalLevel\)/);
    assert.match(hook, /survivalLevel: settlement\?\.survivalLevel/);
    assert.doesNotMatch(hook, /survivalLevel:\s*Number\.isInteger\(settlement\?\.survivalLevel\)[\s\S]{0,160}recovery\.survivalLevel/);
    const submit = read('pages/api/trivia/session-submit.js');
    assert.match(submit, /function normalizeHighScoreProjection\(value, mode, expectedCorrect = null\)/);
    assert.match(submit, /value\.verifiedCorrect !== expectedCorrect/);
    assert.match(recovery, /survivalLevel >= 1 && value\.survivalLevel <= 10/);

    const storage = memoryStorage();
    const record = createSoloRunRecovery({
        mode: 'survival',
        accountId: '22222222-2222-4222-8222-222222222222',
        sessionId: '11111111-1111-4111-8111-111111111111',
        phase: 'active',
        survivalLevel: 6,
    });
    assert.equal(record.survivalLevel, 6);
    assert.ok(writeSoloRunRecovery(storage, record));
    assert.equal(readSoloRunRecovery(storage, 'survival', record.accountId).survivalLevel, 6);
});

test('Endless and Survival use the authoritative paid-skip receipt and recover its cap', () => {
    for (const page of ['endless', 'survival-game']) {
        const source = read(`pages/hub/trivia/${page}.js`);
        assert.match(source, /serverRun\.paidSkip\(\{ questionId: question\.id \}\)/);
        assert.match(source, /setUserDiamonds\(skipReceipt\.newBalance\)/);
        assert.match(source, /setIsVip\(skipReceipt\.currentVipEligible === true\)/);
        assert.doesNotMatch(source, /setIsVip\(skipReceipt\.(?:vip|entitlementWasVip) === true\)/);
        assert.match(source, /skipReceipt\.newlyCharged && skipReceipt\.diamondsCharged > 0/);
        assert.match(source, /Number\(resumed\.paidSkipCount\)/);
        assert.match(source, /Number\(served\.paidSkipCount\)/);
        assert.match(source, /paid_skip_limit_reached/);
        assert.match(source, /run_miss_limit_reached/);
        assert.match(source, /const lifelineLocked = lifelinesUsedThis(?:Game|Level) >= MAX_LIFELINES_PER_(?:GAME|LEVEL);/);
        assert.doesNotMatch(source, /lifelineLocked[\s\S]{0,160}userDiamonds/);
        assert.match(source, /disabled=\{lifelineLocked \|\| skipUsedThisQuestion \|\| answerLockRef\.current\}/);
        assert.doesNotMatch(source, /paidSkipRecovery|DiamondEngine\.deduct\(/);
    }
});

test('Survival paid skip updates lives and settles immediately when the fixed roster becomes unwinnable', () => {
    const survival = read('pages/hub/trivia/survival-game.js');
    assert.match(survival, /projectPhase9Recovery\(resumedQuestions, \{\s*countPaidSkipsAsWrong: true,\s*authoritativeFailureCount: resumed\.terminalFailureCount,/);
    assert.match(survival, /setLifelinesUsedThisLevel\(skipReceipt\.paidSkipCount\);\s*incorrectCountRef\.current = skipReceipt\.terminalFailureCount;\s*setIncorrectCount\(incorrectCountRef\.current\);/);
    assert.match(survival, /const remainingQuestions = levelLength - currentQuestionIndex - 1;\s*const maxPossibleCorrect = correctCountRef\.current \+ remainingQuestions;/);
    assert.match(survival, /skipReceipt\.runMissLimitReached === true[\s\S]{0,180}maxPossibleCorrect < LEVEL_CONFIG\[currentLevel - 1\]\.minCorrect\) \{\s*setGameState\('saving_progress'\);\s*saveLevelResult\(operationScope\);/);
    assert.match(survival, /resumed\.runMissLimitReached === true/);
});

test('reduced motion removes Phase 9 shake, haptics, loops and celebrations at the effect source', () => {
    const hook = read('src/components/trivia/phase9/usePhase9ReducedMotion.js');
    assert.match(hook, /prefers-reduced-motion: reduce/);
    for (const file of ['pages/hub/trivia/endless.js', 'pages/hub/trivia/survival-game.js']) {
        const source = read(file);
        assert.match(source, /!reduceMotion && settings\.haptics/);
        assert.match(source, /!reduceMotion && settings\.screenShake/);
        assert.match(source, /!reduceMotion && settings\.audio/);
    }
    assert.match(read('src/components/trivia/TimeAttackGame.jsx'), /if \(!reduceMotion\) busEmit\.screenShake/);
});

test('mobile survival bays and desktop Phase 9 composition have explicit breakpoints', () => {
    const css = read('src/styles/worlds/trivia-console-challenge.css');
    assert.match(css, /\.trivia-challenge-levels\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
    assert.match(css, /@media \(min-width: 720px\)[\s\S]*?\.trivia-challenge-levels\s*\{[\s\S]*?repeat\(5,/);
    assert.match(css, /@media \(min-width: 860px\)[\s\S]*?\.phase9-intro-layout\s*\{[\s\S]*?grid-template-columns:/);
});
