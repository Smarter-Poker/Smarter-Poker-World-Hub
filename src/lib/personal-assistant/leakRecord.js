const CONFIDENCE_SCORES = Object.freeze({
  low: 0.3,
  medium: 0.65,
  high: 0.9,
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function positiveInteger(value, fallback = 1) {
  const number = finiteNumber(value);
  return number === null ? fallback : Math.max(1, Math.round(number));
}

export function confidenceScore(value) {
  const label = String(value || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(CONFIDENCE_SCORES, label)) {
    return CONFIDENCE_SCORES[label];
  }
  const number = finiteNumber(value);
  return number === null ? CONFIDENCE_SCORES.low : clamp(number, 0, 1);
}

export function confidenceTier(value) {
  const label = String(value || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(CONFIDENCE_SCORES, label)) return label;
  const score = confidenceScore(value);
  if (score >= 0.75) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

export function leakTypeSlug(value, fallback = 'legacy_leak') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180);
  return slug || fallback;
}

export function leakTypeTitle(value) {
  return String(value || 'Leak')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase());
}

const ACTIVE_STATUSES = new Set(['emerging', 'persistent', 'improving']);

/**
 * Keep the hybrid user_leaks lifecycle fields in lockstep. Modern readers use
 * status/resolved_at while the training accountant still uses is_active.
 */
export function leakStatusPersistenceFields(status, {
  resolvedAt = null,
  resolutionSource = null,
  now = new Date().toISOString(),
} = {}) {
  const normalized = String(status || 'emerging').trim().toLowerCase();
  if (normalized === 'resolved') {
    const completedAt = resolvedAt || now;
    return {
      status: 'resolved',
      resolved_at: completedAt,
      remediation_completed_at: completedAt,
      resolution_source: resolutionSource,
      is_active: false,
    };
  }
  const activeStatus = ACTIVE_STATUSES.has(normalized) ? normalized : 'emerging';
  return {
    status: activeStatus,
    resolved_at: null,
    remediation_completed_at: null,
    resolution_source: null,
    is_active: true,
  };
}

/**
 * Convert either generation of user_leaks rows into the API's canonical
 * record. The table is intentionally shared with the original training
 * accountant, whose rows use leak_name/mistake_count/numeric confidence.
 */
export function normalizeUserLeakRow(row = {}) {
  const isLegacyTrainingRow = !row.leak_type && !!row.leak_name;
  const leakType = row.leak_type || leakTypeSlug(row.leak_name || row.situation_class);
  const occurrenceCount = finiteNumber(row.occurrence_count) ?? finiteNumber(row.mistake_count) ?? 0;
  const firstDetected = row.first_detected_at || row.detected_at || row.created_at || null;
  const status = row.status || (row.is_active === false ? 'resolved' : 'emerging');

  return {
    ...row,
    leak_type: leakType,
    leak_category: row.leak_category || 'training',
    situation_class: leakTypeTitle(row.situation_class || row.leak_name || leakType),
    status,
    confidence: confidenceTier(row.confidence),
    occurrence_count: Math.max(0, Math.round(occurrenceCount)),
    first_detected_at: firstDetected,
    last_detected_at: row.last_detected_at || row.updated_at || firstDetected,
    source_system: isLegacyTrainingRow ? 'training_accountant' : (row.source_system || 'training_accountant'),
    resolved_at: row.resolved_at || (status === 'resolved' ? row.remediation_completed_at || null : null),
  };
}

/**
 * Build a row accepted by the live hybrid schema. New detector fields remain
 * canonical, while the four required legacy fields are populated with honest
 * equivalents so a deterministic audit can be saved atomically.
 */
export const DETECTOR_RULE_VERSION = 'pa-leak-detector-v3';

export const EVIDENCE_BASIS = Object.freeze({
  EXACT_SOLVER_MATCH: 'exact_solver_match',
  CHART: 'chart',
  DETERMINISTIC_RULE: 'deterministic_rule',
  GENERAL_COACHING: 'general_coaching',
});

export function classifyEvidenceBasis(record = {}) {
  if (!record || typeof record !== 'object') return EVIDENCE_BASIS.GENERAL_COACHING;
  const explicit = String(record.evidenceBasis ?? record.evidence_basis ?? '').trim().toLowerCase();
  if (Object.values(EVIDENCE_BASIS).includes(explicit)) return explicit;

  const solverSource = String(record.solverSource ?? record.solver_source ?? '').trim().toLowerCase();
  const sourceClass = String(record.sourceClassification ?? record.source_classification ?? record.dataQuality ?? '').trim().toUpperCase();
  const truthLevel = String(record.truthLevel ?? record.truth_level ?? '').trim().toLowerCase();
  const sourceSystem = String(record.sourceSystem ?? record.source_system ?? '').trim().toLowerCase();
  const leakType = String(record.leakType ?? record.leak_type ?? '').trim().toLowerCase();

  if (
    sourceClass === 'CHART_AUDITED'
    || truthLevel === 'deterministic_icm_model'
    || /\b(memory_charts_gold|chart|push_fold_chart)\b/i.test(solverSource)
  ) {
    return EVIDENCE_BASIS.CHART;
  }

  if (
    record.solverVerified === true
    || record.solver_verified === true
    || ['SOLVER_EXACT', 'SOLVER_AGGREGATED', 'SOLVER_DERIVED_RESPONSE'].includes(sourceClass)
    || ['solver_engine', 'training_solver'].includes(sourceSystem)
    || /^solver_(?:club_arena|training|external_upload|self_reported_live)_/.test(leakType)
  ) {
    return EVIDENCE_BASIS.EXACT_SOLVER_MATCH;
  }

  if (
    ['ca_hand_facts', 'live_play'].includes(sourceSystem)
    || truthLevel === 'deterministic_heuristic_reference'
    || Object.prototype.hasOwnProperty.call(LEAK_PATTERNS, leakType)
    || /^(?:cash|mtt|tournament)_/.test(leakType)
  ) {
    return EVIDENCE_BASIS.DETERMINISTIC_RULE;
  }

  return EVIDENCE_BASIS.GENERAL_COACHING;
}

const NON_SCHEMA_ENRICHMENT_KEYS = new Set([
  '_sample_count',
  '_mistake_count',
  '_ev_measured_count',
  '_mistaken_hand_external_ids',
  'rule_version',
  'ruleVersion',
  'evidence_basis',
  'evidenceBasis',
  'takeaway',
  'representative_hand_id',
  'representativeHandId',
  'representative_decision',
  'representativeDecision',
  'sample_hand_ids',
  'spot_type',
  'hero_position',
  'street',
  'format_scope',
  'stack_bucket',
  'optimal_range',
  'practice_target',
  'sample_counts',
]);

