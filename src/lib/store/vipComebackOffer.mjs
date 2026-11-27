/**
 * VIP COMEBACK PRICE FOR LAPSED CARD MEMBERS (2026-11-27).
 *
 * The $1 first month (vipIntroOffer.mjs) is for accounts that have never held
 * a Card VIP subscription, so a member who subscribed, cancelled and left is
 * excluded by design. This is their one-time way back:
 *
 *   - the MONTHLY Card subscription only, on the same regular $20 recurring
 *     Price, with a one-time Stripe coupon of $10, so the first invoice is $10
 *     and every renewal is $20 with no further action;
 *   - only for an account whose Card subscription is `canceled` and ended at
 *     least COMEBACK_MIN_LAPSE_DAYS ago (ended = the later of Stripe's
 *     `canceled_at` and the last paid period end, so a member is never counted
 *     as lapsed while time they paid for is still running);
 *   - once per account, recorded by the webhook in
 *     `vip_comeback_redemptions` (vip_subscriptions recycles one row per user
 *     and cannot remember it);
 *   - never combined with the $1 first month: that offer needs no Card
 *     history at all, this one needs a lapsed Card subscription, and checkout
 *     decides this one only after the $1 offer is ruled out;
 *   - the same protections as the $1 month: its own off switch, the durable
 *     per-account and per-network checkout limits, a verified email.
 *
 * Why $10: half the regular month is a real reason to come back, it is ten
 * times the amount a stolen-card tester looks for, the member pays it with the
 * card they already used with us, and the stipend (500 Diamonds = $5) is not
 * paid during it, so the platform never hands back more than it charged.
 */
import { readOfferDisabledSwitch } from './vipIntroOffer.mjs';

export const VIP_COMEBACK_OFFER = Object.freeze({
  plan: 'monthly',
  interval: 'month',
  firstPeriodCents: 1000,
  regularCents: 2000,
  couponId: 'sp-vip-comeback-month-10usd',
  couponName: 'VIP Comeback Month $10',
  metadataValue: 'comeback_month_10usd',
});

export const VIP_COMEBACK_AMOUNT_OFF_CENTS =
  VIP_COMEBACK_OFFER.regularCents - VIP_COMEBACK_OFFER.firstPeriodCents;

export const VIP_COMEBACK_MIN_LAPSE_DAYS = 30;

/* Same rule as VIP_INTRO_OFFER_DISABLED: unset or 0/false/no/off = ON,
   1/true/yes/on = OFF, anything else = unknown (stops the comeback checkout). */
export const VIP_COMEBACK_SWITCH_ENV = 'VIP_COMEBACK_OFFER_DISABLED';

/** 'on' | 'off' | 'unknown'. Never throws. */
export function readVipComebackOfferSwitch(env = process.env) {
  return readOfferDisabledSwitch(VIP_COMEBACK_SWITCH_ENV, env);
}

/* Separate counters from the $1 month, same sizes. */
export const VIP_COMEBACK_CHECKOUT_SCOPE = 'vip-comeback-checkout';
export const VIP_COMEBACK_CHECKOUT_LIMITS = Object.freeze({
  account: Object.freeze({ max: 5, windowSeconds: 24 * 60 * 60 }),
  network: Object.freeze({ max: 20, windowSeconds: 24 * 60 * 60 }),
});

/** True only for the exact plan and regular price the offer was written for. */
export function vipComebackOfferAppliesToPlan(plan) {
  return (
    plan?.key === VIP_COMEBACK_OFFER.plan &&
    plan?.interval === VIP_COMEBACK_OFFER.interval &&
    Number(plan?.unitAmount) === VIP_COMEBACK_OFFER.regularCents
  );
}

/** null when the coupon is exactly the one-time $10 USD reduction, else a reason. */
export function vipComebackCouponMismatch(coupon) {
  if (!coupon || typeof coupon !== 'object') return 'missing_coupon';
  if (coupon.id !== VIP_COMEBACK_OFFER.couponId) return 'wrong_coupon';
  if (coupon.valid !== true) return 'invalid_coupon';
  if (coupon.duration !== 'once') return 'wrong_duration';
  if (coupon.percent_off != null) return 'percent_coupon';
  if (Number(coupon.amount_off) !== VIP_COMEBACK_AMOUNT_OFF_CENTS) return 'wrong_amount';
  if (String(coupon.currency || '').toLowerCase() !== 'usd') return 'wrong_currency';
  if (coupon.max_redemptions != null || coupon.redeem_by != null) return 'limited_coupon';
  return null;
}

/** The exact coupon this offer needs, for a create-if-absent call. */
export function vipComebackCouponParams() {
  return {
    id: VIP_COMEBACK_OFFER.couponId,
    name: VIP_COMEBACK_OFFER.couponName,
    amount_off: VIP_COMEBACK_AMOUNT_OFF_CENTS,
    currency: 'usd',
    duration: 'once',
    metadata: { sp_vip_comeback_offer: VIP_COMEBACK_OFFER.metadataValue },
  };
}

function objectId(value) {
  if (typeof value === 'string') return value;
  return typeof value?.id === 'string' ? value.id : null;
}

/** True when this Stripe subscription was opened on the comeback price. */
export function isVipComebackSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object') return false;
  if (subscription.metadata?.vip_comeback_offer === VIP_COMEBACK_OFFER.metadataValue) return true;
  const discounts = [
    subscription.discount,
    ...(Array.isArray(subscription.discounts) ? subscription.discounts : []),
  ];
  return discounts.some(
    (discount) => objectId(discount?.coupon) === VIP_COMEBACK_OFFER.couponId
  );
}

/**
 * When did this ledger row's Card subscription END? The later of Stripe's
 * cancellation time and the paid period end. Returns a Date, or null when
 * neither is a readable timestamp (unknown, never "long ago").
 */
export function vipSubscriptionEndedAt(row) {
  const times = [row?.canceled_at, row?.current_period_end]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => new Date(value).getTime());
  if (times.length === 0 || times.some((time) => !Number.isFinite(time))) return null;
  return new Date(Math.max(...times));
}
