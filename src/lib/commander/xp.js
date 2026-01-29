/**
 * Commander XP Integration
 * Reference: IMPLEMENTATION_PHASES.md - Step 2.6
 * Awards XP to players for Commander-related actions
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// XP values for Commander events
export const COMMANDER_XP_EVENTS = {
  'waitlist.joined': {
    xp: 5,
    description: 'Joined a waitlist'
  },
  'game.seated': {
    xp: 25,
    description: 'Seated at a game'
  },
  'session.hour_played': {
    xp: 10,
    description: 'Played for an hour'
  },
  'session.completed': {
    xp: 50,
    description: 'Completed a session'
  },
  'tournament.registered': {
    xp: 15,
    description: 'Registered for a tournament'
  },
  'tournament.cashed': {
    xp: 100,
    description: 'Cashed in a tournament'
  },
  'home_game.hosted': {
    xp: 75,
    description: 'Hosted a home game'
  },
  'home_game.attended': {
    xp: 25,
    description: 'Attended a home game'
  },
  'review.left': {
    xp: 10,
    description: 'Left a review'
  },
  'promotion_win': {
    xp: 50,
    description: 'Won a promotion'
  },
  'high_hand': {
    xp: 75,
    description: 'Hit a high hand'
  },
  'leaderboard.placed': {
    xp: 25,
    description: 'Placed on leaderboard'
  }
};

/**
 * Award XP to a player
 * @param {string} playerId - Player's profile UUID
 * @param {string} eventType - Event type from COMMANDER_XP_EVENTS
 * @param {object} metadata - Additional data about the event
 * @returns {Promise<object>} - Result with new XP total
 */
export async function awardXP(playerId, eventType, metadata = {}) {
  if (!playerId) {
    console.warn('awardXP called without playerId');
    return { success: false, error: 'Player ID required' };
  }

  const event = COMMANDER_XP_EVENTS[eventType];
  if (!event) {
    console.warn(`Unknown XP event type: ${eventType}`);
    return { success: false, error: 'Unknown event type' };
  }

  try {
    // Get current player profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, xp, level')
      .eq('id', playerId)
      .single();

    if (profileError || !profile) {
      console.error('Failed to fetch profile for XP award:', profileError);
      return { success: false, error: 'Profile not found' };
    }

    const currentXP = profile.xp || 0;
    const newXP = currentXP + event.xp;
    const newLevel = calculateLevel(newXP);

    // Update profile XP
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        xp: newXP,
        level: newLevel
      })
      .eq('id', playerId);

    if (updateError) {
      console.error('Failed to update XP:', updateError);
      return { success: false, error: 'Failed to update XP' };
    }

    // Log the XP transaction (if xp_transactions table exists)
    try {
      await supabase
        .from('commander_xp_transactions')
        .insert({
          profile_id: playerId,
          amount: event.xp,
          source: 'commander',
          event_type: eventType,
          description: event.description,
          metadata
        });
    } catch (e) {
      // Table might not exist, that's okay
      console.log('XP transaction logging skipped');
    }

    return {
      success: true,
      data: {
        awarded: event.xp,
        newTotal: newXP,
        newLevel,
        leveledUp: newLevel > (profile.level || 1)
      }
    };
  } catch (error) {
    console.error('awardXP error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate level from XP
 * Uses a simple formula: level = floor(sqrt(xp / 100)) + 1
 * Level 1: 0-99 XP
 * Level 2: 100-399 XP
 * Level 3: 400-899 XP
 * etc.
 */
export function calculateLevel(xp) {
  if (xp < 0) return 1;
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

/**
 * Get XP required for a specific level
 */
export function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.pow(level - 1, 2) * 100;
}

/**
 * Get XP progress to next level
 */
export function getXPProgress(xp) {
  const currentLevel = calculateLevel(xp);
  const currentLevelXP = xpForLevel(currentLevel);
  const nextLevelXP = xpForLevel(currentLevel + 1);
  const progress = xp - currentLevelXP;
  const required = nextLevelXP - currentLevelXP;

  return {
    level: currentLevel,
    currentXP: xp,
    progressXP: progress,
    requiredXP: required,
    percentage: Math.round((progress / required) * 100)
  };
}

/**
 * Award hourly XP for active sessions
 * Called by a cron job or when session ends
 */
export async function awardSessionXP(sessionId) {
  try {
    const { data: session, error } = await supabase
      .from('commander_player_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error || !session || !session.player_id) {
      return { success: false, error: 'Session not found or no player' };
    }

    const hours = Math.floor((session.total_time_minutes || 0) / 60);

    // Award hourly XP
    for (let i = 0; i < hours; i++) {
      await awardXP(session.player_id, 'session.hour_played', {
        session_id: sessionId,
        hour: i + 1
      });
    }

    // Award session completion XP
    if (session.status === 'completed') {
      await awardXP(session.player_id, 'session.completed', {
        session_id: sessionId,
        total_hours: hours
      });
    }

    return { success: true, hoursAwarded: hours };
  } catch (error) {
    console.error('awardSessionXP error:', error);
    return { success: false, error: error.message };
  }
}
