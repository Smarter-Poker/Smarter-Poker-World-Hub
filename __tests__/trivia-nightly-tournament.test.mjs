/**
 * Phase 6 nightly tournament guard: API policy (pure), release gate ordering,
 * answer-free forwarding, legacy entry retirement, the dormant OpenClaw job and
 * the engine migration's money/ACL invariants (static).
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    NIGHTLY_ACTIONS,
    buildNightlyRpc,
    findForbiddenKeys,
    nightlyErrorStatus,
    normalizeNightlyError,
    projectNightlyDto,
} from '../src/lib/trivia/nightlyTournamentPolicy.mjs';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const T = '7f0c1d2e-3a4b-4c5d-8e6f-112233445566';
const U = '0a1b2c3d-4e5f-4a6b-9c7d-8e9fa0b1c2d3';
const Q = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

test('every action builds exactly one RPC and the user id never comes from the body', () => {
    for (const action of Object.keys(NIGHTLY_ACTIONS)) {
        const input = { tournamentId: T, matchupId: Q, action: 'open', user_id: 'attacker', p_user_id: 'attacker' };
        const built = buildNightlyRpc(action, input, U);
        assert.equal(built.ok, true, action);
        assert.match(built.rpc, /^trivia_tournament_[a-z0-9_]+$/);
        if ('p_user_id' in built.args) assert.equal(built.args.p_user_id, U, action);
    }
    assert.deepEqual(buildNightlyRpc('summary', {}, U), { ok: false, error: 'invalid_tournament_id' });
    assert.equal(buildNightlyRpc('nope', {}, U).error, 'invalid_action');
});

test('pagination is explicit and bounded (no silent row caps)', () => {
    const field = buildNightlyRpc('field', { tournamentId: T, limit: '200', offset: '400' }, U);
    assert.equal(field.rpc, 'trivia_tournament_field_v2');
    assert.equal(field.args.p_user_id, U);
    assert.equal(field.args.p_limit, 200);
    assert.equal(buildNightlyRpc('field', { tournamentId: T, limit: '201' }, null).error, 'invalid_request');
    assert.equal(buildNightlyRpc('bracket', { tournamentId: T, round: 9, limit: 256 }, null).args.p_round, 9);
    assert.equal(buildNightlyRpc('bracket', { tournamentId: T, round: 10 }, null).error, 'invalid_request');
    assert.equal(buildNightlyRpc('results', { tournamentId: T, kind: 'horse' }, null).args.p_kind, 'horse');
    assert.equal(buildNightlyRpc('results', { tournamentId: T, kind: 'robot' }, null).args.p_kind, null);
});

test('play accepts intent only: no client timing, grades or scores', () => {
    for (const k of ['correct', 'score', 'answeredAt', 'elapsedMs', 'correctIndex']) {
        const built = buildNightlyRpc('play', { tournamentId: T, action: 'answer', questionId: Q, displayIndex: 1, [k]: 1 }, U);
        assert.equal(built.error, 'client_timing_not_accepted', k);
    }
    const ok = buildNightlyRpc('play', { tournamentId: T, action: 'answer', questionId: Q, displayIndex: -1, clientNonce: Q.toUpperCase() }, U);
    assert.equal(ok.rpc, 'trivia_tournament_play_answer');
    assert.equal(ok.args.p_display_index, -1);
    assert.equal(ok.args.p_client_nonce, Q);
    assert.equal(buildNightlyRpc('play', { tournamentId: T, action: 'answer', questionId: Q, displayIndex: 8 }, U).error, 'invalid_display_index');
    assert.equal(buildNightlyRpc('play', { tournamentId: T, action: 'answer', questionId: 'x', displayIndex: 0 }, U).error, 'question_not_in_session');
    assert.equal(buildNightlyRpc('play', { tournamentId: T, action: 'question', position: 0 }, U).error, 'invalid_position');
    assert.equal(buildNightlyRpc('play', { tournamentId: T, action: 'grade' }, U).error, 'invalid_action');
    assert.equal(buildNightlyRpc('enter', { tournamentId: T, clientNonce: 'short' }, U).error, 'invalid_client_nonce');
});

test('errors map to stable statuses; unknown database errors never leak', () => {
    assert.equal(normalizeNightlyError('insufficient_funds'), 'insufficient_diamonds');
    assert.equal(nightlyErrorStatus('insufficient_diamonds'), 402);
    assert.equal(nightlyErrorStatus('registration_closed'), 409);
    assert.equal(nightlyErrorStatus('tournament_not_found'), 404);
    assert.equal(nightlyErrorStatus('vip_required'), 403);
    assert.equal(nightlyErrorStatus('horse_target_reached'), 409);
    assert.equal(nightlyErrorStatus('ledger_refused'), 503);
    assert.equal(nightlyErrorStatus('tournament_entry_retired'), 410);
    assert.equal(normalizeNightlyError('relation "x" does not exist'), 'internal_error');
    assert.equal(nightlyErrorStatus('something_new'), 500);
});

test('answer keys, horse plans and secrets are refused before forwarding', () => {
    assert.deepEqual(findForbiddenKeys({ items: [{ seed: 3, displayName: 'A', participantKind: 'horse' }] }), []);
    assert.deepEqual(findForbiddenKeys({ session: { questions: [{ correct_index: 2 }] } }), ['$.session.questions[0].correct_index']);
    assert.equal(findForbiddenKeys({ a: { chosen_original_index: 1, permutations: {} } }).length, 2);
});

test('every nightly response is projected through an action-specific nested allowlist', () => {
    const schedule = projectNightlyDto('schedule', {
        success: true, serverTime: 'now', internal: 'drop', instances: [{
            tournamentId: T, name: 'Nightly', state: 'registration', seedSecret: 'drop',
            format: { shotClockSeconds: 20, horsePlan: 'drop' },
            viewer: { entered: true, entrantId: Q, walletBalance: 999 },
        }],
    });
    assert.equal(schedule.instances[0].tournamentId, T);
    assert.equal(schedule.instances[0].format.shotClockSeconds, 20);
    assert.equal(schedule.instances[0].viewer.entered, true);
    assert.equal('internal' in schedule, false);
    assert.equal('seedSecret' in schedule.instances[0], false);
    assert.equal('horsePlan' in schedule.instances[0].format, false);
    assert.equal('walletBalance' in schedule.instances[0].viewer, false);

    const bracket = projectNightlyDto('bracket', { success: true, items: [{
        matchupId: Q, secret: 'drop', seats: [{ displayName: 'Clover', participantKind: 'horse', answerKey: 2 }],
    }] });
    assert.deepEqual(bracket.items[0].seats[0], { displayName: 'Clover', participantKind: 'horse' });

    const answer = projectNightlyDto('play', { success: true, recorded: true, sequence: 4 });
    assert.equal(answer.sequence, 4, 'answer acknowledgements preserve their scalar play sequence');
    const grade = projectNightlyDto('play', {
        success: true,
        outcome: 'correct',
        wasCorrect: true,
        correctDisplayIndex: 2,
        explanation: 'The Revealed Answer',
        correct: 10,
        score: 2000,
        per_question: [{ position: 1, question_id: Q, outcome: 'correct', correct: true, display_index: 2 }],
        sequence: [{ questionIndex: 0, result: 'correct', secret: 'drop' }],
    });
    assert.deepEqual(grade, { success: true },
        'the competitive play DTO never exposes a grading oracle, including nested results');

    const recorded = projectNightlyDto('play', { success: true, recorded: true, outcome: 'recorded' });
    assert.equal(recorded.outcome, 'recorded', 'a non-grading answer acknowledgement remains visible');
});

test('Phase 7 migration closes unscoped tournament reads and adds the server-owned PvP quote', () => {
    const sql = read('supabase/migrations/20261005120500_trivia_p7_competitive_read_boundaries.sql');
    assert.match(sql, /CREATE FUNCTION public\.trivia_tournament_visible_v1/);
    for (const name of ['field', 'bracket', 'match', 'results']) {
        assert.match(sql, new RegExp(`CREATE FUNCTION public\\.trivia_tournament_${name}_v2`));
    }
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.trivia_tournament_field_v1[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(sql, /CREATE FUNCTION public\.trivia_pvp_quote_v2/);
    assert.match(sql, /public\.trivia_rules_pvp_money/);
    assert.match(sql, /SET search_path = ''/);
});

test('release gate runs before rate limit, identity and any RPC', () => {
    const handlerSrc = read('src/lib/trivia/nightlyTournamentApiHandler.js');
    const gate = handlerSrc.indexOf('if (!areTriviaTournamentsReleased(env))');
    assert.ok(gate > 0);
    assert.ok(handlerSrc.indexOf('applyRateLimit(', gate) > gate);
    assert.ok(handlerSrc.indexOf('return await runNightlyAction(', gate) > gate);
    assert.doesNotMatch(handlerSrc, /\.from\(/, 'the API never touches tables directly');
    // Gate precedes identity and the RPC inside the shared action runner too.
    const runner = handlerSrc.slice(handlerSrc.indexOf('export async function runNightlyAction'));
    assert.ok(runner.indexOf('getServerUserWithFallback') < runner.indexOf('sb.rpc('));
    assert.match(handlerSrc, /res\.setHeader\('Cache-Control', 'private, no-store, max-age=0'\)/);
});

test('legacy entry route is the nightly engine behind the same fail-closed gate', () => {
    const src = read('pages/api/trivia/tournament-enter.js');
    assert.match(src, /if \(!areTriviaTournamentsReleased\(process\.env\)\)[\s\S]{0,180}rejectUnavailableTriviaTournament\(res\)/);
    assert.ok(
        src.indexOf('if (!areTriviaTournamentsReleased(process.env))') < src.indexOf('if (!applyRateLimit(req, res, LIMITS.write))'),
        'disabled legacy aliases refuse before consuming a rate-limit slot',
    );
    assert.match(src, /runNightlyAction\('enter'/);
    assert.doesNotMatch(src, /enter_trivia_tournament_v2/);
    const route = read('pages/api/trivia/nightly/[action].js');
    assert.match(route, /createNightlyTournamentApi\(\{ serviceClient \}\)/);
});

const migrationName = readdirSync(join(ROOT, 'supabase/migrations'))
    .find((f) => /_trivia_p6_nightly_tournament_engine\.sql$/.test(f));

test('engine migration moves money only through Phase 2 and stays owner/service-only', () => {
    assert.ok(migrationName, 'phase 6 engine migration present');
    const sql = read(`supabase/migrations/${migrationName}`);
    assert.doesNotMatch(sql, /add_diamonds_to_balance\s*\(|deduct_diamonds\s*\(|UPDATE\s+public\.profiles/i);
    for (const fn of ['trivia_ledger_hold(', 'trivia_ledger_subsidy(', 'trivia_settlement_open(', 'trivia_settlement_lock(',
        'trivia_settlement_settle(', 'trivia_rules_tournament_prizes(', 'trivia_preflight_tournament_v1(',
        'trivia_open_session_v3(', 'trivia_session_answer_v3(', 'trivia_session_submit_v3(']) {
        assert.ok(sql.includes(fn), `uses ${fn}`);
    }
    assert.match(sql, /REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(sql, /'tournament_entry_retired'/);
    assert.match(sql, /trivia_tournament_local_start_utc\(date '2026-03-08', 'America\/Chicago', time '20:00'\) <> timestamptz '2026-03-09 01:00:00\+00'/);
    assert.match(sql, /trivia_tournament_local_start_utc\(date '2026-11-01', 'America\/Chicago', time '20:00'\) <> timestamptz '2026-11-02 02:00:00\+00'/);
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS trivia_tournaments_v2_public_nightly_date_uidx/);
    assert.match(sql, /'stale_fencing_token'/);
    assert.match(sql, /the trivia_tournaments engine must stay uncapped/);
});

test('the nightly OpenClaw job ships defined, routed to the workers VM and disabled', () => {
    const py = read('scripts/openclaw-cron-dispatcher.py');
    assert.match(py, /^TRIVIA_NIGHTLY_TOURNAMENT_SCHEDULE_ENABLED = False$/m, 'enabling is the Phase 12 cutover');
    assert.match(py, /^TRIVIA_NIGHTLY_TOURNAMENT_JOB = '\/api\/cron\/trivia-nightly-tournament'$/m);
    assert.match(py, /'\/api\/cron\/trivia-nightly-tournament':\s+'\/cron\/trivia-nightly-tournament',/);
    assert.doesNotMatch(py, /^\s*\('\/api\/cron\/trivia-nightly-tournament'\s*,/m, 'never a literal ALL_CRONS entry');
    assert.match(py, /for path, trigger_kwargs in ALL_CRONS \+ active_flag_gated_crons\(\):/);
    assert.match(py, /if enabled is True\]/);
});
