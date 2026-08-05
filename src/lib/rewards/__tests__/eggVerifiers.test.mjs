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
function ctxOf(overrides = {}) {
    const base = {
        supabase: null,
        userId: 'u1',
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
        recentClaims: async () => [],
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

    test('the_ghost needs 30 CONSECUTIVE days of claims', async () => {
        const run29 = Array.from({ length: 29 }, (_, i) => ({ claim_date: chicagoDate(new Date(Date.now() - i * 86400000)) }));
        assert.equal(await EGG_VERIFIERS.the_ghost(ctxOf({ recentClaims: run29 })), false);

        const run30 = Array.from({ length: 30 }, (_, i) => ({ claim_date: chicagoDate(new Date(Date.now() - i * 86400000)) }));
        assert.equal(await EGG_VERIFIERS.the_ghost(ctxOf({ recentClaims: run30 })), true);
    });

    test('the_ghost is not fooled by 30 days with a gap in the middle', async () => {
        const gappy = [
            ...Array.from({ length: 15 }, (_, i) => ({ claim_date: chicagoDate(new Date(Date.now() - i * 86400000)) })),
            // skip a day, then 15 more
            ...Array.from({ length: 15 }, (_, i) => ({ claim_date: chicagoDate(new Date(Date.now() - (i + 16) * 86400000)) })),
        ];
        assert.equal(await EGG_VERIFIERS.the_ghost(ctxOf({ recentClaims: gappy })), false);
    });

    test('daily_legend needs 30 consecutive days AT the cap, not merely active', async () => {
        const cap = DAILY_CAP.free;
        const belowCap = Array.from({ length: 30 }, (_, i) => ({
            amount: cap - 1, created_at: daysAgo(i),
        }));
        assert.equal(await EGG_VERIFIERS.daily_legend(ctxOf({ recentTransactions: belowCap })), false);

        const atCap = Array.from({ length: 30 }, (_, i) => ({
            amount: cap, created_at: daysAgo(i),
        }));
        assert.equal(await EGG_VERIFIERS.daily_legend(ctxOf({ recentTransactions: atCap })), true);
    });

    test('daily_legend uses the VIP cap for VIPs', async () => {
        const atFreeCap = Array.from({ length: 30 }, (_, i) => ({
            amount: DAILY_CAP.free, created_at: daysAgo(i),
        }));
        // A VIP earning only the free cap has not hit THEIR cap.
        assert.equal(await EGG_VERIFIERS.daily_legend(ctxOf({
            profile: { is_vip: true },
            recentTransactions: atFreeCap,
        })), false);
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
