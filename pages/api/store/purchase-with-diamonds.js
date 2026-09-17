import { createHash } from 'node:crypto';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';
import {
  exactJsonValueMatches,
  merchandiseDiamondOfferConfirmation,
} from '../../../src/lib/store/verifiedCheckoutUrl.mjs';

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
const CATALOG_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const COMMERCE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FULFILLMENT_MODES = new Set(['automatic', 'manual', 'none']);

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
  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
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

function buildRequestHash(lines, shippingAddress, offerConfirmation) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        lines,
        shippingAddress: shippingAddress || null,
        offerConfirmation,
      })
    )
    .digest('hex');
}

function buildLegacyRequestHash(lines, shippingAddress) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        lines,
        shippingAddress: shippingAddress || null,
      })
    )
    .digest('hex');
}

function normalizeLines(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_LINES) {
    return { error: 'Items must contain between 1 and 50 lines' };
  }
  const seen = new Set();
  const lines = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { error: 'Invalid merchandise item' };
    }
    const id = typeof item.id === 'string' ? item.id : '';
    const hasVariantId = Object.prototype.hasOwnProperty.call(item, 'variantId');
    const hasVariantSnake = Object.prototype.hasOwnProperty.call(item, 'variant_id');
    if (hasVariantId && hasVariantSnake && item.variantId !== item.variant_id) {
      return { error: 'Conflicting merchandise option identifiers' };
    }
    const rawVariant = hasVariantId ? item.variantId : hasVariantSnake ? item.variant_id : null;
    const variantId = rawVariant == null ? null : rawVariant;
    const hasQuantity = Object.prototype.hasOwnProperty.call(item, 'quantity');
    const hasQty = Object.prototype.hasOwnProperty.call(item, 'qty');
    if (hasQuantity && hasQty && item.quantity !== item.qty) {
      return { error: 'Conflicting merchandise quantities' };
    }
    const quantity = hasQuantity ? item.quantity : hasQty ? item.qty : 1;
    if (!CATALOG_KEY_PATTERN.test(id) || id !== id.trim()) {
      return { error: 'Invalid merchandise item' };
    }
    if (
      variantId !== null &&
      (typeof variantId !== 'string' ||
        !CATALOG_KEY_PATTERN.test(variantId) ||
        variantId !== variantId.trim())
    ) {
      return { error: 'Invalid merchandise option' };
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) {
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
  return {
    order_id: result.order_id,
    currency: 'diamonds',
    diamonds_spent: result.diamonds_spent,
    new_balance: result.new_balance,
    items_purchased: result.items.reduce((sum, item) => sum + item.quantity, 0),
    items: result.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      quantity: item.quantity,
    })),
    total_usd: result.total_usd,
    fulfillment_status: result.fulfillment_status,
    fulfillment_mode: result.fulfillment_mode,
  };
}

