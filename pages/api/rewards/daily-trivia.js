/**
 * 🧠 DAILY TRIVIA CHALLENGE REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 15diamonds for completing the daily trivia challenge (any score!)
 * Uses diamond_reward_claims table for dedup
 *
 * ANTI-FARMING SAFEGUARDS:
 * - 1 reward per calendar day (CST) enforced by unique index
 * - Account must be 24+ hours old
 * - Global 500diamonds daily cap check
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TRIVIA_REWARD = 15;
const DAILY_GLOBAL_CAP = 500;


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
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // ── Auth: JWT required (awards diamonds) ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Auth required' });
      const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
      const authUser = authData?.user;
      if (authErr || !authUser) return res.status(401).json({ error: 'Invalid token' });


      const userId = authUser.id; // Use JWT identity
      if (!userId) {
          return res.status(400).json({ error: 'userId required' });
      }

      const now = new Date();
      const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

      try {
          // ── SAFEGUARD 1: Account age check (24 hours minimum) ──
          const { data: userProfile } = await supabase
              .from('profiles')
              .select('created_at')
              .eq('id', userId)
              .maybeSingle();

          if (userProfile?.created_at) {
              const accountAge = now - new Date(userProfile.created_at);
              if (accountAge < 24 * 60 * 60 * 1000) {
                  return res.status(200).json({ claimed: false, reason: 'Account too new' });
              }
          }

          // ── SAFEGUARD 2: Already claimed today? ──
          const { data: existingClaim } = await supabase
              .from('diamond_reward_claims')
              .select('id')
              .eq('user_id', userId)
              .eq('reward_type', 'daily_trivia')
              .eq('claim_date', today)
              .maybeSingle();

          if (existingClaim) {
              return res.status(200).json({ claimed: false, reason: 'Already claimed today', diamondsAwarded: 0 });
          }

          // ── SAFEGUARD 3: Global daily cap ──
          const { data: todayClaims } = await supabase
              .from('diamond_reward_claims')
              .select('diamonds_awarded')
              .eq('user_id', userId)
              .eq('claim_date', today);

          const todayTotal = (todayClaims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);
          if (todayTotal >= DAILY_GLOBAL_CAP) {
              return res.status(200).json({ claimed: false, reason: 'Daily cap reached', diamondsAwarded: 0 });
          }

          const diamonds = Math.min(TRIVIA_REWARD, DAILY_GLOBAL_CAP - todayTotal);

          // ── INSERT CLAIM ──
          const { error: claimError } = await supabase
              .from('diamond_reward_claims')
              .insert({
                  user_id: userId,
                  reward_type: 'daily_trivia',
                  diamonds_awarded: diamonds,
                  claim_date: today,
                  metadata: { source: 'daily_trivia_challenge' }
              });

          if (claimError) {
              // Unique constraint = already claimed
              if (claimError.code === '23505') {
                  return res.status(200).json({ claimed: false, reason: 'Already claimed', diamondsAwarded: 0 });
              }
              throw claimError;
          }

          // ── CREDIT DIAMONDS (atomic: balance + transaction in one RPC) ──
          // Stable reference_id closes the retry-double-credit window: if the RPC
          // commits but response delivery fails, the rollback path lets the user
          // retry — without a stable reference_id the retry would have no dedup.
          const { error: rpcError } = await getSupabase().rpc('add_diamonds_to_balance', {
              p_user_id: userId,
              p_amount: diamonds,
              p_type: 'daily_trivia',
              p_description: `Daily Trivia Challenge reward — ${diamonds}diamonds`,
              p_reference_id: `daily_trivia_${userId}_${today}`
          });

          if (rpcError) {
              // Roll back the idempotency claim row so the user can retry.
              // Without this, the unique-constraint check at line 117 returns
              // "already claimed today" forever and the user never receives
              // their diamonds. Same bug shape as daily-login (commit 8d9ce5c9f1).
              try {
                  const { error: err_diamond_reward_claims_cejl8 } = await supabase
                    .from('diamond_reward_claims')
                    .delete()
                      .eq('user_id', userId)
                      .eq('reward_type', 'daily_trivia')
                      .eq('claim_date', today);
                  if (err_diamond_reward_claims_cejl8) console.warn('[Supabase] Silent mutation failed in diamond_reward_claims:', err_diamond_reward_claims_cejl8.message);
              } catch (rollbackErr) {
                  console.warn('[DailyTrivia] Rollback delete failed:', rollbackErr?.message || rollbackErr);
              }
              console.warn('[DailyTrivia] RPC error (claim rolled back so user can retry):', rpcError);
              return res.status(500).json({ error: 'Failed to credit diamonds — please retry' });
          }

          return res.status(200).json({
              claimed: true,
              diamondsAwarded: diamonds,
              reward: 'daily_trivia'
          });

      } catch (error) {
          console.warn('Daily trivia reward error:', error);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
