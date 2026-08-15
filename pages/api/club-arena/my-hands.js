import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * GET /api/club-arena/my-hands
 * 
 * Retrieves recent hand histories across the club where the requesting user participated.
 * 
 * Query: ?clubId=xxx&page=1&limit=50
 * Auth: Bearer token (Must be a club member)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
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

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

export default async function handler(req, res) {
  try {
      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/my-hands')) return;
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Not authenticated' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId, page = '1', limit = '50' } = req.query;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      // Verify club membership
      const { data: membership } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

      if (!membership) return res.status(403).json({ error: 'Must be a club member' });

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;

      try {
          // 2026-08-15 CHECK 13 fix: this queried hand_id/pot_total/club_id/
          // hand_data — none exist on hand_history (real: hand_number, pot_size,
          // table_id, players jsonb; club scope lives on tables.club_id) — so the
          // query 42703'd and "My Hands" was empty forever. Player containment
          // also targeted the wrong key: players[] elements carry userId, not id.
          const { data: clubTables } = await getSupabase()
              .from('tables')
              .select('id')
              .eq('club_id', clubId)
              .limit(1000);
          const clubTableIds = (clubTables || []).map(t => t.id);
          if (clubTableIds.length === 0) {
              return res.status(200).json({ success: true, hands: [], total: 0, page: pageNum, totalPages: 0 });
          }

          const { data: hands, count, error } = await getSupabase()
              .from('hand_history')
              .select('id, hand_id:hand_number, hand_number, table_id, pot_total:pot_size, created_at', { count: 'exact' })
              .in('table_id', clubTableIds)
              .contains('players', [{ userId: user.id }])
              .order('created_at', { ascending: false })
              .range(offset, offset + limitNum - 1);

          if (error) throw error;

          // Collect table IDs to get table names
          const tableIds = new Set((hands || []).map(h => h.table_id).filter(Boolean));
          let tableMap = {};

          if (tableIds.size > 0) {
              const { data: tables } = await getSupabase()
                  .from('tables')
                  .select('id, name')
                  .in('id', Array.from(tableIds));

              tableMap = (tables || []).reduce((acc, t) => {
                  acc[t.id] = t.name;
                  return acc;
              }, {});
          }

          const enrichedHands = (hands || []).map(h => ({
              ...h,
              tableName: tableMap[h.table_id] || 'Unknown Table',
          }));

          return res.status(200).json({
              success: true,
              hands: enrichedHands,
              total: count || 0,
              page: pageNum,
              totalPages: Math.ceil((count || 0) / limitNum),
          });

      } catch (err) {
          console.warn('[my-hands] fail:', err);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
