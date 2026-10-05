import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from '@babel/parser';
import {
    formatDailyResetCountdown,
    getNextDailyReset,
    normalizeDailyLeaderboard,
    projectDailyAttempt,
    projectDailyResume,
} from '../src/components/trivia/daily/dailyTriviaModel.mjs';

const ROOT = process.cwd();
const read = path => readFileSync(join(ROOT, path), 'utf8');

test('Daily reset is anchored to the next Chicago midnight across DST boundaries', () => {
    assert.deepEqual(getNextDailyReset(new Date('2026-01-15T18:00:00Z')), {
        date: '2026-01-16',
        iso: '2026-01-16T00:00:00-06:00',
        timestamp: Date.parse('2026-01-16T00:00:00-06:00'),
    });
    assert.equal(formatDailyResetCountdown(new Date('2026-01-15T18:00:00Z')), '12h 0m');

    // Spring-forward day contains 23 local hours; fall-back contains 25.
    assert.equal(getNextDailyReset(new Date('2026-03-08T07:30:00Z')).iso, '2026-03-09T00:00:00-05:00');
    assert.equal(formatDailyResetCountdown(new Date('2026-03-08T07:30:00Z')), '21h 30m');
    assert.equal(getNextDailyReset(new Date('2026-11-01T06:30:00Z')).iso, '2026-11-02T00:00:00-06:00');
    assert.equal(formatDailyResetCountdown(new Date('2026-11-01T06:30:00Z')), '23h 30m');
});

test('Daily attempt projection makes auth, recovery, completion and failure explicit', () => {
    assert.equal(projectDailyAttempt({ signedIn: false, status: 'ready' }).key, 'signed-out');
    assert.equal(projectDailyAttempt({ signedIn: true, online: false, status: 'ready' }).key, 'offline');
    assert.equal(projectDailyAttempt({ signedIn: true, status: 'loading' }).key, 'loading');
    assert.equal(projectDailyAttempt({ signedIn: true, status: 'error' }).key, 'error');
    assert.equal(projectDailyAttempt({ signedIn: true, status: 'ready', recoverable: true }).key, 'recoverable');
    assert.equal(projectDailyAttempt({ signedIn: true, status: 'ready', completed: true }).key, 'completed');
    assert.equal(projectDailyAttempt({ signedIn: true, status: 'ready' }).key, 'available');
});

test('Daily standings normalize untrusted display values without inventing rows', () => {
    assert.deepEqual(normalizeDailyLeaderboard(null), []);
    assert.deepEqual(normalizeDailyLeaderboard([
        { userId: 'u1', username: '  Ace  ', streak: -4, bestStreak: 8.9, accuracy: 140, gamesPlayed: 3.8 },
        { userId: 'u2', username: '', streak: 4, accuracy: -2, gamesPlayed: -1 },
        { username: 'missing id' },
    ]), [
        { userId: 'u1', username: 'Ace', streak: 0, bestStreak: 8, accuracy: 100, gamesPlayed: 3 },
        { userId: 'u2', username: 'Player', streak: 4, bestStreak: 0, accuracy: 0, gamesPlayed: 0 },
    ]);
});

test('Daily resume restores only server-bound progress and lands on the first outstanding question', () => {
    const projection = projectDailyResume([
        { state: 'answered', answerState: { storedDisplayIndex: 2, wasCorrect: true, outcome: 'correct' } },
        { state: 'answered', answerState: { storedDisplayIndex: -1, wasCorrect: false, outcome: 'skip' } },
        { state: 'answered', answerState: { storedDisplayIndex: 0, wasCorrect: false, outcome: 'wrong' } },
        { state: 'unanswered' },
    ]);
    assert.equal(projection.complete, false);
    assert.equal(projection.questionIndex, 3);
    assert.deepEqual(projection.answers, [2, -1, 0]);
    assert.deepEqual(Object.keys(projection.verdicts), ['0', '1', '2']);
    assert.equal(projection.correctCount, 1);
    assert.equal(projection.streak, 0);

    const complete = projectDailyResume([
        { state: 'answered', answerState: { storedDisplayIndex: 1, wasCorrect: true, outcome: 'correct' } },
        { state: 'timeout' },
    ]);
    assert.equal(complete.complete, true);
    assert.equal(complete.questionIndex, 2);
    assert.equal(complete.correctCount, 1);

    const neutralVoid = projectDailyResume([
        { state: 'answered', answerState: { storedDisplayIndex: 1, wasCorrect: true, outcome: 'correct' } },
        { state: 'answered', answerState: { storedDisplayIndex: -1, wasCorrect: false, outcome: 'voided' } },
        { state: 'unanswered' },
    ]);
    assert.equal(neutralVoid.streak, 1, 'an authoritative void does not penalize the recovered run');
});

