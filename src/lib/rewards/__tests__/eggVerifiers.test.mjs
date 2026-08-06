/**
 * EASTER EGG VERIFIER TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 * These exist because the verifiers are the only thing standing between the
 * egg catalog and the diamond balance. Before src/lib/rewards/eggVerifiers.js,
 * POST /api/rewards/claim with targetId:'to_infinity' paid 500 ◆ — the whole
 * monthly egg cap — to any logged-in account, because the endpoint checked
 * that the egg key existed and never that the user had earned it.
 *
 * The properties that matter, and are asserted below:
 *   1. verifyEgg fails CLOSED — unknown key, staff-awarded key, key with no
 *      verifier, and a verifier that throws all return verified:false.
 *   2. Each verifier is tested at its boundary (just under → false, exactly
 *      at → true), because an off-by-one here is real money.
 *
 * Run: node --test src/lib/rewards/__tests__/eggVerifiers.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    EGG_VERIFIERS,
    UNVERIFIABLE_EGGS,
    verifyEgg,
    hasVerifier,
    verifiableEggKeys,
    chicagoDate,
} from '../eggVerifiers.js';
import { EASTER_EGGS, DAILY_CAP } from '../../../config/diamondRewards.js';

// ── fake context ──────────────────────────────────────────────────────────
// Mirrors the shape createEggContext() returns: every field is a function
// returning a promise, so verifiers cannot tell a stub from the real thing.
/** Action keys that count toward the daily cap, mirroring the live catalog. */
const CAPPED_KEYS = [
    'daily_login', 'daily_trivia_challenge', 'birthday', 'first_training_session',
    'follow', 'gto_chart_study', 'hand_of_the_day', 'reaction', 'share_content',
    'social_post', 'strategy_comment', 'training_level_complete', 'venue_review',
    'video_favorite', 'video_watch',
];
/** Actions that pay but are OUTSIDE the cap — eggs, referrals, VIP, profile. */
const UNCAPPED_KEYS = [
    'easter_egg', 'referral_qualified', 'referral_vip_conversion', 'vip_stipend',
    'email_verified', 'phone_verified', 'profile_complete', 'profile_pic',
    'first_purchase', 'hendonmob_link', 'referral_referee',
];

function ctxOf(overrides = {}) {
    const base = {
        supabase: null,
        userId: 'u1',
        catalog: async () => ({
            all: new Set([...CAPPED_KEYS, ...UNCAPPED_KEYS]),
            capped: new Set(CAPPED_KEYS),
        }),
        dailyLoginDays: async () => new Set(),
        profile: async () => ({
            created_at: new Date('2026-01-01T00:00:00Z').toISOString(),
            level: 1,
            login_streak: 0,
            streak_days: 0,
            streak_count: 0,
            country: 'US',
            total_hands_played: 0,
            is_vip: false,
        }),
        lifetimeEarned: async () => 0,
        recentTransactions: async () => [],
        trainingSessions: async () => [],
        completedReferrals: async () => [],
        bankrollSessionCount: async () => 0,
        searchCount: async () => 0,
        bestPostLikes: async () => 0,
        bestCommentLikes: async () => 0,
    };
    const merged = { ...base };
    for (const [k, v] of Object.entries(overrides)) {
        merged[k] = typeof v === 'function' ? v : async () => v;
    }
    return merged;
}

/** ISO timestamp N days ago, at midday UTC so it lands on one Chicago date. */
function daysAgo(n, hourUtc = 18) {
    const d = new Date(Date.now() - n * 86400000);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d.toISOString();
}

