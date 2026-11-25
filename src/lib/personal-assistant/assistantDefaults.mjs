/**
 * Single maintained source of defaults, presets, preference storage,
 * home-state resolution, and analytical-honesty classification for
 * Personal Assistant, Leak Finder, Coaching Workspace, and Drills.
 *
 * Rules:
 * - Never mix incompatible variants (PLO/OFC/Short Deck stay separate from NLH).
 * - Never turn missing data into zero or a confident recommendation.
 * - Never mark a leak resolved from drill completion or a won hand alone.
 * - Account-scoped preference keys isolate users on account switches.
 */

export const PA_PREFS_VERSION = 1;
export const PA_PREFS_STORAGE_PREFIX = 'pa-assistant-prefs-v1';

export const PA_ANALYSIS_DEFAULTS = Object.freeze({
  intervalLabel: 'Recent Completed Hands',
  sources: Object.freeze(['Club Arena Cash NLH', 'Club Arena Tournament NLH']),
  format: 'all', // 'all' | 'cash' | 'tournament' (Cash & Tournament stay separated internally)
  sortMode: 'impact', // 'impact' | 'recent' | 'confidence'
  statusFilter: 'all', // 'all' | 'persistent' | 'emerging' | 'improving'
  analysisDepth: 'guided', // 'guided' | 'detailed' | 'expert'
  minEvidenceHands: 5,
  minSolverDecisions: 3,
  practiceLength: 10,
  practiceDifficulty: 'adaptive',
  scopeSummary: 'Recent Club Arena Cash And Tournament NLH · Highest Impact First',
});

const VALID_FORMATS = new Set(['all', 'cash', 'tournament']);
const VALID_SORTS = new Set(['impact', 'recent', 'confidence']);
const VALID_STATUSES = new Set(['all', 'persistent', 'emerging', 'improving']);
const VALID_DEPTHS = new Set(['guided', 'detailed', 'expert']);
const VALID_DIFFICULTIES = new Set(['fundamentals', 'adaptive', 'pressure']);

export function resolveDrillTiming(practiceDifficulty = PA_ANALYSIS_DEFAULTS.practiceDifficulty) {
  const difficulty = VALID_DIFFICULTIES.has(practiceDifficulty)
    ? practiceDifficulty
    : PA_ANALYSIS_DEFAULTS.practiceDifficulty;
  if (difficulty === 'fundamentals') {
    return { difficulty, durationSeconds: 25, label: 'Fundamentals · 25s' };
  }
  if (difficulty === 'pressure') {
    return { difficulty, durationSeconds: 10, label: 'Pressure · 10s' };
  }
  return { difficulty: 'adaptive', durationSeconds: 15, label: 'Adaptive · 15s' };
}

export function describePracticePreset(prefs = {}) {
  const clean = sanitizeAssistantPreferences(prefs);
  const timing = resolveDrillTiming(clean.practiceDifficulty);
  return `${clean.practiceLength} Spots · ${timing.label}`;
}

export function sanitizeAssistantPreferences(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const format = VALID_FORMATS.has(input.format) ? input.format : PA_ANALYSIS_DEFAULTS.format;
  const sortMode = VALID_SORTS.has(input.sortMode) ? input.sortMode : PA_ANALYSIS_DEFAULTS.sortMode;
  const statusFilter = VALID_STATUSES.has(input.statusFilter) ? input.statusFilter : PA_ANALYSIS_DEFAULTS.statusFilter;
  const analysisDepth = VALID_DEPTHS.has(input.analysisDepth) ? input.analysisDepth : PA_ANALYSIS_DEFAULTS.analysisDepth;
  const practiceLengthRaw = Number(input.practiceLength);
  const practiceLength = Number.isFinite(practiceLengthRaw)
    ? Math.max(5, Math.min(20, Math.round(practiceLengthRaw)))
    : PA_ANALYSIS_DEFAULTS.practiceLength;
  const practiceDifficulty = VALID_DIFFICULTIES.has(input.practiceDifficulty)
    ? input.practiceDifficulty
    : PA_ANALYSIS_DEFAULTS.practiceDifficulty;
  return {
    version: PA_PREFS_VERSION,
    format,
    sortMode,
    statusFilter,
    analysisDepth,
    practiceLength,
    practiceDifficulty,
  };
}

