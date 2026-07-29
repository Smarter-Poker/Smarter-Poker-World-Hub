import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/club-arena/save-settings
 * Update club name, description, and settings.
 * Auth: Bearer token (owner or admin only)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { sanitizeNote, sanitizeClubName, sanitizeTheme, safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
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

      if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      const { clubId, name, description, isPublic, requiresApproval, colorTheme } = req.body;
      if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

      try {
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
                  return res.status(403).json({ success: false, error: 'Only owners, admins, or union admins can edit settings' });
              }
          }

          const updates = { updated_at: new Date().toISOString() };
          if (name !== undefined) updates.name = sanitizeClubName(name, 100);
          if (description !== undefined) updates.description = sanitizeNote(description, 500);
          if (isPublic !== undefined) updates.is_public = !!isPublic;
          if (requiresApproval !== undefined) updates.requires_approval = !!requiresApproval;
          if (colorTheme !== undefined) {
              const cleaned = sanitizeTheme(colorTheme);
              if (cleaned) updates.color_theme = cleaned;
          }

          const { error: updateErr } = await getSupabase()
              .from('clubs')
              .update(updates)
              .eq('id', clubId);

          if (updateErr) throw updateErr;

          return res.status(200).json({ success: true });
      } catch (err) {
          console.warn('[save-settings]', err);
          return res.status(500).json(safeErrorResponse(err, 'Failed to save settings'));
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
