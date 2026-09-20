/**
 * GET /api/club-arena/public-clubs
 * 
 * Returns public clubs that users can discover and join.
 * No auth required — this is a discovery endpoint.
 * 
 * Query: ?limit=20&offset=0
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { reportApiError } from '../../../src/lib/apiErrorHandler';

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
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
    if (!applyRateLimit(req, res, 'club-arena/public-clubs')) return;

    // Public clubs list changes slowly — safe to cache 30s at the CDN edge
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');

    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const offset = parseInt(req.query.offset) || 0;

      const { data: clubs, error } = await getSupabase()
        .from('clubs')
        .select('id, club_id, name, description, avatar_url, member_count, is_public, status, created_at')
        .eq('is_public', true)
        .eq('status', 'active')
        .order('member_count', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Get active table counts per club
      const clubIds = (clubs || []).map(c => c.id);
      let tableCounts = {};
      if (clubIds.length > 0) {
        const { data: tables } = await getSupabase()
          .from('tables')
          .select('club_id')
          .in('club_id', clubIds)
          .in('status', ['active', 'running', 'waiting']);

        if (tables) {
          for (const t of tables) {
            tableCounts[t.club_id] = (tableCounts[t.club_id] || 0) + 1;
          }
        }
      }

      return res.json({
        success: true,
        clubs: (clubs || []).map(c => ({
          id: c.id,
          clubId: c.club_id,
          name: c.name,
          description: c.description,
          avatarUrl: c.avatar_url,
          memberCount: c.member_count || 0,
          activeTables: tableCounts[c.id] || 0,
        })),
      });
    } catch (err) {
      console.warn('[public-clubs]', err);
      return res.status(500).json({ error: 'Failed to load clubs' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
