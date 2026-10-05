import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    TOURNAMENT_API_ACTIONS,
    chooseTournamentInstance,
    currentPathMatchupIds,
    firstOpenQuestion,
    mergeOpenedQuestion,
    nextLockedPosition,
    participantLabel,
    registrationAction,
    secondsUntil,
    serverNowMs,
    sessionProgress,
    tournamentEntryDialogAction,
    tournamentViewState,
} from '../src/components/trivia/tournaments/tournamentModel.mjs';

const source = readFileSync(new URL('../pages/hub/trivia/tournaments.js', import.meta.url), 'utf8');
const sections = readFileSync(new URL('../src/components/trivia/tournaments/TournamentSections.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/worlds/trivia-console-tournaments.css', import.meta.url), 'utf8');

const tournament = Object.freeze({
    tournamentId: '11111111-1111-4111-8111-111111111111',
    state: 'registration',
    registrationOpensAt: '2026-10-05T23:00:00.000Z',
    registrationClosesAt: '2026-10-06T01:00:00.000Z',
    entryFee: 25,
    humanSeatsRemaining: 58,
    viewer: { entered: false },
});

test('nightly consumer selection and state stay server-owned', () => {
    const active = { ...tournament, tournamentId: '22222222-2222-4222-8222-222222222222', state: 'live', viewer: { entered: true } };
    assert.equal(chooseTournamentInstance([tournament, active])?.tournamentId, active.tournamentId);
    assert.equal(chooseTournamentInstance([tournament, active], tournament.tournamentId)?.tournamentId, tournament.tournamentId);

    const nowMs = Date.parse('2026-10-06T00:00:00.000Z');
    assert.equal(tournamentViewState({ tournament, nowMs }), 'open');
    assert.deepEqual(registrationAction(tournament, null, nowMs), { kind: 'enter', label: 'Enter For 25 Diamonds' });
    assert.equal(tournamentViewState({ tournament: { ...tournament, viewer: { entered: true } }, nowMs }), 'entered');
    assert.equal(registrationAction({ ...tournament, viewer: { entered: true } }, null, nowMs), null);
    assert.equal(tournamentViewState({ tournament: { ...tournament, state: 'cancelled', viewer: { entered: true } }, nowMs }), 'refund');
    assert.equal(tournamentViewState({ tournament, myRun: { entrant: { status: 'champion' } }, receipt: { payout: { amount: 500 } }, nowMs }), 'paid');
});

test('countdowns advance from the server anchor and never invent a round clock', () => {
    const receivedAt = 5_000;
    const serverTime = '2026-10-06T00:00:00.000Z';
    const estimated = serverNowMs(serverTime, receivedAt, 8_250);
    assert.equal(estimated, Date.parse('2026-10-06T00:00:03.250Z'));
    assert.equal(secondsUntil('2026-10-06T00:00:23.250Z', estimated), 20);
    assert.equal(secondsUntil('2026-10-05T23:59:00.000Z', estimated), 0);
});

test('entry dialog retries only failures that can succeed without changing entry terms', () => {
    assert.equal(tournamentEntryDialogAction('insufficient_diamonds'), 'diamonds');
    for (const code of ['internal_error', 'rate_limited', 'offline', 'ledger_refused', 'tournaments_temporarily_unavailable']) {
        assert.equal(tournamentEntryDialogAction(code), 'retry', code);
    }
    for (const code of ['registration_closed', 'registration_not_open', 'tournament_full', 'vip_required', 'tournament_not_found', 'invalid_request']) {
        assert.equal(tournamentEntryDialogAction(code), 'close', code);
    }
    assert.match(source, /entryDialogAction === 'retry'[\s\S]{0,180}Retry Entry/);
});