// ═══════════════════════════════════════════════════════════════════════════
describe('verifyEgg fails closed', () => {
    test('unknown egg key is refused', async () => {
        const r = await verifyEgg('not_a_real_egg', ctxOf());
        assert.equal(r.verified, false);
        assert.equal(r.reason, 'unknown_egg');
    });

    test('staff-awarded egg is refused even though it is in the catalog', async () => {
        // retweet_royalty is verifiable:false — 300 ◆ if it ever paid.
        assert.equal(EASTER_EGGS.retweet_royalty.verifiable, false);
        const r = await verifyEgg('retweet_royalty', ctxOf());
        assert.equal(r.verified, false);
        assert.equal(r.reason, 'staff_awarded');
    });

    test('catalog egg with no verifier is refused, not defaulted to true', async () => {
        // speed_demon is a real, verifiable:true egg with no telemetry behind it.
        assert.equal(EASTER_EGGS.speed_demon.verifiable, true);
        assert.equal(hasVerifier('speed_demon'), false);
        const r = await verifyEgg('speed_demon', ctxOf());
        assert.equal(r.verified, false);
        assert.equal(r.reason, 'no_verifier');
    });

    test('a verifier that throws pays nothing', async () => {
        const exploding = ctxOf({
            lifetimeEarned: async () => { throw new Error('db down'); },
        });
        const r = await verifyEgg('millionaire', exploding);
        assert.equal(r.verified, false);
        assert.equal(r.reason, 'verifier_error');
    });

    test('every registered verifier key is a real catalog egg', () => {
        for (const key of verifiableEggKeys()) {
            assert.ok(EASTER_EGGS[key], `${key} is not in EASTER_EGGS`);
            assert.notEqual(
                EASTER_EGGS[key].verifiable, false,
                `${key} is staff-awarded but has a verifier`,
            );
        }
    });

    test('eggCoverage.js agrees with the registry in both directions', async () => {
        const { VERIFIED_EGG_KEYS, EARNABLE_EGG_COUNT } = await import('../eggCoverage.js');
        const registry = new Set(verifiableEggKeys());
        const listed = new Set(VERIFIED_EGG_KEYS);

        for (const key of registry) {
            assert.ok(listed.has(key), `${key} has a verifier but is missing from eggCoverage.js`);
        }
        for (const key of listed) {
            assert.ok(registry.has(key), `${key} is listed in eggCoverage.js but has no verifier`);
        }
        // The store page prints this number. If it drifts, the copy lies.
        assert.equal(EARNABLE_EGG_COUNT, registry.size);
        assert.equal(VERIFIED_EGG_KEYS.length, new Set(VERIFIED_EGG_KEYS).size, 'duplicate key');
    });

    test('every catalog egg is either verifiable or documented as not', () => {
        for (const key of Object.keys(EASTER_EGGS)) {
            const covered = hasVerifier(key)
                || Object.prototype.hasOwnProperty.call(UNVERIFIABLE_EGGS, key);
            assert.ok(covered, `${key} is neither verifiable nor documented`);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('lifetime + milestone eggs', () => {
    test('millionaire needs 100,000 lifetime, not 99,999', async () => {
        assert.equal(await EGG_VERIFIERS.millionaire(ctxOf({ lifetimeEarned: 99999 })), false);
        assert.equal(await EGG_VERIFIERS.millionaire(ctxOf({ lifetimeEarned: 100000 })), true);
    });

    // REGRESSION: lifetimeEarned originally summed EVERY positive row. The
    // first account to trip `millionaire` in production had a 454,229 ◆ untyped
    // legacy row and a 45,205 ◆ admin adjustment, so a user who had earned a
    // few thousand diamonds collected a 400 ◆ "earn 100,000 over your lifetime"
    // achievement. Only catalog actions are earnings.
    test('lifetimeEarned counts ONLY catalog reward actions', async () => {
        const { createEggContext } = await import('../eggVerifiers.js');
        const rows = [
            { amount: 454229, transaction_type: null },            // legacy untyped
            { amount: 45205, transaction_type: 'adjustment' },      // admin grant
            { amount: 5000, transaction_type: 'purchase' },         // bought
            { amount: 160, transaction_type: 'live_gift_received' },// gifted
            { amount: 3245, transaction_type: 'daily_login' },      // EARNED
            { amount: 50, transaction_type: 'profile_complete' },   // EARNED
        ];
        const supabaseStub = {
            from: (table) => {
                const chain = {
                    select: () => chain,
                    eq: () => chain,
                    gt: () => chain,
                    gte: () => chain,
                    order: () => chain,
                    limit: async () => ({
                        data: table === 'diamond_reward_catalog'
                            ? [...CAPPED_KEYS, ...UNCAPPED_KEYS].map((k) => ({
                                action_key: k, counts_toward_daily_cap: CAPPED_KEYS.includes(k),
                            }))
                            : rows,
                    }),
                };
                // the catalog loader awaits .select() directly, with no .limit()
                if (table === 'diamond_reward_catalog') {
                    return {
                        select: async () => ({
                            data: [...CAPPED_KEYS, ...UNCAPPED_KEYS].map((k) => ({
                                action_key: k, counts_toward_daily_cap: CAPPED_KEYS.includes(k),
                            })),
                        }),
                    };
                }
                return chain;
            },
        };
        const ctx = createEggContext(supabaseStub, 'u1');
        // 3245 + 50 = 3295, NOT 507,889.
        assert.equal(await ctx.lifetimeEarned(), 3295);
        assert.equal(await EGG_VERIFIERS.millionaire(ctx), false);
    });

    test('to_infinity needs 1,000,000 lifetime', async () => {
        assert.equal(await EGG_VERIFIERS.to_infinity(ctxOf({ lifetimeEarned: 999999 })), false);
        assert.equal(await EGG_VERIFIERS.to_infinity(ctxOf({ lifetimeEarned: 1000000 })), true);
    });

    test('level_100_boss needs level 100', async () => {
        assert.equal(await EGG_VERIFIERS.level_100_boss(ctxOf({ profile: { level: 99 } })), false);
        assert.equal(await EGG_VERIFIERS.level_100_boss(ctxOf({ profile: { level: 100 } })), true);
    });

    test('old_guard needs a full year of membership', async () => {
        const elevenMonths = new Date(Date.now() - 334 * 86400000).toISOString();
        const thirteenMonths = new Date(Date.now() - 396 * 86400000).toISOString();
        assert.equal(await EGG_VERIFIERS.old_guard(ctxOf({ profile: { created_at: elevenMonths } })), false);
        assert.equal(await EGG_VERIFIERS.old_guard(ctxOf({ profile: { created_at: thirteenMonths } })), true);
        // A missing created_at must not read as "infinitely old".
        assert.equal(await EGG_VERIFIERS.old_guard(ctxOf({ profile: {} })), false);
    });

    test('high_roller needs 10,000 spent inside ONE day, not spread across days', async () => {
        const spreadOut = ctxOf({
            recentTransactions: [
                { amount: -6000, created_at: daysAgo(1) },
                { amount: -6000, created_at: daysAgo(2) },
            ],
        });
        assert.equal(await EGG_VERIFIERS.high_roller(spreadOut), false);

        const sameDay = ctxOf({
            recentTransactions: [
                { amount: -6000, created_at: daysAgo(1, 14) },
                { amount: -4000, created_at: daysAgo(1, 20) },
            ],
        });
        assert.equal(await EGG_VERIFIERS.high_roller(sameDay), true);
    });

    test('high_roller ignores earnings — only spend counts', async () => {
        const earnings = ctxOf({
            recentTransactions: [{ amount: 50000, created_at: daysAgo(1) }],
        });
        assert.equal(await EGG_VERIFIERS.high_roller(earnings), false);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('streak + timing eggs', () => {
    test('the_centurion reads the highest of the three streak columns', async () => {
        assert.equal(await EGG_VERIFIERS.the_centurion(ctxOf({
            profile: { login_streak: 99, streak_days: 0, streak_count: 0 },
        })), false);
        assert.equal(await EGG_VERIFIERS.the_centurion(ctxOf({
            profile: { login_streak: 0, streak_days: 0, streak_count: 100 },
        })), true);
    });

    test('the_anniversary lands only on the day one month after signup', async () => {
        const today = new Date();
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        assert.equal(await EGG_VERIFIERS.the_anniversary(ctxOf({
            profile: { created_at: oneMonthAgo.toISOString() },
        })), true);

        const twoMonthsAgo = new Date(today);
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
        assert.equal(await EGG_VERIFIERS.the_anniversary(ctxOf({
            profile: { created_at: twoMonthsAgo.toISOString() },
        })), false);
    });

    test('new_year requires activity, not merely the date', async () => {
        const isJan1 = /-01-01$/.test(chicagoDate());
        const withActivity = ctxOf({
            recentTransactions: [{ amount: 10, created_at: new Date().toISOString() }],
        });
        assert.equal(await EGG_VERIFIERS.new_year(withActivity), isJan1);
        // No activity: false on every day of the year, including Jan 1.
        assert.equal(await EGG_VERIFIERS.new_year(ctxOf()), false);
    });

    const loginDays = (n, offset = 0) => new Set(
        Array.from({ length: n }, (_, i) => chicagoDate(new Date(Date.now() - (i + offset) * 86400000))),
    );

    test('the_ghost needs 30 CONSECUTIVE daily logins', async () => {
        assert.equal(await EGG_VERIFIERS.the_ghost(ctxOf({ dailyLoginDays: loginDays(29) })), false);
        assert.equal(await EGG_VERIFIERS.the_ghost(ctxOf({ dailyLoginDays: loginDays(30) })), true);
    });

    test('the_ghost is not fooled by 30 days with a gap in the middle', async () => {
        const gappy = new Set([...loginDays(15), ...loginDays(15, 16)]); // day 15 missing
        assert.equal(await EGG_VERIFIERS.the_ghost(ctxOf({ dailyLoginDays: gappy })), false);
    });

    test('daily_legend needs 30 consecutive days AT the cap, not merely active', async () => {
        const cap = DAILY_CAP.free;
        const belowCap = Array.from({ length: 30 }, (_, i) => ({
            amount: cap - 1, transaction_type: 'daily_login', created_at: daysAgo(i),
        }));
        assert.equal(await EGG_VERIFIERS.daily_legend(ctxOf({ recentTransactions: belowCap })), false);

        const atCap = Array.from({ length: 30 }, (_, i) => ({
            amount: cap, transaction_type: 'daily_login', created_at: daysAgo(i),
        }));
        assert.equal(await EGG_VERIFIERS.daily_legend(ctxOf({ recentTransactions: atCap })), true);
    });

    // REGRESSION: these two summed every positive transaction, so easter eggs,
    // referral payouts and the VIP stipend counted toward "you hit your daily
    // cap". Those actions are excluded from the cap by definition, so they can
    // never help fill it. After 20260805210000 took eggs out of the cap, the
    // unfiltered version would have handed daily_legend (300 ◆) to anyone who
    // unlocked a few eggs on thirty consecutive days.
    test('daily_legend ignores actions that do not count toward the cap', async () => {
        const uncappedOnly = Array.from({ length: 30 }, (_, i) => ({
            amount: 500, transaction_type: 'easter_egg', created_at: daysAgo(i),
        }));
        assert.equal(await EGG_VERIFIERS.daily_legend(ctxOf({ recentTransactions: uncappedOnly })), false);
    });

    test('weekend_warrior ignores actions that do not count toward the cap', async () => {
        // A referral payout on a Saturday and a Sunday is not "hitting your cap".
        const referrals = Array.from({ length: 14 }, (_, i) => ({
            amount: 500, transaction_type: 'referral_qualified', created_at: daysAgo(i),
        }));
        assert.equal(await EGG_VERIFIERS.weekend_warrior(ctxOf({ recentTransactions: referrals })), false);
    });

    test('daily_legend uses the VIP cap for VIPs', async () => {
        const atFreeCap = Array.from({ length: 30 }, (_, i) => ({
            amount: DAILY_CAP.free, transaction_type: 'daily_login', created_at: daysAgo(i),
        }));
        // A VIP earning only the free cap has not hit THEIR cap...
        assert.equal(await EGG_VERIFIERS.daily_legend(ctxOf({
            profile: { is_vip: true },
            recentTransactions: atFreeCap,
        })), false);
        // ...but a non-VIP earning the same amount has. Without this second
        // assertion the test passes even if the rows are being dropped for an
        // unrelated reason, which is exactly what happened when the
        // cap-counting filter landed and these rows had no transaction_type.
        assert.equal(await EGG_VERIFIERS.daily_legend(ctxOf({
            profile: { is_vip: false },
            recentTransactions: atFreeCap,
        })), true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('referral + social eggs', () => {
    test('the_ambassador needs 20 completed referrals', async () => {
        const refs = (n) => Array.from({ length: n }, (_, i) => ({ referee_id: `r${i}`, status: 'completed' }));
        assert.equal(await EGG_VERIFIERS.the_ambassador(ctxOf({ completedReferrals: refs(19) })), false);
        assert.equal(await EGG_VERIFIERS.the_ambassador(ctxOf({ completedReferrals: refs(20) })), true);
    });

    test('the_whale needs 100 completed referrals', async () => {
        const refs = (n) => Array.from({ length: n }, (_, i) => ({ referee_id: `r${i}`, status: 'completed' }));
        assert.equal(await EGG_VERIFIERS.the_whale(ctxOf({ completedReferrals: refs(99) })), false);
        assert.equal(await EGG_VERIFIERS.the_whale(ctxOf({ completedReferrals: refs(100) })), true);
    });

    test('comment_king needs 50 likes on a comment', async () => {
        assert.equal(await EGG_VERIFIERS.comment_king(ctxOf({ bestCommentLikes: 49 })), false);
        assert.equal(await EGG_VERIFIERS.comment_king(ctxOf({ bestCommentLikes: 50 })), true);
    });

    test('meme_lord needs 20 likes on a post', async () => {
        assert.equal(await EGG_VERIFIERS.meme_lord(ctxOf({ bestPostLikes: 19 })), false);
        assert.equal(await EGG_VERIFIERS.meme_lord(ctxOf({ bestPostLikes: 20 })), true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('training performance eggs', () => {
    const pass = (t, extra = {}) => ({
        level_passed: true, mistake_count: 0, accuracy: 100,
        created_at: t, game_id: 'g', level: 1, ...extra,
    });

    test('perfectionist needs five clean passes IN A ROW', async () => {
        const broken = [
            pass(daysAgo(5)), pass(daysAgo(4)),
            pass(daysAgo(3), { mistake_count: 1 }), // breaks the run
            pass(daysAgo(2)), pass(daysAgo(1)), pass(daysAgo(0)),
        ];
        assert.equal(await EGG_VERIFIERS.perfectionist(ctxOf({ trainingSessions: broken })), false);

        const clean = [pass(daysAgo(5)), pass(daysAgo(4)), pass(daysAgo(3)), pass(daysAgo(2)), pass(daysAgo(1))];
        assert.equal(await EGG_VERIFIERS.perfectionist(ctxOf({ trainingSessions: clean })), true);
    });

    test('multi_level_master needs ten passes inside one hour', async () => {
        const base = Date.now();
        const spread = Array.from({ length: 10 }, (_, i) => pass(new Date(base - i * 10 * 60000).toISOString()));
        // 10 passes at 10-minute spacing spans 90 minutes — not one hour.
        assert.equal(await EGG_VERIFIERS.multi_level_master(ctxOf({ trainingSessions: spread })), false);

        const tight = Array.from({ length: 10 }, (_, i) => pass(new Date(base - i * 5 * 60000).toISOString()));
        assert.equal(await EGG_VERIFIERS.multi_level_master(ctxOf({ trainingSessions: tight })), true);
    });

    test('comeback_kid needs two fails then a 95%+ pass on the SAME level', async () => {
        const differentLevels = [
            { ...pass(daysAgo(4)), level_passed: false, level: 1 },
            { ...pass(daysAgo(3)), level_passed: false, level: 2 },
            { ...pass(daysAgo(2)), accuracy: 99, level: 3 },
        ];
        assert.equal(await EGG_VERIFIERS.comeback_kid(ctxOf({ trainingSessions: differentLevels })), false);

        const sameLevel = [
            { ...pass(daysAgo(4)), level_passed: false, level: 7 },
            { ...pass(daysAgo(3)), level_passed: false, level: 7 },
            { ...pass(daysAgo(2)), accuracy: 96, level: 7 },
        ];
        assert.equal(await EGG_VERIFIERS.comeback_kid(ctxOf({ trainingSessions: sameLevel })), true);
    });

    test('comeback_kid rejects a pass below 95%', async () => {
        const weakPass = [
            { ...pass(daysAgo(4)), level_passed: false, level: 7 },
            { ...pass(daysAgo(3)), level_passed: false, level: 7 },
            { ...pass(daysAgo(2)), accuracy: 94, level: 7 },
        ];
        assert.equal(await EGG_VERIFIERS.comeback_kid(ctxOf({ trainingSessions: weakPass })), false);
    });

    test('dead_reckoning requires level 5+, 100%, and the FIRST attempt', async () => {
        const secondAttempt = [
            { ...pass(daysAgo(3)), level: 6, level_passed: false },
            { ...pass(daysAgo(2)), level: 6, accuracy: 100 },
        ];
        assert.equal(await EGG_VERIFIERS.dead_reckoning(ctxOf({ trainingSessions: secondAttempt })), false);

        const lowLevel = [{ ...pass(daysAgo(2)), level: 4, accuracy: 100 }];
        assert.equal(await EGG_VERIFIERS.dead_reckoning(ctxOf({ trainingSessions: lowLevel })), false);

        const firstTry = [{ ...pass(daysAgo(2)), level: 6, accuracy: 100 }];
        assert.equal(await EGG_VERIFIERS.dead_reckoning(ctxOf({ trainingSessions: firstTry })), true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('discovery eggs (database-joined)', () => {
    /** Minimal PostgREST-shaped stub: every builder method chains, then resolves. */
    function tableStub(rowsByTable) {
        return {
            from(table) {
                const rows = rowsByTable[table] || [];
                const chain = {
                    select: () => chain,
                    eq: () => chain,
                    in: () => chain,
                    not: () => chain,
                    lte: () => chain,
                    gt: () => chain,
                    gte: () => chain,
                    order: () => chain,
                    limit: () => Promise.resolve({ data: rows }),
                    then: (resolve) => resolve({ data: rows }),
                };
                return chain;
            },
        };
    }

    test('road_tripper needs three DIFFERENT states, not three reviews', async () => {
        const sameState = tableStub({
            venue_reviews: [
                { poker_venues: { state: 'NV' } },
                { poker_venues: { state: 'nv' } }, // case must not create a second state
                { poker_venues: { state: 'NV' } },
            ],
        });
        assert.equal(await EGG_VERIFIERS.road_tripper({ supabase: sameState, userId: 'u1' }), false);

        const threeStates = tableStub({
            venue_reviews: [
                { poker_venues: { state: 'NV' } },
                { poker_venues: { state: 'CA' } },
                { poker_venues: { state: 'TX' } },
            ],
        });
        assert.equal(await EGG_VERIFIERS.road_tripper({ supabase: threeStates, userId: 'u1' }), true);
    });

    test('the_collector counts distinct themes, not rows', async () => {
        const sameTheme = tableStub({
            user_theme_settings: [{ table_id: 't1' }, { table_id: 't1' }, { table_id: 't1' }],
        });
        assert.equal(await EGG_VERIFIERS.the_collector({ supabase: sameTheme, userId: 'u1' }), false);

        const three = tableStub({
            user_theme_settings: [{ table_id: 't1' }, { table_id: 't2' }, { table_id: 't3' }],
        });
        assert.equal(await EGG_VERIFIERS.the_collector({ supabase: three, userId: 'u1' }), true);
    });

    test('the_optimizer needs a resolved leak AND a first-attempt review', async () => {
        const noResolved = tableStub({ user_leaks: [], leak_review_state: [] });
        assert.equal(await EGG_VERIFIERS.the_optimizer({ supabase: noResolved, userId: 'u1' }), false);

        // Resolved, but the scheduler recorded no qualifying (reps <= 1) review.
        const resolvedButSlow = tableStub({
            user_leaks: [{ id: 'leak-1' }],
            leak_review_state: [],
        });
        assert.equal(await EGG_VERIFIERS.the_optimizer({ supabase: resolvedButSlow, userId: 'u1' }), false);

        const firstTry = tableStub({
            user_leaks: [{ id: 'leak-1' }],
            leak_review_state: [{ leak_id: 'leak-1', reps: 1 }],
        });
        assert.equal(await EGG_VERIFIERS.the_optimizer({ supabase: firstTry, userId: 'u1' }), true);
    });
});

describe('discovery eggs', () => {
    test('bankroll_builder needs 30 logged sessions', async () => {
        assert.equal(await EGG_VERIFIERS.bankroll_builder(ctxOf({ bankrollSessionCount: 29 })), false);
        assert.equal(await EGG_VERIFIERS.bankroll_builder(ctxOf({ bankrollSessionCount: 30 })), true);
    });

    test('the_librarian counts DISTINCT searches', async () => {
        assert.equal(await EGG_VERIFIERS.the_librarian(ctxOf({ searchCount: 19 })), false);
        assert.equal(await EGG_VERIFIERS.the_librarian(ctxOf({ searchCount: 20 })), true);
    });
});
