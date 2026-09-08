export const BLOCKING_RECURRING_VIP_STATUSES = Object.freeze([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
]);

const BLOCKING_STATUS_SET = new Set(BLOCKING_RECURRING_VIP_STATUSES);
const RECURRING_VIP_TIER_SET = new Set(['monthly', 'yearly']);

export const STRIPE_VIP_AUTHORITY = Object.freeze({
  VIP: 'vip',
  COMMANDER: 'commander',
  UNKNOWN: 'unknown',
  IRRELEVANT: 'irrelevant',
});

function normalizedIdSet(values) {
  return new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean));
}

/**
 * Classify a Stripe subscription before using it as VIP authority.
 *
 * A customer can also own a Commander venue subscription. Treating every
 * recurring object as VIP blocks a legitimate VIP purchase. Conversely,
 * silently ignoring an unrecognized active subscription could permit two VIP
 * obligations. Known Commander rows are ignored, known VIP rows block, and an
 * unknown blocking row must make the caller fail closed with a retryable 503.
 */
export function classifyStripeSubscriptionForVip(subscription, {
  knownVipPriceIds = [],
} = {}) {
  const metadata = subscription?.metadata || {};
  const hasCommanderIdentity = Boolean(String(metadata.venue_id || '').trim());
  const tier = String(metadata.vip_tier || '').trim().toLowerCase();
  const vipPriceIds = normalizedIdSet(knownVipPriceIds);
  const prices = Array.isArray(subscription?.items?.data)
    ? subscription.items.data
    : [];
  const hasVipIdentity = RECURRING_VIP_TIER_SET.has(tier) || prices.some((item) => {
    const price = item?.price || {};
    const priceTier = String(price?.metadata?.sp_vip_tier || '').trim().toLowerCase();
    return vipPriceIds.has(String(price?.id || '').trim())
      || RECURRING_VIP_TIER_SET.has(priceTier);
  });

  if (hasCommanderIdentity && hasVipIdentity) return STRIPE_VIP_AUTHORITY.UNKNOWN;
  if (hasCommanderIdentity) return STRIPE_VIP_AUTHORITY.COMMANDER;
  if (hasVipIdentity) return STRIPE_VIP_AUTHORITY.VIP;

  return STRIPE_VIP_AUTHORITY.UNKNOWN;
}

/** Resolve the exact recurring entitlement tier without a permissive default. */
export function resolveStripeSubscriptionVipTier(subscription, {
  knownVipPrices = {},
} = {}) {
  const candidates = new Set();
  const metadataTier = String(subscription?.metadata?.vip_tier || '').trim().toLowerCase();
  if (RECURRING_VIP_TIER_SET.has(metadataTier)) candidates.add(metadataTier);
  else if (metadataTier) return null;

  const prices = Array.isArray(subscription?.items?.data)
    ? subscription.items.data
    : [];
  for (const item of prices) {
    const price = item?.price || {};
    const priceTier = String(price?.metadata?.sp_vip_tier || '').trim().toLowerCase();
    if (priceTier) {
      if (!RECURRING_VIP_TIER_SET.has(priceTier)) return null;
      candidates.add(priceTier);
    }
    const configuredTier = String(knownVipPrices?.[price?.id] || '').trim().toLowerCase();
    if (configuredTier) {
      if (!RECURRING_VIP_TIER_SET.has(configuredTier)) return null;
      candidates.add(configuredTier);
    }
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}

/**
 * Classify an open Checkout Session without assuming that every subscription
 * mode session belongs to VIP. This route stamps VIP sessions with
 * metadata.type=subscription; Commander subscriptions carry venue_id.
 */
export function classifyStripeCheckoutSessionForVip(session) {
  const metadata = session?.metadata || {};
  const hasCommanderIdentity = Boolean(String(metadata.venue_id || '').trim());
  const hasVipIdentity = (
    session?.mode === 'subscription' && metadata.type === 'subscription'
  ) || (
    session?.mode === 'payment' && metadata.type === 'vip_lifetime'
  );
  if (hasCommanderIdentity && hasVipIdentity) return STRIPE_VIP_AUTHORITY.UNKNOWN;
  if (hasCommanderIdentity) return STRIPE_VIP_AUTHORITY.COMMANDER;
  if (hasVipIdentity) return STRIPE_VIP_AUTHORITY.VIP;
  // Lifetime Card checkout was paused after an earlier release had already
  // created one-payment sessions. Those URLs remain payable until Stripe
  // expires them, so they must still block a concurrent Diamond/Card term.
  if (session?.mode !== 'subscription') return STRIPE_VIP_AUTHORITY.IRRELEVANT;
  return STRIPE_VIP_AUTHORITY.UNKNOWN;
}

/**
 * Lifetime Diamond activation must never hide a recurring Card obligation.
 * Diamond membership rows use a `diamond_` reference and are not recurring.
 */
export function hasBlockingRecurringCardSubscription(rows) {
  if (!Array.isArray(rows)) return false;
  return rows.some((row) => {
    const reference = String(row?.stripe_subscription_id || '').trim();
    const status = String(row?.status || '').trim().toLowerCase();
    return reference.length > 0
      && !reference.startsWith('diamond_')
      && BLOCKING_STATUS_SET.has(status);
  });
}
