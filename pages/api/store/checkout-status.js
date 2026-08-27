import Stripe from 'stripe';

import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
  if (session.status === 'expired') return 'failed';
  if (session.payment_status === 'paid') {
    if (['completed', 'paid', 'processing', 'active'].includes(recordStatus)) return 'complete';
    return 'pending';
  }
  if (session.status === 'complete') return 'pending';
  return 'pending';
}

async function lookupRecord(session) {
  const type = session.metadata?.type;
  if (type === 'diamonds' && session.metadata?.purchase_id) {
    const { data } = await getSupabase()
      .from('diamond_purchases')
      .select('id, package_name, diamonds_amount, bonus_diamonds, price_usd, status')
      .eq('id', session.metadata.purchase_id)
      .maybeSingle();
    return data
      ? {
          status: data.status,
          label: data.package_name,
          diamonds: Number(data.diamonds_amount || 0) + Number(data.bonus_diamonds || 0),
        }
      : null;
  }

  if (type === 'merchandise' && session.metadata?.order_id) {
    const { data } = await getSupabase()
      .from('merchandise_orders')
      .select('id, status, total_usd')
      .eq('id', session.metadata.order_id)
      .maybeSingle();
    return data ? { status: data.status, label: 'Merchandise Order' } : null;
  }

  if (session.mode === 'subscription') {
    return { status: session.payment_status === 'paid' ? 'active' : 'pending', label: 'VIP Membership' };
  }

  return null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;
    if (!stripe) {
      return res.status(503).json({ success: false, error: 'Payment status is temporarily unavailable' });
    }

    const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id.trim() : '';
    if (!/^cs_(?:test_|live_)?[A-Za-z0-9]{12,}$/.test(sessionId)) {
      return res.status(400).json({ success: false, error: 'Invalid checkout reference' });
    }

    const { user, error } = await getServerUserWithFallback(req, getSupabase());
    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Sign in to verify this purchase' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.user_id !== user.id) {
      return res.status(404).json({ success: false, error: 'Checkout reference not found' });
    }

    const record = await lookupRecord(session);
    const status = publicStatus(session, record?.status);

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      success: true,
      data: {
        status,
        sessionId: session.id,
        type: session.metadata?.type || (session.mode === 'subscription' ? 'subscription' : 'purchase'),
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency || 'usd',
        label: record?.label || null,
        diamonds: record?.diamonds || null,
      },
    });
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {}
    if (err?.type === 'StripeInvalidRequestError') {
      return res.status(404).json({ success: false, error: 'Checkout reference not found' });
    }
    console.warn('[checkout-status] Error:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Could not verify checkout status' });
    }
  }
}
