/**
 * Reports Summary API
 * GET /api/commander/reports/summary?range=today|week|month|quarter
 * Returns aggregate stats for the reports dashboard
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getDateRange(range) {
  const now = new Date();
  const start = new Date();
  switch (range) {
    case 'today': start.setHours(0, 0, 0, 0); break;
    case 'week': start.setDate(now.getDate() - 7); break;
    case 'month': start.setMonth(now.getMonth() - 1); break;
    case 'quarter': start.setMonth(now.getMonth() - 3); break;
    default: start.setHours(0, 0, 0, 0);
  }
  return { start: start.toISOString(), end: now.toISOString() };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { range = 'today' } = req.query;
    const { start, end } = getDateRange(range);

    // Get venue from staff record
    const { data: staff } = await supabase
      .from('commander_staff')
      .select('venue_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!staff) return res.status(403).json({ success: false, error: 'Staff access required' });

    // Tournament stats
    const { data: tournaments } = await supabase
      .from('commander_tournaments')
      .select('id, status, buyin_amount, actual_prizepool')
      .eq('venue_id', staff.venue_id)
      .gte('created_at', start)
      .lte('created_at', end);

    const tournamentsRun = (tournaments || []).filter(t => ['completed', 'running', 'final_table'].includes(t.status)).length;

    // Tournament entries for player count
    const tournamentIds = (tournaments || []).map(t => t.id);
    let totalEntries = 0;
    if (tournamentIds.length > 0) {
      const { count } = await supabase
        .from('commander_tournament_entries')
        .select('id', { count: 'exact', head: true })
        .in('tournament_id', tournamentIds)
      totalEntries = count || 0;
    }

    // Tables
    const { data: tablesData } = await supabase
      .from('commander_tables')
      .select('id')
      .eq('venue_id', staff.venue_id)

    // Estimate table hours (tables * hours since start)
    const hoursSinceStart = Math.min((new Date() - new Date(start)) / 3600000, 24);
    const tableHours = Math.round((tablesData?.length || 0) * hoursSinceStart * 0.6); // 60% utilization estimate

    // Revenue estimate
    const revenue = (tournaments || []).reduce((sum, t) => sum + (t.actual_prizepool || t.buyin_amount || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        total_players: totalEntries,
        table_hours: tableHours,
        tournaments_run: tournamentsRun,
        revenue,
        date_range: { start, end, label: range }
      }
    });
  } catch (err) {
    console.error('Reports summary error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
