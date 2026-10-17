import { settleVipGift } from '../../../src/lib/store/vipGiftStripe';
import Stripe from 'stripe';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { VIP_MEMBERSHIP } from '../../../src/data/diamondStoreData';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';
import { vipGiftOffer, sameGiftOffer, safeGiftCheckout, UUID, giftErrorCopy } from '../../../src/lib/store/vipGiftContract.mjs';
import { classifyStripeCheckoutSessionForVip, classifyStripeSubscriptionForVip, STRIPE_VIP_AUTHORITY, BLOCKING_RECURRING_VIP_STATUSES } from '../../../src/lib/store/vipPurchaseGuards.mjs';
const { requireEmailVerified, requireEmailVerifiedByUserId } = require('../../../src/lib/emailVerifiedGate');
const { inspectStripeRuntime, isProductionRuntime } = require('../../../src/lib/store/stripeRuntimeMode');

let db;
let stripe;
function database() {
  if (!db) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('VIP gift database unavailable');
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return db;
}
function provider() {
  if (!inspectStripeRuntime(process.env, { requireWebhook: true }).ready) throw new Error('Card checkout is unavailable');
  if (!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16', timeout: 15000, maxNetworkRetries: 2, telemetry: false });
  return stripe;
}
const publicGift = (g, viewer) => ({ id: g.id, senderId: g.sender_id, recipientId: g.recipient_id,
  plan: g.plan, method: g.method, amount: g.amount, status: g.status,
  ...(g.sender_id === viewer ? { requestId: g.request_id } : {}), createdAt: g.created_at, deliveredAt: g.delivered_at, redeemedAt: g.redeemed_at });
const refuse = (res, error, status = 409) => res.status(status).json({ success: false, code: error,
  error: giftErrorCopy[error] || 'This Gift Could Not Be Processed. Refresh Your Gifts And Try Again.' });
async function rpc(name, args) {
  const { data, error } = await database().rpc(name, args);
  if (error) throw error;
  return data;
}
export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };
export default async function handler(req, res) {
  setPrivateCommerceResponse(res);
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  if (!applyRateLimit(req, res, LIMITS.write)) return;
  try {
    const { user, error } = await getServerUserWithFallback(req, database());
    if (error || !user?.id) return res.status(401).json({ success: false, error: 'Please Sign In To View Or Send VIP Gifts.' });
    if (req.method === 'GET') {
      let query = database().from('vip_gifts').select('*')
        .or(`sender_id.eq.${user.id},and(recipient_id.eq.${user.id},delivered_at.not.is.null)`);
      if (req.query?.before || req.query?.beforeId) {
        const before = typeof req.query.before === 'string' ? req.query.before : '';
        const beforeId = typeof req.query.beforeId === 'string' ? req.query.beforeId : '';
        if (!/^\d{4}-\d{2}-\d{2}T[0-9Z:.+-]+$/.test(before) || !Number.isFinite(Date.parse(before)) || !UUID.test(beforeId))
          return refuse(res, 'invalid_cursor', 400);
        query = query.or(`created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId})`);
      }
      const { data: rows, error: readError } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(51);
      const gifts = (rows || []).slice(0, 50);
      const last = gifts[gifts.length - 1];
      const nextCursor = rows?.length > 50 ? { before: last.created_at, beforeId: last.id } : null;
      if (readError) throw readError;
      const ids = [...new Set((gifts || []).flatMap(g => [g.sender_id, g.recipient_id]))];
      let people = [];
      if (ids.length) {
        const result = await database().from('profiles').select('id,display_name,username').in('id', ids);
        if (result.error) throw result.error;
        people = result.data || [];
      }
      return res.status(200).json({ success: true, accountId: user.id, gifts: (gifts || []).map(g => publicGift(g, user.id)), people, nextCursor });
    }
    let gate = requireEmailVerified(user);
    if (!gate.ok && typeof user.email_confirmed_at === 'undefined') gate = await requireEmailVerifiedByUserId(database(), user.id);
    if (!gate.ok) return res.status(gate.status).json(gate.body);
    const body = req.body || {};
    if (body.action === 'redeem' || body.action === 'return') {
      if (!UUID.test(body.giftId || '')) return refuse(res, 'invalid_gift', 400);
      const { data: gift, error: readError } = await database().from('vip_gifts').select('*').eq('id', body.giftId)
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`).maybeSingle();
      if (readError) throw readError;
      if (!gift) return refuse(res, 'gift_not_found', 404);
      if (body.action === 'redeem') {
        // Verify the recipient's provider state as well as the DB mutex. A
        // delayed subscription webhook must not allow a conflicting grant.
        const profile = await database().from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle();
        if (profile.error || !profile.data) throw profile.error || new Error('Profile unavailable');
        if (profile.data.stripe_customer_id) {
          const client = provider();
          const [subscriptions, sessions] = await Promise.all([
            client.subscriptions.list({ customer: profile.data.stripe_customer_id, status: 'all', limit: 100 }),
            client.checkout.sessions.list({ customer: profile.data.stripe_customer_id, status: 'open', limit: 100 }),
          ]);
          if (subscriptions.has_more || sessions.has_more) throw new Error('VIP authority is incomplete');
          for (const sub of subscriptions.data.filter(s => BLOCKING_RECURRING_VIP_STATUSES.includes(s.status))) {
            const authority = classifyStripeSubscriptionForVip(sub);
            if (authority === STRIPE_VIP_AUTHORITY.VIP) return refuse(res, 'manage_card_subscription_first');
            if (authority === STRIPE_VIP_AUTHORITY.UNKNOWN) throw new Error('VIP authority is unknown');
          }
          for (const session of sessions.data) {
            const authority = classifyStripeCheckoutSessionForVip(session);
            if (authority === STRIPE_VIP_AUTHORITY.VIP) return refuse(res, 'manage_card_subscription_first');
            if (authority === STRIPE_VIP_AUTHORITY.UNKNOWN) throw new Error('VIP checkout authority is unknown');
          }
        }
        const result = await rpc('redeem_vip_gift_atomic', { p_user: user.id, p_gift: gift.id });
        if (!result?.success) return refuse(res, result?.error);
        return res.status(200).json({ ...result, accountId: user.id });
      }
      const card = gift.method === 'card';
      // Check provider before acquiring a return claim. Claim blocks concurrent redemption.
      const stripeClient = card ? provider() : null;
      const result = await rpc(card ? 'prepare_vip_gift_card_return' : 'return_vip_gift_atomic', { p_user: user.id, p_gift: gift.id });
      if (!result?.success) return refuse(res, result?.error);
      if (card && result.paymentIntent) {
        const refund = await stripeClient.refunds.create({ payment_intent: result.paymentIntent }, { idempotencyKey: `vip-gift-return:${gift.id}` });
        if (refund.status === 'failed' || refund.status === 'canceled') {
          // Provider-confirmed failure moved no funds. Restore the unredeemed
          // card, conditional on no concurrent refund/dispute having won.
          const restored = await database().from('vip_gifts').update({ status: 'available' })
            .eq('id', gift.id).eq('status', 'return_pending');
          if (restored.error) throw restored.error;
          return res.status(409).json({ success: false, code: 'refund_failed',
            error: 'The Card Refund Was Refused. Your Unredeemed Gift Remains Available. Refresh Gifts To Review It.' });
        }
        // Pending refunds remain locked until a successful charge.refunded event.
        if (refund.status === 'succeeded') {
          const reversed = await rpc('reverse_vip_gift_atomic', { p_gift: gift.id, p_refunded: gift.amount });
          if (!reversed?.success) throw new Error('Gift return reconciliation failed');
        }
      }
      return res.status(200).json({ success: true, accountId: user.id });
    }
    if (body.action !== 'send') return refuse(res, 'invalid_action', 400);
    const offer = vipGiftOffer(user.id, body.recipientId, body.plan, body.method, VIP_MEMBERSHIP);
    if (!sameGiftOffer(body.offerConfirmation, offer) || !/^[A-Za-z0-9._:-]{8,128}$/.test(body.requestId || ''))
      return refuse(res, 'invalid_offer', 400);
    const stripeClient = body.method === 'card' ? provider() : null;
    const result = await rpc('send_vip_gift_atomic', { p_sender: user.id, p_recipient: body.recipientId,
      p_request: body.requestId, p_plan: body.plan, p_method: body.method, p_amount: offer.amount });
    if (!result?.success) return refuse(res, result?.error);
    const gift = result.gift;
    if (gift.status !== 'pending') return res.status(200).json({ success: true, accountId: user.id, gift: publicGift(gift) });
    async function expireGift() {
      const updated = await database().from('vip_gifts').update({ status: 'expired' }).eq('id', gift.id).eq('status', 'pending');
      if (updated.error) throw updated.error;
      return res.status(200).json({ success: true, accountId: user.id, gift: publicGift({ ...gift, status: 'expired' }, user.id) });
    }
    let session;
    if (gift.session_id) {
      session = await stripeClient.checkout.sessions.retrieve(gift.session_id);
    } else {
      // Stripe idempotency uses immutable, durable parameters. Never recreate an
      // unknown session after its recovery window or after provider key retention.
      const created = Math.floor(new Date(gift.created_at).getTime() / 1000);
      if (!Number.isFinite(created)) throw new Error('Invalid gift timestamp');
      if (Date.now() / 1000 - created > 23 * 60 * 60) {
        // The create idempotency key may have expired. Read the original
        // provider operation; never create another charge path for this gift.
        let after;
        for (let page = 0; page < 5; page += 1) {
          const batch = await stripeClient.checkout.sessions.list({ created: { gte: created - 60, lte: created + 3600 }, limit: 100,
            ...(after ? { starting_after: after } : {}) });
          const matches = batch.data.filter(s => s.metadata?.type === 'vip_gift' && s.metadata?.gift_id === gift.id);
          if (matches.length > 1) throw new Error('Multiple provider gift sessions');
          if (matches.length) { session = matches[0]; break; }
          if (!batch.has_more) return expireGift();
          after = batch.data.at(-1)?.id;
          if (!after || page === 4) throw new Error('Gift checkout recovery is incomplete');
        }
      }
      const metadata = { type: 'vip_gift', gift_id: gift.id, sender_id: user.id, recipient_id: gift.recipient_id, plan: gift.plan };
      if (!session) session = await stripeClient.checkout.sessions.create({ mode: 'payment', payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'usd', unit_amount: gift.amount,
          product_data: { name: `Smarter.Poker VIP ${gift.plan[0].toUpperCase() + gift.plan.slice(1)} Gift Card` } }, quantity: 1 }],
        metadata, payment_intent_data: { metadata }, client_reference_id: gift.id,
        expires_at: created + 60 * 60,
        success_url: 'https://smarter.poker/hub/vip-membership?gift=sent#gifts',
        cancel_url: 'https://smarter.poker/hub/vip-membership?gift=canceled#gifts',
      }, { idempotencyKey: `vip-gift-checkout:${gift.id}` });
      if (session.metadata?.gift_id !== gift.id || session.metadata?.sender_id !== gift.sender_id || session.metadata?.recipient_id !== gift.recipient_id) throw new Error('Checkout identity verification failed');
      const { error: bindError } = await database().from('vip_gifts').update({ session_id: session.id, session_url: session.url })
        .eq('id', gift.id).eq('status', 'pending').is('session_id', null);
      if (bindError) throw bindError;
    }
    if (session.status === 'complete' && session.payment_status === 'paid') {
      await settleVipGift(database(), session);
      const read = await database().from('vip_gifts').select('*').eq('id', gift.id).eq('sender_id', user.id).maybeSingle();
      if (read.error || !read.data) throw read.error || new Error('Gift receipt unavailable');
      return res.status(200).json({ success: true, accountId: user.id, gift: publicGift(read.data, user.id) });
    }
    if (session.status === 'expired') return expireGift();
    if (!safeGiftCheckout(session, gift, isProductionRuntime())) return refuse(res, 'checkout_unavailable');
    return res.status(200).json({ success: true, accountId: user.id, requestId: body.requestId,
      offerConfirmation: offer, checkoutUrl: session.url, gift: publicGift(gift) });
  } catch (error) {
    console.error('[vip-gifts] Request Failed', error?.code || error?.name || 'unknown');
    return res.status(503).json({ success: false, error: 'VIP Gifts Are Temporarily Unavailable. Your Purchase Request Is Saved; Retry The Same Request.' });
  }
}
