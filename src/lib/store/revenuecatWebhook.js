/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  RevenueCat webhook: the store-billing half of the Club Arena app (2026-09-08)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Inside the iOS and Android apps, diamonds and VIP are sold through StoreKit
 * and Play Billing (Apple 3.1.1, Play Payments policy), fronted by RevenueCat.
 * RevenueCat POSTs one event per store transaction to
 * /api/store/webhooks/revenuecat with an Authorization header whose value is
 * whatever was typed into its dashboard (REVENUECAT_WEBHOOK_AUTH here; Dan's
 * to set, 10.84).
 *
 * This module is the pure part: authenticate the request, shape the event,
 * hand it to the database. Every money decision lives in
 * public.fn_iap_settle_event (Club Arena migration
 * 20260908000009_in_app_purchases_settle_through_the_same_idempotent_diamond_),
 * which settles a diamond purchase through the SAME idempotent path a Stripe
 * purchase takes and applies the SAME VIP tier/expiry rules the Stripe webhook
 * applies. A replayed event returns its stored result and moves nothing.
 *
 * app_user_id: the Club Arena client logs in to RevenueCat with the Supabase
 * user id (src/lib/native/purchases.ts), so it arrives here as a uuid. An
 * anonymous RevenueCat id ($RCAnonymousID:...) is a purchase made before
 * sign-in; the database records it as unknown_user and this returns 200 so
 * RevenueCat stops retrying - the transfer event that follows the sign-in
 * carries the real id.
 */

const { timingSafeEqual } = require('crypto');

/** Constant-time compare of the Authorization header against the configured value. */
function isAuthorized(headerValue, configured) {
  if (!configured || typeof configured !== 'string' || configured.length < 16) return false;
  if (typeof headerValue !== 'string' || !headerValue) return false;
  // RevenueCat sends the value verbatim; some operators type "Bearer <x>".
  const presented = headerValue.replace(/^Bearer\s+/i, '');
  const expected = configured.replace(/^Bearer\s+/i, '');
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The fields fn_iap_settle_event reads, picked out of RevenueCat's event body. */
function shapeEvent(body) {
  const ev = body && typeof body === 'object' && body.event && typeof body.event === 'object' ? body.event : null;
  if (!ev) return null;
  const str = (v) => (v === undefined || v === null ? undefined : String(v));
  return {
    id: str(ev.id),
    type: str(ev.type),
    app_user_id: str(ev.app_user_id),
    original_app_user_id: str(ev.original_app_user_id),
    product_id: str(ev.product_id),
    transaction_id: str(ev.transaction_id),
    original_transaction_id: str(ev.original_transaction_id),
    store: str(ev.store),
    environment: str(ev.environment),
    price: ev.price === undefined || ev.price === null ? undefined : String(ev.price),
    currency: str(ev.currency),
    purchased_at_ms: str(ev.purchased_at_ms),
    expiration_at_ms: str(ev.expiration_at_ms),
    cancel_reason: str(ev.cancel_reason),
    period_type: str(ev.period_type),
    api_version: str(body.api_version),
  };
}

/**
 * Handle one webhook. `settle(eventJson)` is injected so the route and the
 * tests share this logic; in the route it calls the RPC with the service role.
 * Returns { status, body }.
 */
async function handleRevenueCatWebhook({ method, authorization, body, configuredAuth, settle }) {
  if (method !== 'POST') return { status: 405, body: { error: 'Method not allowed' } };
  if (!configuredAuth) {
    // Refusing loudly beats accepting silently: an unconfigured secret must
    // never become "every request is welcome".
    return { status: 503, body: { error: 'REVENUECAT_WEBHOOK_AUTH is not configured' } };
  }
  if (!isAuthorized(authorization, configuredAuth)) return { status: 401, body: { error: 'Unauthorized' } };

  const event = shapeEvent(body);
  if (!event || !event.id || !event.type) return { status: 400, body: { error: 'Malformed event' } };

  const result = await settle(event);
  if (!result || result.success !== true) {
    // unknown_user / unknown_product are terminal for THIS event: a retry
    // cannot change them, and the database has recorded them. Anything else
    // (a thrown error, a refused settlement) is a 500 so RevenueCat retries.
    const terminal = result && (result.error === 'unknown_user' || result.error === 'unknown_product');
    if (terminal) return { status: 200, body: { received: true, ...result } };
    return { status: 500, body: { received: false, error: (result && result.error) || 'settlement_failed', result } };
  }
  return { status: 200, body: { received: true, ...result } };
}

module.exports = { isAuthorized, shapeEvent, handleRevenueCatWebhook };
