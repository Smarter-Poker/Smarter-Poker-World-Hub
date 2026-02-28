/**
 * Must-Move Games Management API
 * GET /api/commander/games/must-move-status?venue_id=X
 *   Returns active games grouped by type+stakes, with must-move relationships
 *   Includes per-game seat list for queue display
 * POST /api/commander/games/must-move-status
 *   Move next player from must-move table to main game (when seat opens)
 *   Body: { must_move_game_id, main_game_id }
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const _g = await guardWriteStaff(req, res); if (!_g) return;

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

async function handleGet(req, res) {
  try {
    const { venue_id } = req.query;
    if (!venue_id) return res.status(400).json({ success: false, error: 'venue_id required' });

    // Get all active games (no join — avoids FK ambiguity with commander_tables)
    const { data: games, error } = await supabase
      .from('commander_games')
      .select('id, game_type, stakes, status, table_id, is_must_move, parent_game_id, current_players, max_players, created_at, dealer_staff_id')
      .eq('venue_id', venue_id)
      .in('status', ['waiting', 'running'])
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Get table info separately
    const tableIds = [...new Set((games || []).filter(g => g.table_id).map(g => g.table_id))];
    let tablesMap = {};
    if (tableIds.length > 0) {
      const { data: tables } = await supabase
        .from('commander_tables')
        .select('id, table_number, table_name, max_seats')
        .in('id', tableIds);
      (tables || []).forEach(t => { tablesMap[t.id] = t; });
    }

    // Get all seats for these games (for the must-move queue)
    const gameIds = (games || []).map(g => g.id);
    let seatsMap = {}; // game_id -> [seats ordered by seated_at]
    if (gameIds.length > 0) {
      const { data: seats } = await supabase
        .from('commander_seats')
        .select('id, game_id, seat_number, player_id, player_name, status, seated_at, buyin_amount, created_at')
        .in('game_id', gameIds)
        .eq('status', 'occupied')
        .order('seated_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      (seats || []).forEach(s => {
        if (!seatsMap[s.game_id]) seatsMap[s.game_id] = [];
        seatsMap[s.game_id].push(s);
      });
    }

    // Get waitlist counts per game type+stakes
    let waitlistCounts = {};
    try {
      const { data: wlEntries } = await supabase
        .from('commander_waitlist')
        .select('game_type, stakes')
        .eq('venue_id', venue_id)
        .in('status', ['waiting', 'called']);
      (wlEntries || []).forEach(w => {
        const key = `${w.game_type}|${w.stakes}`;
        waitlistCounts[key] = (waitlistCounts[key] || 0) + 1;
      });
    } catch { /* non-critical */ }

    // Enrich games
    const enriched = (games || []).map(g => ({
      ...g,
      table_number: tablesMap[g.table_id]?.table_number || null,
      table_name: tablesMap[g.table_id]?.table_name || null,
      max_seats: tablesMap[g.table_id]?.max_seats || g.max_players || 9,
      player_count: g.current_players || 0,
      seats: seatsMap[g.id] || [],
    }));

    // Group by game_type + stakes
    const groups = {};
    enriched.forEach(g => {
      const key = `${g.game_type}|${g.stakes}`;
      if (!groups[key]) groups[key] = { game_type: g.game_type, stakes: g.stakes, main: null, must_moves: [], all: [] };
      groups[key].all.push(g);
      if (g.is_must_move) {
        groups[key].must_moves.push(g);
      } else {
        // Oldest non-must-move is the main game
        if (!groups[key].main || new Date(g.created_at) < new Date(groups[key].main.created_at)) {
          groups[key].main = g;
        }
      }
    });

    // Only return groups with 2+ tables (must-move candidates)
    const candidates = Object.values(groups).filter(g => g.all.length >= 2);

    // ── Defensive: fix orphaned must-move flags ──
    // Games flagged is_must_move=true but with null parent, or parent no longer active
    const activeGameIds = new Set(enriched.map(g => g.id));
    const orphans = enriched.filter(g =>
      g.is_must_move && (!g.parent_game_id || !activeGameIds.has(g.parent_game_id))
    );
    if (orphans.length > 0) {
      const orphanIds = orphans.map(g => g.id);
      await supabase
        .from('commander_games')
        .update({ is_must_move: false, parent_game_id: null })
        .in('id', orphanIds);
      // Fix local data
      orphans.forEach(g => { g.is_must_move = false; g.parent_game_id = null; });
    }

    // Auto-link unlinked games as must-move when 2+ share the same type+stakes
    for (const group of candidates) {
      if (!group.main) continue;
      const unlinked = group.all.filter(g => g.id !== group.main.id && !g.is_must_move);
      if (unlinked.length > 0) {
        const unlinkedIds = unlinked.map(g => g.id);
        await supabase
          .from('commander_games')
          .update({ is_must_move: true, parent_game_id: group.main.id })
          .in('id', unlinkedIds);

        // Update local data so the response reflects the new links
        unlinked.forEach(g => {
          g.is_must_move = true;
          g.parent_game_id = group.main.id;
          group.must_moves.push(g);
        });
      }
    }

    // Also return all singles for reference
    const singles = Object.values(groups).filter(g => g.all.length === 1);

    // Attach waitlist counts
    candidates.forEach(g => {
      const key = `${g.game_type}|${g.stakes}`;
      g.waitlist_count = waitlistCounts[key] || 0;
    });

    return res.status(200).json({
      success: true,
      data: {
        must_move_groups: candidates,
        single_games: singles.map(g => g.all[0]),
        total_active: enriched.length,
      }
    });
  } catch (err) {
    console.error('Must-move status error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

async function handlePost(req, res) {
  try {
    const { must_move_game_id, main_game_id } = req.body;
    if (!must_move_game_id || !main_game_id) {
      return res.status(400).json({ success: false, error: 'must_move_game_id and main_game_id required' });
    }

    // Get the must-move game's oldest occupied seat (first in line to move)
    const { data: seats } = await supabase
      .from('commander_seats')
      .select('id, game_id, seat_number, player_id, player_name, seated_at, created_at')
      .eq('game_id', must_move_game_id)
      .eq('status', 'occupied')
      .order('seated_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(1);

    if (!seats || seats.length === 0) {
      return res.status(400).json({ success: false, error: 'No players at must-move table' });
    }

    const playerToMove = seats[0];

    // Get main game info
    const { data: mainGame } = await supabase
      .from('commander_games')
      .select('id, table_id, current_players, max_players')
      .eq('id', main_game_id)
      .single();

    if (!mainGame) return res.status(404).json({ success: false, error: 'Main game not found' });

    const { data: mainTable } = await supabase
      .from('commander_tables')
      .select('id, table_number, max_seats')
      .eq('id', mainGame.table_id)
      .single();

    if (!mainTable) return res.status(404).json({ success: false, error: 'Main table not found' });

    // Find an open seat at the main game
    const { data: mainSeats } = await supabase
      .from('commander_seats')
      .select('seat_number')
      .eq('game_id', main_game_id)
      .eq('status', 'occupied');

    const occupiedSeats = new Set((mainSeats || []).map(s => s.seat_number));
    const maxSeats = mainTable.max_seats || mainGame.max_players || 9;
    let openSeat = null;
    for (let i = 1; i <= maxSeats; i++) {
      if (!occupiedSeats.has(i)) { openSeat = i; break; }
    }

    if (openSeat === null) {
      return res.status(400).json({ success: false, error: 'No open seats at main table' });
    }

    // Get must-move game table info for the response
    const { data: mmGame } = await supabase
      .from('commander_games')
      .select('table_id, current_players')
      .eq('id', must_move_game_id)
      .single();

    const { data: mmTable } = await supabase
      .from('commander_tables')
      .select('table_number')
      .eq('id', mmGame?.table_id)
      .single();

    // Move the player:
    // 1. Delete their seat at the must-move table
    await supabase.from('commander_seats').delete().eq('id', playerToMove.id);

    // 2. Insert a new seat at the main game
    await supabase.from('commander_seats').insert({
      game_id: main_game_id,
      seat_number: openSeat,
      player_id: playerToMove.player_id,
      player_name: playerToMove.player_name,
      status: 'occupied',
      seated_at: new Date().toISOString(),
    });

    // 3. Update player counts
    await supabase
      .from('commander_games')
      .update({ current_players: Math.max(0, (mmGame?.current_players || 1) - 1) })
      .eq('id', must_move_game_id);

    await supabase
      .from('commander_games')
      .update({ current_players: (mainGame.current_players || 0) + 1 })
      .eq('id', main_game_id);

    const fromTable = mmTable?.table_number || '?';
    const toTable = mainTable.table_number;

    return res.status(200).json({
      success: true,
      data: {
        player_name: playerToMove.player_name,
        from_table: fromTable,
        to_table: toTable,
        to_seat: openSeat,
        message: `${playerToMove.player_name} moved from Table ${fromTable} → Table ${toTable} Seat ${openSeat}`
      }
    });
  } catch (err) {
    console.error('Must-move transfer error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
