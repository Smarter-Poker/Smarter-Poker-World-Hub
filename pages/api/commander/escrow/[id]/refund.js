/**
 * Escrow Refund API
 * POST /api/commander/escrow/[id]/refund - Refund escrowed funds to player
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

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_ID', message: 'Escrow ID required' }
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

    const { reason } = req.body;

    // Get escrow transaction
    const { data: escrow, error: escrowError } = await supabase
      .from('commander_escrow_transactions')
      .select(`
        *,
        commander_home_games:home_game_id (id, host_id, status)
      `)
      .eq('id', id)
      .single();

    if (escrowError || !escrow) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Escrow transaction not found' }
      });
    }

    const isHost = escrow.commander_home_games?.host_id === user.id;
    const isPlayer = escrow.player_id === user.id;
    const gameStatus = escrow.commander_home_games?.status;

    // Host can refund, or player can refund if game is cancelled
    if (!isHost && !isPlayer) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not authorized to refund this escrow' }
      });
    }

    // Player can only refund if game is cancelled
    if (isPlayer && !isHost && gameStatus !== 'cancelled') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Players can only request refunds for cancelled games' }
      });
    }

    if (escrow.status !== 'held' && escrow.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: `Cannot refund escrow with status: ${escrow.status}` }
      });
    }

    // Update escrow to refunded
    const { data: updated, error } = await supabase
      .from('commander_escrow_transactions')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
        notes: reason || 'Refund requested'
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { escrow: updated }
    });
  } catch (error) {
    console.error('Escrow refund error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to refund escrow' }
    });
  }
}
