import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Promo Code Redemption API
 * POST /api/promo/redeem
 * Body: { code: string }
 * Auth: Bearer token required
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

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

      // ── AUTH CHECK ──
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
      }

      const token = authHeader.replace('Bearer ', '');
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;

      if (authErr || !user) {
          return res.status(401).json({ success: false, error: 'Invalid token' });
      }

      // ── VALIDATE INPUT ──
      const { code } = req.body;
      if (!code || typeof code !== 'string') {
          return res.status(400).json({ success: false, error: 'Promo code is required' });
      }

      const normalizedCode = code.trim().toUpperCase();

      try {
          // ── LOOK UP CODE ──
          const { data: promo, error: lookupError } = await getSupabase()
              .from('promo_codes')
              .select('*')
              .eq('code', normalizedCode)
              .maybeSingle();

          if (lookupError || !promo) {
              return res.status(404).json({ success: false, error: 'Invalid promo code' });
          }

          // ── VALIDATE CODE STATUS ──
          if (!promo.is_active) {
              return res.status(400).json({ success: false, error: 'This promo code is no longer active' });
          }

          if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
              return res.status(400).json({ success: false, error: 'This promo code has expired' });
          }

          if (promo.max_uses !== null && promo.times_used >= promo.max_uses) {
              return res.status(400).json({ success: false, error: 'This promo code has reached its maximum redemptions' });
          }

          // ── CHECK DUPLICATE REDEMPTION ──
          const { data: existing } = await getSupabase()
              .from('promo_code_redemptions')
              .select('id')
              .eq('promo_code_id', promo.id)
              .eq('user_id', user.id)
              .maybeSingle();

          if (existing) {
              return res.status(400).json({ success: false, error: 'You have already redeemed this code' });
          }

          // BUG #264 FIX: Atomic redemption insert to prevent TOCTOU double-redeem.
          // Insert FIRST with unique constraint, then apply reward. If insert fails,
          // we know another request already redeemed.
          const { error: redeemInsertErr } = await getSupabase()
              .from('promo_code_redemptions')
              .insert({
                  promo_code_id: promo.id,
                  user_id: user.id,
              });

          if (redeemInsertErr) {
              if (redeemInsertErr.code === '23505') {
                  return res.status(409).json({ success: false, error: 'You have already redeemed this code' });
              }
              throw redeemInsertErr;
          }

          // ── APPLY REWARD ──
          const reward = {
              type: promo.reward_type,
              value: promo.reward_value,
              code: promo.code,
              description: promo.description
          };

          // Helper: roll back the redemption row so the user can retry.
          // Without this, the unique constraint on (promo_code_id, user_id)
          // would block retries forever after a transient failure.
          const rollbackRedemption = async (label) => {
              try {
                  const { error: err_promo_code_redemptions_h7gtb } = await getSupabase()
                    .from('promo_code_redemptions')
                    .delete()
                      .eq('promo_code_id', promo.id)
                      .eq('user_id', user.id);
                  if (err_promo_code_redemptions_h7gtb) console.warn('[Supabase] Silent mutation failed in promo_code_redemptions:', err_promo_code_redemptions_h7gtb.message);
              } catch (rbErr) {
                  console.warn(`[Promo] Rollback delete failed (${label}):`, rbErr?.message || rbErr);
              }
          };

          if (promo.reward_type === 'diamonds') {
              // BUG #264 FIX: Use atomic RPC instead of read-modify-write
              const { error: diamondErr } = await getSupabase().rpc('add_diamonds_to_balance', {
                  p_user_id: user.id,
                  p_amount: promo.reward_value,
                  p_type: 'promo_code',
                  p_description: `Promo code: ${promo.code} — ${promo.description || 'Bonus'}`,
                  p_reference_id: `promo_${promo.id}_${user.id}`,
              });

              if (diamondErr) {
                  // The previous "fallback" was a retry of the SAME RPC, which is
                  // essentially never useful — if the first call failed for a real
                  // reason (RLS, deadlock), the second will too. Roll back the
                  // redemption row so the user can retry instead of being locked
                  // out by the unique constraint.
                  await rollbackRedemption('diamond credit failed');
                  console.warn('[Promo] Diamond RPC failed (rolled back so user can retry):', diamondErr);
                  return res.status(500).json({ success: false, error: 'Failed to credit diamonds — please retry' });
              }

              reward.message = `${promo.reward_value} diamonds added to your account!`;
          } else if (promo.reward_type === 'vip_days') {
              // Extend or create VIP subscription
              const { data: profile } = await getSupabase()
                  .from('profiles')
                  .select('vip_expires_at')
                  .eq('id', user.id)
                  .maybeSingle();

              const now = new Date();
              const currentExpiry = profile?.vip_expires_at ? new Date(profile.vip_expires_at) : now;
              const startDate = currentExpiry > now ? currentExpiry : now;
              const newExpiry = new Date(startDate.getTime() + promo.reward_value * 24 * 60 * 60 * 1000);

              const { error: vipErr } = await getSupabase()
                  .from('profiles')
                  .update({
                      is_vip: true,
                      vip_expires_at: newExpiry.toISOString()
                  })
                  .eq('id', user.id);

              if (vipErr) {
                  await rollbackRedemption('vip_days update failed');
                  console.warn('[Promo] vip_days update failed (rolled back so user can retry):', vipErr);
                  return res.status(500).json({ success: false, error: 'Failed to activate VIP — please retry' });
              }

              reward.message = `${promo.reward_value} days of VIP access activated!`;
          } else if (promo.reward_type === 'free_trial') {
              // Grant free trial days
              const now = new Date();
              const trialEnd = new Date(now.getTime() + promo.reward_value * 24 * 60 * 60 * 1000);

              const { error: trialErr } = await getSupabase()
                  .from('profiles')
                  .update({
                      is_vip: true,
                      vip_expires_at: trialEnd.toISOString()
                  })
                  .eq('id', user.id);

              if (trialErr) {
                  await rollbackRedemption('free_trial update failed');
                  console.warn('[Promo] free_trial update failed (rolled back so user can retry):', trialErr);
                  return res.status(500).json({ success: false, error: 'Failed to activate trial — please retry' });
              }

              reward.message = `${promo.reward_value}-day free trial activated!`;
          } else if (promo.reward_type === 'commander_discount') {
              // Stateless — discount is consumed at Commander billing time
              reward.message = `${promo.reward_value}% Commander discount applied!`;
          }

          // ── Redemption already recorded above (atomic insert) ──
          // Update with reward details
          const { error: err_promo_code_redemptions_ufo99 } = await getSupabase()
            .from('promo_code_redemptions')
            .update({ reward_applied: reward })
              .eq('promo_code_id', promo.id)
              .eq('user_id', user.id);
          if (err_promo_code_redemptions_ufo99) console.warn('[Supabase] Silent mutation failed in promo_code_redemptions:', err_promo_code_redemptions_ufo99.message);

          // ── INCREMENT USAGE COUNT ──
          const { error: err_promo_codes_en9fo } = await getSupabase()
            .from('promo_codes')
            .update({ times_used: promo.times_used + 1 })
              .eq('id', promo.id);
          if (err_promo_codes_en9fo) console.warn('[Supabase] Silent mutation failed in promo_codes:', err_promo_codes_en9fo.message);

          return res.status(200).json({
              success: true,
              reward
          });

      } catch (err) {
          console.warn('[Promo] Redemption error:', err);
          return res.status(500).json({ success: false, error: 'Failed to redeem promo code' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
