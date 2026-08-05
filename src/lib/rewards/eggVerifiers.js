/**
 * 🥚 EASTER EGG VERIFIERS — server-side proof that an egg was actually earned
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 *
 * src/config/diamondRewards.js defines 67 easter eggs worth 5–500 ◆ each, and
 * pages/api/rewards/claim.js pays them. Until this file existed, claim.js
 * checked only that the egg KEY EXISTED and that its `verifiable` flag was not
 * false. It never checked that the user had done the thing. Since the egg
 * catalog ships to the browser inside the JS bundle, every key was public, so:
 *
 *     fetch('/api/rewards/claim', { method:'POST',
 *       headers:{ Authorization:'Bearer '+token, 'Content-Type':'application/json' },
 *       body: JSON.stringify({ actionKey:'easter_egg', targetId:'to_infinity' }) })
 *
 * paid out 500 ◆ — the entire EASTER_EGG_MONTHLY_CAP, i.e. $5 of real
 * liability — to any logged-in account, on the first try, for an achievement
 * ("earn 1,000,000 diamonds over your lifetime") the user had not come close
 * to. Every one of the 64 verifiable eggs was claimable this way.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * The client never asserts that an egg was earned. It may only ask the server
 * to re-evaluate. An egg pays if, and only if, a verifier in this registry
 * returns true after querying the database. An egg with no verifier is NOT
 * claimable — silence means no, never yes. That way adding a new egg to the
 * catalog can never accidentally mint diamonds; someone has to write the proof
 * first.
 *
 * ── HONEST COVERAGE ─────────────────────────────────────────────────────────
 * Roughly a third of the catalog is provable from data the platform already
 * stores (lifetime diamond totals, streaks, referral counts, training session
 * rows, account age). The rest describe telemetry that is not recorded
 * anywhere yet — per-question answer times, hint usage, time spent on the
 * Charts page, solver-EV proximity, which store pages were browsed. Those are
 * deliberately absent here and therefore unclaimable. UNVERIFIABLE_EGGS below
 * documents each one and what it would take to support it, so the gap is a
 * written to-do rather than an open till.
 *
 * @see pages/api/rewards/claim.js         — enforces this registry
 * @see pages/api/rewards/eggs/evaluate.js — sweeps it and awards what is due
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Explicit .js extension: this module is also loaded directly by
// `node --test src/lib/rewards/__tests__/eggVerifiers.test.mjs`, and Node's ESM
// resolver does not do webpack's extensionless resolution.
import { REWARD_TIMEZONE, DAILY_CAP, EASTER_EGGS } from '../../config/diamondRewards.js';

/** How far back sweeps look for "consecutive day" style eggs. */
const STREAK_LOOKBACK_DAYS = 40;

/** Cap on rows pulled by any single verifier query. */
const ROW_LIMIT = 1000;

// ── date helpers (America/Chicago — same clock every cap and streak uses) ──

/** YYYY-MM-DD in the reward timezone. */
export function chicagoDate(d = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: REWARD_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}

/** Hour 0-23 in the reward timezone. */
function chicagoHour(d) {
    const s = new Intl.DateTimeFormat('en-US', {
        timeZone: REWARD_TIMEZONE,
        hour: '2-digit',
        hour12: false,
    }).format(d);
    return Number(s);
}

/** Day of week in the reward timezone: 'Sat', 'Sun', ... */
function chicagoWeekday(d) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: REWARD_TIMEZONE,
        weekday: 'short',
    }).format(d);
}

