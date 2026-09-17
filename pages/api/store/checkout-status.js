import Stripe from 'stripe';

import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
const { inspectStripeRuntime } = require('../../../src/lib/store/stripeRuntimeMode');

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Checkout status database is not configured');
    _supabase = createClient(url, key);
  }
  return _supabase;
}
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      timeout: 15000,
      maxNetworkRetries: 2,
      telemetry: false,
    })
  : null;

function publicStatus(session, recordStatus) {
  if (session.payment_status === 'paid') {
    if (['completed', 'paid', 'processing', 'active'].includes(recordStatus)) return 'complete';
    return 'pending';
  }
  if (session.status === 'expired') return 'failed';
  if (session.status === 'complete') return 'pending';
  return 'pending';
}

function normalizedCartSnapshot(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((line) => {
    const kind = line?.kind;
    if (!['diamonds', 'merchandise'].includes(kind)) return [];
    const id = String(line?.id || '').trim();
    const quantity = Number(line?.quantity);
    if (!id || id.length > 128 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return [];
    }
    const variantId = line?.variantId == null ? null : String(line.variantId).trim();
    if (variantId && variantId.length > 128) return [];
    return [{ kind, id, variantId: variantId || null, quantity }];
  });
}

async function lookupRecord(session, userId) {
  const type = session.metadata?.type;
  if (type === 'diamonds' && session.metadata?.purchase_id) {
    const [purchaseResult, profileResult] = await Promise.all([
      getSupabase()
        .from('diamond_purchases')
        .select(
          'id, user_id, package_name, diamonds_amount, bonus_diamonds, price_usd, status, stripe_checkout_session_id, metadata'
        )
        .eq('id', session.metadata.purchase_id)
        .eq('user_id', userId)
        .eq('stripe_checkout_session_id', session.id)
        .maybeSingle(),
      getSupabase().from('profiles').select('diamonds').eq('id', userId).maybeSingle(),
    ]);
    const { data, error } = purchaseResult;
    if (error) throw error;
    if (profileResult.error) throw profileResult.error;
    const redemptionIntent = data?.metadata?.redemption_intent || null;
    const redemptionResult = data?.metadata?.redemption_result || null;
    const isClubShop = redemptionIntent?.kind === 'club_shop';
    const rawWalletBalance = profileResult.data?.diamonds;
    const walletBalance =
      profileResult.data &&
      rawWalletBalance !== null &&
      rawWalletBalance !== '' &&
      Number.isSafeInteger(Number(rawWalletBalance))
        ? Number(rawWalletBalance)
        : null;
    return data
      ? {
          status: data.status,
          orderId: data.id,
          orderSource: 'diamonds',
          label: isClubShop
            ? redemptionIntent?.item_name || redemptionResult?.item_name || 'Club Shop Item'
            : data.package_name,
          diamonds: Number(data.diamonds_amount || 0) + Number(data.bonus_diamonds || 0),
          walletBalance,
          purchaseKind: isClubShop ? 'club_shop' : 'diamonds',
          itemId: isClubShop ? redemptionIntent?.item_id || null : null,
          redemptionStatus: data.metadata?.redemption_status || null,
          redemptionError: data.metadata?.redemption_error || null,
          cartItems: normalizedCartSnapshot(data.metadata?.cart_snapshot),
        }
      : null;
  }

  if (type === 'merchandise' && session.metadata?.order_id) {
    const { data, error } = await getSupabase()
      .from('merchandise_orders')
      .select('id, user_id, status, total_usd, items, stripe_checkout_session_id, metadata')
      .eq('id', session.metadata.order_id)
      .eq('user_id', userId)
      .eq('stripe_checkout_session_id', session.id)
      .maybeSingle();
    if (error) throw error;
    return data
      ? {
          status: data.status,
          orderId: data.id,
          orderSource: 'merchandise',
          label: 'Merchandise Order',
          cartItems: normalizedCartSnapshot(
            data.metadata?.cart_snapshot ||
              (Array.isArray(data.items) ? data.items : []).map((item) => ({
                kind: 'merchandise',
                id: item?.id,
                variantId: item?.variantId || item?.variant_id || null,
                quantity: item?.quantity,
              }))
          ),
        }
      : null;
  }

  if (type === 'vip_lifetime' && session.metadata?.purchase_id) {
    const { data, error } = await getSupabase()
      .from('vip_lifetime_purchases')
      .select('id, user_id, status, price_usd, stripe_checkout_session_id')
      .eq('id', session.metadata.purchase_id)
      .eq('user_id', userId)
      .eq('stripe_checkout_session_id', session.id)
      .maybeSingle();
    if (error) throw error;
    return data
      ? {
          status: data.status,
          orderId: data.id,
          orderSource: 'vip',
          label: 'Lifetime VIP Membership',
          cartItems: [],
        }
      : null;
  }

  if (session.mode === 'subscription') {
    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (!subscriptionId) return null;
    const { data, error } = await getSupabase()
      .from('vip_subscriptions')
      .select('id, user_id, tier, status, stripe_subscription_id')
      .eq('user_id', userId)
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();
    if (error) throw error;
    return data
      ? {
          status: data.status,
          orderId: data.id,
          orderSource: 'vip',
          label: 'VIP Membership',
          cartItems: [],
        }
      : null;
  }

  return null;
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Authorization');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;
    const { user, error } = await getServerUserWithFallback(req, getSupabase());
    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Sign in to verify this purchase' });
    }
    const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id.trim() : '';
    if (!/^cs_(?:test|live)_[A-Za-z0-9]{6,255}$/.test(sessionId)) {
      return res.status(400).json({ success: false, error: 'Invalid checkout reference' });
    }
    const stripeRuntime = inspectStripeRuntime(process.env, { requirePublishable: false });
    if (!stripe || !stripeRuntime.ready) {
      return res
        .status(503)
        .json({ success: false, error: 'Payment status is temporarily unavailable' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.user_id !== user.id) {
      return res.status(404).json({ success: false, error: 'Checkout reference not found' });
    }

    const record = await lookupRecord(session, user.id);
    const status = publicStatus(session, record?.status);

    return res.status(200).json({
      success: true,
      data: {
        status,
        sessionId: session.id,
        accountId: user.id,
        type:
          session.metadata?.type || (session.mode === 'subscription' ? 'subscription' : 'purchase'),
        paymentStatus: session.payment_status,
        sessionStatus: session.status,
        amountTotal: session.amount_total,
        currency: session.currency || 'usd',
        label: record?.label || null,
        purchaseKind: record?.purchaseKind || null,
        itemId: record?.itemId || null,
        diamonds: record?.diamonds || null,
        walletBalance: Number.isFinite(record?.walletBalance) ? record.walletBalance : null,
        redemptionStatus: record?.redemptionStatus || null,
        redemptionError: record?.redemptionError || null,
        requestId: session.metadata?.checkout_request_id || null,
        orderId: record?.orderId || null,
        orderSource: record?.orderSource || null,
        cartItems: record?.cartItems || [],
      },
    });
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (reportingError) {
      console.warn(
        '[checkout-status] Error reporting failed:',
        reportingError?.message || reportingError
      );
    }
    if (err?.type === 'StripeInvalidRequestError') {
      return res.status(404).json({ success: false, error: 'Checkout reference not found' });
    }
    console.warn('[checkout-status] Error:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Could not verify checkout status' });
    }
  }
}
