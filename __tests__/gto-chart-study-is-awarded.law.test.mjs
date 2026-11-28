/**
 * LAW: the advertised "Study A Chart" reward is payable, and only by real study
 * ═══════════════════════════════════════════════════════════════════════════
 * gto_chart_study (5 diamonds, two per Chicago day) has been active in the
 * catalog since 2026-07-31 and Club Arena's Diamond Earn page sends players to
 * /hub/training/preflop-charts for it. Nothing ever paid it: its verifyNote
 * needs "a server-recorded study session of sufficient dwell time" and there
 * was none (20260909001800_first_training_session_reward_is_awarded.sql).
 *
 * This pins the recording that makes it payable:
 *   1. identity comes from the bearer token, never from the body;
 *   2. the browser sends no duration, amount or user id - the database clock
 *      and the catalog decide;
 *   3. the award goes through award_diamonds_v2 with a per-session reference
 *      id, so it can pay at most once per session and at most max_per_day;
 *   4. the threshold (180 s active, 3 distinct charts, 30 s credit cap, 10 s
 *      minimum gap, 30 minute session) is what the migration header documents;
 *   5. the RPC and the table are not writable by players;
 *   6. the range browser renders the progress, and an uninstalled RPC answers
 *      "unavailable", never a 500.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createChartStudyHandler,
    parseStudyRequest,
    isMissingFunction,
    chartKeyFor,
} from '../src/lib/training/chartStudy.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const migrationName = readdirSync(join(ROOT, 'supabase/migrations')).find((f) => f.endsWith('_gto_chart_study_is_awarded.sql'));
const MIGRATION = migrationName ? read(`supabase/migrations/${migrationName}`) : '';

function mockRes() {
    const res = { statusCode: 200, headers: {}, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    return res;
}

function harness({ user = { id: 'user-from-token' }, rpcResult = { data: { ok: true, state: 'studying' }, error: null }, limited = false } = {}) {
    const calls = { getUser: [], rpc: [] };
    const supabase = {
        auth: {
            getUser: async (token) => {
                calls.getUser.push(token);
                return token === 'good' ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } };
            },
        },
        rpc: async (name, args) => { calls.rpc.push({ name, args }); return rpcResult; },
    };
    const handler = createChartStudyHandler({
        getSupabase: () => supabase,
        rateLimit: (_req, res) => { if (limited) { res.status(429).json({ ok: false }); return false; } return true; },
    });
    return { handler, calls };
}

const SESSION = '2b7f0c55-9a7e-4f39-8d1e-3f3b4c6d7e8f';

test('only POST, and rate limited before anything else runs', async () => {
    const { handler, calls } = harness();
    const res = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 405);
    const limited = harness({ limited: true });
    const res2 = mockRes();
    await limited.handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { event: 'start' } }, res2);
    assert.equal(res2.statusCode, 429);
    assert.equal(limited.calls.getUser.length + limited.calls.rpc.length, 0);
    assert.equal(calls.rpc.length, 0);
});

test('identity is the bearer token user; a body user id or duration is ignored', async () => {
    const { handler, calls } = harness();
    const res = mockRes();
    await handler({
        method: 'POST',
        headers: { authorization: 'Bearer good' },
        body: { event: 'ping', sessionId: SESSION, chart: 'rfi:BTN', userId: 'someone-else', seconds: 9999, diamonds: 500 },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls.rpc, [{
        name: 'fn_chart_study_event',
        args: { p_user_id: 'user-from-token', p_event: 'ping', p_session_id: SESSION, p_chart: 'rfi:BTN' },
    }]);
    assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('no token or a bad token never reaches the database', async () => {
    for (const authorization of [undefined, 'Bearer nope']) {
        const { handler, calls } = harness();
        const res = mockRes();
        await handler({ method: 'POST', headers: authorization ? { authorization } : {}, body: { event: 'start' } }, res);
        assert.equal(res.statusCode, 401);
        assert.equal(calls.rpc.length, 0);
    }
});

test('bad input is refused; unknown charts are dropped, not recorded', async () => {
    assert.deepEqual(parseStudyRequest({ event: 'award' }), { error: 'Unknown event' });
    assert.deepEqual(parseStudyRequest({ event: 'ping' }), { error: 'Session required' });
    assert.deepEqual(parseStudyRequest({ event: 'finish', sessionId: 'not-a-uuid' }), { error: 'Session required' });
    assert.equal(parseStudyRequest({ event: 'start', chart: 'gold:XX' }).chart, null);
    assert.equal(parseStudyRequest({ event: 'start', chart: "rfi:BTN'; drop table x" }).chart, null);
    assert.equal(parseStudyRequest({ event: 'start', chart: 'bb_defense:SB' }).chart, 'bb_defense:SB');
    assert.equal(chartKeyFor('vs3bet', 'CO'), 'vs3bet:CO');
    assert.equal(chartKeyFor('rfi', 'BB'), null);
});

test('an uninstalled RPC answers unavailable (200); other failures are 503, never a 500', async () => {
    const missing = harness({ rpcResult: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fn_chart_study_event' } } });
    const res = mockRes();
    await missing.handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { event: 'start' } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: false, available: false });
    const broken = harness({ rpcResult: { data: null, error: { code: '57014', message: 'timeout' } } });
    const res2 = mockRes();
    await broken.handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { event: 'start' } }, res2);
    assert.equal(res2.statusCode, 503);
    assert.equal(isMissingFunction({ code: '42883', message: 'function does not exist' }), true);
    assert.equal(isMissingFunction({ code: '57014', message: 'timeout' }), false);
});

test('the migration records study on the server clock and pays once per session through award_diamonds_v2', () => {
    assert.ok(MIGRATION, 'the gto_chart_study migration exists');
    assert.match(MIGRATION, /CREATE TABLE IF NOT EXISTS public\.chart_study_sessions/);
    assert.match(MIGRATION, /ENABLE ROW LEVEL SECURITY/);
    assert.match(MIGRATION, /FOR SELECT TO authenticated\s+USING \(user_id = \(SELECT auth\.uid\(\)\)\)/);
    assert.match(MIGRATION, /REVOKE ALL ON public\.chart_study_sessions FROM PUBLIC, anon, authenticated, service_role;/);
    assert.doesNotMatch(MIGRATION, /GRANT (ALL|INSERT|UPDATE|DELETE)[^;]*ON public\.chart_study_sessions/);
    assert.match(MIGRATION, /REVOKE ALL ON FUNCTION public\.fn_chart_study_event\(uuid, text, uuid, text\) FROM PUBLIC, anon, authenticated;/);
    assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION public\.fn_chart_study_event\(uuid, text, uuid, text\) TO service_role;/);
    assert.match(MIGRATION, /SECURITY DEFINER/);
    // The threshold the header documents.
    assert.match(MIGRATION, /c_min_active\s+constant integer\s+:= 180;/);
    assert.match(MIGRATION, /c_min_charts\s+constant integer\s+:= 3;/);
    assert.match(MIGRATION, /c_credit_cap\s+constant integer\s+:= 30;/);
    assert.match(MIGRATION, /c_min_gap\s+constant integer\s+:= 10;/);
    assert.match(MIGRATION, /c_session_max\s+constant interval := interval '30 minutes';/);
    // Time is the database's; the function takes no duration argument.
    assert.match(MIGRATION, /v_now\s+timestamptz := now\(\);/);
    assert.doesNotMatch(MIGRATION, /p_(seconds|duration|minutes|amount|diamonds)\b/);
    // One award path, one reference per session; amount and caps stay the catalog's.
    assert.match(MIGRATION, /public\.award_diamonds_v2\(\s*p_user_id,\s*'gto_chart_study',\s*'gto_chart_study_' \|\| p_user_id::text \|\| '_' \|\| v_session\.id::text/);
    assert.doesNotMatch(MIGRATION, /UPDATE public\.profiles|INSERT INTO public\.diamond_transactions|UPDATE public\.diamond_reward_catalog/);
    assert.match(MIGRATION, /IF v_session\.award_state = 'studying' THEN/, 'a settled session never pays again');
    assert.doesNotMatch(MIGRATION, /is_horse/);
    assert.match(MIGRATION, /ROLLBACK/);
});

test('the range browser renders the progress for the chart on screen', () => {
    const page = read('pages/hub/training/preflop-charts.js');
    assert.match(page, /<ChartStudyProgress chartKey=\{chartKeyFor\(scenario, position\)\} \/>/);
    const comp = read('src/components/training/ChartStudyProgress.jsx');
    assert.match(comp, /document\.visibilityState !== 'visible'/, 'a hidden tab does not ping');
    assert.match(comp, /ACTIVE_WINDOW_MS = 60000/, 'an idle player does not ping');
    assert.doesNotMatch(comp, /seconds:|duration:|diamonds:|userId:/, 'the client sends no duration, amount or user');
    assert.doesNotMatch(comp, /#(?:ffd700|f4c44e|fbbf24|eab308|facc15|f59e0b|a78bfa|8b5cf6|9333ea|d946ef|ec4899)\b/i);
    assert.doesNotMatch(comp, /[\u{1F300}-\u{1FAFF}\u{FE0F}]/u);
    const route = read('pages/api/training/chart-study.js');
    assert.match(route, /createChartStudyHandler/);
    assert.doesNotMatch(route, /@supabase\/supabase-js/);
});
