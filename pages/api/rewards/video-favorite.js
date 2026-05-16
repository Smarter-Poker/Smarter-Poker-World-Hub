/**
 * ⭐ VIDEO FAVORITE REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 2diamonds for favoriting a video (max 3 per day)
 *
 * ANTI-FARMING SAFEGUARDS:
 * - 3 rewards per day max
 * - 1-minute cooldown
 * - Same video can only earn once (lifetime)
 * - Favorite must exist in video_favorites table
 * - 500diamonds daily cap
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FAV_REWARD = 2;
const MAX_PER_DAY = 3;
const DAILY_CAP = 500;
const COOLDOWN_MINUTES = 1;


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


      const supabase = getSupabase();
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
          // Verify favorite exists
          const { data: fav } = await supabase
              .from('video_favorites')
              .select('id')
              .eq('user_id', userId)
              .eq('video_id', videoId)
              .maybeSingle();

          if (!fav) {
              return res.status(200).json({ success: false, message: 'Favorite not found' });
          }

          // Already claimed for this video (lifetime)
          const { data: videoClaim } = await supabase
              .from('diamond_reward_claims')
              .select('id')
              .eq('user_id', userId)
              .eq('reward_type', 'video_favorite')
              .contains('metadata', { video_id: videoId })
              .maybeSingle();

          if (videoClaim) {
              return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Already earned for this video' });
          }

          // Daily limit
          const { count } = await supabase
              .from('diamond_reward_claims')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', userId)
              .eq('reward_type', 'video_favorite')
              .eq('claim_date', today);

          if ((count || 0) >= MAX_PER_DAY) {
              return res.status(200).json({ success: true, alreadyClaimed: true, message: `Favorite limit (${MAX_PER_DAY}/day) reached` });
          }

          // Cooldown (1 min)
          const { data: lastClaim } = await supabase
              .from('diamond_reward_claims')
              .select('claimed_at')
              .eq('user_id', userId)
              .eq('reward_type', 'video_favorite')
              .order('claimed_at', { ascending: false })
              .limit(1)
              .maybeSingle();

          if (lastClaim?.claimed_at && (now - new Date(lastClaim.claimed_at)) < COOLDOWN_MINUTES * 60 * 1000) {
              return res.status(200).json({ success: false, cooldown: true });
          }

          // Daily cap
          const { data: todayClaims } = await supabase
              .from('diamond_reward_claims')
              .select('diamonds_awarded')
              .eq('user_id', userId)
              .eq('claim_date', today)
              .neq('reward_type', 'referral');

          const todayTotal = (todayClaims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);
          if (todayTotal + FAV_REWARD > DAILY_CAP) {
              return res.status(200).json({ success: false, dailyCapReached: true });
          }

          // BUG #271 FIX: Check insert result before awarding diamonds
          const { error: claimErr } = await getSupabase().from('diamond_reward_claims').insert({
              user_id: userId,
              reward_type: 'video_favorite',
              diamonds_awarded: FAV_REWARD,
              claim_date: today,
              metadata: { video_id: videoId }
          });

          if (claimErr) {
              if (claimErr.code === '23505') {
                  return res.status(200).json({ success: true, alreadyClaimed: true });
              }
              throw claimErr;
          }

          const { error: rpcError } = await getSupabase().rpc('add_diamonds_to_balance', {
              p_user_id: userId,
              p_amount: FAV_REWARD,
              p_type: 'video_favorite',
              p_description: `Video favorite reward — ${FAV_REWARD}diamonds`,
              // Action-namespaced + actor-scoped to avoid colliding with
              // bare videoId reference_ids in video-watch.js.
              p_reference_id: `video_favorite_${userId}_${videoId}`
          });

          if (rpcError) {
              // Roll back the idempotency claim row so the user can retry.
              // Same bug shape as daily-login (commit 8d9ce5c9f1).
              const { error: rollbackErr } = await getSupabase()
                      .from('diamond_reward_claims')
                      .delete()
                      .eq('user_id', userId)
                      .eq('reward_type', 'video_favorite')
                      .eq('claim_date', today);
              if (rollbackErr) {
                  console.warn('[VideoFavorite] Rollback delete failed:', rollbackErr.message);
              }
              console.warn('[VideoFavorite] RPC error (claim rolled back so user can retry):', rpcError);
              return res.status(500).json({ success: false, error: 'Failed to credit diamonds — please retry' });
          }

          return res.status(200).json({ success: true, claimed: true, diamondsAwarded: FAV_REWARD });

      } catch (error) {
          console.warn('[VideoFavoriteReward] Error:', error.message || error);
          return res.status(500).json({ success: false, error: 'Failed to claim video favorite reward' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