export function toUserLeakPersistenceRow(leak = {}, options = {}) {
  const userId = options.userId || leak.user_id;
  const leakType = leakTypeSlug(leak.leak_type || leak.leak_name || leak.situation_class);
  const mistakes = positiveInteger(
    options.mistakeCount ?? leak.mistake_count ?? leak.occurrence_count,
  );
  const samples = Math.max(
    mistakes,
    positiveInteger(options.totalSamples ?? leak.total_samples ?? leak.occurrence_count),
  );
  const suppliedErrorRate = finiteNumber(leak.error_rate);
  const errorRate = clamp(
    suppliedErrorRate === null ? mistakes / samples : suppliedErrorRate,
    0,
    1,
  );
  const publicFields = {};
  for (const [key, value] of Object.entries(leak || {})) {
    if (key.startsWith('_') || NON_SCHEMA_ENRICHMENT_KEYS.has(key)) continue;
    publicFields[key] = value;
  }

  return {
    ...publicFields,
    ...leakStatusPersistenceFields(leak.status, {
      resolvedAt: leak.resolved_at,
      resolutionSource: leak.resolution_source,
    }),
    user_id: userId,
    leak_type: leakType,
    leak_name: leak.leak_name || leak.situation_class || leakTypeTitle(leakType),
    error_rate: +errorRate.toFixed(4),
    confidence: confidenceScore(leak.confidence),
    total_samples: samples,
    mistake_count: Math.min(mistakes, samples),
  };
}

const PATTERN_NEXT_TIME_ACTION = Object.freeze({
  overfolding_preflop: 'Widen your unopened raise-first-in ranges in late position (CO, BTN, SB) with suited connectors, suited aces, and broadways.',
  overlimping: 'Eliminate open-limping; enter unopened pots with a standard raise or fold marginal holdings.',
  cold_call_too_wide: 'Convert flat-calls in non-blind seats into 3-bets or folds so you are not playing capped ranges out of position.',
  three_bet_too_tight: 'Add polarized 3-bet bluffs (suited wheel aces and suited broadway blockers) alongside your value 3-bets.',
  three_bet_too_loose: 'Tighten light 3-bets against early-position opens and preserve suited playability when defending.',
  overfolding_to_cbets: 'Defend more flops with backdoor equity, middle/bottom pairs, and high-card floats or check-raises instead of folding to small c-bets.',
  cbet_too_often: 'Protect your checking range on wet or low-connected boards by checking back medium-strength hands and low-equity air.',
  cbet_too_rarely: 'Continuation-bet higher frequencies with small sizing on dry high-card and paired boards where your range holds the nut advantage.',
  check_raise_too_rare: 'Build a balanced flop check-raise range combining strong value hands with high-equity combo draws and backdoor blockers.',
  turn_barrel_too_rare: 'Continue barreling turn cards that improve your range equity or add flush/straight outs instead of checking back and surrendering initiative.',
  turn_overfold: 'Defend turn barrels with top/middle pairs, combo draws, and key blockers so opponents cannot profitably double-barrel any two cards.',
  lack_of_river_bluffs: 'Select missed draws with strong nut blockers to fire river bluffs at a balanced ratio alongside your river value bets.',
  river_overfold: 'Call down river bets with bluff-catchers that block villain value combos and unblock missed draws to meet minimum defense frequency.',
  missing_thin_value: 'Bet medium-strength made hands for thin value on safe rivers when villain range is capped after checking.',
  passive_postflop: 'Shift from passive calling to proactive betting and raising when you hold range or nut advantage across postflop streets.',
  over_aggressive_postflop: 'Exercise pot control with medium-strength hands by checking back or calling instead of bloating pots against uncapped ranges.',
});

export function generateLeakFix(leak = {}) {
  const rawType = String(leak.leak_type ?? leak.leakType ?? '').trim().toLowerCase();
  const normalizedType = rawType
    .replace(/^(?:cash|mtt|tournament)_(?:(?:short|mid|deep|unknown)_)?/, '')
    .replace(/_facts$/, '');
  const recommended = leak.recommended_drill ?? leak.recommendedDrill ?? LEAK_PATTERNS[normalizedType]?.recommendedDrill ?? null;
  const drill = recommended ? ` Open the ${recommended} drill` : ' Open the matching focused drill';
  if (['training_solver', 'solver_engine'].includes(leak.source_system ?? leak.sourceSystem)) {
    return `Review the exact ${String(leak.leak_category ?? leak.leakCategory ?? 'solver').toLowerCase()} node, then repeat it until your solver-graded error rate is below ${leak.optimal_frequency ?? leak.optimalFrequency ?? 15}%.${drill} and compare every mixed action to its range frequency before answering.`;
  }
  const specificAction = PATTERN_NEXT_TIME_ACTION[rawType] || PATTERN_NEXT_TIME_ACTION[normalizedType];
  if (specificAction) {
    return `${specificAction}${drill}, then rerun detection after a fresh sample to confirm the adjustment.`;
  }
  return `Review the opportunities behind this frequency before changing your strategy.${drill}, then rerun detection after a fresh sample to confirm the adjustment.`;
}

