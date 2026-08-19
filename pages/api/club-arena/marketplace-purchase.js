import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/club-arena/marketplace-purchase
 * Atomic marketplace item purchase. Deducts chips, records purchase + transaction.
 * Auth: Bearer token (any club member)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const { requireEmailVerified } = require('../../../src/lib/emailVerifiedGate');
import { reportApiError } from '../../../src/lib/sentryWrap';

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

export default async function handler(req, res) {
  const supabaseAdmin = getSupabase(); // FIX: was undefined — alias to getSupabase() for settlement-lock, audit, velocity, notify
  try {
      if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

      // RED TEAM: Payload size + field allowlist validation
      const ALLOWED = new Set(['clubId', 'itemId']);
      const bodyStr = JSON.stringify(req.body || {});
      if (bodyStr.length > 512) return res.status(413).json({ success: false, error: 'Request body too large' });
      const bad = Object.keys(req.body || {}).filter(k => !ALLOWED.has(k));
      if (bad.length > 0) return res.status(400).json({ success: false, error: `Unknown fields: ${bad.join(', ')}` });

      // Idempotency guard — prevent double-tap purchases
      if (checkIdempotency(req, res)) return;

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      // [Phase 6.1.12] Email must be verified before chip/diamond purchases
      const emailGate = requireEmailVerified(user);
      if (!emailGate.ok) return res.status(emailGate.status).json(emailGate.body);

      const { clubId, itemId } = req.body;
      if (!clubId || !itemId) return res.status(400).json({ success: false, error: 'clubId and itemId required' });

      // Settlement lock check
      const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
      if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/marketplace-purchase')) return;

      try {
          // Get member
          const { data: member, error: memErr } = await getSupabase()
              .from('club_members')
              .select('chip_balance, user_id')
              .eq('club_id', clubId)
              .eq('user_id', user.id)
              .maybeSingle();

          if (memErr || !member) return res.status(404).json({ success: false, error: 'Not a member' });

          // Get item (scoped to this club) — BUG FIX: was .select('id'), making is_active/price undefined
          const { data: item, error: itemErr } = await getSupabase()
              .from('club_shop_items')
              .select('id, price, is_active, name, description, item_type')
              .eq('id', itemId)
              .eq('club_id', clubId)
              .maybeSingle();

          if (itemErr || !item) return res.status(404).json({ success: false, error: 'Item not found' });
          if (!item.is_active) return res.status(400).json({ success: false, error: 'Item not available' });

          const price = item.price || 0;
          const balance = member.chip_balance || 0;

          if (balance < price) {
              return res.status(400).json({
                  success: false, error: `Insufficient chips. Have ${balance}, need ${price}`,
                  available: balance,
                  price,
              });
          }

          // RED TEAM: Block buying while an UNREDEEMED copy is still in inventory.
          // 2026-08-19 fix: the old check looked at club_shop_purchases (permanent
          // history), which made every item a lifetime one-shot -- consumables like
          // Time Banks and Throwables could never be re-bought after redemption.
          // Ownership truth is club_shop_inventory.status = 'owned' (rows are
          // delivered by trg_deliver_shop_purchase and flipped by
          // fn_redeem_shop_item). Double-tap protection is unchanged: the
          // X-Idempotency-Key guard and rate limit above still apply.
          const { data: unusedCopies } = await getSupabase()
              .from('club_shop_inventory')
              .select('id')
              .eq('club_id', clubId)
              .eq('user_id', user.id)
              .eq('item_id', itemId)
              .eq('status', 'owned')
              .limit(1);

          if (unusedCopies && unusedCopies.length > 0) {
              return res.status(400).json({
                  success: false,
                  error: 'You already own an unused copy of this item. Redeem it before buying another.',
                  alreadyOwned: true,
              });
          }

          // Deduct chips atomically
          const { error: deductErr } = await getSupabase().rpc('fn_debit_chips', {
              p_club_id: clubId,
              p_user_id: user.id,
              p_amount: price,
          });

          if (deductErr) {
              if (deductErr.message?.includes('Insufficient')) {
                  return res.status(400).json({ success: false, error: 'Insufficient chips', available: balance, price });
              }
              throw deductErr;
          }

          // Record purchase
          const { error: purchaseErr } = await getSupabase()
              .from('club_shop_purchases')
              .insert({
                  club_id: clubId,
                  buyer_id: user.id,
                  item_id: itemId,
                  price_paid: price,
              });

          if (purchaseErr) {
              // Rollback chip deduction atomically. CRITICAL: capture the
              // refund error — if THIS fails, the user paid for nothing and
              // ops needs to know immediately. Previously the call swallowed
              // the error silently, so any rollback failure left chips
              // permanently lost with no log to reconcile from.
              const { error: refundErr } = await getSupabase().rpc('fn_credit_chips', {
                  p_club_id: clubId,
                  p_user_id: user.id,
                  p_amount: price,
              });
              if (refundErr) {
                  // Loud audit log — this is real money the user lost.
                  console.warn('[marketplace-purchase] CRITICAL: refund of', price, 'chips for user', user.id, 'in club', clubId, 'FAILED after purchase insert error:', refundErr?.message || refundErr);
                  try {
                      logAudit(supabaseAdmin, {
                          actionType: 'marketplace_refund_failed',
                          userId: user.id,
                          clubId,
                          amount: price,
                          ip: extractIP(req),
                          details: { itemId, purchaseErr: purchaseErr?.message, refundErr: refundErr?.message },
                      });
                  } catch (auditErr) {
                      console.warn('[marketplace-purchase] audit log of refund failure also failed:', auditErr?.message || auditErr);
                  }
              }
              throw purchaseErr;
          }

          // Record transaction. Same defensive shape — if this fails, the
          // user has the item and the chips moved correctly, but no audit
          // trail. Surface the error so reconciliation tools can find it.
          const { error: txErr } = await getSupabase().from('chip_transactions').insert({
              from_user_id: user.id,
              to_user_id: user.id,
              club_id: clubId,
              transaction_type: 'purchase',
              amount: -price,
              notes: `Shop purchase: ${item.name || item.id}`,
          });
          if (txErr) {
              console.warn('[marketplace-purchase] chip_transactions insert failed (purchase still successful):', txErr?.message || txErr);
          }

          logAudit(supabaseAdmin, { actionType: 'marketplace_purchase', userId: user.id, clubId, amount: price, ip: extractIP(req), details: { itemId, itemName: item.name, itemType: item.item_type } });

          // Read actual post-deduction balance (avoids stale value from concurrent operations)
          const { data: updatedMember } = await getSupabase()
              .from('club_members')
              .select('chip_balance')
              .eq('club_id', clubId)
              .eq('user_id', user.id)
              .maybeSingle();

          return res.status(200).json({
              success: true,
              newBalance: updatedMember?.chip_balance ?? (balance - price),
              item: { name: item.name, type: item.item_type },
          });
      } catch (err) {
          console.warn('[marketplace-purchase]', err);
          return res.status(500).json({ success: false, error: 'Purchase failed' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
