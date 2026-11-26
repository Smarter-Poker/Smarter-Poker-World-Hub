import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { loadSurface } from './social-poker-card-harness.mjs';
import {
    buildTriviaOperationsSnapshot,
    TRIVIA_OPERATIONS_SLOS,
    triviaOperationsControls,
} from '../src/lib/trivia/operationsSnapshot.mjs';
import { getTriviaMode } from '../src/config/triviaModeRegistry.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function mockRes() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
}

test('prize-wheel-spin enforces standard 5-group UUID (8-4-4-4-12) and rejects malformed 4-group IDs', async () => {
    const src = read('pages/api/trivia/prize-wheel-spin.js');
    assert.match(
        src,
        /const UUID_RE = \/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$\/i;/,
    );

    const userId = '11111111-1111-4111-8111-111111111111';
    const validScoreId = '22222222-2222-4222-8222-222222222222';
    const fourGroupScoreId = '22222222-2222-4222-222222222222';
    const rpcCalls = [];

    const client = {
        from(table) {
            assert.equal(table, 'trivia_scores');
            return {
                select: () => ({
                    eq: (_col, val) => ({
                        maybeSingle: async () => ({
                            data: val === validScoreId ? { id: validScoreId, user_id: userId } : null,
                            error: null,
                        }),
                    }),
                }),
            };
        },
        async rpc(name, params) {
            rpcCalls.push({ name, params });
            return {
                data: { success: true, prizeId: 'diamond_25', prizeAmount: 25 },
                error: null,
            };
        },
    };

    const { module } = loadSurface('pages/api/trivia/prize-wheel-spin.js', {
        mocks: {
            '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
            '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
            '../../../src/lib/serverAuth': {
                getServerUserWithFallback: async () => ({ user: { id: userId }, error: null }),
            },
            './tournament-lifecycle': { serviceClient: () => client },
        },
    });
    const handler = module.default;

    const badRes = mockRes();
    await handler({ method: 'POST', body: { scoreId: fourGroupScoreId }, headers: {} }, badRes);
    assert.equal(badRes.statusCode, 400);
    assert.equal(badRes.body?.error, 'invalid_score_id');
    assert.equal(rpcCalls.length, 0, '4-group UUID must fail before database lookup or RPC');

    const okRes = mockRes();
    await handler({ method: 'POST', body: { scoreId: validScoreId }, headers: {} }, okRes);
    assert.equal(okRes.statusCode, 200);
    assert.equal(okRes.body?.success, true);
    assert.equal(okRes.body?.prizeId, 'diamond_25');
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].name, 'fn_trivia_prize_wheel_spin');
    assert.equal(rpcCalls[0].params.p_score_id, validScoreId);
});

