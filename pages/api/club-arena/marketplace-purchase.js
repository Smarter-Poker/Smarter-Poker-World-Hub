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
import { reportApiError } from '../../../src/lib/sentryWrap';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { beginIdempotent } = require('../../../src/lib/club-arena/durableIdempotency');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const { requireEmailVerified, requireEmailVerifiedByUserId } = require('../../../src/lib/emailVerifiedGate');
const { isUUID } = require('../../../src/lib/club-arena/validate');

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
  already_owned: ['You already own an unused copy of this item. Redeem it before buying another.', 400],
  limit_reached: ['You have reached the purchase limit for this item', 400],
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
    if (typeof clientKey !== 'string'
        || !/^[A-Za-z0-9._:-]{8,180}$/.test(clientKey.trim())) {
      return res.status(400).json({
        success: false,
        error: 'A valid X-Idempotency-Key header is required',
      });
    }

    let emailGate = requireEmailVerified(user);
    if (!emailGate.ok && typeof user.email_confirmed_at === 'undefined') {
      emailGate = await requireEmailVerifiedByUserId(supabase, user.id);
    }
    if (!emailGate.ok) return res.status(emailGate.status).json(emailGate.body);

    const allowed = new Set(['clubId', 'itemId', 'expectedPrice']);
    const bodyString = JSON.stringify(req.body || {});
    if (bodyString.length > 512) {
      return res.status(413).json({ success: false, error: 'Request body too large' });
    }
    const unknown = Object.keys(req.body || {}).filter((key) => !allowed.has(key));
    if (unknown.length) {
      return res.status(400).json({ success: false, error: `Unknown fields: ${unknown.join(', ')}` });
    }

    const { clubId, itemId, expectedPrice } = req.body || {};
    if (!clubId || !itemId || expectedPrice == null) {
      return res.status(400).json({ success: false, error: 'clubId, itemId, and expectedPrice required' });
    }
    if (!isUUID(clubId) || !isUUID(itemId)) {
      return res.status(400).json({ success: false, error: 'Invalid clubId or itemId format' });
    }
    if (!Number.isInteger(expectedPrice) || expectedPrice < 0 || expectedPrice > 1000000000) {
      return res.status(400).json({ success: false, error: 'Invalid expectedPrice' });
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
        shouldCacheResponse: (status, responseBody) => (
          status >= 200 && status < 300 && responseBody?.success === true
        ),
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

    if (!result?.success) {
      const code = String(result?.error || 'purchase_failed');
      const [message, status] = PURCHASE_ERRORS[code] || ['Purchase failed', 500];
      if (status >= 500) {
        throw new Error(`Atomic Club Shop purchase failed: ${code}`);
      }
      return res.status(status).json({
        success: false,
        error: message,
        code: code === 'reference_conflict' ? 'IDEMPOTENCY_CONFLICT' : undefined,
        reason: code,
        soldOut: code === 'sold_out',
        alreadyOwned: code === 'already_owned',
        limitReached: code === 'limit_reached',
        limit: result?.limit,
        currentPrice: result?.price,
        expectedPrice: result?.expected_price,
      });
    }

    try {
      await logAudit(supabase, {
        actionType: 'marketplace_purchase',
        userId: user.id,
        clubId,
        amount: Number(result.price_paid) || 0,
        ip: extractIP(req),
        details: {
          itemId,
          itemName: result.item_name,
          itemType: result.item_type,
          purchaseId: result.purchase_id,
          atomic: true,
          settlementModel: CLUB_SALE_SETTLEMENT_MODEL,
        },
      });
    } catch (auditError) {
      // The commerce transaction is already committed; audit failure must be
      // observable without falsely telling the buyer the purchase failed.
      try { reportApiError(auditError, req); } catch (_reportError) { /* no-op */ }
      console.warn('[marketplace-purchase] audit failed after commit:', auditError?.message || auditError);
    }

    return res.status(200).json({
      success: true,
      purchaseId: result.purchase_id,
      newBalance: Number(result.new_balance),
      currency: 'diamonds',
      pricePaid: Number(result.price_paid) || 0,
      duplicate: result.duplicate === true,
      item: { name: result.item_name, type: result.item_type },
    });
  } catch (error) {
    try { reportApiError(error, req); } catch (_reportError) { /* no-op */ }
    console.warn('[marketplace-purchase]', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Purchase failed' });
    }
  }
}