export const LEAK_PATTERNS = {
  overfolding_preflop: {
    category: 'preflop',
    street: 'preflop',
    spotType: 'rfi',
    name: 'Overfolding Preflop',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'handsPlayed',
    minSamples: 501,
    recommendedDrill: 'cash-001',
    check: (stats) => stats.vpip < 18 && stats.handsPlayed > 500,
    optimalRange: [22, 28],
    evImpact: 0.08,
  },
  overlimping: {
    category: 'preflop',
    street: 'preflop',
    spotType: 'rfi',
    name: 'Too Much Limping',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'handsPlayed',
    minSamples: 201,
    recommendedDrill: 'cash-001',
    check: (stats) => stats.limpFreq > 8 && stats.handsPlayed > 200,
    optimalRange: [0, 3],
    evImpact: 0.12,
  },
  cold_call_too_wide: {
    category: 'preflop',
    street: 'preflop',
    spotType: 'cold_call',
    name: 'Cold Calling Too Wide',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'handsPlayed',
    minSamples: 301,
    recommendedDrill: 'cash-003',
    check: (stats) => stats.coldCallFreq > 12 && stats.handsPlayed > 300,
    optimalRange: [6, 10],
    evImpact: 0.06,
  },
  three_bet_too_tight: {
    category: 'preflop',
    street: 'preflop',
    spotType: 'vs3bet',
    name: '3-Betting Too Tight',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'handsPlayed',
    minSamples: 501,
    recommendedDrill: 'cash-001',
    check: (stats) => stats.threeBetFreq < 5 && stats.handsPlayed > 500,
    optimalRange: [7, 10],
    evImpact: 0.05,
  },
  three_bet_too_loose: {
    category: 'preflop',
    street: 'preflop',
    spotType: 'vs3bet',
    name: '3-Betting Too Loose',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'handsPlayed',
    minSamples: 501,
    recommendedDrill: 'cash-001',
    check: (stats) => stats.threeBetFreq > 14 && stats.handsPlayed > 500,
    optimalRange: [7, 10],
    evImpact: 0.07,
  },
  overfolding_to_cbets: {
    category: 'flop',
    street: 'flop',
    spotType: 'cbet_defense',
    name: 'Overfolding to C-Bets',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'cbetsFaced',
    minSamples: 51,
    recommendedDrill: 'cash-003',
    check: (stats) => stats.foldToCbet > 55 && stats.cbetsFaced > 50,
    optimalRange: [40, 50],
    evImpact: 0.14,
  },
  cbet_too_often: {
    category: 'flop',
    street: 'flop',
    spotType: 'cbet',
    name: 'C-Betting Too Often',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'cbetOpps',
    minSamples: 51,
    recommendedDrill: 'cash-002',
    check: (stats) => stats.cbetFreq > 75 && stats.cbetOpps > 50,
    optimalRange: [55, 65],
    evImpact: 0.09,
  },
  cbet_too_rarely: {
    category: 'flop',
    street: 'flop',
    spotType: 'cbet',
    name: 'C-Betting Too Rarely',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'cbetOpps',
    minSamples: 51,
    recommendedDrill: 'cash-002',
    check: (stats) => stats.cbetFreq < 40 && stats.cbetOpps > 50,
    optimalRange: [55, 65],
    evImpact: 0.11,
  },
  check_raise_too_rare: {
    category: 'flop',
    street: 'flop',
    spotType: 'check_raise',
    name: 'Check-Raise Frequency Too Low',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'checkRaiseOpps',
    minSamples: 31,
    recommendedDrill: 'cash-014',
    check: (stats) => stats.checkRaiseFreq < 5 && stats.checkRaiseOpps > 30,
    optimalRange: [8, 12],
    evImpact: 0.06,
  },
  turn_barrel_too_rare: {
    category: 'turn',
    street: 'turn',
    spotType: 'turn_barrel',
    name: 'Not Barreling Turn Enough',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'turnBarrelOpps',
    minSamples: 31,
    recommendedDrill: 'cash-004',
    check: (stats) => stats.turnBarrelFreq < 45 && stats.turnBarrelOpps > 30,
    optimalRange: [55, 65],
    evImpact: 0.10,
  },
  turn_overfold: {
    category: 'turn',
    street: 'turn',
    spotType: 'turn_defense',
    name: 'Overfolding on Turn',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'turnFaced',
    minSamples: 41,
    recommendedDrill: 'cash-003',
    check: (stats) => stats.turnFoldFreq > 50 && stats.turnFaced > 40,
    optimalRange: [35, 45],
    evImpact: 0.08,
  },
  lack_of_river_bluffs: {
    category: 'river',
    street: 'river',
    spotType: 'river_bluff',
    name: 'Not Enough River Bluffs',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'riverBluffOpps',
    minSamples: 21,
    recommendedDrill: 'cash-012',
    check: (stats) => stats.riverBluffFreq < 8 && stats.riverBluffOpps > 20,
    optimalRange: [12, 18],
    evImpact: 0.08,
  },
  river_overfold: {
    category: 'river',
    street: 'river',
    spotType: 'river_bluff_catcher',
    name: 'Overfolding on River',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'riverFaced',
    minSamples: 31,
    recommendedDrill: 'cash-005',
    check: (stats) => stats.riverFoldFreq > 55 && stats.riverFaced > 30,
    optimalRange: [40, 50],
    evImpact: 0.12,
  },
  missing_thin_value: {
    category: 'river',
    street: 'river',
    spotType: 'river_value',
    name: 'Missing Thin Value Bets',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'riverBetOpps',
    minSamples: 26,
    recommendedDrill: 'cash-004',
    check: (stats) => stats.riverValueBetFreq < 40 && stats.riverBetOpps > 25,
    optimalRange: [50, 60],
    evImpact: 0.07,
  },
  passive_postflop: {
    category: 'postflop',
    street: 'flop',
    spotType: 'postflop_aggression',
    name: 'Too Passive Postflop',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'postflopActions',
    minSamples: 40,
    recommendedDrill: 'cash-004',
    check: (stats) => stats.aggFactor < 1.5 && stats.postflopActions >= 40,
    optimalRange: [2.0, 3.5],
    evImpact: 0.09,
  },
  over_aggressive_postflop: {
    category: 'postflop',
    street: 'flop',
    spotType: 'pot_control',
    name: 'Over-Aggressive Postflop',
    ruleVersion: DETECTOR_RULE_VERSION,
    evidenceBasis: EVIDENCE_BASIS.DETERMINISTIC_RULE,
    opportunityKey: 'postflopActions',
    minSamples: 40,
    recommendedDrill: 'cash-024',
    check: (stats) => stats.aggFactor > 5.0 && stats.postflopActions >= 40,
    optimalRange: [2.0, 3.5],
    evImpact: 0.08,
  },
};

export const PATTERN_STAT_KEYS = {
  overfolding_preflop: ['vpip'],
  overlimping: ['limpFreq'],
  cold_call_too_wide: ['coldCallFreq'],
  three_bet_too_tight: ['threeBetFreq'],
  three_bet_too_loose: ['threeBetFreq'],
  overfolding_to_cbets: ['foldToCbet', 'cbetsFaced'],
  cbet_too_often: ['cbetFreq', 'cbetOpps'],
  cbet_too_rarely: ['cbetFreq', 'cbetOpps'],
  check_raise_too_rare: ['checkRaiseFreq', 'checkRaiseOpps'],
  turn_barrel_too_rare: ['turnBarrelFreq', 'turnBarrelOpps'],
  turn_overfold: ['turnFoldFreq', 'turnFaced'],
  lack_of_river_bluffs: ['riverBluffFreq', 'riverBluffOpps'],
  river_overfold: ['riverFoldFreq', 'riverFaced'],
  missing_thin_value: ['riverValueBetFreq', 'riverBetOpps'],
  passive_postflop: ['aggFactor', 'postflopActions'],
  over_aggressive_postflop: ['aggFactor', 'postflopActions'],
};

