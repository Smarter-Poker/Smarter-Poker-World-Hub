import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
/**
 * POST /api/assistant/leaks/detect
 * Runs leak detection analysis on user's hand history
 *
 * Per Masterplan Section VI:
 * - Identify statistical leaks over time, NOT single-hand mistakes
 * - A leak requires: Repetition, Same situation class, Measurable EV loss
 *
 * Club Arena hands are normalized and solver-audited before aggregation.
 */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/sentryWrap';
import { aggregateSolverLeaks, gradeSolverDecision } from '../../../../src/lib/training/solverDecisionEvidence';
import { syncClubArenaHandsForAudit } from '../../../../src/lib/training/handAuditEngine';
import { toUserLeakPersistenceRow } from '../../../../src/lib/personal-assistant/leakRecord';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/**
 * Generate AI-powered personalized fix suggestion for a leak
 */
function generateLeakFix(leak) {
  const drill = leak.recommended_drill ? ` Open the ${leak.recommended_drill} drill` : ' Open the matching focused drill';
  if (['training_solver', 'solver_engine'].includes(leak.source_system)) {
    return `Review the exact ${String(leak.leak_category || 'solver').toLowerCase()} node, then repeat it until your solver-graded error rate is below ${leak.optimal_frequency}%.${drill} and compare every mixed action to its range frequency before answering.`;
  }
  return `Review the opportunities behind this frequency before changing your strategy.${drill}, then rerun detection after a fresh sample to confirm the adjustment.`;
}

// ═══════════════════════════════════════════════════════════════════════
// LEAK DETECTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════

