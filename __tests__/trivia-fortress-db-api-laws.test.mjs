import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { loadSurface } from './social-poker-card-harness.mjs';
import {
    DEFAULT_TRAINING_SPOT as SOCIAL_DEFAULT_TRAINING_SPOT,
    TRAINING_SPOT_BY_CATEGORY,
    resolveTrainingSpotForCategory,
    buildResultCardSvg,
    isValidTriviaUuid,
} from '../src/lib/trivia/socialGrowthHelpers.mjs';
import {
    DEFAULT_TRAINING_SPOT as CANONICAL_DEFAULT_TRAINING_SPOT,
    TRIVIA_STUDY_CATEGORIES,
    getTrainingSpotForCategory,
} from '../src/lib/trivia/trainingSpotMap.mjs';
import { projectNightlyDto } from '../src/lib/trivia/nightlyTournamentPolicy.mjs';
import { normalizeOperatorContext } from '../src/lib/trivia/operationsSnapshot.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const MIGRATION = 'supabase/migrations/20261125042800_trivia_forensic_fortress_hardening.sql';

function walkJsFiles(dirRel, out = []) {
    const abs = join(ROOT, dirRel);
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
        const rel = join(dirRel, entry.name);
        if (entry.isDirectory()) {
            walkJsFiles(rel, out);
        } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
            out.push(rel);
        }
    }
    return out;
}

function mockRes() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        send(payload) { this.body = payload; return this; },
    };
}

