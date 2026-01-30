/**
 * Tournament Registration API
 * POST /api/commander/tournaments/:id/register
 * DELETE /api/commander/tournaments/:id/register
 */
import { createClient } from '@supabase/supabase-js';

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
  const { player_id } = req.body;

  if (!player_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'player_id required' }
    });
  }

  try {
    // Get tournament details
    const { data: tournament, error: tError } = await supabase
      .from('commander_tournaments')
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
      .from('commander_tournament_entries')
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
      .from('commander_tournament_entries')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .neq('status', 'cancelled');

    if (tournament.max_entries && count >= tournament.max_entries) {
      return res.status(400).json({
        success: false,
        error: { code: 'TOURNAMENT_FULL', message: 'Tournament is full' }
      });
    }

    // Check responsible gaming - self-exclusions
    const { data: exclusion } = await supabase
      .from('commander_self_exclusions')
      .select('id, exclusion_type, expires_at')
      .eq('player_id', player_id)
      .or(`venue_id.eq.${tournament.venue_id},scope.eq.network`)
      .is('lifted_at', null)
      .or('expires_at.is.null,expires_at.gt.now()')
      .limit(1)
      .single();

    if (exclusion) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SELF_EXCLUDED',
          message: 'You have an active self-exclusion and cannot register at this time.',
          exclusion_type: exclusion.exclusion_type,
          expires_at: exclusion.expires_at
        }
      });
    }

    // Check spending limits
    const { data: limits } = await supabase
      .from('commander_spending_limits')
      .select('daily_limit')
      .eq('player_id', player_id)
      .single();

    if (limits?.daily_limit) {
      // Get today's tournament registrations total
      const today = new Date().toISOString().split('T')[0];
      const { data: todayEntries } = await supabase
        .from('commander_tournament_entries')
        .select('total_invested')
        .eq('player_id', player_id)
        .gte('registered_at', today)
        .neq('status', 'cancelled');

      const todaySpend = (todayEntries || []).reduce((sum, e) => sum + (e.total_invested || 0), 0);

      if (todaySpend + tournament.buyin_amount > limits.daily_limit) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'LIMIT_EXCEEDED',
            message: `Registration would exceed your daily limit of $${limits.daily_limit}`,
            current_spend: todaySpend,
            limit: limits.daily_limit
          }
        });
      }
    }

    // Create entry (total_invested is auto-calculated by DB trigger)
    const { data: entry, error } = await supabase
      .from('commander_tournament_entries')
      .insert({
        tournament_id: tournamentId,
        player_id,
        registration_method: 'app',
        status: 'registered'
      })
      .select()
      .single();

    if (error) throw error;

    // Note: current_entries is auto-updated by the update_tournament_stats trigger

    // XP system removed

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
      .from('commander_tournaments')
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
      .from('commander_tournament_entries')
      .update({
        status: 'eliminated',
        notes: 'Registration cancelled'
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
