import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * GET /api/club-arena/marketplace-items
 * 
 * Fetches available active marketplace items for a club and the user's purchase history.
 * 
 * Query: ?clubId=xxx
 * Auth: Bearer token (any club member)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { isUUID } = require('../../../src/lib/club-arena/validate');
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
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
  try {
      if (!applyRateLimit(req, res, 'club-arena/marketplace-items')) return;
      if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No auth token' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId } = req.query;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });
      if (!isUUID(clubId)) return res.status(400).json({ error: 'Invalid clubId format' });

      try {
          // Verify membership and get chip balance
          const { data: membership } = await getSupabase()
              .from('club_members')
              .select('chip_balance, role')
              .eq('club_id', clubId)
              .eq('user_id', user.id)
              .maybeSingle();

          if (!membership) return res.status(403).json({ error: 'Not a club member' });

          // Fetch active items — BUG-10 FIX: sort by created_at desc (not price asc) for 'Newest First'
          const { data: items, error: itemsErr } = await getSupabase()
              .from('club_shop_items')
              .select('id, name, description, price, category, image_url, item_type, grant_spec, stock, stackable, per_user_limit, sale_price, available_from, available_until, sort_order')
              .eq('club_id', clubId)
              .eq('is_active', true)
              .order('sort_order', { ascending: true })
              .order('created_at', { ascending: false });

          // BUG-11 FIX: Compute purchase_count per item so 'Most Popular' sort and 'X sold' display work
          let itemsWithCount = items || [];
          if (itemsWithCount.length > 0) {
              const itemIds = itemsWithCount.map(i => i.id);
              const { data: countRows } = await getSupabase()
                  .from('club_shop_purchases')
                  .select('item_id')
                  .eq('club_id', clubId)
                  .in('item_id', itemIds)
                  .limit(10000); // bound the scan — this was unbounded
              const counts = {};
              (countRows || []).forEach(r => { counts[r.item_id] = (counts[r.item_id] || 0) + 1; });

              // The caller's OWN non-refunded purchases, so the client can show
              // remaining allowance against per_user_limit. purchase_count is
              // club-wide and cannot answer that.
              const { data: mineRows } = await getSupabase()
                  .from('club_shop_purchases')
                  .select('item_id')
                  .eq('club_id', clubId)
                  .eq('buyer_id', user.id)
                  .is('refunded_at', null)
                  .in('item_id', itemIds)
                  .limit(10000);
              const mine = {};
              (mineRows || []).forEach(r => { mine[r.item_id] = (mine[r.item_id] || 0) + 1; });

              itemsWithCount = itemsWithCount.map(i => ({
                  ...i,
                  purchase_count: counts[i.id] || 0,
                  my_purchase_count: mine[i.id] || 0,
              }));
          }

          if (itemsErr) throw itemsErr;

          // BUG-12 FIX: Join item name+category into purchases so My Items displays correct info
          //             even if the item was later hidden or deleted from the store.
          //             Falls back to basic query if FK join isn't available.
          let flatPurchases = [];
          try {
              const { data: purchases, error: purErr } = await getSupabase()
                  .from('club_shop_purchases')
                  .select('id, item_id, price_paid, created_at, club_shop_items(name, category)')
                  .eq('club_id', clubId)
                  .eq('buyer_id', user.id)
                  .order('created_at', { ascending: false });

              if (purErr) throw purErr;

              // Flatten the joined item data into each purchase record
              flatPurchases = (purchases || []).map(p => ({
                  id: p.id,
                  item_id: p.item_id,
                  price_paid: p.price_paid,
                  created_at: p.created_at,
                  item_name: p.club_shop_items?.name || null,
                  item_category: p.club_shop_items?.category || null,
              }));
          } catch (_joinErr) {
              console.warn('[marketplace-items] FK join failed, falling back:', _joinErr?.message || _joinErr);
              // Fallback: basic query without FK join
              const { data: purchases, error: purErr } = await getSupabase()
                  .from('club_shop_purchases')
                  .select('id, item_id, price_paid, created_at')
                  .eq('club_id', clubId)
                  .eq('buyer_id', user.id)
                  .order('created_at', { ascending: false });
              if (purErr) throw purErr;
              flatPurchases = (purchases || []).map(p => ({
                  ...p,
                  item_name: null,
                  item_category: null,
              }));
          }

          return res.status(200).json({
              success: true,
              items: itemsWithCount,
              purchases: flatPurchases,
              balance: membership.chip_balance || 0,
              role: membership.role
          });
      } catch (err) {
          console.warn('[marketplace-items]', err);
          return res.status(500).json({ error: 'Failed to fetch marketplace data', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
