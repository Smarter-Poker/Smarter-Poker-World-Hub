/**
 * Club Commander Game API - GET/PATCH/DELETE /api/club-commander/games/:id
 * Get, update, or close a game
 * Reference: API_REFERENCE.md - Games section
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const VALID_STATUSES = ['waiting', 'running', 'breaking', 'closed'];

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Game ID required' }
    });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, id);
    case 'PATCH':
      return handlePatch(req, res, id);
    case 'DELETE':
      return handleDelete(req, res, id);
    default:
      return res.status(405).json({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
      });
  }
}

async function handleGet(req, res, gameId) {
  try {
    const { data: game, error } = await supabase
      .from('captain_games')
      .select(`
        *,
        poker_venues (
          id,
          name,
          city,
          state
        ),
        captain_tables (
          id,
          table_number,
          table_name,
          max_seats
        ),
        captain_seats (
          id,
          seat_number,
          player_id,
          player_name,
          status,
          seated_at
        )
      `)
      .eq('id', gameId)
      .single();

    if (error || !game) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Game not found' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { game }
    });
  } catch (error) {
    console.error('Club Commander game GET error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handlePatch(req, res, gameId) {
  try {
    // TODO: Add staff authentication check (Step 1.3)

    const { status, current_players, settings } = req.body;

    // Verify game exists
    const { data: existingGame, error: fetchError } = await supabase
      .from('captain_games')
      .select('id, status, table_id')
      .eq('id', gameId)
      .single();

    if (fetchError || !existingGame) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Game not found' }
      });
    }

    if (existingGame.status === 'closed') {
      return res.status(400).json({
        success: false,
        error: { code: 'GAME_CLOSED', message: 'Cannot update a closed game' }
      });
    }

    const updates = {};

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
          }
        });
      }
      updates.status = status;

      // Set started_at when game starts running
      if (status === 'running' && existingGame.status === 'waiting') {
        updates.started_at = new Date().toISOString();
      }

      // Set closed_at when game closes
      if (status === 'closed') {
        updates.closed_at = new Date().toISOString();
      }
    }

    if (current_players !== undefined) {
      updates.current_players = current_players;
    }

    if (settings !== undefined) {
      updates.settings = settings;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' }
      });
    }

    const { data: game, error: updateError } = await supabase
      .from('captain_games')
      .update(updates)
      .eq('id', gameId)
      .select()
      .single();

    if (updateError) {
      console.error('Club Commander game PATCH error:', updateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to update game' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { game }
    });
  } catch (error) {
    console.error('Club Commander game PATCH error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handleDelete(req, res, gameId) {
  try {
    // TODO: Add staff authentication check (Step 1.3)

    // Verify game exists
    const { data: game, error: fetchError } = await supabase
      .from('captain_games')
      .select('id, status, table_id')
      .eq('id', gameId)
      .single();

    if (fetchError || !game) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Game not found' }
      });
    }

    // Close the game (soft delete)
    const { error: updateError } = await supabase
      .from('captain_games')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString()
      })
      .eq('id', gameId);

    if (updateError) {
      console.error('Club Commander game DELETE error:', updateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to close game' }
      });
    }

    // Release the table if one was assigned
    if (game.table_id) {
      await supabase
        .from('captain_tables')
        .update({
          status: 'available',
          current_game_id: null
        })
        .eq('id', game.table_id);
    }

    return res.status(200).json({
      success: true,
      data: { message: 'Game closed successfully' }
    });
  } catch (error) {
    console.error('Club Commander game DELETE error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
