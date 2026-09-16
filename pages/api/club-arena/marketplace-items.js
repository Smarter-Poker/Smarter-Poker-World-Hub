import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * GET /api/club-arena/marketplace-items
 * 
 * Fetches available active marketplace items for a club and the user's purchase history.
 * 
 * Query: ?clubId=xxx (optional; defaults to the member's club with the most active stock,
 *                     then any membership - never an unordered "first row")
 *        &itemId=xxx (optional; scopes the response to one active item)
 * Auth: Bearer token (any club member)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { isUUID } = require('../../../src/lib/club-arena/validate');
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';
import { getClubItemEffectivePrice } from '../../../src/lib/store/clubCardCheckout.mjs';
import {
    getClubCardCheckoutQuoteFromCatalog,
    getMaximumCardFundedClubItemPrice,
    loadActiveDiamondPackageCatalog,
} from '../../../src/lib/store/diamondPackageCatalog.mjs';

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
  try {
      setPrivateCommerceResponse(res);
      if (!applyRateLimit(req, res, 'club-arena/marketplace-items')) return;
      if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No auth token' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const requestedClubId = Array.isArray(req.query.clubId) ? req.query.clubId[0] : req.query.clubId;
      if (requestedClubId && !isUUID(requestedClubId)) {
          return res.status(400).json({ error: 'Invalid clubId format' });
      }
      const requestedItemId = Array.isArray(req.query.itemId) ? req.query.itemId[0] : req.query.itemId;
      if (requestedItemId && !isUUID(requestedItemId)) {
          return res.status(400).json({ error: 'Invalid itemId format' });
      }

      try {
          // Verify membership (role gates the Manage tab). The spendable
          // balance is the buyer's GLOBAL diamond wallet — the marketplace is
          // funded by diamonds, never chips (Dan, 2026-08-23).
          let membership = null;
          if (requestedClubId) {
              const { data, error: membershipError } = await getSupabase()
                  .from('club_members')
                  .select('club_id, role')
                  .eq('user_id', user.id)
                  .eq('club_id', requestedClubId)
                  .limit(1)
                  .maybeSingle();
              if (membershipError) throw membershipError;
              membership = data;
          } else {
              /*
               * WHICH CLUB'S SHOP, WHEN NONE WAS ASKED FOR? Not "the first
               * club_members row PostgREST hands back". That read was
               * `.limit(1)` with no ORDER BY, so a player in five clubs landed
               * on whichever the planner returned first - for Dan, Deep Stack
               * Society with zero items while Shark Club had twelve on sale.
               * The Hub club shop then said "The Shop Is Currently Empty" and
               * he concluded diamonds could not buy anything (2026-09-04).
               * Prefer the membership with the most active stock; a player
               * with no stocked club still gets their first membership.
               */
              const { data: memberships, error: membershipError } = await getSupabase()
                  .from('club_members')
                  .select('club_id, role')
                  .eq('user_id', user.id)
                  .limit(200);
              if (membershipError) throw membershipError;
              const rows = memberships || [];
              if (rows.length > 1) {
                  const { data: stock, error: stockError } = await getSupabase()
                      .from('club_shop_items')
                      .select('club_id')
                      .in('club_id', rows.map((m) => m.club_id))
                      .eq('is_active', true)
                      .limit(5000);
                  if (stockError) throw stockError;
                  const counts = new Map();
                  for (const row of stock || []) {
                      counts.set(row.club_id, (counts.get(row.club_id) || 0) + 1);
                  }
                  rows.sort((a, b) => (counts.get(b.club_id) || 0) - (counts.get(a.club_id) || 0));
              }
              membership = rows[0] || null;
          }

          // A signed-in user without a club gets a valid empty storefront response,
          // allowing the UI to render its existing "No Club Found" state.
          if (!membership) {
              if (requestedClubId) return res.status(403).json({ error: 'Not a club member' });
              return res.status(200).json({
                  success: true,
                  clubId: null,
                  items: [],
                  purchases: [],
                  balance: 0,
                  currency: 'diamonds',
                  role: null,
              });
          }

          const clubId = membership.club_id;

          const profilePromise = getSupabase()
              .from('profiles')
              .select('diamonds')
              .eq('id', user.id)
              .maybeSingle();
          // BUG-10 FIX: sort by created_at desc (not price asc) for 'Newest First'
          let itemsPromise = getSupabase()
              .from('club_shop_items')
              .select('id, name, description, price, category, image_url, item_type, grant_spec, stock, stackable, per_user_limit, sale_price, available_from, available_until, sort_order')
              .eq('club_id', clubId)
              .eq('is_active', true)
              .order('sort_order', { ascending: true })
              .order('created_at', { ascending: false });
          if (requestedItemId) itemsPromise = itemsPromise.eq('id', requestedItemId).limit(1);

          let profileResult;
          let itemsResult;
          let countResult;
          let mineResult;
          let purchaseResult;

          if (requestedItemId) {
              // Item details need only one catalog row. Run every independent
              // post-membership read in one round so a cold serverless request
              // does not pay separate catalog and purchase-history latencies.
              [profileResult, itemsResult, countResult, mineResult, purchaseResult] = await Promise.all([
                  profilePromise,
                  itemsPromise,
                  getSupabase()
                      .from('club_shop_purchases')
                      .select('item_id')
                      .eq('club_id', clubId)
                      .eq('item_id', requestedItemId)
                      .limit(10000),
                  getSupabase()
                      .from('club_shop_purchases')
                      .select('item_id')
                      .eq('club_id', clubId)
                      .eq('buyer_id', user.id)
                      .eq('item_id', requestedItemId)
                      .is('refunded_at', null)
                      .limit(10000),
                  getSupabase()
                      .from('club_shop_purchases')
                      .select('id, item_id, price_paid, currency, created_at, refunded_at, club_shop_items(name, category)')
                      .eq('club_id', clubId)
                      .eq('buyer_id', user.id)
                      .eq('item_id', requestedItemId)
                      .order('created_at', { ascending: false }),
              ]);
          } else {
              // The storefront needs the full active catalog before it can
              // safely scope aggregate reads to every visible item.
              [profileResult, itemsResult] = await Promise.all([profilePromise, itemsPromise]);
          }
          if (profileResult.error) throw profileResult.error;
          if (itemsResult.error) throw itemsResult.error;
          const profileRow = profileResult.data;
          const items = itemsResult.data || [];

          // BUG-11 FIX: Compute purchase_count per item so 'Most Popular' sort and 'X sold' display work
          const itemIds = items.map(i => i.id);
          if (!requestedItemId) {
              const countPromise = itemIds.length
                  ? getSupabase()
                      .from('club_shop_purchases')
                      .select('item_id')
                      .eq('club_id', clubId)
                      .in('item_id', itemIds)
                      .limit(10000)
                  : Promise.resolve({ data: [], error: null });
              // The caller's OWN non-refunded purchases, so the client can show
              // remaining allowance against per_user_limit. purchase_count is
              // club-wide and cannot answer that.
              const minePromise = itemIds.length
                  ? getSupabase()
                      .from('club_shop_purchases')
                      .select('item_id')
                      .eq('club_id', clubId)
                      .eq('buyer_id', user.id)
                      .is('refunded_at', null)
                      .in('item_id', itemIds)
                      .limit(10000)
                  : Promise.resolve({ data: [], error: null });
              const purchasesPromise = getSupabase()
                  .from('club_shop_purchases')
                  .select('id, item_id, price_paid, currency, created_at, refunded_at, club_shop_items(name, category)')
                  .eq('club_id', clubId)
                  .eq('buyer_id', user.id)
                  .order('created_at', { ascending: false });

              [countResult, mineResult, purchaseResult] = await Promise.all([
                  countPromise,
                  minePromise,
                  purchasesPromise,
              ]);
          }
          if (countResult.error) throw countResult.error;
          if (mineResult.error) throw mineResult.error;

          const counts = {};
          (countResult.data || []).forEach(r => { counts[r.item_id] = (counts[r.item_id] || 0) + 1; });
          const mine = {};
          (mineResult.data || []).forEach(r => { mine[r.item_id] = (mine[r.item_id] || 0) + 1; });
          const walletBalance = Number(profileRow?.diamonds);
          const walletIsValid = Boolean(profileRow)
              && profileRow.diamonds !== null
              && profileRow.diamonds !== ''
              && Number.isSafeInteger(walletBalance);
          const packageCatalogPromise = items.length > 0
              ? loadActiveDiamondPackageCatalog(getSupabase()).catch((packageError) => {
                  console.warn(
                      '[marketplace-items] current Diamond package catalog unavailable:',
                      packageError?.message || packageError
                  );
                  return null;
              })
              : Promise.resolve(null);
          const [availabilityRows, packageResult] = await Promise.all([
              Promise.all(items.map(async (item) => {
                  const { data, error } = await getSupabase().rpc('fn_shop_item_availability', {
                      p_club_id: clubId,
                      p_user_id: user.id,
                      p_item_id: item.id,
                  });
                  if (error) {
                      console.warn('[marketplace-items] availability check failed:', item.id, error.message);
                      return [item.id, { ok: false, reason: 'verification_unavailable' }];
                  }
                  if (typeof data !== 'string') return [item.id, data || { ok: false, reason: 'verification_unavailable' }];
                  try {
                      return [item.id, JSON.parse(data)];
                  } catch (_) {
                      return [item.id, { ok: false, reason: 'verification_unavailable' }];
                  }
              })),
              packageCatalogPromise,
          ]);
          const availabilityByItem = new Map(availabilityRows);
          const packageCatalog = packageResult?.catalog || null;

          const itemsWithCount = items.map((i) => {
              const availability = availabilityByItem.get(i.id) || {
                  ok: false,
                  reason: 'verification_unavailable',
              };
              const rpcPrice = Number(availability.price);
              const effectivePrice = availability.ok === true && Number.isSafeInteger(rpcPrice) && rpcPrice >= 0
                  ? rpcPrice
                  : getClubItemEffectivePrice(i.price, i.sale_price);
              const listPriceValue = Number(availability.list_price);
              const listPrice = availability.ok === true
                  && Number.isSafeInteger(listPriceValue)
                  && listPriceValue >= effectivePrice
                  ? listPriceValue
                  : Number(i.price);
              const cardQuote = availability.ok === true
                  && walletIsValid
                  && walletBalance >= 0
                  && packageCatalog
                  ? getClubCardCheckoutQuoteFromCatalog(effectivePrice, walletBalance, packageCatalog)
                  : null;
              let cardCheckoutReason = null;
              if (availability.ok !== true) cardCheckoutReason = availability.reason || 'unavailable';
              else if (effectivePrice === 0) cardCheckoutReason = 'card_not_required';
              else if (!walletIsValid) cardCheckoutReason = 'wallet_unavailable';
              else if (walletBalance < 0) cardCheckoutReason = 'wallet_debt';
              else if (!packageCatalog) cardCheckoutReason = 'package_catalog_unavailable';
              else if (!cardQuote) cardCheckoutReason = 'unsupported_item_price';
              return {
                  ...i,
                  effective_price: effectivePrice,
                  list_price: listPrice,
                  on_sale: availability.ok === true
                      ? availability.on_sale === true
                      : i.sale_price != null && effectivePrice < Number(i.price),
                  available: availability.ok === true,
                  availability_reason: availability.ok === true
                      ? null
                      : availability.reason || 'unavailable',
                  card_checkout_available: Boolean(cardQuote),
                  card_checkout_reason: cardCheckoutReason,
                  card_quote: cardQuote ? {
                      packageId: cardQuote.packageId,
                      quantity: cardQuote.quantity,
                      cardChargeCents: cardQuote.cardChargeCents,
                      cardCharge: cardQuote.cardCharge,
                      diamondsPurchased: cardQuote.diamondsPurchased,
                      diamondPurchaseBalance: cardQuote.diamondPurchaseBalance,
                      diamondShortfall: cardQuote.diamondShortfall,
                      cardPurchaseBalance: cardQuote.cardPurchaseBalance,
                  } : null,
                  purchase_count: counts[i.id] || 0,
                  my_purchase_count: mine[i.id] || 0,
              };
          });

          // BUG-12 FIX: Join item name+category into purchases so My Items displays correct info
          //             even if the item was later hidden or deleted from the store.
          //             Falls back to basic query if FK join isn't available.
          let flatPurchases = [];
          try {
              if (purchaseResult.error) throw purchaseResult.error;

              // Flatten the joined item data into each purchase record
              flatPurchases = (purchaseResult.data || []).map(p => ({
                  id: p.id,
                  item_id: p.item_id,
                  price_paid: p.price_paid,
                  created_at: p.created_at,
                  // Without this the My Items history showed a refunded
                  // purchase identically to a live one — the member saw chips
                  // they had already been given back, and an admin got an
                  // enabled Refund button that could only answer "already
                  // refunded". The column is already used for my_purchase_count
                  // above; it just was not surfaced.
                  refunded_at: p.refunded_at || null,
                  currency: p.currency || 'chips',
                  item_name: p.club_shop_items?.name || null,
                  item_category: p.club_shop_items?.category || null,
              }));
          } catch (_joinErr) {
              console.warn('[marketplace-items] FK join failed, falling back:', _joinErr?.message || _joinErr);
              // Fallback: basic query without FK join
              let fallbackQuery = getSupabase()
                  .from('club_shop_purchases')
                  .select('id, item_id, price_paid, currency, created_at, refunded_at')
                  .eq('club_id', clubId)
                  .eq('buyer_id', user.id);
              if (requestedItemId) fallbackQuery = fallbackQuery.eq('item_id', requestedItemId);
              const { data: purchases, error: purErr } = await fallbackQuery
                  .order('created_at', { ascending: false });
              if (purErr) throw purErr;
              flatPurchases = (purchases || []).map(p => ({
                  ...p,
                  refunded_at: p.refunded_at || null,
                  currency: p.currency || 'chips',
                  item_name: null,
                  item_category: null,
              }));
          }

          return res.status(200).json({
              success: true,
              clubId,
              items: itemsWithCount,
              purchases: flatPurchases,
              // Diamond wallet balance — every marketplace price is in diamonds.
              balance: walletIsValid ? walletBalance : 0,
              currency: 'diamonds',
              role: membership.role,
              maximumCardFundedPrice: packageCatalog
                  ? getMaximumCardFundedClubItemPrice(packageCatalog)
                  : null,
          });
      } catch (err) {
          console.warn('[marketplace-items]', err);
          return res.status(500).json({ error: 'Failed to fetch marketplace data', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
