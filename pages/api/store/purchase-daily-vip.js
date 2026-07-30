import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Purchase Daily VIP Pass
 * POST /api/store/purchase-daily-vip
 * Deducts 150 diamonds and grants 24 hours of VIP access
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { requireEmailVerified } = require('../../../src/lib/emailVerifiedGate');
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) console.warn('[purchase-daily-vip] SUPABASE_SERVICE_ROLE_KEY missing — falling back to anon key; writes may be silently blocked by RLS');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!applyRateLimit(req, res, LIMITS.write)) return;

      try {
          // Authenticate via token
          const authHeader = req.headers.authorization;
          if (!authHeader?.startsWith('Bearer ')) {
              return res.status(401).json({ success: false, error: 'Authorization required' });
          }

          const token = authHeader.replace('Bearer ', '');
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;

          if (authError || !user) {
              return res.status(401).json({ success: false, error: 'Invalid session' });
          }

          // [Phase 6.1.12] Email must be verified before chip/diamond purchases
          const emailGate = requireEmailVerified(user);
          if (!emailGate.ok) return res.status(emailGate.status).json(emailGate.body);

          // Configuration
          const COST = 150;
          const HOURS = 24;

          // Fetch user profile
          const { data: profile, error: profileError } = await getSupabase()
              .from('profiles')
              .select('diamonds, is_vip, vip_tier, vip_expires_at')
              .eq('id', user.id)
              .maybeSingle();

          if (profileError || !profile) {
              return res.status(500).json({ success: false, error: 'Failed to access profile' });
          }

          // Validation
          const currentBalance = profile.diamonds ?? 0;
          if (currentBalance < COST) {
              return res.status(400).json({
                  success: false,
                  error: 'Insufficient diamonds',
                  required: COST,
                  current: currentBalance
              });
          }

          // Deduct diamonds atomically using the RPC
          const { data: deductResult, error: deductError } = await getSupabase().rpc('add_diamonds_to_balance', {
              p_user_id: user.id,
              p_amount: -COST,
              p_type: 'vip_daily',
              p_description: `1-Day VIP Access (${COST}diamonds)`,
              p_reference_id: null
          });

          if (deductError) {
              console.warn('[Purchase Daily VIP] Deduction failed:', deductError);
              return res.status(500).json({ success: false, error: 'Failed to process payment' });
          }
          // The RPC reports business failures (e.g. insufficient balance under
          // concurrency) via its data payload, not a thrown error — the pre-read
          // balance check above is not atomic and can be stale.
          if (deductResult && deductResult.success === false) {
              return res.status(400).json({
                  success: false,
                  error: deductResult.error || 'Insufficient diamonds',
                  required: COST,
                  current: currentBalance
              });
          }

          // Calculate new expiration
          let newExpiresAt = new Date();
          if (profile.is_vip && profile.vip_expires_at) {
              const currentExpiraton = new Date(profile.vip_expires_at);
              if (currentExpiraton > newExpiresAt) {
                  // If they already have an active VIP pass, extend it
                  newExpiresAt = currentExpiraton;
              }
          }
          newExpiresAt.setHours(newExpiresAt.getHours() + HOURS);

          // Update profile — do NOT downgrade an active subscription tier
          // (e.g. monthly/annual) to 'daily'; keep the higher tier and extend expiry.
          const keepExistingTier = profile.is_vip && profile.vip_tier && profile.vip_tier !== 'daily';
          const { error: updateError } = await getSupabase()
              .from('profiles')
              .update({
                  is_vip: true,
                  vip_tier: keepExistingTier ? profile.vip_tier : 'daily',
                  vip_expires_at: newExpiresAt.toISOString()
              })
              .eq('id', user.id);

          if (updateError) {
              console.warn('[Purchase Daily VIP] Profile update failed:', updateError);
              // Compensate: refund the deducted diamonds instead of relying on a support ticket.
              const { error: refundError } = await getSupabase().rpc('add_diamonds_to_balance', {
                  p_user_id: user.id,
                  p_amount: COST,
                  p_type: 'refund',
                  p_description: 'Refund — 1-Day VIP activation failed',
                  p_reference_id: null
              });
              if (refundError) {
                  console.warn('[Purchase Daily VIP] Refund after failed activation ALSO failed:', refundError);
                  return res.status(500).json({ success: false, error: 'Payment succeeded, but VIP activation failed. Contact support.' });
              }
              return res.status(500).json({ success: false, error: 'VIP activation failed — your diamonds have been refunded. Please try again.' });
          }

          return res.status(200).json({
              success: true,
              isVip: true,
              expiresAt: newExpiresAt.toISOString(),
              newBalance: typeof deductResult?.balance === 'number' ? deductResult.balance : currentBalance - COST
          });

      } catch (err) {
          console.warn('[Purchase Daily VIP] Fatal Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
