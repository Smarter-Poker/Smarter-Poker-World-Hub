import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    PVP_HORSE_WAIT_MAX_SECONDS,
    PVP_HORSE_WAIT_MIN_SECONDS,
    deadlineAlignDelayMs,
    parseJoinBody,
    parseTicketId,
    pvpErrorStatus,
    toPvpDto,
} from '../src/lib/trivia/pvpMatchmakingPolicy.mjs';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const migration = (suffix) => {
    const name = readdirSync(join(ROOT, 'supabase/migrations')).find((f) => f.endsWith(suffix));
    assert.ok(name, `migration *${suffix} must exist`);
    return read(`supabase/migrations/${name}`);
};
const engineSql = migration('_trivia_p5_pvp_engine.sql');
const capSql = migration('_trivia_p5_pvp_settlement_cap_exemption.sql');
const handler = read('src/lib/trivia/pvpApiHandler.js');
const ROUTES = ['join', 'status', 'heartbeat', 'resume', 'cancel'];
const U = '11111111-1111-4111-8111-111111111111';

test('the horse window is the product contract, not configuration', () => {
    assert.equal(PVP_HORSE_WAIT_MIN_SECONDS, 20);
    assert.equal(PVP_HORSE_WAIT_MAX_SECONDS, 45);
    assert.match(engineSql, /horse_wait_seconds IS NOT NULL AND horse_wait_seconds BETWEEN 20 AND 45/);
    assert.match(engineSql, /horse_eligible_at = joined_at \+ make_interval\(secs => horse_wait_seconds\)/);
    // CSPRNG with rejection sampling: every value 20..45 equally likely.
    assert.match(engineSql, /extensions\.gen_random_bytes\(4\)[\s\S]*EXIT WHEN v_n < 4294967274[\s\S]*RETURN 20 \+ \(v_n % 26\)/);
    // Set once: identity and deadline are immutable, only the join authority creates a ticket.
    assert.match(engineSql, /NEW\.horse_eligible_at IS DISTINCT FROM OLD\.horse_eligible_at[\s\S]{0,80}RAISE EXCEPTION 'pvp v2 ticket identity and horse deadline are immutable'/);
    assert.match(engineSql, /'ticket:' \|\| NEW\.user_id::text[\s\S]{0,200}created only by the join authority/);
});

test('matching is human first and a horse waits for the stored deadline', () => {
    const tryMatch = engineSql.slice(engineSql.indexOf('CREATE FUNCTION public.trivia_pvp__try_match'),
        engineSql.indexOf('CREATE FUNCTION public.trivia_pvp__join_core'));
    const human = tryMatch.indexOf('trivia_pvp__create_human_match');
    const horse = tryMatch.indexOf('trivia_pvp__create_horse_match');
    assert.ok(human > 0 && horse > human, 'the human claim runs before any horse is considered');
    assert.match(tryMatch, /trivia_pvp__bucket_lock\(v_t\.stake_amount, v_t\.rules_version_id\)/);
    assert.match(tryMatch, /q\.lease_expires_at > v_now/, 'dead presence is never claimed');
    assert.match(tryMatch, /IF v_t\.lease_expires_at <= v_now THEN[\s\S]{0,80}presence_lapsed/);
    assert.match(tryMatch, /ORDER BY q\.joined_at, q\.id/, 'oldest compatible live human first');
    assert.match(tryMatch, /v_now >= v_t\.horse_eligible_at/);
    assert.match(engineSql, /p_now < v_t\.horse_eligible_at THEN[\s\S]{0,80}ticket_not_eligible_for_horse/);
});

