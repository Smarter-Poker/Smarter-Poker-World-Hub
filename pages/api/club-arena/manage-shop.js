import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * /api/club-arena/manage-shop
 * 
 * GET  ?clubId=xxx — List shop items for club (admin view with stats)
 * POST { action: 'create'|'update'|'delete'|'toggle', clubId, ... }
 * Auth: Bearer token, admin/owner for writes
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');

// Canonical shop categories (kept in sync with shop-items.js and the
// Club Arena marketplace UI) + the item_type each category maps to.
const VALID_CATEGORIES = ['Time Banks', 'Table Skins', 'Throwables', 'Emotes', 'Avatars', 'Exclusive'];
// grant_spec vocabulary — must match the CHECK constraint on club_shop_items
// and the branches in fn_redeem_shop_item.
const GRANT_TYPES = ['time_bank', 'throwable', 'emote_pack', 'table_skin', 'avatar', 'none'];
const GRANT_TYPE_BY_CATEGORY = {
    'Time Banks': 'time_bank',
    'Table Skins': 'table_skin',
    'Throwables': 'throwable',
    'Emotes': 'emote_pack',
    'Avatars': 'avatar',
    'Exclusive': 'none',
};

/**
 * Build a validated grant_spec, or return { error } for a 400.
 * Shop items that grant nothing are explicitly {"type":"none"} rather than
 * NULL so an admin can tell "club-fulfilled perk" from "never configured".
 */
function buildGrantSpec(category, grantType, grantQty, grantRef) {
    const type = GRANT_TYPES.includes(grantType)
        ? grantType
        : (GRANT_TYPE_BY_CATEGORY[category] || 'none');

    const spec = { type };

    if (type === 'time_bank' || type === 'throwable') {
        const qty = Math.floor(Number(grantQty));
        if (!Number.isFinite(qty) || qty <= 0 || qty > 1000) {
            return { error: 'grantQty must be an integer between 1 and 1000 for this grant type' };
        }
        spec.qty = qty;
    }
    if (type === 'avatar') {
        spec.avatar_id = String(grantRef || '').trim().slice(0, 64) || 'club_shop_avatar';
    }
    if (type === 'table_skin') {
        spec.theme_id = String(grantRef || '').trim().slice(0, 64) || 'club_shop_theme';
    }
    return { spec };
}

/** Item images must be https (or a same-origin path) — see audit 2026-08-19. */
function normalizeImageUrl(raw) {
    if (raw === undefined) return { skip: true };
    if (raw === null || String(raw).trim() === '') return { value: null };
    const v = String(raw).trim().slice(0, 500);
    if (v.startsWith('/')) return { value: v };
    let parsed;
    try { parsed = new URL(v); } catch (_e) { return { error: 'imageUrl must be a valid URL' }; }
    if (parsed.protocol !== 'https:') return { error: 'imageUrl must use https' };
    return { value: v };
}

