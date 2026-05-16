/**
 * 📸 PROFILE PIC UPDATE REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 10diamonds ONE TIME for uploading/updating a profile picture
 *
 * ANTI-FARMING SAFEGUARDS:
 * - One-time claim only (lifetime)
 * - avatar_url must be populated in profiles table
 * - Server-side verification
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PROFILE_PIC_REWARD = 10;


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

      const userId = authUser.id; // Use JWT identity

      if (!userId) {
          return res.status(400).json({ success: false, error: 'userId required' });
      }

      try {
          // SAFEGUARD 1: Already claimed (lifetime, one-time reward)
          const { data: existing } = await supabase
              .from('diamond_reward_claims')
              .select('id')
              .eq('user_id', userId)
              .eq('reward_type', 'profile_pic')
              .maybeSingle();

          if (existing) {
              return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Profile pic reward already claimed' });
          }

          // SAFEGUARD 2: Verify avatar actually exists in profile
          const { data: profile } = await supabase
              .from('profiles')
              .select('avatar_url')
              .eq('id', userId)
              .maybeSingle();

          if (!profile || !profile.avatar_url || profile.avatar_url.trim().length === 0) {
              return res.status(200).json({
                  success: false,
                  message: `Upload a profile picture to earn ${PROFILE_PIC_REWARD}diamonds!`
              });
          }

          // Record & award
          const now = new Date();
          const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
          const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

          // BUG #265 FIX: Check insert result before awarding diamonds
          const { error: claimInsertErr } = await getSupabase().from('diamond_reward_claims').insert({
              user_id: userId,
              reward_type: 'profile_pic',
              diamonds_awarded: PROFILE_PIC_REWARD,
              claim_date: today,
              metadata: { avatar_url: profile.avatar_url.substring(0, 100) }
          });

          if (claimInsertErr) {
              if (claimInsertErr.code === '23505') {
                  return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Profile picture reward already claimed' });
              }
              throw claimInsertErr;
          }

          // Stable reference_id closes the retry-double-credit window: profile_pic
          // is a one-time-per-user reward, so user-keyed dedup is enough.
          const { error: rpcError } = await getSupabase().rpc('add_diamonds_to_balance', {
              p_user_id: userId,
              p_amount: PROFILE_PIC_REWARD,
              p_type: 'profile_pic',
              p_description: `Profile picture reward — ${PROFILE_PIC_REWARD}diamonds`,
              p_reference_id: `profile_pic_${userId}`
          });

          if (rpcError) {
              // Roll back the idempotency claim row so the user can retry.
              // Same bug shape as daily-login (commit 8d9ce5c9f1).
              const { error: rollbackErr } = await getSupabase()
                      .from('diamond_reward_claims')
                      .delete()
                      .eq('user_id', userId)
                      .eq('reward_type', 'profile_pic')
                      .eq('claim_date', today);
              if (rollbackErr) {
                  console.warn('[ProfilePic] Rollback delete failed:', rollbackErr.message);
              }
              console.warn('[ProfilePic] RPC error (claim rolled back so user can retry):', rpcError);
              return res.status(500).json({ success: false, error: 'Failed to credit diamonds — please retry' });
          }

          return res.status(200).json({
              success: true,
              claimed: true,
              diamondsAwarded: PROFILE_PIC_REWARD,
              message: `+${PROFILE_PIC_REWARD}diamonds Profile Pic Uploaded!`
          });

      } catch (error) {
          console.warn('[ProfilePicReward] Error:', error.message || error);
          return res.status(500).json({ success: false, error: 'Failed to claim profile pic reward' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
