/**
 * RevenueCat Webhook Handler (Club Arena native app: StoreKit + Play Billing)
 * POST /api/store/webhooks/revenuecat
 *
 * The logic lives in src/lib/store/revenuecatWebhook.js; the money lives in
 * public.fn_iap_settle_event (service role only). See both headers.
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/sentryWrap';

const { handleRevenueCatWebhook } = require('../../../../src/lib/store/revenuecatWebhook');

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('RevenueCat webhook database is not configured');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

async function settle(event) {
  const { data, error } = await getSupabase().rpc('fn_iap_settle_event', { p_event: event });
  if (error) throw error;
  return data;
}

export default async function handler(req, res) {
  try {
    const out = await handleRevenueCatWebhook({
      method: req.method,
      authorization: req.headers.authorization,
      body: req.body,
      configuredAuth: process.env.REVENUECAT_WEBHOOK_AUTH,
      settle,
    });
    return res.status(out.status).json(out.body);
  } catch (err) {
    try { reportApiError(err, req); } catch (_e) { /* reporting must not mask the retry */ }
    console.error('[revenuecat-webhook] failed:', err?.message || err);
    // 500 so RevenueCat retries; the database is idempotent on the event id.
    return res.status(500).json({ received: false, error: 'internal_error' });
  }
}
