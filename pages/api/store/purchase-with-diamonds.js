import { createHash } from 'node:crypto';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';

const {
  requireEmailVerified,
  requireEmailVerifiedByUserId,
} = require('../../../src/lib/emailVerifiedGate');
const {
  buildPrintfulItems,
  createPrintfulOrder,
  isAutoConfirmEnabled,
  isPrintfulReady,
  normalizePrintfulRecipient,
  publicShippingAddress,
  resolvePrintfulMapping,
  sanitizeExternalOrderId,
} = require('../../../src/lib/store/printfulFulfillment');

const MAX_BODY_BYTES = 64 * 1024;
const MAX_LINES = 50;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{12,180}$/;

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function parseRpcResult(value) {
  if (typeof value !== 'string') return value || {};
  try { return JSON.parse(value); } catch (_) { return {}; }
}

function readPurchaseKey(req) {
  const raw = req.headers?.['x-idempotency-key'];
  if (typeof raw !== 'string' || !KEY_PATTERN.test(raw.trim())) return null;
  return raw.trim();
}

function buildPurchaseReference(userId, clientKey) {
  // Keep the legacy 20-character fingerprint so retries of orders committed
  // immediately before this release still find their metadata reference.
  const fingerprint = createHash('sha256').update(clientKey).digest('hex').slice(0, 20);
  return `merch_${userId}_${fingerprint}`;
}

function buildRequestHash(lines, shippingAddress) {
  return createHash('sha256').update(JSON.stringify({
    lines,
    shippingAddress: shippingAddress || null,
  })).digest('hex');
}

function normalizeLines(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_LINES) {
    return { error: 'Items must contain between 1 and 50 lines' };
  }
  const seen = new Set();
  const lines = [];
  for (const item of items) {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    const rawVariant = item?.variantId ?? item?.variant_id ?? null;
    const variantId = typeof rawVariant === 'string' && rawVariant.trim()
      ? rawVariant.trim()
      : null;
    const quantity = Number(item?.quantity ?? item?.qty ?? 1);
    if (!id || id.length > 160) return { error: 'Invalid merchandise item' };
    if (variantId && variantId.length > 100) return { error: 'Invalid merchandise option' };
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return { error: 'Quantity must be a whole number from 1 to 10' };
    }
    const identity = `${id}\u0000${variantId || ''}`;
    if (seen.has(identity)) {
      return { error: 'Combine duplicate merchandise options into one cart line' };
    }
    seen.add(identity);
    lines.push({ id, variant_id: variantId, qty: quantity });
  }
  return { lines };
}

function responseData(result) {
  const items = Array.isArray(result?.items) ? result.items : [];
  return {
    order_id: result?.order_id,
    diamonds_spent: Number(result?.diamonds_spent) || 0,
    new_balance: Number.isFinite(Number(result?.new_balance)) ? Number(result.new_balance) : null,
    items_purchased: items.reduce(
      (sum, item) => sum + Math.max(0, Number(item?.quantity) || 0),
      0
    ),
    total_usd: Number(result?.total_usd) || 0,
    fulfillment_status: result?.fulfillment_status || null,
    fulfillment_mode: result?.fulfillment_mode || null,
  };
}

