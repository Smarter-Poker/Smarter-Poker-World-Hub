/**
 * Private, server-owned marketplace ledger.
 *
 * GET /api/store/order-ledger?limit=50
 * GET /api/store/order-ledger?source=merchandise&id=<order-id>
 *
 * The browser never selects commerce tables directly. Every query is scoped to
 * the verified bearer-token owner, uses an explicit column allowlist, and the
 * response excludes provider identifiers and shipping-address details.
 */
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DIAMONDS_PER_DOLLAR = 100;
const ORDER_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_CURSOR_LENGTH = 4096;
const CURSOR_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

const SOURCES = Object.freeze({
  diamonds: {
    table: 'diamond_purchases',
    ownerColumn: 'user_id',
    select:
      'id, user_id, package_name, diamonds_amount, bonus_diamonds, price_usd, status, refunded_amount_cents, refunded_diamonds, created_at, completed_at',
  },
  merchandise: {
    table: 'merchandise_orders',
    ownerColumn: 'user_id',
    select:
      'id, user_id, items, total_usd, diamonds_spent, payment_method, status, refunded_amount_cents, refunded_diamonds, refunded_at, metadata, tracking_number, tracking_url, carrier, created_at, updated_at, shipped_at, delivered_at',
  },
  vip: {
    table: 'vip_subscriptions',
    ownerColumn: 'user_id',
    select:
      'id, user_id, tier, status, price_usd, current_period_start, current_period_end, created_at, updated_at',
  },
  vip_diamonds: {
    table: 'diamond_transactions',
    ownerColumn: 'user_id',
    select: 'id, user_id, amount, transaction_type, description, reference_id, created_at',
    transactionTypes: ['vip_daily', 'vip_membership'],
  },
  club: {
    table: 'club_shop_purchases',
    ownerColumn: 'buyer_id',
    select:
      'id, buyer_id, item_id, price_paid, currency, refunded_at, created_at, club_shop_items(name, category)',
  },
});

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function toCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function safeTrackingUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch (_) {
    return null;
  }
}

