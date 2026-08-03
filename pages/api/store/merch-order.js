/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GET /api/store/merch-order
 *  Returns the AUTHENTICATED CALLER'S OWN merchandise orders, with normalised
 *  line items and fulfillment status. Bearer JWT required.
 *
 *  Rows come from `merchandise_orders`, written by:
 *    pages/api/store/create-checkout-session.js  (card  → status 'pending')
 *    pages/api/store/webhooks/stripe.js          (card  → status 'processing')
 *    pages/api/store/purchase-with-diamonds.js   (💎    → status 'completed')
 *  Schema: supabase/migrations/20260803120000_merch_catalog_and_variants.sql
 *
 *  PRICE TRUST MODEL
 *    Every figure in the response is READ BACK OUT OF THE ORDER ROW. This
 *    endpoint accepts no prices, no totals and no item data from the client —
 *    the only client input is a page window and an optional order id, and the
 *    order id is always AND-ed with user_id so it can never address someone
 *    else's order.
 *
 *  Query params (all optional):
 *    id      — a single order UUID (still scoped to the caller)
 *    status  — filter to one status
 *    limit   — 1..100, default 25
 *    offset  — default 0
 *
 *  Response: { success, data: { orders: [...], count, limit, offset } }
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) console.warn('[merch-order] SUPABASE_SERVICE_ROLE_KEY missing — falling back to anon key; reads may be blocked by RLS');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const DIAMONDS_PER_DOLLAR = 100;

const ALLOWED_STATUSES = [
    'pending', 'processing', 'paid', 'completed',
    'shipped', 'delivered', 'canceled', 'cancelled',
    'failed', 'refunded'
];

// Statuses that mean "money has actually been captured".
const PAID_STATUSES = new Set(['paid', 'completed', 'processing', 'shipped', 'delivered']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isMissingTable(err) {
    if (!err) return false;
    const code = String(err.code || '');
    const msg = String(err.message || '').toLowerCase();
    return code === '42P01'
        || code === 'PGRST205'
        || code === 'PGRST106'
        || msg.includes('does not exist')
        || msg.includes('could not find the table');
}

function toNumber(v) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * Line items are stored as a JSONB snapshot at purchase time and the two writers
 * disagree on field names:
 *   create-checkout-session.js → { name, price, image, quantity }
 *   purchase-with-diamonds.js  → { id, name, priceUsd, diamondPrice, quantity }
 * Normalise both into one shape. Amounts are recomputed from the SNAPSHOT, never
 * re-priced against the live catalog — an order must show what was charged.
 */
function normalizeLineItem(raw, paidWithDiamonds) {
    const quantity = Math.max(1, parseInt(raw?.quantity, 10) || 1);
    const unitUsd = toNumber(raw?.priceUsd ?? raw?.price ?? raw?.price_usd);
    const rawUnitDiamonds = toNumber(raw?.diamondPrice ?? raw?.price_diamonds);
    const unitDiamonds = rawUnitDiamonds !== null
        ? rawUnitDiamonds
        : (paidWithDiamonds && unitUsd !== null ? Math.ceil(unitUsd * DIAMONDS_PER_DOLLAR) : null);

    return {
        item_id: raw?.id || null,
        name: typeof raw?.name === 'string' ? raw.name.slice(0, 200) : 'Item',
        sku: raw?.sku || null,
        size: raw?.size || null,
        color: raw?.color || null,
        image_url: raw?.image || raw?.image_url || null,
        quantity,
        unit_price_usd: unitUsd,
        unit_price_diamonds: unitDiamonds,
        line_total_usd: unitUsd !== null ? Math.round(unitUsd * quantity * 100) / 100 : null,
        line_total_diamonds: unitDiamonds !== null ? unitDiamonds * quantity : null
    };
}

function normalizeOrder(row) {
    const paidWithDiamonds = row?.payment_method === 'diamonds';
    const rawItems = Array.isArray(row?.items) ? row.items : [];
    const lineItems = rawItems.map(i => normalizeLineItem(i, paidWithDiamonds));
    const status = row?.status || 'pending';

    return {
        id: row?.id,
        status,
        payment_method: row?.payment_method || 'stripe',
        currency: paidWithDiamonds ? 'diamonds' : 'usd',
        is_paid: PAID_STATUSES.has(status),
        total_usd: toNumber(row?.total_usd) ?? 0,
        diamonds_spent: Number(row?.diamonds_spent) || 0,
        item_count: lineItems.reduce((sum, i) => sum + i.quantity, 0),
        items: lineItems,
        shipping_address: row?.shipping_address || null,
        tracking_number: row?.tracking_number || null,
        tracking_url: row?.tracking_url || null,
        carrier: row?.carrier || null,
        created_at: row?.created_at || null,
        updated_at: row?.updated_at || null,
        shipped_at: row?.shipped_at || null,
        delivered_at: row?.delivered_at || null
    };
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'GET') {
            res.setHeader('Allow', 'GET');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        if (!applyRateLimit(req, res, LIMITS.read)) return;

        // Auth: local HMAC verify first, GoTrue network fallback if the JWT
        // secret is missing — same path as diamond-transactions.js.
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authorization required' });
        }

        const { user } = await getServerUserWithFallback(req, getSupabase());
        if (!user?.id) {
            return res.status(401).json({ success: false, error: 'Invalid session' });
        }

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

        // SECURITY: user_id is taken from the VERIFIED token, never the query
        // string, and is applied to every branch below including the ?id lookup.
        let query = getSupabase()
            .from('merchandise_orders')
            .select(
                'id, user_id, status, payment_method, total_usd, diamonds_spent, items, ' +
                'shipping_address, tracking_number, tracking_url, carrier, ' +
                'created_at, updated_at, shipped_at, delivered_at',
                { count: 'exact' }
            )
            .eq('user_id', user.id);

        const orderId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
        if (orderId) {
            if (!UUID_RE.test(orderId)) {
                return res.status(400).json({ success: false, error: 'Invalid order id' });
            }
            query = query.eq('id', orderId);
        }

        const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
        if (statusFilter) {
            if (!ALLOWED_STATUSES.includes(statusFilter)) {
                return res.status(400).json({ success: false, error: 'Invalid status filter' });
            }
            query = query.eq('status', statusFilter);
        }

        query = query
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(offset, offset + limit - 1);

        const { data, count, error } = await query;

        if (error) {
            if (isMissingTable(error)) {
                console.warn('[merch-order] merchandise_orders missing — migration 20260803120000 not applied yet');
                res.setHeader('Cache-Control', 'private, no-store');
                return res.status(200).json({
                    success: true,
                    data: { orders: [], count: 0, total: 0, limit, offset, orders_available: false }
                });
            }
            console.warn('[merch-order] fetch failed:', error.message);
            return res.status(500).json({ success: false, error: 'Failed to fetch orders' });
        }

        const rows = Array.isArray(data) ? data : [];

        // Belt and braces: the service-role key bypasses RLS, so re-assert
        // ownership in JS before anything is serialised back to the caller.
        const orders = rows
            .filter(r => r?.user_id === user.id)
            .map(normalizeOrder);

        if (orderId && orders.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        // Order history is personal and mutates on fulfillment — never cache it
        // at a shared edge.
        res.setHeader('Cache-Control', 'private, no-store');

        return res.status(200).json({
            success: true,
            data: {
                orders,
                count: orders.length,
                total: typeof count === 'number' ? count : orders.length,
                limit,
                offset,
                orders_available: true
            }
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[merch-order] Error:', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