test('FORTRESS LAW 1: socialGrowthHelpers training spots stay in 100% lockstep with canonical trainingSpotMap', () => {
    assert.equal(TRIVIA_STUDY_CATEGORIES.length, 10);
    assert.deepEqual(
        Object.keys(TRAINING_SPOT_BY_CATEGORY).sort(),
        [...TRIVIA_STUDY_CATEGORIES].sort(),
        'TRAINING_SPOT_BY_CATEGORY must contain the exact 10 canonical categories',
    );

    for (const cat of TRIVIA_STUDY_CATEGORIES) {
        const social = resolveTrainingSpotForCategory(cat);
        const canonical = getTrainingSpotForCategory(cat);
        assert.equal(
            social.href,
            canonical.href,
            `category ${cat} drifted: socialGrowthHelpers=${social.href} vs trainingSpotMap=${canonical.href}`,
        );
    }

    assert.equal(SOCIAL_DEFAULT_TRAINING_SPOT.href, CANONICAL_DEFAULT_TRAINING_SPOT.href);
    assert.equal(resolveTrainingSpotForCategory('unknown_category').href, CANONICAL_DEFAULT_TRAINING_SPOT.href);
    assert.equal(resolveTrainingSpotForCategory('').href, CANONICAL_DEFAULT_TRAINING_SPOT.href);

    const helperSrc = read('src/lib/trivia/socialGrowthHelpers.mjs');
    assert.match(helperSrc, /from ['"]\.\/trainingSpotMap\.mjs['"]/);
});

test('FORTRESS LAW 2: og-result-card masks is_horse profiles as Smarter Horse on both match and session cards', async () => {
    const src = read('pages/api/trivia/og-result-card.js');
    assert.match(src, /display_name,\s*username,\s*is_horse/);
    assert.match(src, /Smarter Horse/);

    const matchId = '28aab195-cd29-4cc9-80e4-11feca8cb930';
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const horseUserId = '22222222-2222-4222-8222-222222222222';
    const humanUserId = '33333333-3333-4333-8333-333333333333';

    let activeProfile = { display_name: 'Marcus Vance', username: 'marcus_vance_bot', is_horse: true };
    const mockClient = {
        from(table) {
            if (table === 'trivia_pvp_matches') {
                return {
                    select: () => ({
                        eq: () => ({
                            in: () => ({
                                maybeSingle: async () => ({
                                    data: {
                                        id: matchId,
                                        status: 'complete',
                                        player1_id: humanUserId,
                                        player2_id: horseUserId,
                                        player1_score: 7,
                                        player2_score: 9,
                                        winner_id: horseUserId,
                                        stake_amount: 25,
                                        questions: new Array(10).fill({ id: 'q' }),
                                        completed_at: '2026-11-25T00:00:00Z',
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === 'trivia_sessions') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: {
                                        id: sessionId,
                                        user_id: horseUserId,
                                        mode: 'daily',
                                        status: 'submitted',
                                        score: 900,
                                        correct_count: 9,
                                        diamonds_awarded: 10,
                                        question_ids: new Array(10).fill('q'),
                                        submitted_at: '2026-11-25T00:00:00Z',
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === 'profiles') {
                return {
                    select: (cols) => {
                        assert.match(cols, /\bis_horse\b/, 'profiles query must select is_horse');
                        return {
                            eq: () => ({
                                maybeSingle: async () => ({ data: activeProfile, error: null }),
                            }),
                        };
                    },
                };
            }
            if (table === 'trivia_streaks') {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: { current_streak: 3 }, error: null }),
                        }),
                    }),
                };
            }
            throw new Error(`Unexpected table ${table}`);
        },
    };

    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

    try {
        const { module } = loadSurface('pages/api/trivia/og-result-card.js', {
            mocks: {
                '../../../src/lib/supabaseServerClient': { createClient: () => mockClient },
                '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
                '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
                '../../../src/lib/trivia/socialGrowthHelpers.mjs': { buildResultCardSvg, isValidTriviaUuid },
            },
        });
        const handler = module.default;

        // PvP match won by a horse: MUST render "Smarter Horse" and NEVER raw alias
        const matchRes = mockRes();
        await handler({ method: 'GET', query: { matchId } }, matchRes);
        assert.equal(matchRes.statusCode, 200);
        assert.match(String(matchRes.body), /Smarter Horse/);
        assert.doesNotMatch(String(matchRes.body), /Marcus Vance|marcus_vance_bot/);

        // Solo session owned by a horse: MUST render "Smarter Horse"
        const sessionRes = mockRes();
        await handler({ method: 'GET', query: { sessionId } }, sessionRes);
        assert.equal(sessionRes.statusCode, 200);
        assert.match(String(sessionRes.body), /Smarter Horse/);
        assert.doesNotMatch(String(sessionRes.body), /Marcus Vance|marcus_vance_bot/);

        // Human profile renders normal display name
        activeProfile = { display_name: 'Real Human', username: 'realhuman', is_horse: false };
        const humanRes = mockRes();
        await handler({ method: 'GET', query: { matchId } }, humanRes);
        assert.equal(humanRes.statusCode, 200);
        assert.match(String(humanRes.body), /Real Human/);
        assert.doesNotMatch(String(humanRes.body), /Smarter Horse/);
    } finally {
        if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
        if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }
});

test('FORTRESS LAW 3: projectNightlyDto my-run preserves valid viewer sessionId on resolved rounds only', () => {
    const sid = '88888888-8888-4888-8888-888888888888';
    const projected = projectNightlyDto('my-run', {
        success: true,
        entered: true,
        serverTime: '2026-11-25T04:00:00Z',
        history: [
            {
                roundNumber: 1,
                matchupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                result: 'won',
                decidedReason: 'score',
                sessionId: sid.toUpperCase(),
                secretLeak: 'forbidden',
                mine: { seatNo: 1, correct: 8, correctIndex: 2 },
                opponent: { seatNo: 2, correct: 6, sessionId: '99999999-9999-4999-8999-999999999999' },
            },
            {
                roundNumber: 2,
                matchupId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                result: 'bye',
                decidedReason: 'bye',
                sessionId: null,
                mine: { seatNo: 1, correct: 0 },
                opponent: null,
            },
            {
                roundNumber: 3,
                matchupId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                result: 'lost',
                decidedReason: 'score',
                sessionId: 'not-a-uuid',
                mine: { seatNo: 1, correct: 4 },
                opponent: { seatNo: 2, correct: 9 },
            },
        ],
    });

    assert.equal(projected.history.length, 3);
    assert.equal(projected.history[0].sessionId, sid);
    assert.equal('secretLeak' in projected.history[0], false);
    assert.equal('correctIndex' in projected.history[0].mine, false);
    assert.equal('sessionId' in projected.history[0].opponent, false);
    assert.equal('sessionId' in projected.history[1], false);
    assert.equal('sessionId' in projected.history[2], false);
});

test('FORTRESS LAW 4: admin/trivia-pool-curate admits is_admin profiles before 403 and trivia-pool-status admits operators', async () => {
    const curateSrc = read('pages/api/admin/trivia-pool-curate.js');
    const isAdminIdx = curateSrc.indexOf('let isAdminProfile = false;');
    const forbidIdx = curateSrc.indexOf("error: 'trivia_operator_required'");
    assert.ok(isAdminIdx > 0 && forbidIdx > isAdminIdx, 'isAdminProfile must be evaluated before 403 trivia_operator_required');

    const mockClient = {
        from(table) {
            if (table === 'profiles') {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: { is_admin: true, role: 'user' }, error: null }),
                        }),
                    }),
                };
            }
            if (table === 'trivia_review_queue_v1') {
                const chain = {
                    eq: () => chain,
                    order: () => chain,
                    limit: async () => ({ data: [], error: null }),
                };
                return { select: () => chain };
            }
            throw new Error(`Unexpected table ${table}`);
        },
        async rpc(name) {
            if (name === 'trivia_operator_context_v1') {
                return { data: { allowed: false, roles: [], capabilities: [] }, error: null };
            }
            if (name === 'trivia_question_calibration_report_v1') {
                return {
                    data: {
                        success: true,
                        min_shown: 15,
                        ninety_day_target_per_category: 1800,
                        summary: {},
                        outliers: [],
                        category_depth: [],
                    },
                    error: null,
                };
            }
            throw new Error(`Unexpected rpc ${name}`);
        },
    };

    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    try {
        const { module } = loadSurface('pages/api/admin/trivia-pool-curate.js', {
            mocks: {
                '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } },
                '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
                '../../../src/lib/serverAuth': {
                    getServerUserWithFallback: async () => ({
                        user: { id: '33333333-3333-4333-8333-333333333333' },
                        error: null,
                    }),
                },
                '../../../src/lib/supabaseServerClient': { createClient: () => mockClient },
                '../../../src/lib/trivia/operationsSnapshot.mjs': { normalizeOperatorContext },
                '../../../src/lib/trivia/trainingSpotMap.mjs': { TRIVIA_STUDY_CATEGORIES },
            },
        });
        const res = mockRes();
        await module.default({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: {} }, res);
        assert.equal(res.statusCode, 200, 'is_admin profile must be admitted even when trivia_operator_context_v1 returns allowed:false');
        assert.equal(res.body?.operator?.canCurate, true);
    } finally {
        if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
        if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }

    const statusSrc = read('pages/api/admin/trivia-pool-status.js');
    assert.match(statusSrc, /prof\.is_admin === true/);
    assert.match(statusSrc, /trivia_operator_context_v1/);
});

