/**
 * 🏆 HENDONMOB LINK REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 25diamonds ONE TIME for linking HendonMob profile
 *
 * ANTI-FARMING SAFEGUARDS:
 * - One-time claim only (lifetime)
 * - HendonMob URL must be populated in user profile
 * - Server-side verification of actual profile data
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const HENDONMOB_REWARD = 25;


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
              .eq('reward_type', 'hendonmob_link')
              .maybeSingle();

          if (existing) {
              return res.status(200).json({ success: true, alreadyClaimed: true, message: 'HendonMob link reward already claimed' });
          }

          // SAFEGUARD 2: Verify HendonMob URL actually exists in profile
          // Check multiple possible column names for HendonMob
          const { data: profile } = await supabase
              .from('profiles')
              .select('hendonmob_url, hendon_mob_url, hendonmob_id, social_links')
              .eq('id', userId)
              .maybeSingle();

          if (!profile) {
              return res.status(200).json({ success: false, message: 'Profile not found' });
          }

          // Check for HendonMob in any recognized field
          const hendonmobValue = profile.hendonmob_url
              || profile.hendon_mob_url
              || profile.hendonmob_id
              || (profile.social_links && (profile.social_links.hendonmob || profile.social_links.hendon_mob));

          if (!hendonmobValue || String(hendonmobValue).trim().length < 5) {
              return res.status(200).json({
                  success: false,
                  message: `Link your HendonMob profile to earn ${HENDONMOB_REWARD}diamonds!`
              });
          }

          // Record & award
          const now = new Date();
          const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
          const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

          // BUG #265 FIX: Check insert result before awarding diamonds
          const { error: claimInsertErr } = await getSupabase().from('diamond_reward_claims').insert({
              user_id: userId,
              reward_type: 'hendonmob_link',
              diamonds_awarded: HENDONMOB_REWARD,
              claim_date: today,
              metadata: { hendonmob: String(hendonmobValue).substring(0, 100) }
          });

          if (claimInsertErr) {
              if (claimInsertErr.code === '23505') {
                  return res.status(200).json({ success: true, alreadyClaimed: true, message: 'HendonMob link reward already claimed' });
              }
              throw claimInsertErr;
          }

          // Stable reference_id closes the retry-double-credit window. hendonmob_link
          // is a one-time-per-user reward so user-keyed dedup is enough.
          const { error: rpcError } = await getSupabase().rpc('add_diamonds_to_balance', {
              p_user_id: userId,
              p_amount: HENDONMOB_REWARD,
              p_type: 'hendonmob_link',
              p_description: `HendonMob link reward — ${HENDONMOB_REWARD}diamonds`,
              p_reference_id: `hendonmob_link_${userId}`
          });

          if (rpcError) {
              // Roll back the idempotency claim row so the user can retry.
              // Same bug shape as daily-login (commit 8d9ce5c9f1).
              const { error: rollbackErr } = await getSupabase()
                      .from('diamond_reward_claims')
                      .delete()
                      .eq('user_id', userId)
                      .eq('reward_type', 'hendonmob_link')
                      .eq('claim_date', today);
              if (rollbackErr) {
                  console.warn('[HendonMobLink] Rollback delete failed:', rollbackErr.message);
              }
              console.warn('[HendonMobLink] RPC error (claim rolled back so user can retry):', rpcError);
              return res.status(500).json({ success: false, error: 'Failed to credit diamonds — please retry' });
          }

          return res.status(200).json({
              success: true,
              claimed: true,
              diamondsAwarded: HENDONMOB_REWARD,
              message: `+${HENDONMOB_REWARD}diamonds HendonMob Linked!`
          });

      } catch (error) {
          console.warn('[HendonMobReward] Error:', error.message || error);
          return res.status(500).json({ success: false, error: 'Failed to claim HendonMob link reward' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