test('question resume exposes only the next server-opened question', () => {
    const locked = { position: 2, state: 'locked' };
    const open = { position: 1, state: 'unanswered', id: 'q1', question: 'Question?', options: ['A', 'B'] };
    const session = { questionCount: 3, questions: [open, locked, { position: 3, state: 'timeout' }] };
    assert.equal(firstOpenQuestion(session), open);
    assert.equal(nextLockedPosition(session), 2);
    const merged = mergeOpenedQuestion(session, { position: 2, state: 'unanswered', id: 'q2', question: 'Next?', options: ['C', 'D'] });
    assert.equal(firstOpenQuestion({ ...merged, questions: merged.questions.slice(1) })?.id, 'q2');
    assert.deepEqual(sessionProgress(merged), { complete: 1, total: 3 });
});

test('an authoritative same-question refresh re-enables answer and timeout retry', () => {
    assert.match(source, /if \(alreadyOpen\) \{[\s\S]{0,360}setSelectedAnswer\(null\);[\s\S]{0,180}timeoutSentRef\.current = null;[\s\S]{0,180}setActiveQuestion\(alreadyOpen\);/);
    assert.match(source, /answerNonceRef\.current\.get\(attemptKey\)/, 'the retry keeps the original question operation identity');
});

test('changing the selected tournament clears every event-scoped consumer cache', () => {
    const resetStart = source.indexOf('const resetTournamentContext');
    const resetEnd = source.indexOf('const beginTournamentContext', resetStart);
    assert.ok(resetStart >= 0 && resetEnd > resetStart);
    const reset = source.slice(resetStart, resetEnd);
    for (const setter of [
        'setTournament(null)', 'setSummary(null)', 'setMyRun(null)', 'setCurrentMatch(null)',
        'setReceipt(null)', 'setBracket(null)', 'setField(null)', 'setResults(null)',
        'setSession(null)', 'setActiveQuestion(null)', 'setSelectedAnswer(null)',
    ]) {
        assert.ok(reset.includes(setter), `${setter} is reset at the context boundary`);
    }
    assert.match(source, /const changed = tournamentIdRef\.current !== nextId;[\s\S]{0,100}if \(changed\) resetTournamentContext\(\);/);
    assert.match(source, /const \[summaryPayload, runPayload\] = await Promise\.all\([\s\S]{0,120}tournamentIdRef\.current !== id/,
        'a late core response cannot repopulate the previous tournament after a context change');
});

test('account transitions remount all private tournament state and signed-out receipts stay hidden', () => {
    assert.match(source, /const accountKey = authLoading \? 'auth-loading' : user\?\.id \? `account:\$\{user\.id\}` : 'signed-out';/);
    assert.match(source, /<TournamentPageExperience key=\{accountKey\} user=\{user\} authLoading=\{authLoading\} \/>/,
        'logout and A-to-B changes destroy the prior account-owned state and request effects');

    const receiptStart = sections.indexOf('export function TournamentReceipt');
    const historyStart = sections.indexOf('export function TournamentHistory', receiptStart);
    assert.ok(receiptStart >= 0 && historyStart > receiptStart);
    const receipt = sections.slice(receiptStart, historyStart);
    assert.match(receipt, /\{signedIn && receipt \? \(/,
        'transaction references never render without an authenticated account');
    assert.doesNotMatch(receipt, /\n\s*\{receipt \? \(/);
});

test('immutable tournament receipt references remain byte-exact under the world copy policy', () => {
    assert.match(sections, /data-preserve-case=\{row\.preserveCase \? 'true' : undefined\}/);
    for (const label of ['Rules', 'Entry Reference', 'Journal', 'Refund Reference', 'Payout Reference', 'Settlement ID', 'Idempotency Key']) {
        assert.match(sections, new RegExp(`label: '${label}'[^\\n]+preserveCase: true`), label);
    }
});

test('responsive tournament view selectors use honest native button semantics', () => {
    const tabsStart = sections.indexOf('export function TournamentTabs');
    const tabsEnd = sections.indexOf('export function TournamentEventLedger', tabsStart);
    assert.ok(tabsStart >= 0 && tabsEnd > tabsStart);
    const tabs = sections.slice(tabsStart, tabsEnd);
    assert.match(tabs, /<nav className="tt-tabs" aria-label="Nightly Tournament Views">/);
    assert.match(tabs, /type="button"[\s\S]{0,160}aria-pressed=\{value === tab\.id\}/);
    assert.doesNotMatch(tabs, /role="tab(?:list)?"|aria-controls|aria-selected/,
        'a responsive view switcher must not claim an APG tab relationship that desktop does not render');
    assert.doesNotMatch(source, /role="tabpanel"/);
});

test('history opens the selected event summary and receipt without the eight-day schedule', () => {
    assert.match(sections, /onClick=\{\(\) => onOpenReceipt\(item\.tournamentId\)\}/);
    const actionStart = source.indexOf('const openHistoricalReceipt');
    const actionEnd = source.indexOf('const bootstrap', actionStart);
    assert.ok(actionStart >= 0 && actionEnd > actionStart);
    const action = source.slice(actionStart, actionEnd);
    assert.match(action, /nightlyRequest\('summary', \{ params: \{ tournamentId: historicalTournamentId \} \}\)/);
    assert.match(action, /nightlyRequest\('receipt', \{ params: \{ tournamentId: historicalTournamentId \} \}\)/);
    assert.match(action, /beginTournamentContext\(historicalTournamentId, \{ skipCoreLoad: true \}\)/);
    assert.match(action, /setReceipt\(receiptPayload\)/);
    assert.match(action, /autoResumeRef\.current\.add\(runPayload\.current\.matchupId\)/,
        'opening a current history row cannot replace its receipt with an automatic question resume');
    assert.match(action, /setActiveTab\('receipt'\)/);
    assert.doesNotMatch(action, /nightlyRequest\('schedule'/);
});

test('every horse and current bracket path is disclosed exactly', () => {
    assert.equal(participantLabel({ displayName: 'RiverBot', participantKind: 'horse' }), 'RiverBot (Smarter Horse)');
    assert.equal(participantLabel({ displayName: 'Smarter Horse', participantKind: 'horse' }), 'Smarter Horse');
    assert.deepEqual([...currentPathMatchupIds({ history: [{ matchupId: 'past' }], current: { matchupId: 'now' } })], ['past', 'now']);
    assert.match(sections, /participantLabel\(seat\)/);
    assert.match(sections, /participantLabel\(opponent\)/);
});

test('page uses the complete nightly API and no retired tournament authority', () => {
    assert.deepEqual(TOURNAMENT_API_ACTIONS, [
        'schedule', 'summary', 'enter', 'field', 'bracket', 'match', 'my-run', 'play', 'results', 'receipt', 'history',
    ]);
    for (const action of TOURNAMENT_API_ACTIONS) {
        assert.match(source, new RegExp(`nightlyRequest\\('${action.replace('-', '\\-')}'`), `${action} is wired`);
    }
    assert.match(source, /\/api\/trivia\/nightly\/\$\{action\}/);
    assert.match(source, /triviaTournamentPageReleaseResult/);
    assert.doesNotMatch(source, /\bsupabase\b|\/api\/trivia\/tournament(?:-|\/)|useTriviaTimer|initialTime|24 hours/i);
    assert.doesNotMatch(source, /correctIndex|elapsedMs|answeredAt/);
});

test('mobile and desktop composition preserve the rendered casino console', () => {
    const artIndex = source.lastIndexOf('<ResponsiveModeArt');
    const gridIndex = source.indexOf('<div className="tt-console-grid"');
    assert.ok(artIndex >= 0 && artIndex < gridIndex, 'rendered tournament art leads the entry composition');
    assert.match(source, /TRIVIA_INTRO_ART_TOURNAMENTS/);
    assert.match(source, /Add Calendar Reminder|downloadCalendarReminder/);
    assert.match(sections, /Transaction Receipt/);
    assert.match(sections, /Nightly History/);
    assert.match(css, /\.tt-run \{ order: 1; \}/);
    assert.match(css, /grid-template-columns: minmax\(0, 3fr\) minmax\(0, 6fr\) minmax\(0, 3fr\)/);
    assert.match(css, /content-visibility: auto/);
    assert.match(css, /min-height: 44px/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /forced-colors: active/);
    assert.doesNotMatch(css, /(?:linear|radial)-gradient|backdrop-filter|border-radius/i);
});
