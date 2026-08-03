/**
 * 📅 DAILY LOGIN REWARD — Diamond Rewards Standard v2
 * ═══════════════════════════════════════════════════════════════════════════
 * Action key: daily_login. 5 → 25 💎, streak-scaled: min(5 + (streak-1)*2, 25).
 * The amount is resolved SERVER-SIDE inside award_diamonds_v2 from the streak
 * we pass in p_metadata — this file never sends an amount.
 *
 * FIX vs v1: the streak was a COUNT of login rows in the last 30 days, so any
 * user with 7 logins was permanently pinned at the maximum payout. It is now a
 * TRUE consecutive-day streak anchored to America/Chicago, walked back day by
 * day over the server-written diamond_transactions ledger (which the user
 * cannot insert into — diamond_reward_claims is user-writable and therefore
 * worthless as a streak source).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { safeAward } from '../../../src/lib/rewards/awardGuard';

// ── Service-role client — award_diamonds_v2 is GRANTed to service_role ONLY ──
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/** YYYY-MM-DD in America/Chicago — the anchor timezone for every diamond day. */
function chicagoDate(d = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
}

const REASON_MESSAGE = {
    ok: 'Diamonds awarded',
    duplicate: 'Already claimed',
    daily_cap: 'Daily diamond cap reached — come back tomorrow',
    monthly_cap: 'Monthly diamond cap reached',
    action_limit: 'Daily limit reached for this reward',
    velocity: 'Slow down a moment before earning again',
    budget_exhausted: 'Rewards are paused right now — please try again later',
    unknown_action: 'Unknown reward action',
    not_eligible: 'Not eligible for this reward'
};

/**
 * Delegate the award to public.award_diamonds_v2. The amount is resolved
 * SERVER-SIDE from the catalog — this endpoint never sends one, and the client
 * never sends one either. Dedup (reference_id), per-action daily limits,
 * velocity, the POST-multiplier daily/monthly caps and the platform budget all
 * live inside the SQL function. We only decide *eligibility*.
 */
async function awardDiamondsV2(supabase, { userId, actionKey, referenceId, targetId = null, metadata = {} }) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.warn('[RewardsV2] SUPABASE_SERVICE_ROLE_KEY missing — award_diamonds_v2 is service_role only');
        return { ok: false, transportError: { message: 'Service role key not configured' } };
    }
    // safeAward never throws. If migration 20260726120000 has not been applied,
    // award_diamonds_v2 does not exist — that comes back as migrationMissing so
    // this endpoint can answer 200 "unavailable" instead of 500-ing the site.
    const { ok, data, migrationMissing, error } = await safeAward(supabase, {
        p_user_id: userId,
        p_action_key: actionKey,
        p_reference_id: referenceId,
        p_target_id: targetId === null || targetId === undefined ? null : String(targetId),
        p_metadata: metadata || {}
    });
    if (!ok) {
        if (migrationMissing) {
            return { ok: false, migrationMissing: true, transportError: error };
        }
        console.warn('[RewardsV2] RPC error for', actionKey, '-', (error && error.message) || error);
        return { ok: false, transportError: error };
    }
    const r = data || {};
    return {
        ok: true,
        success: r.success === true,
        awarded: Number(r.awarded || 0),
        requested: Number(r.requested || 0),
        reason: r.reason || 'unknown',
        capped: r.capped === true,
        dailyRemaining: r.daily_remaining === undefined ? null : r.daily_remaining,
        monthlyRemaining: r.monthly_remaining === undefined ? null : r.monthly_remaining,
        balance: r.balance_after === undefined ? null : r.balance_after
    };
}

/**
 * Surface the RPC's verdict honestly. `reason` and `awarded` always reflect
 * what the ledger actually did. `success` stays true for duplicate/action_limit
 * so existing clients keep their "already claimed" branch.
 */
function sendAwardResult(res, award, label, extra = {}) {
    if (!award.ok) {
        // Migration not applied → the reward system is down, not the request.
        // 200 keeps the client's happy path intact and nothing was written, so
        // the user can claim this exact reward again once the migration lands.
        if (award.migrationMissing) {
            return res.status(200).json({
                ...extra,
                success: false,
                claimed: false,
                awarded: 0,
                diamondsAwarded: 0,
                reason: 'unavailable',
                message: 'Rewards are temporarily unavailable.'
            });
        }
        return res.status(500).json({ success: false, error: 'Failed to credit diamonds — please retry' });
    }
    const base = {
        ...extra,
        awarded: award.awarded,
        diamondsAwarded: award.awarded,
        requested: award.requested,
        reason: award.reason,
        capped: award.capped,
        dailyRemaining: award.dailyRemaining,
        monthlyRemaining: award.monthlyRemaining,
        balance: award.balance
    };
    if (award.success) {
        return res.status(200).json({
            ...base,
            success: true,
            claimed: true,
            message: `+${award.awarded} 💎 ${label}${award.capped ? ' (capped by your daily limit)' : ''}`
        });
    }
    const softClaim = award.reason === 'duplicate' || award.reason === 'action_limit';
    return res.status(200).json({
        ...base,
        success: softClaim,
        claimed: false,
        alreadyClaimed: softClaim,
        dailyCapReached: award.reason === 'daily_cap',
        monthlyCapReached: award.reason === 'monthly_cap',
        cooldown: award.reason === 'velocity',
        message: REASON_MESSAGE[award.reason] || 'Reward not granted'
    });
}

