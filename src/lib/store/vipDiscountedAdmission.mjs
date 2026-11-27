/**
 * The webhook's last word on a DISCOUNTED first month before it admits a new
 * VIP subscription (pages/api/store/webhooks/stripe.js).
 *
 * 1. ONE $1 MONTH PER CARD. The $1 first month is once per account, and one
 *    person can open a second account. So the card that paid the first $1
 *    invoice is recorded by its Stripe card fingerprint in
 *    `vip_intro_card_fingerprints`. A $1 subscription whose card already paid
 *    a $1 month for a DIFFERENT account is not admitted: the webhook refunds
 *    the $1 and ends the subscription through its existing denied-subscription
 *    compensation. The same account seen again (a Stripe retry, or a retried
 *    checkout after a refusal) is admitted as before.
 *
 *    Limit, stated rather than defeated: Apple Pay and Google Pay pay with a
 *    device token, and Stripe's fingerprint for a wallet payment belongs to
 *    that token, not to the underlying card. The same card through two
 *    different phones, or once by wallet and once typed in, reads as two
 *    cards. The account limit, the verified email and the checkout limits
 *    still apply to those.
 *
 * 2. ONE COMEBACK MONTH PER ACCOUNT. vip_subscriptions recycles one row per
 *    user, so the comeback subscription is recorded in
 *    `vip_comeback_redemptions` (user_id is the key). A second comeback
 *    subscription for the same account is not admitted.
 *
 * Unknown is its own outcome: an unreadable fingerprint or a failed ledger
 * write THROWS, so Stripe retries the event. Nothing is admitted or denied on
 * a guess.
 */
import { isVipIntroSubscription } from './vipIntroOffer.mjs';
import { isVipComebackSubscription } from './vipComebackOffer.mjs';

export const VIP_DISCOUNTED_ADMISSION_DENIALS = Object.freeze({
  cardReused: 'vip_intro_card_reused',
  comebackUsed: 'vip_comeback_already_used',
  combined: 'vip_offers_combined',
});

function objectId(value) {
  if (typeof value === 'string') return value;
  return typeof value?.id === 'string' ? value.id : null;
}

function usableFingerprint(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 ? value : null;
}

/**
 * The card fingerprint of the payment that paid the subscription's INITIAL
 * invoice. Throws when it cannot be read exactly.
 */
export async function readInitialInvoiceCardFingerprint(stripe, invoice) {
  if (!invoice || invoice.billing_reason !== 'subscription_create') {
    throw new Error('VIP first-month card check has no exact initial invoice; Stripe will retry');
  }
  const chargeId = objectId(invoice.charge);
  const paymentIntentId = objectId(invoice.payment_intent);
  let charge = null;
  if (chargeId) {
    charge = await stripe.charges.retrieve(chargeId);
    if (charge?.id !== chargeId) charge = null;
  } else if (paymentIntentId) {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    });
    charge = intent?.id === paymentIntentId && typeof intent.latest_charge === 'object'
      ? intent.latest_charge
      : null;
  }
  const fingerprint = usableFingerprint(charge?.payment_method_details?.card?.fingerprint);
  if (!fingerprint) {
    throw new Error('VIP first-month card fingerprint is unreadable; Stripe will retry');
  }
  return fingerprint;
}

/* `table` is a function returning a fresh query builder, so each table name
   stays a literal `.from('...')` that the phantom-table check can see. */
async function recordOnce(table, row, conflictColumn, keyColumn, keyValue, columns) {
  const write = await table().upsert(row, { onConflict: conflictColumn, ignoreDuplicates: true });
  if (write?.error) throw new Error(`ledger write failed: ${write.error.message || 'unknown'}`);
  const read = await table().select(columns).eq(keyColumn, keyValue).maybeSingle();
  if (read?.error || !read?.data) {
    throw new Error('ledger row could not be read back; Stripe will retry');
  }
  return read.data;
}

/**
 * { admit: true } or { admit: false, reason } for a subscription the webhook
 * is about to admit for the first time. Throws when the answer is unknown.
 * A subscription that is neither offer is admitted with no read and no write.
 */
export async function vipDiscountedAdmissionDecision({
  supabase,
  stripe,
  subscription,
  userId,
  paymentContext,
}) {
  const intro = isVipIntroSubscription(subscription);
  const comeback = isVipComebackSubscription(subscription);
  if (!intro && !comeback) return { admit: true };
  if (intro && comeback) return { admit: false, reason: VIP_DISCOUNTED_ADMISSION_DENIALS.combined };

  const subscriptionId = objectId(subscription);
  if (!subscriptionId || typeof userId !== 'string' || !userId) {
    throw new Error('VIP first-month admission has no exact subscription or account');
  }

  if (paymentContext?.error) throw paymentContext.error;
  if (paymentContext?.kind !== 'initial' || !paymentContext?.invoice) {
    throw new Error('VIP first-month card check has no initial payment context; Stripe will retry');
  }
  if (objectId(paymentContext.invoice.subscription) !== subscriptionId) {
    throw new Error('VIP first-month initial invoice does not match its subscription');
  }
  /* Only a PAID first invoice is recorded: an unpaid attempt must not use up
     the account's comeback month or claim a card. Stripe sends the payment
     events, and the retry reads the paid invoice. */
  if (paymentContext.invoice.paid !== true || paymentContext.invoice.status !== 'paid') {
    throw new Error('VIP first-month initial invoice is not paid yet; Stripe will retry');
  }

  if (comeback) {
    const recorded = await recordOnce(
      () => supabase.from('vip_comeback_redemptions'),
      { user_id: userId, stripe_subscription_id: subscriptionId },
      'user_id',
      'user_id',
      userId,
      'user_id, stripe_subscription_id'
    );
    return recorded.stripe_subscription_id === subscriptionId
      ? { admit: true }
      : { admit: false, reason: VIP_DISCOUNTED_ADMISSION_DENIALS.comebackUsed };
  }

  const fingerprint = await readInitialInvoiceCardFingerprint(stripe, paymentContext.invoice);
  const recorded = await recordOnce(
    () => supabase.from('vip_intro_card_fingerprints'),
    { fingerprint, first_user_id: userId, first_subscription_id: subscriptionId },
    'fingerprint',
    'fingerprint',
    fingerprint,
    'first_user_id, first_subscription_id'
  );
  return recorded.first_user_id === userId
    ? { admit: true }
    : { admit: false, reason: VIP_DISCOUNTED_ADMISSION_DENIALS.cardReused };
}