const ITEM_TYPE_BY_CATEGORY = {
    'Time Banks': 'time_bank',
    'Table Skins': 'table_skin',
    'Throwables': 'throwable',
    'Emotes': 'emote',
    'Avatars': 'avatar',
    'Exclusive': 'exclusive',
};

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
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    try {
      // ═══════════════════════════════════════════════════════════
      // GET — List shop items with purchase counts
      // ═══════════════════════════════════════════════════════════
      if (req.method === 'GET') {
        const clubId = req.query.clubId;
        if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

        const { data: member } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!member || !['owner', 'admin'].includes(member.role)) {
          return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const { data: items, error } = await getSupabase()
          .from('club_shop_items')
          .select('*')
          .eq('club_id', clubId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Purchase counts AND real revenue per item. Revenue must come from
        // price_paid: multiplying today's price by historical sales let an
        // admin rewrite reported revenue just by editing a price.
        const { data: purchases } = await getSupabase()
          .from('club_shop_purchases')
          .select('item_id, price_paid')
          .eq('club_id', clubId)
          .limit(10000);

        const purchaseCounts = {};
        const revenueByItem = {};
        for (const p of (purchases || [])) {
          purchaseCounts[p.item_id] = (purchaseCounts[p.item_id] || 0) + 1;
          revenueByItem[p.item_id] = (revenueByItem[p.item_id] || 0) + (Number(p.price_paid) || 0);
        }

        const enriched = (items || []).map(item => ({
          ...item,
          purchase_count: purchaseCounts[item.id] || 0,
          revenue: revenueByItem[item.id] || 0,
        }));

        return res.status(200).json({
          success: true,
          items: enriched,
          totalRevenue: Object.values(revenueByItem).reduce((a, b) => a + b, 0),
        });
      }

      // ═══════════════════════════════════════════════════════════
      // POST — Create/Update/Delete/Toggle shop items
      // ═══════════════════════════════════════════════════════════
      if (req.method === 'POST') {
        const { action, clubId, itemId, name, description, price, category, imageUrl, isActive } = req.body;
        if (!clubId || !action) return res.status(400).json({ success: false, error: 'clubId and action required' });

        const { data: member } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!member || !['owner', 'admin'].includes(member.role)) {
          return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        if (action === 'create') {
          if (!name?.trim() || !price || price <= 0) {
            return res.status(400).json({ success: false, error: 'Name and positive price required' });
          }

          const cat = VALID_CATEGORIES.includes(category) ? category : 'Time Banks';

          const img = normalizeImageUrl(imageUrl);
          if (img.error) return res.status(400).json({ success: false, error: img.error });

          const grant = buildGrantSpec(cat, req.body.grantType, req.body.grantQty, req.body.grantRef);
          if (grant.error) return res.status(400).json({ success: false, error: grant.error });

          const { data: item, error } = await getSupabase()
            .from('club_shop_items')
            .insert({
              club_id: clubId,
              name: name.trim().slice(0, 200),
              description: description?.trim().slice(0, 500) || '',
              price: parseInt(price),
              category: cat,
              item_type: ITEM_TYPE_BY_CATEGORY[cat] || null,
              grant_spec: grant.spec,
              image_url: img.skip ? null : img.value,
              is_active: true,
            })
            .select()
            .maybeSingle();

          if (error) throw error;
          return res.status(200).json({ success: true, item });
        }

        if (action === 'update') {
          if (!itemId) return res.status(400).json({ success: false, error: 'itemId required' });

          const updates = {};
          if (name !== undefined) {
            if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ success: false, error: 'Name cannot be empty' });
            updates.name = name.trim().slice(0, 200);
          }
          if (description !== undefined) updates.description = String(description ?? '').trim().slice(0, 500);
          if (price !== undefined) {
            const p = parseInt(price, 10);
            if (Number.isNaN(p) || p <= 0) return res.status(400).json({ success: false, error: 'Positive integer price required' });
            if (p > 1000000000) return res.status(400).json({ success: false, error: 'Price exceeds maximum' });
            updates.price = p;
          }
          if (category !== undefined) {
            if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ success: false, error: 'Invalid category' });
            updates.category = category;
            updates.item_type = ITEM_TYPE_BY_CATEGORY[category] || null;
          }
          if (imageUrl !== undefined) {
            const img = normalizeImageUrl(imageUrl);
            if (img.error) return res.status(400).json({ success: false, error: img.error });
            updates.image_url = img.value;
          }
          if (isActive !== undefined) updates.is_active = !!isActive;
          if (req.body.grantType !== undefined) {
            const cat = updates.category || category;
            const grant = buildGrantSpec(cat, req.body.grantType, req.body.grantQty, req.body.grantRef);
            if (grant.error) return res.status(400).json({ success: false, error: grant.error });
            updates.grant_spec = grant.spec;
          }
          if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

          const { error } = await getSupabase()
            .from('club_shop_items')
            .update(updates)
            .eq('id', itemId)
            .eq('club_id', clubId);

          if (error) throw error;
          return res.status(200).json({ success: true });
        }

        if (action === 'toggle') {
          if (!itemId) return res.status(400).json({ success: false, error: 'itemId required' });

          const { data: item } = await getSupabase()
            .from('club_shop_items')
            .select('is_active')
            .eq('id', itemId)
            .eq('club_id', clubId)
            .maybeSingle();

          if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

          const { error } = await getSupabase()
            .from('club_shop_items')
            .update({ is_active: !item.is_active })
            .eq('id', itemId)
            .eq('club_id', clubId);

          if (error) throw error;
          return res.status(200).json({ success: true, isActive: !item.is_active });
        }

        if (action === 'delete') {
          if (!itemId) return res.status(400).json({ success: false, error: 'itemId required' });

          // 2026-08-19: club_shop_purchases.item_id is ON DELETE CASCADE, so a
          // hard delete of a sold item silently erases its purchase history and
          // the club's revenue stats. Refuse; the admin should hide it instead.
          const { data: soldRows } = await getSupabase()
            .from('club_shop_purchases')
            .select('id')
            .eq('club_id', clubId)
            .eq('item_id', itemId)
            .limit(1);

          if (soldRows && soldRows.length > 0) {
            return res.status(400).json({
              success: false,
              error: 'This item has sales. Deleting it would erase its purchase history -- hide it instead.',
              hasSales: true,
            });
          }

          const { error } = await getSupabase()
            .from('club_shop_items')
            .delete()
            .eq('id', itemId)
            .eq('club_id', clubId);

          if (error) throw error;
          return res.status(200).json({ success: true });
        }

        return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
      }

      return res.status(405).json({ success: false, error: 'GET or POST only' });
    } catch (err) {
      console.warn('[manage-shop]', err);
      return res.status(500).json({ success: false, error: 'Shop management failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