export const PATTERN_MINIMUM_EVIDENCE = {
  overfolding_preflop: ['handsPlayed', 501],
  overlimping: ['handsPlayed', 201],
  cold_call_too_wide: ['handsPlayed', 301],
  three_bet_too_tight: ['handsPlayed', 501],
  three_bet_too_loose: ['handsPlayed', 501],
  overfolding_to_cbets: ['cbetsFaced', 51],
  cbet_too_often: ['cbetOpps', 51],
  cbet_too_rarely: ['cbetOpps', 51],
  check_raise_too_rare: ['checkRaiseOpps', 31],
  turn_barrel_too_rare: ['turnBarrelOpps', 31],
  turn_overfold: ['turnFaced', 41],
  lack_of_river_bluffs: ['riverBluffOpps', 21],
  river_overfold: ['riverFaced', 31],
  missing_thin_value: ['riverBetOpps', 26],
  passive_postflop: ['postflopActions', 40],
  over_aggressive_postflop: ['postflopActions', 40],
};

export function patternIsMeasured(stats, leakType) {
  const required = PATTERN_STAT_KEYS[leakType] || [];
  if (required.some(key => stats[key] === null || stats[key] === undefined)) return false;
  const [sampleKey, minimum] = PATTERN_MINIMUM_EVIDENCE[leakType] || [];
  return !sampleKey || Number(stats[sampleKey]) >= minimum;
}

export function deviationFromRange(value, optimalRange) {
  const [optMin, optMax] = optimalRange;
  if (value < optMin) return optMin - value;
  if (value > optMax) return value - optMax;
  return 0;
}

export function parseHandSummary(summary) {
  if (!summary) return null;
  if (typeof summary === 'object') return summary;
  if (typeof summary !== 'string') return null;
  try { return JSON.parse(summary); } catch (_) { return null; }
}

export function normalizeAuditHand(row, userId) {
  const summary = parseHandSummary(row?.summary);
  const playerRows = summary?.players || row?.players || [];
  const hero = playerRows.find(p => String(p?.userId ?? p?.id ?? p?.playerId) === String(userId));
  const heroId = hero?.userId ?? hero?.id ?? hero?.playerId ?? userId;

  let actions = Array.isArray(row?.actions) ? row.actions : [];
  if (actions.length === 0 && summary?.streets) {
    actions = [];
    for (const street of ['preflop', 'flop', 'turn', 'river']) {
      for (const action of summary.streets?.[street]?.actions || []) {
        actions.push({ ...action, street });
      }
    }
  }

  const FORCED_AUDIT_ACTIONS = new Set([
    'sb', 'bb', 'smallblind', 'bigblind', 'blind', 'ante', 'straddle',
    'killblind', 'bombante', 'post', 'posts', 'return', 'returnedbet',
    'refund', 'collect', 'collected', 'payout', 'win', 'wins', 'discard',
  ]);

  return {
    ...row,
    actions: actions
      .filter(action => {
        if (!action || action?.historyEvent === 'uncalled_bet_returned') return false;
        const compact = String(action?.action || action?.type || '').toLowerCase().replace(/[-_\s]/g, '');
        if (FORCED_AUDIT_ACTIONS.has(compact) || /^ritboard\d*/.test(compact)) return false;
        if (String(action?.origin || '').toLowerCase() === 'forced' && /^(small|big)?blind|ante|straddle|kill/.test(compact)) {
          return false;
        }
        return true;
      })
      .map(action => {
        const actionPlayerId = action?.playerId ?? action?.userId ?? action?.player_id;
        const actionName = action?.player ?? action?.username ?? action?.name;
        return {
          ...action,
          action: String(action?.action || action?.type || '').replace('all_in', 'allin').toLowerCase(),
          street: String(action?.street || action?.stage || 'preflop').toLowerCase(),
          is_hero: action?.is_hero === true || action?.isHero === true
            || String(actionPlayerId) === String(heroId)
            || (!!hero?.displayName && actionName === hero.displayName)
            || (!!hero?.username && actionName === hero.username),
        };
      }),
  };
}

const SUPPORTED_NLH_VARIANTS = new Set([
  'nl', 'nlh', 'nlhe', 'holdem', 'holdemnl', 'texasholdem', 'nolimit', 'nolimitholdem',
]);

/**
 * Determine whether a Club Arena hand row belongs to standard single-board
 * No-Limit Hold'em (cash or tournament) and therefore qualifies for NLH
 * statistical and solver-backed leak analysis.
 */
export function classifyHandAuditEligibility(row, { requireExplicitVariant = false } = {}) {
  const summary = parseHandSummary(row?.summary) || {};
  const rawVariant = String(row?.game_variant ?? row?.gameVariant ?? summary?.variant ?? row?.gameType ?? '').trim();
  const compactVariant = rawVariant.toLowerCase().replace(/[^a-z0-9+]/g, '');
  const alphaVariant = rawVariant.toLowerCase().replace(/[^a-z]/g, '');
  const isTournament = Boolean(
    row?.tournament_id
    || summary?.tournamentId
    || summary?.tournament_id
    || String(row?.format || summary?.format || summary?.gameMode || '').toLowerCase() === 'tournament',
  );
  const format = isTournament ? 'tournament' : 'cash';

  const hasVariant = rawVariant.length > 0;
  const isHoldem = hasVariant
    ? (SUPPORTED_NLH_VARIANTS.has(alphaVariant) && !/(plo|omaha|ofc|pineapple|short|6\+|stud|razz|badugi|draw|mixed)/.test(compactVariant))
    : !requireExplicitVariant;

  if (!isHoldem) {
    return {
      eligible: false,
      reason: 'unsupported_variant',
      variant: rawVariant || 'unknown',
      format,
      limitation: `Automated Solver And NLH Leak Analysis Supports Standard Single-Board No-Limit Hold'em Only (${rawVariant || 'Unknown Variant'} Is Explicitly Unmeasured).`,
    };
  }

  const isBombPot = (row?.bomb_pot !== null && row?.bomb_pot !== undefined && row?.bomb_pot !== false)
    || Boolean(summary?.bombPot || summary?.bomb_pot);
  const isKillPot = (row?.kill_pot !== null && row?.kill_pot !== undefined && row?.kill_pot !== false)
    || Boolean(summary?.killPot || summary?.kill_pot);
  const isMultiBoard = (Array.isArray(row?.community_cards2) && row.community_cards2.length > 0)
    || (Array.isArray(row?.community_cards3) && row.community_cards3.length > 0)
    || (Array.isArray(row?.rit_boards) && row.rit_boards.length > 0)
    || (Array.isArray(summary?.ritBoards) && summary.ritBoards.length > 0)
    || (Array.isArray(summary?.rit_boards) && summary.rit_boards.length > 0)
    || Number(row?.rit_boards ?? summary?.ritBoards ?? summary?.rit_boards ?? row?.run_it_count ?? 1) > 1;

  if (isBombPot || isKillPot || isMultiBoard) {
    const specialLabels = [];
    if (isBombPot) specialLabels.push('Bomb Pot');
    if (isKillPot) specialLabels.push('Kill Pot');
    if (isMultiBoard) specialLabels.push('Multi-Board Run-It-Twice');
    return {
      eligible: false,
      reason: 'unsupported_special_format',
      variant: rawVariant || 'nlh',
      format,
      specialFormat: specialLabels.join(', '),
      limitation: `Special Format Hands (${specialLabels.join(', ')}) Are Excluded From Standard Single-Board NLH Solver And Statistical Leak Grading.`,
    };
  }

  return {
    eligible: true,
    reason: null,
    variant: rawVariant || 'nlh',
    format,
    limitation: null,
  };
}

