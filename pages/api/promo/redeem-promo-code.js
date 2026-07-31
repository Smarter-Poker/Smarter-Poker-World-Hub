import { getServerUserWithFallback } from '../../src/lib/serverAuth';
// Redeem a promo code after successful signup
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

      if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

      // Require JWT auth — promo codes credit real currency
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      /* removed duplicate authUser */
      if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      const { code } = req.body;
      const userId = authUser.id; // Always use verified user ID
      if (!code) {
          return res.status(400).json({ success: false, error: 'Code is required' });
      }

      try {
          // 1. Fetch the promo code
          const { data: promo, error: promoError } = await getSupabase()
              .from('promo_codes')
              .select('*')
              .eq('code', code.toUpperCase().trim())
              .maybeSingle();

          if (promoError || !promo) {
              return res.status(404).json({ success: false, error: 'Invalid promo code' });
          }

          // Validate again
          if (!promo.is_active) return res.status(400).json({ success: false, error: 'Code is no longer active' });
          if (promo.expires_at && new Date(promo.expires_at) < new Date()) return res.status(400).json({ success: false, error: 'Code has expired' });
          if (promo.max_uses !== null && promo.times_used >= promo.max_uses) return res.status(400).json({ success: false, error: 'Code usage limit reached' });

          // 2. Check if user already redeemed this code
          const { data: existing } = await getSupabase()
              .from('promo_code_redemptions')
              .select('id')
              .eq('promo_code_id', promo.id)
              .eq('user_id', userId)
              .maybeSingle();

          if (existing) {
              return res.status(400).json({ success: false, error: 'You have already used this promo code' });
          }

          // 2b. Phone verification gate for diamond promo codes
          if (['signup_bonus', 'diamonds'].includes(promo.reward_type) && promo.reward_value >= 500) {
              const { data: userProfile } = await getSupabase()
                  .from('profiles')
                  .select('phone_verified')
                  .eq('id', userId)
                  .maybeSingle();

              if (!userProfile?.phone_verified) {
                  return res.status(403).json({
                      success: false,
                      error: 'Phone verification required to redeem diamond promo codes. Please verify your phone number in Settings.',
                      requiresPhoneVerification: true,
                  });
              }
          }

          // BUG #261 FIX: Atomic redemption insert to prevent TOCTOU double-redeem.
          // Two concurrent requests could both pass the check above and both redeem.
          // Use insert with unique constraint — second request will fail with conflict.
          const { data: redemption, error: redemptionErr } = await getSupabase()
              .from('promo_code_redemptions')
              .insert({
                  promo_code_id: promo.id,
                  user_id: userId,
              })
              .select('id')
              .maybeSingle();

          if (redemptionErr) {
              // Unique constraint violation = already redeemed (concurrent request)
              if (redemptionErr.code === '23505') {
                  return res.status(409).json({ success: false, error: 'You have already used this promo code' });
              }
              throw redemptionErr;
          }

          // 3. Apply the bonus based on reward_type
          let bonusApplied = '';

          // Helper: roll back the redemption row so the user can retry. Without
          // this, the unique constraint on (promo_code_id, user_id) blocks
          // retries forever after a transient failure.
          const rollbackRedemption = async (label) => {
              try {
                  const { error: err_promo_code_redemptions_nvq6g } = await getSupabase()
                    .from('promo_code_redemptions')
                    .delete()
                      .eq('promo_code_id', promo.id)
                      .eq('user_id', userId);
                  if (err_promo_code_redemptions_nvq6g) console.warn('[Supabase] Silent mutation failed in promo_code_redemptions:', err_promo_code_redemptions_nvq6g.message);
              } catch (rbErr) {
                  console.warn(`[redeem-promo] Rollback delete failed (${label}):`, rbErr?.message || rbErr);
              }
          };

          switch (promo.reward_type) {
              case 'signup_bonus':
              case 'diamonds': {
                  // BUG #262 FIX: Use add_diamonds_to_balance RPC for atomic balance update.
                  const { error: diamondErr } = await getSupabase().rpc('add_diamonds_to_balance', {
                      p_user_id: userId,
                      p_amount: promo.reward_value,
                      p_type: 'promo_code',
                      p_description: `Promo code: ${promo.code} — ${promo.description || 'Bonus diamonds'}`,
                      p_reference_id: `promo_${promo.id}_${userId}`,
                  });

                  if (diamondErr) {
                      // The previous "fallback" was a retry of the SAME RPC, which
                      // is essentially never useful. Roll back the redemption so the
                      // user can retry instead of being permanently locked out.
                      await rollbackRedemption('diamond credit failed');
                      console.warn('[redeem-promo] Diamond credit RPC failed (rolled back so user can retry):', diamondErr);
                      return res.status(500).json({ success: false, error: 'Failed to credit diamonds — please retry' });
                  }

                  bonusApplied = `${promo.reward_value} diamonds added`;
                  break;
              }

              case 'vip_trial':
              case 'vip_days': {
                  // Grant VIP for X days (reward_value = number of days)
                  const trialEnd = new Date();
                  trialEnd.setDate(trialEnd.getDate() + promo.reward_value);

                  const { error: vipErr } = await getSupabase()
                      .from('profiles')
                      .update({
                          is_vip: true,
                          vip_expires_at: trialEnd.toISOString(),
                      })
                      .eq('id', userId);

                  if (vipErr) {
                      await rollbackRedemption('vip_trial/vip_days update failed');
                      console.warn('[redeem-promo] vip_days update failed (rolled back so user can retry):', vipErr);
                      return res.status(500).json({ success: false, error: 'Failed to activate VIP — please retry' });
                  }

                  bonusApplied = `${promo.reward_value}-day VIP trial activated`;
                  break;
              }

              case 'lifetime_commander_club_vip': {
                  // Grant lifetime VIP status
                  const { error: lifeErr } = await getSupabase()
                      .from('profiles')
                      .update({
                          is_vip: true,
                          vip_expires_at: null, // null = no expiration = lifetime
                      })
                      .eq('id', userId);

                  if (lifeErr) {
                      await rollbackRedemption('lifetime_commander_club_vip update failed');
                      console.warn('[redeem-promo] lifetime VIP update failed (rolled back so user can retry):', lifeErr);
                      return res.status(500).json({ success: false, error: 'Failed to activate lifetime VIP — please retry' });
                  }

                  bonusApplied = 'Lifetime VIP Card + Club Commander Club Level activated';
                  break;
              }

              case 'lifetime_commander_charity': {
                  bonusApplied = 'Lifetime Club Commander Charity Games pass activated';
                  break;
              }

              default:
                  bonusApplied = `Promo code ${promo.code} applied`;
          }

          // 4. Redemption already recorded above (atomic insert)

          // 5. Increment usage count (use atomic increment to prevent race)
          const { error: err_promo_codes_rvlzv } = await getSupabase()
            .from('promo_codes')
            .update({ times_used: promo.times_used + 1 })
              .eq('id', promo.id);
          if (err_promo_codes_rvlzv) console.warn('[Supabase] Silent mutation failed in promo_codes:', err_promo_codes_rvlzv.message);

          return res.status(200).json({
              success: true,
              message: bonusApplied,
              type: promo.reward_type,
              value: promo.reward_value,
          });
      } catch (err) {
          console.warn('Redeem promo code error:', err);
          return res.status(500).json({ success: false, error: 'Server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
