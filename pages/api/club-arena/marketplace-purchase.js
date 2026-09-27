/**
 * POST /api/club-arena/marketplace-purchase
 *
 * Purchases a Club Shop item with the authenticated member's global diamond
 * wallet. Availability, per-user caps, limited stock, wallet debit, purchase
 * persistence, inventory delivery, and the immutable grant snapshot are one
 * PostgreSQL transaction in fn_purchase_club_shop_item_diamonds.
 */
import crypto from 'crypto';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';
import { normalizeClubPurchaseRpcSuccess } from '../../../src/lib/store/clubCardCheckout.mjs';

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { beginIdempotent } = require('../../../src/lib/club-arena/durableIdempotency');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const {
  requireEmailVerified,
  requireEmailVerifiedByUserId,
} = require('../../../src/lib/emailVerifiedGate');
const { isUUID } = require('../../../src/lib/club-arena/validate');
const { isDeliverableShopItem } = require('../../../src/lib/club-arena/shopItemRules');

// Club Shop sales are platform-owned. The buyer's Diamonds are consumed by
// the purchase RPC and no club, club owner, agent, or affiliate is credited.
const CLUB_SALE_SETTLEMENT_MODEL = 'platform_owned_diamond_burn';

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

const PURCHASE_ERRORS = {
  not_member: ['Not a member', 404],
  not_found: ['Item not found', 404],
  inactive: ['Item not available', 400],
  not_yet_available: ['This item is not on sale yet', 400],
  no_longer_available: ['This offer has ended', 400],
  sold_out: ['This item is sold out', 400],
  already_owned: [
    'You already own an unused copy of this item. Redeem it before buying another.',
    400,
  ],
  limit_reached: ['You have reached the purchase limit for this item', 400],
  fulfillment_unavailable: ['This Item Does Not Have A Verified Digital Delivery.', 409],
  insufficient_diamonds: ['Insufficient diamonds', 400],
  price_changed: ['The Item Price Changed. Review The Current Price Before Purchasing.', 409],
  price_confirmation_required: ['Confirm The Current Item Price Before Purchasing.', 409],
  profile_not_found: ['Wallet not found', 404],
  reference_conflict: ['Purchase reference conflict', 409],
};

