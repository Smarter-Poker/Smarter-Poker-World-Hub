/**
 * Tournament Clock API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 3
 * GET /api/commander/tournaments/[id]/clock - Get clock state
 * POST /api/commander/tournaments/[id]/clock - Clock actions (start, pause, resume, next_level, etc.)
 *
 * Clock state is persisted in the tournament row (clock_state JSONB column)
 * so it survives server restarts and works across multiple instances.
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../../src/lib/commander/auth';
import {
  sendPushNotification,
  isOneSignalConfigured
} from '../../../../../src/lib/commander/pushNotifications';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const _g = await guardWriteStaff(req, res); if (!_g) return;

  const { id: tournamentId } = req.query;

  if (!tournamentId) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Tournament ID required' }
    });
  }

  if (req.method === 'GET') {
    return getClockState(req, res, tournamentId);
  }

  if (req.method === 'POST') {
    return handleClockAction(req, res, tournamentId);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function getClockState(req, res, tournamentId) {
  try {
    const { data: tournament, error } = await supabase
      .from('commander_tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();

    if (error || !tournament) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tournament not found' }
      });
    }

    const blindStructure = tournament.blind_structure || [];
    const currentLevel = tournament.current_level || 0;
    const currentBlind = blindStructure[currentLevel] || null;

    // Read persisted clock state from the settings JSONB (not the clock_state column which has schema cache issues)
    const settings = tournament.settings || {};
    let clockState = settings.clock_state || null;

    if (!clockState && ['running', 'paused', 'final_table'].includes(tournament.status)) {
      // Initialize clock state and persist it
      clockState = {
        isRunning: true,
        levelStartedAt: tournament.actual_start || new Date().toISOString(),
        pausedAt: null,
        pausedDuration: 0
      };
      const updatedSettings = { ...settings, clock_state: clockState };
      await supabase
        .from('commander_tournaments')
        .update({ settings: updatedSettings })
        .eq('id', tournamentId);
    }

    // Calculate time remaining in level
    let timeRemaining = 0;
    if (currentBlind && clockState) {
      const levelDuration = currentBlind.duration * 60 * 1000; // Convert to ms
      const elapsed = clockState.isRunning
        ? Date.now() - new Date(clockState.levelStartedAt).getTime() - clockState.pausedDuration
        : clockState.pausedAt
          ? new Date(clockState.pausedAt).getTime() - new Date(clockState.levelStartedAt).getTime() - clockState.pausedDuration
          : 0;

      timeRemaining = Math.max(0, levelDuration - elapsed);
    }

    const nextBlind = blindStructure[currentLevel + 1] || null;

    return res.status(200).json({
      success: true,
      data: {
        tournament: {
          id: tournament.id,
          name: tournament.name,
          status: tournament.status,
          current_level: currentLevel,
          current_entries: tournament.current_entries,
          players_remaining: tournament.players_remaining,
          average_stack: tournament.average_stack,
          total_chips_in_play: tournament.total_chips_in_play
        },
        clock: {
          isRunning: clockState?.isRunning || false,
          isPaused: tournament.status === 'paused',
          timeRemaining: Math.floor(timeRemaining / 1000), // in seconds
          levelDuration: currentBlind?.duration || 0, // in minutes
          levelStartedAt: clockState?.levelStartedAt
        },
        currentBlind: currentBlind ? {
          level: currentLevel + 1,
          smallBlind: currentBlind.small_blind,
          bigBlind: currentBlind.big_blind,
          ante: currentBlind.ante || 0,
          duration: currentBlind.duration
        } : null,
        nextBlind: nextBlind ? {
          level: currentLevel + 2,
          smallBlind: nextBlind.small_blind,
          bigBlind: nextBlind.big_blind,
          ante: nextBlind.ante || 0,
          duration: nextBlind.duration
        } : null,
        blindStructure: blindStructure.map((b, i) => ({
          level: i + 1,
          smallBlind: b.small_blind,
          bigBlind: b.big_blind,
          ante: b.ante || 0,
          duration: b.duration,
          isBreak: b.is_break || false,
          isCurrent: i === currentLevel
        }))
      }
    });
  } catch (error) {
    console.error('Get clock state error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to get clock state' }
    });
  }
}

async function handleClockAction(req, res, tournamentId) {
  try {
    // Staff is already validated by guardWriteStaff at the handler level

    const { action } = req.body;

    // Get tournament
    const { data: tournament, error: fetchError } = await supabase
      .from('commander_tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();

    if (fetchError || !tournament) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tournament not found' }
      });
    }

    // Read persisted clock state from settings
    const settings = tournament.settings || {};
    let clockState = settings.clock_state || {
      isRunning: false,
      levelStartedAt: null,
      pausedAt: null,
      pausedDuration: 0
    };

    let updates = {};

    switch (action) {
      case 'start':
        if (tournament.status === 'running') {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Tournament already running' }
          });
        }
        updates = {
          status: 'running',
          actual_start: new Date().toISOString(),
          current_level: 0
        };
        clockState = {
          isRunning: true,
          levelStartedAt: new Date().toISOString(),
          pausedAt: null,
          pausedDuration: 0
        };

        // --- Push Notification: Tournament Starting ---
        fireTournamentStartNotification(tournamentId, tournament.name).catch(err =>
          console.warn('[clock.js] Start notification failed:', err.message)
        );

        break;

      case 'pause':
        if (tournament.status !== 'running') {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Tournament is not running' }
          });
        }
        updates = { status: 'paused' };
        clockState = {
          isRunning: false,
          levelStartedAt: clockState.levelStartedAt,
          pausedAt: new Date().toISOString(),
          pausedDuration: clockState.pausedDuration || 0
        };
        break;

      case 'resume':
        if (tournament.status !== 'paused') {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Tournament is not paused' }
          });
        }
        updates = { status: 'running' };
        clockState = {
          isRunning: true,
          levelStartedAt: clockState.levelStartedAt,
          pausedAt: null,
          pausedDuration: (clockState.pausedDuration || 0) + (clockState.pausedAt ? Date.now() - new Date(clockState.pausedAt).getTime() : 0)
        };
        break;

      case 'next_level': {
        if (!['running', 'paused'].includes(tournament.status)) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Tournament is not active' }
          });
        }
        const blindStructure = tournament.blind_structure || [];
        const nextLevel = (tournament.current_level || 0) + 1;

        if (nextLevel >= blindStructure.length) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'No more levels in structure' }
          });
        }

        updates = { current_level: nextLevel };
        clockState = {
          isRunning: tournament.status === 'running',
          levelStartedAt: new Date().toISOString(),
          pausedAt: tournament.status === 'paused' ? new Date().toISOString() : null,
          pausedDuration: 0
        };
        break;
      }

      case 'prev_level':
      case 'previous_level': {
        if (!['running', 'paused'].includes(tournament.status)) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Tournament is not active' }
          });
        }
        const prevLevel = Math.max(0, (tournament.current_level || 0) - 1);
        updates = { current_level: prevLevel };
        clockState = {
          isRunning: tournament.status === 'running',
          levelStartedAt: new Date().toISOString(),
          pausedAt: tournament.status === 'paused' ? new Date().toISOString() : null,
          pausedDuration: 0
        };
        break;
      }

      case 'set_level': {
        const { level } = req.body;
        if (typeof level !== 'number' || level < 0) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Valid level required' }
          });
        }
        updates = { current_level: level };
        clockState = {
          isRunning: tournament.status === 'running',
          levelStartedAt: new Date().toISOString(),
          pausedAt: tournament.status === 'paused' ? new Date().toISOString() : null,
          pausedDuration: 0
        };
        break;
      }

      case 'add_time': {
        // Add 60 seconds to remaining time by pushing levelStartedAt 60s earlier (less elapsed → more remaining)
        if (!clockState.levelStartedAt) break;
        const started = new Date(clockState.levelStartedAt);
        started.setSeconds(started.getSeconds() - 60);
        clockState.levelStartedAt = started.toISOString();
        break;
      }

      case 'subtract_time': {
        // Remove 60 seconds from remaining time by pushing levelStartedAt 60s later (more elapsed → less remaining)
        if (!clockState.levelStartedAt) break;
        const started2 = new Date(clockState.levelStartedAt);
        started2.setSeconds(started2.getSeconds() + 60);
        clockState.levelStartedAt = started2.toISOString();
        break;
      }

      case 'break': {
        // Toggle on_break in the clock_state JSONB column (same column hand-for-hand uses)
        const currentClockState = tournament.clock_state || {};
        const isCurrentlyOnBreak = currentClockState.on_break || false;
        const updatedBreakState = {
          ...currentClockState,
          on_break: !isCurrentlyOnBreak,
          break_started_at: !isCurrentlyOnBreak ? new Date().toISOString() : null
        };
        // Write to clock_state column (not settings) — matches floor-view.js read path
        await supabase
          .from('commander_tournaments')
          .update({ clock_state: updatedBreakState })
          .eq('id', tournamentId);
        // If starting break, pause the clock; if ending break, resume it
        if (!isCurrentlyOnBreak && tournament.status === 'running') {
          updates = { status: 'paused' };
          clockState = {
            isRunning: false,
            levelStartedAt: clockState.levelStartedAt,
            pausedAt: new Date().toISOString(),
            pausedDuration: clockState.pausedDuration || 0
          };
        } else if (isCurrentlyOnBreak && tournament.status === 'paused') {
          updates = { status: 'running' };
          clockState = {
            isRunning: true,
            levelStartedAt: clockState.levelStartedAt,
            pausedAt: null,
            pausedDuration: (clockState.pausedDuration || 0) + (clockState.pausedAt ? Date.now() - new Date(clockState.pausedAt).getTime() : 0)
          };
        }
        break;
      }

      case 'final_table':
        if (tournament.status !== 'running') {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Tournament is not running' }
          });
        }
        updates = { status: 'final_table' };
        break;

      case 'end':
        if (!['running', 'paused', 'final_table'].includes(tournament.status)) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Tournament cannot be ended' }
          });
        }
        updates = {
          status: 'completed',
          ended_at: new Date().toISOString()
        };
        clockState = null;
        break;

      default:
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid action' }
        });
    }

    // Persist status/level updates AND clock_state together via settings
    const currentSettings = tournament.settings || {};
    const updatedSettings = { ...currentSettings, clock_state: clockState };
    const updatePayload = {
      ...updates,
      settings: updatedSettings
    };

    const { error: updateError } = await supabase
      .from('commander_tournaments')
      .update(updatePayload)
      .eq('id', tournamentId);

    if (updateError) {
      console.error('[clock.js] Update error:', JSON.stringify(updateError, null, 2));
      return res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: updateError.message }
      });
    }

    // Re-fetch the updated tournament
    const { data: updated } = await supabase
      .from('commander_tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();

    return res.status(200).json({
      success: true,
      data: {
        tournament: updated,
        clock: clockState,
        message: `Tournament ${action} successful`
      }
    });
  } catch (error) {
    console.error('[clock.js] Clock action exception:', error.message, error.stack);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message || 'Failed to perform clock action' }
    });
  }
}

// --- Push Notification: Mass notify all players that tournament is starting ---
async function fireTournamentStartNotification(tournamentId, tournamentName) {
  if (!isOneSignalConfigured()) return;

  const { data: entries } = await supabase
    .from('commander_tournament_entries')
    .select('player_id')
    .eq('tournament_id', tournamentId)
    .in('status', ['registered', 'seated', 'active']);

  const playerIds = (entries || []).map(e => e.player_id).filter(Boolean);
  if (playerIds.length === 0) return;

  await sendPushNotification({
    externalUserIds: playerIds,
    title: `${tournamentName || 'Tournament'} Starting Now`,
    message: 'The tournament is starting! Please take your seat.',
    url: `/hub/commander/tournament/${tournamentId}/my-status`,
    data: { type: 'tournament_starting', tournament_id: tournamentId }
  });
}
