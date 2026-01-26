/**
 * Get Single Hand API
 * GET /api/captain/hands/[handId]
 * Per API_REFERENCE.md: /hands/:handId
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }
    });
  }

  const { handId } = req.query;

  // Require authentication
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Invalid token' }
      });
    }

    // Get hand with related data
    const { data: hand, error } = await supabase
      .from('captain_hand_history')
      .select(`
        *,
        captain_games(id, game_type, stakes),
        captain_tables(
          id,
          table_number,
          poker_venues(id, name)
        )
      `)
      .eq('id', handId)
      .single();

    if (error || !hand) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Hand not found' }
      });
    }

    // Format actions by street
    const actionsByStreet = {
      preflop: [],
      flop: [],
      turn: [],
      river: []
    };

    if (hand.actions) {
      hand.actions.forEach(action => {
        const street = action.street || 'preflop';
        if (actionsByStreet[street]) {
          actionsByStreet[street].push(action);
        }
      });
    }

    // Determine winner info
    const winners = hand.winners || [];
    const playerCards = hand.player_cards ? Object.values(hand.player_cards)[0] : [];
    const isWinner = winners.length > 0;
    const profit = isWinner ? Math.round(hand.pot_size / 2) : -Math.round(hand.pot_size / 4);
    const winningHand = winners[0]?.hand_name || null;

    // Format response
    const formattedHand = {
      id: hand.id,
      hand_number: hand.hand_number,
      game_type: `${hand.captain_games?.stakes || ''} ${hand.captain_games?.game_type || 'NLH'}`.trim(),
      venue_name: hand.captain_tables?.poker_venues?.name || 'Unknown Venue',
      player_seat: 4, // Placeholder - would come from session
      player_cards: playerCards,
      board: hand.board || [],
      pot_size: hand.pot_size || 0,
      profit: profit,
      result: isWinner ? 'won' : 'lost',
      winning_hand: winningHand,
      actions_by_street: actionsByStreet,
      rfid_captured: hand.rfid_captured,
      created_at: hand.created_at
    };

    return res.status(200).json({
      success: true,
      data: { hand: formattedHand }
    });

  } catch (error) {
    console.error('Hand detail API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch hand' }
    });
  }
}