export default async function handler(req, res) {
  try {
    setPrivateCommerceResponse(res);
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ success: false, error: 'POST only' });
    }

    if (!applyRateLimit(req, res, 'club-arena/marketplace-purchase')) return;

    const supabase = getSupabase();
    const { user, error: authError } = await getServerUserWithFallback(req, supabase);
    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const clientKey = req.headers['x-idempotency-key'];
    if (typeof clientKey !== 'string' || !/^[A-Za-z0-9._:-]{8,180}$/.test(clientKey.trim())) {
      return res.status(400).json({
        success: false,
        error: 'A valid X-Idempotency-Key header is required',
      });
    }
    const requestId = clientKey.trim();
    const sendBoundFailure = (status, body = {}) =>
      res.status(status).json({
        ...body,
        success: false,
        accountId: user.id,
        requestId,
      });

    let emailGate = requireEmailVerified(user);
    if (!emailGate.ok && typeof user.email_confirmed_at === 'undefined') {
      emailGate = await requireEmailVerifiedByUserId(supabase, user.id);
    }
    if (!emailGate.ok) return sendBoundFailure(emailGate.status, emailGate.body);

    const allowed = new Set(['clubId', 'itemId', 'expectedPrice']);
    const bodyString = JSON.stringify(req.body || {});
    if (bodyString.length > 512) {
      return sendBoundFailure(413, { error: 'Request body too large' });
    }
    const unknown = Object.keys(req.body || {}).filter((key) => !allowed.has(key));
    if (unknown.length) {
      return sendBoundFailure(400, { error: `Unknown fields: ${unknown.join(', ')}` });
    }

    const { clubId, itemId, expectedPrice } = req.body || {};
    if (!clubId || !itemId || expectedPrice == null) {
      return sendBoundFailure(400, { error: 'clubId, itemId, and expectedPrice required' });
    }
    if (!isUUID(clubId) || !isUUID(itemId)) {
      return sendBoundFailure(400, { error: 'Invalid clubId or itemId format' });
    }
    if (!Number.isInteger(expectedPrice) || expectedPrice < 0 || expectedPrice > 1000000000) {
      return sendBoundFailure(400, { error: 'Invalid expectedPrice' });
    }

    // Historical `none` rows remain visible on receipts, but a paid request
    // must never reach the financial RPC unless this item has an executable
    // digital grant. Admin mutations cannot turn a deliverable item back into
    // a no-op, so this preflight and the retained grant snapshot agree.
    const { data: fulfillmentItem, error: fulfillmentError } = await supabase
      .from('club_shop_items')
      .select('name, category, item_type, grant_spec, is_active, stackable')
      .eq('club_id', clubId)
      .eq('id', itemId)
      .limit(1)
      .maybeSingle();
    if (fulfillmentError) {
      return sendBoundFailure(503, {
        error: 'Item Fulfillment Could Not Be Verified. Please Try Again.',
        reason: 'verification_unavailable',
      });
    }
    if (!fulfillmentItem) {
      return sendBoundFailure(404, { error: 'Item Not Found', reason: 'not_found' });
    }
    if (!isDeliverableShopItem(fulfillmentItem)) {
      return sendBoundFailure(409, {
        error: PURCHASE_ERRORS.fulfillment_unavailable[0],
        reason: 'fulfillment_unavailable',
      });
    }

    // Bind the short response cache to the normalized intent. The permanent
    // financial reference intentionally remains key-only below, so a changed
    // payload reaches PostgreSQL and is rejected as reference_conflict rather
    // than replaying the prior item's successful response.
    const intentHash = crypto
      .createHash('sha256')
      .update(`${clubId}\u0000${itemId}\u0000${expectedPrice}`)
      .digest('hex');
    const { proceed } = await beginIdempotent(
      supabase,
      req,
      res,
      `marketplace-purchase:${user.id}:${intentHash}`,
      {
        // Availability and price failures are mutable. Release the short-lived
        // response-cache claim so the same confirmed intent can be retried,
        // while the purchase RPC's charge reference remains permanent.
        shouldCacheResponse: (status, responseBody) =>
          status >= 200 && status < 300 && responseBody?.success === true,
      }
    );
    if (!proceed) return;

    const lock = await checkSettlementLock(supabase, clubId);
    if (lock.locked) return sendLockedResponse(res, lock);

    // This is the financial idempotency boundary. Unlike the five-minute
    // response cache, it persists on the purchase row forever and remains the
    // same across lambda instances, cache outages, crashes, and late retries.
    const chargeReference = `ca-shop-${crypto
      .createHash('sha256')
      .update(`marketplace-purchase\u0000${user.id}\u0000${clientKey.trim()}`)
      .digest('hex')}`;
    const { data: result, error: purchaseError } = await supabase.rpc(
      'fn_purchase_club_shop_item_diamonds_v2',
      {
        p_club_id: clubId,
        p_user_id: user.id,
        p_item_id: itemId,
        p_charge_reference: chargeReference,
        p_expected_price: expectedPrice,
      }
    );
    if (purchaseError) throw purchaseError;

    let settledResult = result;
    if (!settledResult?.success) {
      // A concurrent call can inspect the reference before the first call
      // commits, wait on the user/item lock, and then return an availability
      // refusal. Re-read the immutable purchase ledger before treating that
      // refusal as pre-commit; rotating a committed request key would make the
      // real purchase unrecoverable in the browser.
      const { data: committedPurchase, error: committedPurchaseError } = await supabase
        .from('club_shop_purchases')
        .select('id, buyer_id, club_id, item_id, price_paid')
        .eq('charge_reference', chargeReference)
        .limit(1)
        .maybeSingle();
      if (committedPurchaseError) {
        return sendBoundFailure(503, {
          error:
            'Purchase Status Could Not Be Verified. Confirm Again To Verify The Original Purchase.',
          reason: 'verification_unavailable',
        });
      }
      if (committedPurchase) {
        if (
          committedPurchase.buyer_id !== user.id ||
          committedPurchase.club_id !== clubId ||
          committedPurchase.item_id !== itemId ||
          committedPurchase.price_paid !== expectedPrice
        ) {
          return sendBoundFailure(409, {
            error: PURCHASE_ERRORS.reference_conflict[0],
            code: 'IDEMPOTENCY_CONFLICT',
            reason: 'reference_conflict',
          });
        }
        const { data: committedWallet, error: committedWalletError } = await supabase
          .from('profiles')
          .select('diamonds')
          .eq('id', user.id)
          .limit(1)
          .maybeSingle();
        // The charge is already committed and delivered at this point, so the
        // only question is what the wallet now reads. A negative balance is a
        // supported state after a card refund clawback, and refusing it here
        // left a debt-carrying member's real purchase permanently unconfirmed
        // and its durable request permanently bound.
        if (
          committedWalletError ||
          !committedWallet ||
          !Number.isSafeInteger(committedWallet.diamonds)
        ) {
          return sendBoundFailure(503, {
            error:
              'Purchase Status Could Not Be Verified. Confirm Again To Verify The Original Purchase.',
            reason: 'verification_unavailable',
          });
        }
        settledResult = {
          success: true,
          duplicate: true,
          purchase_id: committedPurchase.id,
          new_balance: committedWallet.diamonds,
          price_paid: committedPurchase.price_paid,
          item_name: fulfillmentItem.name,
          item_type: fulfillmentItem.item_type,
        };
      }
    }

    if (!settledResult?.success) {
      const code = String(settledResult?.error || 'purchase_failed');
      const [message, status] = PURCHASE_ERRORS[code] || ['Purchase failed', 500];
      if (status >= 500) {
        throw new Error(`Atomic Club Shop purchase failed: ${code}`);
      }
      return sendBoundFailure(status, {
        error: message,
        code: code === 'reference_conflict' ? 'IDEMPOTENCY_CONFLICT' : undefined,
        reason: code,
        soldOut: code === 'sold_out',
        alreadyOwned: code === 'already_owned',
        limitReached: code === 'limit_reached',
        limit: settledResult?.limit,
        currentPrice: settledResult?.price,
        expectedPrice: settledResult?.expected_price,
      });
    }

    // The RPC may have committed before its JSON response reaches this route.
    // Never coerce or partially trust that financial receipt: an unverified
    // success remains replayable under the same durable key instead of being
    // shown as a completed purchase with invented zeroes or mismatched item
    // copy.
    // The display name is not a financial term, and an operator can rename a
    // row between the preflight read above and the RPC's own read inside the
    // transaction. Checking the receipt against the pre-RPC name turned a
    // completed, charged, delivered purchase into a 500 "Purchase failed", so
    // verify against what the RPC itself reported and fall back to the row
    // this request read only when the RPC reported no name at all (a durable
    // replay). Price, purchase identity and item type stay strictly verified.
    const settledItemName =
      typeof settledResult?.item_name === 'string' && settledResult.item_name.trim()
        ? settledResult.item_name
        : fulfillmentItem.name;
    const verifiedResult = normalizeClubPurchaseRpcSuccess(settledResult, {
      price: expectedPrice,
      name: settledItemName,
      itemType: fulfillmentItem.item_type,
    });
    if (!verifiedResult) {
      throw new Error('Atomic Club Shop purchase returned an unverified receipt');
    }

    try {
      await logAudit(supabase, {
        actionType: 'marketplace_purchase',
        userId: user.id,
        clubId,
        amount: verifiedResult.pricePaid,
        ip: extractIP(req),
        details: {
          itemId,
          itemName: verifiedResult.itemName,
          itemType: verifiedResult.itemType,
          purchaseId: verifiedResult.purchaseId,
          atomic: true,
          duplicate: verifiedResult.duplicate,
          settlementModel: CLUB_SALE_SETTLEMENT_MODEL,
        },
      });
    } catch (auditError) {
      // The commerce transaction is already committed; audit failure must be
      // observable without falsely telling the buyer the purchase failed.
      try {
        reportApiError(auditError, req);
      } catch (_reportError) {
        /* no-op */
      }
      console.warn(
        '[marketplace-purchase] audit failed after commit:',
        auditError?.message || auditError
      );
    }

    return res.status(200).json({
      success: true,
      accountId: user.id,
      requestId,
      purchaseId: verifiedResult.purchaseId,
      clubId,
      itemId,
      newBalance: verifiedResult.newBalance,
      currency: 'diamonds',
      pricePaid: verifiedResult.pricePaid,
      duplicate: verifiedResult.duplicate,
      item: { name: verifiedResult.itemName, type: verifiedResult.itemType },
    });
  } catch (error) {
    try {
      reportApiError(error, req);
    } catch (_reportError) {
      /* no-op */
    }
    console.warn('[marketplace-purchase]', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Purchase failed' });
    }
  }
}
