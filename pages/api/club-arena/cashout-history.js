/**
 * GET /api/club-arena/cashout-history?clubId=xxx
 * 
 * Returns full cashout request history for the authenticated player.
 * Includes all statuses: pending, approved, cancelled, completed.
 * Auth: Bearer token
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { isUUID } = require('../../../src/lib/club-arena/validate');
const { safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
import { reportApiError } from '../../../src/lib/sentryWrap';

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
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'GET only' });
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const clubId = req.query.clubId;
    // RED TEAM: Strict UUID validation
    if (!isUUID(clubId)) return res.status(400).json({ success: false, error: 'Invalid clubId format' });

    try {
      // Verify membership
      const { data: member } = await getSupabase()
        .from('club_members')
        .select('role')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!member) return res.status(403).json({ success: false, error: 'Not a club member' });

      // Owners/admins see all cashouts, agents see their downline, players see own
      let query = getSupabase()
        .from('cashout_requests')
        .select('*')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (member.role === 'player') {
        query = query.eq('player_id', user.id);
      } else if (['agent', 'sub_agent', 'super_agent'].includes(member.role)) {
        query = query.eq('agent_id', user.id);
      }
      // owners/admins get all

      const { data: cashouts, error } = await query;
      if (error) throw error;

      // Enrich with profile names
      const playerIds = [...new Set((cashouts || []).map(c => c.player_id))];
      let profiles = {};
      if (playerIds.length > 0) {
        const { data: profs } = await getSupabase()
          .from('profiles')
          .select('id, username, display_name')
          .in('id', playerIds)
          .limit(100);
        for (const p of (profs || [])) profiles[p.id] = p;
      }

      const enriched = (cashouts || []).map(c => ({
        ...c,
        player_profile: profiles[c.player_id] || null,
      }));

      return res.status(200).json({ success: true, cashouts: enriched });
    } catch (err) {
      console.warn('[cashout-history]', err);
      return res.status(500).json(safeErrorResponse(err, 'Cashout history failed'));
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
