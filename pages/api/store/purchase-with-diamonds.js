import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Purchase With Diamonds
 * POST /api/store/purchase-with-diamonds
 * Deducts diamonds from user's balance for cart purchases
 * Conversion rate: $1 USD = 100 💎
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const {
  requireEmailVerified,
  requireEmailVerifiedByUserId,
} = require('../../../src/lib/emailVerifiedGate');
import { reportApiError } from '../../../src/lib/sentryWrap';
import { createHash } from 'node:crypto';
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

/**
 * Window in which an identical cart from the same user collapses to a single
 * charge. Long enough to absorb a double-click or an offline retry, short
 * enough that a deliberate repeat purchase is not blocked.
 */
const IDEMPOTENCY_WINDOW_MS = 60_000;

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
      console.warn(
        '[purchase-with-diamonds] SUPABASE_SERVICE_ROLE_KEY missing — falling back to anon key; writes may be silently blocked by RLS'
      );
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const DIAMONDS_PER_DOLLAR = 100;

// Same sanity bands enforced by create-checkout-session.js for client-priced
// (non-catalog) items — without these a client could buy merch for ~1 diamond.
const MIN_ITEM_PRICE_USD = 0.5;
const MAX_SINGLE_ITEM_USD = 500;
const MAX_ORDER_TOTAL_USD = 2000;

async function findCompletedDiamondMerchOrder(userId, purchaseReference) {
  if (!purchaseReference) return null;
  const { data, error } = await getSupabase()
    .from('merchandise_orders')
    .select('id, items, diamonds_spent, total_usd, status, metadata, created_at')
    .eq('user_id', userId)
    .eq('payment_method', 'diamonds')
    .in('status', ['processing', 'paid', 'completed', 'shipped', 'delivered'])
    .contains('metadata', { purchase_reference: purchaseReference })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[DiamondPurchase] Could not inspect an idempotent order:', error.message);
    return null;
  }
  return data || null;
}

function replayPurchaseResponse(order, newBalance = null) {
  return {
    success: true,
    idempotent: true,
    duplicate: true,
    data: {
      order_id: order.id,
      diamonds_spent: Number(order.diamonds_spent) || 0,
      new_balance: typeof newBalance === 'number' ? newBalance : null,
      items_purchased: Array.isArray(order.items) ? order.items.length : 0,
      total_usd: Number(order.total_usd) || 0,
      fulfillment_status: order?.metadata?.fulfillment_status || order.status || null,
    },
  };
}