export function getSafeLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

export function preferenceStorageKey(userId) {
  const id = typeof userId === 'string' && userId.trim() ? userId.trim() : 'guest';
  return `${PA_PREFS_STORAGE_PREFIX}:${id}`;
}

export function loadAssistantPreferences(storage, userId) {
  if (!storage || typeof storage.getItem !== 'function') {
    return sanitizeAssistantPreferences();
  }
  try {
    const raw = storage.getItem(preferenceStorageKey(userId));
    if (!raw) return sanitizeAssistantPreferences();
    return sanitizeAssistantPreferences(JSON.parse(raw));
  } catch {
    return sanitizeAssistantPreferences();
  }
}

export function saveAssistantPreferences(storage, userId, nextPrefs) {
  const clean = sanitizeAssistantPreferences(nextPrefs);
  if (storage && typeof storage.setItem === 'function') {
    try {
      storage.setItem(preferenceStorageKey(userId), JSON.stringify(clean));
    } catch {
      // Ignore quota / private-mode storage errors cleanly
    }
  }
  return clean;
}

export function resetAssistantPreferences(storage, userId) {
  if (storage && typeof storage.removeItem === 'function') {
    try {
      storage.removeItem(preferenceStorageKey(userId));
    } catch {
      // Ignore storage errors cleanly
    }
  }
  return sanitizeAssistantPreferences();
}

export function countActivePreferenceOverrides(prefs = {}) {
  const clean = sanitizeAssistantPreferences(prefs);
  let count = 0;
  if (clean.format !== PA_ANALYSIS_DEFAULTS.format) count += 1;
  if (clean.sortMode !== PA_ANALYSIS_DEFAULTS.sortMode) count += 1;
  if (clean.statusFilter !== PA_ANALYSIS_DEFAULTS.statusFilter) count += 1;
  if (clean.analysisDepth !== PA_ANALYSIS_DEFAULTS.analysisDepth) count += 1;
  if (clean.practiceLength !== PA_ANALYSIS_DEFAULTS.practiceLength) count += 1;
  if (clean.practiceDifficulty !== PA_ANALYSIS_DEFAULTS.practiceDifficulty) count += 1;
  return count;
}

export function describeAnalysisScope(prefs = {}) {
  const clean = sanitizeAssistantPreferences(prefs);
  const formatLabel = clean.format === 'cash'
    ? 'Cash NLH Only'
    : clean.format === 'tournament'
      ? 'Tournament NLH Only'
      : 'Cash And Tournament NLH (Separated)';
  const sortLabel = clean.sortMode === 'recent'
    ? 'Most Recent First'
    : clean.sortMode === 'confidence'
      ? 'Highest Confidence First'
      : 'Highest Impact First';
  return `${PA_ANALYSIS_DEFAULTS.intervalLabel} · ${formatLabel} · ${sortLabel}`;
}

/**
 * Classifies a leak finding into one of the five explicit analytical honesty states:
 * - supported: verified solver/fact evidence with sufficient sample
 * - emerging: possible pattern needing more hands before high confidence
 * - unmeasured: metric unavailable or explicitly unpriced (never turned into 0)
 * - unsupported: unsupported variant/format situation
 * - reassess: previously drilled/mastered or resolved, awaiting fresh real-play confirmation
 */
