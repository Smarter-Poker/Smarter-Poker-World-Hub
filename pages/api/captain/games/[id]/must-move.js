/**
 * Captain Must-Move API - POST/DELETE /api/captain/games/:id/must-move
 * Link or unlink must-move game relationships
 * Reference: Phase 2 - Must-Move Games
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Game ID required' }
    });
  }

  switch (req.method) {
    case 'POST':
      return handlePost(req, res, id);
    case 'DELETE':
      return handleDelete(req, res, id);
    default:
      return res.status(405).json({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
      });
  }
}

async function handlePost(req, res, gameId) {
  try {
    const { must_move_to } = req.body;

    if (!must_move_to) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'must_move_to game ID required' }
      });
    }

    // Verify main game exists and is active
    const { data: mainGame, error: mainError } = await supabase
      .from('captain_games')
      .select('id, venue_id, game_type, stakes, status, must_move_to')
      .eq('id', gameId)
      .single();

    if (mainError || !mainGame) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Main game not found' }
      });
    }

    if (!['waiting', 'running'].includes(mainGame.status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'GAME_CLOSED', message: 'Cannot link closed games' }
      });
    }

    if (mainGame.must_move_to) {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_LINKED', message: 'This game already has a must-move link' }
      });
    }

    // Verify must-move game exists, is compatible, and active
    const { data: mustMoveGame, error: mmError } = await supabase
      .from('captain_games')
      .select('id, venue_id, game_type, stakes, status, must_move_to')
      .eq('id', must_move_to)
      .single();

    if (mmError || !mustMoveGame) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Must-move game not found' }
      });
    }

    // Validate compatibility
    if (mustMoveGame.venue_id !== mainGame.venue_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'INCOMPATIBLE', message: 'Games must be at the same venue' }
      });
    }

    if (mustMoveGame.game_type !== mainGame.game_type || mustMoveGame.stakes !== mainGame.stakes) {
      return res.status(400).json({
        success: false,
        error: { code: 'INCOMPATIBLE', message: 'Games must have same type and stakes' }
      });
    }

    if (!['waiting', 'running'].includes(mustMoveGame.status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'GAME_CLOSED', message: 'Must-move game is not active' }
      });
    }

    if (mustMoveGame.must_move_to) {
      return res.status(400).json({
        success: false,
        error: { code: 'CHAIN_ERROR', message: 'Cannot chain must-move games' }
      });
    }

    // Link the games
    const { data: updated, error: updateError } = await supabase
      .from('captain_games')
      .update({ must_move_to: must_move_to })
      .eq('id', gameId)
      .select()
      .single();

    if (updateError) {
      console.error('Must-move link error:', updateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to link games' }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        game: updated,
        message: 'Games linked successfully'
      }
    });
  } catch (error) {
    console.error('Must-move POST error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handleDelete(req, res, gameId) {
  try {
    // Verify game exists
    const { data: game, error: fetchError } = await supabase
      .from('captain_games')
      .select('id, must_move_to')
      .eq('id', gameId)
      .single();

    if (fetchError || !game) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Game not found' }
      });
    }

    if (!game.must_move_to) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_LINKED', message: 'Game has no must-move link' }
      });
    }

    // Unlink the games
    const { data: updated, error: updateError } = await supabase
      .from('captain_games')
      .update({ must_move_to: null })
      .eq('id', gameId)
      .select()
      .single();

    if (updateError) {
      console.error('Must-move unlink error:', updateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to unlink games' }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        game: updated,
        message: 'Games unlinked successfully'
      }
    });
  } catch (error) {
    console.error('Must-move DELETE error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
