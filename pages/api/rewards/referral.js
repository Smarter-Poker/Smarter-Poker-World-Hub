/**
 * 👥 REFERRAL REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 500diamonds for verified referrals — BYPASSES daily cap
 * One-time per referred user pair
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const REFERRAL_REWARD = 500;


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
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // ── Auth: JWT required (awards diamonds) ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: { user: authUser }, error: authErr } = await getSupabase().auth.getUser(token);
      if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      const { referrerId, referredUserId } = req.body;
      // Allow either the referrer or the referred user to trigger the reward
      // During signup, the authenticated user is the referred user (new signup)
      // The referrer will be credited regardless of who triggers the call
      if (referrerId !== authUser.id && referredUserId !== authUser.id) {
          return res.status(403).json({ success: false, error: 'Cannot claim referral rewards for unrelated accounts' });
      }

      if (!referrerId || !referredUserId) {
          return res.status(400).json({ success: false, error: 'referrerId and referredUserId required' });
      }

      if (referrerId === referredUserId) {
          return res.status(400).json({ success: false, error: 'Cannot refer yourself' });
      }

      try {
          // Check if already awarded for this pair
          const { data: existing } = await supabase
              .from('diamond_reward_claims')
              .select('id')
              .eq('user_id', referrerId)
              .eq('reward_type', 'referral')
              .contains('metadata', { referred_user_id: referredUserId })
              .maybeSingle();

          if (existing) {
              return res.status(200).json({
                  success: true,
                  alreadyClaimed: true,
                  message: 'Referral reward already claimed for this user'
              });
          }

          const now = new Date();
          const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
          const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

          // BUG #265 FIX: Check insert result before awarding diamonds
          const { error: claimInsertErr } = await getSupabase().from('diamond_reward_claims').insert({
              user_id: referrerId,
              reward_type: 'referral',
              diamonds_awarded: REFERRAL_REWARD,
              claim_date: today,
              metadata: { referred_user_id: referredUserId, bypasses_cap: true }
          });

          if (claimInsertErr) {
              if (claimInsertErr.code === '23505') {
                  return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Referral reward already claimed for this user' });
              }
              throw claimInsertErr;
          }

          // Award diamonds
          await getSupabase().rpc('add_diamonds_to_balance', {
              p_user_id: referrerId,
              p_amount: REFERRAL_REWARD,
              p_type: 'referral',
              p_description: `Referral reward — ${REFERRAL_REWARD}diamonds (bypasses daily cap)`,
              p_reference_id: referredUserId
          });

          return res.status(200).json({
              success: true,
              claimed: true,
              diamondsAwarded: REFERRAL_REWARD,
              message: `+${REFERRAL_REWARD}diamonds Referral Reward!`
          });

      } catch (error) {
          console.error('[ReferralReward] Error:', error.message || error);
          return res.status(500).json({ success: false, error: 'Failed to claim referral reward' });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
