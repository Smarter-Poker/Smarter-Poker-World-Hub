import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * /api/club-arena/announcements
 * 
 * GET  ?clubId=xxx — List announcements for club
 * POST { action: 'create'|'update'|'delete', clubId, title, content, announcementId }
 * Auth: Bearer token, admin/owner for writes
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { sanitizeNote } = require('../../../src/lib/club-arena/sanitize');
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
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
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
      // GET — List announcements
      // ═══════════════════════════════════════════════════════════
      if (req.method === 'GET') {
        const clubId = req.query.clubId;
        if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

        // Verify membership
        const { data: member } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!member) return res.status(403).json({ success: false, error: 'Not a club member' });

        const { data: announcements, error } = await getSupabase()
          .from('club_announcements')
          .select('*')
          .eq('club_id', clubId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        return res.status(200).json({ success: true, announcements: announcements || [] });
      }

      // ═══════════════════════════════════════════════════════════
      // POST — Create/Update/Delete
      // ═══════════════════════════════════════════════════════════
      if (req.method === 'POST') {
        const { action, clubId, title, content, announcementId, pinned } = req.body;
        if (!clubId || !action) return res.status(400).json({ success: false, error: 'clubId and action required' });

        // Verify admin/owner role
        const { data: member } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!member || !['owner', 'admin'].includes(member.role)) {
          // Union admin fallback
          const { data: clubInfo } = await getSupabase().from('clubs').select('union_id').eq('id', clubId).maybeSingle();
          let unionAuth = false;
          if (clubInfo?.union_id) {
            const { data: ua } = await getSupabase().from('union_admins').select('role').eq('union_id', clubInfo.union_id).eq('user_id', user.id).maybeSingle();
            if (ua) {
                unionAuth = true;
            } else {
                // Owner fallback
                const { data: union } = await getSupabase().from('unions').select('id').eq('id', clubInfo.union_id).eq('owner_id', user.id).maybeSingle();
                if (union) unionAuth = true;
            }
          }
          if (!unionAuth) {
            return res.status(403).json({ success: false, error: 'Only admins, owners, or union admins can manage announcements' });
          }
        }

        if (action === 'create') {
          if (!title?.trim()) return res.status(400).json({ success: false, error: 'Title required' });

          const { data: announcement, error } = await getSupabase()
            .from('club_announcements')
            .insert({
              club_id: clubId,
              author_id: user.id,
              title: sanitizeNote(title, 200),
              content: sanitizeNote(content, 5000),
              pinned: pinned || false,
            })
            .select()
            .maybeSingle();

          if (error) throw error;
          return res.status(200).json({ success: true, announcement });
        }

        if (action === 'update') {
          if (!announcementId) return res.status(400).json({ success: false, error: 'announcementId required' });

          const updates = {};
          if (title !== undefined) updates.title = sanitizeNote(title, 200);
          if (content !== undefined) updates.content = sanitizeNote(content, 5000);
          if (pinned !== undefined) updates.pinned = pinned;

          const { error } = await getSupabase()
            .from('club_announcements')
            .update(updates)
            .eq('id', announcementId)
            .eq('club_id', clubId);

          if (error) throw error;
          return res.status(200).json({ success: true });
        }

        if (action === 'delete') {
          if (!announcementId) return res.status(400).json({ success: false, error: 'announcementId required' });

          const { error } = await getSupabase()
            .from('club_announcements')
            .delete()
            .eq('id', announcementId)
            .eq('club_id', clubId);

          if (error) throw error;
          return res.status(200).json({ success: true });
        }

        return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
      }

      return res.status(405).json({ success: false, error: 'GET or POST only' });
    } catch (err) {
      console.warn('[announcements]', err);
      return res.status(500).json({ success: false, error: 'Announcements failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
