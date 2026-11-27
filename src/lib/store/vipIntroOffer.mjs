/**
 * VIP FIRST MONTH FOR ONE DOLLAR (Dan, 2026-11-26).
 *
 * "When people are not VIP and they want to sign up for VIP ... the first
 * month should be $1 and then $20 a month after that, they can cancel
 * anytime, but all first month subscriptions are just a dollar."
 *
 * One place owns the terms. The Card checkout route, the membership status
 * route, the public catalog and every display read these constants, so the
 * figure a member reviews is the figure Stripe charges.
 *
 * What the offer is:
 *   - the MONTHLY Card subscription only. Yearly ($200) and Lifetime ($500)
 *     are unchanged, and a Diamond-funded month is unchanged (it is a single
 *     prepaid term, not a subscription, and Diamonds can be earned for free);
 *   - one time per account: an account that has ever held a Card VIP
 *     subscription pays the regular price;
 *   - the regular $20 recurring Price with a one-time Stripe coupon, so the
 *     subscription object is the ordinary monthly subscription the webhook
 *     already verifies, the first invoice is $1, and every renewal is $20.
 */
export const VIP_INTRO_OFFER = Object.freeze({
  plan: 'monthly',
  interval: 'month',
  firstPeriodCents: 100,
  regularCents: 2000,
  couponId: 'sp-vip-first-month-1usd',
  couponName: 'VIP First Month $1',
  metadataValue: 'first_month_1usd',
});

export const VIP_INTRO_AMOUNT_OFF_CENTS =
  VIP_INTRO_OFFER.regularCents - VIP_INTRO_OFFER.firstPeriodCents;

/** True only for the exact plan and regular price the offer was written for. */
export function vipIntroOfferAppliesToPlan(plan) {
  return (
    plan?.key === VIP_INTRO_OFFER.plan &&
    plan?.interval === VIP_INTRO_OFFER.interval &&
    Number(plan?.unitAmount) === VIP_INTRO_OFFER.regularCents
  );
}

/**
 * Validate the Stripe coupon before it is attached to a Checkout Session.
 * Returns null when the coupon is exactly the one-time $19 USD reduction;
 * otherwise a short reason. A coupon that drifted (edited in the dashboard,
 * made repeating, given a percentage) must never silently change the price.
 */
export function vipIntroCouponMismatch(coupon) {
  if (!coupon || typeof coupon !== 'object') return 'missing_coupon';
  if (coupon.id !== VIP_INTRO_OFFER.couponId) return 'wrong_coupon';
  if (coupon.valid !== true) return 'invalid_coupon';
  if (coupon.duration !== 'once') return 'wrong_duration';
  if (coupon.percent_off != null) return 'percent_coupon';
  if (Number(coupon.amount_off) !== VIP_INTRO_AMOUNT_OFF_CENTS) return 'wrong_amount';
  if (String(coupon.currency || '').toLowerCase() !== 'usd') return 'wrong_currency';
  if (coupon.max_redemptions != null || coupon.redeem_by != null) return 'limited_coupon';
  return null;
}

/** The exact coupon this offer needs, for a create-if-absent call. */
export function vipIntroCouponParams() {
  return {
    id: VIP_INTRO_OFFER.couponId,
    name: VIP_INTRO_OFFER.couponName,
    amount_off: VIP_INTRO_AMOUNT_OFF_CENTS,
    currency: 'usd',
    duration: 'once',
    metadata: { sp_vip_intro_offer: VIP_INTRO_OFFER.metadataValue },
  };
}

/** Public, display-only description of the offer. Never an entitlement. */
export function vipIntroOfferPublicTerms() {
  return {
    plan: VIP_INTRO_OFFER.plan,
    firstPeriodCents: VIP_INTRO_OFFER.firstPeriodCents,
    firstPeriodUsd: VIP_INTRO_OFFER.firstPeriodCents / 100,
    regularCents: VIP_INTRO_OFFER.regularCents,
    regularUsd: VIP_INTRO_OFFER.regularCents / 100,
    paymentMethod: 'card',
  };
}

/* Display copy, written once so every surface says the same thing. */
export const VIP_INTRO_COPY = Object.freeze({
  price: '$1 First Month',
  then: 'Then $20/Month. Cancel Anytime.',
  full: '$1 First Month, Then $20/Month. Cancel Anytime.',
  cta: 'Go VIP: $1 First Month',
  subscribe: 'Subscribe With Card: $1 First Month, Then $20/Month',
});
