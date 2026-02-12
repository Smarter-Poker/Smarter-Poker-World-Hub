/**
 * Move Player API
 * POST /api/commander/tournaments/[id]/move-player
 * Moves a tournament player to a different table and seat
 * Used by TD Tablet for table balancing and manual moves
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const _g = await guardWriteStaff(req, res); if (!_g) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { id: tournamentId } = req.query;
  if (!tournamentId) {
    return res.status(400).json({ success: false, error: 'Tournament ID required' });
  }

  try {
    // Auth
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Authorization required' });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    // Get tournament
    const { data: tournament, error: tErr } = await supabase
      .from('commander_tournaments')
      .select('id, venue_id, status')
      .eq('id', tournamentId)
      .single();
    if (tErr || !tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found' });
    }

    // Verify staff
    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', tournament.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!staff) {
      return res.status(403).json({ success: false, error: 'Staff access required' });
    }

    const { entry_id, to_table, to_seat } = req.body;
    if (!entry_id || to_table === undefined || to_seat === undefined) {
      return res.status(400).json({ success: false, error: 'entry_id, to_table, and to_seat required' });
    }

    // Get the entry
    const { data: entry, error: eErr } = await supabase
      .from('commander_tournament_entries')
      .select('*')
      .eq('id', entry_id)
      .eq('tournament_id', tournamentId)
      .single();
    if (eErr || !entry) {
      return res.status(404).json({ success: false, error: 'Entry not found' });
    }
    if (entry.status === 'eliminated') {
      return res.status(400).json({ success: false, error: 'Cannot move eliminated player' });
    }

    // Check destination seat is not occupied
    const { data: existing } = await supabase
      .from('commander_tournament_entries')
      .select('id, player_name')
      .eq('tournament_id', tournamentId)
      .eq('table_number', to_table)
      .eq('seat_number', to_seat)
      .in('status', ['active', 'seated'])
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Seat ${to_seat} at Table ${to_table} is occupied by ${existing.player_name}`
      });
    }

    const fromTable = entry.table_number;
    const fromSeat = entry.seat_number;

    // Execute move
    const { data: updated, error: uErr } = await supabase
      .from('commander_tournament_entries')
      .update({
        table_number: to_table,
        seat_number: to_seat,
        metadata: {
          ...entry.metadata,
          last_moved_at: new Date().toISOString(),
          last_moved_from: { table: fromTable, seat: fromSeat }
        }
      })
      .eq('id', entry_id)
      .select()
      .single();

    if (uErr) {
      return res.status(500).json({ success: false, error: 'Failed to move player' });
    }

    return res.status(200).json({
      success: true,
      data: {
        entry: updated,
        move: {
          player_name: entry.player_name,
          from_table: fromTable,
          from_seat: fromSeat,
          to_table: to_table,
          to_seat: to_seat
        }
      }
    });
  } catch (err) {
    console.error('Move player error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
