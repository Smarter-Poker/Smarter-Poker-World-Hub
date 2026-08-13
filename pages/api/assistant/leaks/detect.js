import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
/**
 * POST /api/assistant/leaks/detect
 * Runs leak detection analysis on user's hand history
 *
 * Per Masterplan Section VI:
 * - Identify statistical leaks over time, NOT single-hand mistakes
 * - A leak requires: Repetition, Same situation class, Measurable EV loss
 *
 * Phase 3: Grok AI Integration for personalized fix suggestions
 */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getGrokClient } from '../../../../src/lib/grokClient';
import { reportApiError } from '../../../../src/lib/sentryWrap';

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
async function generateLeakFix(leak) {
  try {
    const grok = getGrokClient();

    const prompt = `You are a poker coach. A player has this leak:

LEAK: ${leak.situation_class}
Current Frequency: ${leak.current_frequency}%
Optimal Range: ${leak.optimal_frequency}%
Avg EV Loss: ${leak.avg_ev_loss_bb} bb per occurrence

Provide a concise, actionable fix in 2-3 sentences. Focus on specific adjustments they can make.`;

    // Bound the call: up to three of these run inside the request path, so an
    // unbounded Grok response can push POST /api/assistant/leaks/detect past the
    // serverless limit and turn an already-persisted detection into a 504.
    let timeoutHandle;
    const response = await Promise.race([
      grok.chat.completions.create({
        model: 'grok-3', // Grok-3
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 150,
      }),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Grok request timed out')), 15000);
      }),
    ]).finally(() => { if (timeoutHandle) clearTimeout(timeoutHandle); });

    return response?.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.warn('[LeakDetect] AI fix generation failed:', error.message);
    return null;
  }
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

  // 1. Try to get aggregated stats from live hand history
  const { data: stats, error } = await getSupabase()
    .from('player_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) console.warn('[LeakDetect] player_stats query failed:', error.message);

  if (!error && stats) {
    finalStats = normalizeStats(stats);
  } else {
    // Try alternative stats table
    const { data: altStats, error: altErr } = await getSupabase()
      .from('user_poker_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (altErr) console.warn('[LeakDetect] user_poker_stats query failed:', altErr.message);

    if (altStats) {
      finalStats = normalizeStats(altStats);
    } else {
      // Try to compute from live hand history — only fetch what we read
      const { data: hands, error: handsErr } = await getSupabase()
        .from('hand_history')
        .select('actions, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(2000);

      if (handsErr) console.warn('[LeakDetect] hand_history query failed:', handsErr.message);

      if (hands && hands.length > 0) {
        finalStats = computeStatsFromHands(hands);
      }
    }
  }

  // 2. FETCH OVERLAY: Fetch training arena / play mode sessions
  const trainingStats = await getTrainingStats(supabase, userId);

  // If we have both, combine them (Training metrics augment live tendencies)
  if (finalStats && trainingStats) {
    return combineLiveAndTrainingStats(finalStats, trainingStats);
  }

  // If only one exists, return it
  return finalStats || trainingStats || null;
}

// ─── DATA BRIDGE FOR TRAINING SESSIONS ─────────────────────────────────────────
async function getTrainingStats(supabase, userId) {
  const { data: sessions, error } = await getSupabase()
    .from('training_sessions')
    .select('classification_counts, mistake_count, hands_played, total_ev_loss')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) console.warn('[LeakDetect] training_sessions query failed:', error.message);
  if (!sessions || sessions.length === 0) return null;

  let totalTrainingHands = 0;
  let combinedClassifications = {};

  sessions.forEach(session => {
    totalTrainingHands += (session.hands_played || 0);

    const cc = session.classification_counts || {};
    Object.keys(cc || {}).forEach(key => {
      combinedClassifications[key] = (combinedClassifications[key] || 0) + cc[key];
    });
  });

  // Translate Training Classifications into Detect.js expected variables
  // Note: Since training records absolute mistake counts, we approximate frequencies based on total hands played
  // A mistake counts as deviating from optimal.
  const getMistakeFreq = (keyName) => {
    if (totalTrainingHands === 0) return 0;
    const count = combinedClassifications[keyName] || 0;
    // Frequency of this mistake occurring across ALL training hands
    return (count / totalTrainingHands) * 100;
  };

  // Opportunity counts are only real if the training-session writers stored
  // them inside classification_counts; otherwise 0 so sample-gated patterns
  // simply don't fire from training-only data.
  const getOppCount = (keyName) => combinedClassifications[keyName] || 0;

  return {
    handsPlayed: totalTrainingHands,
    _isTrainingDominant: true,
    // Purely live stats — not derivable from training mistake counts, so left
    // unmeasured (null) and their patterns are skipped by the measured guard.
    vpip: null,
    pfr: null,
    limpFreq: getMistakeFreq('limp'),
    coldCallFreq: getMistakeFreq('cold_call_wide'),
    threeBetFreq: Math.max(0, 8 - getMistakeFreq('three_bet_tight')),
    foldToCbet: 50 + getMistakeFreq('fold_to_cbet_over'), // Adding mistake rate to baseline optimal
    cbetsFaced: getOppCount('fold_to_cbet_opps'),
    cbetFreq: 60 - getMistakeFreq('missed_cbet_value'),
    cbetOpps: getOppCount('cbet_opps'),
    checkRaiseFreq: 10 - getMistakeFreq('missed_check_raise'),
    checkRaiseOpps: getOppCount('check_raise_opps'),
    turnBarrelFreq: 60 - getMistakeFreq('missed_turn_barrel'),
    turnBarrelOpps: getOppCount('turn_barrel_opps'),
    turnFoldFreq: 40 + getMistakeFreq('turn_overfold'),
    turnFaced: getOppCount('turn_faced_opps'),
    riverBluffFreq: 15 - getMistakeFreq('missed_river_bluff'),
    riverBluffOpps: getOppCount('river_bluff_opps'),
    riverFoldFreq: 45 + getMistakeFreq('river_overfold'),
    riverFaced: getOppCount('river_faced_opps'),
    riverValueBetFreq: 55 - getMistakeFreq('missed_thin_value'),
    riverBetOpps: getOppCount('river_bet_opps'),
    aggFactor: null,
    wtsd: null,
  };
}

function combineLiveAndTrainingStats(live, train) {
  // Weighted average based on hand volume
  const liveWt = live.handsPlayed / (live.handsPlayed + train.handsPlayed);
  const trainWt = train.handsPlayed / (live.handsPlayed + train.handsPlayed);

  // Null-aware weighting: an unmeasured (null) side never fabricates a value
  const weighted = (key) => {
    const l = live[key];
    const t = train[key];
    if (l === null || l === undefined) {
      return (t === null || t === undefined) ? null : t;
    }
    if (t === null || t === undefined) return l;
    return l * liveWt + t * trainWt;
  };

  return {
    handsPlayed: live.handsPlayed + train.handsPlayed,
    _isTrainingDominant: trainWt > 0.5,
    vpip: live.vpip ?? train.vpip, // Mostly rely on live for foundational
    pfr: live.pfr ?? train.pfr,
    limpFreq: weighted('limpFreq'),
    coldCallFreq: weighted('coldCallFreq'),
    threeBetFreq: weighted('threeBetFreq'),
    foldToCbet: weighted('foldToCbet'),
    cbetsFaced: (live.cbetsFaced || 0) + (train.cbetsFaced || 0),
    cbetFreq: weighted('cbetFreq'),
    cbetOpps: (live.cbetOpps || 0) + (train.cbetOpps || 0),
    checkRaiseFreq: weighted('checkRaiseFreq'),
    checkRaiseOpps: (live.checkRaiseOpps || 0) + (train.checkRaiseOpps || 0),
    turnBarrelFreq: weighted('turnBarrelFreq'),
    turnBarrelOpps: (live.turnBarrelOpps || 0) + (train.turnBarrelOpps || 0),
    turnFoldFreq: weighted('turnFoldFreq'),
    turnFaced: (live.turnFaced || 0) + (train.turnFaced || 0),
    riverBluffFreq: weighted('riverBluffFreq'),
    riverBluffOpps: (live.riverBluffOpps || 0) + (train.riverBluffOpps || 0),
    riverFoldFreq: weighted('riverFoldFreq'),
    riverFaced: (live.riverFaced || 0) + (train.riverFaced || 0),
    riverValueBetFreq: weighted('riverValueBetFreq'),
    riverBetOpps: (live.riverBetOpps || 0) + (train.riverBetOpps || 0),
    aggFactor: weighted('aggFactor'),
    wtsd: weighted('wtsd'),
  };
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

function computeStatsFromHands(hands) {
  // Stat computation from raw hands — everything here is genuinely derived
  // from the actions arrays; stats we can't derive are returned as null so
  // the measured-stat guard skips their patterns.
  const total = hands.length;

  const isHero = (a) => a.player === 'hero' || a.is_hero;
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

  hands.forEach(hand => {
    const actions = Array.isArray(hand.actions) ? hand.actions : [];
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
      // Get player stats
      const stats = await getPlayerStats(getSupabase(), userId);

      if (!stats || stats.handsPlayed < 100) {
        return res.status(200).json({
          success: true,
          message: 'Need more hands to detect leaks (minimum 100)',
          handsAnalyzed: stats?.handsPlayed || 0,
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
      if (existingErr) console.warn('[LeakDetect] existing user_leaks query failed:', existingErr.message);

      const existingLeakMap = {};
      (existingLeaks || []).forEach(leak => {
        existingLeakMap[leak.leak_type] = leak;
      });

      // Detect leaks
      const detectedLeaks = [];
      const now = new Date().toISOString();

      for (const [leakType, pattern] of Object.entries(LEAK_PATTERNS || {})) {
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
            source_system: stats._isTrainingDominant ? 'training_arena' : 'live_play',
            confidence: stats.handsPlayed > 1000 ? 'high' : stats.handsPlayed > 500 ? 'medium' : 'low',
            avg_ev_loss_bb: scaledEvLoss,
            occurrence_count: existingLeak ? existingLeak.occurrence_count + 1 : 1,
            optimal_frequency: pattern.optimalRange[0],
            current_frequency: currentValue,
            first_detected_at: existingLeak?.first_detected_at || now,
            last_detected_at: now,
            trend_data: updateTrendData(existingLeak?.trend_data, currentValue),
            explanation: generateExplanation(leakType, currentValue, pattern.optimalRange),
            why_leaking_ev: getWhyLeakingEV(leakType),
          };

          detectedLeaks.push(leak);
        }
      }

      // Save detected leaks and link hand examples
      let persisted = true;
      if (detectedLeaks.length > 0) {
        // Batch upsert all detected leaks — eliminates N+1 (one round-trip)
        const { data: upsertedLeaks, error: upsertErr } = await getSupabase()
          .from('user_leaks')
          .upsert(
            detectedLeaks.map(leak => ({ ...leak, user_id: userId })),
            { onConflict: 'user_id,leak_type', ignoreDuplicates: false }
          )
          .select('id, leak_type')
          .limit(100);

        if (upsertErr) {
          persisted = false;
          console.warn('[LeakDetect] Failed to persist detected leaks:', upsertErr.message);
        }

        // Merge DB ids back into the response objects so clients can deep-link
        const idMap = Object.fromEntries((upsertedLeaks || []).map(r => [r.leak_type, r.id]));
        detectedLeaks.forEach(l => {
          if (idMap[l.leak_type]) l.id = idMap[l.leak_type];
        });

        // Link hand examples (single hand-history fetch, batch save)
        const leaksWithIds = detectedLeaks.filter(l => l.id);
        if (leaksWithIds.length > 0) {
          await linkHandExamples(userId, leaksWithIds);
        }

        // Phase 3: Grok AI fix suggestions for the top 3 leaks by EV impact.
        // Failures degrade to null inside generateLeakFix — never fatal.
        const topLeaks = [...detectedLeaks]
          .sort((a, b) => (b.avg_ev_loss_bb || 0) - (a.avg_ev_loss_bb || 0))
          .slice(0, 3);
        await Promise.all(topLeaks.map(async (l) => {
          l.suggested_fix = await generateLeakFix(l);
        }));

        // Persist suggestions (requires user_leaks.suggested_fix column;
        // degrade gracefully if it doesn't exist yet)
        await Promise.all(topLeaks
          .filter(l => l.id && l.suggested_fix)
          .map(async (l) => {
            const { error: fixErr } = await getSupabase()
              .from('user_leaks')
              .update({ suggested_fix: l.suggested_fix })
              .eq('id', l.id)
              .eq('user_id', userId);
            if (fixErr) console.warn('[LeakDetect] Could not persist suggested_fix (column may be missing):', fixErr.message);
          }));
      }

      // Batch-update resolved leaks — eliminates N+1.
      // Only resolve leak types this engine owns (LEAK_PATTERNS) AND whose
      // inputs were measured this run — never touch POSTed/training/custom
      // leak types, and never resolve a leak we simply couldn't measure.
      const resolvedIds = Object.entries(existingLeakMap || {})
        .filter(([leakType, existingLeak]) =>
          LEAK_PATTERNS[leakType] &&
          patternIsMeasured(stats, leakType) &&
          !detectedLeaks.find(l => l.leak_type === leakType) &&
          existingLeak.status !== 'resolved'
        )
        .map(([, existingLeak]) => existingLeak.id);

      if (resolvedIds.length > 0) {
        const { error: err_user_leaks_fs60f } = await getSupabase()
          .from('user_leaks')
          .update({ status: 'resolved', resolved_at: now, updated_at: now })
          .in('id', resolvedIds);
        if (err_user_leaks_fs60f) console.warn('[Supabase] Silent mutation failed in user_leaks:', err_user_leaks_fs60f.message);
      }

      // 🚀 NEW BUG #11 FIX: Update Global PA Stats
      // Recalculate active/resolved leaks
      const { data: updatedLeaks } = await getSupabase()
        .from('user_leaks')
        .select('status')
        .eq('user_id', userId)
        .limit(100);

      const activeLeaks = updatedLeaks?.filter(l => l.status !== 'resolved').length || 0;
      const resolvedLeaksCount = updatedLeaks?.filter(l => l.status === 'resolved').length || 0;

      // Fetch existing stats
      const { data: existingStats } = await getSupabase()
        .from('user_assistant_stats')
        .select('total_hands_analyzed')
        .eq('user_id', userId)
        .maybeSingle();

      const currentHands = existingStats?.total_hands_analyzed || 0;

      // Atomic Upsert for Stats Sync — SET (not accumulate) hands analyzed so
      // re-running detection on the same hands doesn't inflate the counter
      const { error: err_user_assistant_stats_l0t65 } = await getSupabase()
        .from('user_assistant_stats')
        .upsert({
          user_id: userId,
          total_hands_analyzed: Math.max(currentHands, stats.handsPlayed),
          active_leaks_count: activeLeaks,
          resolved_leaks_count: resolvedLeaksCount,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      if (err_user_assistant_stats_l0t65) console.warn('[Supabase] Silent mutation failed in user_assistant_stats:', err_user_assistant_stats_l0t65.message);

      return res.status(200).json({
        success: true,
        handsAnalyzed: stats.handsPlayed,
        leaksDetected: detectedLeaks.length,
        leaks: detectedLeaks,
        persisted,
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
  const trend = existingTrend || [];
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
      .select('id, actions, hero_cards, board, pot_size, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (handsErr) {
      console.warn('[LeakDetect] hand_history fetch for examples failed:', handsErr.message);
      return;
    }
    if (!hands || hands.length === 0) return;

    const examples = [];

    for (const leak of leaksWithIds) {
      let count = 0;
      for (const hand of hands) {
        const leakMatch = checkHandForLeak(hand, leak.leak_type);
        if (!leakMatch) continue;

        examples.push({
          leak_id: leak.id,
          hand_history_id: hand.id,
          situation_snapshot: {
            hero_cards: hand.hero_cards,
            board: hand.board,
            pot_size: hand.pot_size,
            leak_action: leakMatch.action,
            street: leakMatch.street,
          },
          // Use the deviation-scaled EV loss from the detection run, not a
          // second hardcoded constant
          ev_loss_bb: leak.avg_ev_loss_bb,
        });

        // Limit to 5 examples per leak
        if (++count >= 5) break;
      }
    }

    if (examples.length === 0) return;

    // Single batch upsert; duplicates are ignored via the unique index on
    // (leak_id, hand_history_id)
    const { error: upsertErr } = await getSupabase()
      .from('leak_hand_examples')
      .upsert(examples, { onConflict: 'leak_id,hand_history_id', ignoreDuplicates: true });

    if (upsertErr) {
      // Fallback when the unique index is missing: per-row existence check
      console.warn('[LeakDetect] Batch example upsert failed, falling back:', upsertErr.message);
      for (const example of examples) {
        const { data: existing } = await getSupabase()
          .from('leak_hand_examples')
          .select('id')
          .eq('leak_id', example.leak_id)
          .eq('hand_history_id', example.hand_history_id)
          .maybeSingle();

        if (!existing) {
          const { error: insErr } = await getSupabase().from('leak_hand_examples').insert(example);
          if (insErr) {
            console.warn('[LeakDetect] Failed to link hand example:', insErr.message);
            break;
          }
        }
      }
    }
  } catch (error) {
    console.warn('Error linking hand examples:', error);
  }
}

/**
 * Check if a hand exhibits the specified leak.
 * Returns { action, street } describing the concrete leak action, or null.
 */
function checkHandForLeak(hand, leakType) {
  const actions = Array.isArray(hand.actions) ? hand.actions : [];
  if (actions.length === 0) return null;

  const isHero = (a) => a.player === 'hero' || a.is_hero;
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
