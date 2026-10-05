import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    PVP_HORSE_WAIT_MAX_SECONDS,
    PVP_HORSE_WAIT_MIN_SECONDS,
    deadlineAlignDelayMs,
    parsePvpHistoryQuery,
    parseJoinBody,
    parseTicketId,
    pvpErrorStatus,
    toPvpDto,
    toPvpHistoryDto,
    toPvpQuoteDto,
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
const quoteBindingSql = migration('_trivia_p7_pvp_quote_join_binding.sql');
const historySql = migration('_trivia_p7_pvp_history_receipts.sql');
const handler = read('src/lib/trivia/pvpApiHandler.js');
const ROUTES = ['quote', 'join', 'status', 'heartbeat', 'resume', 'cancel', 'history'];
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

test('Phase 7 joins bind the confirmed quote before queue, match or escrow mutation', () => {
    assert.match(quoteBindingSql, /CREATE FUNCTION public\.trivia_pvp_join_v3\([\s\S]*p_expected_rules_version text/);
    assert.match(quoteBindingSql, /CREATE FUNCTION public\.trivia_pvp__join_core_v3\([\s\S]*p_expected_rules_version text/);
    assert.match(quoteBindingSql, /FROM public\.trivia_rules_current AS c[\s\S]{0,120}FOR SHARE OF c/);

    const core = quoteBindingSql.slice(
        quoteBindingSql.indexOf('CREATE FUNCTION public.trivia_pvp__join_core_v3('),
        quoteBindingSql.indexOf('CREATE FUNCTION public.trivia_pvp_join_v3('),
    );
    const compare = core.indexOf('v_rules_version IS DISTINCT FROM p_expected_rules_version');
    const insert = core.indexOf('INSERT INTO public.trivia_pvp_queue');
    const match = core.indexOf('trivia_pvp__try_match');
    assert.ok(compare > 0 && insert > compare && match > insert,
        'stale quote refusal must precede ticket creation and matching');
    assert.match(core, /v_ticket\.rules_version_id IS DISTINCT FROM p_expected_rules_version/);
    assert.match(core, /v_existing_rules_version IS DISTINCT FROM p_expected_rules_version/);
    assert.match(quoteBindingSql, /REVOKE ALL ON FUNCTION public\.trivia_pvp_join_v2\([\s\S]{0,120}service_role/);
    assert.match(quoteBindingSql, /GRANT EXECUTE ON FUNCTION public\.trivia_pvp_join_v3\([\s\S]{0,120}TO service_role/);
});

test('Phase 7 quote reports database join and horse capability without bypassing release control', () => {
    assert.match(quoteBindingSql, /CREATE FUNCTION public\.trivia_pvp_quote_v3\(p_user_id uuid\)/);
    assert.match(quoteBindingSql, /'joinsEnabled', v_cfg\.joins_enabled/);
    assert.match(quoteBindingSql, /'horseFallbackEnabled', v_cfg\.joins_enabled AND v_cfg\.horses_enabled/);
    assert.match(handler, /rpc = 'trivia_pvp_quote_v3'/);
    assert.match(handler, /rpc = 'trivia_pvp_join_v3'/);
    assert.match(handler, /p_expected_rules_version: parsed\.rulesVersion/);
    assert.match(handler, /toPvpQuoteDto\(data, \{ horsesAllowed \}\)/);
});

test('Phase 7 history is viewer-scoped, bounded, service-only and receipt-backed', () => {
    const historyFunction = historySql.slice(
        historySql.indexOf('CREATE FUNCTION public.trivia_pvp_history_v1'),
        historySql.indexOf('ALTER FUNCTION public.trivia_pvp_history_v1'),
    );
    assert.match(historySql, /CREATE FUNCTION public\.trivia_pvp_history_v1\(/);
    assert.match(historySql, /p_user_id IN \(m\.player1_id, m\.player2_id\)/);
    assert.match(historySql, /p_limit < 1 OR p_limit > 20[\s\S]*p_offset < 0 OR p_offset > 500/);
    assert.match(historySql, /'stake_reference'[\s\S]*'settlement_reference'[\s\S]*d\.reference_family/);
    assert.match(historySql, /'receipts', credits\.receipts/);
    assert.match(historySql, /WHEN COALESCE\(opponent\.is_horse, false\) THEN 'Smarter Horse'/);
    assert.match(historySql, /auth\.role\(\)\) IS DISTINCT FROM 'service_role'/);
    assert.match(historySql, /REVOKE ALL ON FUNCTION public\.trivia_pvp_history_v1[\s\S]*PUBLIC, anon, authenticated, service_role/);
    assert.match(historySql, /GRANT EXECUTE ON FUNCTION public\.trivia_pvp_history_v1[\s\S]*TO service_role/);
    assert.match(historySql, /search_path = ''/);
    assert.doesNotMatch(historyFunction, /'answer|question_ids|session_id|horse_plan|roster/i);
    assert.match(handler, /rpc = 'trivia_pvp_history_v1'/);
    assert.match(handler, /toPvpHistoryDto\(data\)/);
});

test('the earning-cap exemption is tight: only pvp_win moves to an uncapped engine', () => {
    assert.match(capSql, /md5\(v_def\) <> '247d01bac63a1c273019cce221ea168f'/);
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
    assert.deepEqual(parseJoinBody({ stake: 25, clientNonce: U, rulesVersion: 'pvp.standard@1' }), {
        ok: true, stake: 25, clientNonce: U, rulesVersion: 'pvp.standard@1',
    });
    assert.equal(parseJoinBody({ stake: 30, clientNonce: U, rulesVersion: 'pvp.standard@1' }).error, 'invalid_stake');
    assert.equal(parseJoinBody({ stake: '25', clientNonce: 'x', rulesVersion: 'pvp.standard@1' }).error, 'invalid_client_nonce');
    assert.equal(parseJoinBody({ stake: 25, clientNonce: U }).error, 'invalid_rules_version');
    assert.equal(parseJoinBody({ stake: 25, clientNonce: U, rulesVersion: 'pvp.other@1' }).error, 'invalid_rules_version');
    assert.equal(parseTicketId(undefined), null);
    assert.equal(parseTicketId('nope'), undefined);
    assert.deepEqual(parsePvpHistoryQuery({}), { ok: true, limit: 10, offset: 0 });
    assert.deepEqual(parsePvpHistoryQuery({ limit: '20', offset: '500' }), { ok: true, limit: 20, offset: 500 });
    assert.equal(parsePvpHistoryQuery({ limit: 21 }).error, 'invalid_pagination');
    assert.equal(parsePvpHistoryQuery({ offset: -1 }).error, 'invalid_pagination');
    assert.equal(pvpErrorStatus('insufficient_diamonds'), 402);
    assert.equal(pvpErrorStatus('pvp_joins_paused'), 503);
    assert.equal(pvpErrorStatus('rules_quote_stale'), 409);
    assert.equal(pvpErrorStatus('match_quarantined'), 409);
    assert.equal(pvpErrorStatus('treasury_unavailable'), 503);
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

    const rawQuote = {
        serverNow: '2026-10-05T12:00:00Z', balance: 80, rulesVersion: 'pvp.standard@1',
        joinsEnabled: true, horseFallbackEnabled: true,
        stakes: [{ stake: 25, pot: 50, rake: 5, possibleReturn: 45, netWin: 20, secret: 'drop' }],
        questionCount: 20, humanFirst: true, horseWaitSeconds: { min: 20, max: 45 },
        horseLabel: 'anything', cancellation: 'search_only_before_match', tie: 'stake_refund', secret: 'drop',
    };
    const quote = toPvpQuoteDto(rawQuote, { horsesAllowed: true });
    assert.deepEqual(quote.stakes[0], { stake: 25, pot: 50, rake: 5, possibleReturn: 45, netWin: 20 });
    assert.equal(quote.joinsEnabled, true);
    assert.equal(quote.horseFallbackEnabled, true);
    assert.equal(toPvpQuoteDto(rawQuote, { horsesAllowed: false }).horseFallbackEnabled, false);
    assert.equal(quote.horseLabel, 'Smarter Horse');
    assert.equal('secret' in quote, false);

    const history = toPvpHistoryDto({
        server_now: '2026-10-05T12:00:00Z', total: 1, offset: 0, limit: 10,
        items: [{
            settled_at: '2026-10-05T11:59:00Z', rules_version_id: 'pvp.standard@1',
            opponent: { kind: 'horse', is_horse: true, display_name: 'Hidden Horse Name', horse_id: U },
            outcome: 'win', decision: 'win', forfeit: false, my_correct: 14, opponent_correct: 12,
            stake: 25, pot: 50, rake: 5, payout: 45, net: 20,
            receipts: [{ reference: 'pvp_match_win_ref', kind: 'pvp_win', amount: 45, wallet_id: U }],
            stake_reference: 'pvp_stake_ref', settlement_reference: 'pvp_settlement_ref',
            match_id: U, session_id: U, answer_key: [1],
        }],
    });
    assert.equal(history.items[0].opponent.displayName, 'Smarter Horse');
    assert.equal(history.items[0].opponent.label, 'Smarter Horse');
    assert.equal(history.items[0].stakeReference, 'pvp_stake_ref');
    assert.deepEqual(history.items[0].receipts[0], { reference: 'pvp_match_win_ref', kind: 'pvp_win', amount: 45 });
    for (const leak of ['match_id', 'session_id', 'answer_key']) assert.equal(leak in history.items[0], false);
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
