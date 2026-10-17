export const VIP_GIFT_PLANS = ['monthly', 'yearly', 'lifetime'];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function vipGiftOffer(accountId, recipientId, plan, method, catalog) {
  if (!UUID.test(accountId || '') || !UUID.test(recipientId || '') || accountId === recipientId
      || !VIP_GIFT_PLANS.includes(plan) || !['card', 'diamonds'].includes(method)) return null;
  const amount = Math.round(Number(catalog[plan]?.price) * 100);
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 100000) return null;
  return { version: 1, accountId, recipientId, plan, method, amount, currency: method === 'card' ? 'usd' : 'diamonds', quantity: 1 };
}
export function sameGiftOffer(actual, expected) {
  return !!expected && !!actual && typeof actual === 'object'
    && Object.keys(actual).length === Object.keys(expected).length
    && Object.keys(expected).every((key) => actual[key] === expected[key]);
}
export function safeGiftCheckout(session, gift, live = true) {
  let url;
  try { url = new URL(session?.url); } catch { return false; }
  return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com'
    && !url.username && !url.password && !url.port
    && session?.mode === 'payment' && session?.status === 'open'
    && (!live || session.livemode === true)
    && session.currency === 'usd' && session.amount_total === gift.amount
    && session.metadata?.type === 'vip_gift' && session.metadata?.gift_id === gift.id
    && session.metadata?.sender_id === gift.sender_id && session.metadata?.recipient_id === gift.recipient_id;
}
export const giftErrorCopy = {
  friends_required: 'You Must Be Accepted Friends To Send A VIP Gift.',
  recipient_already_lifetime: 'This Friend Already Has Lifetime VIP.',
  insufficient_diamonds: 'You Need More Diamonds To Send This Gift.',
  request_conflict: 'This Purchase Request Already Belongs To A Different Gift.',
  already_lifetime: 'Your Lifetime VIP Already Includes This Access. You Can Return This Gift.',
  manage_card_subscription_first: 'Finish Any Open VIP Checkout Or End Your Card Subscription Before Redeeming. Your Gift Will Wait Here.',
  gift_not_available: 'This Gift Is Not Available To Redeem.',
  gift_not_returnable: 'Only An Unredeemed Gift Can Be Returned.',
};
