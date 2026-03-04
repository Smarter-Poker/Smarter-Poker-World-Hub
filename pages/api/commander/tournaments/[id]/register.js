/**
 * Tournament Registration API
 * POST /api/commander/tournaments/:id/register
 * DELETE /api/commander/tournaments/:id/register
 * 
 * Push Notifications: Fires registration confirmation to player
 * Auto-Stories: Creates "Just registered" story
 */
import { createClient } from '@supabase/supabase-js';
import { guardStaff } from '../../../../../src/lib/commander/auth';
import {
  sendPushNotification,
  isOneSignalConfigured
} from '../../../../../src/lib/commander/pushNotifications';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Auth guard: require staff auth
  const _staff = await guardStaff(req, res);
  if (!_staff) return;

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
    if (!['scheduled', 'registering', 'running'].includes(tournament.status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'REGISTRATION_CLOSED', message: 'Registration is closed' }
      });
    }

    // Check if already registered (exclude cancelled/eliminated — they can re-register)
    const { data: existing } = await supabase
      .from('commander_tournament_entries')
      .select('id, status')
      .eq('tournament_id', tournamentId)
      .eq('player_id', player_id)
      .not('status', 'in', '("eliminated","cancelled")')
      .maybeSingle();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_REGISTERED', message: 'Already registered' }
      });
    }

    // Check capacity (Only count players physically occupying or waiting for a seat)
    const { count } = await supabase
      .from('commander_tournament_entries')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .in('status', ['registered', 'seated', 'active']);

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

    // --- FINANCIAL FRAUD PROTECTION ---
    // Record the cash liability atomically with the registration.
    // This prevents a split-brain vulnerability where the client tab closes after creating the registration
    // but before logging the cash drawer transaction.
    const totalAmount = (tournament.buyin_amount || 0) + (tournament.buyin_fee || 0);
    if (totalAmount > 0) {
      const { data: profile } = await supabase.from('profiles').select('display_name, first_name, last_name').eq('id', player_id).single();
      const pName = req.body.player_name || profile?.display_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Unknown Player';

      await supabase.from('commander_cash_transactions').insert({
        venue_id: tournament.venue_id,
        player_name: pName,
        type: 'buy_in',
        amount: totalAmount,
        payment_method: 'cash',
        processed_by: _staff.id || null,
        notes: `Tournament: ${tournament.name || 'Tournament'} (Buy-In: $${tournament.buyin_amount || 0}, Fee: $${tournament.buyin_fee || 0})`
      });
    }

    // Note: current_entries is auto-updated by the update_tournament_stats trigger

    // XP system removed

    // --- Push Notification: Registration Confirmation ---
    if (player_id && isOneSignalConfigured()) {
      const startTime = tournament.scheduled_start
        ? new Date(tournament.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'TBD';
      sendPushNotification({
        externalUserIds: [player_id],
        title: 'Registration Confirmed',
        message: `You're registered for ${tournament.name}! Starts at ${startTime}.`,
        url: `/hub/commander/tournament/${tournamentId}/my-status`,
        data: { type: 'tournament_registered', tournament_id: tournamentId }
      }).catch(err => console.warn('[register.js] Push failed:', err.message));
    }

    // --- Auto-Story: Registration ---
    if (player_id) {
      supabase
        .from('social_stories')
        .insert({
          author_id: player_id,
          content: `Just registered for ${tournament.name}! Let's go!`,
          media_type: 'text',
          background_color: 'linear-gradient(135deg, #1877F2 0%, #0A5DC2 100%)'
        })
        .then(() => { })
        .catch(err => console.warn('[register.js] Auto-story failed:', err.message));
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
        status: 'cancelled',
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
