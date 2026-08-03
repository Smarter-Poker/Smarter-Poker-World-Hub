/**
 * 📤 SHARE REWARD — Diamond Rewards Standard v2
 * ═══════════════════════════════════════════════════════════════════════════
 * Action key: share_content. Amount + per-day limit + caps + velocity all live
 * in award_diamonds_v2; this file owns eligibility only (24h account age).
 *
 * reference_id is user-scoped:
 *   share_content_<userId>_<contentId>          when a contentId is supplied
 *   share_content_<userId>_<date>_<shareType>   otherwise
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

const ACTION_KEY = 'share_content';
const MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

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

    const { shareType, contentId } = req.body || {};
    const now = new Date();
    const today = chicagoDate(now);

    try {
        // ── Eligibility: account age (24h) ──
        const { data: profile } = await supabase
            .from('profiles')
            .select('created_at')
            .eq('id', userId)
            .maybeSingle();

        if (profile?.created_at && (now - new Date(profile.created_at)) < MIN_ACCOUNT_AGE_MS) {
            return res.status(200).json({ success: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0, message: 'Account must be 24h old' });
        }

        const safeType = String(shareType || 'score_card').replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 32) || 'score_card';
        const safeContentId = contentId ? String(contentId).substring(0, 80) : null;
        const referenceId = safeContentId
            ? `${ACTION_KEY}_${userId}_${safeContentId}`
            : `${ACTION_KEY}_${userId}_${today}_${safeType}`;

        const award = await awardDiamondsV2(supabase, {
            userId,
            actionKey: ACTION_KEY,
            referenceId,
            targetId: safeContentId,
            metadata: { share_type: safeType, content_id: safeContentId, claim_date: today }
        });

        return sendAwardResult(res, award, 'Share Reward!');

    } catch (error) {
        console.warn('[ShareReward] Error:', error.message || error);
        return res.status(500).json({ success: false, error: 'Failed to claim share reward' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      console.warn('[API Error]', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
