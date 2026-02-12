/**
 * Seat Change API
 * PUT /api/commander/tournaments/[id]/entries/[entryId]/seat
 * Changes a player's seat (same table or different table)
 * Used for seat change requests and manual reassignment
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const _g = await guardWriteStaff(req, res); if (!_g) return;

  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['PUT']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { id: tournamentId, entryId } = req.query;
  if (!tournamentId || !entryId) {
    return res.status(400).json({ success: false, error: 'Tournament ID and Entry ID required' });
  }

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

    const { table_number, seat_number } = req.body;
    if (table_number === undefined || seat_number === undefined) {
      return res.status(400).json({ success: false, error: 'table_number and seat_number required' });
    }

    const { data: entry } = await supabase
      .from('commander_tournament_entries')
      .select('*')
      .eq('id', entryId)
      .eq('tournament_id', tournamentId)
      .single();
    if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });

    // Check seat not occupied
    const { data: existing } = await supabase
      .from('commander_tournament_entries')
      .select('id, player_name')
      .eq('tournament_id', tournamentId)
      .eq('table_number', table_number)
      .eq('seat_number', seat_number)
      .in('status', ['active', 'seated'])
      .neq('id', entryId)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Seat ${seat_number} at Table ${table_number} occupied by ${existing.player_name}`
      });
    }

    const fromTable = entry.table_number;
    const fromSeat = entry.seat_number;

    const { error: uErr } = await supabase
      .from('commander_tournament_entries')
      .update({
        table_number,
        seat_number,
        metadata: {
          ...(entry.metadata || {}),
          last_moved_at: new Date().toISOString(),
          last_moved_from: { table: fromTable, seat: fromSeat },
          move_reason: 'seat_change'
        }
      })
      .eq('id', entryId);

    if (uErr) return res.status(500).json({ success: false, error: 'Failed to change seat' });

    return res.status(200).json({
      success: true,
      data: {
        entry_id: entryId,
        player_name: entry.player_name,
        from_table: fromTable,
        from_seat: fromSeat,
        to_table: table_number,
        to_seat: seat_number
      }
    });
  } catch (err) {
    console.error('Seat change error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
