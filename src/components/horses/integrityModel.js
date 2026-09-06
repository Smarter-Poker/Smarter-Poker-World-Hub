/**
 * Pure presentation decisions for the Integrity panel.
 *
 * The queue cannot decide that an empty array means a clean platform. The
 * route owns that fact and returns an explicit state; this module turns the
 * state and detector health into the exact language an operator sees.
 */

export const DETECTOR_STATES = Object.freeze({
  LOADING: 'loading',
  UNKNOWN: 'unknown',
  NEVER: 'never_run',
  GAP: 'coverage_gap',
  STALE: 'stale',
  DEGRADED: 'degraded',
  BEHIND: 'behind',
  LIVE: 'live',
});

export const QUEUE_STATES = Object.freeze({
  AVAILABLE: 'review_available',
  EMPTY: 'nothing_to_review',
  UNPRODUCED: 'nothing_produced',
  UNKNOWN: 'unknown',
});

function valueOf(source, ...keys) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null) return source[key];
  }
  return null;
}

function boolOf(source, ...keys) {
  const value = valueOf(source, ...keys);
  if (value === true || value === false) return value;
  return null;
}

function numberOf(source, ...keys) {
  const value = Number(valueOf(source, ...keys));
  return Number.isFinite(value) ? value : null;
}

export function durationLabel(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return 'An Unknown Time';
  const whole = Math.max(0, Math.round(value));
  if (whole < 60) return `${whole} Second${whole === 1 ? '' : 's'}`;
  const minutes = Math.round(whole / 60);
  if (minutes < 60) return `${minutes} Minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} Hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} Day${days === 1 ? '' : 's'}`;
}

/**
 * Health precedence is deliberate. A detector can be running now and still
 * have a recorded hole in its coverage, so `status: live` never overrides a
 * gap or the RPC's own stale flag.
 */
export function classifyDetectorHealth(health, { loading = false, error = null } = {}) {
  if (loading && !health && !error) {
    return {
      state: DETECTOR_STATES.LOADING,
      tone: 'info',
      loud: false,
      title: 'Reading Detector Health',
      detail: 'The Queue Will Stay Unverified Until The Live Health Read Finishes.',
    };
  }

  if (error || !health || typeof health !== 'object') {
    return {
      state: DETECTOR_STATES.UNKNOWN,
      tone: 'danger',
      loud: true,
      title: 'Detector Health Is Unknown',
      detail: 'The Detector Could Not Be Read. Empty Queues Cannot Be Treated As Clean.',
    };
  }

  const status = String(valueOf(health, 'status', 'detector_status') || '').toLowerCase();
  const overallState = String(valueOf(health, 'state', 'health_state') || '').toLowerCase();
  const hasGap = boolOf(health, 'has_unscanned_gap', 'hasUnscannedGap') === true
    || Boolean(valueOf(health, 'unscanned_from', 'unscannedFrom'));
  const stale = boolOf(health, 'stale', 'is_stale', 'isStale') === true;
  const catchingUp = boolOf(health, 'catching_up', 'catchingUp') === true;
  const secondsBehind = numberOf(health, 'seconds_behind', 'secondsBehind');
  const lastSuccess = valueOf(health, 'last_success_at', 'lastSuccessAt');

  if (status === 'never_run' || status === 'never' || (!lastSuccess && status === 'not_started')) {
    return {
      state: DETECTOR_STATES.NEVER,
      tone: 'danger',
      loud: true,
      title: 'The Detector Has Never Completed A Run',
      detail: 'No Successful Coverage Has Been Recorded. The Queue Has Nothing Reliable To Review.',
    };
  }

  if (hasGap) {
    return {
      state: DETECTOR_STATES.GAP,
      tone: 'danger',
      loud: true,
      title: 'Detector Coverage Has A Recorded Gap',
      detail: 'The Detector Is Running Now, But A Recorded Window Was Never Scanned. Findings Cannot Describe That Window.',
    };
  }

  if (stale) {
    return {
      state: DETECTOR_STATES.STALE,
      tone: 'danger',
      loud: true,
      title: 'Detector Coverage Is Stale',
      detail: 'The Latest Successful Coverage Is Outside The Detector Cadence. Queue Counts May Be Out Of Date.',
    };
  }

  if (overallState === 'degraded') {
    return {
      state: DETECTOR_STATES.DEGRADED,
      tone: 'warn',
      loud: true,
      title: 'Integrity Sources Are Degraded',
      detail: 'The Worker May Be Live, But At Least One Integrity Source Could Not Be Read.',
    };
  }

  if (status === 'behind' || catchingUp) {
    return {
      state: DETECTOR_STATES.BEHIND,
      tone: 'warn',
      loud: true,
      title: 'The Detector Is Catching Up',
      detail: secondsBehind === null
        ? 'The Detector Is Advancing, But It Has Not Reached The Present Yet.'
        : `Coverage Is ${durationLabel(secondsBehind)} Behind The Present.`,
    };
  }

  if (status === 'live') {
    return {
      state: DETECTOR_STATES.LIVE,
      tone: 'good',
      loud: false,
      title: 'The Detector Is Live',
      detail: secondsBehind === null
        ? 'The Latest Successful Run Is Inside The Detector Cadence.'
        : `Coverage Is ${durationLabel(secondsBehind)} Behind The Present And Inside Its Cadence.`,
    };
  }

  return {
    state: DETECTOR_STATES.UNKNOWN,
    tone: 'danger',
    loud: true,
    title: 'Detector Health Is Unknown',
    detail: 'The Health Read Returned No Recognised State. Empty Queues Cannot Be Treated As Clean.',
  };
}

