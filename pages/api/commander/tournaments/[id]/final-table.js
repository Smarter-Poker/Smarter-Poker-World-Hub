/**
 * Final Table API
 * POST /api/commander/tournaments/[id]/final-table
 * Sets up the final table by moving all remaining players to a single table
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
  if (!tournamentId) return res.status(400).json({ success: false, error: 'Tournament ID required' });

  try {
    // Staff is already validated by guardWriteStaff at the handler level

    // Get tournament for clock_state
    const { data: tournament, error: tErr } = await supabase
      .from('commander_tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();
    if (tErr || !tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });

    const { final_table_number } = req.body;
    const targetTable = final_table_number || 1;

    // Get all active entries
    const { data: activeEntries } = await supabase
      .from('commander_tournament_entries')
      .select('*')
      .eq('tournament_id', tournamentId)
      .in('status', ['active', 'seated'])
      .order('current_chips', { ascending: false });

    if (!activeEntries || activeEntries.length === 0) {
      return res.status(400).json({ success: false, error: 'No active players' });
    }
    if (activeEntries.length > 10) {
      return res.status(400).json({ success: false, error: `Too many players (${activeEntries.length}) for final table. Max 10.` });
    }

    // Assign seats 1-N, sorted by chip count (chip leader gets seat 1)
    const moves = [];
    const timestamp = new Date().toISOString();

    for (let i = 0; i < activeEntries.length; i++) {
      const entry = activeEntries[i];
      const newSeat = i + 1;

      if (entry.table_number === targetTable && entry.seat_number === newSeat) continue;

      const { error: uErr } = await supabase
        .from('commander_tournament_entries')
        .update({
          table_number: targetTable,
          seat_number: newSeat,
          metadata: {
            ...(entry.metadata || {}),
            last_moved_at: timestamp,
            last_moved_from: { table: entry.table_number, seat: entry.seat_number },
            move_reason: 'final_table'
          }
        })
        .eq('id', entry.id);

      if (!uErr) {
        moves.push({
          entry_id: entry.id,
          player_name: entry.player_name,
          from_table: entry.table_number,
          from_seat: entry.seat_number,
          to_table: targetTable,
          to_seat: newSeat,
          chips: entry.current_chips
        });
      }
    }

    // Update tournament status
    await supabase
      .from('commander_tournaments')
      .update({
        status: 'final_table',
        clock_state: {
          ...(tournament.clock_state || {}),
          hand_for_hand: false,
          final_table: true,
          final_table_started_at: timestamp
        }
      })
      .eq('id', tournamentId);

    return res.status(200).json({
      success: true,
      data: {
        final_table_number: targetTable,
        players: activeEntries.length,
        moves,
        message: `Final table set at Table ${targetTable} with ${activeEntries.length} players`
      }
    });
  } catch (err) {
    console.error('Final table error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
