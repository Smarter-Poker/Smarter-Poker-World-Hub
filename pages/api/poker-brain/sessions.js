/**
 * Poker Brain -- Session List API
 * GET /api/poker-brain/sessions?page=1&limit=20&variant=nlhe
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

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
    const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
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
      console.error('[poker-brain/sessions] query error:', error);
      return res.status(500).json({ error: 'Failed to fetch sessions' });
    }

    // Enrich with hand counts
    const enriched = [];
    for (const s of (sessions || [])) {
      const { count: handCount } = await getSupabase()
        .from('pb_hands')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', s.id);
      enriched.push({ ...s, hands_played: handCount || 0 });
    }

    return res.status(200).json({
      sessions: enriched,
      total: count || 0,
      page,
      limit
    });
  } catch (err) {
    console.error('[poker-brain/sessions] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
