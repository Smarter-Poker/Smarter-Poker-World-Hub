/**
 * 📅 DAILY LOGIN REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 5-50diamonds for daily site login (scales with streak)
 * Uses diamond_reward_claims table for dedup
 *
 * ANTI-FARMING SAFEGUARDS:
 * - 1 reward per calendar day (CST) enforced by unique index
 * - Account must be 1+ hours old (prevents signup-spam)
 * - IP/session dedup via client-side sessionStorage
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const LOGIN_REWARD = {
    MIN: 5,
    MAX: 50,
    INCREMENT: 7,
};

function calculateLoginDiamonds(streakDays) {
    return Math.min(LOGIN_REWARD.MIN + Math.max(0, streakDays - 1) * LOGIN_REWARD.INCREMENT, LOGIN_REWARD.MAX);
}


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

      if (!supabaseUrl || !supabaseKey) {
          console.warn('[DailyLogin] Missing env vars:', { url: !!supabaseUrl, key: !!supabaseKey });
          return res.status(500).json({ success: false, error: 'Server configuration error' });
      }


      // ── Auth: JWT required (awards diamonds) ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      const userId = user.id; // From JWT, not body
      const supabase = getSupabase(); // Local reference for all downstream queries

      const now = new Date();
      const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

      try {
          // ── SAFEGUARD 1: Account age check (1 hour minimum) ──
          const { data: userProfile } = await supabase
              .from('profiles')
              .select('created_at')
              .eq('id', userId)
              .maybeSingle();

          if (userProfile?.created_at) {
              const accountAge = now - new Date(userProfile.created_at);
              if (accountAge < 60 * 60 * 1000) {
                  return res.status(200).json({
                      success: false,
                      message: 'Welcome! Daily login rewards start after your first hour.'
                  });
              }
          }

          // ── SAFEGUARD 2: Already claimed today (dedup) ──
          const { data: existing } = await supabase
              .from('diamond_reward_claims')
              .select('id, diamonds_awarded')
              .eq('user_id', userId)
              .eq('reward_type', 'daily_login')
              .eq('claim_date', today)
              .maybeSingle();

          if (existing) {
              return res.status(200).json({
                  success: true,
                  alreadyClaimed: true,
                  diamondsAwarded: existing.diamonds_awarded,
                  message: 'Daily login already claimed today'
              });
          }

          // ── Calculate streak ──
          const { data: streakRow } = await supabase
              .from('diamond_reward_claims')
              .select('claim_date')
              .eq('user_id', userId)
              .eq('reward_type', 'daily_login')
              .order('claim_date', { ascending: false })
              .limit(1)
              .maybeSingle();

          let streak = 1;
          if (streakRow) {
              const lastDate = new Date(streakRow.claim_date + 'T12:00:00');
              const todayDate = new Date(today + 'T12:00:00');
              const diffDays = Math.round((todayDate - lastDate) / (1000 * 60 * 60 * 24));
              if (diffDays === 1) {
                  const { count } = await supabase
                      .from('diamond_reward_claims')
                      .select('*', { count: 'exact', head: true })
                      .eq('user_id', userId)
                      .eq('reward_type', 'daily_login')
                      .gte('claim_date', new Date(todayDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
                          .limit(200);
                  streak = (count || 0) + 1;
              }
          }

          const diamondsAwarded = calculateLoginDiamonds(streak);

          // ── Record claim (unique index prevents double-claims) ──
          // Try with metadata column first, fall back without if column doesn't exist
          let insertError;
          const claimRow = {
              user_id: userId,
              reward_type: 'daily_login',
              diamonds_awarded: diamondsAwarded,
              claim_date: today,
          };

          // Attempt insert with metadata
          const result1 = await supabase
              .from('diamond_reward_claims')
              .insert({ ...claimRow, metadata: { streak, base: LOGIN_REWARD.MIN } });

          if (result1.error && result1.error.message?.includes('metadata')) {
              // metadata column doesn't exist — retry without it
              const result2 = await supabase
                  .from('diamond_reward_claims')
                  .insert(claimRow);
              insertError = result2.error;
          } else {
              insertError = result1.error;
          }

          if (insertError) {
              // Unique constraint violation = already claimed (race condition safe)
              if (insertError.code === '23505') {
                  return res.status(200).json({
                      success: true,
                      alreadyClaimed: true,
                      message: 'Daily login already claimed today'
                  });
              }
              console.warn('[DailyLogin] Insert error:', insertError);
              throw insertError;
          }

          // ── Award diamonds ──
          // Stable reference_id closes the retry-double-credit window: if the RPC
          // commits but response delivery fails (network drop / 502), the rollback
          // path lets the user retry — without a stable reference_id the retry
          // would have no dedup and double-credit.
          const { error: rpcError } = await getSupabase().rpc('add_diamonds_to_balance', {
              p_user_id: userId,
              p_amount: diamondsAwarded,
              p_type: 'daily_login',
              p_description: streak > 1
                  ? `Daily login reward (${streak}-day streak) — ${diamondsAwarded}diamonds`
                  : `Daily login reward — ${diamondsAwarded}diamonds`,
              p_reference_id: `daily_login_${userId}_${today}`
          });

          if (rpcError) {
              // Roll back the idempotency claim row so the user can retry.
              // Without this, the unique-constraint check at line 164 would
              // return "already claimed today" forever and the user would
              // never receive their diamonds. Production bug observed twice
              // in 7 days (2026-04-22 17:57, 2026-04-29 05:20).
              try {
                  const { error: err_diamond_reward_claims_hplig } = await supabase
                    .from('diamond_reward_claims')
                    .delete()
                      .eq('user_id', userId)
                      .eq('reward_type', 'daily_login')
                      .eq('claim_date', today);
                  if (err_diamond_reward_claims_hplig) console.warn('[Supabase] Silent mutation failed in diamond_reward_claims:', err_diamond_reward_claims_hplig.message);
              } catch (rollbackErr) {
                  console.warn('[DailyLogin] Rollback delete failed:', rollbackErr?.message || rollbackErr);
              }
              console.warn('[DailyLogin] RPC error (claim rolled back so user can retry):', rpcError);
              throw rpcError;
          }

          return res.status(200).json({
              success: true,
              claimed: true,
              diamondsAwarded,
              streak,
              message: `+${diamondsAwarded}diamonds Daily Login Reward!`
          });

      } catch (error) {
          console.warn('[DailyLogin] Error:', error.message || error);
          return res.status(500).json({ success: false, error: 'Failed to claim daily login reward' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
