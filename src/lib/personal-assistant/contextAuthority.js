/**
 * CONTEXT AUTHORITY SYSTEM — Per Masterplan Section I
 *
 * Enforces integrity rules for the Personal Assistant.
 * Default = LIVE_PLAY (BLOCK) — Never trust user assertions.
 */

import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT STATES
// ═══════════════════════════════════════════════════════════════════════════

export const CONTEXT_STATES = {
  LIVE_PLAY: 'live_play',
  SESSION_ACTIVE_UNKNOWN: 'session_active_unknown',
  SESSION_PAUSED: 'session_paused',
  SESSION_ENDED_VERIFIED: 'session_ended_verified',
  TRAINING_MODE: 'training_mode',
  ARENA_ACTIVE: 'arena_active',
  ARENA_POST_MATCH_LOCKED: 'arena_post_match_locked',
  EDUCATION_ONLY: 'education_only',
};

export const ACCESS_LEVELS = {
  HARD_BLOCK: 'hard_block',
  LIMITED_REVIEW: 'limited_review',
  FULL_ACCESS: 'full_access',
  GENERAL_THEORY: 'general_theory',
};

// Context state to access level mapping
const CONTEXT_ACCESS_MAP = {
  [CONTEXT_STATES.LIVE_PLAY]: ACCESS_LEVELS.HARD_BLOCK,
  [CONTEXT_STATES.SESSION_ACTIVE_UNKNOWN]: ACCESS_LEVELS.HARD_BLOCK,
  [CONTEXT_STATES.SESSION_PAUSED]: ACCESS_LEVELS.HARD_BLOCK,
  [CONTEXT_STATES.SESSION_ENDED_VERIFIED]: ACCESS_LEVELS.LIMITED_REVIEW,
  [CONTEXT_STATES.TRAINING_MODE]: ACCESS_LEVELS.FULL_ACCESS,
  [CONTEXT_STATES.ARENA_ACTIVE]: ACCESS_LEVELS.HARD_BLOCK,
  [CONTEXT_STATES.ARENA_POST_MATCH_LOCKED]: ACCESS_LEVELS.LIMITED_REVIEW,
  [CONTEXT_STATES.EDUCATION_ONLY]: ACCESS_LEVELS.GENERAL_THEORY,
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT AUTHORITY CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get user's current context state from session data.
 * Returns LIVE_PLAY by default (fail-safe).
 */
export async function getUserContextState(supabase, userId) {
  if (!userId) {
    return CONTEXT_STATES.EDUCATION_ONLY; // Anonymous users get education only
  }

  try {
    // Check for active poker sessions
    const { data: activeSessions } = await supabase
      .from('poker_sessions')
      .select('id, status, started_at, ended_at')
      .eq('user_id', userId)
      .in('status', ['active', 'paused', 'in_progress'])
      .order('started_at', { ascending: false })
      .limit(1);

    if (activeSessions && activeSessions.length > 0) {
      const session = activeSessions[0];

      if (session.status === 'active' || session.status === 'in_progress') {
        return CONTEXT_STATES.LIVE_PLAY;
      }

      if (session.status === 'paused') {
        return CONTEXT_STATES.SESSION_PAUSED;
      }
    }

    // Check for active arena matches
    const { data: arenaMatches } = await supabase
      .from('arena_matches')
      .select('id, status, started_at')
      .eq('user_id', userId)
      .in('status', ['active', 'in_progress', 'post_match'])
      .order('started_at', { ascending: false })
      .limit(1);

    if (arenaMatches && arenaMatches.length > 0) {
      const match = arenaMatches[0];

      if (match.status === 'active' || match.status === 'in_progress') {
        return CONTEXT_STATES.ARENA_ACTIVE;
      }

      if (match.status === 'post_match') {
        return CONTEXT_STATES.ARENA_POST_MATCH_LOCKED;
      }
    }

    // Check if user is in training mode
    const { data: trainingSession } = await supabase
      .from('training_sessions')
      .select('id, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1);

    if (trainingSession && trainingSession.length > 0) {
      return CONTEXT_STATES.TRAINING_MODE;
    }

    // Check for recently ended session (within cooldown period)
    const cooldownMs = 5 * 60 * 1000; // 5 minute cooldown
    const { data: recentSessions } = await supabase
      .from('poker_sessions')
      .select('id, ended_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('ended_at', new Date(Date.now() - cooldownMs).toISOString())
      .limit(1);

    if (recentSessions && recentSessions.length > 0) {
      return CONTEXT_STATES.SESSION_ENDED_VERIFIED;
    }

    // No active session, training mode allowed
    return CONTEXT_STATES.TRAINING_MODE;

  } catch (error) {
    // On error, assume training mode (most permissive safe default for sandbox)
    console.error('Context authority check error:', error);
    return CONTEXT_STATES.TRAINING_MODE;
  }
}

/**
 * Get access level for a context state.
 */
export function getAccessLevel(contextState) {
  return CONTEXT_ACCESS_MAP[contextState] || ACCESS_LEVELS.HARD_BLOCK;
}

/**
 * Check if sandbox access is allowed for the current context.
 */
export async function checkSandboxAccess(supabase, userId) {
  const contextState = await getUserContextState(supabase, userId);
  const accessLevel = getAccessLevel(contextState);

  const blocked = accessLevel === ACCESS_LEVELS.HARD_BLOCK;

  return {
    allowed: !blocked,
    contextState,
    accessLevel,
    message: blocked ? getBlockMessage(contextState) : null,
    cooldownRemaining: getCooldownRemaining(contextState),
  };
}

/**
 * Get appropriate block message for a context state.
 */
function getBlockMessage(contextState) {
  const messages = {
    [CONTEXT_STATES.LIVE_PLAY]:
      'Sandbox is unavailable during live play. Finish your session first to ensure fair play.',
    [CONTEXT_STATES.SESSION_ACTIVE_UNKNOWN]:
      'We detected an active session. Please end your session to use the sandbox.',
    [CONTEXT_STATES.SESSION_PAUSED]:
      'Your session is paused. Please end your session to access the sandbox.',
    [CONTEXT_STATES.ARENA_ACTIVE]:
      'Sandbox is unavailable during Arena matches. Complete your match first.',
  };

  return messages[contextState] || 'Sandbox access is currently restricted.';
}

/**
 * Get cooldown remaining if in post-session state.
 */
function getCooldownRemaining(contextState) {
  if (contextState === CONTEXT_STATES.SESSION_ENDED_VERIFIED) {
    return 0; // No cooldown, just limited access
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE-LEVEL ACCESS CONTROL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a specific feature is accessible in the current context.
 */
export function isFeatureAccessible(accessLevel, feature) {
  const featureAccess = {
    sandbox_explore: [ACCESS_LEVELS.FULL_ACCESS, ACCESS_LEVELS.GENERAL_THEORY],
    sandbox_analyze: [ACCESS_LEVELS.FULL_ACCESS],
    leak_finder_view: [ACCESS_LEVELS.FULL_ACCESS, ACCESS_LEVELS.LIMITED_REVIEW],
    leak_finder_detect: [ACCESS_LEVELS.FULL_ACCESS],
    hand_review: [ACCESS_LEVELS.FULL_ACCESS, ACCESS_LEVELS.LIMITED_REVIEW],
    theory_questions: [ACCESS_LEVELS.FULL_ACCESS, ACCESS_LEVELS.GENERAL_THEORY],
  };

  const allowed = featureAccess[feature] || [];
  return allowed.includes(accessLevel);
}

export default {
  CONTEXT_STATES,
  ACCESS_LEVELS,
  getUserContextState,
  getAccessLevel,
  checkSandboxAccess,
  isFeatureAccessible,
};
