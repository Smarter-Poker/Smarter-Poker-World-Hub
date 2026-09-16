import { createHash } from 'node:crypto';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['mark_processing', 'mark_shipped', 'mark_delivered', 'refund']);

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Store operations database is not configured');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function safeHttpsUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.toString().slice(0, 500) : null;
  } catch (_) {
    return null;
  }
}

async function requireOperator(req, res, supabase) {
  if (!req.headers?.authorization?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authorization required' });
    return null;
  }
  const { user, error } = await getServerUserWithFallback(req, supabase);
  if (error || !user?.id) {
    res.status(401).json({ success: false, error: 'Invalid session' });
    return null;
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || profile?.is_admin !== true) {
    res.status(403).json({ success: false, error: 'Store operator access required' });
    return null;
  }
  return user;
}

export default async function handler(req, res) {
  try {
    setPrivateCommerceResponse(res);
    if (!['GET', 'PATCH'].includes(req.method)) {
      res.setHeader('Allow', 'GET, PATCH');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;

    const supabase = getSupabase();
    const operator = await requireOperator(req, res, supabase);
    if (!operator) return;

    if (req.method === 'GET') {
      const rawLimit = Number(req.query?.limit || 50);
      const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
      const cursor = typeof req.query?.cursor === 'string' ? req.query.cursor.trim() : '';
      if (cursor && (cursor.length > 64 || Number.isNaN(Date.parse(cursor)))) {
        return res.status(400).json({ success: false, error: 'Invalid queue cursor' });
      }
      let query = supabase
        .from('merchandise_orders')
        .select(
          'id, user_id, items, total_usd, diamonds_spent, refunded_diamonds, payment_method, status, '
          + 'shipping_address, tracking_number, tracking_url, carrier, metadata, created_at, updated_at, '
          + 'shipped_at, delivered_at, fulfillment_version'
        )
        .in('status', ['paid', 'processing', 'shipped'])
        .or('metadata->>fulfillment_mode.eq.manual,metadata->>needs_review.eq.true')
        .order('created_at', { ascending: false });
      if (cursor) query = query.lt('created_at', cursor);
      const { data, error } = await query.limit(limit + 1);
      if (error) throw error;
      const rows = data || [];
      const hasMore = rows.length > limit;
      const orders = rows.slice(0, limit);
      return res.status(200).json({
        success: true,
        data: {
          orders,
          nextCursor: hasMore ? orders[orders.length - 1]?.created_at || null : null,
        },
      });
    }

    if (Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8') > 4096) {
      return res.status(413).json({ success: false, error: 'Request body too large' });
    }
    const allowed = new Set([
      'orderId', 'expectedVersion', 'action', 'trackingNumber', 'trackingUrl', 'carrier',
    ]);
    const unknown = Object.keys(req.body || {}).filter((key) => !allowed.has(key));
    if (unknown.length) {
      return res.status(400).json({ success: false, error: `Unknown fields: ${unknown.join(', ')}` });
    }

    const orderId = String(req.body?.orderId || '');
    const action = String(req.body?.action || '');
    const expectedVersion = Number(req.body?.expectedVersion);
    if (!UUID_RE.test(orderId) || !ACTIONS.has(action) || !Number.isInteger(expectedVersion)) {
      return res.status(400).json({ success: false, error: 'Invalid fulfillment operation' });
    }

    let result;
    let error;
    if (action === 'refund') {
      const reference = `merch-refund:${orderId}:${createHash('sha256')
        .update(orderId)
        .digest('hex')
        .slice(0, 24)}`;
      ({ data: result, error } = await supabase.rpc('refund_diamond_merch_order_atomic_v2', {
        p_order_id: orderId,
        p_actor_id: operator.id,
        p_expected_version: expectedVersion,
        p_reference_id: reference,
      }));
    } else {
      const trackingNumber = req.body?.trackingNumber
        ? String(req.body.trackingNumber).trim().slice(0, 160)
        : null;
      const trackingUrl = req.body?.trackingUrl ? safeHttpsUrl(req.body.trackingUrl) : null;
      if (req.body?.trackingUrl && !trackingUrl) {
        return res.status(400).json({ success: false, error: 'Tracking URL must use HTTPS' });
      }
      ({ data: result, error } = await supabase.rpc('transition_merchandise_fulfillment', {
        p_order_id: orderId,
        p_actor_id: operator.id,
        p_expected_version: expectedVersion,
        p_action: action,
        p_tracking_number: trackingNumber,
        p_tracking_url: trackingUrl,
        p_carrier: req.body?.carrier ? String(req.body.carrier).trim().slice(0, 100) : null,
      }));
    }
    if (error) throw error;
    if (!result?.success) {
      const status = result?.error === 'version_conflict' ? 409 : 400;
      return res.status(status).json({ success: false, error: result?.error || 'Operation failed', data: result });
    }
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    try { reportApiError(error, req); } catch (_) { /* best effort */ }
    console.warn('[fulfillment-operations]', error?.message || error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Store operation failed' });
    }
  }
}