export function classifyFindingHonesty(leak, reviewRecord = null) {
  if (!leak || typeof leak !== 'object') {
    return {
      code: 'unmeasured',
      label: 'Unavailable Metric',
      tone: 'neutral',
      detail: 'Evidence is not available for this finding yet.',
    };
  }

  const variant = String(leak.variant || leak.gameVariant || leak.game_variant || '').toLowerCase();
  if (
    leak.unsupportedFormat === true ||
    leak.unsupported === true ||
    /plo|omaha|ofc|short_deck|6\+/.test(variant)
  ) {
    return {
      code: 'unsupported',
      label: 'Unsupported Situation',
      tone: 'warn',
      detail: 'This variant or structure is outside the verified Hold\'em solver model.',
    };
  }

  if (
    leak.status === 'resolved' ||
    leak.status === 'fixed' ||
    reviewRecord?.retired === true ||
    reviewRecord?.remediationMastered === true
  ) {
    return {
      code: 'reassess',
      label: 'Awaiting Table Reassessment',
      tone: 'purple',
      detail: 'Drill work is recorded. Fresh Club Arena hands must confirm the leak is fixed at the table.',
    };
  }

  const occurrences = Number(leak.occurrences ?? leak.occurrenceCount ?? leak.occurrence_count ?? 0);
  const sampleSize = Number(
    leak.sampleSize ?? leak.sample_size ?? leak.totalSamples ?? leak.total_samples ?? occurrences,
  );
  const confidence = String(leak.confidence || '').toLowerCase();
  const rawEvMeasured = leak.evLossMeasured ?? leak.ev_loss_measured;
  const rawEvValue = Number(leak.evLossBB ?? leak.avg_ev_loss_bb);
  const hasMeasuredEv =
    rawEvMeasured === true && Number.isFinite(rawEvValue) && rawEvValue > 0;
  const hasSolverEvidence = Boolean(
    leak.solverEvidence ||
    leak.solverVerified ||
    leak.sourceSystem === 'training_solver' ||
    leak.sourceSystem === 'solver_engine' ||
    leak.source_system === 'training_solver' ||
    leak.source_system === 'solver_engine' ||
    leak.sourceSystem === 'ca_hand_facts' ||
    leak.source_system === 'ca_hand_facts',
  );

  if (!hasSolverEvidence && !hasMeasuredEv) {
    return {
      code: 'unmeasured',
      label: 'Unavailable Metric',
      tone: 'neutral',
      detail: 'No verified solver evidence or measured EV metric is available yet for this spot.',
    };
  }

  if (
    leak.status === 'emerging' ||
    confidence === 'low' ||
    sampleSize < PA_ANALYSIS_DEFAULTS.minEvidenceHands
  ) {
    return {
      code: 'emerging',
      label: 'Possible Pattern · Needs More Hands',
      tone: 'warn',
      detail: `Observed in ${sampleSize || occurrences || 1} spot${(sampleSize || occurrences || 1) === 1 ? '' : 's'}. Play more hands to raise confidence.`,
    };
  }

  return {
    code: 'supported',
    label: 'Supported Finding',
    tone: 'accent',
    detail: hasMeasuredEv
      ? `Backed by ${sampleSize || occurrences} verified decisions with measured EV cost.`
      : `Backed by ${sampleSize || occurrences} verified decisions (EV impact unpriced).`,
  };
}

/**
 * Resolves the single unmistakable primary state & CTA for the Personal Assistant Home page.
 * Ensures one prominent action per user state with zero competing dashboards.
 */
