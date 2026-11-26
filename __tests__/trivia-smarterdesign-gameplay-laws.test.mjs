/**
 * Phase B Track 2 (#SMARTERDESIGN Solo Gameplay, Modes, Results, Study, Stats & Achievements)
 * Anti-Regression Laws:
 *  - Zero forbidden yellow/gold/amber/purple/violet/lavender/pink/magenta colors and zero
 *    text-transform: uppercase across all Track 2 owned files.
 *  - Arcade (pages/hub/trivia/[mode].js): never boot arcade_ticket holders or active paid
 *    sessions on Play Again or initial load; accurate "1 Free Entry Ticket" / "VIP Free" /
 *    "Free" / "10 Diamonds" pricing copy.
 *  - Strict soloRunRecovery expiry: 0ms grace for time-attack (expired 30s run never resumable),
 *    <= 5000ms skew max for other modes, plus live setTimeout + visibilitychange expiration
 *    reconciliation in useServerGradedRun.js.
 *  - Double-tap & post-advance tap-slip protection: synchronous answerLockRef, keyed options
 *    (${currentQuestion.id}-...), post-advance tap guard, and stabilized option container
 *    minHeight in both TimeAttackGame.jsx and TriviaGame.jsx.
 *  - Survival (pages/hub/trivia/survival-game.js): honest "Start New Run (Level 1)" copy on
 *    gameOver and pregame when no active parentSessionId continuation exists; only offer
 *    "Continue From Level N (Free)" when survivalParentSessionRef.current is active.
 *  - Zero redundant <GameCostPopup> blocking modals across paid solo modes ([mode].js,
 *    endless.js, mixed.js, survival-game.js, time-attack.js) and clear Back To Lobby action.
 *  - Complete ReportQuestionButton wiring: accountId in TriviaGame.jsx, key={currentQuestion.id}
 *    in survival-game.js and endless.js.
 *  - Study page CLS stabilization and .smarterdesign adoption across owned pages.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    createSoloRunRecovery,
    normalizeSoloRunRecovery,
    soloRunExpiryGraceMs,
} from '../src/lib/trivia/soloRunRecovery.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const PHASE9_FILES = readdirSync(join(ROOT, 'src/components/trivia/phase9'))
    .map((name) => `src/components/trivia/phase9/${name}`);

const TRACK2_OWNED_FILES = [
    'pages/hub/trivia/[mode].js',
    'pages/hub/trivia/mtt.js',
    'pages/hub/trivia/cash.js',
    'pages/hub/trivia/icm.js',
    'pages/hub/trivia/gto.js',
    'pages/hub/trivia/mixed.js',
    'pages/hub/trivia/endless.js',
    'pages/hub/trivia/survival-game.js',
    'pages/hub/trivia/time-attack.js',
    'pages/hub/trivia/study.js',
    'pages/hub/trivia/stats.js',
    'pages/hub/trivia/achievements.js',
    'src/components/trivia/TriviaGame.jsx',
    'src/components/trivia/StrategyTrivia.jsx',
    'src/components/trivia/strategyExperienceModel.mjs',
    'src/components/trivia/TimeAttackGame.jsx',
    'src/components/trivia/TriviaAnswerOption.jsx',
    'src/components/trivia/HintButtons.jsx',
    'src/components/trivia/TriviaResult.jsx',
    'src/components/trivia/CelebrationEffects.jsx',
    'src/components/trivia/PrizeWheel.jsx',
    'src/components/trivia/PrizeWheel.module.css',
    'src/components/trivia/ReportQuestionButton.jsx',
    'src/components/trivia/PostSettlementReviewDrawer.jsx',
    'src/components/trivia/ShareResultCardModal.jsx',
    'src/components/trivia/GTOScenarioDisplay.jsx',
    'src/components/trivia/GTOScenarioDisplay.module.css',
    'src/components/trivia/daily/DailyTriviaBroadcast.jsx',
    'src/components/trivia/daily/DailyTriviaBroadcast.module.css',
    'src/components/trivia/daily/dailyTriviaModel.mjs',
    ...PHASE9_FILES,
];

const FORBIDDEN_COLOR_AND_UPPERCASE_RE = new RegExp(
    [
        '#(?:ffd700|fbbf24|f59e0b|d97706|fef3c7|fde68a|fffbeb|78350f|facc15|fde047|eab308|ca8a04|f6c967|a855f7|c084fc|e9d5ff|8b5cf6|9d4edd|9333ea|7c3aed|ec4899|f472b6|db2777|d946ef|e879f9)',
        'tc-ink--gold',
        'ink=["\']gold["\']',
        'pillInk=["\']gold["\']',
        'tone=["\']gold["\']',
        'rgba\\(\\s*(?:25[015]|245|246|217|168|147|139|236|219)\\s*,\\s*(?:204|201|191|158|119|85|51|92|72|39)\\s*,',
        'rgb\\(\\s*255\\s+215\\s+0',
        'text-transform:\\s*uppercase',
        'textTransform:\\s*["\']uppercase["\']',
    ].join('|'),
    'i',
);

test('SMARTERDESIGN Track 2: zero forbidden colors and zero uppercase transforms across all owned gameplay/progress files', () => {
    for (const rel of TRACK2_OWNED_FILES) {
        const src = read(rel);
        const match = src.match(FORBIDDEN_COLOR_AND_UPPERCASE_RE);
        assert.equal(
            match,
            null,
            `${rel} must not contain forbidden yellow/gold/amber/purple/pink colors or uppercase CSS transforms (matched: ${match?.[0]})`,
        );
    }
});

test('SMARTERDESIGN Track 2 P0: Arcade never client-blocks arcade_ticket holders or active runs and quotes exact ticket/VIP pricing', () => {
    const modePage = read('pages/hub/trivia/[mode].js');

    // Initial load must NOT fail-closed with Not Enough Diamonds before session-start
    assert.doesNotMatch(
        modePage,
        /if\s*\(\s*mode\s*===\s*['"]arcade['"]\s*&&\s*!vipStatus\s*&&\s*arcadeFreeEntryCount\s*<\s*1\s*\)/,
        'initial load must not hard-block arcade before serverRun/session-start arbitration',
    );
    // handlePlayAgain must NOT boot arcade players back to /hub/trivia based on client diamond balance
    assert.doesNotMatch(
        modePage,
        /if\s*\(\s*mode\s*===\s*['"]arcade['"]\s*&&\s*!isVIP\s*&&\s*userDiamonds\s*<\s*\(modeConfig\?\.diamondCost\s*\|\|\s*10\)\s*\)/,
        'handlePlayAgain must not boot arcade_ticket holders back to /hub/trivia',
    );
    // Accurate pricing labels
    assert.match(modePage, /1 Free Entry Ticket/);
    assert.match(modePage, /VIP Free/);
});

test('SMARTERDESIGN Track 2 P0: soloRunRecovery enforces 0ms grace for time-attack, <= 5000ms for others, and useServerGradedRun reconciles live expiry', () => {
    assert.equal(soloRunExpiryGraceMs('time-attack'), 0);
    assert.ok(soloRunExpiryGraceMs('arcade') <= 5_000);
    assert.ok(soloRunExpiryGraceMs('daily') <= 5_000);

    const USER = '11111111-1111-4111-8111-111111111111';
    const SESSION = '22222222-2222-4222-8222-222222222222';
    const createdAt = Date.parse('2026-11-26T18:00:00Z');
    const expiresAt = '2026-11-26T18:00:30Z';

    const taRecord = createSoloRunRecovery({
        mode: 'time-attack',
        accountId: USER,
        sessionId: SESSION,
        phase: 'active',
        createdAt,
        expiresAt,
    });
    assert.ok(taRecord);
    // 1ms past expiry on 30s Time Attack must NOT be resumable
    assert.equal(
        normalizeSoloRunRecovery(taRecord, { mode: 'time-attack', accountId: USER, now: Date.parse(expiresAt) + 1 }),
        null,
        'expired 30s time-attack run must never be presented as resumable',
    );

    const arcadeRecord = createSoloRunRecovery({
        mode: 'arcade',
        accountId: USER,
        sessionId: SESSION,
        phase: 'active',
        createdAt,
        expiresAt: '2026-11-26T18:03:00Z',
    });
    assert.ok(arcadeRecord);
    assert.equal(
        normalizeSoloRunRecovery(arcadeRecord, { mode: 'arcade', accountId: USER, now: Date.parse('2026-11-26T18:03:00Z') + 5_001 }),
        null,
        'arcade run past 5s skew allowance must not be presented as resumable',
    );

    const hook = read('src/hooks/useServerGradedRun.js');
    assert.match(hook, /setTimeout\(reconcileExpiredRecovery,/);
    assert.match(hook, /visibilitychange/);
});

test('SMARTERDESIGN Track 2 P0: TimeAttackGame and TriviaGame guard answers with synchronous answerLockRef, keyed options, post-advance guard, and stabilized height', () => {
    const timeAttack = read('src/components/trivia/TimeAttackGame.jsx');
    const triviaGame = read('src/components/trivia/TriviaGame.jsx');

    for (const [name, src] of [['TimeAttackGame.jsx', timeAttack], ['TriviaGame.jsx', triviaGame]]) {
        assert.match(src, /const answerLockRef = useRef\(false\)/, `${name} must declare synchronous answerLockRef`);
        assert.match(src, /answerLockRef\.current = true;/, `${name} must lock synchronously before async grading`);
        assert.match(src, /POST_ADVANCE_TAP_GUARD_MS/, `${name} must enforce a post-advance tap guard`);
        assert.match(src, /key=\{`\$\{currentQuestion\.id\}-/, `${name} must key answer options by currentQuestion.id + index`);
        assert.match(src, /minHeight:\s*['"]248px['"]/, `${name} must stabilize answer list container height`);
    }
});

test('SMARTERDESIGN Track 2 P1: Survival gameOver and lobby copy match actual server Level 1 vs parentSessionId continuation rules', () => {
    const survival = read('pages/hub/trivia/survival-game.js');

    assert.doesNotMatch(survival, /Retry Level \$\{/, 'gameOver must never falsely claim Retry Level N while restarting Level 1');
    assert.match(survival, /Start New Run \(Level 1\)/);
    assert.match(survival, /hasActiveContinuation = Boolean\(survivalParentSessionRef\.current\)/);
    assert.match(survival, /Continue From Level \$\{formatTriviaDisplayNumber\(nextAvailableLevel\)\} \(Free\)/);
});

test('SMARTERDESIGN Track 2 P2: zero redundant GameCostPopup modals across paid solo modes and clear Back To Lobby navigation', () => {
    const paidSoloPages = [
        'pages/hub/trivia/[mode].js',
        'pages/hub/trivia/endless.js',
        'pages/hub/trivia/mixed.js',
        'pages/hub/trivia/survival-game.js',
        'pages/hub/trivia/time-attack.js',
    ];
    for (const rel of paidSoloPages) {
        const src = read(rel);
        assert.doesNotMatch(src, /GameCostPopup/, `${rel} must not render redundant GameCostPopup modal`);
        assert.match(src, /Back To Lobby/, `${rel} must provide a clear Back To Lobby action`);
        assert.match(src, /smarterdesign/, `${rel} must adopt .smarterdesign`);
    }
});

test('SMARTERDESIGN Track 2 P2: ReportQuestionButton passes accountId in TriviaGame and key={currentQuestion.id} in survival-game and endless', () => {
    const triviaGame = read('src/components/trivia/TriviaGame.jsx');
    const modePage = read('pages/hub/trivia/[mode].js');
    const survival = read('pages/hub/trivia/survival-game.js');
    const endless = read('pages/hub/trivia/endless.js');

    assert.match(triviaGame, /<ReportQuestionButton[\s\S]*?accountId=\{reportAccountId \|\| accountId\}/);
    assert.match(modePage, /reportAccountId=\{userId\}/);
    assert.match(survival, /<ReportQuestionButton[\s\S]*?key=\{currentQuestion\.id\}/);
    assert.match(endless, /<ReportQuestionButton[\s\S]*?key=\{currentQuestion\.id\}/);
});

test('SMARTERDESIGN Track 2: Study page stabilizes container height for low CLS and adopts .smarterdesign', () => {
    const study = read('pages/hub/trivia/study.js');
    assert.match(study, /smarterdesign/);
    assert.match(study, /study-stage-container/);
    assert.match(study, /minHeight:\s*['"]460px['"]/);
});
