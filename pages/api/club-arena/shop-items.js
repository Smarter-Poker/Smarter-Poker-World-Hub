/**
 * POST /api/club-arena/shop-items
 * ═══════════════════════════════════════════════════════════════════════════
 * Admin CRUD for club_shop_items. Replaces the anon-key client-side flow in
 * pages/hub/diamond-store.js which was silently failing after the 2026-05-01
 * RLS lockdown (Tier B) — anon writes to club_shop_items now blocked.
 *
 * Body (action-dispatched):
 *   { action: 'create', clubId, name, price, description?, category, imageUrl? }
 *   { action: 'toggle', clubId, itemId }            — flip is_active
 *   { action: 'delete', clubId, itemId }            — hard delete
 *
 * Auth: Bearer token + caller must be owner/admin in club_members.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { reportApiError } from '../../../src/lib/sentryWrap';

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

let _sb = null;
function sb() {
    if (!_sb) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _sb = createClient(url, key, { auth: { persistSession: false } });
    }
    return _sb;
}

async function verifyAdmin(token, clubId) {
    const { data: authData, error: authErr } = await sb().auth.getUser(token);
    const user = authData?.user;
    if (authErr || !user) return { error: 'invalid_token', status: 401 };

    const { data: membership } = await sb()
        .from('club_members')
        .select('role')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle();
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
        return { error: 'admin_required', status: 403 };
    }
    return { user };
}

const VALID_CATEGORIES = ['Time Banks', 'Table Skins', 'Throwables', 'Emotes', 'Avatars', 'Exclusive'];

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, 'club-arena/shop-items')) return;

        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });

        const { action, clubId } = req.body || {};
        if (!action) return res.status(400).json({ success: false, error: 'action required' });
        if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

        const auth = await verifyAdmin(token, clubId);
        if (auth.error) return res.status(auth.status).json({ success: false, error: auth.error });

        // ─── CREATE ────────────────────────────────────────────────────
        if (action === 'create') {
            const { name, price, description, category, imageUrl } = req.body;
            if (!name || typeof name !== 'string' || !name.trim()) {
                return res.status(400).json({ success: false, error: 'name required' });
            }
            const trimmedName = String(name).trim().slice(0, 200);
            const numPrice = Math.floor(Number(price));
            if (!numPrice || numPrice <= 0) {
                return res.status(400).json({ success: false, error: 'price must be positive integer' });
            }
            if (numPrice > 1000000000) {
                return res.status(400).json({ success: false, error: 'price exceeds maximum' });
            }
            const cat = VALID_CATEGORIES.includes(category) ? category : 'Time Banks';

            const { data, error } = await sb()
                .from('club_shop_items')
                .insert({
                    club_id: clubId,
                    name: trimmedName,
                    price: numPrice,
                    description: description ? String(description).trim().slice(0, 500) : null,
                    category: cat,
                    image_url: imageUrl ? String(imageUrl).trim().slice(0, 500) : null,
                    is_active: true
                })
                .select()
                .maybeSingle();
            if (error) {
                console.error('[shop-items] insert error:', error);
                return res.status(500).json({ success: false, error: 'create_failed' });
            }
            return res.status(200).json({ success: true, item: data });
        }

        // ─── TOGGLE (flip is_active) ───────────────────────────────────
        if (action === 'toggle') {
            const { itemId } = req.body;
            if (!itemId) return res.status(400).json({ success: false, error: 'itemId required' });
            const { data: existing } = await sb()
                .from('club_shop_items')
                .select('id, is_active')
                .eq('id', itemId)
                .eq('club_id', clubId)
                .maybeSingle();
            if (!existing) return res.status(404).json({ success: false, error: 'item_not_found' });

            const { data, error } = await sb()
                .from('club_shop_items')
                .update({ is_active: !existing.is_active })
                .eq('id', itemId)
                .eq('club_id', clubId)
                .select()
                .maybeSingle();
            if (error) {
                console.error('[shop-items] toggle error:', error);
                return res.status(500).json({ success: false, error: 'toggle_failed' });
            }
            return res.status(200).json({ success: true, item: data });
        }

        // ─── DELETE ────────────────────────────────────────────────────
        if (action === 'delete') {
            const { itemId } = req.body;
            if (!itemId) return res.status(400).json({ success: false, error: 'itemId required' });
            const { error } = await sb()
                .from('club_shop_items')
                .delete()
                .eq('id', itemId)
                .eq('club_id', clubId);
            if (error) {
                console.error('[shop-items] delete error:', error);
                return res.status(500).json({ success: false, error: 'delete_failed' });
            }
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ success: false, error: 'unknown action' });
    } catch (e) {
        console.error('[shop-items] unexpected error:', e);
        try { reportApiError(e, { route: '/api/club-arena/shop-items' }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
