/**
 * 📍 VENUE REVIEW REWARD — Diamond Rewards Standard v2
 * ═══════════════════════════════════════════════════════════════════════════
 * Action key: venue_review (lifetime 1 per venue). Amount, per-day limit, caps
 * and dedup live in award_diamonds_v2.
 * reference_id: `venue_review_<userId>_<venueId>`.
 *
 * THE GEOFENCE IS GONE — ON PURPOSE.
 * v1 computed a 200m haversine geofence from latitude/longitude supplied in the
 * REQUEST BODY. That is not proof of anything: any client can post the venue's
 * own coordinates. There is no server-side location source in this codebase
 * (venue_checkins is equally client-writable), so this reward is now gated on
 * MODERATION APPROVAL of the review row instead:
 *   - a venue_reviews row must exist for (this user, this venue)
 *   - it must not be flagged (is_flagged)
 *   - it must carry an explicit approval signal: is_approved / approved /
 *     reward_approved = true, or moderation_status/status = 'approved'
 * If your venue_reviews table has no approval column yet, NOTHING is paid and
 * the endpoint answers `pending_moderation` — that is the intended fail-closed
 * behaviour. See the handover notes for the column + review queue you need.
 * lat/long in the body are accepted for backwards compatibility and IGNORED.
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

const ACTION_KEY = 'venue_review';
const MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;
const MIN_REVIEW_LENGTH = 40;

/** Explicit, server-controlled approval signal. Absent column ⇒ not approved. */
function isApproved(review) {
    if (!review) return false;
    if (review.is_approved === true || review.approved === true || review.reward_approved === true) return true;
    const status = String(review.moderation_status || review.review_status || review.status || '').toLowerCase();
    return status === 'approved' || status === 'published';
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

    const { venueId } = req.body || {};   // latitude/longitude are deliberately ignored
    if (!venueId) {
        return res.status(400).json({ success: false, error: 'venueId required' });
    }

    const now = new Date();
    const venueIdStr = String(venueId);

    try {
        // ── Eligibility 1: account age (24h) ──
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('created_at')
            .eq('id', userId)
            .maybeSingle();

        if (userProfile?.created_at && (now - new Date(userProfile.created_at)) < MIN_ACCOUNT_AGE_MS) {
            return res.status(200).json({ success: false, claimed: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0, message: 'Account too new' });
        }

        // ── Eligibility 2: the venue exists ──
        const { data: venue } = await supabase
            .from('poker_venues')
            .select('id, name')
            .eq('id', venueId)
            .maybeSingle();

        if (!venue) {
            return res.status(200).json({ success: false, claimed: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0, message: 'Venue not found' });
        }

        // ── Eligibility 3: a real review by THIS user for THIS venue ──
        const { data: review, error: reviewErr } = await supabase
            .from('venue_reviews')
            .select('*')
            .eq('user_id', userId)
            .eq('venue_id', venueIdStr)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (reviewErr) {
            console.warn('[VenueReview] Review lookup failed:', reviewErr.message || reviewErr);
            return res.status(500).json({ success: false, error: 'Could not verify review' });
        }
        if (!review) {
            return res.status(200).json({
                success: false, claimed: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0,
                message: 'Leave a review for this venue first'
            });
        }

        // ── Eligibility 4: quality bar ──
        if ((review.review_text || '').trim().length < MIN_REVIEW_LENGTH) {
            return res.status(200).json({
                success: false, claimed: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0,
                message: `Reviews need at least ${MIN_REVIEW_LENGTH} characters to earn diamonds`
            });
        }

        // ── Eligibility 5: moderation (replaces the spoofable GPS geofence) ──
        if (review.is_flagged === true) {
            return res.status(200).json({
                success: false, claimed: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0,
                message: 'This review was flagged and is not eligible for diamonds'
            });
        }
        if (!isApproved(review)) {
            return res.status(200).json({
                success: false, claimed: false, reason: 'pending_moderation', awarded: 0, diamondsAwarded: 0,
                message: 'Thanks! Your review earns diamonds once it is approved.'
            });
        }

        const award = await awardDiamondsV2(supabase, {
            userId,
            actionKey: ACTION_KEY,
            referenceId: `${ACTION_KEY}_${userId}_${venueIdStr}`,
            targetId: venueIdStr,
            metadata: {
                venue_id: venueIdStr,
                venue_name: venue.name || 'Unknown',
                review_id: review.id || null,
                verified_by: 'moderation_approval'
            }
        });

        return sendAwardResult(res, award, `Venue Review — ${venue.name || 'venue'}`, { venueName: venue.name || null });

    } catch (error) {
        console.warn('[VenueReview] Error:', error.message || error);
        return res.status(500).json({ success: false, error: 'Failed to claim venue review reward' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      console.warn('[API Error]', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
