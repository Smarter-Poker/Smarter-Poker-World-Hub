/**
 * Tournament Clock API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 3
 * GET /api/commander/tournaments/[id]/clock - Get clock state
 * POST /api/commander/tournaments/[id]/clock - Clock actions (start, pause, resume, next_level, etc.)
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// In-memory clock state (in production, use Redis or database)
const clockStates = new Map();

export default async function handler(req, res) {
  const { id: tournamentId } = req.query;

  if (!tournamentId) {
    return res.status(400).json({ error: 'Tournament ID required' });
  }

  if (req.method === 'GET') {
    return getClockState(req, res, tournamentId);
  }

  if (req.method === 'POST') {
    return handleClockAction(req, res, tournamentId);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function getClockState(req, res, tournamentId) {
  try {
    const { data: tournament, error } = await supabase
      .from('commander_tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();

    if (error || !tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const blindStructure = tournament.blind_structure || [];
    const currentLevel = tournament.current_level || 0;
    const currentBlind = blindStructure[currentLevel] || null;

    // Get clock state from memory or calculate
    let clockState = clockStates.get(tournamentId);

    if (!clockState && tournament.status === 'running') {
      // Initialize clock state
      clockState = {
        isRunning: true,
        levelStartedAt: tournament.actual_start || new Date().toISOString(),
        pausedAt: null,
        pausedDuration: 0
      };
      clockStates.set(tournamentId, clockState);
    }

    // Calculate time remaining in level
    let timeRemaining = 0;
    if (currentBlind && clockState) {
      const levelDuration = currentBlind.duration * 60 * 1000; // Convert to ms
      const elapsed = clockState.isRunning
        ? Date.now() - new Date(clockState.levelStartedAt).getTime() - clockState.pausedDuration
        : new Date(clockState.pausedAt).getTime() - new Date(clockState.levelStartedAt).getTime() - clockState.pausedDuration;

      timeRemaining = Math.max(0, levelDuration - elapsed);
    }

    const nextBlind = blindStructure[currentLevel + 1] || null;

    return res.status(200).json({
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
    });
  } catch (error) {
    console.error('Get clock state error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function handleClockAction(req, res, tournamentId) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { action } = req.body;

    // Get tournament
    const { data: tournament, error: fetchError } = await supabase
      .from('commander_tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();

    if (fetchError || !tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Verify staff access
    const { data: staff, error: staffError } = await supabase
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', tournament.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (staffError || !staff) {
      return res.status(403).json({ error: 'You are not staff at this venue' });
    }

    let clockState = clockStates.get(tournamentId) || {
      isRunning: false,
      levelStartedAt: null,
      pausedAt: null,
      pausedDuration: 0
    };

    let updates = {};

    switch (action) {
      case 'start':
        if (tournament.status === 'running') {
          return res.status(400).json({ error: 'Tournament already running' });
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
        break;

      case 'pause':
        if (tournament.status !== 'running') {
          return res.status(400).json({ error: 'Tournament is not running' });
        }
        updates = { status: 'paused' };
        clockState.isRunning = false;
        clockState.pausedAt = new Date().toISOString();
        break;

      case 'resume':
        if (tournament.status !== 'paused') {
          return res.status(400).json({ error: 'Tournament is not paused' });
        }
        updates = { status: 'running' };
        if (clockState.pausedAt) {
          clockState.pausedDuration += Date.now() - new Date(clockState.pausedAt).getTime();
        }
        clockState.isRunning = true;
        clockState.pausedAt = null;
        break;

      case 'next_level':
        if (!['running', 'paused'].includes(tournament.status)) {
          return res.status(400).json({ error: 'Tournament is not active' });
        }
        const blindStructure = tournament.blind_structure || [];
        const nextLevel = (tournament.current_level || 0) + 1;

        if (nextLevel >= blindStructure.length) {
          return res.status(400).json({ error: 'No more levels in structure' });
        }

        updates = { current_level: nextLevel };
        clockState = {
          isRunning: tournament.status === 'running',
          levelStartedAt: new Date().toISOString(),
          pausedAt: tournament.status === 'paused' ? new Date().toISOString() : null,
          pausedDuration: 0
        };
        break;

      case 'previous_level':
        if (!['running', 'paused'].includes(tournament.status)) {
          return res.status(400).json({ error: 'Tournament is not active' });
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

      case 'set_level':
        const { level } = req.body;
        if (typeof level !== 'number' || level < 0) {
          return res.status(400).json({ error: 'Valid level required' });
        }
        updates = { current_level: level };
        clockState = {
          isRunning: tournament.status === 'running',
          levelStartedAt: new Date().toISOString(),
          pausedAt: tournament.status === 'paused' ? new Date().toISOString() : null,
          pausedDuration: 0
        };
        break;

      case 'final_table':
        if (tournament.status !== 'running') {
          return res.status(400).json({ error: 'Tournament is not running' });
        }
        updates = { status: 'final_table' };
        break;

      case 'end':
        if (!['running', 'paused', 'final_table'].includes(tournament.status)) {
          return res.status(400).json({ error: 'Tournament cannot be ended' });
        }
        updates = {
          status: 'completed',
          ended_at: new Date().toISOString()
        };
        clockStates.delete(tournamentId);
        break;

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    // Update tournament
    const { data: updated, error } = await supabase
      .from('commander_tournaments')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', tournamentId)
      .select()
      .single();

    if (error) throw error;

    // Store clock state
    if (action !== 'end') {
      clockStates.set(tournamentId, clockState);
    }

    return res.status(200).json({
      tournament: updated,
      clock: clockState,
      message: `Tournament ${action} successful`
    });
  } catch (error) {
    console.error('Clock action error:', error);
    return res.status(500).json({ error: error.message });
  }
}
