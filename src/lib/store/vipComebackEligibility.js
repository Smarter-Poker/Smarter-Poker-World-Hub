import {
  VIP_COMEBACK_MIN_LAPSE_DAYS,
  readVipComebackOfferSwitch,
  vipSubscriptionEndedAt,
} from './vipComebackOffer.mjs';
import { readVipIntroContactVerified } from './vipIntroEligibility.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * THE one decision for the comeback price (see vipComebackOffer.mjs). Checkout
 * charges from it and the membership status route displays from it.
 *
 *   { eligible: true,  reason: null }
 *   { eligible: false, reason: 'offer_off' | 'no_lapsed_card_subscription'
 *                              | 'subscription_not_ended' | 'lapsed_too_recently'
 *                              | 'comeback_used' | 'verify_contact' }
 *   { eligible: null,  reason: 'eligibility_unknown' | 'contact_unknown' | 'switch_unknown' }
 *
 * `null` is unknown: it stops a comeback checkout and is never rounded to
 * either price.
 */
export async function resolveVipComebackOffer(
  supabase,
  user,
  { env = process.env, now = new Date() } = {}
) {
  const offerSwitch = readVipComebackOfferSwitch(env);
  if (offerSwitch === 'off') return { eligible: false, reason: 'offer_off' };
  if (!supabase || typeof user?.id !== 'string' || !user.id) {
    return { eligible: null, reason: 'eligibility_unknown' };
  }

  let ledger;
  try {
    ledger = await supabase
      .from('vip_subscriptions')
      .select('stripe_subscription_id, status, current_period_end, canceled_at')
      .eq('user_id', user.id)
      .maybeSingle();
  } catch (_error) {
    return { eligible: null, reason: 'eligibility_unknown' };
  }
  if (ledger?.error) return { eligible: null, reason: 'eligibility_unknown' };
  const row = ledger?.data || null;
  const reference = String(row?.stripe_subscription_id || '');
  if (!row || !reference || reference.startsWith('diamond_')) {
    return { eligible: false, reason: 'no_lapsed_card_subscription' };
  }
  if (row.status !== 'canceled') return { eligible: false, reason: 'subscription_not_ended' };

  const endedAt = vipSubscriptionEndedAt(row);
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  if (!endedAt || !Number.isFinite(nowMs)) return { eligible: null, reason: 'eligibility_unknown' };
  if (endedAt.getTime() > nowMs - VIP_COMEBACK_MIN_LAPSE_DAYS * DAY_MS) {
    return { eligible: false, reason: 'lapsed_too_recently' };
  }

  let redemption;
  try {
    redemption = await supabase
      .from('vip_comeback_redemptions')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();
  } catch (_error) {
    return { eligible: null, reason: 'eligibility_unknown' };
  }
  if (redemption?.error) return { eligible: null, reason: 'eligibility_unknown' };
  if (redemption?.data) return { eligible: false, reason: 'comeback_used' };

  const contactVerified = await readVipIntroContactVerified(supabase, user);
  if (contactVerified === false) return { eligible: false, reason: 'verify_contact' };
  if (contactVerified === null) return { eligible: null, reason: 'contact_unknown' };

  if (offerSwitch !== 'on') return { eligible: null, reason: 'switch_unknown' };
  return { eligible: true, reason: null };
}
