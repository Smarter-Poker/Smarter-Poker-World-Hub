/**
 * Cancel VIP Subscription
 * POST /api/store/cancel-vip
 * 
 * Cancels the user's VIP subscription at end of billing period via Stripe.
 * Also stores the cancellation reason for analytics.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import Stripe from 'stripe';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) console.warn('[cancel-vip] SUPABASE_SERVICE_ROLE_KEY missing — falling back to anon key; writes may be silently blocked by RLS');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16',
        timeout: 15000,
        maxNetworkRetries: 2,
        telemetry: false
    })
    : null;

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // ── Auth: verify JWT identity ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      const userId = user.id; // From JWT, NOT body
      const { reason, reasonText } = req.body || {};

      try {
          // 1. Get the user's active VIP subscription
          const { data: sub, error: subErr } = await getSupabase()
              .from('vip_subscriptions')
              .select('stripe_subscription_id, status')
              .eq('user_id', userId)
              .in('status', ['active', 'trialing'])
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

          if (subErr || !sub) {
              return res.status(404).json({ success: false, error: 'No active VIP subscription found' });
          }

          // 2. Cancel via Stripe (at end of billing period)
          if (sub.stripe_subscription_id) {
              if (!stripe) {
                  // Stripe not configured — do NOT claim success while billing continues
                  console.warn('[Cancel VIP] STRIPE_SECRET_KEY missing — cannot cancel subscription', sub.stripe_subscription_id);
                  return res.status(503).json({ success: false, error: 'Payment system unavailable. Please try again later or contact support.' });
              }
              await stripe.subscriptions.update(sub.stripe_subscription_id, {
                  cancel_at_period_end: true,
                  metadata: {
                      cancel_reason: reason || 'unspecified',
                      cancel_reason_text: reasonText || '',
                  }
              });

          }

          // 3. Update local record — core fields (always exist)
          // Key on user_id so records without a Stripe ID are still updated
          // (.eq('stripe_subscription_id', null) would match zero rows).
          let coreUpdate = getSupabase()
            .from('vip_subscriptions')
            .update({
                  cancel_at_period_end: true,
                  updated_at: new Date().toISOString()
              })
              .eq('user_id', userId);
          coreUpdate = sub.stripe_subscription_id
              ? coreUpdate.eq('stripe_subscription_id', sub.stripe_subscription_id)
              : coreUpdate.in('status', ['active', 'trialing']);
          const { error: err_vip_subscriptions_werdq } = await coreUpdate;
          if (err_vip_subscriptions_werdq) {
              console.warn('[Supabase] vip_subscriptions cancel update failed:', err_vip_subscriptions_werdq.message);
              return res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
          }

          // 4. Store cancellation reason (columns may not exist if migration not run)
          try {
              let reasonUpdate = getSupabase()
                .from('vip_subscriptions')
                .update({
                      cancel_reason: reason || 'unspecified',
                      cancel_reason_text: reasonText || '',
                  })
                  .eq('user_id', userId);
              reasonUpdate = sub.stripe_subscription_id
                  ? reasonUpdate.eq('stripe_subscription_id', sub.stripe_subscription_id)
                  : reasonUpdate.in('status', ['active', 'trialing']);
              const { error: err_vip_subscriptions_w3v1u } = await reasonUpdate;
              if (err_vip_subscriptions_w3v1u) console.warn('[Supabase] Silent mutation failed in vip_subscriptions:', err_vip_subscriptions_w3v1u.message);
          } catch (reasonErr) { console.warn('[App] Handled exception:', reasonErr?.message || reasonErr); }

          return res.status(200).json({
              success: true,
              message: 'Subscription will cancel at the end of your billing period'
          });
      } catch (err) {
          console.warn('Cancel VIP error:', err);
          return res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
