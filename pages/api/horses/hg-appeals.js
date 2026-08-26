/**
 * /api/horses/hg-appeals
 * GET  ?status=&group_id=&limit=&offset=  → list appeals (admin view)
 * PATCH {appeal_id, decision, reviewer_note} → review appeal
 *
 * ADMIN-ONLY (admin|superadmin|god).
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];

// A malformed id reaches Postgres as an invalid uuid literal and comes back as
// a 500. Reject it up front as the 400 it actually is.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let _sb = null;
function getSB() {
  if (!_sb) {
    _sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _sb;
}

async function requireAdmin(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'Authorization required' }); return null; }
  const { data: authData, error } = await getSB().auth.getUser(token);
  if (error || !authData?.user) { res.status(401).json({ error: 'Invalid token' }); return null; }
  const { data: profile } = await getSB().from('profiles').select('role').eq('id', authData.user.id).maybeSingle();
  if (!profile || !ADMIN_ROLES.includes(profile.role)) {
    res.status(403).json({ error: 'Admin access required' }); return null;
  }
  return authData.user;
}

export default async function handler(req, res) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  try {
    const user = await requireAdmin(req, res);
    if (!user) return;

    // ── GET — list appeals ────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { status, group_id, limit = '50', offset = '0' } = req.query;
      if (group_id && !UUID_RE.test(String(group_id))) {
        return res.status(400).json({ success: false, error: 'group_id must be a valid uuid' });
      }
      const { data, error } = await getSB().rpc('list_home_ban_appeals_admin', {
        p_caller_user_id: user.id,
        p_status: status || null,
        p_group_id: group_id || null,
        p_limit: Math.min(parseInt(limit, 10) || 50, 200),
        p_offset: parseInt(offset, 10) || 0,
      });
      if (error) {
        console.warn('[hg-appeals GET]', error);
        return res.status(500).json({ success: false, error: 'Failed to load appeals' });
      }
      return res.status(200).json({ success: true, appeals: data || [] });
    }

    // ── PATCH — review appeal ─────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { appeal_id, decision, reviewer_note } = req.body || {};
      if (!appeal_id || !decision) {
        return res.status(400).json({ success: false, error: 'appeal_id and decision required' });
      }
      if (!UUID_RE.test(String(appeal_id))) {
        return res.status(400).json({ success: false, error: 'appeal_id must be a valid uuid' });
      }
      if (!['approved', 'denied'].includes(decision)) {
        return res.status(400).json({ success: false, error: 'decision must be approved or denied' });
      }
      const { data, error } = await getSB().rpc('review_home_ban_appeal', {
        p_appeal_id: appeal_id,
        p_decision: decision,
        p_reviewer_note: reviewer_note || null,
        p_caller_user_id: user.id,
      });
      if (error) {
        console.warn('[hg-appeals PATCH]', error);
        return res.status(500).json({ success: false, error: 'Failed to review appeal' });
      }
      return res.status(200).json({ success: true, result: data });
    }

    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.warn('[hg-appeals] Unhandled error:', err?.message || err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
