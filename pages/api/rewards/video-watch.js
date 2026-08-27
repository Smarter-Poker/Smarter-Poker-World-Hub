/**
 * 📺 VIDEO WATCH REWARD — Diamond Rewards Standard v2
 * ═══════════════════════════════════════════════════════════════════════════
 * Action key: video_watch. Amount, 3/day limit, caps, velocity and dedup live
 * in award_diamonds_v2. reference_id: `video_watch_<userId>_<videoId>`.
 *
 * PROOF-OF-WATCH — READ THIS BEFORE TRUSTING IT:
 * public.video_watch_history watch credit is written only by the hardened,
 * authenticated heartbeat RPC. The API independently verifies:
 *   1. the row must exist for (this user, this video)
 *   2. watch_duration_seconds >= 300
 *   3. an immutable server timestamp proves at least 285 seconds elapsed
 *   4. the canonical catalog video exists and is at least five minutes long
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
const MIN_PROOF_AGE_SECONDS = 285;

function parseCatalogDuration(value) {
    const parts = String(value || '').split(':').map(Number);
    if (!parts.length || parts.some(part => !Number.isFinite(part) || part < 0)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
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

    const { videoId } = req.body || {};
    if (!videoId) {
        return res.status(400).json({ success: false, error: 'videoId required' });
    }

    const now = new Date();

    try {
        // ── Proof-of-watch: strongest server-side signal available ──
        const { data: watchRecord, error: watchError } = await supabase
            .from('video_watch_history')
            .select('id, watch_duration_seconds, progress_seconds, duration_seconds, watch_started_at, last_heartbeat_at')
            .eq('user_id', userId)
            .eq('video_id', videoId)
            .maybeSingle();

        if (watchError) throw watchError;

        if (!watchRecord) {
            return res.status(200).json({ success: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0, message: 'No watch history for this video' });
        }

        const watched = Number(watchRecord.watch_duration_seconds || 0);

        if (watched < MIN_WATCH_SECONDS) {
            return res.status(200).json({
                success: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0,
                message: `Must watch at least ${MIN_WATCH_SECONDS / 60} minutes`
            });
        }

        // Wall-clock plausibility: you cannot have watched 5 minutes of a video
        // whose history row is 30 seconds old, and a future timestamp is a forgery.
        const startedAt = watchRecord.watch_started_at ? new Date(watchRecord.watch_started_at) : null;
        const proofAgeSeconds = startedAt && !Number.isNaN(startedAt.getTime())
            ? (now - startedAt) / 1000
            : -1;
        if (proofAgeSeconds < MIN_PROOF_AGE_SECONDS) {
            return res.status(200).json({ success: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0, message: 'Watch time is still being verified' });
        }

        const { data: catalogVideo, error: catalogError } = await supabase
            .from('video_library_videos')
            .select('youtube_video_id, duration')
            .eq('youtube_video_id', videoId)
            .maybeSingle();
        if (catalogError) throw catalogError;
        const videoDuration = parseCatalogDuration(catalogVideo?.duration);
        if (!catalogVideo || videoDuration < MIN_WATCH_SECONDS) {
            return res.status(200).json({
                success: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0,
                message: 'This catalog video is too short to earn a watch reward'
            });
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
                proof: 'server_timed_heartbeat'
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
