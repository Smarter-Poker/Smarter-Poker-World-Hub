import { VIP_INTRO_OFFER } from './vipIntroOffer.mjs';

/**
 * WHAT AN UPGRADE PROMPT SAYS ABOUT THE VIP PRICE, AND WHERE ITS BUTTON LEADS.
 *
 * Every prompt outside the storefront (the out-of-Diamonds popup, the game
 * cost notice, the VIP gate, the trivia alerts, Settings, Bankroll) reads its
 * price wording and its destination from here, so no surface can promise the
 * $1 first month to an account the server will charge $20.
 *
 * Three answers, never two:
 *   intro    a signed-out visitor, or a member the server confirmed eligible
 *   verify   the server said not eligible because a contact is unverified
 *   regular  the server said not eligible, or the answer is not known yet
 *            (including before the page has read whether anyone is signed in)
 *
 * This is display only. Checkout decides again on the server.
 */

/** The monthly VIP purchase page, with the monthly plan already selected. */
export const VIP_MONTHLY_PURCHASE_PATH = `/hub/vip-membership/${VIP_INTRO_OFFER.plan}`;

/** The status route's reason for "verify a contact first". Optional field. */
export const VIP_INTRO_VERIFY_REASON = 'verify_contact';

const FIRST = `$${VIP_INTRO_OFFER.firstPeriodCents / 100}`;
const REGULAR = `$${VIP_INTRO_OFFER.regularCents / 100}`;

/**
 * Read the status route's answer. `eligible` is a boolean only when the server
 * said so; anything else is unknown (null). `reason` is an optional field:
 * a route that does not send it, or sends it for an eligible account, yields
 * null, so its absence changes nothing.
 */
export function parseVipIntroOfferStatus(ok, body) {
  const offer = body?.introOffer;
  if (ok !== true || body?.success !== true || typeof offer?.eligible !== 'boolean') {
    return { eligible: null, reason: null };
  }
  const reason = offer.eligible === false && typeof offer.reason === 'string' && offer.reason
    ? offer.reason
    : null;
  return { eligible: offer.eligible, reason };
}

export function vipIntroPromptState({ accountId = null, eligible = null, reason = null, sessionKnown = true } = {}) {
  // No account: a visitor sees the offer, but only once the page knows there
  // is no signed-in session. Before that the answer is unknown.
  if (!accountId) return sessionKnown ? 'intro' : 'regular';
  if (eligible === true) return 'intro';
  if (eligible === false && reason === VIP_INTRO_VERIFY_REASON) return 'verify';
  return 'regular';
}

export const VIP_INTRO_PROMPT_COPY = Object.freeze({
  intro: Object.freeze({
    line: `New Subscribers: ${FIRST} First Month, Then ${REGULAR}/Month. Cancel Anytime.`,
    price: FIRST,
    unit: ' First Month',
    note: `Then ${REGULAR}/Month. Cancel Anytime. New Subscribers Only.`,
    rowLabel: 'VIP First Month',
    rowValue: `${FIRST} For New Subscribers`,
    afterLabel: 'VIP After That',
    afterValue: `${REGULAR}/Month, Cancel Anytime`,
    cta: `Go VIP: ${FIRST} First Month`,
  }),
  regular: Object.freeze({
    line: `VIP Is ${REGULAR}/Month. Cancel Anytime.`,
    price: REGULAR,
    unit: '/Month',
    note: 'Cancel Anytime.',
    rowLabel: 'VIP Price',
    rowValue: `${REGULAR}/Month, Cancel Anytime`,
    afterLabel: null,
    afterValue: null,
    cta: `Go VIP: ${REGULAR}/Month`,
  }),
  verify: Object.freeze({
    line: `VIP Is ${REGULAR}/Month. Verify Your Email Or Phone To Unlock The ${FIRST} First Month.`,
    price: REGULAR,
    unit: '/Month',
    note: `Verify Your Email Or Phone To Unlock The ${FIRST} First Month.`,
    rowLabel: 'VIP Price',
    rowValue: `${REGULAR}/Month, Cancel Anytime`,
    afterLabel: `${FIRST} First Month`,
    afterValue: 'Verify Your Email Or Phone',
    cta: `Go VIP: ${REGULAR}/Month`,
  }),
});

export function vipIntroPromptCopy(input) {
  return VIP_INTRO_PROMPT_COPY[vipIntroPromptState(input)];
}

/**
 * What `checkout_started` reports for a VIP Card checkout: the amount due
 * today, which is $1 only when the $1 terms were the terms reviewed.
 */
export function vipCheckoutAnalytics(plan, introReviewed) {
  const intro = introReviewed === true && plan?.interval === VIP_INTRO_OFFER.interval && !plan?.oneTime;
  return {
    value_usd: intro ? VIP_INTRO_OFFER.firstPeriodCents / 100 : Number(plan?.price || 0),
    recurring_value_usd: plan?.oneTime ? 0 : Number(plan?.price || 0),
    intro_offer: intro,
  };
}
