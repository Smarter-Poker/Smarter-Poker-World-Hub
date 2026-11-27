import { VIP_INTRO_OFFER } from './vipIntroOffer.mjs';

/**
 * What `checkout_started` reports for a VIP Card checkout.
 *
 * `value_usd` is the amount due TODAY: $1 only when the $1 first month was
 * part of the terms the member reviewed, otherwise the plan price. The
 * recurring price is reported beside it and `intro_offer` marks the signup,
 * so first-month signups can be counted without guessing from the amount.
 * Measurement only: the server decides the charge.
 */
export function vipCheckoutAnalytics(plan, introReviewed) {
  const intro = introReviewed === true && plan?.interval === VIP_INTRO_OFFER.interval && !plan?.oneTime;
  return {
    value_usd: intro ? VIP_INTRO_OFFER.firstPeriodCents / 100 : Number(plan?.price || 0),
    recurring_value_usd: plan?.oneTime ? 0 : Number(plan?.price || 0),
    intro_offer: intro,
  };
}