function daysAgoIso(n) {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

/** Longest run of consecutive YYYY-MM-DD strings in a set. */
function longestConsecutiveRun(dateSet) {
    const dates = [...dateSet].sort();
    let best = 0;
    let run = 0;
    let prev = null;
    for (const d of dates) {
        if (prev) {
            const gap = (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${prev}T00:00:00Z`)) / 86400000;
            run = gap === 1 ? run + 1 : 1;
        } else {
            run = 1;
        }
        if (run > best) best = run;
        prev = d;
    }
    return best;
}

// ── context ───────────────────────────────────────────────────────────────

/**
 * Build the shared, memoised query context handed to every verifier. A sweep
 * runs ~20 verifiers; without memoisation they would each re-fetch the same
 * profile row and transaction list.
 *
 * @param {object} supabase - service-role client
 * @param {string} userId
 */
export function createEggContext(supabase, userId) {
    const cache = new Map();
    const once = (key, fn) => {
        if (!cache.has(key)) cache.set(key, Promise.resolve().then(fn));
        return cache.get(key);
    };

    return {
        supabase,
        userId,

        profile: () => once('profile', async () => {
            const { data } = await supabase
                .from('profiles')
                .select('created_at, level, login_streak, streak_days, streak_count, country, total_hands_played, is_vip')
                .eq('id', userId)
                .maybeSingle();
            return data || null;
        }),

        /** Every positive diamond movement, ever. The "lifetime earned" source. */
        lifetimeEarned: () => once('lifetimeEarned', async () => {
            const { data } = await supabase
                .from('diamond_transactions')
                .select('amount')
                .eq('user_id', userId)
                .gt('amount', 0)
                .limit(ROW_LIMIT * 10);
            if (!Array.isArray(data)) return 0;
            return data.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        }),

        /** Recent transactions, for per-day spend and cap-hit questions. */
        recentTransactions: () => once('recentTransactions', async () => {
            const { data } = await supabase
                .from('diamond_transactions')
                .select('amount, created_at')
                .eq('user_id', userId)
                .gte('created_at', daysAgoIso(STREAK_LOOKBACK_DAYS))
                .order('created_at', { ascending: false })
                .limit(ROW_LIMIT * 5);
            return Array.isArray(data) ? data : [];
        }),

        /** Reward claims, which carry claim_date and the amount awarded. */
        recentClaims: () => once('recentClaims', async () => {
            const { data } = await supabase
                .from('diamond_reward_claims')
                .select('diamonds_awarded, claim_date, claimed_at')
                .eq('user_id', userId)
                .gte('claimed_at', daysAgoIso(STREAK_LOOKBACK_DAYS))
                .order('claimed_at', { ascending: false })
                .limit(ROW_LIMIT * 5);
            return Array.isArray(data) ? data : [];
        }),

        trainingSessions: () => once('trainingSessions', async () => {
            const { data } = await supabase
                .from('training_sessions')
                .select('id, level, level_passed, accuracy, mistake_count, created_at, game_id')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(ROW_LIMIT);
            return Array.isArray(data) ? data : [];
        }),

        /** Referrals this user made that actually completed. */
        completedReferrals: () => once('completedReferrals', async () => {
            const { data } = await supabase
                .from('referrals')
                .select('referee_id, status, completed_at')
                .eq('referrer_id', userId)
                .eq('status', 'completed')
                .limit(ROW_LIMIT);
            return Array.isArray(data) ? data : [];
        }),

        bankrollSessionCount: () => once('bankrollSessions', async () => {
            const { count } = await supabase
                .from('bankroll_sessions')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId);
            return Number(count) || 0;
        }),

        searchCount: () => once('searches', async () => {
            const { data } = await supabase
                .from('poker_near_me_search_history')
                .select('search_query')
                .eq('user_id', userId)
                .limit(ROW_LIMIT);
            if (!Array.isArray(data)) return 0;
            // "twenty DISTINCT searches" — repeating one query 20 times is not
            // twenty searches.
            return new Set(
                data.map((r) => String(r.search_query || '').trim().toLowerCase()).filter(Boolean),
            ).size;
        }),

        /** Highest like count on any post this user wrote. */
        bestPostLikes: () => once('bestPostLikes', async () => {
            const { data } = await supabase
                .from('social_posts')
                .select('like_count')
                .eq('author_id', userId)
                .eq('is_deleted', false)
                .order('like_count', { ascending: false })
                .limit(1);
            return Number(data?.[0]?.like_count) || 0;
        }),

        /** Highest like count on any comment this user wrote. */
        bestCommentLikes: () => once('bestCommentLikes', async () => {
            const { data } = await supabase
                .from('social_comments')
                .select('like_count')
                .eq('author_id', userId)
                .eq('is_deleted', false)
                .order('like_count', { ascending: false })
                .limit(1);
            return Number(data?.[0]?.like_count) || 0;
        }),
    };
}

// ── the registry ──────────────────────────────────────────────────────────
// Each entry: async (ctx) => boolean. Throwing or returning a non-true value
// means "not earned". Never return true on an error path.

export const EGG_VERIFIERS = {
    // ── LEGACY / LIFETIME ────────────────────────────────────────────────
    /** Earn 100,000 diamonds over your lifetime. */
    millionaire: async (ctx) => (await ctx.lifetimeEarned()) >= 100000,

    /** Earn 1,000,000 diamonds over your lifetime. */
    to_infinity: async (ctx) => (await ctx.lifetimeEarned()) >= 1000000,

    /** Reach Level 100. */
    level_100_boss: async (ctx) => Number((await ctx.profile())?.level) >= 100,

    /** Be a member for one full year. */
    old_guard: async (ctx) => {
        const created = (await ctx.profile())?.created_at;
        if (!created) return false;
        return Date.now() - new Date(created).getTime() >= 365 * 24 * 60 * 60 * 1000;
    },

    /** Be one of the first five hundred accounts ever created. */
    beta_tester: async (ctx) => {
        const created = (await ctx.profile())?.created_at;
        if (!created) return false;
        const { count } = await ctx.supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .lt('created_at', created);
        return Number(count) < 500;
    },

    /** Spend ten thousand diamonds in a single day. */
    high_roller: async (ctx) => {
        const perDay = new Map();
        for (const t of await ctx.recentTransactions()) {
            const amt = Number(t.amount) || 0;
            if (amt >= 0) continue;
            const day = chicagoDate(new Date(t.created_at));
            perDay.set(day, (perDay.get(day) || 0) + Math.abs(amt));
        }
        return [...perDay.values()].some((v) => v >= 10000);
    },

    // ── TIMING / LOYALTY ─────────────────────────────────────────────────
    /** Reach a 100-day login streak. */
    the_centurion: async (ctx) => {
        const p = await ctx.profile();
        const streak = Math.max(
            Number(p?.login_streak) || 0,
            Number(p?.streak_days) || 0,
            Number(p?.streak_count) || 0,
        );
        return streak >= 100;
    },

    /** Log in exactly one month after the day you signed up. */
    the_anniversary: async (ctx) => {
        const created = (await ctx.profile())?.created_at;
        if (!created) return false;
        const signup = new Date(created);
        const target = new Date(signup);
        target.setMonth(target.getMonth() + 1);
        // "Exactly" one month — this is checked on the day, so the sweep has to
        // run that day for it to land. That is the intended behaviour: it is a
        // timing egg, not a milestone.
        return chicagoDate(target) === chicagoDate();
    },

    /** Play a hand on January 1st. */
    new_year: async (ctx) => {
        const today = chicagoDate();
        if (!/-01-01$/.test(today)) return false;
        // Any diamond movement today counts as having played.
        return (await ctx.recentTransactions()).some(
            (t) => chicagoDate(new Date(t.created_at)) === today,
        );
    },

    /** Finish a training session between 2AM and 5AM. */
    night_owl: async (ctx) => (await ctx.trainingSessions()).some((s) => {
        const h = chicagoHour(new Date(s.created_at));
        return h >= 2 && h < 5;
    }),

    /** Hit your daily diamond cap on both Saturday and Sunday. */
    weekend_warrior: async (ctx) => {
        const p = await ctx.profile();
        const cap = p?.is_vip ? DAILY_CAP.vip : DAILY_CAP.free;
        const perDay = new Map();
        for (const t of await ctx.recentTransactions()) {
            const amt = Number(t.amount) || 0;
            if (amt <= 0) continue;
            const d = new Date(t.created_at);
            const day = chicagoDate(d);
            perDay.set(day, (perDay.get(day) || 0) + amt);
        }
        const cappedDays = [...perDay.entries()]
            .filter(([, total]) => total >= cap)
            .map(([day]) => day);
        const sat = cappedDays.filter((d) => chicagoWeekday(new Date(`${d}T12:00:00Z`)) === 'Sat');
        const sun = cappedDays.filter((d) => chicagoWeekday(new Date(`${d}T12:00:00Z`)) === 'Sun');
        // Same weekend: a Sunday that is the day after a capped Saturday.
        return sat.some((s) => sun.includes(
            chicagoDate(new Date(Date.parse(`${s}T12:00:00Z`) + 86400000)),
        ));
    },

    /** Hit your daily cap thirty days in a row. */
    daily_legend: async (ctx) => {
        const p = await ctx.profile();
        const cap = p?.is_vip ? DAILY_CAP.vip : DAILY_CAP.free;
        const perDay = new Map();
        for (const t of await ctx.recentTransactions()) {
            const amt = Number(t.amount) || 0;
            if (amt <= 0) continue;
            const day = chicagoDate(new Date(t.created_at));
            perDay.set(day, (perDay.get(day) || 0) + amt);
        }
        const capped = new Set([...perDay.entries()].filter(([, v]) => v >= cap).map(([d]) => d));
        return longestConsecutiveRun(capped) >= 30;
    },

    /** Thirty straight days without missing a single daily task. */
    the_ghost: async (ctx) => {
        const days = new Set(
            (await ctx.recentClaims())
                .map((c) => c.claim_date || (c.claimed_at ? chicagoDate(new Date(c.claimed_at)) : null))
                .filter(Boolean),
        );
        return longestConsecutiveRun(days) >= 30;
    },

    // ── REFERRALS / SOCIAL ───────────────────────────────────────────────
    /** Reach twenty qualified referrals. */
    the_ambassador: async (ctx) => (await ctx.completedReferrals()).length >= 20,

    /** Reach one hundred qualified referrals. */
    the_whale: async (ctx) => (await ctx.completedReferrals()).length >= 100,

    /** Refer a player from a different country than your own. */
    the_diplomat: async (ctx) => {
        const mine = (await ctx.profile())?.country;
        if (!mine) return false;
        const refs = await ctx.completedReferrals();
        if (!refs.length) return false;
        const { data } = await ctx.supabase
            .from('profiles')
            .select('country')
            .in('id', refs.map((r) => r.referee_id).filter(Boolean).slice(0, 200));
        return (data || []).some((r) => r.country && r.country !== mine);
    },

    /** Have five referrals active in the same week. */
    squad_goals: async (ctx) => {
        const refs = await ctx.completedReferrals();
        if (refs.length < 5) return false;
        const { data } = await ctx.supabase
            .from('profiles')
            .select('last_active')
            .in('id', refs.map((r) => r.referee_id).filter(Boolean).slice(0, 200))
            .gte('last_active', daysAgoIso(7));
        return (data || []).length >= 5;
    },

    /** One of your strategy comments reaches fifty likes. */
    comment_king: async (ctx) => (await ctx.bestCommentLikes()) >= 50,

    /** A meme you posted reaches twenty likes. */
    meme_lord: async (ctx) => (await ctx.bestPostLikes()) >= 20,

    // ── TRAINING PERFORMANCE ─────────────────────────────────────────────
    /** Clear five levels back to back without a single error. */
    perfectionist: async (ctx) => {
        const sessions = (await ctx.trainingSessions())
            .slice()
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        let run = 0;
        for (const s of sessions) {
            if (s.level_passed === true && Number(s.mistake_count) === 0) {
                run += 1;
                if (run >= 5) return true;
            } else {
                run = 0;
            }
        }
        return false;
    },

    /** Clear ten training levels inside a single hour. */
    multi_level_master: async (ctx) => {
        const passes = (await ctx.trainingSessions())
            .filter((s) => s.level_passed === true)
            .map((s) => new Date(s.created_at).getTime())
            .sort((a, b) => a - b);
        for (let i = 0; i + 9 < passes.length; i += 1) {
            if (passes[i + 9] - passes[i] <= 60 * 60 * 1000) return true;
        }
        return false;
    },

    /** Fail a level twice, then pass it at 95% or better. */
    comeback_kid: async (ctx) => {
        const byLevel = new Map();
        const sessions = (await ctx.trainingSessions())
            .slice()
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        for (const s of sessions) {
            const key = `${s.game_id || 'x'}:${s.level ?? 'x'}`;
            const state = byLevel.get(key) || { fails: 0 };
            if (s.level_passed === true) {
                if (state.fails >= 2 && Number(s.accuracy) >= 95) return true;
                state.fails = 0;
            } else {
                state.fails += 1;
            }
            byLevel.set(key, state);
        }
        return false;
    },

    /** Pass a Level 5+ session at 100% on your first attempt at that level. */
    dead_reckoning: async (ctx) => {
        const sessions = (await ctx.trainingSessions())
            .slice()
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const seen = new Set();
        for (const s of sessions) {
            const key = `${s.game_id || 'x'}:${s.level ?? 'x'}`;
            const first = !seen.has(key);
            seen.add(key);
            if (
                first
                && Number(s.level) >= 5
                && s.level_passed === true
                && Number(s.accuracy) >= 100
            ) return true;
        }
        return false;
    },

    // ── DISCOVERY ────────────────────────────────────────────────────────
    /** Log thirty sessions in the Bankroll Manager. */
    bankroll_builder: async (ctx) => (await ctx.bankrollSessionCount()) >= 30,

    /** Run twenty distinct player or game searches. */
    the_librarian: async (ctx) => (await ctx.searchCount()) >= 20,
};

/**
 * Eggs with no verifier, and what each one would need before it can pay.
 * Keeping this list in code (rather than in a doc that drifts) means the gap
 * is visible to whoever next opens the file.
 */
export const UNVERIFIABLE_EGGS = {
    // Needs per-question telemetry: answer latency, hint usage, EV delta per
    // decision. training_sessions stores only session aggregates today.
    gto_machine: 'needs per-question hint-usage tracking',
    speed_demon: 'needs per-question answer latency',
    the_machine: 'needs per-question answer latency',
    calculated_risk: 'needs per-decision solver EV delta',
    the_sniper: 'needs per-session clock remaining',
    value_extractor: 'needs per-hand EV capture',
    postflop_wizard: 'needs per-street decision log',
    preflop_bot: 'needs cumulative preflop decision accuracy',
    the_oracle: 'needs solver-prediction game telemetry',
    pure_strategy: 'needs per-decision frequency classification',
    mix_master: 'needs per-decision frequency classification',
    the_punisher: 'needs opponent-archetype tagging',
    folding_legend: 'needs per-hand hole-card + action context',
    bluffcatcher: 'needs per-hand action context',
    range_architect: 'needs range-study page telemetry',
    equity_expert: 'needs equity-estimation game telemetry',
    blocker_pro: 'needs per-hand blocker analysis',
    overbet_outlaw: 'needs per-decision sizing log',
    minimum_defense: 'needs per-decision MDF classification',
    check_raise_king: 'needs per-decision line classification',
    polarizer: 'needs range-classification game telemetry',
    indifference_point: 'needs per-line indifference solve',
    small_baller: 'needs per-decision sizing log',
    the_optimizer: 'needs leak-resolution attempt history (leak_review_state is new)',
    zero_leak: 'needs hands-since-last-leak counter',
    deep_diver: 'needs time-on-page telemetry for Charts',
    window_shopper: 'needs store page-view telemetry',
    data_miner: 'needs hand-history export logging',
    sunrise_grinder: 'needs user geolocation + sunrise calculation',
    first_blood: 'needs per-user Arena hand results (hand_history has no user_id)',
    road_tripper: 'needs venue -> state join on venue_reviews',
    the_collector: 'needs table-theme ownership records',
    the_finisher: 'needs a canonical training game library list',
    server_first: 'needs level release timestamps + global first-pass tracking',
    diamond_hands: 'needs daily balance snapshots',
    the_recruiter: 'needs referee level history',
    group_chat_leader: 'needs study-group membership records',
    poll_master: 'needs Hand of the Day poll vote records',
    wall_of_fame: 'needs Daily Top Grinder feature records',
    // verifiable:false in the catalog — awarded by staff, never claimable.
    retweet_royalty: 'staff-awarded',
    feedback_loop: 'staff-awarded',
    ghost_writer: 'staff-awarded',
};

/** Egg keys this server can actually prove. */
export function verifiableEggKeys() {
    return Object.keys(EGG_VERIFIERS);
}

/**
 * Can this egg ever be self-claimed?
 * @returns {boolean} false when no verifier exists (claim must be refused)
 */
export function hasVerifier(eggKey) {
    return Object.prototype.hasOwnProperty.call(EGG_VERIFIERS, eggKey);
}

/**
 * Prove (or fail to prove) that a user earned an egg.
 * Fails CLOSED: an unknown egg, a missing verifier, or a thrown query error all
 * return false. The only path to true is a verifier that ran and said yes.
 *
 * @param {string} eggKey
 * @param {object} ctx - from createEggContext()
 * @returns {Promise<{verified: boolean, reason: string}>}
 */
export async function verifyEgg(eggKey, ctx) {
    if (!eggKey || !Object.prototype.hasOwnProperty.call(EASTER_EGGS, eggKey)) {
        return { verified: false, reason: 'unknown_egg' };
    }
    if (EASTER_EGGS[eggKey].verifiable === false) {
        return { verified: false, reason: 'staff_awarded' };
    }
    if (!hasVerifier(eggKey)) {
        return { verified: false, reason: 'no_verifier' };
    }
    try {
        const ok = await EGG_VERIFIERS[eggKey](ctx);
        return { verified: ok === true, reason: ok === true ? 'verified' : 'not_met' };
    } catch (err) {
        // A broken query must never pay out.
        console.warn(`[EggVerifier] ${eggKey} threw:`, err?.message || err);
        return { verified: false, reason: 'verifier_error' };
    }
}

export default { EGG_VERIFIERS, UNVERIFIABLE_EGGS, createEggContext, verifyEgg, hasVerifier, verifiableEggKeys };