const ACTION_KEY = 'daily_login';
const MIN_ACCOUNT_AGE_MS = 60 * 60 * 1000;   // 1 hour
const MAX_STREAK_LOOKBACK_DAYS = 400;

/** Calendar arithmetic on a Chicago-anchored YYYY-MM-DD string (DST-safe). */
function shiftDate(dateStr, deltaDays) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const t = Date.UTC(y, m - 1, d) + deltaDays * 86400000;
    const nd = new Date(t);
    return `${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, '0')}-${String(nd.getUTCDate()).padStart(2, '0')}`;
}

/** Catalog formula — mirrored here only to report the expected value to the client. */
function expectedLoginDiamonds(streak) {
    return Math.min(5 + (Math.max(1, streak) - 1) * 2, 25);
}

/**
 * TRUE consecutive-day streak, anchored America/Chicago.
 * Source of truth: diamond_transactions.reference_id, which is written only by
 * the service role and encodes the Chicago claim date (`daily_login_<uid>_<date>`).
 */
async function computeLoginStreak(supabase, userId, today) {
    const { data, error } = await supabase
        .from('diamond_transactions')
        .select('reference_id')
        .eq('user_id', userId)
        .like('reference_id', `${ACTION_KEY}_${userId}_%`)
        .order('created_at', { ascending: false })
        .limit(MAX_STREAK_LOOKBACK_DAYS);

    if (error) {
        // Never inflate a streak on a read failure — fall back to day 1.
        console.warn('[DailyLogin] Streak lookup failed, defaulting to streak 1:', error.message || error);
        return { streak: 1, degraded: true };
    }

    const claimedDays = new Set();
    for (const row of data || []) {
        const match = /_(\d{4}-\d{2}-\d{2})$/.exec(row.reference_id || '');
        if (match) claimedDays.add(match[1]);
    }

    let streak = 1;
    let cursor = shiftDate(today, -1);
    while (claimedDays.has(cursor) && streak < MAX_STREAK_LOOKBACK_DAYS) {
        streak += 1;
        cursor = shiftDate(cursor, -1);
    }
    return { streak, degraded: false };
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
        if (!applyRateLimit(req, res, LIMITS.write)) return;
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const supabase = getSupabase();

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    const authUser = authData?.user;
    if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
    const userId = authUser.id;

    const now = new Date();
    const today = chicagoDate(now);

    try {
        // ── Eligibility: account age (1h) ──
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('created_at')
            .eq('id', userId)
            .maybeSingle();

        if (userProfile?.created_at && (now - new Date(userProfile.created_at)) < MIN_ACCOUNT_AGE_MS) {
            return res.status(200).json({
                success: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0,
                message: 'Welcome! Daily login rewards start after your first hour.'
            });
        }

        const { streak, degraded } = await computeLoginStreak(supabase, userId, today);

        const award = await awardDiamondsV2(supabase, {
            userId,
            actionKey: ACTION_KEY,
            referenceId: `${ACTION_KEY}_${userId}_${today}`,
            targetId: null,
            metadata: {
                streak,
                claim_date: today,
                timezone: 'America/Chicago',
                streak_source: degraded ? 'degraded_default' : 'diamond_transactions',
                expected_diamonds: expectedLoginDiamonds(streak)
            }
        });

        // migrationMissing falls through to sendAwardResult, which answers 200
        // "temporarily unavailable" instead of 500. Nothing was written here,
        // so today's login remains claimable once the migration is applied.
        if (!award.ok && !award.migrationMissing) {
            return res.status(500).json({ success: false, error: 'Failed to credit diamonds — please retry' });
        }

        const label = streak > 1 ? `Daily Login (${streak}-day streak)!` : "Daily Login Reward!";
        // streak is attached to the standard award envelope as extra context.
        return sendAwardResult(res, award, label, { streak });

    } catch (error) {
        console.warn('[DailyLogin] Error:', error.message || error);
        return res.status(500).json({ success: false, error: 'Failed to claim daily login reward' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      console.warn('[API Error]', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