export function resolveHomePrimaryState({
  loading = false,
  syncError = null,
  isSignedIn = false,
  isDemo = false,
  auditRunning = false,
  auditProgressText = null,
  reviewDueCount = 0,
  activeLeaksCount = 0,
  topLeakTitle = null,
  handsAnalyzed = 0,
  availableClubArenaHands = 0,
  sessionsReviewed = 0,
  hasPracticeInProgress = false,
  trainingPlanTitle = null,
  lastSessionTitle = null,
} = {}) {
  if (loading) {
    return {
      state: 'loading',
      badge: 'Syncing',
      title: 'Checking Your Latest Poker Data',
      summary: 'Loading your Club Arena hands, leak findings, and review schedule.',
      ctaLabel: 'Syncing Data',
      ctaAction: 'none',
      disabled: true,
    };
  }

  if (syncError) {
    return {
      state: 'error',
      badge: 'Needs Attention',
      title: 'Reconnect Your Live Poker Data',
      summary: 'Live session stats could not refresh right now. Retry to load your latest hands.',
      ctaLabel: 'Retry Live Data',
      ctaAction: 'retry',
      disabled: false,
    };
  }

  if (auditRunning) {
    return {
      state: 'audit_running',
      badge: 'Analysis Running',
      title: 'Auditing Your Club Arena Hands',
      summary: auditProgressText || 'Your hand audit is running on the server. You can safely leave and return later.',
      ctaLabel: 'View Audit Progress',
      ctaAction: 'open_leaks',
      disabled: false,
    };
  }

  if (isSignedIn && !isDemo && reviewDueCount > 0) {
    return {
      state: 'review_due',
      badge: 'Review Due',
      title: reviewDueCount === 1 ? '1 Leak Review Ready' : `${reviewDueCount} Leak Reviews Ready`,
      summary: topLeakTitle
        ? `Next up: ${topLeakTitle}. Complete a short corrective review to reinforce the adjustment.`
        : 'Complete your scheduled corrective drill before your next session.',
      ctaLabel: 'Start Review',
      ctaAction: 'open_review',
      disabled: false,
    };
  }

  if (isSignedIn && !isDemo && activeLeaksCount > 0) {
    return {
      state: 'finding_ready',
      badge: 'Top Priority',
      title: topLeakTitle || (activeLeaksCount === 1 ? 'Review 1 Active Leak' : `Review ${activeLeaksCount} Active Leaks`),
      summary: `${activeLeaksCount} active finding${activeLeaksCount === 1 ? '' : 's'} prioritized by EV impact across your analyzed hands.`,
      ctaLabel: 'Open Leak Finder',
      ctaAction: 'open_leaks',
      disabled: false,
    };
  }

  if (isSignedIn && !isDemo && hasPracticeInProgress) {
    return {
      state: 'practice_in_progress',
      badge: 'Practice In Progress',
      title: trainingPlanTitle || lastSessionTitle || 'Continue Your Training Plan',
      summary: 'Pick up right where you left off in your verified corrective drill plan.',
      ctaLabel: 'Continue Practice',
      ctaAction: 'continue_practice',
      disabled: false,
    };
  }

  const analyzedNumeric = typeof handsAnalyzed === 'number' && Number.isFinite(handsAnalyzed) ? handsAnalyzed : 0;
  const clubHandsNumeric = typeof availableClubArenaHands === 'number' && Number.isFinite(availableClubArenaHands) ? availableClubArenaHands : 0;
  const sessionsNumeric = typeof sessionsReviewed === 'number' && Number.isFinite(sessionsReviewed) ? sessionsReviewed : 0;

  if (isSignedIn && !isDemo && (clubHandsNumeric > 0 || sessionsNumeric > 0) && analyzedNumeric === 0) {
    return {
      state: 'history_no_analysis',
      badge: 'Ready To Analyze',
      title: 'Analyze Your Recent Club Arena Play',
      summary: clubHandsNumeric > 0
        ? `${clubHandsNumeric.toLocaleString()} completed Club Arena hand${clubHandsNumeric === 1 ? '' : 's'} ready to scan with verified defaults.`
        : `One click scans your ${PA_ANALYSIS_DEFAULTS.scopeSummary}. No setup required.`,
      ctaLabel: 'Analyze My Play',
      ctaAction: 'analyze_now',
      disabled: false,
    };
  }

  if (isSignedIn && !isDemo && analyzedNumeric > 0) {
    return {
      state: 'finding_ready',
      badge: 'Up To Date',
      title: 'No Active Leaks Across Analyzed Hands',
      summary: `${analyzedNumeric.toLocaleString()} analyzed hand${analyzedNumeric === 1 ? '' : 's'} checked with no active leaks. Scan again after your next Club Arena session.`,
      ctaLabel: 'Analyze My Play',
      ctaAction: 'analyze_now',
      disabled: false,
    };
  }

  return {
    state: 'no_history',
    badge: isSignedIn ? 'Get Started' : 'Preview Mode',
    title: isSignedIn ? 'Start With Verified Training Or Hand Review' : 'Turn Completed Hands Into Clear Fixes',
    summary: isSignedIn
      ? 'Play completed Club Arena hands or start a verified training session to build your improvement plan.'
      : 'Sign in to audit your own Club Arena hands automatically, or start a verified training session now.',
    ctaLabel: 'Open Verified Training',
    ctaAction: 'open_training',
    disabled: false,
  };
}