test('horses: full fleet, persona/tier model, secret-seeded plan, no stake input, disclosed', () => {
    assert.doesNotMatch(engineSql, /LIMIT 50\b/);
    assert.match(engineSql, /trivia_pvp_horse_personas[\s\S]*horse_cooldown_seconds[\s\S]*horse_concurrency_ceiling/);
    assert.match(engineSql, /extensions\.hmac\(convert_to\(\s*'pvp-horse-plan\/1:'/);
    assert.match(engineSql, /'stake_is_input', false/);
    const sig = engineSql.slice(engineSql.indexOf('CREATE FUNCTION public.trivia_pvp__build_horse_plan('),
        engineSql.indexOf(') RETURNS jsonb', engineSql.indexOf('CREATE FUNCTION public.trivia_pvp__build_horse_plan(')));
    assert.doesNotMatch(sig, /stake/i, 'the answer plan never sees the stake');
    assert.match(engineSql, /plan_hash[\s\S]*encode\(extensions\.digest\(v_envelope::text, 'sha256'\), 'hex'\)/);
    // No model or network call anywhere in the engine: the plan is pure SQL.
    assert.doesNotMatch(engineSql, /net\.http_(post|get)|http_request|extensions\.http\b|dblink/i);
    // The horse answers through the same engine v3 RPC as a human browser.
    assert.match(engineSql, /public\.trivia_session_answer_v3\(v_s\.id, v_plan\.horse_id/);
    const dto = toPvpDto({ state: 'playing', match: { id: U, opponent: { kind: 'horse', display_name: 'Clover', is_horse: true } } });
    assert.equal(dto.match.opponent.label, 'Smarter Horse');
    assert.equal(dto.match.opponent.isHorse, true);
});

test('escrow and settlement go only through the Phase 2 ledger in one transaction', () => {
    assert.doesNotMatch(engineSql, /add_diamonds_to_balance\s*\(|deduct_diamonds\s*\(|UPDATE public\.profiles/);
    assert.match(engineSql, /trivia_ledger_hold\([\s\S]{0,200}'pvp_stake'/);
    assert.match(engineSql, /trivia_ledger_subsidy\([\s\S]{0,200}'horse_seat'/);
    assert.match(engineSql, /trivia_settlement_lock\('pvp_match', p_match_id\)/);
    const settle = engineSql.slice(engineSql.indexOf('CREATE FUNCTION public.trivia_pvp__settle_core'),
        engineSql.indexOf('CREATE FUNCTION public.trivia_pvp__advance_match'));
    const order = ['trivia_settlement_settle(', 'INSERT INTO public.trivia_pvp_settlement_decisions',
        "SET status = 'complete'", 'record_trivia_pvp_stats_v2(', 'trivia_close_roster_scope_v1('].map((s) => settle.indexOf(s));
    assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `settlement order ${order}`);
    assert.match(settle, /'on_wallet_refusal', 'fail'/);
    assert.match(engineSql, /pvp v2 matches settle only through trivia_pvp_settle authority/);
});

test('no browser write path and exact function ACLs are asserted inside the migration', () => {
    assert.match(engineSql, /REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(engineSql, /GRANT EXECUTE ON FUNCTION[\s\S]*trivia_pvp_join_v2[\s\S]*TO service_role;/);
    assert.match(engineSql, /post-apply failed: browser competitive write path reopened/);
    assert.match(engineSql, /post-apply failed: trivia_pvp function ACL\/definer\/search_path drift/);
    for (const fn of ['join', 'status', 'cancel', 'settle', 'recover', 'metrics']) {
        assert.match(engineSql, new RegExp(`CREATE FUNCTION public\\.trivia_pvp_${fn}_v2[\\s\\S]{0,400}auth\\.role\\(\\)\\) IS DISTINCT FROM 'service_role'`));
    }
});

test('the earning-cap exemption is tight: only pvp_win moves to an uncapped engine', () => {
    assert.match(capSql, /md5\(v_def\) <> '44a39c35cc96801b5aa22a6ac930ee17'/);
    assert.match(capSql, /WHEN COALESCE\(p_transaction_type, p_type\) = 'pvp_win' THEN 'trivia_pvp'/);
    assert.match(capSql, /fn_ca_diamond_engine_of\('trivia_run'[\s\S]{0,80}<> 'trivia'/);
    assert.match(capSql, /VALUES \('trivia_pvp', NULL, NULL,/);
});

test('every PvP route is gated, authenticated and returns only the sanitized DTO', () => {
    for (const route of ROUTES) {
        const src = read(`pages/api/trivia/pvp/${route}.js`);
        assert.match(src, new RegExp(`createPvpRoute\\('${route}', \\{ serviceClient \\}\\)`));
    }
    const gate = handler.indexOf('if (!isTriviaPvpReleased(env))');
    const auth = handler.indexOf('getServerUserWithFallback(req, sb)');
    const rpc = handler.indexOf('sb.rpc(rpc, args)');
    assert.ok(gate > 0 && auth > gate && rpc > auth, 'gate, then auth, then the RPC');
    assert.match(handler, /rejectUnavailableTriviaPvp\(res\)/);
    assert.match(handler, /p_user_id: user\.id/);
    assert.doesNotMatch(handler, /body\.(userId|user_id|opponent|winner|score|amount)/);
    assert.doesNotMatch(handler, /\.from\(/, 'routes never read tables directly');
    assert.match(handler, /toPvpDto\(data\)/);
    assert.match(handler, /areTriviaPvpHorsesReleased\(env\)/);
});

test('transport validation and DTO allowlist', () => {
    assert.deepEqual(parseJoinBody({ stake: 25, clientNonce: U }), { ok: true, stake: 25, clientNonce: U });
    assert.equal(parseJoinBody({ stake: 30, clientNonce: U }).error, 'invalid_stake');
    assert.equal(parseJoinBody({ stake: '25', clientNonce: 'x' }).error, 'invalid_client_nonce');
    assert.equal(parseTicketId(undefined), null);
    assert.equal(parseTicketId('nope'), undefined);
    assert.equal(pvpErrorStatus('insufficient_diamonds'), 402);
    assert.equal(pvpErrorStatus('pvp_joins_paused'), 503);
    const dto = toPvpDto({
        success: true, state: 'searching', server_now: '2026-09-30T00:00:00Z', poll_after_ms: 2000,
        ticket: { id: U, status: 'waiting', stake: 25, horse_wait_seconds: 31, horse_eligible_at: '2026-09-30T00:00:04Z',
                  presence: 'live', horse_fallback_enabled: true, queue_position: 3, other_user_id: U },
        match: null, plan: [{ c: true }], answer_key: [1], roster: [U],
    });
    assert.equal(dto.state, 'searching');
    assert.equal(dto.ticket.horseWaitSeconds, 31);
    for (const leak of ['plan', 'answer_key', 'roster']) assert.equal(leak in dto, false);
    assert.equal('queue_position' in dto.ticket || 'other_user_id' in dto.ticket, false);
    assert.equal(toPvpDto({ state: 'nonsense' }).state, 'idle');
    assert.equal(deadlineAlignDelayMs(dto), 4025);
    assert.equal(deadlineAlignDelayMs({ ...dto, ticket: { ...dto.ticket, presence: 'lapsed' } }), 0);
    assert.equal(deadlineAlignDelayMs({ ...dto, ticket: { ...dto.ticket, horseFallbackEnabled: false } }), 0);
});

test('legacy PvP paths cannot move money on a v2 match', () => {
    const start = read('pages/api/trivia/session-start.js');
    assert.match(start, /if \(match\.engine_version\) \{\s*return serveV2PvpSeat\(res, sb, userId, match\);/);
    const serve = start.slice(start.indexOf('async function serveV2PvpSeat'), start.indexOf('async function reloadPvpDurableBinding'));
    assert.doesNotMatch(serve, /create_trivia_pvp_session_v2|add_diamonds|trivia_ledger|\.insert\(|\.update\(/);
    assert.match(serve, /rpc\('trivia_session_view_v3'/);
    const settle = read('pages/api/trivia/pvp-settle-match.js');
    assert.match(settle, /if \(match\.engine_version\) \{[\s\S]{0,200}rpc\('trivia_pvp_settle_v2'/);
    const cron = read('pages/api/cron/pvp-settle.js');
    assert.match(cron, /\.is\('engine_version', null\)/);
    assert.match(cron, /rpc\('trivia_pvp_recover_v2'/);
});
