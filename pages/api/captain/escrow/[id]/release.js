/**
 * Escrow Release API
 * POST /api/captain/escrow/[id]/release - Release escrowed funds to host
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

    // Get escrow transaction
    const { data: escrow, error: escrowError } = await supabase
      .from('captain_escrow_transactions')
      .select(`
        *,
        captain_home_games:home_game_id (id, host_id)
      `)
      .eq('id', id)
      .single();

    if (escrowError || !escrow) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Escrow transaction not found' }
      });
    }

    // Only the player who deposited can release to host
    if (escrow.player_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the depositor can release funds' }
      });
    }

    if (escrow.status !== 'held' && escrow.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: `Cannot release escrow with status: ${escrow.status}` }
      });
    }

    const hostId = escrow.captain_home_games?.host_id;

    // Update escrow to released
    const { data: updated, error } = await supabase
      .from('captain_escrow_transactions')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        released_to: hostId
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
    console.error('Escrow release error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to release escrow' }
    });
  }
}