test('tournament-lifecycle uses supabaseServerClient with no raw @supabase/supabase-js or hardcoded fallback URL', () => {
    const src = read('pages/api/trivia/tournament-lifecycle.js');
    assert.match(src, /from '\.\.\/\.\.\/\.\.\/src\/lib\/supabaseServerClient'/);
    assert.doesNotMatch(src, /from ['"]@supabase\/supabase-js['"]/);
    assert.doesNotMatch(src, /kuklfnapbkmacvwxktbh\.supabase\.co/);
    assert.match(src, /if \(!url \|\| !key\) throw new Error\('Supabase server credentials not configured'\)/);
});

test('operationsSnapshot recognizes recent owner run after clean lease release and flags stale or empty runs', () => {
    assert.equal(TRIVIA_OPERATIONS_SLOS.schedulerLivenessWindowMs, 180_000);
    const baseInput = {
        generatedAt: '2026-11-24T05:30:00.000Z',
        controls: triviaOperationsControls({ TRIVIA_TOURNAMENTS_ENABLED: 'true' }),
        questionHealth: { healthy: true, metrics: { eligible_pool: 20000 } },
        tournamentHealth: { healthy: true, alerts: [], upcoming_public_instances: 7 },
        schedulerLease: {
            holder_id: 'openclaw:trivia-nightly-tournament',
            expires_at: '2026-11-24T05:32:00.000Z',
            released_at: '2026-11-24T05:29:10.000Z',
        },
        activeAlerts: [],
        sourceErrors: {},
    };

    const recentOwner = buildTriviaOperationsSnapshot({
        ...baseInput,
        schedulerRuns: [
            { outcome: 'standby', started_at: '2026-11-24T05:29:30.000Z', finished_at: '2026-11-24T05:29:31.000Z' },
            { outcome: 'owner', started_at: '2026-11-24T05:29:00.000Z', finished_at: '2026-11-24T05:29:10.000Z' },
        ],
    });
    assert.equal(recentOwner.scheduler.active_owner_observed, true);
    assert.equal(recentOwner.scheduler.last_owner_run_at, '2026-11-24T05:29:10.000Z');
    assert.equal(recentOwner.healthy, true);
    assert.equal(recentOwner.issues.some((entry) => entry.code === 'scheduler_owner_absent'), false);

    // Exactly 180s ago is still inside the liveness window.
    const boundaryOwner = buildTriviaOperationsSnapshot({
        ...baseInput,
        schedulerRuns: [
            { outcome: 'owner', started_at: '2026-11-24T05:26:50.000Z', finished_at: '2026-11-24T05:27:00.000Z' },
        ],
    });
    assert.equal(boundaryOwner.scheduler.active_owner_observed, true);
    assert.equal(boundaryOwner.healthy, true);

    // 181s ago is outside the 180s liveness window.
    const staleOwner = buildTriviaOperationsSnapshot({
        ...baseInput,
        schedulerRuns: [
            { outcome: 'owner', started_at: '2026-11-24T05:26:40.000Z', finished_at: '2026-11-24T05:26:59.000Z' },
        ],
    });
    assert.equal(staleOwner.scheduler.active_owner_observed, false);
    assert.equal(staleOwner.healthy, false);
    assert.ok(staleOwner.issues.some((entry) => entry.code === 'scheduler_owner_absent'));

    // Empty runs with released lease remain unhealthy.
    const emptyRuns = buildTriviaOperationsSnapshot({
        ...baseInput,
        schedulerRuns: [],
    });
    assert.equal(emptyRuns.scheduler.active_owner_observed, false);
    assert.equal(emptyRuns.healthy, false);
    assert.ok(emptyRuns.issues.some((entry) => entry.code === 'scheduler_owner_absent'));

    // Operations API reads a 25-row scheduler run window so standby ticks cannot crowd out recent owner runs.
    const opsApi = read('pages/api/admin/trivia-operations.js');
    assert.match(
        opsApi,
        /from\('trivia_tournament_scheduler_runs'\)[\s\S]*?\.order\('started_at',\s*\{\s*ascending:\s*false\s*\}\)\.limit\(25\)/,
    );
});

test('20261124052600 tournament health activation window migration preserves preflight MD5, guard, security and rollback', () => {
    const sql = read('supabase/migrations/20261124052600_trivia_tournament_health_activation_window.sql');
    assert.match(sql, /TIER:\s*3/);
    assert.match(sql, /5e2aa0a28eefecb824dd7383183d4568/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.trivia_tournament_health_v1\(\)/);
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /SET search_path TO ''/);
    assert.match(sql, /v_sched_enabled_at\s+timestamptz/);
    assert.match(sql, /gate_key = 'tournament_scheduler'/);
    assert.match(sql, /AND \(v_sched_enabled_at IS NULL OR v_sched_enabled_at <= v_today_start\)/);
    assert.match(sql, /p\.prosecdef[\s\S]*?p\.proowner = 'postgres'::regrole[\s\S]*?p\.proconfig = ARRAY\['search_path=""'\]/);
    assert.match(sql, /NOTIFY pgrst, 'reload schema';/);
    assert.match(sql, /-- FORWARD ROLLBACK:/);
});

test('TriviaLobby checks Free and variableCost before isVip so free and variable modes never advertise VIP Free', () => {
    const lobby = read('src/components/trivia/TriviaLobby.jsx');
    const fnStart = lobby.indexOf('const formatEntryCost =');
    const fnEnd = lobby.indexOf('};', fnStart) + 2;
    const costLabelBlock = lobby.slice(fnStart, fnEnd);
    const freeIndex = costLabelBlock.indexOf("return 'Free'");
    const variableIndex = costLabelBlock.indexOf("return 'Variable'");
    const vipIndex = costLabelBlock.indexOf("return 'VIP Free'");
    assert.ok(freeIndex > -1 && variableIndex > -1 && vipIndex > -1, 'entry badge evaluates Free, variableCost, and isVip');
    assert.ok(freeIndex < variableIndex && variableIndex < vipIndex, 'Free and variableCost must be checked before isVip');
});

test('survival-game clears parent session on failure & restart, guards settings load, and binds question reports', () => {
    const src = read('pages/hub/trivia/survival-game.js');
    assert.match(src, /const settingsLoadedRef = useRef\(false\);/);
    assert.match(src, /settingsLoadedRef\.current = true;/);
    assert.match(src, /if \(!settingsLoadedRef\.current\) return;/);
    assert.match(src, /const passedRecovered = correct >= recoveredConfig\.minCorrect;/);
    assert.match(src, /survivalParentSessionRef\.current = passedRecovered \? \(settled\.sessionId \|\| null\) : null;/);
    assert.match(src, /const passedSubmitted = Boolean\(submittedConfig\) && submittedCorrect >= submittedConfig\.minCorrect;/);
    assert.match(src, /survivalParentSessionRef\.current = passedSubmitted \? submitted\.sessionId : null;/);
    assert.match(src, /function restartFromLevel\(_level\) \{\s*survivalParentSessionRef\.current = null;[\s\S]*?startLevel\(1\);/);
    assert.match(src, /Passing A Level Continues Free To The Next Level\. Failing Or Starting Over Begins A New Paid Run At Level 1\./);
    assert.doesNotMatch(src, /aria-labelledby="survival-audio-label"[\s\S]{0,120}disabled=\{reduceMotion\}/);
    assert.match(
        src,
        /<ReportQuestionButton[\s\S]*?questionId=\{currentQuestion\.id\}[\s\S]*?sessionId=\{serverRun\.sessionId\}[\s\S]*?accountId=\{userId\}/,
    );
});

test('endless, mixed, time-attack, TimeAttackGame and ReportQuestionButton wire session/account custody and fresh tokens', () => {
    const endless = read('pages/hub/trivia/endless.js');
    assert.match(endless, /const settingsLoadedRef = useRef\(false\);/);
    assert.match(endless, /settingsLoadedRef\.current = true;/);
    assert.match(endless, /if \(!settingsLoadedRef\.current\) return;/);
    assert.doesNotMatch(endless, /aria-labelledby="endless-audio-label"[\s\S]{0,120}disabled=\{reduceMotion\}/);
    assert.match(
        endless,
        /<ReportQuestionButton[\s\S]*?questionId=\{currentQuestion\.id\}[\s\S]*?sessionId=\{serverRun\.sessionId\}[\s\S]*?accountId=\{userId\}/,
    );

    const mixed = read('pages/hub/trivia/mixed.js');
    assert.match(
        mixed,
        /<ReportQuestionButton[\s\S]*?questionId=\{currentQuestion\.id\}[\s\S]*?sessionId=\{serverRun\.sessionId\}[\s\S]*?accountId=\{userId\}/,
    );

    const timeAttackPage = read('pages/hub/trivia/time-attack.js');
    assert.match(
        timeAttackPage,
        /<TimeAttackGame[\s\S]*?sessionId=\{serverRun\.sessionId\}[\s\S]*?accountId=\{userId\}/,
    );

    const timeAttackComp = read('src/components/trivia/TimeAttackGame.jsx');
    assert.match(timeAttackComp, /sessionId = null,/);
    assert.match(timeAttackComp, /accountId = null,/);
    assert.match(
        timeAttackComp,
        /<ReportQuestionButton[\s\S]*?questionId=\{currentQuestion\.id\}[\s\S]*?sessionId=\{sessionId\}[\s\S]*?accountId=\{accountId\}/,
    );

    const reportBtn = read('src/components/trivia/ReportQuestionButton.jsx');
    assert.match(reportBtn, /import \{ getAccessToken \} from '\.\.\/\.\.\/lib\/authUtils';/);
    assert.match(reportBtn, /const freshToken = getAccessToken\(\) \|\| userToken;/);
    assert.match(reportBtn, /'Authorization': `Bearer \$\{freshToken\}`/);
});

test('dynamic [mode] route admits arcade free-entry holders and passes mode to PrizeWheel', () => {
    const page = read('pages/hub/trivia/[mode].js');
    assert.match(page, /let arcadeFreeEntryCount = 0;/);
    assert.match(page, /arcadeFreeEntryCount = itemMap\.get\('arcade_ticket'\) \|\| 0;/);
    assert.match(page, /if \(mode === 'arcade' && !vipStatus && arcadeFreeEntryCount < 1\)/);
    assert.match(page, /<PrizeWheel[\s\S]*?mode=\{mode\}/);

    const wheel = read('src/components/trivia/PrizeWheel.jsx');
    assert.match(wheel, /mode = 'daily'/);
    assert.match(wheel, /const isDailyMode = !mode \|\| mode === 'daily';/);
    assert.match(wheel, /eyebrow=\{isDailyMode \? 'Daily Reward' : 'Bonus Reward'\}/);
    assert.match(wheel, /\{isDailyMode \? <>Daily Spin<\/> : <>Bonus Spin<\/>\}/);
});

test('tournaments handles seat_finished, unwraps payload.session, and guards mobile-only run tab', () => {
    const src = read('pages/hub/trivia/tournaments.js');
    assert.match(src, /const narrowViewport = typeof window === 'undefined' \|\| window\.innerWidth < 900;/);
    assert.match(src, /setActiveTab\(narrowViewport \? 'run' : 'bracket'\);/);
    assert.match(
        src,
        /if \(payload\.seat_finished\) \{[\s\S]*?setSession\(null\);[\s\S]*?setActiveQuestion\(null\);[\s\S]*?await loadCore\(actionLease\.tournamentId, \{ quiet: true \}\);[\s\S]*?return;[\s\S]*?\}/,
    );
    assert.match(src, /await hydrateSession\(payload\.session \|\| payload, actionLease\);/);
});

test('admin trivia pages isolate post-action refresh, refresh tokens, and use server auth/client helpers', () => {
    const opsPage = read('pages/admin/trivia-operations.js');
    assert.match(opsPage, /function resolveAccessToken\(\)/);
    assert.match(opsPage, /const fresh = readLocalAccessToken\(\);/);
    assert.match(
        opsPage,
        /if \(item\?\.receiptId\) \{[\s\S]*?try \{\s*await refreshSnapshot\(\);\s*\} catch \(_refreshError\)/,
    );
    assert.match(opsPage, /label="Last owner run"/);
    assert.match(opsPage, /label="Recent runs"/);

    const poolPage = read('pages/admin/trivia-pool.js');
    assert.doesNotMatch(poolPage, /from ['"]@supabase\/supabase-js['"]/);
    assert.match(poolPage, /from '\.\.\/\.\.\/src\/lib\/supabaseServerClient'/);
    assert.match(poolPage, /from '\.\.\/\.\.\/src\/lib\/serverAuth'/);
    assert.match(poolPage, /crypto\.timingSafeEqual/);
    assert.match(poolPage, /await getServerUserWithFallback\(req, adm\)/);
});

test('trivia API routes enforce constant-time admin secret, sanitized errors, rate limiting and cookie auth fallback', () => {
    const gtoPanel = read('pages/api/trivia/render-gto-panel.js');
    assert.doesNotMatch(gtoPanel, /kuklfnapbkmacvwxktbh\.supabase\.co/);
    assert.match(gtoPanel, /crypto\.timingSafeEqual/);
    assert.match(gtoPanel, /await getServerUserWithFallback\(req, getSupabase\(\)\)/);
    assert.match(gtoPanel, /error:\s*'render_failed'/);
    assert.doesNotMatch(gtoPanel, /error:\s*error\.message/);

    const daily = read('pages/api/trivia/daily.js');
    assert.match(daily, /import \{ applyRateLimit, LIMITS \} from '\.\.\/\.\.\/\.\.\/src\/lib\/apiRateLimit';/);
    assert.match(daily, /if \(!applyRateLimit\(req, res, LIMITS\.read\)\) return;/);
    assert.match(daily, /const hasCookie = Boolean\(req\.headers\.cookie\);/);
    assert.match(daily, /if \(authHeader\?\.startsWith\('Bearer '\) \|\| hasCookie\)/);

    const report = read('pages/api/trivia/report-question.js');
    assert.match(report, /import \{ getServerUserWithFallback \} from '\.\.\/\.\.\/\.\.\/src\/lib\/serverAuth';/);
    assert.match(report, /await getServerUserWithFallback\(req, adm\)/);
});

test('triviaEngine metadata and triviaModeRegistry copy match live server rules and Smarter Horse disclosure', () => {
    const engine = read('src/lib/trivia/triviaEngine.ts');
    const survivalBlock = engine.slice(engine.indexOf("id: 'survival'"), engine.indexOf("id: 'mtt'"));
    assert.match(survivalBlock, /questionsCount:\s*20,/);
    assert.match(survivalBlock, /10 Levels • 20 Questions Per Level/);

    const mixedBlock = engine.slice(engine.indexOf("id: 'mixed'"), engine.indexOf("id: 'endless'"));
    assert.match(mixedBlock, /questionsCount:\s*21,/);
    assert.match(mixedBlock, /21 Questions • 7 Rotating Categories/);

    const pvpBlock = engine.slice(engine.indexOf("id: 'pvp'"), engine.indexOf("id: 'tournaments'"));
    assert.match(pvpBlock, /questionsCount:\s*20,/);
    assert.match(pvpBlock, /20 Questions • Head To Head/);

    const endlessMode = getTriviaMode('endless');
    assert.match(endlessMode.description, /Three Misses/i);
    assert.doesNotMatch(endlessMode.description, /Answer Until You Miss!/i);

    const pvpMode = getTriviaMode('pvp');
    assert.match(pvpMode.description, /Smarter Horse/);
});
