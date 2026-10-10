import { createClient } from '../../../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../../../src/lib/apiRateLimit';
import { homeGameSocialWriteAccess } from '../../../../../../src/lib/home-games/socialPrivacyServer.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPTIONS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const OPEN_STATUSES = new Set(['pending', 'hidden_pending_review']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  const groupId = req.query.id;
  if (typeof groupId !== 'string' || !UUID.test(groupId)) return res.status(400).json({ success: false, error: 'Valid group identifier required' });
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !serviceKey || !anonKey) throw new Error('Home Games moderation configuration unavailable');
    const service = createClient(url, serviceKey, OPTIONS);
    const { user, error: authError } = await getServerUserWithFallback(req, service);
    if (authError || !user?.id) return res.status(401).json({ success: false, error: 'Authentication required' });
    const access = await homeGameSocialWriteAccess(service, { page_type: 'home_game', linked_entity_id: groupId }, user.id);
    if (!access.staff) return res.status(403).json({ success: false, error: 'Home Game staff required' });
    const caller = createClient(url, anonKey, { ...OPTIONS, global: { headers: { Authorization: req.headers.authorization } } });

    if (req.method === 'GET') {
      const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
      const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
      const { data, error } = await caller.rpc('list_home_group_reports_for_host', { p_group_id: groupId, p_status: null, p_limit: limit, p_offset: offset });
      if (error) throw error;
      if (data?.success !== true || !Array.isArray(data.reports)) throw new Error('Invalid moderation queue response');
      const reports = data.reports.filter(report => OPEN_STATUSES.has(report.status));
      const postIds = [...new Set(reports.filter(report => report.reported_type === 'post').map(report => report.reported_id))];
      let posts = [];
      if (postIds.length) {
        const result = await service.from('commander_home_posts').select('id, is_hidden, hidden_at').eq('group_id', groupId).in('id', postIds);
        if (result.error) throw result.error;
        posts = result.data || [];
      }
      const byId = new Map(posts.map(post => [post.id, post]));
      return res.status(200).json({ success: true, reports: reports.map(report => ({
        ...report, is_hidden: report.reported_type === 'post' ? byId.get(report.reported_id)?.is_hidden === true : null,
      })), total: null, limit, offset, next_offset: offset + data.reports.length,
      has_more: typeof data.total === 'number' ? offset + data.reports.length < data.total : data.reports.length === limit });
    }

    // The old dashboard called this field post_id, but supplied report.id.
    // Preserve that request alias while keeping report and content IDs distinct.
    const reportId = req.body?.report_id || req.body?.post_id;
    if (typeof reportId !== 'string' || !UUID.test(reportId) || req.body?.action !== 'hide') {
      return res.status(400).json({ success: false, error: 'Valid report and hide action required' });
    }
    const { data: report, error: reportError } = await caller.from('commander_home_content_reports')
      .select('id, reported_type, reported_id, reason_category, content_author_id, status').eq('id', reportId).maybeSingle();
    if (reportError) throw reportError;
    if (!report || report.reported_type !== 'post') return res.status(404).json({ success: false, error: 'Post report not found' });
    if (['illegal', 'self_harm', 'doxxing'].includes(report.reason_category)) return res.status(403).json({ success: false, error: 'ESCALATION_REQUIRED' });
    if (!OPEN_STATUSES.has(report.status)) return res.status(409).json({ success: false, error: 'REPORT_ALREADY_RESOLVED' });
    const { data: group, error: groupError } = await service.from('commander_home_groups').select('owner_id').eq('id', groupId).maybeSingle();
    if (groupError) throw groupError;
    if (report.content_author_id === group?.owner_id) return res.status(403).json({ success: false, error: 'ESCALATION_REQUIRED' });
    const { data: post, error: postError } = await service.from('commander_home_posts').select('id, is_hidden').eq('id', report.reported_id).eq('group_id', groupId).maybeSingle();
    if (postError) throw postError;
    if (!post) return res.status(404).json({ success: false, error: 'Post report not found' });
    if (!post.is_hidden) {
      // The canonical staff decision above permits co-hosts, while legacy
      // post UPDATE RLS permits owner/admin only. One narrow service-role CAS
      // hides this group's identified post; it never resolves/deletes a report.
      const update = await service.from('commander_home_posts').update({ is_hidden: true, hidden_at: new Date().toISOString(), hidden_by: user.id, hidden_reason: 'host_report_hide' })
        .eq('id', post.id).eq('group_id', groupId).eq('is_hidden', false).select('id, is_hidden').maybeSingle();
      if (update.error) throw update.error;
    }
    const readback = await service.from('commander_home_posts').select('id, is_hidden').eq('id', post.id).eq('group_id', groupId).maybeSingle();
    if (readback.error) throw readback.error;
    if (readback.data?.is_hidden !== true) throw new Error('Hide not confirmed');
    return res.status(200).json({ success: true, report_id: reportId, post_id: post.id, hidden: true, report_status: report.status, awaiting_review: true });
  } catch (error) {
    console.warn('[home-games host moderation] unavailable:', error?.code || error?.name || 'Error');
    return res.status(503).json({ success: false, error: 'Home Game moderation unavailable' });
  }
}