function normalizeOrder(source, row) {
  if (source === 'diamonds') {
    const packageName = row?.package_name || 'Diamond Package';
    const diamonds =
      (Number(row?.diamonds_amount) || 0) + (Number(row?.bonus_diamonds) || 0);
    const amount = toCents(row?.price_usd);
    const refundAmount = Math.max(0, Number(row?.refunded_amount_cents) || 0);
    return {
      key: `diamond-${row?.id}`,
      id: row?.id,
      source,
      title: `${packageName} Diamond Package`,
      created_at: row?.created_at || row?.completed_at || null,
      status: row?.status || 'pending',
      currency: 'usd',
      amount,
      refundAmount,
      refundedDiamonds: Math.max(0, Number(row?.refunded_diamonds) || 0),
      netAmount: Math.max(0, amount - refundAmount),
      items: [
        {
          name:
            diamonds > 0
              ? `${packageName} (${diamonds.toLocaleString()} Diamonds)`
              : packageName,
          quantity: 1,
          amount,
          currency: 'usd',
        },
      ],
    };
  }

  if (source === 'vip') {
    const tier = String(row?.tier || 'VIP');
    const titleTier = tier.charAt(0).toUpperCase() + tier.slice(1);
    const amount = toCents(row?.price_usd);
    return {
      key: `vip-${row?.id}`,
      id: row?.id,
      source,
      title: `${titleTier} VIP Membership`,
      created_at: row?.created_at || row?.updated_at || null,
      status: row?.status || 'active',
      currency: 'usd',
      amount,
      recordType: 'membership_status',
      periodStart: row?.current_period_start || null,
      periodEnd: row?.current_period_end || null,
      items: [
        {
          name: `${titleTier} VIP Access`,
          quantity: 1,
          amount,
          currency: 'usd',
        },
      ],
    };
  }

  if (source === 'vip_diamonds') {
    const isDaily = row?.transaction_type === 'vip_daily';
    const amount = Math.abs(Number(row?.amount) || 0);
    return {
      key: `vip-diamonds-${row?.id}`,
      id: row?.id,
      source,
      category: 'vip',
      title: isDaily ? 'VIP Daily Pass' : 'VIP Membership',
      created_at: row?.created_at || null,
      status: 'completed',
      currency: 'diamonds',
      amount,
      netAmount: amount,
      recordType: 'settlement',
      items: [
        {
          name: row?.description || (isDaily ? '1-Day VIP Access' : 'VIP Access'),
          quantity: 1,
          amount,
          currency: 'diamonds',
        },
      ],
    };
  }

  if (source === 'club') {
    const inventorySnapshot = Array.isArray(row?.club_shop_inventory)
      ? row.club_shop_inventory[0]
      : row?.club_shop_inventory;
    const relatedItem = Array.isArray(row?.club_shop_items)
      ? row.club_shop_items[0]
      : row?.club_shop_items;
    const currency = row?.currency === 'chips' ? 'chips' : 'diamonds';
    const amount = Math.max(0, Number(row?.price_paid) || 0);
    const refunded = Boolean(row?.refunded_at);
    return {
      key: `club-${row?.id}`,
      id: row?.id,
      source,
      category: 'club',
      title: 'Club Shop Purchase',
      created_at: row?.created_at || null,
      status: refunded ? 'refunded' : 'completed',
      currency,
      amount,
      refundAmount: refunded ? amount : 0,
      netAmount: refunded ? 0 : amount,
      refundedAt: row?.refunded_at || null,
      recordType: 'settlement',
      items: [
        {
          name: inventorySnapshot?.item_name || relatedItem?.name || 'Club Shop Item',
          option: inventorySnapshot?.category || relatedItem?.category || null,
          quantity: 1,
          amount,
          currency,
        },
      ],
    };
  }

  const paidWithDiamonds = row?.payment_method === 'diamonds';
  const amount = paidWithDiamonds
    ? Number(row?.diamonds_spent) || 0
    : toCents(row?.total_usd);
  const refundAmount = paidWithDiamonds
    ? Math.max(0, Number(row?.refunded_diamonds) || 0)
    : Math.max(0, Number(row?.refunded_amount_cents) || 0);
  const items = (Array.isArray(row?.items) ? row.items : []).map((item) => {
    const quantity = Math.max(1, Number(item?.quantity) || 1);
    const unitUsd = Number(item?.price ?? item?.priceUsd) || 0;
    const unitAmount = paidWithDiamonds
      ? Number(item?.diamondPrice) || Math.ceil(unitUsd * DIAMONDS_PER_DOLLAR)
      : toCents(unitUsd);
    return {
      name: item?.name || 'Marketplace Item',
      option: item?.description || item?.variantLabel || null,
      quantity,
      amount: unitAmount * quantity,
      currency: paidWithDiamonds ? 'diamonds' : 'usd',
    };
  });

  return {
    key: `merch-${row?.id}`,
    id: row?.id,
    source,
    title: 'Merchandise Order',
    created_at: row?.created_at || row?.updated_at || null,
    status: row?.status || 'pending',
    currency: paidWithDiamonds ? 'diamonds' : 'usd',
    amount,
    refundAmount,
    netAmount: Math.max(0, amount - refundAmount),
    refundedAt: row?.refunded_at || null,
    recordType: 'settlement',
    trackingNumber: row?.tracking_number || null,
    trackingUrl: safeTrackingUrl(row?.tracking_url),
    carrier: row?.carrier || null,
    shippedAt: row?.shipped_at || row?.metadata?.shipped_at || null,
    deliveredAt: row?.delivered_at || row?.metadata?.delivered_at || null,
    fulfillmentStatus: row?.metadata?.fulfillment_status || null,
    items,
  };
}

function publicSourceLabel(source) {
  return source === 'diamonds'
    ? 'Diamond purchases'
    : source === 'merchandise'
      ? 'Merchandise orders'
      : source === 'vip' || source === 'vip_diamonds'
        ? 'VIP memberships'
        : 'Club Shop purchases';
}

function isKnownSource(source) {
  return Object.hasOwn(SOURCES, source);
}

function parseCursor(value) {
  if (!value) return {};
  if (typeof value !== 'string' || value.length > MAX_CURSOR_LENGTH) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || parsed.v !== 1 || typeof parsed.positions !== 'object') return null;
    const positions = {};
    for (const [source, position] of Object.entries(parsed.positions)) {
      if (!isKnownSource(source) || !position || !ORDER_ID_RE.test(String(position.id || ''))) {
        return null;
      }
      const createdAt = String(position.createdAt || '');
      if (!CURSOR_TIMESTAMP_RE.test(createdAt) || Number.isNaN(Date.parse(createdAt))) return null;
      // Preserve PostgreSQL's full timestamp precision. Converting through
      // Date would truncate microseconds and could skip same-millisecond rows.
      positions[source] = { createdAt, id: String(position.id) };
    }
    return positions;
  } catch (_) {
    return null;
  }
}

function encodeCursor(positions) {
  return Buffer.from(JSON.stringify({ v: 1, positions }), 'utf8').toString('base64url');
}

function applyDefinitionFilters(query, definition) {
  return definition.transactionTypes
    ? query.in('transaction_type', definition.transactionTypes)
    : query;
}