export function computeStatsFromAuditHands(hands, userId) {
  const isHero = (a) => a.player === 'hero' || a.is_hero || a.isHero;
  const act = (a) => (a.action || '').toLowerCase();
  const isAggressive = (a) => ['bet', 'raise', 'allin'].includes(act(a));

  let eligibleHands = 0;
  let cashHands = 0;
  let tournamentHands = 0;
  let excludedUnsupportedHands = 0;
  let excludedSpecialFormatHands = 0;

  let vpipHands = 0;
  let pfrHands = 0;
  let limps = 0;
  let coldCalls = 0;
  let threeBetOpps = 0;
  let threeBets = 0;
  let cbetOpps = 0;
  let cbets = 0;
  let cbetsFaced = 0;
  let foldsToCbet = 0;
  let checkRaiseOpps = 0;
  let checkRaises = 0;
  let turnBarrelOpps = 0;
  let turnBarrels = 0;
  let turnFaced = 0;
  let turnFolds = 0;
  let riverFaced = 0;
  let riverFolds = 0;
  let postflopAggressiveActions = 0;
  let postflopPassiveActions = 0;
  let sawFlopHands = 0;
  let wentToShowdownHands = 0;

  const heroFacingBet = (streetActions) => {
    let betSeen = false;
    for (const a of streetActions) {
      if (isHero(a) && (betSeen || a.facing_bet)) {
        return { faced: true, folded: act(a) === 'fold' };
      }
      if (!isHero(a) && isAggressive(a)) betSeen = true;
    }
    return { faced: false, folded: false };
  };

  (Array.isArray(hands) ? hands : []).forEach(rawHand => {
    const eligibility = classifyHandAuditEligibility(rawHand);
    if (!eligibility.eligible) {
      if (eligibility.reason === 'unsupported_special_format') excludedSpecialFormatHands++;
      else excludedUnsupportedHands++;
      return;
    }
    eligibleHands++;
    if (eligibility.format === 'tournament') tournamentHands++;
    else cashHands++;

    const hand = normalizeAuditHand(rawHand, userId);
    const actions = hand.actions;
    const pre = actions.filter(a => a.street === 'preflop');
    const flop = actions.filter(a => a.street === 'flop');
    const turn = actions.filter(a => a.street === 'turn');
    const river = actions.filter(a => a.street === 'river');

    let raiseSeen = false;
    let heroVpip = false;
    let heroPfr = false;
    let heroLimped = false;
    let heroColdCalled = false;
    let heroCalledRaise = false;
    let hero3Bet = false;
    let hero3BetOpp = false;
    let heroFoldedPreflop = false;

    for (const a of pre) {
      const action = act(a);
      if (isHero(a)) {
        if (action === 'call') {
          heroVpip = true;
          if (raiseSeen) {
            heroColdCalled = true;
            heroCalledRaise = true;
            hero3BetOpp = true;
          } else {
            heroLimped = true;
          }
        } else if (action === 'raise' || action === 'bet' || action === 'allin') {
          heroVpip = true;
          heroPfr = true;
          if (raiseSeen) {
            hero3Bet = true;
            hero3BetOpp = true;
          }
        } else if (action === 'fold') {
          heroFoldedPreflop = true;
          if (raiseSeen) hero3BetOpp = true;
        }
      }
      if (action === 'raise' || action === 'bet' || action === 'allin') raiseSeen = true;
    }

    if (heroVpip) vpipHands++;
    if (heroPfr) pfrHands++;
    if (heroLimped && !heroPfr) limps++;
    if (heroColdCalled && !heroPfr) coldCalls++;
    if (hero3BetOpp) {
      threeBetOpps++;
      if (hero3Bet) threeBets++;
    }

    const postflopActions = [...flop, ...turn, ...river];
    let heroFoldedPostflop = false;
    for (const a of postflopActions) {
      if (!isHero(a)) continue;
      const action = act(a);
      if (action === 'bet' || action === 'raise' || action === 'allin') {
        postflopAggressiveActions++;
      } else if (action === 'call') {
        postflopPassiveActions++;
      } else if (action === 'fold') {
        heroFoldedPostflop = true;
      }
    }

    const summaryObj = parseHandSummary(rawHand?.summary);
    const boardCards = Array.isArray(rawHand?.community_cards)
      ? rawHand.community_cards
      : (Array.isArray(rawHand?.board) ? rawHand.board : []);
    const heroSawFlop = !heroFoldedPreflop && (flop.length > 0 || boardCards.length >= 3);
    if (heroSawFlop) {
      sawFlopHands++;
      const explicitShowdown = summaryObj?.wentToShowdown === true
        || summaryObj?.showdown === true
        || (rawHand?.hole_cards && typeof rawHand.hole_cards === 'object' && Object.keys(rawHand.hole_cards).length >= 2);
      const reachedRiverShowdown = !heroFoldedPostflop && (explicitShowdown || (river.length > 0 && boardCards.length >= 5));
      if (reachedRiverShowdown) wentToShowdownHands++;
    }

    if (heroPfr && flop.length > 0) {
      cbetOpps++;
      if (flop.some(a => isHero(a) && isAggressive(a))) cbets++;
    }

    if (heroCalledRaise && !heroPfr && flop.length > 0) {
      const { faced, folded } = heroFacingBet(flop);
      if (faced) {
        cbetsFaced++;
        if (folded) foldsToCbet++;
      }
    }

    if (flop.length > 0) {
      let heroChecked = false;
      let betAfterCheck = false;
      for (const a of flop) {
        if (isHero(a)) {
          if (act(a) === 'check') {
            heroChecked = true;
          } else if (heroChecked && (betAfterCheck || a.facing_bet)) {
            checkRaiseOpps++;
            if (act(a) === 'raise' || act(a) === 'allin') checkRaises++;
            break;
          }
        } else if (heroChecked && !isHero(a) && isAggressive(a)) {
          betAfterCheck = true;
        }
      }
    }

    const heroCbetFlop = heroPfr && flop.some(a => isHero(a) && isAggressive(a));
    if (heroCbetFlop && turn.length > 0) {
      turnBarrelOpps++;
      if (turn.some(a => isHero(a) && isAggressive(a))) turnBarrels++;
    }

    if (turn.length > 0) {
      const { faced, folded } = heroFacingBet(turn);
      if (faced) {
        turnFaced++;
        if (folded) turnFolds++;
      }
    }
    if (river.length > 0) {
      const { faced, folded } = heroFacingBet(river);
      if (faced) {
        riverFaced++;
        if (folded) riverFolds++;
      }
    }
  });

  const total = eligibleHands;
  const pct = (n, d) => (d > 0 ? (n / d) * 100 : null);
  const postflopActions = postflopAggressiveActions + postflopPassiveActions;

  return {
    handsPlayed: total,
    cashHands,
    tournamentHands,
    excludedUnsupportedHands,
    excludedSpecialFormatHands,
    formatBreakdown: {
      cashHands,
      tournamentHands,
      excludedUnsupportedHands,
      excludedSpecialFormatHands,
    },
    vpip: total > 0 ? (vpipHands / total) * 100 : null,
    pfr: total > 0 ? (pfrHands / total) * 100 : null,
    limpFreq: total > 0 ? (limps / total) * 100 : null,
    coldCallFreq: total > 0 ? (coldCalls / total) * 100 : null,
    threeBetFreq: pct(threeBets, threeBetOpps),
    foldToCbet: pct(foldsToCbet, cbetsFaced),
    cbetsFaced,
    cbetFreq: pct(cbets, cbetOpps),
    cbetOpps,
    checkRaiseFreq: pct(checkRaises, checkRaiseOpps),
    checkRaiseOpps,
    turnBarrelFreq: pct(turnBarrels, turnBarrelOpps),
    turnBarrelOpps,
    turnFoldFreq: pct(turnFolds, turnFaced),
    turnFaced,
    riverFoldFreq: pct(riverFolds, riverFaced),
    riverFaced,
    riverBluffFreq: null,
    riverBluffOpps: 0,
    riverValueBetFreq: null,
    riverBetOpps: 0,
    postflopAggressiveActions,
    postflopPassiveActions,
    postflopActions,
    aggFactor: postflopPassiveActions > 0 ? +(postflopAggressiveActions / postflopPassiveActions).toFixed(2) : null,
    wtsd: sawFlopHands > 0 ? +((wentToShowdownHands / sawFlopHands) * 100).toFixed(1) : null,
  };
}

