/**
 * Break Table API
 * POST /api/commander/tournaments/[id]/break-table
 * Dissolves a tournament table and moves all players to other tables
 * Used by TD Tablet when collapsing tables as players are eliminated
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
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    // Get tournament
    const { data: tournament } = await supabase
      .from('commander_tournaments')
      .select('id, venue_id, status')
      .eq('id', tournamentId)
      .single();
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });

    // Verify staff
    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', tournament.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!staff) return res.status(403).json({ success: false, error: 'Staff access required' });

    const { table_number, assignments } = req.body;
    if (table_number === undefined || !Array.isArray(assignments)) {
      return res.status(400).json({
        success: false,
        error: 'table_number and assignments array required'
      });
    }

    // Validate all assignments have required fields
    for (const a of assignments) {
      if (!a.entry_id || a.to_table === undefined || a.to_seat === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Each assignment needs entry_id, to_table, to_seat'
        });
      }
    }

    // Check for seat conflicts in assignments
    const seatKeys = new Set();
    for (const a of assignments) {
      const key = `${a.to_table}-${a.to_seat}`;
      if (seatKeys.has(key)) {
        return res.status(400).json({
          success: false,
          error: `Duplicate assignment: Table ${a.to_table} Seat ${a.to_seat}`
        });
      }
      seatKeys.add(key);
    }

    // Check destination seats are not already occupied
    for (const a of assignments) {
      const { data: existing } = await supabase
        .from('commander_tournament_entries')
        .select('id, player_name')
        .eq('tournament_id', tournamentId)
        .eq('table_number', a.to_table)
        .eq('seat_number', a.to_seat)
        .in('status', ['active', 'seated'])
        .maybeSingle();

      if (existing) {
        return res.status(409).json({
          success: false,
          error: `Seat ${a.to_seat} at Table ${a.to_table} occupied by ${existing.player_name}`
        });
      }
    }

    // Execute all moves
    const results = [];
    const errors = [];

    for (const a of assignments) {
      const { data: entry } = await supabase
        .from('commander_tournament_entries')
        .select('table_number, seat_number, player_name')
        .eq('id', a.entry_id)
        .single();

      const { error: uErr } = await supabase
        .from('commander_tournament_entries')
        .update({
          table_number: a.to_table,
          seat_number: a.to_seat,
          metadata: {
            last_moved_at: new Date().toISOString(),
            last_moved_from: { table: entry?.table_number, seat: entry?.seat_number },
            move_reason: 'table_break'
          }
        })
        .eq('id', a.entry_id);

      if (uErr) {
        errors.push({ entry_id: a.entry_id, error: uErr.message });
      } else {
        results.push({
          entry_id: a.entry_id,
          player_name: entry?.player_name,
          from_table: entry?.table_number,
          from_seat: entry?.seat_number,
          to_table: a.to_table,
          to_seat: a.to_seat
        });
      }
    }

    return res.status(200).json({
      success: errors.length === 0,
      data: {
        table_broken: table_number,
        players_moved: results.length,
        moves: results,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (err) {
    console.error('Break table error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
