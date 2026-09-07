/**
 * Validate a configured Stripe Price against the server-owned VIP offer.
 * The environment may select an object identifier, but it may never change
 * the amount, currency, cadence, usage model, or entitlement tier.
 */
export function vipStripePriceMismatch(price, plan) {
  if (!price || typeof price !== 'object') return 'missing_price';
  if (price.active !== true) return 'inactive_price';
  if (String(price.currency || '').toLowerCase() !== 'usd') return 'wrong_currency';
  if (!Number.isSafeInteger(Number(price.unit_amount))
    || Number(price.unit_amount) !== Number(plan?.unitAmount)) return 'wrong_amount';
  if (price.type !== 'recurring') return 'wrong_type';
  if (price.billing_scheme !== 'per_unit') return 'wrong_billing_scheme';
  if (price.transform_quantity != null) return 'transformed_quantity';
  if (!price.recurring || price.recurring.interval !== plan?.interval) return 'wrong_interval';
  if (Number(price.recurring.interval_count || 1) !== 1) return 'wrong_interval_count';
  if (String(price.recurring.usage_type || '') !== 'licensed') return 'wrong_usage_type';
  // The provisioned Stripe Price objects use the namespaced key documented in
  // docs/changelog/2026-09-05-vip-prices-exist-in-stripe.md. Session and
  // subscription metadata use `vip_tier`, but Price metadata must match the
  // existing `sp_vip_tier` contract or valid production Prices fail closed.
  const metadataTier = String(price.metadata?.sp_vip_tier || '').trim();
  if (!metadataTier) return 'missing_tier';
  if (metadataTier !== plan?.tier) return 'wrong_tier';
  return null;
}
