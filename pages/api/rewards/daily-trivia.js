/**
 * DAILY TRIVIA CHALLENGE REWARD - Diamond Rewards Standard v2
 * ═══════════════════════════════════════════════════════════════════════════
 * Action key: daily_trivia_challenge (1/day). Amount + caps + dedup live in
 * award_diamonds_v2; this file owns eligibility only.
 * reference_id: `daily_trivia_challenge_<userId>_<cstDate>`.
 *
 * ANTI-FARMING SAFEGUARDS:
 *  0. Proof of play - a completed daily play must exist for today's CST date.
 *     Closes the gap noted when v2 landed ("no server-side record that the
 *     challenge was actually completed"): without it any authenticated user
 *     could curl this endpoint once a day forever and collect diamonds
 *     without ever opening the trivia page.
 *  1. Account must be 24+ hours old - fails CLOSED when the age is unknown.
 *  2. Everything else - per-action daily limit, velocity, the per-user daily
 *     and monthly caps and the platform-wide budget - is enforced inside
 *     award_diamonds_v2, which is also the dedup authority via reference_id.
 *
 * Idempotency: the reference_id is DAY-scoped, so a retry after a lost
 * response cannot double-credit. A minute-bucketed key would let a determined
 * caller re-claim 1,440x/day.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { safeAward } from '../../../src/lib/rewards/awardGuard';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';

// ── Service-role client — award_diamonds_v2 is GRANTed to service_role ONLY ──
let _supabase = null;
let _warnedNoServiceRole = false;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceKey && !_warnedNoServiceRole) {
            _warnedNoServiceRole = true;
            console.warn('[DailyTrivia] SUPABASE_SERVICE_ROLE_KEY missing — RLS reads/writes will silently fail');
        }
        _supabase = createClient(url, serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    }
    return _supabase;
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
            message: `+${award.awarded} diamonds — ${label}${award.capped ? ' (capped by your daily limit)' : ''}`
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

const ACTION_KEY = 'daily_trivia_challenge';
const MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * SAFEGUARD 0 — did this user actually complete today's daily trivia?
 * Accepts either write path (the hub pages write daily_trivia_plays directly;
 * the submit API writes trivia_scores).
 */
async function hasCompletedTodaysTrivia(supabase, userId, today) {
    const [{ data: play }, { data: scoreRow }] = await Promise.all([
        supabase
            .from('daily_trivia_plays')
            .select('id')
            .eq('user_id', userId)
            .eq('played_date', today)
            .maybeSingle(),
        supabase
            .from('trivia_scores')
            .select('id')
            .eq('user_id', userId)
            .eq('play_date', today)
            .limit(1)
            .maybeSingle(),
    ]);
    return !!play || !!scoreRow;
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

    // ── Auth: JWT required (awards diamonds) ──
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'Auth required' });
    const token = authHeader.slice(7).trim();
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    const authUser = authData?.user;
    if (authErr || !authUser?.id) return res.status(401).json({ success: false, error: 'Invalid token' });
    const userId = authUser.id; // Use JWT identity — never a body-supplied id

    const now = new Date();
    const today = getTodayCST(now);

    try {
        // ── SAFEGUARD 0: proof of play ──────────────────────────────────
        // award_diamonds_v2 proves WHO is asking and that they have not been
        // paid today; it cannot know whether the challenge was played. This
        // does.
        const played = await hasCompletedTodaysTrivia(supabase, userId, today);
        if (!played) {
            return res.status(403).json({
                success: false, claimed: false, reason: 'not_played', awarded: 0, diamondsAwarded: 0,
                message: 'No completed trivia play found for today'
            });
        }

        // ── SAFEGUARD 1: account age (24 hours minimum), FAIL CLOSED ────
        // Guarding this with `if (userProfile?.created_at)` let brand-new
        // accounts with no profile row skip the check entirely — precisely
        // the accounts the safeguard exists to stop.
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('created_at')
            .eq('id', userId)
            .maybeSingle();

        const createdAt = userProfile?.created_at || authUser.created_at || null;
        const createdMs = createdAt ? new Date(createdAt).getTime() : NaN;
        if (!Number.isFinite(createdMs) || (now.getTime() - createdMs) < MIN_ACCOUNT_AGE_MS) {
            return res.status(200).json({
                success: false, claimed: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0,
                message: 'Account too new'
            });
        }

        // ── AWARD: amount, caps, velocity, budget and dedup all live in the
        // RPC. The reference_id is DAY-scoped so retries cannot double-credit.
        const award = await awardDiamondsV2(supabase, {
            userId,
            actionKey: ACTION_KEY,
            referenceId: `${ACTION_KEY}_${userId}_${today}`,
            targetId: null,
            metadata: { source: 'daily_trivia_challenge', claim_date: today }
        });

        return sendAwardResult(res, award, 'Daily Trivia Challenge!');

    } catch (error) {
        try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[DailyTrivia] Error:', error.message || error);
        return res.status(500).json({ success: false, error: 'Failed to claim daily trivia reward' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      console.warn('[API Error]', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
