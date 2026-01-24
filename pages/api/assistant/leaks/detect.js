/**
 * POST /api/assistant/leaks/detect
 * Runs leak detection analysis on user's hand history
 *
 * Per Masterplan Section VI:
 * - Identify statistical leaks over time, NOT single-hand mistakes
 * - A leak requires: Repetition, Same situation class, Measurable EV loss
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ═══════════════════════════════════════════════════════════════════════════
// LEAK DETECTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// LEAK DETECTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

async function getPlayerStats(supabase, userId) {
  // Try to get aggregated stats from hand history
  const { data: stats, error } = await supabase
    .from('player_stats')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !stats) {
    // Try alternative stats table
    const { data: altStats } = await supabase
      .from('user_poker_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (altStats) {
      return normalizeStats(altStats);
    }

    // Try to compute from hand history
    const { data: hands } = await supabase
      .from('hand_histories')
      .select('*')
      .eq('user_id', userId)
      .order('played_at', { ascending: false })
      .limit(5000);

    if (hands && hands.length > 0) {
      return computeStatsFromHands(hands);
    }

    return null;
  }

  return normalizeStats(stats);
}

function normalizeStats(stats) {
  return {
    handsPlayed: stats.hands_played || stats.total_hands || 0,
    vpip: stats.vpip || 0,
    pfr: stats.pfr || 0,
    limpFreq: stats.limp_freq || stats.limp_percentage || 0,
    coldCallFreq: stats.cold_call_freq || stats.cold_call_percentage || 0,
    threeBetFreq: stats.three_bet_freq || stats.three_bet_percentage || 0,
    foldToCbet: stats.fold_to_cbet || stats.fold_to_cbet_percentage || 0,
    cbetsFaced: stats.cbets_faced || 100,
    cbetFreq: stats.cbet_freq || stats.cbet_percentage || 0,
    cbetOpps: stats.cbet_opportunities || 100,
    checkRaiseFreq: stats.check_raise_freq || stats.check_raise_percentage || 0,
    checkRaiseOpps: stats.check_raise_opportunities || 50,
    turnBarrelFreq: stats.turn_barrel_freq || stats.turn_cbet_percentage || 0,
    turnBarrelOpps: stats.turn_barrel_opportunities || 50,
    turnFoldFreq: stats.turn_fold_freq || 0,
    turnFaced: stats.turn_bets_faced || 50,
    riverBluffFreq: stats.river_bluff_freq || stats.river_aggression || 0,
    riverBluffOpps: stats.river_bluff_opportunities || 30,
    riverFoldFreq: stats.river_fold_freq || 0,
    riverFaced: stats.river_bets_faced || 40,
    riverValueBetFreq: stats.river_value_bet_freq || 0,
    riverBetOpps: stats.river_bet_opportunities || 30,
    aggFactor: stats.aggression_factor || stats.af || 0,
    wtsd: stats.wtsd || stats.went_to_showdown || 0,
  };
}

function computeStatsFromHands(hands) {
  // Basic stat computation from raw hands
  const total = hands.length;
  let vpipHands = 0;
  let pfrHands = 0;
  let cbetOpps = 0;
  let cbets = 0;

  hands.forEach(hand => {
    const actions = hand.actions || [];
    const heroActions = actions.filter(a => a.player === 'hero' || a.is_hero);

    // VPIP: voluntarily put money in pot preflop
    if (heroActions.some(a => a.street === 'preflop' && ['call', 'raise', 'bet'].includes(a.action?.toLowerCase()))) {
      vpipHands++;
    }

    // PFR: preflop raise
    if (heroActions.some(a => a.street === 'preflop' && a.action?.toLowerCase() === 'raise')) {
      pfrHands++;
    }

    // C-bet opportunities and attempts
    const wasPreAggressor = heroActions.some(a => a.street === 'preflop' && a.action?.toLowerCase() === 'raise');
    if (wasPreAggressor && actions.some(a => a.street === 'flop')) {
      cbetOpps++;
      if (heroActions.some(a => a.street === 'flop' && ['bet', 'raise'].includes(a.action?.toLowerCase()))) {
        cbets++;
      }
    }
  });

  return {
    handsPlayed: total,
    vpip: total > 0 ? (vpipHands / total) * 100 : 0,
    pfr: total > 0 ? (pfrHands / total) * 100 : 0,
    limpFreq: 0,
    coldCallFreq: 0,
    threeBetFreq: 0,
    foldToCbet: 45, // Default if we can't compute
    cbetsFaced: 100,
    cbetFreq: cbetOpps > 0 ? (cbets / cbetOpps) * 100 : 60,
    cbetOpps,
    checkRaiseFreq: 8,
    checkRaiseOpps: 50,
    turnBarrelFreq: 55,
    turnBarrelOpps: 50,
    turnFoldFreq: 40,
    turnFaced: 50,
    riverBluffFreq: 12,
    riverBluffOpps: 30,
    riverFoldFreq: 45,
    riverFaced: 40,
    riverValueBetFreq: 50,
    riverBetOpps: 30,
  };
}

function classifyLeakStatus(existingLeak, currentValue, optimalRange) {
  const [optMin, optMax] = optimalRange;
  const deviation = currentValue < optMin
    ? optMin - currentValue
    : currentValue > optMax
      ? currentValue - optMax
      : 0;

  if (!existingLeak) {
    return deviation > 5 ? 'emerging' : null;
  }

  // Check trend from existing leak
  const trendData = existingLeak.trend_data || [];
  if (trendData.length < 2) {
    return existingLeak.status;
  }

  const oldValue = trendData[0]?.value || currentValue;
  const improvement = Math.abs(currentValue - optMin) < Math.abs(oldValue - optMin);

  if (deviation < 3) {
    return 'resolved';
  } else if (improvement && deviation < 8) {
    return 'improving';
  } else if (existingLeak.occurrence_count > 30) {
    return 'persistent';
  }

  return existingLeak.status || 'emerging';
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
  };

  return explanations[leakType] || `Your frequency of ${currentValue}% deviates from optimal (${optMin}-${optMax}%).`;
}

// ═══════════════════════════════════════════════════════════════════════════
// API HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  try {
    // Get player stats
    const stats = await getPlayerStats(supabase, userId);

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
    const { data: existingLeaks } = await supabase
      .from('user_leaks')
      .select('*')
      .eq('user_id', userId);

    const existingLeakMap = {};
    (existingLeaks || []).forEach(leak => {
      existingLeakMap[leak.leak_type] = leak;
    });

    // Detect leaks
    const detectedLeaks = [];
    const now = new Date().toISOString();

    for (const [leakType, pattern] of Object.entries(LEAK_PATTERNS)) {
      if (pattern.check(stats)) {
        const existingLeak = existingLeakMap[leakType];
        const currentValue = getCurrentValue(stats, leakType);
        const status = classifyLeakStatus(existingLeak, currentValue, pattern.optimalRange);

        if (!status) continue;

        const leak = {
          user_id: userId,
          leak_type: leakType,
          leak_category: pattern.category,
          situation_class: pattern.name,
          status,
          confidence: stats.handsPlayed > 1000 ? 'high' : stats.handsPlayed > 500 ? 'medium' : 'low',
          avg_ev_loss_bb: pattern.evImpact,
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
    if (detectedLeaks.length > 0) {
      for (const leak of detectedLeaks) {
        const existingLeak = existingLeakMap[leak.leak_type];
        let savedLeakId;

        if (existingLeak) {
          await supabase
            .from('user_leaks')
            .update(leak)
            .eq('id', existingLeak.id);
          savedLeakId = existingLeak.id;
        } else {
          const { data: newLeak } = await supabase
            .from('user_leaks')
            .insert(leak)
            .select('id')
            .single();
          savedLeakId = newLeak?.id;
        }

        // Link hand examples to the leak
        if (savedLeakId) {
          await linkHandExamplesToLeak(supabase, userId, savedLeakId, leak.leak_type);
        }
      }
    }

    // Check for resolved leaks
    for (const [leakType, existingLeak] of Object.entries(existingLeakMap)) {
      if (!detectedLeaks.find(l => l.leak_type === leakType) && existingLeak.status !== 'resolved') {
        await supabase
          .from('user_leaks')
          .update({
            status: 'resolved',
            resolved_at: now,
            updated_at: now,
          })
          .eq('id', existingLeak.id);
      }
    }

    return res.status(200).json({
      success: true,
      handsAnalyzed: stats.handsPlayed,
      leaksDetected: detectedLeaks.length,
      leaks: detectedLeaks,
    });

  } catch (error) {
    console.error('Leak detection error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getCurrentValue(stats, leakType) {
  const valueMap = {
    overfolding_preflop: 100 - stats.vpip,
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
  return valueMap[leakType] || 0;
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
 * Link relevant hand examples to a detected leak.
 * Finds hands where the user made the leak-related mistake.
 */
