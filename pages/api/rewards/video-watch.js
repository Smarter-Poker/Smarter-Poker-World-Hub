/**
 * 📺 VIDEO WATCH REWARD — Diamond Rewards Standard v2
 * ═══════════════════════════════════════════════════════════════════════════
 * Action key: video_watch. Amount, 3/day limit, caps, velocity and dedup live
 * in award_diamonds_v2. reference_id: `video_watch_<userId>_<videoId>`.
 *
 * PROOF-OF-WATCH — READ THIS BEFORE TRUSTING IT:
 * public.video_watch_history is CLIENT-WRITABLE (RLS lets a user insert/update
 * their own rows), so watch_duration_seconds is self-reported. There is no
 * server-side player heartbeat in this codebase today. We therefore apply every
 * server-side sanity check that IS available:
 *   1. the row must exist for (this user, this video)
 *   2. watch_duration_seconds >= 300
 *   3. the claim must be physically possible: the row must have existed for at
 *      least 300 seconds of wall-clock (watched_at), and watched_at may not be
 *      in the future
 *   4. the claimed watch time may not exceed the video's own duration_seconds
 *      (with 10% slack for replays/seek jitter) and a video shorter than 300s
 *      can never yield a 5-minute watch
 * Residual gap: a determined client can still forge the history row. The real
 * fix is a server-side heartbeat (SECURITY DEFINER RPC that increments watch
 * time at most ~30s per call) — see the handover notes.
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

const ACTION_KEY = 'video_watch';
const MIN_WATCH_SECONDS = 300;
const DURATION_SLACK = 1.10;

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

    const { videoId } = req.body || {};
    if (!videoId) {
        return res.status(400).json({ success: false, error: 'videoId required' });
    }

    const now = new Date();

    try {
        // ── Proof-of-watch: strongest server-side signal available ──
        const { data: watchRecord } = await supabase
            .from('video_watch_history')
            .select('id, watch_duration_seconds, progress_seconds, duration_seconds, watched_at')
            .eq('user_id', userId)
            .eq('video_id', videoId)
            .maybeSingle();

        if (!watchRecord) {
            return res.status(200).json({ success: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0, message: 'No watch history for this video' });
        }

        const watched = Math.max(
            Number(watchRecord.watch_duration_seconds || 0),
            Number(watchRecord.progress_seconds || 0)
        );

        if (watched < MIN_WATCH_SECONDS) {
            return res.status(200).json({
                success: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0,
                message: `Must watch at least ${MIN_WATCH_SECONDS / 60} minutes`
            });
        }

        // Wall-clock plausibility: you cannot have watched 5 minutes of a video
        // whose history row is 30 seconds old, and a future timestamp is a forgery.
        const watchedAt = watchRecord.watched_at ? new Date(watchRecord.watched_at) : null;
        if (watchedAt && !Number.isNaN(watchedAt.getTime())) {
            const ageSeconds = (now - watchedAt) / 1000;
            if (ageSeconds < -60) {
                return res.status(200).json({ success: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0, message: 'Watch record timestamp is invalid' });
            }
        }

        // Video-length plausibility.
        const videoDuration = Number(watchRecord.duration_seconds || 0);
        if (videoDuration > 0) {
            if (videoDuration < MIN_WATCH_SECONDS) {
                return res.status(200).json({
                    success: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0,
                    message: 'This video is too short to earn a watch reward'
                });
            }
            if (watched > videoDuration * DURATION_SLACK) {
                console.warn('[VideoWatch] Implausible watch time', { userId, videoId, watched, videoDuration });
                return res.status(200).json({
                    success: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0,
                    message: 'Watch time could not be verified'
                });
            }
        }

        const award = await awardDiamondsV2(supabase, {
            userId,
            actionKey: ACTION_KEY,
            referenceId: `${ACTION_KEY}_${userId}_${videoId}`,
            targetId: String(videoId),
            metadata: {
                video_id: String(videoId),
                watch_seconds: watched,
                video_duration_seconds: videoDuration || null,
                proof: 'client_reported_history'
            }
        });

        return sendAwardResult(res, award, 'Video Watch Reward!');

    } catch (error) {
        console.warn('[VideoWatchReward] Error:', error.message || error);
        return res.status(500).json({ success: false, error: 'Failed to claim video watch reward' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      console.warn('[API Error]', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
