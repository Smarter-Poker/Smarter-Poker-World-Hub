/**
 * GET/PATCH /api/commander/home-games/groups/[id]
 *
 * 2026-08-15 audit: the social-media club dashboard's "Edit Poker Near Me
 * Details" panel has always called this route for the group's contact_phone
 * and website_url — but the route never existed, so the panel loaded empty
 * and every save failed. This implements the contract the panel expects:
 *   GET   -> { group: { contact_phone, website_url } }   (owner only)
 *   PATCH -> { success: true }                            (owner only)
 */
import { getServerUserWithFallback } from '../../../../../src/lib/serverAuth';
import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const PHONE_MAX = 32;
const URL_MAX = 300;

export default async function handler(req, res) {
  try {
    if (!['GET', 'PATCH'].includes(req.method)) {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    if (req.method === 'PATCH' && !applyRateLimit(req, res, LIMITS.write)) return;

    const { id } = req.query;
    if (!id || !/^[0-9a-f-]{36}$/i.test(String(id))) {
      return res.status(400).json({ error: 'Valid group id required' });
    }

    const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: group, error: fetchErr } = await getSupabase()
      .from('commander_home_groups')
      .select('id, owner_id, contact_phone, website_url')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) {
      console.warn('[groups/[id]] fetch error:', fetchErr.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.owner_id !== user.id) {
      return res.status(403).json({ error: 'Only the group owner can manage these details' });
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        group: { contact_phone: group.contact_phone || null, website_url: group.website_url || null },
      });
    }

    // PATCH
    const updates = {};
    if ('contact_phone' in req.body) {
      const v = req.body.contact_phone;
      if (v !== null && typeof v !== 'string') return res.status(400).json({ error: 'Invalid contact_phone' });
      updates.contact_phone = v ? String(v).slice(0, PHONE_MAX) : null;
    }
    if ('website_url' in req.body) {
      const v = req.body.website_url;
      if (v !== null && typeof v !== 'string') return res.status(400).json({ error: 'Invalid website_url' });
      if (v && !/^https?:\/\//i.test(v) && v.length > 0) {
        updates.website_url = `https://${String(v).slice(0, URL_MAX)}`;
      } else {
        updates.website_url = v ? String(v).slice(0, URL_MAX) : null;
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const { error: updErr } = await getSupabase()
      .from('commander_home_groups')
      .update(updates)
      .eq('id', id);
    if (updErr) {
      console.warn('[groups/[id]] update error:', updErr.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    try { reportApiError(err, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    console.warn('[groups/[id]] error:', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
}