function normalizeSuccessfulPurchaseResult(raw, expectedLines, expectedFulfillmentMode) {
  // The installed atomic RPC predates the explicit `none` metadata value for
  // digital-only orders and therefore returns JSON null for that one branch.
  // The request already derived `expectedFulfillmentMode` from the verified
  // catalog, so normalize only the exact legacy digital response. Missing or
  // mismatched manual/automatic modes remain unverified.
  const verifiedFulfillmentMode =
    raw?.fulfillment_mode === null && expectedFulfillmentMode === 'none'
      ? 'none'
      : raw?.fulfillment_mode;
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    raw.success !== true ||
    typeof raw.duplicate !== 'boolean' ||
    !COMMERCE_UUID.test(String(raw.order_id || '')) ||
    !Number.isSafeInteger(raw.diamonds_spent) ||
    raw.diamonds_spent <= 0 ||
    !Number.isSafeInteger(raw.new_balance) ||
    raw.new_balance < 0 ||
    typeof raw.total_usd !== 'number' ||
    !Number.isFinite(raw.total_usd) ||
    raw.total_usd <= 0 ||
    verifiedFulfillmentMode !== expectedFulfillmentMode ||
    !FULFILLMENT_MODES.has(verifiedFulfillmentMode) ||
    !(
      raw.fulfillment_status === null ||
      (typeof raw.fulfillment_status === 'string' &&
        raw.fulfillment_status.trim().length > 0 &&
        raw.fulfillment_status.length <= 80)
    ) ||
    !Array.isArray(raw.items) ||
    raw.items.length !== expectedLines.length
  )
    return null;

  const expectedByIdentity = new Map(
    expectedLines.map((line) => [`${line.id}\u0000${line.variant_id || ''}`, line])
  );
  const seen = new Set();
  let totalDiamonds = 0;
  let totalUsdCents = 0;
  const items = [];
  for (const item of raw.items) {
    const variantId = item?.variantId == null ? null : item.variantId;
    const identity = `${item?.id || ''}\u0000${variantId || ''}`;
    const expected = expectedByIdentity.get(identity);
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      !expected ||
      seen.has(identity) ||
      !CATALOG_KEY_PATTERN.test(String(item.id || '')) ||
      !(
        variantId === null ||
        (typeof variantId === 'string' && CATALOG_KEY_PATTERN.test(variantId))
      ) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity !== expected.qty ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      item.name.length > 240 ||
      typeof item.priceUsd !== 'number' ||
      !Number.isFinite(item.priceUsd) ||
      item.priceUsd < 0.5 ||
      item.priceUsd > 500 ||
      !(
        item.diamondPrice === null ||
        (Number.isSafeInteger(item.diamondPrice) &&
          item.diamondPrice >= 1 &&
          item.diamondPrice <= 100000)
      ) ||
      typeof item.fulfillmentProvider !== 'string' ||
      !item.fulfillmentProvider.trim() ||
      item.fulfillmentProvider.length > 80 ||
      typeof item.madeToOrder !== 'boolean'
    )
      return null;
    seen.add(identity);
    const unitUsdCents = Math.round(item.priceUsd * 100);
    const unitDiamonds = item.diamondPrice ?? Math.ceil(item.priceUsd * 100);
    totalUsdCents += unitUsdCents * item.quantity;
    totalDiamonds += unitDiamonds * item.quantity;
    items.push({ ...item, variantId });
  }
  if (
    seen.size !== expectedByIdentity.size ||
    totalDiamonds !== raw.diamonds_spent ||
    totalUsdCents !== Math.round(raw.total_usd * 100)
  )
    return null;

  return {
    ...raw,
    items,
    fulfillment_status: raw.fulfillment_status,
    fulfillment_mode: verifiedFulfillmentMode,
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
    setPrivateCommerceResponse(res);
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
    const allowedFields = new Set(['items', 'shipping', 'offerConfirmation']);
    const unknownFields = Object.keys(req.body || {}).filter((field) => !allowedFields.has(field));
    if (unknownFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Unknown fields: ${unknownFields.join(', ')}`,
      });
    }
    const clientKey = readPurchaseKey(req);
    if (!clientKey) {
      return res.status(400).json({
        success: false,
        error: 'A valid X-Idempotency-Key header is required',
      });
    }
    const boundPurchaseResponse = (body) => ({
      ...body,
      accountId: user.id,
      requestId: clientKey,
    });

    const normalized = normalizeLines(req.body?.items);
    if (!normalized.lines) {
      return res.status(400).json(
        boundPurchaseResponse({
          success: false,
          error: normalized.error,
          code: 'INVALID_ITEMS',
        })
      );
    }

    const offerConfirmation = merchandiseDiamondOfferConfirmation(
      user.id,
      req.body?.offerConfirmation?.items
    );
    if (
      !offerConfirmation ||
      !exactJsonValueMatches(req.body?.offerConfirmation, offerConfirmation)
    ) {
      return res.status(400).json(
        boundPurchaseResponse({
          success: false,
          error: 'The Reviewed Diamond Price Could Not Be Verified. Review This Order Again.',
          code: 'OFFER_CONFIRMATION_REQUIRED',
        })
      );
    }
    const offerByIdentity = new Map(
      offerConfirmation.items.map((line) => [`${line.id}\u0000${line.variantId || ''}`, line])
    );
    const settlementLines = normalized.lines.map((line) => {
      const offerLine = offerByIdentity.get(`${line.id}\u0000${line.variant_id || ''}`);
      return offerLine && offerLine.quantity === line.qty
        ? { ...line, expected_price_diamonds: offerLine.unitDiamonds }
        : null;
    });
    if (
      settlementLines.some((line) => !line) ||
      settlementLines.length !== offerConfirmation.items.length
    ) {
      return res.status(400).json(
        boundPurchaseResponse({
          success: false,
          error: 'The Reviewed Merchandise Does Not Match This Order. Review It Again.',
          code: 'OFFER_CONFIRMATION_MISMATCH',
        })
      );
    }

    const requestedIds = [...new Set(normalized.lines.map((line) => line.id))];
    const { data: catalogRows, error: catalogError } = await supabase
      .from('merchandise_items')
      .select('id, has_variants, metadata')
      .in('id', requestedIds)
      .eq('is_active', true);
    if (catalogError) {
      console.error('[DiamondPurchase] catalog lookup failed:', catalogError.message);
      return res.status(503).json(
        boundPurchaseResponse({
          success: false,
          error: 'Could not verify merchandise',
        })
      );
    }
    if ((catalogRows || []).length !== requestedIds.length) {
      return res.status(400).json(
        boundPurchaseResponse({
          success: false,
          error: 'That item is no longer available',
          code: 'ITEM_UNAVAILABLE',
        })
      );
    }

    const catalogById = Object.fromEntries((catalogRows || []).map((row) => [row.id, row]));
    const providers = new Set(
      (catalogRows || []).map((row) => row?.metadata?.fulfillment_provider || 'manual')
    );
    const catalogProvider = providers.size === 1 ? [...providers][0] || 'manual' : 'mixed';
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
        return res.status(400).json(
          boundPurchaseResponse({
            success: false,
            error: 'Complete The Shipping Address Before Placing This Order',
            code: 'SHIPPING_ADDRESS_INCOMPLETE',
          })
        );
      }
    }

    let automaticFulfillment =
      providers.size === 1 && catalogProvider === 'printful' && isPrintfulReady();
    const variantIds = [
      ...new Set(normalized.lines.map((line) => line.variant_id).filter(Boolean)),
    ];
    const variantsById = {};
    if (automaticFulfillment && variantIds.length > 0) {
      const { data: variants, error: variantError } = await supabase
        .from('merchandise_item_variants')
        .select('id, item_id, metadata')
        .in('id', variantIds)
        .eq('is_active', true);
      if (variantError) {
        console.warn(
          '[DiamondPurchase] automatic fulfillment lookup failed:',
          variantError.message
        );
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
      : isPhysicalOrder
        ? 'manual'
        : 'none';
    const shippingAddress = recipient ? publicShippingAddress(recipient) : null;
    const requestHash = buildRequestHash(settlementLines, shippingAddress, offerConfirmation);
    const legacyRequestHash = buildLegacyRequestHash(normalized.lines, shippingAddress);
    const { data: rpcRaw, error: rpcError } = await supabase.rpc(
      'purchase_merch_with_diamonds_atomic_v2',
      {
        p_user_id: user.id,
        p_items: settlementLines,
        p_purchase_reference: purchaseReference,
        p_request_hash: requestHash,
        p_legacy_request_hash: legacyRequestHash,
        p_shipping_address: shippingAddress,
        p_fulfillment_mode: fulfillmentMode,
        p_catalog_provider: catalogProvider,
        p_expected_total_diamonds: offerConfirmation.totalDiamonds,
      }
    );
    if (rpcError) {
      console.error('[DiamondPurchase] atomic settlement failed:', rpcError.message);
      return res.status(503).json(
        boundPurchaseResponse({
          success: false,
          error: 'Diamond checkout could not be completed. No order was placed.',
        })
      );
    }

    const parsedResult = parseRpcResult(rpcRaw);
    if (!parsedResult.success) {
      const code = String(parsedResult.error || 'purchase_failed');
      const messages = {
        insufficient_diamonds: 'Insufficient diamonds',
        duplicate_lines: 'Combine duplicate merchandise options into one cart line',
        insufficient_stock:
          Number(parsedResult.available) > 0
            ? `Only ${Number(parsedResult.available)} left of that item`
            : 'That item just sold out',
        variant_required: 'Please choose a size or colour',
        variant_unavailable: 'That option is no longer available',
        variant_not_applicable: 'That item has no size or colour options',
        item_unavailable: 'That item is no longer available',
        unpriced_item: 'That item is not currently purchasable',
        price_changed: 'The Diamond price changed. Review the current total before purchasing.',
        reference_conflict: 'This purchase reference conflicts with another order',
      };
      const current = parsedResult.new_balance;
      const required = parsedResult.required_diamonds;
      return res.status(['reference_conflict', 'price_changed'].includes(code) ? 409 : 400).json(
        boundPurchaseResponse({
          success: false,
          error: messages[code] || 'Purchase could not be completed',
          code,
          ...(code === 'insufficient_diamonds'
            ? {
                details: {
                  required: Number.isSafeInteger(required) && required >= 0 ? required : null,
                  current: Number.isSafeInteger(current) && current >= 0 ? current : null,
                  shortfall:
                    Number.isSafeInteger(required) &&
                    required >= 0 &&
                    Number.isSafeInteger(current) &&
                    current >= 0
                      ? Math.max(0, required - current)
                      : null,
                },
              }
            : {}),
        })
      );
    }

    const result = normalizeSuccessfulPurchaseResult(
      parsedResult,
      settlementLines,
      fulfillmentMode
    );
    if (!result) {
      return res.status(503).json(
        boundPurchaseResponse({
          success: false,
          error: 'The Completed Purchase Could Not Be Safely Verified. Retry The Same Order.',
          code: 'PURCHASE_RESULT_UNVERIFIED',
          retryable: true,
        })
      );
    }

    if (result.duplicate && !(automaticFulfillment && result.fulfillment_status === 'submitting')) {
      return res.status(200).json({
        success: true,
        idempotent: true,
        duplicate: true,
        accountId: user.id,
        requestId: clientKey,
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
        try {
          reportApiError(fulfillmentError, req);
        } catch (_) {
          /* best effort */
        }
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
      accountId: user.id,
      requestId: clientKey,
      data: responseData({
        ...result,
        fulfillment_status: fulfillmentStatus,
        fulfillment_mode: effectiveFulfillmentMode,
      }),
    });
  } catch (error) {
    try {
      reportApiError(error, req);
    } catch (_) {
      /* best effort */
    }
    console.warn('[DiamondPurchase] Error:', error?.message || error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
