/** Verified Stripe webhook objects only. All writes stay in service-only RPCs. */
export async function settleVipGift(db, session) {
  if (session.metadata?.type !== 'vip_gift') return false;
  if (session.mode !== 'payment' || session.payment_status !== 'paid') return true;
  const { data: gift, error } = await db.from('vip_gifts').select('*').eq('id', session.metadata.gift_id).maybeSingle();
  if (error || !gift) throw error || new Error('Paid VIP gift was not found');
  if (session.currency !== 'usd' || session.amount_total !== gift.amount
      || session.metadata.sender_id !== gift.sender_id || session.metadata.recipient_id !== gift.recipient_id
      || session.metadata.plan !== gift.plan) throw new Error('Paid VIP gift terms did not match');
  const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  const result = await db.rpc('settle_vip_gift_atomic', { p_gift: gift.id, p_session: session.id,
    p_intent: intent, p_amount: session.amount_total });
  if (result.error || !result.data?.success) throw result.error || new Error('VIP gift settlement refused');
  return true;
}
export async function reverseVipGift(db, stripe, object, eventType) {
  const intent = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id;
  if (!intent) return false;
  const read = await db.from('vip_gifts').select('id,amount').eq('payment_intent_id', intent).maybeSingle();
  if (read.error) throw read.error;
  let gift = read.data;
  if (!gift) {
    // Reversal can arrive before checkout.session.completed. Recover immutable
    // metadata from Stripe without assuming webhook arrival order.
    const sessions = await stripe.checkout.sessions.list({ payment_intent: intent, limit: 10 });
    const session = sessions.data.find(s => s.metadata?.type === 'vip_gift');
    if (!session) return false;
    const recovered = await db.from('vip_gifts').select('id,amount').eq('id', session.metadata.gift_id).maybeSingle();
    if (recovered.error || !recovered.data) throw recovered.error || new Error('Reversed VIP gift was not found');
    if (session.currency !== 'usd' || session.amount_total !== recovered.data.amount) throw new Error('Gift reversal price mismatch');
    gift = recovered.data;
  }
  const refund = eventType === 'charge.refunded';
  if (refund && (!Number.isSafeInteger(object.amount) || object.amount !== gift.amount
      || !Number.isSafeInteger(object.amount_refunded))) throw new Error('Invalid VIP gift refund amount');
  if (!refund && (!Number.isSafeInteger(object.amount) || object.amount <= 0 || object.amount > gift.amount))
    throw new Error('Invalid VIP gift dispute amount');
  const result = await db.rpc('reverse_vip_gift_atomic', { p_gift: gift.id,
    p_refunded: refund ? object.amount_refunded : 0,
    p_dispute: refund ? null : eventType === 'charge.dispute.closed' ? object.status === 'won' ? 'won' : 'lost' : 'open',
    p_dispute_id: refund ? null : object.id });
  if (result.error || !result.data?.success) throw result.error || new Error('VIP gift reversal refused');
  return true;
}

export async function expireVipGift(db, session) {
  if (session.metadata?.type !== 'vip_gift') return false;
  if (session.payment_status === 'paid') return true;
  if (!/^cs_[A-Za-z0-9_]+$/.test(session.id || '')) throw new Error('Invalid gift session');
  const { error } = await db.from('vip_gifts').update({ status: 'expired', session_id: session.id })
    .eq('id', session.metadata.gift_id).eq('sender_id', session.metadata.sender_id)
    .eq('recipient_id', session.metadata.recipient_id).eq('status', 'pending')
    .or(`session_id.is.null,session_id.eq.${session.id}`);
  if (error) throw error;
  return true;
}
