/**
 * Poker Brain -- Session List API
 * GET /api/poker-brain/sessions?page=1&limit=20&variant=nlhe
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const variant = req.query.variant || null;
    const offset = (page - 1) * limit;

    let query = getSupabase()
      .from('pb_sessions')
      .select('id, game_type, player_count, capture_mode, started_at, ended_at, client_profile', { count: 'exact' })
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (variant) query = query.eq('game_type', variant);

    const { data: sessions, error, count } = await query;
    if (error) {
      console.warn('[poker-brain/sessions] query error:', error);
      return res.status(500).json({ error: 'Failed to fetch sessions' });
    }

    // Fetch all hand counts in a single query
    const sessionIds = (sessions || []).map(s => s.id);
    const handCountMap = {};

    if (sessionIds.length > 0) {
      const { data: handCounts, error: handCountError } = await getSupabase()
        .from('pb_hands')
        .select('session_id', { count: 'exact' })
        .in('session_id', sessionIds);

      if (handCountError) {
        console.warn('[poker-brain/sessions] hand count query error:', handCountError);
        return res.status(500).json({ error: 'Failed to fetch hand counts' });
      }

      // Build map of session_id -> hand count
      if (handCounts) {
        handCounts.forEach(hc => {
          handCountMap[hc.session_id] = (handCountMap[hc.session_id] || 0) + 1;
        });
      }
    }

    // Enrich sessions with hand counts from map
    const enriched = (sessions || []).map(s => ({
      ...s,
      hands_played: handCountMap[s.id] || 0
    }));

    return res.status(200).json({
      sessions: enriched,
      total: count || 0,
      page,
      limit
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[poker-brain/sessions] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
