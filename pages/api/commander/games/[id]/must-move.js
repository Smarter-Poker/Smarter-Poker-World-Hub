/**
 * Commander Must-Move API - POST/DELETE /api/commander/games/:id/must-move
 * Link or unlink must-move game relationships
 * POST: Set this game as a must-move that feeds into a main game
 * DELETE: Remove the must-move link
 * Reference: Phase 2 - Must-Move Games
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Helper to verify staff auth
async function verifyStaffAuth(req) {
  const staffSession = req.headers['x-staff-session'];
  if (!staffSession) {
    return { error: { status: 401, code: 'AUTH_REQUIRED', message: 'Staff authentication required' } };
  }

  let sessionData;
  try {
    sessionData = JSON.parse(staffSession);
  } catch {
    return { error: { status: 401, code: 'INVALID_SESSION', message: 'Invalid session format' } };
  }

  const { data: staff, error: staffError } = await supabase
    .from('commander_staff')
    .select('id, venue_id, role, is_active')
    .eq('id', sessionData.id)
    .eq('is_active', true)
    .single();

  if (staffError || !staff) {
    return { error: { status: 401, code: 'INVALID_STAFF', message: 'Staff member not found or inactive' } };
  }

  return { staff };
}

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
    // Verify staff authentication
    const authResult = await verifyStaffAuth(req);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: { code: authResult.error.code, message: authResult.error.message }
      });
    }

    const { parent_game_id } = req.body;

    if (!parent_game_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'parent_game_id (main game) is required' }
      });
    }

    // Verify this game exists and is active
    const { data: mustMoveGame, error: mmError } = await supabase
      .from('commander_games')
      .select('id, venue_id, game_type, stakes, status, is_must_move, parent_game_id')
      .eq('id', gameId)
      .single();

    if (mmError || !mustMoveGame) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Game not found' }
      });
    }

    if (!['waiting', 'running'].includes(mustMoveGame.status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'GAME_CLOSED', message: 'Cannot link closed games' }
      });
    }

    if (mustMoveGame.is_must_move && mustMoveGame.parent_game_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_LINKED', message: 'This game is already a must-move game' }
      });
    }

    // Verify parent game exists, is compatible, and active
    const { data: mainGame, error: mainError } = await supabase
      .from('commander_games')
      .select('id, venue_id, game_type, stakes, status, is_must_move')
      .eq('id', parent_game_id)
      .single();

    if (mainError || !mainGame) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Parent game not found' }
      });
    }

    // Validate compatibility
    if (mainGame.venue_id !== mustMoveGame.venue_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'INCOMPATIBLE', message: 'Games must be at the same venue' }
      });
    }

    if (mainGame.game_type !== mustMoveGame.game_type || mainGame.stakes !== mustMoveGame.stakes) {
      return res.status(400).json({
        success: false,
        error: { code: 'INCOMPATIBLE', message: 'Games must have same type and stakes' }
      });
    }

    if (!['waiting', 'running'].includes(mainGame.status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'GAME_CLOSED', message: 'Parent game is not active' }
      });
    }

    if (mainGame.is_must_move) {
      return res.status(400).json({
        success: false,
        error: { code: 'CHAIN_ERROR', message: 'Cannot use a must-move game as a parent' }
      });
    }

    // Set this game as a must-move linked to the parent
    const { data: updated, error: updateError } = await supabase
      .from('commander_games')
      .update({
        is_must_move: true,
        parent_game_id: parent_game_id
      })
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
        message: 'Game set as must-move successfully'
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
    // Verify staff authentication
    const authResult = await verifyStaffAuth(req);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: { code: authResult.error.code, message: authResult.error.message }
      });
    }

    // Verify game exists
    const { data: game, error: fetchError } = await supabase
      .from('commander_games')
      .select('id, is_must_move, parent_game_id')
      .eq('id', gameId)
      .single();

    if (fetchError || !game) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Game not found' }
      });
    }

    if (!game.is_must_move || !game.parent_game_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_LINKED', message: 'Game is not a must-move game' }
      });
    }

    // Remove the must-move link
    const { data: updated, error: updateError } = await supabase
      .from('commander_games')
      .update({
        is_must_move: false,
        parent_game_id: null
      })
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
        message: 'Must-move link removed successfully'
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