export default async function handler(req, res) {
  try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Hoisted so the catch below can hand reserved stock back. Declared at
    // this scope on purpose: a `const` inside the try is invisible to the
    // catch, so an exception thrown after the reservation — anywhere between
    // the stock decrement and the response — would silently consume
    // inventory that was never sold. diamond-transfer.js carries the same
    // hoist for its compensating refund, for exactly this reason.
    let releaseReservedStock = null;

    try {
      // Authenticate
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Authorization required' });
      }

      const token = authHeader.replace('Bearer ', '');
      const { user: authUser, error: authErr } = await getServerUserWithFallback(
        req,
        getSupabase()
      );
      const authData = { user: authUser };
      const user = authData?.user;

      if (authErr || !user) {
        return res.status(401).json({ success: false, error: 'Invalid session' });
      }

      // [Phase 6.1.12] Email must be verified before chip/diamond purchases.
      //
      // The fast local-JWT path in serverAuth returns { id, email, role, aud }
      // with NO email_confirmed_at, and the synchronous gate 403s when that
      // field is absent — so whenever SUPABASE_JWT_SECRET is set this gate
      // rejected EVERY caller and diamond merch checkout was entirely dead.
      // purchase-daily-vip.js and purchase-vip-with-diamonds.js both carry
      // this same fallback; this endpoint was the one that never got it.
      let emailGate = requireEmailVerified(user);
      if (!emailGate.ok && typeof user.email_confirmed_at === 'undefined') {
        emailGate = await requireEmailVerifiedByUserId(getSupabase(), user.id);
      }
      if (!emailGate.ok) return res.status(emailGate.status).json(emailGate.body);

      const { items, shipping } = req.body || {};

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Items array required' });
      }

      // The UI keeps this key stable across a lost response/retry. Look for a
      // completed order before touching stock or the wallet, then use the same
      // reference on the ledger debit below. This turns "the order succeeded
      // but the response disappeared" into a truthful replay instead of an
      // alarming duplicate-reference error.
      const clientIdempotencyKey = String(req.headers['x-idempotency-key'] || '').trim();
      const stableRequestFingerprint = /^[a-zA-Z0-9:_-]{12,180}$/.test(clientIdempotencyKey)
        ? createHash('sha256').update(clientIdempotencyKey).digest('hex').slice(0, 20)
        : null;
      const explicitPurchaseRef = stableRequestFingerprint
        ? `merch_${user.id}_${stableRequestFingerprint}`
        : null;
      if (explicitPurchaseRef) {
        const existingOrder = await findCompletedDiamondMerchOrder(user.id, explicitPurchaseRef);
        if (existingOrder) {
          return res.status(200).json(replayPurchaseResponse(existingOrder));
        }
      }

      const requestedIds = [...new Set(items.map((item) => item?.id).filter(Boolean))];
      let requestedCatalog = [];
      if (requestedIds.length > 0) {
        const { data, error: catalogMetadataError } = await getSupabase()
          .from('merchandise_items')
          .select('id, has_variants, metadata')
          .in('id', requestedIds);
        if (catalogMetadataError) {
          console.error(
            '[DiamondPurchase] fulfillment metadata lookup failed:',
            catalogMetadataError.message
          );
          return res.status(503).json({ success: false, error: 'Could not verify fulfillment' });
        }
        requestedCatalog = data || [];
      }

      const printfulCatalog = requestedCatalog.filter(
        (row) => row?.metadata?.fulfillment_provider === 'printful'
      );
      const isPrintfulOrder = printfulCatalog.length > 0;
      if (isPrintfulOrder && printfulCatalog.length !== requestedIds.length) {
        return res.status(400).json({
          success: false,
          error: 'Made-To-Order Items Must Be Purchased Separately',
          code: 'MIXED_FULFILLMENT_NOT_SUPPORTED',
        });
      }

      let shippingRecipient = null;
      if (isPrintfulOrder) {
        if (!isPrintfulReady()) {
          return res.status(503).json({
            success: false,
            error: 'Made-To-Order Fulfillment Is Being Configured. No Diamonds Were Deducted.',
            code: 'FULFILLMENT_NOT_CONFIGURED',
          });
        }
        try {
          shippingRecipient = normalizePrintfulRecipient({
            name: shipping?.name,
            address1: shipping?.line1,
            address2: shipping?.line2,
            city: shipping?.city,
            state_code: shipping?.state,
            zip: shipping?.postalCode,
            country_code: shipping?.country,
          });
        } catch (_) {
          return res.status(400).json({
            success: false,
            error: 'Complete The Shipping Address Before Placing This Order',
            code: 'SHIPPING_ADDRESS_INCOMPLETE',
          });
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // PRICE AND STOCK ARE RESOLVED TOGETHER, SERVER-SIDE, ATOMICALLY.
      //
      // reserve_merch_order() validates every line against the catalog,
      // resolves the authoritative price (variant price when the item has
      // variants, item price otherwise), checks stock and decrements it —
      // all under FOR UPDATE, in one call.
      //
      // It replaces a lookup that read merchandise_items only. Three
      // defects closed at once:
      //   * STOCK was never checked or decremented anywhere, so physical
      //     goods (a 25-unit run of chip sets) could be oversold without
      //     limit.
      //   * VARIANT price and stock were never consulted — the variants
      //     table was referenced by the catalog endpoint alone — so an XXL
      //     was charged the base price and its stock never moved.
      //   * The two compound: the apparel items carry item-level
      //     stock = NULL because their real stock lives per variant, so an
      //     item-only check reads exactly those as unlimited.
      //
      // Returning the priced lines from the same call that reserved them
      // means the amount charged and the stock taken cannot disagree.
      // ═══════════════════════════════════════════════════════════════════
      const reserveLines = items.map((item) => ({
        id: item.id,
        variant_id: item.variantId || item.variant_id || null,
        qty: Math.min(Math.max(parseInt(item.quantity) || 1, 1), 10),
      }));

      const { data: reserveRaw, error: reserveErr } = await getSupabase().rpc(
        'reserve_merch_order',
        {
          p_items: reserveLines,
          ...(isPrintfulOrder ? { p_dry_run: true } : {}),
        }
      );

      if (reserveErr) {
        console.error('[DiamondPurchase] reserve_merch_order failed:', reserveErr.message);
        return res.status(500).json({ success: false, error: 'Could not verify availability' });
      }

      const reserve = typeof reserveRaw === 'string' ? JSON.parse(reserveRaw) : reserveRaw || {};
      if (!reserve.success) {
        // Map the reservation's reasons to something a shopper can act on.
        const reasons = {
          insufficient_stock:
            reserve.available > 0
              ? `Only ${reserve.available} left of that item`
              : 'That item just sold out',
          variant_required: 'Please choose a size or colour',
          variant_unavailable: 'That option is no longer available',
          variant_not_applicable: 'That item has no size or colour options',
          item_unavailable: 'That item is no longer available',
          unpriced_item: 'That item is not currently purchasable',
        };
        return res.status(400).json({
          success: false,
          error: reasons[reserve.error] || 'That item is no longer available',
          code: reserve.error,
        });
      }

      // Everything below prices from the RESERVED lines, never from the body.
      const reservedLines = reserve.lines || [];
      const selectedVariantIds = [
        ...new Set(reservedLines.map((line) => line?.variant_id).filter(Boolean)),
      ];
      let selectedVariants = [];
      if (isPrintfulOrder && selectedVariantIds.length > 0) {
        const { data, error } = await getSupabase()
          .from('merchandise_item_variants')
          .select('id, item_id, metadata')
          .in('id', selectedVariantIds)
          .eq('is_active', true);
        if (error) {
          return res
            .status(503)
            .json({ success: false, error: 'Could Not Verify The Selected Fulfillment Option' });
        }
        selectedVariants = data || [];
      }
      const catalogById = Object.fromEntries(requestedCatalog.map((row) => [row.id, row]));
      const variantsById = Object.fromEntries(selectedVariants.map((row) => [row.id, row]));
      const resolvedItems = reservedLines.map((l) => {
        const catalog = catalogById[l.id];
        const variant = l.variant_id ? variantsById[l.variant_id] : null;
        const providerVariant = isPrintfulOrder
          ? catalog?.has_variants
            ? resolvePrintfulMapping(null, variant?.metadata)
            : resolvePrintfulMapping(catalog?.metadata, null)
          : null;
        return {
          id: l.id,
          variantId: l.variant_id || null,
          name: l.name,
          priceUsd: Number(l.price_usd),
          diamondPrice: Number(l.price_diamonds) > 0 ? Number(l.price_diamonds) : null,
          quantity: Number(l.qty),
          ...(isPrintfulOrder
            ? {
                fulfillmentProvider: 'printful',
                providerVariant,
                madeToOrder: true,
              }
            : {}),
        };
      });

      if (isPrintfulOrder && resolvedItems.some((item) => !item.providerVariant)) {
        return res.status(503).json({
          success: false,
          error:
            'That Item Or Option Cannot Be Sent To Fulfillment Yet. No Diamonds Were Deducted.',
          code: 'FULFILLMENT_NOT_CONFIGURED',
        });
      }

      // From here on, any failure must hand the stock back.
      const releaseStock = async (why) => {
        const { error: relErr } = await getSupabase().rpc('release_merch_order', {
          p_lines: reservedLines,
        });
        if (relErr) {
          // Loud: stock is now understated until someone reconciles it.
          console.error(
            `[DiamondPurchase] STOCK LEAK — release failed after ${why}:`,
            relErr.message
          );
        }
      };
      releaseReservedStock = isPrintfulOrder ? null : releaseStock;

      if (resolvedItems.some((i) => !i.name || !Number.isFinite(i.priceUsd) || i.priceUsd <= 0)) {
        if (!isPrintfulOrder) await releaseStock('invalid resolved line');
        return res.status(400).json({
          success: false,
          error: 'Invalid item data — all items must have a name and positive price',
        });
      }

      // Every price now comes from the catalog, so the old client-price
      // sanity band is redundant. The band is kept as a tripwire on the
      // CATALOG itself: a row edited to $0 or $5,000 should fail loudly
      // here rather than quietly selling stock at the wrong price.
      for (const item of resolvedItems) {
        if (item.priceUsd < MIN_ITEM_PRICE_USD || item.priceUsd > MAX_SINGLE_ITEM_USD) {
          console.error(
            `[DiamondPurchase] Catalog row "${item.id}" priced outside the sane band: $${item.priceUsd}`
          );
          if (!isPrintfulOrder) await releaseStock('price outside sane band');
          return res.status(400).json({
            success: false,
            error: `Item "${item.name}" is not currently purchasable`,
          });
        }
      }

      const totalUsd = resolvedItems.reduce((sum, item) => sum + item.priceUsd * item.quantity, 0);
      if (totalUsd > MAX_ORDER_TOTAL_USD) {
        if (!isPrintfulOrder) await releaseStock('order over the total cap');
        return res
          .status(400)
          .json({ success: false, error: `Maximum order total is $${MAX_ORDER_TOTAL_USD}` });
      }
      // Diamond cost comes from the reserved lines. The USD conversion is
      // only a fallback for a catalog row that prices in dollars alone.
      const diamondCost = resolvedItems.reduce((sum, item) => {
        const perUnit =
          item.diamondPrice !== null
            ? item.diamondPrice
            : Math.ceil(item.priceUsd * DIAMONDS_PER_DOLLAR);
        return sum + perUnit * item.quantity;
      }, 0);

      // Get current diamond balance
      const { data: profile, error: profileError } = await getSupabase()
        .from('profiles')
        .select('diamonds, username')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError || !profile) {
        if (!isPrintfulOrder) await releaseStock('profile read failed');
        return res.status(500).json({ success: false, error: 'Failed to fetch profile' });
      }

      const currentBalance = profile.diamonds ?? 0;

      if (currentBalance < diamondCost) {
        if (!isPrintfulOrder) await releaseStock('insufficient balance');
        return res.status(400).json({
          success: false,
          error: 'Insufficient diamonds',
          details: {
            required: diamondCost,
            current: currentBalance,
            shortfall: diamondCost - currentBalance,
          },
        });
      }

      // Deduct diamonds atomically via audit-safe RPC.
      // Build the ledger description from RESOLVED items (truncated names,
      // clamped quantities) — never from raw client input.
      const itemNames = resolvedItems.map((i) => `${i.name} x${i.quantity}`).join(', ');

      // ═══════════════════════════════════════════════════════════════════
      // IDEMPOTENCY. This passed p_reference_id: null, which switches OFF
      // the duplicate guard inside add_diamonds_to_balance entirely — so a
      // double-click or a client retry charged the user twice and wrote two
      // orders. purchase-daily-vip.js documents having fixed exactly this
      // for itself; the fix was never propagated here.
      //
      // The client sends no idempotency key, so derive a deterministic one
      // from who is buying, what they are buying, and a coarse time bucket.
      // Identical carts inside the same bucket collapse to one charge;
      // deliberately buying the same thing again a minute later still
      // works. Sorted so key order in the request cannot change the hash.
      // ═══════════════════════════════════════════════════════════════════
      const cartFingerprint = createHash('sha256')
        .update(
          resolvedItems
            .map((i) => `${i.id}x${i.quantity}`)
            .sort()
            .join('|')
        )
        .digest('hex')
        .slice(0, 16);
      const purchaseRef = explicitPurchaseRef
        ? explicitPurchaseRef
        : `merch_${user.id}_${cartFingerprint}_${Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS)}`;

      const { data: deductResult, error: deductError } = await getSupabase().rpc(
        'add_diamonds_to_balance',
        {
          p_user_id: user.id,
          p_amount: -diamondCost,
          p_type: 'purchase',
          p_description: `Store purchase: ${itemNames}`,
          p_reference_id: purchaseRef,
        }
      );

      if (deductError) {
        if (!isPrintfulOrder) await releaseStock('diamond deduction errored');
        return res.status(500).json({ success: false, error: 'Failed to deduct diamonds' });
      }
      // The RPC reports business failures (e.g. insufficient balance under
      // concurrency) via its data payload — the pre-read check above is stale.
      if (deductResult && deductResult.success === false) {
        if (!isPrintfulOrder) await releaseStock('diamond deduction refused');
        if (deductResult.duplicate) {
          const existingOrder = await findCompletedDiamondMerchOrder(user.id, purchaseRef);
          if (existingOrder) {
            return res
              .status(200)
              .json(replayPurchaseResponse(existingOrder, deductResult.new_balance));
          }
          return res.status(409).json({
            success: false,
            error: 'This Order Is Already Being Finalized. Check Order History In A Moment.',
            code: 'PURCHASE_ALREADY_PROCESSING',
          });
        }
        return res.status(400).json({
          success: false,
          error: deductResult.error || 'Insufficient diamonds',
          details: {
            required: diamondCost,
            current: currentBalance,
          },
        });
      }

      const newBalance =
        typeof deductResult?.new_balance === 'number'
          ? deductResult.new_balance
          : typeof deductResult?.balance === 'number'
            ? deductResult.balance
            : currentBalance - diamondCost;

      // Create order record
      const { data: order, error: orderErr } = await getSupabase()
        .from('merchandise_orders')
        .insert({
          user_id: user.id,
          items: resolvedItems,
          total_usd: totalUsd,
          diamonds_spent: diamondCost,
          payment_method: 'diamonds',
          status: isPrintfulOrder ? 'processing' : 'completed',
          ...(shippingRecipient
            ? { shipping_address: publicShippingAddress(shippingRecipient) }
            : {}),
          metadata: {
            purchase_reference: purchaseRef,
            ...(isPrintfulOrder
              ? {
                  fulfillment_provider: 'printful',
                  fulfillment_status: 'submitting',
                }
              : {}),
          },
        })
        .select('id, metadata')
        .maybeSingle();
      if (orderErr || !order) {
        console.warn(
          '[DiamondPurchase] Failed to record merchandise order:',
          orderErr?.message || 'insert returned no order'
        );
        // Give the stock back as well as the diamonds — otherwise a
        // failed order write quietly removes inventory that was never
        // sold, and the shelf count drifts down with every failure.
        if (!isPrintfulOrder) await releaseStock('order insert failed');
        // Compensate: the user was charged but no order exists for fulfillment —
        // refund the diamonds instead of silently swallowing the purchase.
        const { data: refundResult, error: refundErr } = await getSupabase().rpc(
          'add_diamonds_to_balance',
          {
            p_user_id: user.id,
            p_amount: diamondCost,
            p_type: 'refund',
            p_description: 'Refund — store purchase failed to record',
            // Distinct from the purchase key on purpose: reusing it would
            // trip the duplicate guard and the refund would be dropped,
            // leaving the user charged with no order. Same reasoning as
            // the `:refund` suffix in the two VIP diamond endpoints.
            p_reference_id: `${purchaseRef}:refund`,
          }
        );
        const refundFailed = refundErr || (refundResult && refundResult.success === false);
        if (refundFailed) {
          console.warn(
            '[DiamondPurchase] Refund after failed order insert ALSO failed:',
            refundErr || refundResult
          );
          return res.status(500).json({
            success: false,
            error: 'Purchase failed while recording your order. Please contact support.',
          });
        }
        return res.status(500).json({
          success: false,
          error: 'Purchase failed — your diamonds have been refunded. Please try again.',
        });
      }

      let fulfillmentStatus = null;
      if (isPrintfulOrder) {
        let providerOrder = null;
        try {
          providerOrder = await createPrintfulOrder({
            orderId: order.id,
            recipient: shippingRecipient,
            items: buildPrintfulItems(resolvedItems),
            confirm: isAutoConfirmEnabled(),
          });
          fulfillmentStatus = String(providerOrder?.status || 'submitted').slice(0, 80);
          const { data: providerStateRows, error: providerStateError } = await getSupabase()
            .from('merchandise_orders')
            .update({
              metadata: {
                purchase_reference: purchaseRef,
                fulfillment_provider: 'printful',
                fulfillment_status: fulfillmentStatus,
                printful_order_id: providerOrder?.id ? String(providerOrder.id).slice(0, 80) : null,
                printful_external_id: sanitizeExternalOrderId(order.id),
                needs_review: false,
                submitted_at: new Date().toISOString(),
              },
            })
            .eq('id', order.id)
            .select('id');
          if (providerStateError || !providerStateRows?.length) {
            throw providerStateError || new Error('Provider state update matched zero orders');
          }
        } catch (fulfillmentError) {
          try { reportApiError(fulfillmentError, req); } catch (_) { /* best effort */ }
          const providerAccepted = !!providerOrder;
          fulfillmentStatus = providerAccepted ? 'submitted_needs_review' : 'submission_failed';
          const { data: reviewRows, error: reviewError } = await getSupabase()
            .from('merchandise_orders')
            .update({
              status: providerAccepted ? 'processing' : 'paid',
              metadata: {
                purchase_reference: purchaseRef,
                fulfillment_provider: 'printful',
                fulfillment_status: fulfillmentStatus,
                printful_order_id: providerOrder?.id ? String(providerOrder.id).slice(0, 80) : null,
                printful_external_id: sanitizeExternalOrderId(order.id),
                needs_review: true,
                reason: providerAccepted
                  ? 'printful_provider_state_persistence_failed'
                  : 'printful_submission_failed',
                failure_code: String(fulfillmentError?.code || 'PRINTFUL_REQUEST_FAILED').slice(
                  0,
                  80
                ),
                flagged_at: new Date().toISOString(),
              },
            })
            .eq('id', order.id)
            .select('id');
          if (reviewError || !reviewRows?.length) {
            const persistenceError = reviewError || new Error('Provider state update matched zero orders');
            try { reportApiError(persistenceError, req); } catch (_) { /* best effort */ }
            throw persistenceError;
          }
          console.error(
            '[DiamondPurchase] Printful submission requires review:',
            fulfillmentError?.message || fulfillmentError
          );
        }
      }

      // Sale is complete and the order is recorded. Disarm the rollback so
      // a later throw cannot hand back stock the customer has bought.
      releaseReservedStock = null;

      return res.status(200).json({
        success: true,
        data: {
          order_id: order.id,
          diamonds_spent: diamondCost,
          new_balance: newBalance,
          items_purchased: items.length,
          total_usd: totalUsd,
          fulfillment_status: fulfillmentStatus,
        },
      });
    } catch (err) {
      console.warn('[DiamondPurchase] Error:', err);
      try { reportApiError(err, req); } catch (_) { /* best effort */ }
      // Anything thrown after the reservation would otherwise consume
      // inventory for a sale that never completed.
      if (releaseReservedStock) {
        try {
          await releaseReservedStock('unhandled error');
        } catch (releaseError) {
          try { reportApiError(releaseError, req); } catch (_) { /* best effort */ }
        }
      }
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr);
    }
    console.warn('[API Error]', err);
    if (!res.headersSent)
      return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