async function recordFulfillmentState(orderId, update) {
  const { data, error } = await getSupabase()
    .from('merchandise_orders')
    .update(update)
    .eq('id', orderId)
    .select('id');
  if (error || !data?.length) {
    throw error || new Error('Provider state update matched zero orders');
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    if (!req.headers?.authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authorization required' });
    }

    const supabase = getSupabase();
    const { user, error: authError } = await getServerUserWithFallback(req, supabase);
    if (authError || !user?.id) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    let emailGate = requireEmailVerified(user);
    if (!emailGate.ok && typeof user.email_confirmed_at === 'undefined') {
      emailGate = await requireEmailVerifiedByUserId(supabase, user.id);
    }
    if (!emailGate.ok) return res.status(emailGate.status).json(emailGate.body);

    if (Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8') > MAX_BODY_BYTES) {
      return res.status(413).json({ success: false, error: 'Request body too large' });
    }
    const clientKey = readPurchaseKey(req);
    if (!clientKey) {
      return res.status(400).json({
        success: false,
        error: 'A valid X-Idempotency-Key header is required',
      });
    }

    const normalized = normalizeLines(req.body?.items);
    if (!normalized.lines) {
      return res.status(400).json({ success: false, error: normalized.error });
    }

    const requestedIds = [...new Set(normalized.lines.map((line) => line.id))];
    const { data: catalogRows, error: catalogError } = await supabase
      .from('merchandise_items')
      .select('id, has_variants, metadata')
      .in('id', requestedIds)
      .eq('is_active', true);
    if (catalogError) {
      console.error('[DiamondPurchase] catalog lookup failed:', catalogError.message);
      return res.status(503).json({ success: false, error: 'Could not verify merchandise' });
    }
    if ((catalogRows || []).length !== requestedIds.length) {
      return res.status(400).json({ success: false, error: 'That item is no longer available' });
    }

    const catalogById = Object.fromEntries((catalogRows || []).map((row) => [row.id, row]));
    const providers = new Set((catalogRows || []).map(
      (row) => row?.metadata?.fulfillment_provider || 'manual'
    ));
    const catalogProvider = providers.size === 1 ? ([...providers][0] || 'manual') : 'mixed';
    const isPhysicalOrder = [...providers].some((provider) => provider !== 'digital');

    let recipient = null;
    if (isPhysicalOrder) {
      try {
        const shipping = req.body?.shipping || {};
        recipient = normalizePrintfulRecipient({
          name: shipping.name,
          address1: shipping.line1,
          address2: shipping.line2,
          city: shipping.city,
          state_code: shipping.state,
          zip: shipping.postalCode,
          country_code: shipping.country,
          email: user.email,
        });
      } catch (_) {
        return res.status(400).json({
          success: false,
          error: 'Complete The Shipping Address Before Placing This Order',
          code: 'SHIPPING_ADDRESS_INCOMPLETE',
        });
      }
    }

    let automaticFulfillment = providers.size === 1
      && catalogProvider === 'printful'
      && isPrintfulReady();
    const variantIds = [...new Set(normalized.lines.map((line) => line.variant_id).filter(Boolean))];
    const variantsById = {};
    if (automaticFulfillment && variantIds.length > 0) {
      const { data: variants, error: variantError } = await supabase
        .from('merchandise_item_variants')
        .select('id, item_id, metadata')
        .in('id', variantIds)
        .eq('is_active', true);
      if (variantError) {
        console.warn('[DiamondPurchase] automatic fulfillment lookup failed:', variantError.message);
        automaticFulfillment = false;
      } else {
        for (const variant of variants || []) variantsById[variant.id] = variant;
      }
    }

    const providerMappings = {};
    if (automaticFulfillment) {
      for (const line of normalized.lines) {
        const catalog = catalogById[line.id];
        const variant = line.variant_id ? variantsById[line.variant_id] : null;
        const mapping = catalog?.has_variants
          ? resolvePrintfulMapping(null, variant?.metadata)
          : resolvePrintfulMapping(catalog?.metadata, null);
        if (!mapping || (line.variant_id && variant?.item_id !== line.id)) {
          automaticFulfillment = false;
          break;
        }
        providerMappings[`${line.id}\u0000${line.variant_id || ''}`] = mapping;
      }
    }

    const purchaseReference = buildPurchaseReference(user.id, clientKey);
    const fulfillmentMode = automaticFulfillment
      ? 'automatic'
      : isPhysicalOrder ? 'manual' : 'none';
    const shippingAddress = recipient ? publicShippingAddress(recipient) : null;
    const requestHash = buildRequestHash(normalized.lines, shippingAddress);
    const { data: rpcRaw, error: rpcError } = await supabase.rpc(
      'purchase_merch_with_diamonds_atomic',
      {
        p_user_id: user.id,
        p_items: normalized.lines,
        p_purchase_reference: purchaseReference,
        p_request_hash: requestHash,
        p_shipping_address: shippingAddress,
        p_fulfillment_mode: fulfillmentMode,
        p_catalog_provider: catalogProvider,
      }
    );
    if (rpcError) {
      console.error('[DiamondPurchase] atomic settlement failed:', rpcError.message);
      return res.status(503).json({
        success: false,
        error: 'Diamond checkout could not be completed. No order was placed.',
      });
    }

    const result = parseRpcResult(rpcRaw);
    if (!result.success) {
      const code = String(result.error || 'purchase_failed');
      const messages = {
        insufficient_diamonds: 'Insufficient diamonds',
        duplicate_lines: 'Combine duplicate merchandise options into one cart line',
        insufficient_stock: Number(result.available) > 0
          ? `Only ${Number(result.available)} left of that item`
          : 'That item just sold out',
        variant_required: 'Please choose a size or colour',
        variant_unavailable: 'That option is no longer available',
        variant_not_applicable: 'That item has no size or colour options',
        item_unavailable: 'That item is no longer available',
        unpriced_item: 'That item is not currently purchasable',
        reference_conflict: 'This purchase reference conflicts with another order',
      };
      const current = Number(result.new_balance);
      const required = Number(result.required_diamonds);
      return res.status(code === 'reference_conflict' ? 409 : 400).json({
        success: false,
        error: messages[code] || 'Purchase could not be completed',
        code,
        ...(code === 'insufficient_diamonds' ? {
          details: {
            required: Number.isFinite(required) ? required : null,
            current: Number.isFinite(current) ? current : null,
            shortfall: Number.isFinite(required) && Number.isFinite(current)
              ? Math.max(0, required - current)
              : null,
          },
        } : {}),
      });
    }

    if (result.duplicate
        && !(automaticFulfillment && result.fulfillment_status === 'submitting')) {
      return res.status(200).json({
        success: true,
        idempotent: true,
        duplicate: true,
        data: responseData(result),
      });
    }

    let fulfillmentStatus = result.fulfillment_status || null;
    let effectiveFulfillmentMode = fulfillmentMode;
    if (automaticFulfillment) {
      let providerOrder = null;
      try {
        const providerItems = (result.items || []).map((item) => ({
          ...item,
          providerVariant: providerMappings[`${item.id}\u0000${item.variantId || ''}`],
        }));
        providerOrder = await createPrintfulOrder({
          orderId: result.order_id,
          recipient,
          items: buildPrintfulItems(providerItems),
          confirm: isAutoConfirmEnabled(),
        });
        fulfillmentStatus = String(providerOrder?.status || 'submitted').slice(0, 80);
        await recordFulfillmentState(result.order_id, {
          status: 'processing',
          metadata: {
            purchase_reference: purchaseReference,
            request_hash: requestHash,
            fulfillment_provider: catalogProvider,
            catalog_provider: catalogProvider,
            fulfillment_mode: 'automatic',
            fulfillment_status: fulfillmentStatus,
            printful_order_id: providerOrder?.id ? String(providerOrder.id).slice(0, 80) : null,
            printful_external_id: sanitizeExternalOrderId(result.order_id),
            needs_review: false,
            submitted_at: new Date().toISOString(),
          },
        });
      } catch (fulfillmentError) {
        try { reportApiError(fulfillmentError, req); } catch (_) { /* best effort */ }
        // A network error can mean Printful accepted the immutable external
        // id but our response was lost. Keep this in an automatic/unknown
        // quarantine; never expose it as manually shippable or refundable
        // until provider reconciliation proves that no provider order exists.
        effectiveFulfillmentMode = 'automatic';
        fulfillmentStatus = 'provider_unknown';
        await recordFulfillmentState(result.order_id, {
          status: 'paid',
          metadata: {
            purchase_reference: purchaseReference,
            request_hash: requestHash,
            fulfillment_provider: catalogProvider,
            catalog_provider: catalogProvider,
            fulfillment_mode: 'automatic',
            fulfillment_status: fulfillmentStatus,
            printful_order_id: providerOrder?.id ? String(providerOrder.id).slice(0, 80) : null,
            printful_external_id: sanitizeExternalOrderId(result.order_id),
            needs_review: true,
            reason: providerOrder
              ? 'printful_provider_state_persistence_failed'
              : 'printful_submission_state_unknown',
            failure_code: String(fulfillmentError?.code || 'PRINTFUL_REQUEST_FAILED').slice(0, 80),
            flagged_at: new Date().toISOString(),
          },
        });
      }
    }

    return res.status(200).json({
      success: true,
      idempotent: result.duplicate === true,
      duplicate: result.duplicate === true,
      data: responseData({
        ...result,
        fulfillment_status: fulfillmentStatus,
        fulfillment_mode: effectiveFulfillmentMode,
      }),
    });
  } catch (error) {
    try { reportApiError(error, req); } catch (_) { /* best effort */ }
    console.warn('[DiamondPurchase] Error:', error?.message || error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
