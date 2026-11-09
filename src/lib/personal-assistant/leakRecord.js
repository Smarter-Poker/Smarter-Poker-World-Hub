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
  const { _sample_count, _mistake_count, _ev_measured_count, ...publicFields } = leak;

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

export function generateLeakFix(leak) {
  const drill = leak.recommended_drill ? ` Open the ${leak.recommended_drill} drill` : ' Open the matching focused drill';
  if (['training_solver', 'solver_engine'].includes(leak.source_system)) {
    return `Review the exact ${String(leak.leak_category || 'solver').toLowerCase()} node, then repeat it until your solver-graded error rate is below ${leak.optimal_frequency}%.${drill} and compare every mixed action to its range frequency before answering.`;
  }
  return `Review the opportunities behind this frequency before changing your strategy.${drill}, then rerun detection after a fresh sample to confirm the adjustment.`;
}

export const LEAK_PATTERNS = {
  overfolding_preflop: {
    category: 'preflop',
    name: 'Overfolding Preflop',
    check: (stats) => stats.vpip < 18 && stats.handsPlayed > 500,
    optimalRange: [22, 28],
    evImpact: 0.08,
  },
  overlimping: {
    category: 'preflop',
    name: 'Too Much Limping',
    check: (stats) => stats.limpFreq > 8 && stats.handsPlayed > 200,
    optimalRange: [0, 3],
    evImpact: 0.12,
  },
  cold_call_too_wide: {
    category: 'preflop',
    name: 'Cold Calling Too Wide',
    check: (stats) => stats.coldCallFreq > 12 && stats.handsPlayed > 300,
    optimalRange: [6, 10],
    evImpact: 0.06,
  },
  three_bet_too_tight: {
    category: 'preflop',
    name: '3-Betting Too Tight',
    check: (stats) => stats.threeBetFreq < 5 && stats.handsPlayed > 500,
    optimalRange: [7, 10],
    evImpact: 0.05,
  },
  three_bet_too_loose: {
    category: 'preflop',
    name: '3-Betting Too Loose',
    check: (stats) => stats.threeBetFreq > 14 && stats.handsPlayed > 500,
    optimalRange: [7, 10],
    evImpact: 0.07,
  },
  overfolding_to_cbets: {
    category: 'flop',
    name: 'Overfolding to C-Bets',
    check: (stats) => stats.foldToCbet > 55 && stats.cbetsFaced > 50,
    optimalRange: [40, 50],
    evImpact: 0.14,
  },
  cbet_too_often: {
    category: 'flop',
    name: 'C-Betting Too Often',
    check: (stats) => stats.cbetFreq > 75 && stats.cbetOpps > 50,
    optimalRange: [55, 65],
    evImpact: 0.09,
  },
  cbet_too_rarely: {
    category: 'flop',
    name: 'C-Betting Too Rarely',
    check: (stats) => stats.cbetFreq < 40 && stats.cbetOpps > 50,
    optimalRange: [55, 65],
    evImpact: 0.11,
  },
  check_raise_too_rare: {
    category: 'flop',
    name: 'Check-Raise Frequency Too Low',
    check: (stats) => stats.checkRaiseFreq < 5 && stats.checkRaiseOpps > 30,
    optimalRange: [8, 12],
    evImpact: 0.06,
  },
  turn_barrel_too_rare: {
    category: 'turn',
    name: 'Not Barreling Turn Enough',
    check: (stats) => stats.turnBarrelFreq < 45 && stats.turnBarrelOpps > 30,
    optimalRange: [55, 65],
    evImpact: 0.10,
  },
  turn_overfold: {
    category: 'turn',
    name: 'Overfolding on Turn',
    check: (stats) => stats.turnFoldFreq > 50 && stats.turnFaced > 40,
    optimalRange: [35, 45],
    evImpact: 0.08,
  },
  lack_of_river_bluffs: {
    category: 'river',
    name: 'Not Enough River Bluffs',
    check: (stats) => stats.riverBluffFreq < 8 && stats.riverBluffOpps > 20,
    optimalRange: [12, 18],
    evImpact: 0.08,
  },
  river_overfold: {
    category: 'river',
    name: 'Overfolding on River',
    check: (stats) => stats.riverFoldFreq > 55 && stats.riverFaced > 30,
    optimalRange: [40, 50],
    evImpact: 0.12,
  },
  missing_thin_value: {
    category: 'river',
    name: 'Missing Thin Value Bets',
    check: (stats) => stats.riverValueBetFreq < 40 && stats.riverBetOpps > 25,
    optimalRange: [50, 60],
    evImpact: 0.07,
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

  return {
    ...row,
    actions: actions.map(action => {
      const actionPlayerId = action?.playerId ?? action?.userId ?? action?.player_id;
      const actionName = action?.player ?? action?.username ?? action?.name;
      return {
        ...action,
        action: String(action?.action || action?.type || '').replace('all_in', 'allin').toLowerCase(),
        street: String(action?.street || 'preflop').toLowerCase(),
        is_hero: action?.is_hero === true || action?.isHero === true
          || String(actionPlayerId) === String(heroId)
          || (!!hero?.displayName && actionName === hero.displayName)
          || (!!hero?.username && actionName === hero.username),
      };
    }),
  };
}

export function computeStatsFromAuditHands(hands, userId) {
  const total = hands.length;
  const isHero = (a) => a.player === 'hero' || a.is_hero || a.isHero;
  const act = (a) => (a.action || '').toLowerCase();
  const isAggressive = (a) => ['bet', 'raise'].includes(act(a));

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

  hands.forEach(rawHand => {
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
        } else if (action === 'raise' || action === 'bet') {
          heroVpip = true;
          heroPfr = true;
          if (raiseSeen) {
            hero3Bet = true;
            hero3BetOpp = true;
          }
        } else if (action === 'fold' && raiseSeen) {
          hero3BetOpp = true;
        }
      }
      if (action === 'raise' || action === 'bet') raiseSeen = true;
    }

    if (heroVpip) vpipHands++;
    if (heroPfr) pfrHands++;
    if (heroLimped && !heroPfr) limps++;
    if (heroColdCalled && !heroPfr) coldCalls++;
    if (hero3BetOpp) {
      threeBetOpps++;
      if (hero3Bet) threeBets++;
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
            if (act(a) === 'raise') checkRaises++;
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

  const pct = (n, d) => (d > 0 ? (n / d) * 100 : null);

  return {
    handsPlayed: total,
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
    aggFactor: null,
    wtsd: null,
  };
}

export function classifyLeakStatus(existingLeak, currentValue, optimalRange) {
  const deviation = deviationFromRange(currentValue, optimalRange);
  if (!existingLeak) {
    return deviation > 5 ? 'emerging' : null;
  }
  const priorStatus = existingLeak.status === 'resolved' ? 'emerging' : existingLeak.status;
  const trendData = existingLeak.trend_data || [];
  if (trendData.length < 2) {
    return priorStatus || 'emerging';
  }
  const oldValue = trendData[trendData.length - 1]?.value;
  const improvement = oldValue !== null && oldValue !== undefined &&
    deviationFromRange(currentValue, optimalRange) < deviationFromRange(oldValue, optimalRange);

  if (deviation < 3) {
    return 'improving';
  } else if (improvement && deviation < 8) {
    return 'improving';
  } else if (existingLeak.occurrence_count > 30) {
    return 'persistent';
  }
  return priorStatus || 'emerging';
}

export function generateExplanation(leakType, currentValue, optimalRange) {
  const [optMin, optMax] = optimalRange;
  const explanations = {
    overfolding_to_cbets: `You're folding to c-bets ${currentValue}% of the time, but GTO recommends ${optMin}-${optMax}%. This makes you exploitable and costs EV.`,
    lack_of_river_bluffs: `Your river bluff frequency is ${currentValue}%, well below the optimal ${optMin}-${optMax}%. Opponents can fold all bluff-catchers against you.`,
    cbet_too_often: `You're c-betting ${currentValue}% of the time, above the optimal ${optMin}-${optMax}%. This makes your checking range too weak.`,
    cbet_too_rarely: `You're only c-betting ${currentValue}% of flops, below the optimal ${optMin}-${optMax}%. You're missing value with strong hands.`,
    three_bet_too_tight: `Your 3-bet frequency of ${currentValue}% is too passive. The optimal range is ${optMin}-${optMax}%.`,
    turn_barrel_too_rare: `You're only barreling the turn ${currentValue}% when you should be at ${optMin}-${optMax}%.`,
    river_overfold: `You're folding ${currentValue}% on the river, much higher than the optimal ${optMin}-${optMax}%.`,
    overfolding_preflop: `Your VPIP of ${currentValue}% is below the optimal ${optMin}-${optMax}%. You're folding too many playable hands preflop.`,
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
    const rank = String(card.rank ?? '').trim();
    const suit = SUIT_LETTER[String(card.suit ?? '').trim().toLowerCase()];
    return rank && suit ? `${rank}${suit}` : null;
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
  const isAggressive = (a) => ['bet', 'raise'].includes(act(a));
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
    overfolding_to_cbets: "When you fold too often to c-bets, aggressive opponents can profitably bluff you with any two cards. You're giving up equity with hands that should be calling.",
    lack_of_river_bluffs: "Without enough bluffs in your river betting/raising range, observant opponents can fold all their bluff-catchers against you, knowing you're only betting for value.",
    cbet_too_often: "When you c-bet too frequently, opponents can profitably check-raise or float you with a wide range. Your checking range becomes weak and exploitable.",
    cbet_too_rarely: "By not c-betting enough, you miss value with strong hands and allow opponents to realize equity cheaply with draws and weak pairs.",
    three_bet_too_tight: "A low 3-bet frequency makes you predictable. Opponents know your 3-bets are only premium hands and can exploit by folding or 4-betting more accurately.",
    turn_barrel_too_rare: "Not barreling the turn enough lets opponents see cheap rivers and realize equity with draws. Aggressive turn play denies equity and builds pots with value hands.",
    river_overfold: "Folding too much on the river means you're being bluffed profitably. Opponents can bet any two cards knowing you'll fold the majority of your range.",
    overlimping: "Limping is almost always inferior to raising or folding. You build dead money for opponents and play weaker postflop without initiative.",
  };
  return reasons[leakType] || "This pattern deviates significantly from GTO play and allows opponents to exploit your tendencies.";
}

export default {
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