async function linkHandExamplesToLeak(supabase, userId, leakId, leakType) {
  try {
    // Get recent hands that might show this leak
    const { data: hands } = await supabase
      .from('hand_histories')
      .select('id, actions, hero_cards, board, pot_size, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!hands || hands.length === 0) return;

    const examples = [];

    for (const hand of hands) {
      const leakMatch = checkHandForLeak(hand, leakType);
      if (leakMatch) {
        examples.push({
          leak_id: leakId,
          hand_history_id: hand.id,
          situation_snapshot: {
            hero_cards: hand.hero_cards,
            board: hand.board,
            pot_size: hand.pot_size,
            leak_action: leakMatch.action,
            street: leakMatch.street,
          },
          ev_loss_bb: leakMatch.evLoss,
        });

        // Limit to 5 examples per leak
        if (examples.length >= 5) break;
      }
    }

    // Save examples (upsert to avoid duplicates)
    if (examples.length > 0) {
      for (const example of examples) {
        // Check if example already exists
        const { data: existing } = await supabase
          .from('leak_hand_examples')
          .select('id')
          .eq('leak_id', leakId)
          .eq('hand_history_id', example.hand_history_id)
          .single();

        if (!existing) {
          await supabase.from('leak_hand_examples').insert(example);
        }
      }
    }
  } catch (error) {
    console.error('Error linking hand examples:', error);
  }
}

/**
 * Check if a hand exhibits the specified leak.
 */
function checkHandForLeak(hand, leakType) {
  const actions = hand.actions || [];

  // Define leak patterns to look for in hand actions
  const leakPatterns = {
    overfolding_to_cbets: {
      check: () => actions.some(a =>
        a.street === 'flop' &&
        a.is_hero &&
        a.action === 'fold' &&
        a.facing_bet
      ),
      evLoss: 0.12,
      street: 'flop',
    },
    lack_of_river_bluffs: {
      check: () => {
        const riverCheck = actions.some(a =>
          a.street === 'river' &&
          a.is_hero &&
          a.action === 'check' &&
          !a.made_hand // Would need hand strength info
        );
        return riverCheck;
      },
      evLoss: 0.08,
      street: 'river',
    },
    cbet_too_rarely: {
      check: () => {
        const wasPFR = actions.some(a =>
          a.street === 'preflop' &&
          a.is_hero &&
          a.action === 'raise'
        );
        const checkedFlop = actions.some(a =>
          a.street === 'flop' &&
          a.is_hero &&
          a.action === 'check'
        );
        return wasPFR && checkedFlop;
      },
      evLoss: 0.10,
      street: 'flop',
    },
    turn_barrel_too_rare: {
      check: () => {
        const cbetFlop = actions.some(a =>
          a.street === 'flop' &&
          a.is_hero &&
          a.action === 'bet'
        );
        const checkedTurn = actions.some(a =>
          a.street === 'turn' &&
          a.is_hero &&
          a.action === 'check'
        );
        return cbetFlop && checkedTurn;
      },
      evLoss: 0.09,
      street: 'turn',
    },
  };

  const pattern = leakPatterns[leakType];
  if (!pattern) return null;

  try {
    if (pattern.check()) {
      return {
        action: leakType,
        street: pattern.street,
        evLoss: pattern.evLoss,
      };
    }
  } catch (e) {
    // Pattern check failed
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
