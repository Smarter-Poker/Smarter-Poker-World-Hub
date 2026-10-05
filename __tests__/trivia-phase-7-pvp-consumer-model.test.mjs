import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    applyPvpAnswerReceipt,
    createPvpDtoAuthority,
    defaultPvpStake,
    derivePvpSessionProgress,
    estimatedPvpServerNow,
    formatPvpDuration,
    isAuthoritativePvpQuote,
    pvpPollDelay,
    pvpSecondsUntil,
    pvpServerAnchor,
    pvpStakeKeyboardTarget,
} from '../src/components/trivia/pvp/pvpModel.mjs';

const pvpExperience = readFileSync(
    new URL('../src/components/trivia/pvp/PvpCompetitiveExperience.jsx', import.meta.url),
    'utf8',
);
const pvpPage = readFileSync(new URL('../pages/hub/trivia/pvp.js', import.meta.url), 'utf8');

const quote = Object.freeze({
    success: true,
    engine: 'pvp-v2',
    serverNow: '2026-10-05T12:00:00.000Z',
    balance: 30,
    rulesVersion: 'pvp.standard@1',
    joinsEnabled: true,
    horseFallbackEnabled: true,
    stakes: [
        { stake: 10, pot: 20, rake: 2, possibleReturn: 18, netWin: 8 },
        { stake: 25, pot: 50, rake: 5, possibleReturn: 45, netWin: 20 },
        { stake: 50, pot: 100, rake: 10, possibleReturn: 90, netWin: 40 },
    ],
    questionCount: 20,
    humanFirst: true,
    horseWaitSeconds: { min: 20, max: 45 },
    horseLabel: 'Smarter Horse',
    cancellation: 'search_only_before_match',
    tie: 'stake_refund',
});

test('pre-commit quote must be complete and remains server-owned', () => {
    assert.equal(isAuthoritativePvpQuote(quote), true);
    assert.equal(defaultPvpStake(quote), 10);
    assert.equal(defaultPvpStake({ ...quote, balance: 27, stakes: quote.stakes.slice(1) }), 25);
    assert.equal(isAuthoritativePvpQuote({ ...quote, stakes: [{ stake: 10 }] }), false);
    assert.equal(isAuthoritativePvpQuote({ ...quote, horseLabel: 'Bot' }), false);
    assert.equal(isAuthoritativePvpQuote({ ...quote, humanFirst: false }), false);
    assert.equal(isAuthoritativePvpQuote({ ...quote, cancellation: null }), false);
    assert.equal(isAuthoritativePvpQuote({ ...quote, joinsEnabled: null }), false);
    assert.equal(isAuthoritativePvpQuote({ ...quote, horseFallbackEnabled: null }), false);
    assert.equal(isAuthoritativePvpQuote({ ...quote, rulesVersion: 'pvp.standard/roster@1' }), false);
});

test('countdowns advance from the persisted server anchor, never the browser epoch', () => {
    const anchor = pvpServerAnchor('2026-10-05T12:00:00.000Z', 5_000);
    assert.equal(estimatedPvpServerNow(anchor, 8_250), Date.parse('2026-10-05T12:00:03.250Z'));
    assert.equal(pvpSecondsUntil('2026-10-05T12:00:23.250Z', anchor, 8_250), 20);
    assert.equal(pvpSecondsUntil('2026-10-05T11:59:00.000Z', anchor, 8_250), 0);
    assert.equal(formatPvpDuration(65), '1:05');
});

test('poll cadence follows the server within a bounded live-connection range', () => {
    assert.equal(pvpPollDelay({ state: 'searching', pollAfterMs: 1_250 }), 1_250);
    assert.equal(pvpPollDelay({ state: 'playing', heartbeatSeconds: 3 }), 3_000);
    assert.equal(pvpPollDelay({ state: 'settling', pollAfterMs: 50_000 }), 10_000);
    assert.equal(pvpPollDelay({ state: 'result', pollAfterMs: 1_000 }), null);
});

test('superseded reads cannot replace a newer action, read, or account generation', () => {
    const authority = createPvpDtoAuthority();
    authority.reset();

    const stalePoll = authority.beginRead();
    assert.ok(stalePoll);
    const joinGeneration = authority.beginAction();
    assert.equal(stalePoll.signal.aborted, true);
    assert.equal(authority.canAdoptRead(stalePoll), false);
    assert.equal(authority.isActionCurrent(joinGeneration), true);

    const recovery = authority.beginRead({ actionGeneration: joinGeneration });
    assert.ok(recovery);
    assert.equal(authority.canAdoptRead(recovery), true);
    authority.finishRead(recovery);
    assert.equal(authority.finishAction(joinGeneration), true);

    const olderStatus = authority.beginRead();
    const newerStatus = authority.beginRead();
    assert.equal(olderStatus.signal.aborted, true);
    assert.equal(authority.canAdoptRead(olderStatus), false);
    assert.equal(authority.canAdoptRead(newerStatus), true);
    authority.reset();
    assert.equal(authority.canAdoptRead(newerStatus), false);
});

