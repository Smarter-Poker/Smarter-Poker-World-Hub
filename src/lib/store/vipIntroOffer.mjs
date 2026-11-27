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

/* ------------------------------------------------------------------------
   THE OFF SWITCH (2026-11-27).

   One environment variable, read at request time, turns the offer off for
   everyone: VIP_INTRO_OFFER_DISABLED. Unset (or an explicit "off" value such
   as 0/false/no/off) means the offer is ON, which is Dan's standing ruling.
   1/true/yes/on means the offer is OFF and every account sees and pays the
   regular price. Any other value is a typo, and a typo is UNKNOWN: a caller
   must stop the $1 checkout rather than guess which price was meant.

   Checkout, the membership status route and the public catalog all read the
   switch through this one function (the two routes via resolveVipIntroOffer
   in vipIntroEligibility.js), so a display and a charge cannot disagree.

   Flipping it is a Vercel environment change plus a redeploy; there is no
   runtime settings store in this platform that the store routes already
   trust, and a new one is new infrastructure.
   ------------------------------------------------------------------------ */
export const VIP_INTRO_SWITCH_ENV = 'VIP_INTRO_OFFER_DISABLED';
const SWITCH_OFFER_ON_VALUES = new Set(['', '0', 'false', 'no', 'off']);
const SWITCH_OFFER_OFF_VALUES = new Set(['1', 'true', 'yes', 'on']);

/** 'on' | 'off' | 'unknown'. Never throws. */
export function readVipIntroOfferSwitch(env = process.env) {
  return readOfferDisabledSwitch(VIP_INTRO_SWITCH_ENV, env);
}

/**
 * The same off-switch rule for any offer's own `<NAME>_DISABLED` variable
 * (the comeback price uses it too). 'on' | 'off' | 'unknown'. Never throws.
 */
export function readOfferDisabledSwitch(name, env = process.env) {
  let raw;
  try {
    raw = env?.[name];
  } catch (_error) {
    return 'unknown';
  }
  if (raw === undefined || raw === null) return 'on';
  if (typeof raw !== 'string') return 'unknown';
  const value = raw.trim().toLowerCase();
  if (SWITCH_OFFER_ON_VALUES.has(value)) return 'on';
  if (SWITCH_OFFER_OFF_VALUES.has(value)) return 'off';
  return 'unknown';
}

/**
 * Public catalog terms: the offer when it is on, otherwise null. An off or
 * unreadable switch publishes no offer, so a display falls back to the regular
 * price - the only price that is certainly not an overstatement of a discount.
 */
export function vipIntroOfferCatalogTerms(env = process.env) {
  return readVipIntroOfferSwitch(env) === 'on' ? vipIntroOfferPublicTerms() : null;
}

/* ------------------------------------------------------------------------
   CARD-TESTING LIMITS. A $1 charge is what stolen-card testers look for.
   Durable counters (check_rate_limit_strict, the same authority every other
   expensive route uses) bound how many NEW $1 Checkout Sessions may be opened.
   ------------------------------------------------------------------------ */
export const VIP_INTRO_CHECKOUT_LIMITS = Object.freeze({
  account: Object.freeze({ max: 5, windowSeconds: 24 * 60 * 60 }),
  network: Object.freeze({ max: 20, windowSeconds: 24 * 60 * 60 }),
});

/* ------------------------------------------------------------------------
   PLAN SWITCHES DURING THE $1 MONTH.

   switch-vip-plan.js changes the price with proration_behavior
   'create_prorations'. The one-time coupon is consumed by the first invoice,
   so by the time a member switches it is no longer on the subscription, and
   Stripe's classic proration credits "unused time" from the current $20 price
   even though that month cost $1. A member could pay $1, switch to yearly the
   same day and carry about $19 of credit they never paid for. So a
   subscription that started on the offer may not change plan until Stripe
   shows it has been billed the full price at least once.
   ------------------------------------------------------------------------ */
function objectId(value) {
  if (typeof value === 'string') return value;
  return typeof value?.id === 'string' ? value.id : null;
}

/** True when this Stripe subscription was opened on the $1 first month. */
export function isVipIntroSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object') return false;
  if (subscription.metadata?.vip_intro_offer === VIP_INTRO_OFFER.metadataValue) return true;
  const discounts = [
    subscription.discount,
    ...(Array.isArray(subscription.discounts) ? subscription.discounts : []),
  ];
  return discounts.some(
    (discount) => objectId(discount?.coupon) === VIP_INTRO_OFFER.couponId
  );
}

/**
 * 'open' | 'locked' | 'unknown' for a plan change on `subscription`, given the
 * Stripe list of its PAID invoices. Unknown is its own answer: an invoice list
 * that is malformed or truncated never opens the switch and never locks it.
 */
export function vipIntroPlanSwitchDecision(subscription, paidInvoices) {
  if (!isVipIntroSubscription(subscription)) return 'open';
  return vipFullPriceRenewalDecision(subscription, paidInvoices);
}

/**
 * The invoice rule alone, for any subscription whose first month was sold at
 * a one-time reduction (the $1 first month or the comeback price): 'open' once
 * Stripe shows one paid invoice at the full monthly price, 'locked' before
 * that, 'unknown' when the list cannot prove either.
 */
export function vipFullPriceRenewalDecision(subscription, paidInvoices) {
  const subscriptionId = objectId(subscription);
  const rows = paidInvoices?.data;
  if (!subscriptionId || !Array.isArray(rows)) return 'unknown';
  const billedFullPrice = rows.some(
    (invoice) =>
      invoice?.status === 'paid' &&
      objectId(invoice?.subscription) === subscriptionId &&
      String(invoice?.currency || '').toLowerCase() === 'usd' &&
      Number.isSafeInteger(invoice?.total) &&
      invoice.total >= VIP_INTRO_OFFER.regularCents
  );
  if (billedFullPrice) return 'open';
  return paidInvoices.has_more ? 'unknown' : 'locked';
}

export const VIP_INTRO_PLAN_SWITCH_LOCKED_MESSAGE =
  'Plan Changes Open After Your First Full-Price Renewal.';