const LEAK_PATTERNS = {
  // Preflop Leaks
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

  // Flop Leaks
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

  // Turn Leaks
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

  // River Leaks
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

// Stat keys each pattern's check() reads. A pattern only fires when every
// required stat was genuinely measured (non-null) — this prevents fabricating
// leaks from defaulted/unmeasured inputs.
const PATTERN_STAT_KEYS = {
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

function patternIsMeasured(stats, leakType) {
  const required = PATTERN_STAT_KEYS[leakType] || [];
  return !required.some(key => stats[key] === null || stats[key] === undefined);
}

// Distance from the nearest bound of the optimal range (0 when inside range)
function deviationFromRange(value, optimalRange) {
  const [optMin, optMax] = optimalRange;
  if (value < optMin) return optMin - value;
  if (value > optMax) return value - optMax;
  return 0;
}

// ═══════════════════════════════════════════════════════════════════════
// LEAK DETECTION ENGINE
// ═══════════════════════════════════════════════════════════════════════

async function getPlayerStats(supabase, userId) {
  let finalStats = null;

  // 0. PREFERRED: the same RPC the Club Arena stats page reads.
  //
  // Two reasons this comes first. Correctness: the player_stats read below is
  // `.eq('user_id', …).maybeSingle()`, and player_stats holds ONE ROW PER CLUB —
  // so for any player in two or more clubs it errors and silently falls through,
  // which is the same bug that made the stats page show "No Stats Yet".
  // Consistency: the assistant told a player one story about their game while
  // the stats page told another. Both now derive from hand_history.
  //
  // Only exactly-mappable fields are passed through. Anything this RPC does not
  // measure (opportunity counts, street-by-street fold frequencies) is left
  // absent so patternIsMeasured skips those patterns — the house rule that a
  // number which was never measured is never presented as if it was.
  try {
    const { data: rpcStats, error: rpcErr } = await supabase.rpc('ca_player_stats_full', {
      p_user: userId,
    });
    if (rpcErr) {
      console.warn('[LeakDetect] ca_player_stats_full failed:', rpcErr.message);
    } else if (rpcStats?.overall?.total_hands > 0) {
      const o = rpcStats.overall;
      finalStats = normalizeStats({
        // normalizeStats scales anything in (0,1] from fraction to percent, and
        // every value below is a fraction, so the units line up.
        hands_played: o.total_hands,
        vpip: o.vpip,
        pfr: o.pfr,
        three_bet_percentage: o.three_bet_percent,
        cbet_percentage: o.cbet_flop,
        aggression_factor: o.aggression_factor,
      });
      // The window this was computed over, so callers can say so honestly.
      finalStats.analysisWindowHands = o.total_hands;
      finalStats.lifetimeHands = rpcStats?.lifetime?.hands ?? o.total_hands;
    }
  } catch (e) {
    console.warn('[LeakDetect] ca_player_stats_full threw:', e?.message || e);
  }

  // 1. Try to get aggregated stats from live hand history
  const { data: stats, error } = finalStats
    ? { data: null, error: null }
    : await supabase.from('player_stats').select('*').eq('user_id', userId).maybeSingle();

  if (error) console.warn('[LeakDetect] player_stats query failed:', error.message);

  if (finalStats) {
    // already resolved from the RPC
  } else if (!error && stats) {
    finalStats = normalizeStats(stats);
  } else {
    // Try alternative stats table
    const { data: altStats, error: altErr } = await supabase
      .from('user_poker_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (altErr) console.warn('[LeakDetect] user_poker_stats query failed:', altErr.message);

    if (altStats) {
      finalStats = normalizeStats(altStats);
    } else {
      // Try to compute from live hand history — only fetch what we read
      const queryHands = (key) => supabase
        .from('hand_history')
        .select('id, actions, players, summary, created_at')
        .contains('players', JSON.stringify([{ [key]: userId }]))
        .order('created_at', { ascending: false })
        .limit(2000);
      const [modern, legacy] = await Promise.all([queryHands('userId'), queryHands('id')]);
      if (modern.error && legacy.error) {
        console.warn('[LeakDetect] hand_history query failed:', modern.error.message);
      }
      const byId = new Map();
      for (const hand of [...(modern.data || []), ...(legacy.data || [])]) {
        byId.set(String(hand.id), hand);
      }
      const hands = [...byId.values()].slice(0, 2000);
      if (hands.length > 0) {
        finalStats = computeStatsFromHands(hands, userId);
      }
    }
  }

  return finalStats;
}

function normalizeStats(stats) {
  // Return the first numeric value, or null when the column is absent —
  // never fabricate frequencies or sample sizes for missing columns.
  const num = (...vals) => {
    for (const v of vals) {
      if (v !== null && v !== undefined && !Number.isNaN(Number(v))) return Number(v);
    }
    return null;
  };

  /**
   * Every LEAK_PATTERNS threshold is written in PERCENT (vpip < 18,
   * threeBetFreq > 14, foldToCbet > 55). `player_stats` stores these as
   * FRACTIONS: production ranges 0.00–0.55 for vpip and 0.00–0.32 for pfr,
   * with not one row above 1 in 1,156. Read raw, `vpip < 18` is therefore
   * true for every player alive — a 55% VPIP maniac gets told he is
   * "Overfolding Preflop". Anything at or below 1 is a fraction and is
   * scaled; anything above 1 is already a percent and is left alone. The
   * two ranges cannot collide: a real VPIP of 1% does not occur over the
   * 500+ hands these patterns require.
   */
  const asPercent = (...vals) => {
    const v = num(...vals);
    if (v === null) return null;
    return v > 0 && v <= 1 ? v * 100 : v;
  };

  /**
   * A voluntary-action rate of exactly 0 across hundreds of hands is not a
   * measurement, it is an unwritten column: 974 of the 1,089 accounts past
   * the 500-hand gate carry vpip = 0, several with 60k+ hands, which no
   * human produces. Returning null routes these through patternIsMeasured,
   * which skips the pattern — the codebase's standing rule that a number
   * which was never measured must never be presented as if it was.
   * Frequencies that ARE gated by an opportunity count (river bluffs, c-bets)
   * keep their honest zeros; only the ungated preflop rates are treated
   * this way.
   */
  const asMeasuredPercent = (...vals) => {
    const v = asPercent(...vals);
    return v === null || v === 0 ? null : v;
  };

  return {
    handsPlayed: num(stats.hands_played, stats.total_hands) ?? 0,
    vpip: asMeasuredPercent(stats.vpip),
    pfr: asMeasuredPercent(stats.pfr),
    // Postflop rates are ALSO compared against percent thresholds, so they get
    // the same fraction-to-percent normalisation. Their honest zeros survive
    // (asPercent, not asMeasuredPercent) because each one is gated by an
    // opportunity count below: 0% river bluffs over 20+ spots is a real,
    // measured leak, not an unwritten column.
    limpFreq: asPercent(stats.limp_freq, stats.limp_percentage),
    coldCallFreq: asPercent(stats.cold_call_freq, stats.cold_call_percentage),
    threeBetFreq: asPercent(stats.three_bet_freq, stats.three_bet_percentage),
    foldToCbet: asPercent(stats.fold_to_cbet, stats.fold_to_cbet_percentage),
    // Opportunity/faced counts default to 0 (NOT an invented sample) so
    // sample-size gates in the patterns don't fire on unknown samples.
    cbetsFaced: num(stats.cbets_faced) ?? 0,
    cbetFreq: asPercent(stats.cbet_freq, stats.cbet_percentage),
    cbetOpps: num(stats.cbet_opportunities) ?? 0,
    checkRaiseFreq: asPercent(stats.check_raise_freq, stats.check_raise_percentage),
    checkRaiseOpps: num(stats.check_raise_opportunities) ?? 0,
    turnBarrelFreq: asPercent(stats.turn_barrel_freq, stats.turn_cbet_percentage),
    turnBarrelOpps: num(stats.turn_barrel_opportunities) ?? 0,
    turnFoldFreq: asPercent(stats.turn_fold_freq),
    turnFaced: num(stats.turn_bets_faced) ?? 0,
    riverBluffFreq: asPercent(stats.river_bluff_freq, stats.river_aggression),
    riverBluffOpps: num(stats.river_bluff_opportunities) ?? 0,
    riverFoldFreq: asPercent(stats.river_fold_freq),
    riverFaced: num(stats.river_bets_faced) ?? 0,
    riverValueBetFreq: asPercent(stats.river_value_bet_freq),
    riverBetOpps: num(stats.river_bet_opportunities) ?? 0,
    aggFactor: num(stats.aggression_factor, stats.af),
    wtsd: num(stats.wtsd, stats.went_to_showdown),
  };
}

function computeStatsFromHands(hands, userId) {
  return computeStatsFromAuditHands(hands, userId);
}

function parseHandSummary(summary) {
  if (!summary) return null;
  if (typeof summary === 'object') return summary;
  if (typeof summary !== 'string') return null;
  try { return JSON.parse(summary); } catch (_) { return null; }
}

function normalizeAuditHand(row, userId) {
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

function computeStatsFromAuditHands(hands, userId) {
  // Stat computation from raw hands — everything here is genuinely derived
  // from the actions arrays; stats we can't derive are returned as null so
  // the measured-stat guard skips their patterns.
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

  // First hero action on a street while facing a bet/raise
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

    // ── Preflop walk (ordered) ──
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

    // ── C-bet: hero was preflop aggressor and saw a flop ──
    if (heroPfr && flop.length > 0) {
      cbetOpps++;
      if (flop.some(a => isHero(a) && isAggressive(a))) cbets++;
    }

    // ── Fold-to-cbet: hero called a preflop raise, then faced a flop bet ──
    if (heroCalledRaise && !heroPfr && flop.length > 0) {
      const { faced, folded } = heroFacingBet(flop);
      if (faced) {
        cbetsFaced++;
        if (folded) foldsToCbet++;
      }
    }

    // ── Check-raise: hero checked flop, then acted again facing a bet ──
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

    // ── Turn barrel: hero c-bet flop and saw a turn ──
    const heroCbetFlop = heroPfr && flop.some(a => isHero(a) && isAggressive(a));
    if (heroCbetFlop && turn.length > 0) {
      turnBarrelOpps++;
      if (turn.some(a => isHero(a) && isAggressive(a))) turnBarrels++;
    }

    // ── Turn / river folds when facing a bet ──
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
    // Bluff / thin-value stats need hand-strength info we don't have —
    // leave unmeasured so their patterns are skipped, never fabricated.
    riverBluffFreq: null,
    riverBluffOpps: 0,
    riverValueBetFreq: null,
    riverBetOpps: 0,
    aggFactor: null,
    wtsd: null,
  };
}

function classifyLeakStatus(existingLeak, currentValue, optimalRange) {
  const deviation = deviationFromRange(currentValue, optimalRange);

  if (!existingLeak) {
    return deviation > 5 ? 'emerging' : null;
  }

  // The check just fired, so a previously-'resolved' leak has re-emerged
  const priorStatus = existingLeak.status === 'resolved' ? 'emerging' : existingLeak.status;

  // Check trend from existing leak
  const trendData = existingLeak.trend_data || [];
  if (trendData.length < 2) {
    return priorStatus || 'emerging';
  }

  // Compare against the most recent previous reading, using distance to the
  // NEAREST range bound (correct for both under- and over-frequency leaks)
  const oldValue = trendData[trendData.length - 1]?.value;
  const improvement = oldValue !== null && oldValue !== undefined &&
    deviationFromRange(currentValue, optimalRange) < deviationFromRange(oldValue, optimalRange);

  if (deviation < 3) {
    // The pattern check just fired, so this is not resolved — it's close to
    // optimal and trending the right way at best.
    return 'improving';
  } else if (improvement && deviation < 8) {
    return 'improving';
  } else if (existingLeak.occurrence_count > 30) {
    return 'persistent';
  }

  return priorStatus || 'emerging';
}

function generateExplanation(leakType, currentValue, optimalRange) {
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

function canonicalSpotType(question, fallback) {
  const scenario = question?.scenario || {};
  return scenario.spotType || scenario.nodeType || scenario.potType || question?.spotType || fallback || 'general';
}

async function fetchCanonicalQuestionMap(db, rows) {
  const ids = [...new Set((rows || []).map(r => r.question_id).filter(Boolean))];
  const map = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { data, error } = await db
      .from('training_question_cache')
      .select('question_id, game_id, question_data')
      .in('question_id', batch)
      .limit(100);
    if (error) throw error;
    for (const row of data || []) {
      map.set(String(row.question_id), { question: row.question_data, gameId: row.game_id });
      if (row.question_data?.id) map.set(String(row.question_data.id), { question: row.question_data, gameId: row.game_id });
    }
  }
  return map;
}

async function getSolverTrainingEvidence(db, userId) {
  const modernColumns = 'game_id, question_id, answer_id, hero_position, villain_position, street, classification, ev_loss, spot_type, answered_at, solver_verified, solver_source, selected_frequency, optimal_frequency, ev_loss_measured';
  const legacyColumns = 'game_id, question_id, answer_id, hero_position, villain_position, street, classification, ev_loss, spot_type, answered_at';
  let result = await db
    .from('training_answers')
    .select(modernColumns)
    .eq('user_id', userId)
    .order('answered_at', { ascending: false })
    .limit(2000);

  // Safe during a rolling migration. Legacy rows are regraded from canonical
  // cache data below; no client-provided classification becomes solver proof.
  if (result.error?.code === '42703' || /column .* does not exist/i.test(result.error?.message || '')) {
    result = await db
      .from('training_answers')
      .select(legacyColumns)
      .eq('user_id', userId)
      .order('answered_at', { ascending: false })
      .limit(2000);
  }
  let trainingAvailable = !result.error;
  if (result.error) {
    console.warn('[LeakDetect] training_answers evidence query failed:', result.error.message);
  }

  const rows = trainingAvailable ? (result.data || []) : [];
  const decisions = [];
  let trainingDecisionCount = 0;
  if (rows.length > 0) {
    let canonical;
    try {
      canonical = await fetchCanonicalQuestionMap(db, rows);
    } catch (error) {
      console.warn('[LeakDetect] canonical question lookup failed:', error.message);
      trainingAvailable = false;
      canonical = new Map();
    }

    for (const row of rows) {
      const cached = canonical.get(String(row.question_id));
      if (!cached?.question) continue;
      const grade = gradeSolverDecision(cached.question, row.answer_id);
      if (!grade.solverVerified) continue;
      const scenario = cached.question.scenario || {};
      decisions.push({
        ...row,
        game_id: cached.gameId || row.game_id,
        hero_position: scenario.heroPosition || scenario.position || row.hero_position,
        villain_position: scenario.villainPosition || row.villain_position,
        street: scenario.street || row.street,
        spot_type: canonicalSpotType(cached.question, row.spot_type),
        classification: grade.classification,
        ev_loss: grade.evLoss,
        solver_verified: true,
        solver_source: grade.solverSource,
        selected_frequency: grade.selectedFrequency,
        optimal_frequency: grade.optimalFrequency,
        ev_loss_measured: grade.evLossMeasured,
      });
      trainingDecisionCount += 1;
    }
  }

  const auditResult = await db
    .from('hand_audit_decisions')
    .select('game_id, question_id, hero_position, villain_position, street, classification, ev_loss, spot_type, audited_at, solver_verified, solver_source, selected_frequency, optimal_frequency, ev_loss_measured')
    .eq('user_id', userId)
    .eq('solver_verified', true)
    .order('audited_at', { ascending: false })
    .limit(2000);
  const auditAvailable = !auditResult.error;
  if (auditResult.error && auditResult.error.code !== '42P01') {
    console.warn('[LeakDetect] hand_audit_decisions query failed:', auditResult.error.message);
  }
  let handAuditDecisionCount = 0;
  for (const row of auditResult.data || []) {
    decisions.push({ ...row, answered_at: row.audited_at });
    handAuditDecisionCount += 1;
  }

  return {
    // A failure in one evidence source must never erase healthy evidence from
    // the other. Club Arena audits remain usable if training-answer lookup is
    // degraded, and vice versa.
    available: trainingAvailable || auditAvailable,
    sources: {
      training: { available: trainingAvailable, decisions: trainingDecisionCount },
      handAudit: { available: auditAvailable, decisions: handAuditDecisionCount },
    },
    decisions,
    leaks: aggregateSolverLeaks(decisions),
  };
}

function evidenceReceipt({ liveHands, solverEvidence, clubArenaSync }) {
  const trainingDecisions = solverEvidence?.sources?.training?.decisions || 0;
  const handAuditDecisions = solverEvidence?.sources?.handAudit?.decisions || 0;
  const auditedThisRun = clubArenaSync?.decisionsAnalyzed || 0;
  const verifiedThisRun = clubArenaSync?.solverVerified || 0;
  return {
    liveHands,
    verifiedDecisions: solverEvidence?.decisions?.length || 0,
    trainingDecisions,
    handAuditDecisions,
    auditedThisRun,
    verifiedThisRun,
    unpricedThisRun: clubArenaSync?.unpriced || 0,
    verificationRate: auditedThisRun > 0
      ? +((verifiedThisRun / auditedThisRun) * 100).toFixed(1)
      : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// API HANDLER
// ═══════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.ai)) return;

    // Require JWT auth for write operations
    if (req.method !== 'GET') {
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token) return res.status(401).json({ success: false, error: 'Authentication required' });
      const { user: _authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
      if (authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
      // Rebuild the body so an empty/non-JSON body still carries the JWT userId
      req.body = { ...(req.body && typeof req.body === 'object' ? req.body : {}), userId: _authUser.id };
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    try {
      // Live tendencies and solver-graded training decisions are separate
      // evidence sets. They must never be blended into one invented frequency.
      const [stats, clubArenaSync] = await Promise.all([
        getPlayerStats(getSupabase(), userId),
        syncClubArenaHandsForAudit(getSupabase(), userId, { limit: 100, maxDecisions: 250 }),
      ]);
      // Read solver evidence after syncing so newly audited Club Arena
      // decisions are included in this same scan.
      const solverEvidence = await getSolverTrainingEvidence(getSupabase(), userId);
      const liveHands = stats?.handsPlayed || 0;
      const solverDecisions = solverEvidence.decisions.length;
      const evidenceCoverage = evidenceReceipt({ liveHands, solverEvidence, clubArenaSync });
      const evidenceSources = {
        livePlay: liveHands > 0,
        trainingSolver: solverEvidence.sources?.training?.available === true,
        handAudit: solverEvidence.sources?.handAudit?.available === true,
        clubArena: clubArenaSync.available === true,
      };

      if (liveHands < 100 && solverDecisions < 8) {
        return res.status(200).json({
          success: true,
          message: 'Need more evidence to detect leaks (100 live hands or 8 server-verified solver decisions)',
          handsAnalyzed: liveHands,
          solverDecisionsAnalyzed: solverDecisions,
          clubArenaSync,
          evidenceSources,
          evidenceCoverage,
          leaksDetected: 0,
          leaks: [],
        });
      }

      // Get existing leaks
      const { data: existingLeaks, error: existingErr } = await getSupabase()
        .from('user_leaks')
        .select('*')
        .eq('user_id', userId)
        .limit(100);
      if (existingErr) {
        console.warn('[LeakDetect] existing user_leaks query failed:', existingErr.message);
        return res.status(503).json({ success: false, error: 'Leak history is temporarily unavailable. No changes were made.' });
      }

      const existingLeakMap = {};
      (existingLeaks || []).forEach(leak => {
        existingLeakMap[leak.leak_type] = leak;
      });

      // Detect leaks
      const detectedLeaks = [];
      const persistenceEvidence = new Map();
      const now = new Date().toISOString();

      for (const [leakType, pattern] of Object.entries(LEAK_PATTERNS || {})) {
        if (!stats || liveHands < 100) continue;
        // Skip patterns whose inputs were not genuinely measured
        if (!patternIsMeasured(stats, leakType)) continue;

        if (pattern.check(stats)) {
          const existingLeak = existingLeakMap[leakType];
          const currentValue = getCurrentValue(stats, leakType);
          const status = classifyLeakStatus(existingLeak, currentValue, pattern.optimalRange);

          if (!status) continue;

          // EV loss scales with how far the player deviates from optimal
          const [optMin, optMax] = pattern.optimalRange;
          const deviation = deviationFromRange(currentValue, pattern.optimalRange);
          const scaledEvLoss = +(pattern.evImpact * Math.min(3, 1 + deviation / ((optMax - optMin) || 1))).toFixed(3);

          const leak = {
            user_id: userId,
            leak_type: leakType,
            leak_category: pattern.category,
            situation_class: pattern.name,
            status,
            source_system: 'live_play',
            confidence: stats.handsPlayed > 1000 ? 'high' : stats.handsPlayed > 500 ? 'medium' : 'low',
            avg_ev_loss_bb: scaledEvLoss,
            // Aggregate patterns do not expose individual mistake rows. Keep
            // the actual opportunity window stable rather than incrementing on
            // every rerun of the same data.
            occurrence_count: pattern.category === 'preflop'
              ? stats.handsPlayed
              : (stats[PATTERN_STAT_KEYS[leakType]?.find(k => /Opps|Faced/.test(k))] || existingLeak?.occurrence_count || 1),
            optimal_frequency: pattern.optimalRange[0],
            current_frequency: currentValue,
            first_detected_at: existingLeak?.first_detected_at || now,
            last_detected_at: now,
            trend_data: updateTrendData(existingLeak?.trend_data, currentValue),
            explanation: generateExplanation(leakType, currentValue, pattern.optimalRange),
            why_leaking_ev: getWhyLeakingEV(leakType),
          };

          detectedLeaks.push(leak);
          persistenceEvidence.set(leakType, {
            totalSamples: stats.analysisWindowHands || stats.handsPlayed,
            mistakeCount: leak.occurrence_count,
          });
        }
      }

      // Append solver-derived leaks. Their occurrence count is the number of
      // actual mistaken decisions, their denominator is the situation group's
      // sample count, and BB loss is zero unless exact per-action EVs exist.
      for (const solverLeak of solverEvidence.leaks) {
        const { _sample_count, _mistake_count, _ev_measured_count, ...persistableSolverLeak } = solverLeak;
        const existingLeak = existingLeakMap[solverLeak.leak_type];
        const currentValue = solverLeak.current_frequency;
        const optimalRange = [0, solverLeak.optimal_frequency];
        detectedLeaks.push({
          ...persistableSolverLeak,
          user_id: userId,
          status: classifyLeakStatus(existingLeak, currentValue, optimalRange) || solverLeak.status,
          first_detected_at: existingLeak?.first_detected_at || now,
          last_detected_at: now,
          trend_data: updateTrendData(existingLeak?.trend_data, currentValue),
          suggested_fix: existingLeak?.suggested_fix || generateLeakFix(solverLeak),
        });
        persistenceEvidence.set(solverLeak.leak_type, {
          totalSamples: _sample_count,
          mistakeCount: _mistake_count,
        });
      }

      // Save detected leaks and link hand examples
      let secondarySync = {
        handExamples: { persisted: true, linked: 0 },
        suggestionsPersisted: true,
      };
      if (detectedLeaks.length > 0) {
        const persistenceRows = detectedLeaks.map(leak => toUserLeakPersistenceRow(leak, {
          userId,
          ...(persistenceEvidence.get(leak.leak_type) || {}),
        }));
        // Batch upsert all detected leaks — eliminates N+1 (one round-trip)
        const { data: upsertedLeaks, error: upsertErr } = await getSupabase()
          .from('user_leaks')
          .upsert(
            persistenceRows,
            { onConflict: 'user_id,leak_type', ignoreDuplicates: false }
          )
          .select('id, leak_type')
          .limit(100);

        if (upsertErr) {
          console.warn('[LeakDetect] Failed to persist detected leaks:', upsertErr.message);
          return res.status(503).json({
            success: false,
            persisted: false,
            reason: 'write_failed',
            error: 'The audit completed, but Leak Finder could not save the results. No leak history was changed.',
            handsAnalyzed: liveHands,
            solverDecisionsAnalyzed: solverDecisions,
            leaksDetected: detectedLeaks.length,
          });
        }

        // Merge DB ids back into the response objects so clients can deep-link
        const idMap = Object.fromEntries((upsertedLeaks || []).map(r => [r.leak_type, r.id]));
        detectedLeaks.forEach(l => {
          if (idMap[l.leak_type]) l.id = idMap[l.leak_type];
        });

        // Link hand examples (single hand-history fetch, batch save)
        const leaksWithIds = detectedLeaks.filter(l => l.id);
        let handExamplesSync = { persisted: true, linked: 0 };
        if (leaksWithIds.length > 0) {
          handExamplesSync = await linkHandExamples(userId, leaksWithIds);
        }

        // Deterministic fixes keep detection fast, repeatable and independent
        // of an LLM request. Existing personalized notes are preserved.
        const topLeaks = [...detectedLeaks]
          .sort((a, b) => (b.avg_ev_loss_bb || 0) - (a.avg_ev_loss_bb || 0))
          .slice(0, 3);
        topLeaks.forEach(l => {
          l.suggested_fix = l.suggested_fix || existingLeakMap[l.leak_type]?.suggested_fix || generateLeakFix(l);
        });

        // Persist suggestions (requires user_leaks.suggested_fix column;
        // degrade gracefully if it doesn't exist yet)
        const suggestionResults = await Promise.all(topLeaks
          .filter(l => l.id && l.suggested_fix)
          .map(async (l) => {
            const { error: fixErr } = await getSupabase()
              .from('user_leaks')
              .update({ suggested_fix: l.suggested_fix })
              .eq('id', l.id)
              .eq('user_id', userId);
            if (fixErr) console.warn('[LeakDetect] Could not persist suggested_fix (column may be missing):', fixErr.message);
            return !fixErr;
          }));
        secondarySync = {
          handExamples: handExamplesSync,
          suggestionsPersisted: suggestionResults.every(Boolean),
        };
      }

      // Batch-update resolved leaks — eliminates N+1.
      // Only resolve leak types this engine owns (LEAK_PATTERNS) AND whose
      // inputs were measured this run — never touch POSTed/training/custom
      // leak types, and never resolve a leak we simply couldn't measure.
      const resolvedIds = Object.entries(existingLeakMap || {})
        .filter(([leakType, existingLeak]) =>
          ((LEAK_PATTERNS[leakType] && stats && patternIsMeasured(stats, leakType)) ||
            (['training_solver', 'solver_engine'].includes(existingLeak.source_system) && solverEvidence.available)) &&
          !detectedLeaks.find(l => l.leak_type === leakType) &&
          existingLeak.status !== 'resolved'
        )
        .map(([, existingLeak]) => existingLeak.id);

      let resolutionsSynced = true;
      if (resolvedIds.length > 0) {
        const { error: err_user_leaks_fs60f } = await getSupabase()
          .from('user_leaks')
          .update({ status: 'resolved', resolved_at: now, updated_at: now })
          .in('id', resolvedIds);
        if (err_user_leaks_fs60f) {
          resolutionsSynced = false;
          console.warn('[LeakDetect] Failed to sync resolved leaks:', err_user_leaks_fs60f.message);
        }
      }

      // 🚀 NEW BUG #11 FIX: Update Global PA Stats
      // Recalculate active/resolved leaks
      const { data: updatedLeaks, error: updatedLeaksErr } = await getSupabase()
        .from('user_leaks')
        .select('status')
        .eq('user_id', userId)
        .limit(100);

      let statsSynced = !updatedLeaksErr;
      if (updatedLeaksErr) {
        console.warn('[LeakDetect] Refusing to overwrite assistant stats after leak-count read failed:', updatedLeaksErr.message);
      } else {
        const activeLeaks = updatedLeaks.filter(l => l.status !== 'resolved').length;
        const resolvedLeaksCount = updatedLeaks.filter(l => l.status === 'resolved').length;

        // Fetch existing stats. A failed read must not be converted to zero and
        // written back over a real lifetime total.
        const { data: existingStats, error: existingStatsErr } = await getSupabase()
          .from('user_assistant_stats')
          .select('total_hands_analyzed')
          .eq('user_id', userId)
          .maybeSingle();

        if (existingStatsErr) {
          statsSynced = false;
          console.warn('[LeakDetect] Refusing to overwrite assistant stats after current-total read failed:', existingStatsErr.message);
        } else {
          const currentHands = existingStats?.total_hands_analyzed || 0;

          // Atomic Upsert for Stats Sync — SET (not accumulate) hands analyzed so
          // re-running detection on the same hands doesn't inflate the counter.
          // Solver decisions are not hands; one hand can expose many decisions.
          const { error: statsWriteErr } = await getSupabase()
            .from('user_assistant_stats')
            .upsert({
              user_id: userId,
              total_hands_analyzed: Math.max(currentHands, liveHands, clubArenaSync.handsFound || 0),
              active_leaks_count: activeLeaks,
              resolved_leaks_count: resolvedLeaksCount,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
          if (statsWriteErr) {
            statsSynced = false;
            console.warn('[LeakDetect] Assistant stats sync failed:', statsWriteErr.message);
          }
        }
      }

      const partial = !resolutionsSynced || !statsSynced ||
        secondarySync.handExamples?.persisted === false || !secondarySync.suggestionsPersisted;

      return res.status(200).json({
        success: true,
        handsAnalyzed: liveHands,
        solverDecisionsAnalyzed: solverDecisions,
        evidenceSources,
        evidenceCoverage,
        clubArenaSync,
        leaksDetected: detectedLeaks.length,
        leaks: detectedLeaks,
        persisted: true,
        partial,
        sync: {
          ...secondarySync,
          resolutionsPersisted: resolutionsSynced,
          statsPersisted: statsSynced,
        },
      });

    } catch (error) {
      console.warn('Leak detection error:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

function getCurrentValue(stats, leakType) {
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

function updateTrendData(existingTrend, currentValue) {
  const trend = Array.isArray(existingTrend)
    ? existingTrend.map(point => ({ ...point }))
    : [];
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Update or add current month
  const existingMonth = trend.find(t => t.date === month);
  if (existingMonth) {
    existingMonth.value = currentValue;
  } else {
    trend.push({ date: month, value: currentValue });
  }

  // Keep last 6 months
  return trend.slice(-6);
}

/**
 * Normalise one card into the two-character form the rest of the platform
 * speaks: rank + single-letter suit, e.g. "Ah", "Tc", "6s".
 *
 * 2026-08-16: the engine stores cards in TWO shapes and NEITHER is the one the
 * UI reads:
 *
 *   hand_history.hole_cards -> [{ rank: "4", suit: "clubs" }, ...]
 *   hand_history.board      -> ["6spades", "Ahearts", ...]
 *
 * The leak-example renderer does `cards.filter(Boolean).join(' ')`, so a hero
 * holding rendered as literally "[object Object] [object Object]", and the
 * one-tap "practice this hand" link built `?h=[obj` from
 * `snap.hero_cards.join('')`. The board fared slightly better — "6spades
 * Ahearts" is at least legible — but it is not what the drill parser accepts
 * either.
 *
 * Normalising HERE, at the write, rather than at each of the several read
 * sites, is deliberate: `leak_hand_examples` was empty (0 rows platform-wide —
 * the insert had never once succeeded, fixed earlier today), so there is no
 * legacy shape to stay compatible with. Every future row is canonical.
 *
 * The vocabulary is not guessed. Both columns were sampled in production and
 * each yields exactly 52 distinct values: ranks 2-9 T J Q K A (never "10"),
 * suits spelled out in full.
 *
 * Returns null for anything unrecognised, so a bad card is dropped rather than
 * rendered as garbage.
 */
const SUIT_LETTER = { clubs: 'c', diamonds: 'd', hearts: 'h', spades: 's' };

function toCardCode(card) {
  if (!card) return null;

  // { rank: "4", suit: "clubs" } — the hole_cards shape.
  if (typeof card === 'object') {
    const rank = String(card.rank ?? '').trim();
    const suit = SUIT_LETTER[String(card.suit ?? '').trim().toLowerCase()];
    return rank && suit ? `${rank}${suit}` : null;
  }

  if (typeof card !== 'string') return null;
  const raw = card.trim();
  if (!raw) return null;

  // "6spades" — the board shape. Also accepts an already-canonical "6s", which
  // makes this safe to apply twice.
  const m = /^([2-9TJQKA]|10)(clubs|diamonds|hearts|spades|[cdhs])$/i.exec(raw);
  if (!m) return null;
  const rank = m[1].toUpperCase() === '10' ? 'T' : m[1].toUpperCase();
  const suitRaw = m[2].toLowerCase();
  const suit = SUIT_LETTER[suitRaw] || suitRaw;
  return `${rank}${suit}`;
}

/** Map a whole holding / board, dropping anything unparseable. Null if empty. */
function toCardCodes(cards) {
  if (!Array.isArray(cards)) return null;
  const out = cards.map(toCardCode).filter(Boolean);
  return out.length > 0 ? out : null;
}

/**
 * Link relevant hand examples to all detected leaks.
 * Fetches recent hands ONCE, matches each leak's pattern against them, and
 * saves all examples in a single batch upsert.
 * `leaksWithIds` entries need: id, leak_type, avg_ev_loss_bb.
 */
async function linkHandExamples(userId, leaksWithIds) {
  try {
    // Get recent hands that might show these leaks (single fetch for all leaks)
    const { data: hands, error: handsErr } = await getSupabase()
      .from('hand_history')
      // user_id → players containment (there is no user_id column).
      // 2026-08-16: hole_cards is a MAP keyed by user id (showdown-revealed
      // holdings only), not a bare array — see the engine writer in
      // services/supabase/handHistory.ts. Select it raw and pick the hero's
      // entry below; aliasing the whole map to `hero_cards` would have put
      // every player's shown cards into the example.
      .select('id, actions, players, summary, hole_cards, board, button_seat, pot_size, created_at')
      .contains('players', JSON.stringify([{ userId }]))
      .order('created_at', { ascending: false })
      .limit(100);

    if (handsErr) {
      console.warn('[LeakDetect] hand_history fetch for examples failed:', handsErr.message);
      return { persisted: false, linked: 0, reason: 'hand_history_read_failed' };
    }
    if (!hands || hands.length === 0) return { persisted: true, linked: 0 };

    const examples = [];

    for (const leak of leaksWithIds) {
      let count = 0;
      for (const rawHand of hands) {
        const hand = normalizeAuditHand(rawHand, userId);
        const summary = parseHandSummary(rawHand.summary);
        const summaryHero = (summary?.players || []).find(p =>
          String(p?.id ?? p?.userId ?? p?.playerId) === String(userId));
        const leakMatch = checkHandForLeak(hand, leak.leak_type);
        if (!leakMatch) continue;

        // COLUMN FIX 2026-08-15: this insert has NEVER succeeded. It wrote
        // `situation_snapshot` and `ev_loss_bb`, which are the names from the
        // design doc (.agent/skills/personal-assistant/SCHEMA.sql) and NOT the
        // names that were actually deployed. The real columns are `hand_data`
        // and `ev_loss`. Postgres rejected every row with 42703, the catch
        // below logged a console.warn, the per-row fallback retried with the
        // same wrong names, and the endpoint still returned success:true --
        // so `leak_hand_examples` has 0 rows platform-wide while the UI
        // reports a clean detection run.
        //
        // The READ side was already corrected (useAssistant.js aliases
        // `situation_snapshot:hand_data, ev_loss_bb:ev_loss`); only the write
        // side was left behind. `situation_class` is populated too so the
        // examples can be grouped by street, which is what the column is for.
        examples.push({
          leak_id: leak.id,
          hand_history_id: hand.id,
          hand_data: {
            // Hero's own showdown holding, if this hand reached showdown and
            // they were in it. Null when the hand ended before showdown or the
            // hero mucked — mucked cards are deliberately never persisted.
            // Both normalised to "Ah"-style codes — see toCardCode() above for
            // why the raw engine shapes could not be stored as-is.
            hero_cards: toCardCodes(rawHand.hole_cards?.[userId] || summaryHero?.holeCards),
            board: toCardCodes(rawHand.board || summary?.communityCards),
            button_seat: rawHand.button_seat ?? summary?.buttonSeat ?? null,
            pot_size: rawHand.pot_size ?? (summary?.pots || []).reduce((sum, p) => sum + (Number(p?.amount) || 0), 0),
            leak_action: leakMatch.action,
            street: leakMatch.street,
          },
          situation_class: leakMatch.street || null,
          // Use the deviation-scaled EV loss from the detection run, not a
          // second hardcoded constant
          ev_loss: leak.avg_ev_loss_bb,
        });

        // Limit to 5 examples per leak
        if (++count >= 5) break;
      }
    }

    if (examples.length === 0) return { persisted: true, linked: 0 };

    // Single batch upsert; duplicates are ignored via the unique index on
    // (leak_id, hand_history_id)
    const { error: upsertErr } = await getSupabase()
      .from('leak_hand_examples')
      .upsert(examples, { onConflict: 'leak_id,hand_history_id', ignoreDuplicates: true });

    if (upsertErr) {
      // Fallback when the unique index is missing: per-row existence check
      console.warn('[LeakDetect] Batch example upsert failed, falling back:', upsertErr.message);
      let linked = 0;
      for (const example of examples) {
        const { data: existing } = await getSupabase()
          .from('leak_hand_examples')
          .select('id')
          .eq('leak_id', example.leak_id)
          .eq('hand_history_id', example.hand_history_id)
          .maybeSingle();

        if (existing) {
          linked += 1;
        } else {
          const { error: insErr } = await getSupabase().from('leak_hand_examples').insert(example);
          if (insErr) {
            console.warn('[LeakDetect] Failed to link hand example:', insErr.message);
            return { persisted: false, linked, reason: 'example_write_failed' };
          }
          linked += 1;
        }
      }
      return { persisted: true, linked };
    }
    return { persisted: true, linked: examples.length };
  } catch (error) {
    console.warn('Error linking hand examples:', error);
    return { persisted: false, linked: 0, reason: 'example_sync_failed' };
  }
}

/**
 * Check if a hand exhibits the specified leak.
 * Returns { action, street } describing the concrete leak action, or null.
 */
function checkHandForLeak(hand, leakType) {
  const actions = Array.isArray(hand.actions) ? hand.actions : [];
  if (actions.length === 0) return null;

  const isHero = (a) => a.player === 'hero' || a.is_hero || a.isHero;
  const act = (a) => (a.action || '').toLowerCase();
  const isAggressive = (a) => ['bet', 'raise'].includes(act(a));
  const onStreet = (s) => actions.filter(a => a.street === s);

  // Hero performed `response` on `street` while facing a bet/raise
  const heroFacingBetDid = (street, response) => {
    let betSeen = false;
    for (const a of onStreet(street)) {
      if (isHero(a) && (betSeen || a.facing_bet) && act(a) === response) return true;
      if (!isHero(a) && isAggressive(a)) betSeen = true;
    }
    return false;
  };

  // Hero performed `response` preflop after an earlier raise
  const heroVsPreflopRaiseDid = (response) => {
    let raiseSeen = false;
    for (const a of onStreet('preflop')) {
      if (isHero(a) && raiseSeen && act(a) === response) return true;
      if (isAggressive(a)) raiseSeen = true;
    }
    return false;
  };

  // Hero open-limped (preflop call with no prior raise)
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
    // Preflop
    overfolding_preflop: {
      check: () => heroVsPreflopRaiseDid('fold'),
      action: 'fold vs preflop raise',
      street: 'preflop',
    },
    overlimping: {
      check: heroOpenLimped,
      action: 'open-limp preflop',
      street: 'preflop',
    },
    cold_call_too_wide: {
      check: () => heroVsPreflopRaiseDid('call'),
      action: 'cold call vs open raise',
      street: 'preflop',
    },
    three_bet_too_tight: {
      check: () => heroVsPreflopRaiseDid('call'),
      action: 'flat call instead of 3-bet',
      street: 'preflop',
    },
    three_bet_too_loose: {
      check: () => heroVsPreflopRaiseDid('raise'),
      action: '3-bet vs open raise',
      street: 'preflop',
    },

    // Flop
    overfolding_to_cbets: {
      check: () => heroFacingBetDid('flop', 'fold'),
      action: 'fold vs flop c-bet',
      street: 'flop',
    },
    cbet_too_often: {
      check: () => heroWasPFR() && heroDidOn('flop', 'bet'),
      action: 'flop c-bet as preflop raiser',
      street: 'flop',
    },
    cbet_too_rarely: {
      check: () => heroWasPFR() && heroDidOn('flop', 'check'),
      action: 'check flop as preflop raiser (missed c-bet)',
      street: 'flop',
    },
    check_raise_too_rare: {
      check: () => heroDidOn('flop', 'check') && heroFacingBetDid('flop', 'call'),
      action: 'check-call flop (missed check-raise)',
      street: 'flop',
    },

    // Turn
    turn_barrel_too_rare: {
      check: () => heroDidOn('flop', 'bet') && heroDidOn('turn', 'check'),
      action: 'check turn after flop c-bet (missed barrel)',
      street: 'turn',
    },
    turn_overfold: {
      check: () => heroFacingBetDid('turn', 'fold'),
      action: 'fold vs turn bet',
      street: 'turn',
    },

    // River
    lack_of_river_bluffs: {
      // If the writer stores hand strength, only flag checks without a made
      // hand; when absent (null/undefined) fall back to any hero river check.
      check: () => onStreet('river').some(a =>
        isHero(a) && act(a) === 'check' && (a.made_hand === null || a.made_hand === undefined || a.made_hand === false)
      ),
      action: 'check river (missed bluff opportunity)',
      street: 'river',
    },
    river_overfold: {
      check: () => heroFacingBetDid('river', 'fold'),
      action: 'fold vs river bet',
      street: 'river',
    },
    missing_thin_value: {
      // Only detectable when hand strength is recorded
      check: () => onStreet('river').some(a =>
        isHero(a) && act(a) === 'check' && a.made_hand === true
      ),
      action: 'check river with a made hand (missed thin value)',
      street: 'river',
    },
  };

  const pattern = leakPatterns[leakType];
  if (!pattern) return null;

  try {
    if (pattern.check()) {
      return {
        action: pattern.action,
        street: pattern.street,
      };
    }
  } catch (e) {
    console.warn('[checkHandForLeak] Pattern check failed for', leakType, e.message);
    // Pattern check failed — non-fatal, continue
  }

  return null;
}

function getWhyLeakingEV(leakType) {
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
