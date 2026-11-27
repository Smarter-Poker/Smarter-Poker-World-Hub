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
