/**
 * 👤 PROFILE COMPLETION REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 50diamonds ONE TIME for completing profile (avatar + bio + username)
 *
 * ANTI-FARMING SAFEGUARDS:
 * - One-time claim only (lifetime)
 * - All 3 fields must be populated in profiles table
 * - Server-side verification of actual profile data
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const COMPLETION_REWARD = 50;


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
              .eq('reward_type', 'profile_complete')
              .maybeSingle();

          if (existing) {
              return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Profile completion reward already claimed' });
          }

          // SAFEGUARD 2: Verify profile is actually complete
          const { data: profile } = await supabase
              .from('profiles')
              .select('username, avatar_url, bio')
              .eq('id', userId)
              .maybeSingle();

          if (!profile) {
              return res.status(200).json({ success: false, message: 'Profile not found' });
          }

          const hasUsername = profile.username && profile.username.trim().length >= 3;
          const hasAvatar = profile.avatar_url && profile.avatar_url.trim().length > 0;
          const hasBio = profile.bio && profile.bio.trim().length >= 10;

          if (!hasUsername || !hasAvatar || !hasBio) {
              const missing = [];
              if (!hasUsername) missing.push('username (3+ chars)');
              if (!hasAvatar) missing.push('profile picture');
              if (!hasBio) missing.push('bio (10+ chars)');
              return res.status(200).json({
                  success: false,
                  message: `Complete your profile to earn ${COMPLETION_REWARD}diamonds! Missing: ${missing.join(', ')}`
              });
          }

          // Record & award
          const now = new Date();
          const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
          const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

          // BUG #265 FIX: Check insert result before awarding diamonds.
          // Without this, concurrent requests both pass the 'existing' check,
          // both insert (if no unique constraint), and both award diamonds.
          const { error: claimInsertErr } = await getSupabase().from('diamond_reward_claims').insert({
              user_id: userId,
              reward_type: 'profile_complete',
              diamonds_awarded: COMPLETION_REWARD,
              claim_date: today,
              metadata: { username: profile.username, has_avatar: true, bio_length: profile.bio.trim().length }
          });

          if (claimInsertErr) {
              if (claimInsertErr.code === '23505') {
                  return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Profile completion reward already claimed' });
              }
              console.warn('[ProfileComplete] Insert error:', claimInsertErr);
              throw claimInsertErr;
          }

          // Stable reference_id closes the retry-double-credit window. profile_complete
          // is a one-time-per-user reward so user-keyed dedup is enough.
          const { error: rpcError } = await getSupabase().rpc('add_diamonds_to_balance', {
              p_user_id: userId,
              p_amount: COMPLETION_REWARD,
              p_type: 'profile_complete',
              p_description: `Profile completion reward — ${COMPLETION_REWARD}diamonds`,
              p_reference_id: `profile_complete_${userId}`
          });

          if (rpcError) {
              // Roll back the idempotency claim row so the user can retry.
              // Same bug shape as daily-login (commit 8d9ce5c9f1).
              const { error: rollbackErr } = await getSupabase()
                      .from('diamond_reward_claims')
                      .delete()
                      .eq('user_id', userId)
                      .eq('reward_type', 'profile_complete')
                      .eq('claim_date', today);
              if (rollbackErr) {
                  console.warn('[ProfileComplete] Rollback delete failed:', rollbackErr.message);
              }
              console.warn('[ProfileComplete] RPC error (claim rolled back so user can retry):', rpcError);
              return res.status(500).json({ success: false, error: 'Failed to credit diamonds — please retry' });
          }

          return res.status(200).json({
              success: true,
              claimed: true,
              diamondsAwarded: COMPLETION_REWARD,
              message: `+${COMPLETION_REWARD}diamonds Profile Complete!`
          });

      } catch (error) {
          console.warn('[ProfileCompleteReward] Error:', error.message || error);
          return res.status(500).json({ success: false, error: 'Failed to claim profile completion reward' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
