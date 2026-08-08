import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Purchase With Diamonds
 * POST /api/store/purchase-with-diamonds
 * Deducts diamonds from user's balance for cart purchases
 * Conversion rate: $1 USD = 100 💎
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { requireEmailVerified, requireEmailVerifiedByUserId } = require('../../../src/lib/emailVerifiedGate');
import { reportApiError } from '../../../src/lib/sentryWrap';
import { createHash } from 'node:crypto';

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
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) console.warn('[purchase-with-diamonds] SUPABASE_SERVICE_ROLE_KEY missing — falling back to anon key; writes may be silently blocked by RLS');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const DIAMONDS_PER_DOLLAR = 100;

// Same sanity bands enforced by create-checkout-session.js for client-priced
// (non-catalog) items — without these a client could buy merch for ~1 diamond.
const MIN_ITEM_PRICE_USD = 0.50;
const MAX_SINGLE_ITEM_USD = 500;
const MAX_ORDER_TOTAL_USD = 2000;

export default async function handler(req, res) {
  try {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          // Authenticate
          const authHeader = req.headers.authorization;
          if (!authHeader?.startsWith('Bearer ')) {
              return res.status(401).json({ success: false, error: 'Authorization required' });
          }

          const token = authHeader.replace('Bearer ', '');
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
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

          const { items } = req.body || {};

          if (!items || !Array.isArray(items) || items.length === 0) {
              return res.status(400).json({ success: false, error: 'Items array required' });
          }

          // SECURITY: Look up server-side prices from merchandise_items catalog.
          // Items with an 'id' field are priced from the database.
          // Items without an ID fall back to client price (sanity-checked).
          const itemIds = items.map(i => i.id).filter(Boolean);
          let catalogPrices = {};
          if (itemIds.length > 0) {
              const { data: catalogItems } = await getSupabase()
                  .from('merchandise_items')
                  .select('id, name, price_diamonds, price_usd, is_active')
                  .in('id', itemIds)
                  .eq('is_active', true);
              if (catalogItems) {
                  catalogItems.forEach(ci => { catalogPrices[ci.id] = ci; });
              }
              for (const item of items) {
                  if (item.id && !catalogPrices[item.id]) {
                      return res.status(400).json({ success: false, error: `Item "${item.name}" is no longer available` });
                  }
              }
          }

          // ═══════════════════════════════════════════════════════════════════
          // Every line MUST resolve to a catalog row — no client-priced path.
          //
          // SECURITY (2026-08-06): items without an `id` were priced from the
          // request body. MerchStore.jsx required a UUID before it would treat
          // a value as a catalog id, but merchandise_items.id is TEXT holding
          // slugs ('hoodie-neural'), so it sent no id for any real product and
          // every diamond merch purchase was priced by the browser — 19,999 ◆
          // of goods for 50 ◆. Unrecognised items are now refused, not trusted.
          // ═══════════════════════════════════════════════════════════════════
          const unpriceable = items.find((item) => !item.id || !catalogPrices[item.id]);
          if (unpriceable) {
              console.warn(`[DiamondPurchase] Rejected unpriceable item "${unpriceable.name}" from ${user.id}`);
              return res.status(400).json({
                  success: false,
                  error: `Item "${String(unpriceable.name || 'unknown').slice(0, 80)}" is no longer available`,
              });
          }

          const resolvedItems = items.map(item => {
              const catalog = catalogPrices[item.id];
              return {
                  id: item.id,
                  name: catalog.name,
                  priceUsd: parseFloat(catalog.price_usd),
                  // `?? null` on purpose: a catalog row may legitimately price in
                  // USD only, in which case the diamond cost is converted below.
                  // 0 is NOT treated as a price — see the guard after this map.
                  diamondPrice: Number(catalog.price_diamonds) > 0 ? Number(catalog.price_diamonds) : null,
                  quantity: Math.min(Math.max(parseInt(item.quantity) || 1, 1), 10),
              };
          });

          if (resolvedItems.some(i => !i.name || !Number.isFinite(i.priceUsd) || i.priceUsd <= 0)) {
              return res.status(400).json({ success: false, error: 'Invalid item data — all items must have a name and positive price' });
          }

          // Every price now comes from the catalog, so the old client-price
          // sanity band is redundant. The band is kept as a tripwire on the
          // CATALOG itself: a row edited to $0 or $5,000 should fail loudly
          // here rather than quietly selling stock at the wrong price.
          for (const item of resolvedItems) {
              if (item.priceUsd < MIN_ITEM_PRICE_USD || item.priceUsd > MAX_SINGLE_ITEM_USD) {
                  console.error(`[DiamondPurchase] Catalog row "${item.id}" priced outside the sane band: $${item.priceUsd}`);
                  return res.status(400).json({
                      success: false,
                      error: `Item "${item.name}" is not currently purchasable`,
                  });
              }
          }

          const totalUsd = resolvedItems.reduce((sum, item) => sum + (item.priceUsd * item.quantity), 0);
          if (totalUsd > MAX_ORDER_TOTAL_USD) {
              return res.status(400).json({ success: false, error: `Maximum order total is $${MAX_ORDER_TOTAL_USD}` });
          }
          // Diamond cost: use catalog diamond price if available, else convert from USD
          const diamondCost = resolvedItems.reduce((sum, item) => {
              const perUnit = item.diamondPrice !== null ? item.diamondPrice : Math.ceil(item.priceUsd * DIAMONDS_PER_DOLLAR);
              return sum + (perUnit * item.quantity);
          }, 0);

          // Get current diamond balance
          const { data: profile, error: profileError } = await getSupabase()
              .from('profiles')
              .select('diamonds, username')
              .eq('id', user.id)
              .maybeSingle();

          if (profileError || !profile) {
              return res.status(500).json({ success: false, error: 'Failed to fetch profile' });
          }

          const currentBalance = profile.diamonds ?? 0;

          if (currentBalance < diamondCost) {
              return res.status(400).json({
                  success: false,
                  error: 'Insufficient diamonds',
                  details: {
                      required: diamondCost,
                      current: currentBalance,
                      shortfall: diamondCost - currentBalance
                  }
              });
          }

          // Deduct diamonds atomically via audit-safe RPC.
          // Build the ledger description from RESOLVED items (truncated names,
          // clamped quantities) — never from raw client input.
          const itemNames = resolvedItems.map(i => `${i.name} x${i.quantity}`).join(', ');

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
              .update(resolvedItems
                  .map((i) => `${i.id}x${i.quantity}`)
                  .sort()
                  .join('|'))
              .digest('hex')
              .slice(0, 16);
          const purchaseRef = `merch_${user.id}_${cartFingerprint}_${Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS)}`;

          const { data: deductResult, error: deductError } = await getSupabase().rpc('add_diamonds_to_balance', {
              p_user_id: user.id,
              p_amount: -diamondCost,
              p_type: 'purchase',
              p_description: `Store purchase: ${itemNames}`,
              p_reference_id: purchaseRef
          });

          if (deductError) {
              return res.status(500).json({ success: false, error: 'Failed to deduct diamonds' });
          }
          // The RPC reports business failures (e.g. insufficient balance under
          // concurrency) via its data payload — the pre-read check above is stale.
          if (deductResult && deductResult.success === false) {
              return res.status(400).json({
                  success: false,
                  error: deductResult.error || 'Insufficient diamonds',
                  details: {
                      required: diamondCost,
                      current: currentBalance
                  }
              });
          }

          const newBalance = typeof deductResult?.balance === 'number'
              ? deductResult.balance
              : currentBalance - diamondCost;

          // Create order record
          const { error: orderErr } = await getSupabase().from('merchandise_orders').insert({
              user_id: user.id,
              items: resolvedItems,
              total_usd: totalUsd,
              diamonds_spent: diamondCost,
              payment_method: 'diamonds',
              status: 'completed'
          });
          if (orderErr) {
              console.warn('[DiamondPurchase] Failed to record merchandise order:', orderErr.message);
              // Compensate: the user was charged but no order exists for fulfillment —
              // refund the diamonds instead of silently swallowing the purchase.
              const { error: refundErr } = await getSupabase().rpc('add_diamonds_to_balance', {
                  p_user_id: user.id,
                  p_amount: diamondCost,
                  p_type: 'refund',
                  p_description: 'Refund — store purchase failed to record',
                  // Distinct from the purchase key on purpose: reusing it would
                  // trip the duplicate guard and the refund would be dropped,
                  // leaving the user charged with no order. Same reasoning as
                  // the `:refund` suffix in the two VIP diamond endpoints.
                  p_reference_id: `${purchaseRef}:refund`
              });
              if (refundErr) {
                  console.warn('[DiamondPurchase] Refund after failed order insert ALSO failed:', refundErr);
                  return res.status(500).json({ success: false, error: 'Purchase failed while recording your order. Please contact support.' });
              }
              return res.status(500).json({ success: false, error: 'Purchase failed — your diamonds have been refunded. Please try again.' });
          }


          return res.status(200).json({
              success: true,
              data: {
                  diamonds_spent: diamondCost,
                  new_balance: newBalance,
                  items_purchased: items.length,
                  total_usd: totalUsd
              }
          });

      } catch (err) {
          console.warn('[DiamondPurchase] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
