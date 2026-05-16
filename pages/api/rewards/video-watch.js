/**
 * 📺 VIDEO WATCH REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 3diamonds for watching 5+ minutes of a video (max 5 per day)
 *
 * ANTI-FARMING SAFEGUARDS:
 * - Must watch 5+ minutes (300s), verified via video_watch_history
 * - 5 unique videos per day max
 * - Same video can only earn once
 * - 500diamonds daily cap
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const WATCH_REWARD = 3;
const MAX_PER_DAY = 5;
const MIN_WATCH_SECONDS = 300;
const DAILY_CAP = 500;


let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // ── Auth: JWT required (awards diamonds) ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
      const authUser = authData?.user;
      if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      const { videoId } = req.body;
      const userId = authUser.id; // Use JWT identity

      if (!userId || !videoId) {
          return res.status(400).json({ success: false, error: 'userId and videoId required' });
      }

      const now = new Date();
      const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

      try {
          // SAFEGUARD 1: Verify watch time >= 5 min
          const { data: watchRecord } = await getSupabase()
              .from('video_watch_history')
              .select('watch_duration_seconds')
              .eq('user_id', userId)
              .eq('video_id', videoId)
              .maybeSingle();

          if (!watchRecord || (watchRecord.watch_duration_seconds || 0) < MIN_WATCH_SECONDS) {
              return res.status(200).json({ success: false, message: `Must watch at least ${MIN_WATCH_SECONDS / 60} minutes` });
          }

          // SAFEGUARD 2: Already claimed for this video (lifetime)
          const { data: videoClaim } = await getSupabase()
              .from('diamond_reward_claims')
              .select('id')
              .eq('user_id', userId)
              .eq('reward_type', 'video_watch')
              .contains('metadata', { video_id: videoId })
              .maybeSingle();

          if (videoClaim) {
              return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Already earned for this video' });
          }

          // SAFEGUARD 3: Daily limit
          const { count } = await getSupabase()
              .from('diamond_reward_claims')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', userId)
              .eq('reward_type', 'video_watch')
              .eq('claim_date', today);

          if ((count || 0) >= MAX_PER_DAY) {
              return res.status(200).json({ success: true, alreadyClaimed: true, message: `Video watch limit (${MAX_PER_DAY}/day) reached` });
          }

          // SAFEGUARD 4: Daily cap
          const { data: todayClaims } = await getSupabase()
              .from('diamond_reward_claims')
              .select('diamonds_awarded')
              .eq('user_id', userId)
              .eq('claim_date', today)
              .neq('reward_type', 'referral')
                  .limit(200);

          const todayTotal = (todayClaims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);
          if (todayTotal + WATCH_REWARD > DAILY_CAP) {
              return res.status(200).json({ success: false, dailyCapReached: true });
          }

          // Record & award
          // BUG #271 FIX: Check insert result before awarding diamonds
          const { error: claimErr } = await getSupabase().from('diamond_reward_claims').insert({
              user_id: userId,
              reward_type: 'video_watch',
              diamonds_awarded: WATCH_REWARD,
              claim_date: today,
              metadata: { video_id: videoId, watch_seconds: watchRecord.watch_duration_seconds }
          });

          if (claimErr) {
              if (claimErr.code === '23505') {
                  return res.status(200).json({ success: true, alreadyClaimed: true });
              }
              throw claimErr;
          }

          const { error: rpcError } = await getSupabase().rpc('add_diamonds_to_balance', {
              p_user_id: userId,
              p_amount: WATCH_REWARD,
              p_type: 'video_watch',
              p_description: `Video watch reward — ${WATCH_REWARD}diamonds`,
              // Action-namespaced + actor-scoped to avoid colliding with
              // bare videoId reference_ids in video-favorite.js.
              p_reference_id: `video_watch_${userId}_${videoId}`
          });

          if (rpcError) {
              // Roll back the idempotency claim row so the user can retry.
              // Same bug shape as daily-login (commit 8d9ce5c9f1).
              const { error: rollbackErr } = await getSupabase()
                  .from('diamond_reward_claims')
                  .delete()
                  .eq('user_id', userId)
                  .eq('reward_type', 'video_watch')
                  .eq('claim_date', today);
              if (rollbackErr) {
                  console.warn('[VideoWatch] Rollback delete failed:', rollbackErr.message);
              }
              console.warn('[VideoWatch] RPC error (claim rolled back so user can retry):', rpcError);
              return res.status(500).json({ success: false, error: 'Failed to credit diamonds — please retry' });
          }

          return res.status(200).json({ success: true, claimed: true, diamondsAwarded: WATCH_REWARD });

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