test('Daily route and owned components parse and carry the complete recovery contract', () => {
    const files = [
        'pages/hub/trivia/[mode].js',
        'src/components/trivia/TriviaGame.jsx',
        'src/components/trivia/daily/DailyTriviaBroadcast.jsx',
    ];
    for (const file of files) {
        assert.doesNotThrow(() => parse(read(file), { sourceType: 'module', plugins: ['jsx'] }), `${file} parses`);
    }

    const page = read(files[0]);
    assert.match(page, /const resolvedAccountId = authLoading[\s\S]*avatarUser\?\.id \|\| getAuthUser\(\)\?\.id \|\| null/);
    assert.match(page, /useServerGradedRun\(mode, \{ accountId: resolvedAccountId \}\)/);
    assert.match(page, /serverRun\.hasRecoverableSession/);
    assert.match(page, /serverRun\.resume\(/);
    assert.match(page, /resumed\?\.resumedSettlement && resumed\.settlement/);
    assert.match(page, /handleComplete\([\s\S]*resumed\.settlement\)/);
    assert.match(page, /Sign In To Play/);
    assert.match(page, /\/auth\/login\?redirect=\/hub\/trivia\/daily/);
    assert.match(page, /<DailyTriviaBroadcast/);
    assert.match(page, /<DailySettlementReceipt result=\{result\}/);
    assert.match(page, /reportSessionId=\{serverGraded \? serverRun\.sessionId : null\}/);
    assert.match(page, /projectDailyResume\(resumedQuestions\)/);
    assert.match(page, /initialAnswers=\{mode === 'daily' \? dailyResumeSeed\.answers : null\}/);
    assert.match(page, /initialVerdicts=\{mode === 'daily' \? dailyResumeSeed\.verdicts : null\}/);
    assert.match(page, /onInvalidQuestionRefresh=\{mode === 'daily' \? resumeDailyRun : null\}/);
    assert.match(page, /voidedCount:/);
    assert.match(page, /Number\.isFinite\(authoritativeTotal\)/);
    assert.doesNotMatch(page, /Number\(serverResult\.total\) \|\| totalQuestions/);
    assert.match(page, /receipt: useServerPayout && serverResult\?\.receipt/);
    assert.doesNotMatch(page, /`trivia_session_\$\{serverResult\.sessionId\}`/);
    assert.match(page, /await loadDailyAccountState\(userId\)/, 'settlement refreshes authoritative streak state');
});

test('Daily art is passive and the mobile-first broadcast becomes a separate desktop split', () => {
    const component = read('src/components/trivia/daily/DailyTriviaBroadcast.jsx');
    const css = read('src/components/trivia/daily/DailyTriviaBroadcast.module.css');
    assert.match(component, /<div className=\{styles\.artStage\}>[\s\S]*?<ResponsiveModeArt/);
    assert.doesNotMatch(component, /<button[^>]*>[\s\S]{0,300}<ResponsiveModeArt/);
    assert.match(component, /Loading Verified Standings/);
    assert.match(component, /No Verified Daily Finishes Are Posted Yet/);
    assert.match(component, /Retry Standings/);
    assert.match(component, /Settlement Receipt/);
    assert.match(component, /Settlement Reference/);
    assert.match(component, /Result Hash/);
    assert.match(component, /receipt\?\.transactions/);
    assert.match(component, /Reward Transaction/);
    assert.match(component, /Bonus Transaction/);
    assert.match(css, /\.broadcast \{[\s\S]*display: grid/);
    assert.match(css, /@media \(min-width: 1024px\)[\s\S]*grid-template-columns:/);
    assert.match(css, /\.artStage \{[\s\S]*grid-column: 1;[\s\S]*grid-row: 1;/);
    assert.match(css, /\.statusDeck \{[\s\S]*grid-column: 2;[\s\S]*grid-row: 1;/);
    assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /:hover/);
});

test('Daily settlement keeps every authoritative receipt identifier byte-for-byte', () => {
    const component = read('src/components/trivia/daily/DailyTriviaBroadcast.jsx');
    const receipt = component.slice(component.indexOf('export function DailySettlementReceipt'));

    assert.match(receipt, /<dd data-preserve-case="true">\{receipt\?\.sessionId \|\| result\.sessionId\}<\/dd>/);
    assert.match(receipt, /<dd data-preserve-case="true">\{receipt\.scoreId\}<\/dd>/);
    assert.match(receipt, /<dd data-preserve-case="true">\{receipt\.settlementReference\}<\/dd>/);
    assert.match(receipt, /<dd data-preserve-case="true">\{receipt\.requestId\}<\/dd>/);
    assert.match(receipt, /<dd data-preserve-case="true">\{receipt\.resultHash\}<\/dd>/);
    assert.match(receipt, /<dd data-preserve-case="true">\{transaction\.referenceId\}<\/dd>/);
    assert.match(receipt, /<dd data-preserve-case="true">\{transaction\.id\}<\/dd>/);
    assert.match(receipt, /<dd data-preserve-case="true">\{transaction\.kind\}<\/dd>/);
    assert.doesNotMatch(receipt, /toTitleCase|normalizeWorldCopy/);
    assert.doesNotMatch(receipt, /`trivia_(?:session|daily_bonus)_\$\{/);
});

test('server answer uncertainty locks the same answer and keyboard shortcuts stay local', () => {
    const game = read('src/components/trivia/TriviaGame.jsx');
    assert.match(game, /pendingAnswerRef/);
    assert.match(game, /verdict\?\.storedDisplayIndex/);
    assert.match(game, /Retry This Same Answer To Continue/);
    assert.match(game, />\s*Retry Answer\s*</);
    assert.match(game, /answerConfirmed/);
    assert.match(game, /onKeyDown=\{onGameKeyDown\}/);
    assert.match(game, /target\?\.closest\?\.\('button, a, input, textarea, select, summary,/);
    assert.doesNotMatch(game, /window\.addEventListener\('keydown'/);
    assert.match(game, /sessionId=\{reportSessionId\}/);
    assert.match(game, /questionIntegrityIssue/);
    assert.match(game, /invalidQuestion: true/);
    assert.match(game, /verdict\?\.voided !== true/);
    assert.match(game, /displayIndex: -1/);
    assert.match(game, /Skip Unavailable Question/);
    assert.match(game, /Reload Verified Question/);
});
