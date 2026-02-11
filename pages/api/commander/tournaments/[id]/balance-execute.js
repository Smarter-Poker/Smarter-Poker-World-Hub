/**
 * Balance Execute API
 * POST /api/commander/tournaments/[id]/balance-execute
 * Batch-executes multiple player moves (from balance-suggest or manual)
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { id: tournamentId } = req.query;
  if (!tournamentId) return res.status(400).json({ success: false, error: 'Tournament ID required' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { data: tournament } = await supabase
      .from('commander_tournaments')
      .select('id, venue_id')
      .eq('id', tournamentId)
      .single();
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id')
      .eq('venue_id', tournament.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!staff) return res.status(403).json({ success: false, error: 'Staff access required' });

    const { moves } = req.body;
    if (!Array.isArray(moves) || moves.length === 0) {
      return res.status(400).json({ success: false, error: 'moves array required' });
    }

    const results = [];
    const errors = [];
    const timestamp = new Date().toISOString();

    for (const move of moves) {
      if (!move.entry_id || move.to_table === undefined || move.to_seat === undefined) {
        errors.push({ entry_id: move.entry_id, error: 'Missing to_table or to_seat' });
        continue;
      }

      const { data: entry } = await supabase
        .from('commander_tournament_entries')
        .select('table_number, seat_number, player_name, metadata')
        .eq('id', move.entry_id)
        .eq('tournament_id', tournamentId)
        .single();

      if (!entry) {
        errors.push({ entry_id: move.entry_id, error: 'Entry not found' });
        continue;
      }

      const { error: uErr } = await supabase
        .from('commander_tournament_entries')
        .update({
          table_number: move.to_table,
          seat_number: move.to_seat,
          metadata: {
            ...(entry.metadata || {}),
            last_moved_at: timestamp,
            last_moved_from: { table: entry.table_number, seat: entry.seat_number },
            move_reason: move.reason || 'balance'
          }
        })
        .eq('id', move.entry_id);

      if (uErr) {
        errors.push({ entry_id: move.entry_id, error: uErr.message });
      } else {
        results.push({
          entry_id: move.entry_id,
          player_name: entry.player_name,
          from_table: entry.table_number,
          from_seat: entry.seat_number,
          to_table: move.to_table,
          to_seat: move.to_seat
        });
      }
    }

    return res.status(200).json({
      success: errors.length === 0,
      data: {
        executed: results.length,
        failed: errors.length,
        moves: results,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (err) {
    console.error('Balance execute error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