test('stake radiogroup keys move only through affordable choices', () => {
    assert.equal(pvpStakeKeyboardTarget(quote.stakes, 30, 10, 'ArrowRight'), 25);
    assert.equal(pvpStakeKeyboardTarget(quote.stakes, 30, 25, 'ArrowRight'), 10);
    assert.equal(pvpStakeKeyboardTarget(quote.stakes, 30, 10, 'ArrowLeft'), 25);
    assert.equal(pvpStakeKeyboardTarget(quote.stakes, 30, 25, 'Home'), 10);
    assert.equal(pvpStakeKeyboardTarget(quote.stakes, 30, 10, 'End'), 25);
    assert.equal(pvpStakeKeyboardTarget(quote.stakes, 5, 10, 'ArrowDown'), null);
    assert.equal(pvpStakeKeyboardTarget(quote.stakes, 30, 10, 'Tab'), null);
});

test('resume cursor follows authoritative question state and position, not a stale match total', () => {
    const progress = derivePvpSessionProgress([
        { id: 'question-c', position: 3, state: 'unanswered', options: ['A', 'B'] },
        { id: 'question-a', position: 1, state: 'answered', options: ['A', 'B'] },
        { id: 'question-b', position: 2, state: 'answered', options: ['A', 'B'] },
    ]);

    assert.equal(progress.valid, true);
    assert.deepEqual(progress.questions.map((question) => question.position), [1, 2, 3]);
    assert.equal(progress.completedCount, 2);
    assert.equal(progress.currentIndex, 2);
    assert.equal(progress.currentPosition, 3);
    assert.equal(progress.complete, false);
});

test('session progress fails closed instead of skipping a locked or malformed position', () => {
    const locked = derivePvpSessionProgress([
        { position: 1, state: 'locked' },
        { id: 'question-b', position: 2, state: 'unanswered', options: ['A', 'B'] },
    ]);
    assert.equal(locked.valid, true);
    assert.equal(locked.blocked, true);
    assert.equal(locked.currentIndex, -1);
    assert.equal(locked.currentPosition, 1);

    const duplicatePosition = derivePvpSessionProgress([
        { id: 'question-a', position: 1, state: 'answered', options: ['A', 'B'] },
        { id: 'question-b', position: 1, state: 'unanswered', options: ['A', 'B'] },
    ]);
    assert.equal(duplicatePosition.valid, false);
    assert.equal(duplicatePosition.error, 'session_question_position_invalid');

    const missingState = derivePvpSessionProgress([
        { id: 'question-a', position: 1, options: ['A', 'B'] },
    ]);
    assert.equal(missingState.valid, false);
    assert.equal(missingState.error, 'session_question_state_invalid');
});

test('duplicate answer paints and advances from the server-stored option', () => {
    const questions = [
        { id: 'question-a', position: 1, state: 'unanswered', options: ['A', 'B', 'C'] },
        { id: 'question-b', position: 2, state: 'unanswered', options: ['A', 'B', 'C'] },
    ];
    const applied = applyPvpAnswerReceipt(questions, 'question-a', {
        success: true,
        questionId: 'question-a',
        recorded: true,
        fresh: false,
        storedDisplayIndex: 1,
        outcome: 'recorded',
    });

    assert.equal(applied.ok, true);
    assert.equal(applied.fresh, false);
    assert.equal(applied.storedDisplayIndex, 1);
    assert.equal(applied.questions[0].state, 'answered');
    assert.equal(applied.currentPosition, 2);
    assert.equal(applied.completedCount, 1);
});

test('answer receipt validation rejects a mismatched question or invalid stored option', () => {
    const questions = [
        { id: 'question-a', position: 1, state: 'unanswered', options: ['A', 'B'] },
    ];
    assert.equal(applyPvpAnswerReceipt(questions, 'question-a', {
        success: true,
        questionId: 'question-b',
        recorded: true,
        fresh: false,
        storedDisplayIndex: 0,
    }).error, 'session_answer_receipt_invalid');
    assert.equal(applyPvpAnswerReceipt(questions, 'question-a', {
        success: true,
        questionId: 'question-a',
        recorded: true,
        fresh: true,
        storedDisplayIndex: 2,
    }).error, 'session_answer_receipt_invalid');
});