async function attachClubInventorySnapshots(rows, userId) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const purchaseIds = rows.map((row) => row?.id).filter(Boolean);
  const { data, error } = await getSupabase()
    .from('club_shop_inventory')
    .select('purchase_id, user_id, item_name, category')
    .eq('user_id', userId)
    .in('purchase_id', purchaseIds)
    .limit(purchaseIds.length);
  if (error) {
    console.warn('[order-ledger] Club inventory snapshot read failed:', error.message);
    return rows;
  }
  const snapshotByPurchase = new Map(
    (data || [])
      .filter((snapshot) => snapshot?.user_id === userId)
      .map((snapshot) => [snapshot.purchase_id, snapshot])
  );
  return rows.map((row) => ({
    ...row,
    club_shop_inventory: snapshotByPurchase.get(row.id) || null,
  }));
}

async function readOne(source, orderId, userId) {
  const definition = SOURCES[source];
  let query = getSupabase()
    .from(definition.table)
    .select(definition.select)
    .eq('id', orderId)
    .eq(definition.ownerColumn, userId);
  query = applyDefinitionFilters(query, definition);
  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  if (data?.[definition.ownerColumn] !== userId) return null;
  const [row] = source === 'club'
    ? await attachClubInventorySnapshots([data], userId)
    : [data];
  return normalizeOrder(source, row);
}

async function readSource(source, userId, limit, cursor) {
  const definition = SOURCES[source];
  let query = getSupabase()
    .from(definition.table)
    .select(definition.select)
    .eq(definition.ownerColumn, userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  query = applyDefinitionFilters(query, definition);
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }
  const { data, error } = await query.limit(limit + 1);

  if (error) return { source, rows: [], error };
  let ownedRows = (Array.isArray(data) ? data : []).filter(
    (row) => row?.[definition.ownerColumn] === userId
  );
  if (source === 'club') ownedRows = await attachClubInventorySnapshots(ownedRows, userId);
  return {
    source,
    rows: ownedRows.map((row) => ({
      order: normalizeOrder(source, row),
      source,
      createdAt: row?.created_at || null,
      rowId: String(row?.id || ''),
    })),
    error: null,
  };
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
    if (authError || !user?.id) {
      return res.status(401).json({ success: false, error: 'Authorization required' });
    }

    const rawSource = typeof req.query.source === 'string' ? req.query.source.trim() : '';
    const rawOrderId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    if ((rawSource && !rawOrderId) || (!rawSource && rawOrderId)) {
      return res.status(400).json({ success: false, error: 'Order source and id are both required' });
    }

    if (rawSource && rawOrderId) {
      if (!isKnownSource(rawSource) || !ORDER_ID_RE.test(rawOrderId)) {
        return res.status(400).json({ success: false, error: 'Invalid receipt reference' });
      }
      const order = await readOne(rawSource, rawOrderId, user.id);
      if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
      return res.status(200).json({ success: true, data: { order } });
    }

    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Math.min(
      Math.max(Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );
    const cursorPositions = parseCursor(
      typeof req.query.cursor === 'string' ? req.query.cursor.trim() : ''
    );
    if (cursorPositions === null) {
      return res.status(400).json({ success: false, error: 'Invalid ledger cursor' });
    }
    const results = await Promise.all(
      Object.keys(SOURCES).map((source) =>
        readSource(source, user.id, limit, cursorPositions[source] || null)
      )
    );
    const available = results.filter((result) => !result.error);
    const unavailable = results.filter((result) => result.error);

    unavailable.forEach((result) => {
      console.warn(`[order-ledger] ${result.source} read failed:`, result.error?.message || result.error);
    });
    if (available.length === 0) {
      return res.status(503).json({ success: false, error: 'Marketplace ledger is temporarily unavailable' });
    }

    const merged = available
      .flatMap((result) => result.rows)
      .sort(
        (a, b) =>
          String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')) ||
          String(b?.order?.key || '').localeCompare(String(a?.order?.key || ''))
      );
    const selected = merged.slice(0, limit);
    const orders = selected.map((entry) => entry.order);
    const nextPositions = { ...cursorPositions };
    selected.forEach((entry) => {
      nextPositions[entry.source] = { createdAt: entry.createdAt, id: entry.rowId };
    });
    const hasMore =
      merged.length > limit || available.some((result) => result.rows.length > limit);

    return res.status(200).json({
      success: true,
      data: {
        orders,
        returned: orders.length,
        limit,
        hasMore,
        nextCursor: hasMore ? encodeCursor(nextPositions) : null,
        partial: unavailable.length > 0,
        unavailableSources: [
          ...new Set(unavailable.map((result) => publicSourceLabel(result.source))),
        ],
      },
    });
  } catch (error) {
    try {
      reportApiError(error, req);
    } catch (_) {
      // Telemetry must not replace the commerce response.
    }
    console.warn('[order-ledger] failed:', error?.message || error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Could not read marketplace ledger' });
    }
  }
}