export function classifyLeakStatus(existingLeak, currentValue, optimalRange, options = {}) {
  const deviation = deviationFromRange(currentValue, optimalRange);
  // Ratio metrics (e.g. Aggression Factor `[1.6, 3.4]` or `[2.0, 3.5]`) operate on a
  // ~0-6 scale rather than 0-100%, so comparing them against a 5-point percentage
  // threshold would make new AF leaks mathematically impossible to create.
  const isRatioMetric = Array.isArray(optimalRange)
    && Number.isFinite(Number(optimalRange[0]))
    && Number.isFinite(Number(optimalRange[1]))
    && Number(optimalRange[0]) >= 0
    && Number(optimalRange[1]) <= 10;
  const emergingThreshold = Number.isFinite(Number(options?.minDeviation))
    ? Number(options.minDeviation)
    : (isRatioMetric ? 0.3 : 5);
  const improvingThreshold = isRatioMetric ? 0.25 : 3;
  const improvingMax = isRatioMetric ? 0.8 : 8;

  if (!existingLeak) {
    return deviation >= emergingThreshold ? 'emerging' : null;
  }
  const priorStatus = existingLeak.status === 'resolved' ? 'emerging' : existingLeak.status;
  const trendData = existingLeak.trend_data || [];
  if (trendData.length < 2) {
    return priorStatus || 'emerging';
  }
  const oldValue = trendData[trendData.length - 1]?.value;
  const improvement = oldValue !== null && oldValue !== undefined &&
    deviationFromRange(currentValue, optimalRange) < deviationFromRange(oldValue, optimalRange);

  if (deviation < improvingThreshold) {
    return 'improving';
  } else if (improvement && deviation < improvingMax) {
    return 'improving';
  } else if (existingLeak.occurrence_count > 30) {
    return 'persistent';
  }
  return priorStatus || 'emerging';
}

export function generateExplanation(leakType, currentValue, optimalRange) {
  const [optMin, optMax] = optimalRange;
  const explanations = {
    overfolding_preflop: `Your VPIP of ${currentValue}% is below the optimal ${optMin}-${optMax}%. You're folding too many playable hands preflop.`,
    overlimping: `Your open-limp frequency is ${currentValue}%, above the optimal ${optMin}-${optMax}%. Enter unopened pots with a raise or fold.`,
    cold_call_too_wide: `You're cold-calling ${currentValue}% of preflop raises, above the optimal ${optMin}-${optMax}%. Flatting too wide out of the blinds leaves your range capped.`,
    three_bet_too_tight: `Your 3-bet frequency of ${currentValue}% is too passive. The optimal range is ${optMin}-${optMax}%.`,
    three_bet_too_loose: `Your 3-bet frequency of ${currentValue}% exceeds the optimal ${optMin}-${optMax}% range, exposing you to 4-bets and trap calls with dominated hands.`,
    overfolding_to_cbets: `You're folding to c-bets ${currentValue}% of the time, but GTO recommends ${optMin}-${optMax}%. This makes you exploitable and costs EV.`,
    cbet_too_often: `You're c-betting ${currentValue}% of the time, above the optimal ${optMin}-${optMax}%. This makes your checking range too weak.`,
    cbet_too_rarely: `You're only c-betting ${currentValue}% of flops, below the optimal ${optMin}-${optMax}%. You're missing value with strong hands.`,
    check_raise_too_rare: `Your flop check-raise frequency is ${currentValue}%, below the optimal ${optMin}-${optMax}%. Opponents can c-bet wide against you without fear of being raised.`,
    turn_barrel_too_rare: `You're only barreling the turn ${currentValue}% when you should be at ${optMin}-${optMax}%.`,
    turn_overfold: `You're folding ${currentValue}% when facing a turn bet, above the optimal ${optMin}-${optMax}%. Opponents can profitably double-barrel bluff against you.`,
    lack_of_river_bluffs: `Your river bluff frequency is ${currentValue}%, well below the optimal ${optMin}-${optMax}%. Opponents can fold all bluff-catchers against you.`,
    river_overfold: `You're folding ${currentValue}% on the river, much higher than the optimal ${optMin}-${optMax}%.`,
    missing_thin_value: `Your river value-bet frequency is ${currentValue}%, below the optimal ${optMin}-${optMax}%. Checking back medium-strength made hands leaves thin value uncollected.`,
    passive_postflop: `Your postflop aggression factor of ${currentValue} is below the optimal ${optMin}-${optMax} range. Calling too often instead of betting or raising concedes initiative and value.`,
    over_aggressive_postflop: `Your postflop aggression factor of ${currentValue} exceeds the optimal ${optMin}-${optMax} range. Over-betting and raising thin ranges exposes you to trap calls and check-raises.`,
  };
  return explanations[leakType] || `Your frequency of ${currentValue}% deviates from optimal (${optMin}-${optMax}%).`;
}

