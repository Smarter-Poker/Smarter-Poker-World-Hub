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
      // ═══════════════════════════════════════════════════════════════
      // GET — List shop items with purchase counts
      // ═══════════════════════════════════════════════════════════════
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

        // Get purchase counts per item
        const { data: purchases } = await getSupabase()
          .from('club_shop_purchases')
          .select('item_id')
          .eq('club_id', clubId)
          .limit(10000);

        const purchaseCounts = {};
        for (const p of (purchases || [])) {
          purchaseCounts[p.item_id] = (purchaseCounts[p.item_id] || 0) + 1;
        }

        const enriched = (items || []).map(item => ({
          ...item,
          purchase_count: purchaseCounts[item.id] || 0,
        }));

        return res.status(200).json({ success: true, items: enriched });
      }

      // ═══════════════════════════════════════════════════════════════
      // POST — Create/Update/Delete/Toggle shop items
      // ═══════════════════════════════════════════════════════════════
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

          const { data: item, error } = await getSupabase()
            .from('club_shop_items')
            .insert({
              club_id: clubId,
              name: name.trim(),
              description: description?.trim() || '',
              price: parseInt(price),
              category: category || 'general',
              image_url: imageUrl || null,
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
          if (name !== undefined) updates.name = name.trim();
          if (description !== undefined) updates.description = description.trim();
          if (price !== undefined) {
            const p = parseInt(price, 10);
            if (Number.isNaN(p) || p <= 0) return res.status(400).json({ success: false, error: 'Positive integer price required' });
            updates.price = p;
          }
          if (category !== undefined) updates.category = category;
          if (imageUrl !== undefined) updates.image_url = imageUrl;
          if (isActive !== undefined) updates.is_active = isActive;

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