test('FORTRESS LAW 5: All Trivia, Trivia-Admin, and Push/Pool Cron API routes obey rate-limit, Cache-Control, and opaque 500 error laws', () => {
    const triviaRoutes = walkJsFiles('pages/api/trivia');
    const adminTriviaRoutes = readdirSync(join(ROOT, 'pages/api/admin'))
        .filter((f) => f.startsWith('trivia-') && f.endsWith('.js'))
        .map((f) => join('pages/api/admin', f));

    // Retired tombstones & factory delegates that enforce rate limit/cache-control in their shared factory.
    const FACTORY_OR_TOMBSTONE_RATE_LIMIT = new Set([
        'pages/api/trivia/nightly/[action].js',
        'pages/api/trivia/submit.js',
        'pages/api/trivia/tournament-lifecycle.js',
    ]);
    const FACTORY_CACHE_CONTROL = new Set([
        'pages/api/trivia/nightly/[action].js',
    ]);

    const RAW_500_ERR_RE = /status\s*\(\s*500\s*\)\s*\.json\s*\([^)]*(?:\b(?:err|error|e|runErr|claimErr)\??\.message\b|\bString\s*\(\s*(?:err|error|e)\b)/m;

    const allRoutes = [...triviaRoutes, ...adminTriviaRoutes].sort();
    assert.ok(allRoutes.length >= 35, `expected >=35 trivia/admin routes, got ${allRoutes.length}`);

    for (const rel of allRoutes) {
        const src = read(rel);
        if (!FACTORY_OR_TOMBSTONE_RATE_LIMIT.has(rel)) {
            assert.match(
                src,
                /applyRateLimit|createPvpRoute|createNightlyTournamentApi/,
                `${rel} must enforce applyRateLimit (or delegate to a rate-limited factory)`,
            );
        }
        if (!FACTORY_CACHE_CONTROL.has(rel)) {
            assert.match(
                src,
                /Cache-Control|createPvpRoute|createNightlyTournamentApi/,
                `${rel} must set Cache-Control (or delegate to a cache-controlled factory)`,
            );
        }
        assert.doesNotMatch(
            src,
            RAW_500_ERR_RE,
            `${rel} must never leak raw error.message in HTTP 500 JSON responses`,
        );
    }

    // Also pin cron routes hardened in Track 1
    for (const cronRel of ['pages/api/cron/trivia-pool-guard.js', 'pages/api/cron/push-dispatch.js']) {
        const src = read(cronRel);
        assert.match(src, /Cache-Control/, `${cronRel} must set Cache-Control`);
        assert.doesNotMatch(src, RAW_500_ERR_RE, `${cronRel} must return opaque error codes in 500 JSON`);
    }

    // Daily fallback catch branch must explicitly set Cache-Control: no-store
    const dailySrc = read('pages/api/trivia/daily.js');
    const catchIdx = dailySrc.indexOf("rosterSource: 'fallback'");
    assert.ok(catchIdx > 0);
    const beforeFallback = dailySrc.slice(Math.max(0, catchIdx - 400), catchIdx);
    assert.match(beforeFallback, /Cache-Control['"],\s*['"]no-store['"]/, 'daily.js degraded catch fallback must set Cache-Control: no-store');

    // Club Nights API must never trust client elapsedMs
    const clubSrc = read('pages/api/trivia/club-nights.js');
    assert.doesNotMatch(clubSrc, /body\.elapsedMs/, 'club-nights.js must ignore client elapsedMs');
    assert.match(clubSrc, /p_elapsed_ms:\s*0/);

    // PvP settle routes must inspect { error } from trivia_pvp_update_rating_v1
    const settleSrc = read('pages/api/trivia/pvp-settle-match.js');
    assert.match(settleSrc, /updatePvpEloRating\(sb,\s*match\.id,\s*'settlePvpMatch'\)/);
    assert.match(settleSrc, /const\s*\{\s*data,\s*error\s*\}\s*=\s*await\s+sb\.rpc\('trivia_pvp_update_rating_v1'/);

    const pvpHandlerSrc = read('src/lib/trivia/pvpApiHandler.js');
    assert.match(pvpHandlerSrc, /const\s*\{\s*data:\s*eloData,\s*error:\s*eloErr\s*\}\s*=\s*await\s+sb\.rpc\('trivia_pvp_update_rating_v1'/);
});

test('FORTRESS LAW 6: Migration 20261125042800 pins predecessor MD5s, root-cause SQL fixes, ACL/RLS lockdown, indexes, and rollback', () => {
    const sql = read(MIGRATION);

    assert.match(sql, /BEGIN;/);
    assert.match(sql, /COMMIT;/);
    assert.match(sql, /NOTIFY pgrst, 'reload schema';/);
    assert.match(sql, /\/\* FORWARD ROLLBACK/);

    // Exact predecessor MD5 guards
    for (const md5 of [
        '2259da2639167badb4d030fe8f104286',
        'f18f2f2cb9afad750b828874df98a091',
        '34ed9e7756bc457933e179d3cb6cd9d8',
        '87ef5bc19e735e5ef0a2ece4d83081b6',
        '15b69926d768f708a79479f89e21fda2',
        'fd8c8532b81f1e5b447ac40225939750',
    ]) {
        assert.ok(sql.includes(md5), `migration must guard predecessor MD5 ${md5}`);
    }

    // P0-2: Daily streak delegation
    assert.match(sql, /public\.trivia_streak_apply_daily_v1\(v_session\.user_id,\s*v_play_date\)/);
    // P1-1: PvP Elo inside trivia_pvp__advance_match
    assert.match(sql, /PERFORM public\.trivia_pvp_update_rating_v1\(p_match_id\);/);
    // P1-2: Club Night server-authoritative elapsed_ms
    assert.match(sql, /ADD COLUMN IF NOT EXISTS questions_fetched_at timestamptz/);
    assert.match(sql, /SET questions_fetched_at = COALESCE\(questions_fetched_at, now\(\)\)/);
    assert.match(sql, /v_entry\.questions_fetched_at/);
    // P1-5: Nightly my_run viewer sessionId + schedule settled fallback
    assert.match(sql, /'sessionId',\s*CASE WHEN m\.is_bye THEN NULL ELSE s\.session_id END/);
    assert.match(sql, /AND s\.lifecycle_state = 'settled'/);
    // P0-4: ACL revokes & RLS policy drops
    assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.trivia_survival_runs, public\.trivia_tournament_notifications/);
    assert.match(sql, /REVOKE SELECT ON public\.trivia_survival_runs, public\.trivia_tournament_notifications/);
    assert.match(sql, /REVOKE SELECT ON public\.trivia_questions_public, public\.trivia_question_player_stats, public\.trivia_question_pool_stats/);
    for (const pol of [
        'users_insert_own_runs',
        'users_update_own_runs',
        'users_delete_own_runs',
        'Trivia questions are viewable by all',
        'trivia_user_items_insert',
        'trivia_user_items_update',
        'trivia_streaks_self',
        'Users can update own notifications',
    ]) {
        assert.ok(sql.includes(`DROP POLICY IF EXISTS "${pol}"`), `migration must drop policy "${pol}"`);
    }
    // P1-8 & P2: Hot indexes + redundant duplicate index drop
    for (const idx of [
        'idx_trivia_friend_challenges_match_id',
        'idx_trivia_scores_mode_verified_rank',
        'idx_trivia_scores_user_id',
        'idx_trivia_session_answers_question_id',
        'idx_trivia_question_result_events_question_id',
        'idx_trivia_quality_audits_question_id',
    ]) {
        assert.ok(sql.includes(`CREATE INDEX IF NOT EXISTS ${idx}`), `migration must create index ${idx}`);
    }
    assert.match(sql, /DROP INDEX IF EXISTS public\.idx_trivia_streak_milestone_claims_user;/);
});
