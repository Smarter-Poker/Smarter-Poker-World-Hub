/**
 * /api/club-arena/announcements
 * 
 * GET  ?clubId=xxx — List announcements for club
 * POST { action: 'create'|'update'|'delete', clubId, title, content, announcementId }
 * Auth: Bearer token, admin/owner for writes
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  try {
    // ═══════════════════════════════════════════════════════════════
    // GET — List announcements
    // ═══════════════════════════════════════════════════════════════
    if (req.method === 'GET') {
      const clubId = req.query.clubId;
      if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

      // Verify membership
      const { data: member } = await supabaseAdmin
        .from('club_members')
        .select('role')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .single();

      if (!member) return res.status(403).json({ success: false, error: 'Not a club member' });

      const { data: announcements, error } = await supabaseAdmin
        .from('club_announcements')
        .select('*')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return res.status(200).json({ success: true, announcements: announcements || [] });
    }

    // ═══════════════════════════════════════════════════════════════
    // POST — Create/Update/Delete
    // ═══════════════════════════════════════════════════════════════
    if (req.method === 'POST') {
      const { action, clubId, title, content, announcementId, pinned } = req.body;
      if (!clubId || !action) return res.status(400).json({ success: false, error: 'clubId and action required' });

      // Verify admin/owner role
      const { data: member } = await supabaseAdmin
        .from('club_members')
        .select('role')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .single();

      if (!member || !['owner', 'admin'].includes(member.role)) {
        // Union admin fallback
        const { data: clubInfo } = await supabaseAdmin.from('clubs').select('union_id').eq('id', clubId).single();
        let unionAuth = false;
        if (clubInfo?.union_id) {
          const { data: ua } = await supabaseAdmin.from('union_admins').select('role').eq('union_id', clubInfo.union_id).eq('user_id', user.id).single();
          unionAuth = !!ua;
        }
        if (!unionAuth) {
          return res.status(403).json({ success: false, error: 'Only admins, owners, or union admins can manage announcements' });
        }
      }

      if (action === 'create') {
        if (!title?.trim()) return res.status(400).json({ success: false, error: 'Title required' });

        const { data: announcement, error } = await supabaseAdmin
          .from('club_announcements')
          .insert({
            club_id: clubId,
            author_id: user.id,
            title: title.trim(),
            content: content?.trim() || '',
            pinned: pinned || false,
          })
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, announcement });
      }

      if (action === 'update') {
        if (!announcementId) return res.status(400).json({ success: false, error: 'announcementId required' });

        const updates = {};
        if (title !== undefined) updates.title = title.trim();
        if (content !== undefined) updates.content = content.trim();
        if (pinned !== undefined) updates.pinned = pinned;

        const { error } = await supabaseAdmin
          .from('club_announcements')
          .update(updates)
          .eq('id', announcementId)
          .eq('club_id', clubId);

        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      if (action === 'delete') {
        if (!announcementId) return res.status(400).json({ success: false, error: 'announcementId required' });

        const { error } = await supabaseAdmin
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
    console.error('[announcements]', err);
    return res.status(500).json({ success: false, error: 'Announcements failed', details: err.message });
  }
}
