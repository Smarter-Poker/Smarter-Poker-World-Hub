import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { TRIVIA_MIDDLE_MODES } from '../src/config/triviaModeRegistry.mjs';

const ROOT = process.cwd();
const read = file => readFileSync(join(ROOT, file), 'utf8');

const lobby = read('src/components/trivia/TriviaLobby.jsx');
const hub = read('pages/hub/trivia/index.js');
const menus = read('src/config/hamburgerMenus.js');
const start = read('pages/api/trivia/session-start.js');
const submit = read('pages/api/trivia/session-submit.js');
const daily = read('pages/api/trivia/daily.js');
const hook = read('src/hooks/useServerGradedRun.js');
const wheel = read('src/components/trivia/PrizeWheel.jsx');
const answerLock = read('supabase/migrations/20260827190000_trivia_answer_key_lockdown.sql');
const atomicEntry = read('supabase/migrations/20260827190500_trivia_atomic_session_entry.sql');
const verifiedScores = read('supabase/migrations/20260827191000_trivia_verified_scores.sql');
const replaySettlement = read('supabase/migrations/20260827231000_trivia_phase6_settlement_replay.sql');

test('lobby exposes every public game and uses recoverable, prefetched routes', () => {
    assert.ok(TRIVIA_MIDDLE_MODES.some(mode => mode.id === 'time-attack'));
    assert.ok(existsSync(join(ROOT, 'public/images/trivia/modes-v2/time-attack.webp')));
    assert.match(lobby, /await router\.push\(getModeRoute\(modeId\)\)/);
    assert.match(lobby, /setRouteError\('That game could not be opened/);
    assert.match(lobby, /router\.prefetch\(route\)/);
    assert.match(lobby, /'\/hub\/vip-membership'/);
});

test('entry disclosure is a semantic, focus-managed, scroll-locked dialog', () => {
    assert.match(lobby, /role="dialog"/);
    assert.match(lobby, /aria-modal="true"/);
    assert.match(lobby, /acquireScrollLock\('trivia-entry-disclosure'\)/);
    assert.match(lobby, /event\.key === 'Escape'/);
    assert.match(lobby, /event\.key !== 'Tab'/);
    assert.match(lobby, /previousFocusRef\.current\.focus\(\)/);
    assert.match(lobby, /@media \(forced-colors: active\)/);
    assert.match(lobby, /min-height: 44px/);
});

test('hamburger shortcuts resolve to real routes and the hub uses one preference schema', () => {
    assert.match(menus, /Daily Challenge', '\/hub\/trivia\/daily'/);
    assert.match(menus, /Quick Play', '\/hub\/trivia\/arcade'/);
    assert.match(menus, /Practice Mode', '\/hub\/trivia\?filter=knowledge'/);
    assert.match(hub, /hintsEnabled: false/);
    assert.doesNotMatch(hub, /showHints:/);
    assert.match(hub, /triviaAudio\.setMuted/);
    // PIN MOVED (mobile phase 7, 2026-09-14): HubPageShell renders the page's
    // <main>; the module's content class now sits on the div inside it.
    assert.match(hub, /<div className=\{styles\.content\}>/);
    assert.match(hub, /<HubPageShell\s+className="trivia"/);
});

test('public question surfaces cannot return answer keys', () => {
    assert.match(answerLock, /REVOKE SELECT ON public\.trivia_questions FROM anon, authenticated/);
    assert.match(answerLock, /p\.proname = 'get_unseen_questions'/);
    assert.match(answerLock, /'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated'/);
    assert.match(answerLock, /has_function_privilege\('authenticated', p\.oid, 'EXECUTE'\)/);
    assert.equal(/PUBLIC_QUESTION_COLUMNS\s*=\s*[^\n]*correct_index/.test(daily), false);
    assert.match(daily, /\.map\(toPublicQuestion\)/);
});

test('session start owns canonical run sizes and atomic entry charging', () => {
    assert.match(start, /const SESSION_QUESTION_COUNTS =/);
    assert.doesNotMatch(start, /Number\.isInteger\(count\)/);
    assert.match(start, /invalid_start_nonce/);
    assert.match(start, /rpc\('create_trivia_session_v2'/);
    assert.match(start, /await recordQuestionsSeen/);
    assert.match(hook, /pendingStartNonceRef/);
    assert.match(hook, /parentSessionId/);
    assert.match(atomicEntry, /p_reference_id => 'trivia_entry_' \|\| p_session_id::text/);
    assert.match(atomicEntry, /entry_state IN \('legacy', 'free', 'vip', 'charged', 'continuation'\)/);
    assert.match(atomicEntry, /CREATE UNIQUE INDEX IF NOT EXISTS trivia_sessions_one_child/);
});

test('settlement persists a verified score atomically and closes wheel forgery paths', () => {
    assert.match(submit, /rpc\('award_trivia_run_v2'/);
    assert.match(submit, /validateTriviaAwardResponse\(award/);
    assert.match(submit, /scoreId: receipt\.scoreId/);
    assert.match(submit, /invalid_award_receipt/);
    assert.match(replaySettlement, /COALESCE\(p_answered,0\)>=p_total/);
    assert.match(verifiedScores, /REVOKE INSERT, UPDATE, DELETE ON public\.trivia_scores FROM anon, authenticated/);
    assert.match(verifiedScores, /server_verified IS NOT TRUE OR v_score\.session_id IS NULL/);
    assert.match(verifiedScores, /pg_advisory_xact_lock/);
    assert.match(wheel, /result\.reward\.serverResolved !== true/);
});

test('no active Trivia client inserts its own score row', () => {
    const clientFiles = [
        'pages/hub/trivia/[mode].js',
        'pages/hub/trivia/mixed.js',
        'pages/hub/trivia/endless.js',
        'pages/hub/trivia/survival-game.js',
        'pages/hub/trivia/time-attack.js',
        'src/components/trivia/StrategyTrivia.jsx',
    ];
    for (const file of clientFiles) {
        assert.doesNotMatch(read(file), /from\(['"]trivia_scores['"]\)\s*\n?\s*\.insert\(/, file);
    }
});
