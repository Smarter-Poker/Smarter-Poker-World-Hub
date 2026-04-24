/**
 * /api/horses/hg-reports
 * GET  ?status=&reported_type=&limit=&offset=  → list reports
 * GET  ?id=<uuid>                               → report detail
 * PATCH {report_id, action, moderator_note}    → resolve report
 *
 * ADMIN-ONLY (admin|superadmin|god). Handles ALL categories including
 * illegal/self_harm/doxxing — this is the ONLY surface that can do so.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];

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

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { id, status, reported_type, limit = '50', offset = '0' } = req.query;

      // Detail mode
      if (id) {
        const { data, error } = await getSB().rpc('get_home_content_report_detail', {
          p_report_id: id,
          p_caller_user_id: user.id,
        });
        if (error) {
          console.warn('[hg-reports GET detail]', error);
          return res.status(500).json({ success: false, error: error.message });
        }
        return res.status(200).json({ success: true, report: data });
      }

      // List mode
      const params = {
        p_caller_user_id: user.id,
        p_status: status || null,
        p_reported_type: reported_type || null,
        p_limit: Math.min(parseInt(limit, 10) || 50, 200),
        p_offset: parseInt(offset, 10) || 0,
      };
      const { data, error } = await getSB().rpc('list_home_content_reports', params);
      if (error) {
        console.warn('[hg-reports GET list]', error);
        return res.status(500).json({ success: false, error: error.message });
      }
      return res.status(200).json({ success: true, reports: data || [] });
    }

    // ── PATCH — resolve ───────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { report_id, action, moderator_note } = req.body || {};
      if (!report_id || !action) {
        return res.status(400).json({ success: false, error: 'report_id and action required' });
      }
      const VALID_ACTIONS = ['dismiss', 'hide_content', 'delete_content', 'warn_author', 'strike_author', 'ban_author'];
      if (!VALID_ACTIONS.includes(action)) {
        return res.status(400).json({ success: false, error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` });
      }
      const { data, error } = await getSB().rpc('resolve_home_content_report', {
        p_report_id: report_id,
        p_action: action,
        p_moderator_note: moderator_note || null,
        p_caller_user_id: user.id,
      });
      if (error) {
        console.warn('[hg-reports PATCH]', error);
        return res.status(500).json({ success: false, error: error.message });
      }
      return res.status(200).json({ success: true, result: data });
    }

    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.warn('[hg-reports] Unhandled error:', err?.message || err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
