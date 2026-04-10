/**
 * Poker Brain -- Aggregate Stats API
 * GET /api/poker-brain/stats?variant=nlhe&period=30d
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

function periodToDate(period) {
  const now = new Date();
  switch (period) {
    case '7d':  now.setDate(now.getDate() - 7); break;
    case '30d': now.setDate(now.getDate() - 30); break;
    case '90d': now.setDate(now.getDate() - 90); break;
    case 'all': return null;
    default:    now.setDate(now.getDate() - 30);
  }
  return now.toISOString();
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

    const variant = req.query.variant || null;
    const fromDate = periodToDate(req.query.period || '30d');

    // Get session IDs for this user (with optional variant + date filter)
    let sessQuery = getSupabase()
      .from('pb_sessions')
      .select('id, game_type, started_at')
      .eq('user_id', user.id);

    if (variant) sessQuery = sessQuery.eq('game_type', variant);
    if (fromDate) sessQuery = sessQuery.gte('started_at', fromDate);

    const { data: sessions, error: sessErr } = await sessQuery;
    if (sessErr) {
      console.error('[poker-brain/stats] session error:', sessErr);
      return res.status(500).json({ error: 'Failed to fetch sessions' });
    }

    const sessionIds = (sessions || []).map(s => s.id);
    if (sessionIds.length === 0) {
      return res.status(200).json({
        totalHands: 0, totalSessions: 0, avgEquity: 0,
        byPosition: {}, byStreet: {}, byVariant: {},
        equityDistribution: [], decisionsFollowed: { total: 0, followed: 0, ignored: 0 }
      });
    }

    // Fetch all hands across those sessions
    const { data: hands, error: handsErr } = await getSupabase()
      .from('pb_hands')
      .select('id, equity, low_equity, position, street, action_taken, engine_suggestion, session_id')
      .in('session_id', sessionIds);

    if (handsErr) {
      console.error('[poker-brain/stats] hands error:', handsErr);
      return res.status(500).json({ error: 'Failed to fetch hands' });
    }

    const allHands = hands || [];

    // Aggregate by position
    const byPosition = {};
    const byStreet = {};
    let totalEquity = 0;
    let equityCount = 0;
    let followed = 0;
    let ignored = 0;

    // Equity distribution buckets: 0-10, 10-20, ..., 90-100
    const equityBuckets = new Array(10).fill(0);

    // By variant
    const variantMap = {};
    for (const s of sessions) {
      variantMap[s.game_type] = (variantMap[s.game_type] || 0) + 1;
    }

    for (const h of allHands) {
      // Position stats
      const pos = h.position || 'unknown';
      if (!byPosition[pos]) byPosition[pos] = { hands: 0, avgEquity: 0, totalEquity: 0 };
      byPosition[pos].hands++;
      byPosition[pos].totalEquity += (h.equity || 0);

      // Street stats
      const st = h.street || 'unknown';
      if (!byStreet[st]) byStreet[st] = { hands: 0, avgEquity: 0, totalEquity: 0 };
      byStreet[st].hands++;
      byStreet[st].totalEquity += (h.equity || 0);

      // Overall equity
      if (h.equity != null) {
        totalEquity += h.equity;
        equityCount++;
        const bucket = Math.min(9, Math.floor(h.equity / 10));
        equityBuckets[bucket]++;
      }

      // Decision tracking
      if (h.action_taken && h.engine_suggestion) {
        if (h.action_taken.toUpperCase() === h.engine_suggestion.toUpperCase()) followed++;
        else ignored++;
      }
    }

    // Compute averages
    for (const pos of Object.keys(byPosition)) {
      byPosition[pos].avgEquity = byPosition[pos].hands > 0
        ? Math.round((byPosition[pos].totalEquity / byPosition[pos].hands) * 100) / 100
        : 0;
      delete byPosition[pos].totalEquity;
    }
    for (const st of Object.keys(byStreet)) {
      byStreet[st].avgEquity = byStreet[st].hands > 0
        ? Math.round((byStreet[st].totalEquity / byStreet[st].hands) * 100) / 100
        : 0;
      delete byStreet[st].totalEquity;
    }

    const equityDistribution = equityBuckets.map((count, i) => ({
      range: `${i * 10}-${(i + 1) * 10}%`,
      count
    }));

    return res.status(200).json({
      totalHands: allHands.length,
      totalSessions: sessionIds.length,
      avgEquity: equityCount > 0 ? Math.round((totalEquity / equityCount) * 100) / 100 : 0,
      byPosition,
      byStreet,
      byVariant: variantMap,
      equityDistribution,
      decisionsFollowed: { total: followed + ignored, followed, ignored }
    });
  } catch (err) {
    console.error('[poker-brain/stats] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
