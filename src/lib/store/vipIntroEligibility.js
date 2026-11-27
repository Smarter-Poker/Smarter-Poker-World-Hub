import { createHash } from 'node:crypto';
import { VIP_INTRO_CHECKOUT_LIMITS, readVipIntroOfferSwitch } from './vipIntroOffer.mjs';

/**
 * Server-side eligibility for the $1 first VIP month (see vipIntroOffer.mjs).
 *
 * An account is eligible when it has never held a Card VIP subscription.
 * `vip_subscriptions` keeps a row for every Stripe subscription the webhook
 * has ever admitted, including cancelled ones, so "no Card row at all" is the
 * durable answer to "is this their first subscription". Diamond-funded terms
 * use a `diamond_` reference and do not count: they were never a subscription.
 *
 * The answer is `null` when it could not be read. A caller must treat that as
 * unknown - never as eligible and never as ineligible.
 */
export async function readVipIntroEligibility(supabase, userId) {
  if (!supabase || typeof userId !== 'string' || !userId) return null;
  const { data, error } = await supabase
    .from('vip_subscriptions')
    .select('stripe_subscription_id')
    .eq('user_id', userId)
    .not('stripe_subscription_id', 'is', null)
    .not('stripe_subscription_id', 'like', 'diamond_%')
    .limit(1);
  if (error || !Array.isArray(data)) return null;
  return data.length === 0;
}

/**
 * Does this account have a contact the platform has verified? For the $1
 * first month that is a CONFIRMED EMAIL ADDRESS (auth `email_confirmed_at`),
 * the same fact Card checkout already requires of every purchase
 * (emailVerifiedGate). A verified phone (`profiles.phone_verified`) does not
 * stand in for it: checkout would refuse that account at its email gate, and
 * a display must never promise a price checkout will not honour.
 *
 * true / false / null (could not be read).
 */
export async function readVipIntroContactVerified(supabase, user) {
  if (!supabase || typeof user?.id !== 'string' || !user.id) return null;
  if (user.email_confirmed_at) return true;
  /* A user object that carries the field, empty, is unconfirmed. A token
     decoded by the JWT fallback carries no such field at all: that is "not
     told", so ask the auth record. */
  if (typeof user.email_confirmed_at !== 'undefined') return false;
  try {
    const { data, error } = await supabase.auth.admin.getUserById(user.id);
    if (error || !data?.user) return null;
    return Boolean(data.user.email_confirmed_at);
  } catch (_error) {
    return null;
  }
}

/**
 * THE one decision every surface reads: is the $1 first month available to
 * this account right now?
 *
 *   { eligible: true,  reason: null }
 *   { eligible: false, reason: 'offer_off' | 'already_subscribed' | 'verify_contact' }
 *   { eligible: null,  reason: 'eligibility_unknown' | 'contact_unknown' | 'switch_unknown' }
 *
 * Checkout charges from it and the membership status route displays from it,
 * so the two cannot disagree. `null` is unknown and stops a $1 checkout; it is
 * never rounded to either price.
 */
export async function resolveVipIntroOffer(supabase, user, { env = process.env } = {}) {
  const offerSwitch = readVipIntroOfferSwitch(env);
  if (offerSwitch === 'off') return { eligible: false, reason: 'offer_off' };

  const firstSubscription = await readVipIntroEligibility(supabase, user?.id);
  if (firstSubscription === null) return { eligible: null, reason: 'eligibility_unknown' };
  if (firstSubscription === false) return { eligible: false, reason: 'already_subscribed' };

  const contactVerified = await readVipIntroContactVerified(supabase, user);
  if (contactVerified === false) return { eligible: false, reason: 'verify_contact' };
  if (contactVerified === null) return { eligible: null, reason: 'contact_unknown' };

  if (offerSwitch !== 'on') return { eligible: null, reason: 'switch_unknown' };
  return { eligible: true, reason: null };
}

function requestNetworkAddress(req) {
  const realIp = req?.headers?.['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const parts = forwarded.split(',');
    return parts[parts.length - 1].trim() || null;
  }
  return null;
}

/**
 * Count one NEW $1 Checkout Session against this account and this network,
 * through the durable limiter (`check_rate_limit_strict`).
 *
 *   'allowed'      both counters are inside their limits
 *   'limited'      a counter is over its limit
 *   'unavailable'  the limiter could not be asked; the caller must stop
 *
 * The network address is stored only as a hash.
 */
export async function consumeVipIntroCheckoutAllowance(supabase, userId, req) {
  if (!supabase || typeof userId !== 'string' || !userId) return 'unavailable';
  const buckets = [
    { key: `store:vip-intro-checkout:user:${userId}`, ...VIP_INTRO_CHECKOUT_LIMITS.account },
  ];
  const address = requestNetworkAddress(req);
  if (address) {
    const hash = createHash('sha256').update(`vip-intro-checkout:${address}`).digest('hex');
    buckets.push({
      key: `store:vip-intro-checkout:net:${hash}`,
      ...VIP_INTRO_CHECKOUT_LIMITS.network,
    });
  }
  let limited = false;
  for (const bucket of buckets) {
    let result;
    try {
      result = await supabase.rpc('check_rate_limit_strict', {
        p_key: bucket.key,
        p_limit: bucket.max,
        p_window_seconds: bucket.windowSeconds,
      });
    } catch (_error) {
      return 'unavailable';
    }
    if (result?.error) return 'unavailable';
    if (result?.data !== true) limited = true;
  }
  return limited ? 'limited' : 'allowed';
}
