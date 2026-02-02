/**
 * Table Balance API - POST /api/commander/games/[id]/balance
 * Suggests player moves to balance tables for a game type/stakes
 * Reference: ENHANCEMENTS.md - Optimal Table Balancing
 */
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const { id: gameId } = req.query;

  if (!gameId) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Game ID required' }
    });
  }

  try {
    // Fetch the reference game to get venue, type, stakes
    const { data: refGame, error: gameError } = await supabase
      .from('commander_games')
      .select('id, venue_id, game_type, stakes, player_count, max_players, table_id')
      .eq('id', gameId)
      .single();

    if (gameError || !refGame) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Game not found' }
      });
    }

    // Require staff auth at this venue
    const staff = await requireStaff(req, res, refGame.venue_id);
    if (!staff) return;

    // Fetch all running games of the same type and stakes at this venue
    const { data: games, error: gamesError } = await supabase
      .from('commander_games')
      .select('id, table_id, player_count, max_players, status')
      .eq('venue_id', refGame.venue_id)
      .eq('game_type', refGame.game_type)
      .eq('stakes', refGame.stakes)
      .eq('status', 'running');

    if (gamesError) throw gamesError;

    if (!games || games.length < 2) {
      return res.status(200).json({
        success: true,
        data: {
          balanced: true,
          message: 'Only one table running - no balancing needed',
          suggestions: []
        }
      });
    }

    // Calculate ideal player count per table
    const totalPlayers = games.reduce((sum, g) => sum + (g.player_count || 0), 0);
    const tableCount = games.length;
    const idealPerTable = Math.round(totalPlayers / tableCount);

    // Sort tables by player count (most players first)
    const sorted = [...games].sort((a, b) => (b.player_count || 0) - (a.player_count || 0));

    const suggestions = [];
    const overloaded = sorted.filter(g => (g.player_count || 0) > idealPerTable);
    const underloaded = sorted.filter(g => (g.player_count || 0) < idealPerTable);

    for (const over of overloaded) {
      for (const under of underloaded) {
        const overCount = over.player_count || 0;
        const underCount = under.player_count || 0;
        const diff = overCount - underCount;

        if (diff > 1) {
          const moveCount = Math.floor(diff / 2);
          suggestions.push({
            from_game_id: over.id,
            from_table_id: over.table_id,
            from_player_count: overCount,
            to_game_id: under.id,
            to_table_id: under.table_id,
            to_player_count: underCount,
            move_count: moveCount,
            reason: `Move ${moveCount} player${moveCount > 1 ? 's' : ''} to balance tables (${overCount} -> ${overCount - moveCount}, ${underCount} -> ${underCount + moveCount})`
          });
        }
      }
    }

    const maxDiff = (sorted[0]?.player_count || 0) - (sorted[sorted.length - 1]?.player_count || 0);

    return res.status(200).json({
      success: true,
      data: {
        balanced: maxDiff <= 1,
        totalPlayers,
        tableCount,
        idealPerTable,
        maxImbalance: maxDiff,
        tables: games.map(g => ({
          game_id: g.id,
          table_id: g.table_id,
          player_count: g.player_count,
          max_players: g.max_players,
          deviation: (g.player_count || 0) - idealPerTable
        })),
        suggestions
      }
    });
  } catch (error) {
    console.error('Table balance error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to calculate table balance' }
    });
  }
}
