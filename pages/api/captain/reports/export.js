/**
 * Reports Export API
 * GET /api/captain/reports/export - Export daily report as CSV or PDF
 */
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../src/lib/captain/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const { venue_id, date, format = 'csv' } = req.query;

  if (!venue_id || !date) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id and date are required' }
    });
  }

  // Require manager auth to export reports
  const staff = await requireStaff(req, res, venue_id, ['owner', 'manager']);
  if (!staff) return;

  try {
    // Get venue info
    const { data: venue } = await supabase
      .from('poker_venues')
      .select('id, name')
      .eq('id', parseInt(venue_id))
      .single();

    if (!venue) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Venue not found' }
      });
    }

    const startOfDay = `${date}T00:00:00`;
    const endOfDay = `${date}T23:59:59`;

    // Fetch games for the day
    const { data: games } = await supabase
      .from('captain_games')
      .select(`
        id, game_type, stakes, status, current_players, max_players,
        started_at, ended_at,
        captain_tables:table_id (id, table_number)
      `)
      .eq('venue_id', parseInt(venue_id))
      .gte('started_at', startOfDay)
      .lte('started_at', endOfDay);

    // Fetch sessions for the day
    const { data: sessions } = await supabase
      .from('captain_sessions')
      .select('id, player_id, check_in_time, check_out_time')
      .eq('venue_id', parseInt(venue_id))
      .gte('check_in_time', startOfDay)
      .lte('check_in_time', endOfDay);

    // Fetch comp transactions
    const { data: comps } = await supabase
      .from('captain_comp_transactions')
      .select('id, amount, transaction_type')
      .eq('venue_id', parseInt(venue_id))
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay);

    // Calculate summary
    const totalGames = games?.length || 0;
    const uniquePlayers = new Set(sessions?.map(s => s.player_id) || []).size;
    const totalHours = games?.reduce((sum, g) => {
      if (g.ended_at) {
        const hours = (new Date(g.ended_at) - new Date(g.started_at)) / (1000 * 60 * 60);
        return sum + hours;
      }
      return sum;
    }, 0) || 0;
    const totalComps = comps?.reduce((sum, c) => {
      return sum + (c.transaction_type === 'earn' || c.transaction_type === 'bonus' ? parseFloat(c.amount) : 0);
    }, 0) || 0;

    if (format === 'csv') {
      // Generate CSV
      const csvRows = [
        ['Daily Report', venue.name, date],
        [],
        ['Summary'],
        ['Metric', 'Value'],
        ['Total Games', totalGames],
        ['Unique Players', uniquePlayers],
        ['Table Hours', totalHours.toFixed(1)],
        ['Comps Issued', `$${totalComps.toFixed(2)}`],
        [],
        ['Games Detail'],
        ['Game Type', 'Stakes', 'Table', 'Status', 'Players', 'Started', 'Duration (hrs)']
      ];

      games?.forEach(g => {
        const duration = g.ended_at
          ? ((new Date(g.ended_at) - new Date(g.started_at)) / (1000 * 60 * 60)).toFixed(1)
          : 'Running';
        csvRows.push([
          g.game_type?.toUpperCase() || 'NLHE',
          g.stakes || 'N/A',
          g.captain_tables?.table_number || 'N/A',
          g.status,
          `${g.current_players || 0}/${g.max_players || 9}`,
          new Date(g.started_at).toLocaleTimeString(),
          duration
        ]);
      });

      const csvContent = csvRows.map(row => row.join(',')).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=report-${date}.csv`);
      return res.status(200).send(csvContent);
    }

    // Return JSON if format not CSV
    return res.status(200).json({
      success: true,
      data: {
        venue: venue.name,
        date,
        summary: {
          totalGames,
          uniquePlayers,
          totalHours: totalHours.toFixed(1),
          totalComps: totalComps.toFixed(2)
        },
        games: games || []
      }
    });
  } catch (error) {
    console.error('Export report error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to export report' }
    });
  }
}
