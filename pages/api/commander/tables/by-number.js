/**
 * Table Detail API (by table number)
 * GET /api/commander/tables/by-number?tableNumber=N - Get table with seats/players
 * Moved from [tableNumber].js to avoid slug conflict with [id].js
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('venue_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    if (!staff) return res.status(403).json({ success: false, error: 'Staff access required' });

    const { tableNumber } = req.query;


    if (req.method === 'GET') {
      // Get table
      const { data: table } = await supabase
        .from('commander_tables')
        .select('*')
        .eq('venue_id', staff.venue_id)
        .eq('table_number', parseInt(tableNumber))
        .maybeSingle();

      if (!table) return res.status(404).json({ success: false, error: 'Table not found' });

      // Get seats
      const { data: seats } = await supabase
        .from('commander_table_seats')
        .select('*')
        .eq('venue_id', staff.venue_id)
        .eq('table_number', parseInt(tableNumber))
        .order('seat_number');

      // If tournament mode, fetch tournament info
      let tournament = null;
      if (table.tournament_id) {
        const { data: t } = await supabase
          .from('commander_tournaments')
          .select('id, name, status, game_type, buyin_amount')
          .eq('id', table.tournament_id)
          .maybeSingle();
        tournament = t;
      }

      // If cash mode, fetch active game info (must-move status)
      let game = null;
      if (table.mode === 'cash') {
        const { data: g } = await supabase
          .from('commander_games')
          .select('id, game_type, stakes, status, is_must_move, parent_game_id')
          .eq('table_id', table.id)
          .in('status', ['waiting', 'running'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        game = g || null;
      }

      return res.status(200).json({
        success: true,
        data: {
          ...table,
          seats: seats || [],
          tournament: tournament || null,
          game: game || null
        }
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Table detail error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
