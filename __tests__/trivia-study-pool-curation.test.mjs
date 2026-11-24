import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { loadSurface } from './social-poker-card-harness.mjs';
import {
    DEFAULT_TRAINING_SPOT,
    getTrainingSpotForCategory,
    TRAINING_SPOT_MAP,
    TRIVIA_STUDY_CATEGORIES,
} from '../src/lib/trivia/trainingSpotMap.mjs';
import { normalizeOperatorContext } from '../src/lib/trivia/operationsSnapshot.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const MIGRATION = 'supabase/migrations/20261124142800_trivia_study_deck_and_pool_curation.sql';

const EXPECTED_CATEGORIES = [
    'gto_scenarios',
    'gto_theory',
    'icm_chip_ev',
    'mtt_situations',
    'cash_game_situations',
    'rule_knowledge',
    'poker_history',
    'famous_hands',
    'player_profiles',
    'tournament_facts',
];

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

test('20261124142800 migration defines all three SECURITY DEFINER RPCs with service_role ACLs and zero table locks', () => {
    const sql = read(MIGRATION);
    assert.match(sql, /TIER:\s*3/);
    assert.match(sql, /BEGIN;/);
    assert.match(sql, /NOTIFY pgrst, 'reload schema';/);
    assert.match(sql, /\/\* FORWARD ROLLBACK/);
    assert.doesNotMatch(sql, /^\s*ALTER TABLE\b/im, 'migration must stay pure-RPC with zero live-table ALTER TABLE locks');

    for (const fn of [
        'trivia_missed_questions_study_v1',
        'trivia_question_calibration_report_v1',
        'trivia_pool_batch_curate_v1',
    ]) {
        assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`), `${fn} must be created`);
        assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`), `${fn} must revoke public grants`);
        assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[\\s\\S]*?TO service_role`), `${fn} must grant execute only to service_role`);
    }

    assert.match(sql, /trivia_user_question_history/);
    assert.match(sql, /trivia_question_result_events/);
    assert.match(sql, /trivia_question_quarantine/);
    assert.match(sql, /easy_too_hard/);
    assert.match(sql, /hard_too_easy/);
    assert.match(sql, /high_skip_rate/);
    assert.match(sql, /high_report_outlier/);
    assert.match(sql, /trivia_review_queue_v1/);
    assert.match(sql, /trivia_operator_context_core_v1/);
    assert.match(sql, /batch_limit_exceeded/);
    assert.match(sql, /INSERT INTO public\.trivia_operator_events_v1/);
});

test('trainingSpotMap covers all 10 Trivia categories and every href resolves to a real page under pages/hub/training/', () => {
    assert.deepEqual([...TRIVIA_STUDY_CATEGORIES].sort(), [...EXPECTED_CATEGORIES].sort());

    const verifyHrefExists = (href, label) => {
        assert.match(href, /^\/hub\/training\/[a-z0-9-]+$/i, `${label} href must target /hub/training/*`);
        const slug = href.replace(/^\/hub\/training\//, '');
        const pageFile = join(ROOT, 'pages', 'hub', 'training', `${slug}.js`);
        const indexFile = join(ROOT, 'pages', 'hub', 'training', slug, 'index.js');
        assert.equal(
            existsSync(pageFile) || existsSync(indexFile),
            true,
            `${label} mapped href ${href} must resolve to a real file in pages/hub/training/`,
        );
    };

    for (const cat of EXPECTED_CATEGORIES) {
        const spot = getTrainingSpotForCategory(cat);
        assert.equal(spot, TRAINING_SPOT_MAP[cat]);
        assert.ok(spot.label && spot.label.length >= 4);
        assert.ok(spot.specialty && spot.specialty.length >= 4);
        verifyHrefExists(spot.href, cat);
    }

    assert.equal(getTrainingSpotForCategory('unknown_cat'), DEFAULT_TRAINING_SPOT);
    verifyHrefExists(DEFAULT_TRAINING_SPOT.href, 'default');
});

test('/api/trivia/study-misses enforces GET, auth, category validation, rate limit, and attaches trainingSpot metadata', async () => {
    const src = read('pages/api/trivia/study-misses.js');
    assert.match(src, /applyRateLimit\(req, res, LIMITS\.read\)/);
    assert.match(src, /getServerUserWithFallback/);
    assert.doesNotMatch(src, /from ['"]@supabase\/supabase-js['"]/);

    let authResult = { user: null, error: new Error('unauth') };
    const rpcCalls = [];
    const mockClient = {
        async rpc(name, params) {
            rpcCalls.push({ name, params });
            return {
                data: {
                    success: true,
                    total_missed: 2,
                    returned: 1,
                    category_filter: params.p_category || 'all',
                    categories: { gto_scenarios: 2 },
                    items: [
                        {
                            question_id: '11111111-1111-4111-8111-111111111111',
                            question: 'What is the MDF against a pot-sized river bet?',
                            options: ['33%', '50%', '66%', '75%'],
                            correct_index: 1,
                            explanation: 'Pot / (Pot + Bet) = 1 / 2 = 50%.',
                            category: 'gto_scenarios',
                            difficulty: 'medium',
                            last_missed_at: '2026-11-24T12:00:00.000Z',
                            miss_count: 2,
                        },
                    ],
                },
                error: null,
            };
        },
    };

    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

    const { module } = loadSurface('pages/api/trivia/study-misses.js', {
        mocks: {
            '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
            '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
            '../../../src/lib/serverAuth': { getServerUserWithFallback: async () => authResult },
            '../../../src/lib/supabaseServerClient': { createClient: () => mockClient },
            '../../../src/lib/trivia/trainingSpotMap.mjs': {
                getTrainingSpotForCategory,
                TRIVIA_STUDY_CATEGORIES,
            },
        },
    });
    const handler = module.default;

    const postRes = mockRes();
    await handler({ method: 'POST', headers: {}, query: {} }, postRes);
    assert.equal(postRes.statusCode, 405);

    const unauthRes = mockRes();
    await handler({ method: 'GET', headers: {}, query: {} }, unauthRes);
    assert.equal(unauthRes.statusCode, 401);
    assert.equal(unauthRes.body?.error, 'authentication_required');

    authResult = { user: { id: '22222222-2222-4222-8222-222222222222' }, error: null };

    const badCatRes = mockRes();
    await handler({ method: 'GET', headers: {}, query: { category: 'bogus_cat' } }, badCatRes);
    assert.equal(badCatRes.statusCode, 400);
    assert.equal(badCatRes.body?.error, 'invalid_category');

    const okRes = mockRes();
    await handler({ method: 'GET', headers: {}, query: { category: 'gto_scenarios', limit: '10' } }, okRes);
    assert.equal(okRes.statusCode, 200);
    assert.equal(okRes.body?.success, true);
    assert.equal(okRes.body?.items?.length, 1);
    assert.equal(okRes.body?.items[0]?.trainingSpot?.href, '/hub/training/spot-trainer');
    assert.equal(okRes.body?.items[0]?.trainingSpot?.label, 'GTO Spot Trainer');
    assert.equal(rpcCalls[0].name, 'trivia_missed_questions_study_v1');
    assert.equal(rpcCalls[0].params.p_user_id, '22222222-2222-4222-8222-222222222222');
});

test('/api/admin/trivia-pool-curate enforces operator RBAC, batch validation, and delegates to calibration and curate RPCs', async () => {
    const src = read('pages/api/admin/trivia-pool-curate.js');
    assert.match(src, /requireTriviaOperator/);
    assert.match(src, /trivia_operator_context_v1/);
    assert.match(src, /trivia_question_calibration_report_v1/);
    assert.match(src, /trivia_pool_batch_curate_v1/);
    assert.doesNotMatch(src, /from ['"]@supabase\/supabase-js['"]/);

    let authResult = { user: { id: '33333333-3333-4333-8333-333333333333' }, error: null };
    let opContext = { allowed: false, roles: [], capabilities: [] };
    let profileRow = { is_admin: false, role: 'user' };
    const rpcCalls = [];

    const mockClient = {
        from(table) {
            if (table === 'profiles') {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: profileRow, error: null }),
                        }),
                    }),
                };
            }
            if (table === 'trivia_review_queue_v1') {
                const chain = {
                    eq: () => chain,
                    order: () => chain,
                    limit: async () => ({
                        data: [
                            {
                                question_id: '44444444-4444-4444-8444-444444444444',
                                category: 'gto_theory',
                                difficulty: 'medium',
                                quality_score: 7,
                                priority: 1,
                                inconclusive_attempts: 0,
                                created_at: '2026-11-24T00:00:00.000Z',
                            },
                        ],
                        error: null,
                    }),
                };
                return { select: () => chain };
            }
            if (table === 'trivia_questions') {
                return {
                    select: () => ({
                        in: async () => ({
                            data: [
                                {
                                    id: '44444444-4444-4444-8444-444444444444',
                                    question: 'Sample GTO Theory Question?',
                                    options: ['A', 'B', 'C', 'D'],
                                    correct_index: 0,
                                    audit_verified: null,
                                    source: 'deterministic',
                                },
                            ],
                            error: null,
                        }),
                    }),
                };
            }
            throw new Error(`Unexpected table ${table}`);
        },
        async rpc(name, params) {
            rpcCalls.push({ name, params });
            if (name === 'trivia_operator_context_v1') return { data: opContext, error: null };
            if (name === 'trivia_question_calibration_report_v1') {
                return {
                    data: {
                        success: true,
                        min_shown: 15,
                        ninety_day_target_per_category: 1800,
                        summary: { flagged_count: 1, categories_below_90_day: 1 },
                        outliers: [],
                        category_depth: [
                            { category: 'player_profiles', eligible_count: 1136, below_90_day_supply: true, shortfall_90_day: 664 },
                        ],
                    },
                    error: null,
                };
            }
            if (name === 'trivia_pool_batch_curate_v1') {
                return {
                    data: {
                        success: true,
                        receipt_id: '55555555-5555-4555-8555-555555555555',
                        action: params.p_action,
                        requested_count: params.p_question_ids.length,
                        affected_count: params.p_question_ids.length,
                        released_quarantine_count: 0,
                        quarantined_count: 0,
                        missing_ids: [],
                    },
                    error: null,
                };
            }
            throw new Error(`Unexpected rpc ${name}`);
        },
    };

    const { module } = loadSurface('pages/api/admin/trivia-pool-curate.js', {
        mocks: {
            '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } },
            '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
            '../../../src/lib/serverAuth': { getServerUserWithFallback: async () => authResult },
            '../../../src/lib/supabaseServerClient': { createClient: () => mockClient },
            '../../../src/lib/trivia/operationsSnapshot.mjs': { normalizeOperatorContext },
            '../../../src/lib/trivia/trainingSpotMap.mjs': { TRIVIA_STUDY_CATEGORIES },
        },
    });
    const handler = module.default;

    const noAuthRes = mockRes();
    await handler({ method: 'GET', headers: {}, query: {} }, noAuthRes);
    assert.equal(noAuthRes.statusCode, 401);

    const forbiddenRes = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: {} }, forbiddenRes);
    assert.equal(forbiddenRes.statusCode, 403);
    assert.equal(forbiddenRes.body?.error, 'trivia_operator_required');

    // Observer can GET calibration + queue, but cannot POST mutations.
    opContext = { allowed: true, roles: ['observer'], capabilities: ['snapshot'] };
    const obsGetRes = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: {} }, obsGetRes);
    assert.equal(obsGetRes.statusCode, 200);
    assert.equal(obsGetRes.body?.operator?.canCurate, false);
    assert.equal(obsGetRes.body?.categoryDepthAlerts?.length, 1);

    const obsPostRes = mockRes();
    await handler({
        method: 'POST',
        headers: { authorization: 'Bearer tok' },
        body: {
            questionIds: ['44444444-4444-4444-8444-444444444444'],
            action: 'approve',
            reason: 'Verified accurate answer and explanation.',
        },
    }, obsPostRes);
    assert.equal(obsPostRes.statusCode, 403);
    assert.equal(obsPostRes.body?.error, 'operator_capability_required');

    // Supervisor can POST valid batches; oversized or short-reason batches fail 400.
    opContext = { allowed: true, roles: ['supervisor'], capabilities: ['snapshot', 'question_quarantine', 'question_release'] };

    const shortReasonRes = mockRes();
    await handler({
        method: 'POST',
        headers: { authorization: 'Bearer tok' },
        body: {
            questionIds: ['44444444-4444-4444-8444-444444444444'],
            action: 'approve',
            reason: 'short',
        },
    }, shortReasonRes);
    assert.equal(shortReasonRes.statusCode, 400);
    assert.equal(shortReasonRes.body?.error, 'reason_required');

    const tooManyIds = Array.from({ length: 101 }, (_, i) => `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`);
    const oversizeRes = mockRes();
    await handler({
        method: 'POST',
        headers: { authorization: 'Bearer tok' },
        body: {
            questionIds: tooManyIds,
            action: 'approve',
            reason: 'Batch approval exceeding maximum allowed size.',
        },
    }, oversizeRes);
    assert.equal(oversizeRes.statusCode, 400);
    assert.equal(oversizeRes.body?.error, 'batch_limit_exceeded');

    const okPostRes = mockRes();
    await handler({
        method: 'POST',
        headers: { authorization: 'Bearer tok' },
        body: {
            questionIds: ['44444444-4444-4444-8444-444444444444'],
            action: 'set_difficulty_hard',
            reason: 'Empirical solve rate below 35 percent threshold.',
        },
    }, okPostRes);
    assert.equal(okPostRes.statusCode, 200);
    assert.equal(okPostRes.body?.success, true);
    assert.equal(okPostRes.body?.receiptId, '55555555-5555-4555-8555-555555555555');
    assert.equal(okPostRes.body?.affectedCount, 1);
});

test('study deck page, stats cross-link, and upgraded trivia-pool workbench preserve UI contracts', () => {
    const study = read('pages/hub/trivia/study.js');
    assert.match(study, /TriviaConsole/);
    assert.match(study, /\/api\/trivia\/study-misses/);
    assert.match(study, /Filter By Category/);
    assert.match(study, /Show Answer And Explanation/);
    assert.match(study, /Mark Got It/);
    assert.match(study, /Train This Spot:/);
    assert.match(study, /Sign In To Study Your Personal Missed Questions Deck/);
    assert.match(study, /No Missed Questions Recorded Yet/);
    assert.doesNotMatch(study, /[—–]/, 'study.js must not contain em-dashes or en-dashes');
    assert.doesNotMatch(study, /from ['"](?:lucide-react|react-icons)/);

    const stats = read('pages/hub/trivia/stats.js');
    assert.match(stats, /\/hub\/trivia\/study/);
    assert.match(stats, /Study Missed Questions/);

    const pool = read('pages/admin/trivia-pool.js');
    assert.match(pool, /aria-label="Trivia Questions By Category"/);
    assert.match(pool, /Category Depth Alerts/);
    assert.match(pool, /Batch Curation Queue/);
    assert.match(pool, /Empirical Difficulty Calibration/);
    assert.match(pool, /\/api\/admin\/trivia-pool-curate/);
    assert.match(pool, /Approve Selected/);
    assert.match(pool, /Quarantine Selected/);
    assert.match(pool, /set_difficulty_easy/);
    assert.match(pool, /set_difficulty_medium/);
    assert.match(pool, /set_difficulty_hard/);
    assert.doesNotMatch(pool, /[—–]/, 'trivia-pool.js must not contain em-dashes or en-dashes');
});