export function getCurrentValue(stats, leakType) {
  const valueMap = {
    overfolding_preflop: stats.vpip,
    overlimping: stats.limpFreq,
    cold_call_too_wide: stats.coldCallFreq,
    three_bet_too_tight: stats.threeBetFreq,
    three_bet_too_loose: stats.threeBetFreq,
    overfolding_to_cbets: stats.foldToCbet,
    cbet_too_often: stats.cbetFreq,
    cbet_too_rarely: stats.cbetFreq,
    check_raise_too_rare: stats.checkRaiseFreq,
    turn_barrel_too_rare: stats.turnBarrelFreq,
    turn_overfold: stats.turnFoldFreq,
    lack_of_river_bluffs: stats.riverBluffFreq,
    river_overfold: stats.riverFoldFreq,
    missing_thin_value: stats.riverValueBetFreq,
    passive_postflop: stats.aggFactor,
    over_aggressive_postflop: stats.aggFactor,
  };
  const value = valueMap[leakType];
  return (value === null || value === undefined) ? 0 : +Number(value).toFixed(1);
}

export function updateTrendData(existingTrend, currentValue) {
  const trend = Array.isArray(existingTrend)
    ? existingTrend.map(point => ({ ...point }))
    : [];
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const existingMonth = trend.find(t => t.date === month);
  if (existingMonth) {
    existingMonth.value = currentValue;
  } else {
    trend.push({ date: month, value: currentValue });
  }
  return trend.slice(-6);
}

const SUIT_LETTER = { clubs: 'c', diamonds: 'd', hearts: 'h', spades: 's' };

export function toCardCode(card) {
  if (!card) return null;
  if (typeof card === 'object') {
    const rawRank = String(card.rank ?? '').trim().toUpperCase();
    const rank = rawRank === '10' ? 'T' : rawRank;
    const rawSuit = String(card.suit ?? '').trim().toLowerCase();
    const suit = SUIT_LETTER[rawSuit] || (/^[cdhs]$/.test(rawSuit) ? rawSuit : null);
    return /^[2-9TJQKA]$/.test(rank) && suit ? `${rank}${suit}` : null;
  }
  if (typeof card !== 'string') return null;
  const raw = card.trim();
  if (!raw) return null;
  const m = /^([2-9TJQKA]|10)(clubs|diamonds|hearts|spades|[cdhs])$/i.exec(raw);
  if (!m) return null;
  const rank = m[1].toUpperCase() === '10' ? 'T' : m[1].toUpperCase();
  const suitRaw = m[2].toLowerCase();
  const suit = SUIT_LETTER[suitRaw] || suitRaw;
  return `${rank}${suit}`;
}

export function toCardCodes(cards) {
  if (!Array.isArray(cards)) return null;
  const out = cards.map(toCardCode).filter(Boolean);
  return out.length > 0 ? out : null;
}

export function checkHandForLeak(hand, leakType) {
  const actions = Array.isArray(hand.actions) ? hand.actions : [];
  if (actions.length === 0) return null;

  const isHero = (a) => a.player === 'hero' || a.is_hero || a.isHero;
  const act = (a) => (a.action || '').toLowerCase();
  const isAggressive = (a) => ['bet', 'raise', 'allin'].includes(act(a));
  const onStreet = (s) => actions.filter(a => a.street === s);

  const heroFacingBetDid = (street, response) => {
    let betSeen = false;
    for (const a of onStreet(street)) {
      if (isHero(a) && (betSeen || a.facing_bet) && act(a) === response) return true;
      if (!isHero(a) && isAggressive(a)) betSeen = true;
    }
    return false;
  };

  const heroVsPreflopRaiseDid = (response) => {
    let raiseSeen = false;
    for (const a of onStreet('preflop')) {
      if (isHero(a) && raiseSeen && act(a) === response) return true;
      if (isAggressive(a)) raiseSeen = true;
    }
    return false;
  };

  const heroOpenLimped = () => {
    let raiseSeen = false;
    for (const a of onStreet('preflop')) {
      if (isHero(a) && act(a) === 'call' && !raiseSeen) return true;
      if (isAggressive(a)) raiseSeen = true;
    }
    return false;
  };

  const heroWasPFR = () => onStreet('preflop').some(a => isHero(a) && act(a) === 'raise');
  const heroDidOn = (street, action) => onStreet(street).some(a => isHero(a) && act(a) === action);

  const leakPatterns = {
    overfolding_preflop: { check: () => heroVsPreflopRaiseDid('fold'), action: 'fold vs preflop raise', street: 'preflop' },
    overlimping: { check: heroOpenLimped, action: 'open-limp preflop', street: 'preflop' },
    cold_call_too_wide: { check: () => heroVsPreflopRaiseDid('call'), action: 'cold call vs open raise', street: 'preflop' },
    three_bet_too_tight: { check: () => heroVsPreflopRaiseDid('call'), action: 'flat call instead of 3-bet', street: 'preflop' },
    three_bet_too_loose: { check: () => heroVsPreflopRaiseDid('raise'), action: '3-bet vs open raise', street: 'preflop' },
    overfolding_to_cbets: { check: () => heroFacingBetDid('flop', 'fold'), action: 'fold vs flop c-bet', street: 'flop' },
    cbet_too_often: { check: () => heroWasPFR() && heroDidOn('flop', 'bet'), action: 'flop c-bet as preflop raiser', street: 'flop' },
    cbet_too_rarely: { check: () => heroWasPFR() && heroDidOn('flop', 'check'), action: 'check flop as preflop raiser (missed c-bet)', street: 'flop' },
    check_raise_too_rare: { check: () => heroDidOn('flop', 'check') && heroFacingBetDid('flop', 'call'), action: 'check-call flop (missed check-raise)', street: 'flop' },
    turn_barrel_too_rare: { check: () => heroDidOn('flop', 'bet') && heroDidOn('turn', 'check'), action: 'check turn after flop c-bet (missed barrel)', street: 'turn' },
    turn_overfold: { check: () => heroFacingBetDid('turn', 'fold'), action: 'fold vs turn bet', street: 'turn' },
    lack_of_river_bluffs: {
      check: () => onStreet('river').some(a => isHero(a) && act(a) === 'check' && (a.made_hand === null || a.made_hand === undefined || a.made_hand === false)),
      action: 'check river (missed bluff opportunity)',
      street: 'river',
    },
    river_overfold: { check: () => heroFacingBetDid('river', 'fold'), action: 'fold vs river bet', street: 'river' },
    missing_thin_value: {
      check: () => onStreet('river').some(a => isHero(a) && act(a) === 'check' && a.made_hand === true),
      action: 'check river with a made hand (missed thin value)',
      street: 'river',
    },
    passive_postflop: {
      check: () => ['flop', 'turn', 'river'].some(street => heroFacingBetDid(street, 'call')),
      action: 'passive postflop call instead of raising or betting',
      street: 'flop',
    },
    over_aggressive_postflop: {
      check: () => ['flop', 'turn', 'river'].some(street => onStreet(street).some(a => isHero(a) && ['raise', 'allin'].includes(act(a)))),
      action: 'high-frequency postflop raise or shove',
      street: 'flop',
    },
  };

  const pattern = leakPatterns[leakType];
  if (!pattern) return null;
  try {
    if (pattern.check()) return { action: pattern.action, street: pattern.street };
  } catch (e) {
    console.warn('[checkHandForLeak] Pattern check failed for', leakType, e.message);
  }
  return null;
}

