/**
 * Must-Move Games Management API
 * GET /api/commander/games/must-move-status?venue_id=X
 *   Returns active games grouped by type+stakes, with must-move relationships
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
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Auth required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { venue_id } = req.query;
    if (!venue_id) return res.status(400).json({ success: false, error: 'venue_id required' });

    // Get all active games
    const { data: games, error } = await supabase
      .from('commander_games')
      .select('id, game_type, stakes, status, table_id, is_must_move, parent_game_id, created_at')
      .eq('venue_id', venue_id)
      .in('status', ['waiting', 'running'])
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Get table info
    const tableIds = [...new Set((games || []).filter(g => g.table_id).map(g => g.table_id))];
    let tablesMap = {};
    if (tableIds.length > 0) {
      const { data: tables } = await supabase
        .from('commander_tables')
        .select('id, table_number, table_name, max_seats')
        .in('id', tableIds);
      (tables || []).forEach(t => { tablesMap[t.id] = t; });
    }

    // Get player counts per game via time sessions
    const gameIds = (games || []).map(g => g.id);
    let playerCounts = {};
    if (gameIds.length > 0) {
      const { data: sessions } = await supabase
        .from('commander_table_sessions')
        .select('game_id')
        .in('game_id', gameIds)
        .eq('status', 'active');
      (sessions || []).forEach(s => {
        playerCounts[s.game_id] = (playerCounts[s.game_id] || 0) + 1;
      });
    }

    // Enrich games
    const enriched = (games || []).map(g => ({
      ...g,
      table: tablesMap[g.table_id] || null,
      table_number: tablesMap[g.table_id]?.table_number || null,
      table_name: tablesMap[g.table_id]?.table_name || null,
      max_seats: tablesMap[g.table_id]?.max_seats || 9,
      player_count: playerCounts[g.id] || 0,
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
    // Also return all singles for reference
    const singles = Object.values(groups).filter(g => g.all.length === 1);

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
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Auth required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { must_move_game_id, main_game_id } = req.body;
    if (!must_move_game_id || !main_game_id) {
      return res.status(400).json({ success: false, error: 'must_move_game_id and main_game_id required' });
    }

    // Get the must-move game's oldest active session (first in line to move)
    const { data: sessions } = await supabase
      .from('commander_table_sessions')
      .select('id, player_id, player_name, table_number, seat_number, started_at')
      .eq('game_id', must_move_game_id)
      .eq('status', 'active')
      .order('started_at', { ascending: true })
      .limit(1);

    if (!sessions || sessions.length === 0) {
      return res.status(400).json({ success: false, error: 'No players at must-move table' });
    }

    const playerToMove = sessions[0];

    // Find an open seat at the main game table
    const { data: mainGame } = await supabase
      .from('commander_games')
      .select('id, table_id')
      .eq('id', main_game_id)
      .single();

    if (!mainGame) return res.status(404).json({ success: false, error: 'Main game not found' });

    const { data: mainTable } = await supabase
      .from('commander_tables')
      .select('id, table_number, max_seats')
      .eq('id', mainGame.table_id)
      .single();

    if (!mainTable) return res.status(404).json({ success: false, error: 'Main table not found' });

    // Get occupied seats at main table
    const { data: mainSessions } = await supabase
      .from('commander_table_sessions')
      .select('seat_number')
      .eq('game_id', main_game_id)
      .eq('status', 'active');

    const occupiedSeats = new Set((mainSessions || []).map(s => s.seat_number));
    let openSeat = null;
    for (let i = 1; i <= mainTable.max_seats; i++) {
      if (!occupiedSeats.has(i)) { openSeat = i; break; }
    }

    if (openSeat === null) {
      return res.status(400).json({ success: false, error: 'No open seats at main table' });
    }

    // Move the player: update their session to main game/table
    const { error: moveError } = await supabase
      .from('commander_table_sessions')
      .update({
        game_id: main_game_id,
        table_number: mainTable.table_number,
        seat_number: openSeat,
        metadata: { moved_from_must_move: true, moved_at: new Date().toISOString(), original_table: playerToMove.table_number }
      })
      .eq('id', playerToMove.id);

    if (moveError) throw moveError;

    return res.status(200).json({
      success: true,
      data: {
        player_name: playerToMove.player_name,
        from_table: playerToMove.table_number,
        from_seat: playerToMove.seat_number,
        to_table: mainTable.table_number,
        to_seat: openSeat,
        message: `${playerToMove.player_name} moved from Table ${playerToMove.table_number} to Table ${mainTable.table_number} Seat ${openSeat}`
      }
    });
  } catch (err) {
    console.error('Must-move transfer error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
