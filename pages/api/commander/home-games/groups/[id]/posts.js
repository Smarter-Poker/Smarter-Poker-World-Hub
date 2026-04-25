import { createClient } from '@supabase/supabase-js';

// The deployed dashboard bundle queries this endpoint with two shapes:
//
//   GET  /api/commander/home-games/groups/<id>/posts?moderation=1&limit=50
//        Bundle reads response as { reports: [...] } || { posts: [...] }
//        Each item must have: id, content||text, author_display||author_name
//
//   PATCH /api/commander/home-games/groups/<id>/posts
//        Body: { post_id, action: "hide" }
//        On success, bundle removes that post from its list.
//
// We bridge to the host-scoped RPCs:
//   - list_home_group_reports_for_host(p_group_id, p_status, p_limit, p_offset)
//   - resolve_home_report_as_host(p_report_id, p_group_id, p_action, p_moderator_note)
//
// The dashboard also accepts slug, UUID, or invite-code via the
// [id].js groups detail handler. We only handle UUID here because
// the dashboard always passes the resolved UUID by the time it hits
// these tabs (look at dashboard-*.js component S — `t.id` is the UUID
// returned from the /groups/<slug> resolution).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function userClient(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function handler(req, res) {
  const { id: groupId } = req.query;

  // Auth gate
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authorization required' });
  }
  const token = auth.slice(7);
  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  // ─── GET: list pending reports for this group, host-scoped ───────────────
  if (req.method === 'GET') {
    if (req.query.moderation !== '1') {
      return res.status(400).json({ success: false, error: 'Use ?moderation=1' });
    }
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10)  || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const { data, error } = await sb.rpc('list_home_group_reports_for_host', {
      p_group_id: groupId,
      p_status:   'pending',
      p_limit:    limit,
      p_offset:   offset,
    });
    if (error) {
      const msg = error.message || '';
      const code = /NOT_GROUP_STAFF/i.test(msg) ? 403
                 : /REPORT_NOT_IN_GROUP/i.test(msg) ? 404
                 : 500;
      return res.status(code).json({ success: false, error: msg });
    }
    // RPC returns { success, total, limit, offset, reports: [...] }
    // Bundle reads e.reports || e.posts so { reports } shape is correct.
    return res.status(200).json(data || { reports: [], total: 0 });
  }

  // ─── PATCH: hide a post by post_id (find pending report on it, resolve) ──
  if (req.method === 'PATCH') {
    const body = req.body || {};
    const { post_id, action } = body;
    if (!post_id || !action) {
      return res.status(400).json({
        success: false,
        error: 'post_id and action required',
      });
    }
    // Bundle sends action === 'hide'; map to RPC action 'hide_content'.
    const rpcAction =
      action === 'hide' ? 'hide_content'
      : action === 'dismiss' ? 'dismiss'
      : action === 'warn' ? 'warn_author'
      : null;
    if (!rpcAction) {
      return res.status(400).json({ success: false, error: 'Unsupported action' });
    }

    // Find the pending report on this post in this group.
    const { data: reports, error: lookupErr } = await sb
      .from('commander_home_content_reports')
      .select('id')
      .eq('group_id', groupId)
      .eq('reported_type', 'post')
      .eq('reported_id', post_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    if (lookupErr) {
      return res.status(500).json({ success: false, error: lookupErr.message });
    }
    if (!reports?.length) {
      return res.status(404).json({
        success: false,
        error: 'No pending report on this post in this group',
      });
    }

    const reportId = reports[0].id;
    const { data, error } = await sb.rpc('resolve_home_report_as_host', {
      p_report_id:      reportId,
      p_group_id:       groupId,
      p_action:         rpcAction,
      p_moderator_note: null,
    });
    if (error) {
      const msg = error.message || '';
      const code = /NOT_GROUP_STAFF|CONFLICT_OF_INTEREST/i.test(msg) ? 403
                 : /ESCALATION_REQUIRED/i.test(msg) ? 409
                 : /INVALID_ACTION/i.test(msg) ? 400
                 : 500;
      return res.status(code).json({ success: false, error: msg });
    }
    return res.status(200).json(data || { success: true });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