export function getWhyLeakingEV(leakType) {
  const reasons = {
    overfolding_preflop: "Folding too many playable hands preflop forfeits positive-EV opens in late position and lets opponents steal your blinds uncontested.",
    overlimping: "Limping is almost always inferior to raising or folding. You build dead money for opponents and play weaker postflop without initiative.",
    cold_call_too_wide: "Cold-calling too wide preflop puts you in multiway or out-of-position pots with a capped range that struggles to realize equity against squeezes and barrels.",
    three_bet_too_tight: "A low 3-bet frequency makes you predictable. Opponents know your 3-bets are only premium hands and can exploit by folding or 4-betting more accurately.",
    three_bet_too_loose: "3-betting too wide bloats pots with marginal holdings that perform poorly against 4-bets and in-position callers.",
    overfolding_to_cbets: "When you fold too often to c-bets, aggressive opponents can profitably bluff you with any two cards. You're giving up equity with hands that should be calling.",
    cbet_too_often: "When you c-bet too frequently, opponents can profitably check-raise or float you with a wide range. Your checking range becomes weak and exploitable.",
    cbet_too_rarely: "By not c-betting enough, you miss value with strong hands and allow opponents to realize equity cheaply with draws and weak pairs.",
    check_raise_too_rare: "Without a sufficient check-raise threat, in-position aggressors can continuation-bet small with their entire range and realize equity for free.",
    turn_barrel_too_rare: "Not barreling the turn enough lets opponents see cheap rivers and realize equity with draws. Aggressive turn play denies equity and builds pots with value hands.",
    turn_overfold: "Folding too often to turn barrels makes every opponent double-barrel bluff automatically profitable and surrenders pots where you hold reasonable equity.",
    lack_of_river_bluffs: "Without enough bluffs in your river betting/raising range, observant opponents can fold all their bluff-catchers against you, knowing you're only betting for value.",
    river_overfold: "Folding too much on the river means you're being bluffed profitably. Opponents can bet any two cards knowing you'll fold the majority of your range.",
    missing_thin_value: "Checking back medium-strength made hands on the river against capped ranges leaves direct value uncollected in pots you have already won.",
    passive_postflop: "Calling too often postflop without raising lets opponents realize equity cheaply and miss thin value with strong holdings.",
    over_aggressive_postflop: "Excessive postflop betting and raising unbalances your value-to-bluff ratio and lets observant opponents trap you with strong hands.",
  };
  return reasons[leakType] || "This pattern deviates significantly from GTO play and allows opponents to exploit your tendencies.";
}

export function buildLeakTakeaway(leak = {}) {
  const rawType = String(leak.leak_type ?? leak.leakType ?? '').trim().toLowerCase();
  const normalizedType = rawType
    .replace(/^(?:cash|mtt|tournament)_(?:(?:short|mid|deep|unknown)_)?/, '')
    .replace(/_facts$/, '');
  const pattern = LEAK_PATTERNS[rawType] || LEAK_PATTERNS[normalizedType] || null;
  const street = String(leak.street ?? leak.leak_category ?? leak.leakCategory ?? pattern?.street ?? pattern?.category ?? 'postflop').trim();
  const position = String(leak.hero_position ?? leak.heroPosition ?? 'Any').trim();
  const format = String(leak.format_scope ?? leak.formatScope ?? 'NLH').trim();
  const currentFreq = finiteNumber(leak.current_frequency ?? leak.currentFrequency);
  const optimalFreq = finiteNumber(leak.optimal_frequency ?? leak.optimalFrequency);
  const whatYouAreDoing = String(
    leak.explanation
    || (currentFreq !== null && optimalFreq !== null
      ? `Observed frequency ${currentFreq}% vs ${optimalFreq}% target in ${leak.situation_class || leak.title || rawType || 'this spot'}.`
      : (leak.situation_class || leak.title || 'Recurring strategic deviation detected.')),
  );
  const where = [format, street, position !== 'Any' ? position : null, leak.spot_type ?? leak.spotType ?? pattern?.spotType ?? null]
    .filter(Boolean)
    .join(' · ');
  const whatToDoNextTime = String(
    PATTERN_NEXT_TIME_ACTION[rawType]
    || PATTERN_NEXT_TIME_ACTION[normalizedType]
    || leak.suggested_fix
    || leak.suggestedFix
    || generateLeakFix(leak),
  );
  return {
    whatYouAreDoing,
    where,
    whatToDoNextTime,
    summary: `What you are doing: ${whatYouAreDoing} Where: ${where}. Next time: ${whatToDoNextTime}`,
  };
}

export default {
  DETECTOR_RULE_VERSION,
  EVIDENCE_BASIS,
  classifyEvidenceBasis,
  buildLeakTakeaway,
  confidenceScore,
  confidenceTier,
  leakTypeSlug,
  leakTypeTitle,
  leakStatusPersistenceFields,
  normalizeUserLeakRow,
  toUserLeakPersistenceRow,
  generateLeakFix,
  LEAK_PATTERNS,
  PATTERN_STAT_KEYS,
  PATTERN_MINIMUM_EVIDENCE,
  patternIsMeasured,
  deviationFromRange,
  parseHandSummary,
  classifyHandAuditEligibility,
  normalizeAuditHand,
  computeStatsFromAuditHands,
  classifyLeakStatus,
  generateExplanation,
  getCurrentValue,
  updateTrendData,
  toCardCode,
  toCardCodes,
  checkHandForLeak,
  getWhyLeakingEV,
};
