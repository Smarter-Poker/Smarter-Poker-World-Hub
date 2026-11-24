/**
 * CONTEXT AUTHORITY SYSTEM — Per Masterplan Section I
 *
 * Enforces integrity rules for the Personal Assistant.
 * Default = LIVE_PLAY (BLOCK) — Never trust user assertions.
 */


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
    // Check for active poker sessions.
    // 2026-08-15 CHECK 13: poker_sessions has no status column — the old
    // .in('status', ...) filter 42703'd on every call, so LIVE_PLAY /
    // SESSION_PAUSED were never returned. Session state is derived from the
    // real columns: an open session is one with no ended_at. (A distinct
    // "paused" state is unrepresentable in the schema, so SESSION_PAUSED is
    // unreachable — reintroduce it only if a pause marker ever ships.)
    const { data: activeSessions, error: activeSessionsError } = await supabase
      .from('poker_sessions')
      .select('id, started_at, ended_at')
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1);

    if (activeSessionsError) return CONTEXT_STATES.SESSION_ACTIVE_UNKNOWN;

    if (activeSessions && activeSessions.length > 0) {
      return CONTEXT_STATES.LIVE_PLAY;
    }

    // Check for recently ended poker session (within cooldown period)
    const cooldownMs = 5 * 60 * 1000; // 5 minute cooldown
    const { data: recentSessions, error: recentSessionsError } = await supabase
      .from('poker_sessions')
      .select('id, ended_at')
      .eq('user_id', userId)
      // completed = has an ended_at (no status column; see note above)
      .not('ended_at', 'is', null)
      .gte('ended_at', new Date(Date.now() - cooldownMs).toISOString())
      .limit(1);

    if (recentSessionsError) return CONTEXT_STATES.SESSION_ACTIVE_UNKNOWN;

    // Check live Club Arena seats (Hetzner writes active seating to table_seats,
    // not poker_sessions). A player seated with left_at IS NULL is in live play,
    // and a recently vacated seat enters the same 5-minute post-session cooldown.
    const { data: activeClubSeats, error: activeClubSeatsError } = await supabase
      .from('table_seats')
      .select('id, table_id, left_at')
      .eq('user_id', userId)
      .is('left_at', null)
      .limit(1);

    if (activeClubSeatsError) {
      // Only ignore missing-relation 42P01 in isolated test schemas; fail closed
      // on real database/network/schema-cache errors in production.
      const code = String(activeClubSeatsError?.code || '');
      if (code !== '42P01') {
        return CONTEXT_STATES.SESSION_ACTIVE_UNKNOWN;
      }
    } else if (activeClubSeats && activeClubSeats.length > 0) {
      return CONTEXT_STATES.LIVE_PLAY;
    }

    if (recentSessions && recentSessions.length > 0) {
      return CONTEXT_STATES.SESSION_ENDED_VERIFIED;
    }

    const { data: recentClubSeats, error: recentClubSeatsError } = await supabase
      .from('table_seats')
      .select('id, left_at')
      .eq('user_id', userId)
      .not('left_at', 'is', null)
      .gte('left_at', new Date(Date.now() - cooldownMs).toISOString())
      .limit(1);

    if (recentClubSeatsError) {
      const code = String(recentClubSeatsError?.code || '');
      if (code !== '42P01') {
        return CONTEXT_STATES.SESSION_ACTIVE_UNKNOWN;
      }
    } else if (recentClubSeats && recentClubSeats.length > 0) {
      return CONTEXT_STATES.SESSION_ENDED_VERIFIED;
    }

    // No active session or live Club Arena seat, training mode allowed
    return CONTEXT_STATES.TRAINING_MODE;

  } catch (error) {
    console.warn('[ContextAuthority] Context lookup failed closed:', error?.message || error);
    return CONTEXT_STATES.SESSION_ACTIVE_UNKNOWN;
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