test('PvP experience wires resume and duplicate paint to server question receipts', () => {
    assert.match(pvpExperience, /derivePvpSessionProgress\(roster\)/);
    assert.match(pvpExperience, /applyPvpAnswerReceipt\(questions, question\.id, receipt\)/);
    assert.match(pvpExperience, /setSelectedAnswer\(applied\.storedDisplayIndex\)/);
    assert.match(pvpExperience, /rulesVersion: quote\.rulesVersion/);
    assert.match(pvpExperience, /quote\?\.joinsEnabled !== true/);
    assert.match(pvpExperience, /pvpHorsesEnabled && quote\.horseFallbackEnabled/);
    assert.doesNotMatch(
        pvpExperience,
        /const answered = Math\.max\(0, Math\.min\(Number\(match\.me\?\.answered\)/,
    );
});

test('PvP transport resolves only the seven maintained exact handlers', () => {
    for (const action of ['quote', 'join', 'status', 'heartbeat', 'resume', 'cancel', 'history']) {
        assert.match(pvpExperience, new RegExp(`${action}: '/api/trivia/pvp/${action}'`));
    }
    assert.match(
        pvpExperience,
        /Object\.prototype\.hasOwnProperty\.call\(PVP_ACTION_ENDPOINTS, action\)/,
    );
    assert.match(pvpExperience, /throw new Error\('unsupported_pvp_action'\)/);
    assert.doesNotMatch(pvpExperience, /\/api\/trivia\/pvp\/\$\{action\}/);
});

test('PvP DTO adoption is abortable, sequenced, action-owned, and account-bound', () => {
    assert.match(pvpExperience, /createPvpDtoAuthority\(\)/);
    assert.match(pvpExperience, /authority\.beginRead\(\{ actionGeneration, signal \}\)/);
    assert.match(pvpExperience, /authority\.canAdoptRead\(lease\)/);
    assert.match(pvpExperience, /const actionGeneration = authority\.beginAction\(\)/);
    assert.match(pvpExperience, /controller\.abort\(\)/);
    assert.match(pvpExperience, /readDto\('resume', \{ method: 'GET', actionGeneration \}\)/);
    assert.match(pvpPage, /key=\{user\?\.id \|\| 'signed-out'\}/);
});

test('stake choices expose one roving radio and keyboard selection', () => {
    assert.match(pvpExperience, /role="radiogroup"/);
    assert.match(pvpExperience, /role="radio"/);
    assert.match(pvpExperience, /tabIndex=\{!disabled && affordable && entry\.stake === rovingStake \? 0 : -1\}/);
    assert.match(pvpExperience, /onKeyDown=\{\(event\) => handleStakeKeyDown\(event, entry\.stake\)\}/);
    assert.match(pvpExperience, /optionRefs\.current\.get\(nextStake\)\?\.focus\(\)/);
});

test('PvP history is bounded, viewer-scoped through the API, horse-disclosed and receipt-linked', () => {
    assert.match(pvpExperience, /requestPvp\('history',[\s\S]*?params: \{ offset, limit: 5 \}/);
    assert.match(pvpExperience, /function PvpHistory\(/);
    assert.match(pvpExperience, /<h2 id="pvp-history-title"[\s\S]*?>Match History<\/h2>/);
    assert.match(pvpExperience, /item\.opponent\?\.isHorse \? 'Smarter Horse'/);
    assert.match(pvpExperience, /<ResultReceipts result=\{item\}/);
    assert.match(pvpExperience, /label="Older Matches"/);
    assert.match(pvpExperience, /label="Newer Matches"/);
    assert.match(pvpExperience, /Math\.min\(offset \+ 1, total\)\} To \{Math\.min\(offset \+ items\.length, total\)\} Of \{total\}/);
    assert.doesNotMatch(pvpExperience, /[–—]/);
    assert.match(pvpExperience, /historyRequestSequenceRef\.current === requestSequence/);
    assert.match(pvpExperience, /user\?\.id && bootState === 'ready'/);
    assert.match(pvpPage, /key=\{user\?\.id \|\| 'signed-out'\}/);
    assert.doesNotMatch(pvpExperience, /supabase\.(?:from|rpc)\(/);
});

test('immutable PvP transaction references remain byte-exact under the world copy policy', () => {
    assert.match(pvpExperience, /data-preserve-case=\{preserveCase \? 'true' : undefined\}/);
    assert.match(pvpExperience, /label="Stake Reference"[\s\S]{0,120}preserveCase/);
    assert.match(pvpExperience, /label="Settlement Reference"[\s\S]{0,120}preserveCase/);
    assert.match(pvpExperience, /label="Rules Version"[\s\S]{0,80}preserveCase/);
});
