/**
 * Escrow Deposit API
 * POST /api/commander/escrow/deposit - Create escrow deposit for home game
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed' }
    });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authorization required' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
      });
    }

    const { home_game_id, amount, payment_method, payment_reference } = req.body;

    if (!home_game_id || !amount) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'home_game_id and amount required' }
      });
    }

    // Verify home game exists
    const { data: game, error: gameError } = await supabase
      .from('commander_home_games')
      .select('id, host_id, buyin_min, buyin_max, status')
      .eq('id', home_game_id)
      .single();

    if (gameError || !game) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Home game not found' }
      });
    }

    if (game.status === 'cancelled' || game.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: { code: 'GAME_CLOSED', message: 'This game is no longer accepting deposits' }
      });
    }

    // Validate amount
    if (game.buyin_min && amount < game.buyin_min) {
      return res.status(400).json({
        success: false,
        error: { code: 'AMOUNT_TOO_LOW', message: `Minimum buy-in is $${game.buyin_min}` }
      });
    }

    if (game.buyin_max && amount > game.buyin_max) {
      return res.status(400).json({
        success: false,
        error: { code: 'AMOUNT_TOO_HIGH', message: `Maximum buy-in is $${game.buyin_max}` }
      });
    }

    // Check for existing pending deposit
    const { data: existing } = await supabase
      .from('commander_escrow_transactions')
      .select('id')
      .eq('home_game_id', home_game_id)
      .eq('player_id', user.id)
      .eq('status', 'pending')
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: { code: 'EXISTING_DEPOSIT', message: 'You already have a pending deposit for this game' }
      });
    }

    // Create escrow transaction
    const { data: escrow, error } = await supabase
      .from('commander_escrow_transactions')
      .insert({
        home_game_id,
        player_id: user.id,
        amount,
        status: 'pending',
        payment_method: payment_method || 'pending',
        payment_reference
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      data: { escrow }
    });
  } catch (error) {
    console.error('Escrow deposit error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to create deposit' }
    });
  }
}
