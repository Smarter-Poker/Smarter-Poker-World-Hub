/**
 * Tournament Registration API
 * POST /api/captain/tournaments/:id/register
 * DELETE /api/captain/tournaments/:id/register
 */
import { createClient } from '@supabase/supabase-js';
import { awardXP } from '../../../../../src/lib/captain/xp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'POST') {
    return handleRegister(req, res, id);
  } else if (req.method === 'DELETE') {
    return handleUnregister(req, res, id);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function handleRegister(req, res, tournamentId) {
  const { player_id, payment_method = 'cash', registered_by } = req.body;

  if (!player_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'player_id required' }
    });
  }

  try {
    // Get tournament details
    const { data: tournament, error: tError } = await supabase
      .from('captain_tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();

    if (tError || !tournament) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tournament not found' }
      });
    }

    // Check if registration is open
    if (tournament.status !== 'registration' && tournament.status !== 'scheduled') {
      return res.status(400).json({
        success: false,
        error: { code: 'REGISTRATION_CLOSED', message: 'Registration is closed' }
      });
    }

    // Check if already registered
    const { data: existing } = await supabase
      .from('captain_tournament_entries')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('player_id', player_id)
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_REGISTERED', message: 'Already registered' }
      });
    }

    // Check capacity
    const { count } = await supabase
      .from('captain_tournament_entries')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .neq('status', 'cancelled');

    if (tournament.max_entries && count >= tournament.max_entries) {
      return res.status(400).json({
        success: false,
        error: { code: 'TOURNAMENT_FULL', message: 'Tournament is full' }
      });
    }

    // Check responsible gaming
    const { data: exclusion } = await supabase
      .from('captain_self_exclusions')
      .select('id')
      .eq('player_id', player_id)
      .eq('status', 'active')
      .gte('end_date', new Date().toISOString())
      .single();

    if (exclusion) {
      return res.status(403).json({
        success: false,
        error: { code: 'EXCLUDED', message: 'Player is self-excluded' }
      });
    }

    // Create entry
    const { data: entry, error } = await supabase
      .from('captain_tournament_entries')
      .insert({
        tournament_id: tournamentId,
        player_id,
        buy_in_amount: tournament.buy_in,
        payment_method,
        payment_status: payment_method === 'comp' ? 'paid' : 'pending',
        registered_by: registered_by || player_id,
        status: 'registered'
      })
      .select()
      .single();

    if (error) throw error;

    // Update tournament entry count
    await supabase.rpc('increment', {
      table_name: 'captain_tournaments',
      row_id: tournamentId,
      column_name: 'total_entries'
    }).catch(() => {
      // Fallback if RPC doesn't exist
      supabase
        .from('captain_tournaments')
        .update({ total_entries: (tournament.total_entries || 0) + 1 })
        .eq('id', tournamentId);
    });

    // Award XP for tournament registration
    if (player_id) {
      await awardXP(player_id, 'tournament.registered', {
        tournament_id: tournamentId,
        tournament_name: tournament.name,
        buyin: tournament.buyin_amount
      });
    }

    return res.status(201).json({
      success: true,
      data: { entry }
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to register' }
    });
  }
}

async function handleUnregister(req, res, tournamentId) {
  const { player_id } = req.body;

  if (!player_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'player_id required' }
    });
  }

  try {
    // Check tournament status
    const { data: tournament } = await supabase
      .from('captain_tournaments')
      .select('status')
      .eq('id', tournamentId)
      .single();

    if (tournament?.status === 'running' || tournament?.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: { code: 'TOURNAMENT_STARTED', message: 'Cannot unregister after tournament starts' }
      });
    }

    const { error } = await supabase
      .from('captain_tournament_entries')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('tournament_id', tournamentId)
      .eq('player_id', player_id)
      .eq('status', 'registered');

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { message: 'Registration cancelled' }
    });
  } catch (error) {
    console.error('Unregister error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to unregister' }
    });
  }
}