/**
 * Returns null when rows are available. An empty response with no explicit
 * state is UNKNOWN, even if it carries a numeric zero.
 */
export function integrityEmptyState({ state = null, error = null, rowCount = 0 } = {}) {
  if (error) {
    return {
      state: QUEUE_STATES.UNKNOWN,
      tone: 'danger',
      title: 'Queue State Is Unknown',
      detail: 'A Source Could Not Be Read. No Conclusion Can Be Drawn From The Empty Result.',
    };
  }

  if (Number(rowCount) > 0) return null;
  const resolved = String(state || '').toLowerCase();

  if (resolved === QUEUE_STATES.EMPTY) {
    return {
      state: QUEUE_STATES.EMPTY,
      tone: 'good',
      title: 'Nothing Is Waiting For Review',
      detail: 'The Producing Sources Were Read Successfully And No Active Pair Matches This View.',
    };
  }

  if (resolved === QUEUE_STATES.UNPRODUCED) {
    return {
      state: QUEUE_STATES.UNPRODUCED,
      tone: 'warn',
      title: 'Nothing Has Been Produced To Review',
      detail: 'The Sources Have Not Produced An Observation Yet. This Is Not A Clean Finding.',
    };
  }

  if (resolved === QUEUE_STATES.AVAILABLE) {
    return {
      state: QUEUE_STATES.UNKNOWN,
      tone: 'danger',
      title: 'Queue Rows Are Missing',
      detail: 'The Route Reported Available Work Without Returning It. Refresh Before Making A Decision.',
    };
  }

  return {
    state: QUEUE_STATES.UNKNOWN,
    tone: 'danger',
    title: 'Queue State Is Unknown',
    detail: 'The Route Did Not Say Whether The Sources Were Empty, Unproduced, Or Unreadable.',
  };
}

export function patternLabel(value) {
  const labels = {
    CHIP_DUMP: 'Chip Dump',
    CHIP_FLOW_7D: 'Seven-Day Chip Flow',
    DUEL_REPEAT_PAIRING: 'Repeated Duel Pairing',
    SOFT_PLAY: 'Soft Play',
    WIN_RATE_ANOMALY: 'Win Rate Anomaly',
    TIMING_CORRELATION: 'Timing Correlation',
  };
  const key = String(value || '').toUpperCase();
  if (labels[key]) return labels[key];
  return String(value || 'Unknown Pattern')
    .replace(/_/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function tierLabel(value) {
  const labels = {
    active_case: 'Active Case',
    multiple_signals: 'Multiple Signals',
    seven_day_money_flow: 'Seven-Day Money Flow',
    chip_dump: 'Chip Dump',
    other_non_timing: 'Other Non-Timing Evidence',
    timing_only: 'Timing Only',
  };
  return labels[String(value || '').toLowerCase()] || 'Unranked Evidence';
}

export function tierTone(value) {
  const tier = String(value || '').toLowerCase();
  if (tier === 'active_case' || tier === 'seven_day_money_flow' || tier === 'chip_dump') return 'danger';
  if (tier === 'multiple_signals' || tier === 'other_non_timing') return 'warn';
  if (tier === 'timing_only') return 'info';
  return 'neutral';
}

export function compositionLabel(value) {
  const labels = {
    horse_horse: 'Horse And Horse',
    horse_v_horse: 'Horse And Horse',
    horse_human: 'Horse And Human',
    horse_v_human: 'Horse And Human',
    human_human: 'Human And Human',
    human_v_human: 'Human And Human',
  };
  return labels[String(value || '').toLowerCase()] || 'Unknown Composition';
}

export function severityTone(value) {
  const severity = String(value || '').toLowerCase();
  if (severity === 'critical' || severity === 'high') return 'danger';
  if (severity === 'medium') return 'warn';
  if (severity === 'low') return 'info';
  return 'neutral';
}
