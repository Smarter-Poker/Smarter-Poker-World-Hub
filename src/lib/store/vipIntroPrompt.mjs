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
 *   intro    a signed-out visitor while the public catalog publishes the
 *            offer, or a member the server confirmed eligible
 *   verify   the server said not eligible because a contact is unverified
 *   regular  the server said not eligible (including 'offer_off'), the
 *            public catalog publishes no offer (the off switch), or the
 *            answer is not known yet (including before the page has read
 *            whether anyone is signed in or what the catalog says)
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

/**
 * Read the public catalog's answer to "is the offer on?". The catalog sends
 * the offer terms when the switch is on and null when it is off; anything
 * unreadable is unknown (null), which displays the regular price.
 */
export function parseVipIntroCatalogOffer(ok, body) {
  if (ok !== true || body?.success !== true || !('vipIntroOffer' in (body || {}))) return null;
  return body.vipIntroOffer && typeof body.vipIntroOffer === 'object' ? true : false;
}

export function vipIntroPromptState({ accountId = null, eligible = null, reason = null, sessionKnown = true, publicOffer = null } = {}) {
  // No account: a visitor sees the offer only once the page knows there is no
  // signed-in session AND the public catalog says the offer is on.
  if (!accountId) return sessionKnown && publicOffer === true ? 'intro' : 'regular';
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

