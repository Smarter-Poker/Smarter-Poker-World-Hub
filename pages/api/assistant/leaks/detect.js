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
EV Loss: ${leak.avg_ev_loss_bb} BB/100

Provide a concise, actionable fix in 2-3 sentences. Focus on specific adjustments they can make.`;

    const response = await grok.chat.completions.create({
      model: 'grok-3', // Grok-3
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 150,
    });

    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.warn('[LeakDetect] AI fix generation failed:', error.message);
    return null;
  }
}

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
  let finalStats = null;

  // 1. Try to get aggregated stats from live hand history
  const { data: stats, error } = await getSupabase()
    .from('player_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!error && stats) {
    finalStats = normalizeStats(stats);
  } else {
    // Try alternative stats table
    const { data: altStats } = await getSupabase()
      .from('user_poker_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (altStats) {
      finalStats = normalizeStats(altStats);
    } else {
      // Try to compute from live hand history
      const { data: hands } = await getSupabase()
        .from('hand_history')
        .select('*')
        .eq('user_id', userId)
        .order('played_at', { ascending: false })
        .limit(5000);

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

// ─── NEW: DATA BRIDGE FOR TRAINING SESSIONS ────────────────────────────────
async function getTrainingStats(supabase, userId) {
  const { data: sessions } = await getSupabase()
    .from('training_sessions')
    .select('classification_counts, mistake_count, hands_played, total_ev_loss')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

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

  return {
    handsPlayed: totalTrainingHands,
    vpip: 25, // Neutral placeholder, purely live stat
    pfr: 18,  // Neutral placeholder
    limpFreq: getMistakeFreq('limp'), // E.g., if they limp often in training
    coldCallFreq: getMistakeFreq('cold_call_wide'),
    threeBetFreq: getMistakeFreq('three_bet_tight') ? 2 : 8, // Reverse mapped
    foldToCbet: 50 + getMistakeFreq('fold_to_cbet_over'), // Adding mistake rate to baseline optimal
    cbetsFaced: totalTrainingHands / 2,
    cbetFreq: 60 - getMistakeFreq('missed_cbet_value'),
    cbetOpps: totalTrainingHands / 2,
    checkRaiseFreq: 10 - getMistakeFreq('missed_check_raise'),
    checkRaiseOpps: totalTrainingHands / 3,
    turnBarrelFreq: 60 - getMistakeFreq('missed_turn_barrel'),
    turnBarrelOpps: totalTrainingHands / 3,
    turnFoldFreq: 40 + getMistakeFreq('turn_overfold'),
    turnFaced: totalTrainingHands / 4,
    riverBluffFreq: 15 - getMistakeFreq('missed_river_bluff'),
    riverBluffOpps: totalTrainingHands / 5,
    riverFoldFreq: 45 + getMistakeFreq('river_overfold'),
    riverFaced: totalTrainingHands / 5,
    riverValueBetFreq: 55 - getMistakeFreq('missed_thin_value'),
    riverBetOpps: totalTrainingHands / 5,
    aggFactor: 2.5,
    wtsd: 30,
  };
}

function combineLiveAndTrainingStats(live, train) {
  // Weighted average based on hand volume
  const liveWt = live.handsPlayed / (live.handsPlayed + train.handsPlayed);
  const trainWt = train.handsPlayed / (live.handsPlayed + train.handsPlayed);

  const weighted = (key) => (live[key] || 0) * liveWt + (train[key] || 0) * trainWt;

  return {
    handsPlayed: live.handsPlayed + train.handsPlayed,
    _isTrainingDominant: trainWt > 0.5,
    vpip: live.vpip || train.vpip, // Mostly rely on live for foundational
    pfr: live.pfr || train.pfr,
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
  try {
    if (!applyRateLimit(req, res, LIMITS.ai)) return;

    // Require JWT auth for write operations
    if (req.method !== 'GET') {
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token) return res.status(401).json({ success: false, error: 'Authentication required' });
      const { data: authData, error: _authErr } = await getSupabase().auth.getUser(_token);
      const _authUser = authData?.user;
      if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
      if (req.body) req.body.userId = _authUser.id;
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
      const { data: existingLeaks } = await getSupabase()
        .from('user_leaks')
        .select('*')
        .eq('user_id', userId)
        .limit(100);

      const existingLeakMap = {};
      (existingLeaks || []).forEach(leak => {
        existingLeakMap[leak.leak_type] = leak;
      });

      // Detect leaks
      const detectedLeaks = [];
      const now = new Date().toISOString();

      for (const [leakType, pattern] of Object.entries(LEAK_PATTERNS || {})) {
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
            source_system: stats._isTrainingDominant ? 'training_arena' : 'live_play',
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
        // Batch upsert all detected leaks — eliminates N+1 (one round-trip)
        const { data: upsertedLeaks } = await getSupabase()
          .from('user_leaks')
          .upsert(
            detectedLeaks.map(leak => ({ ...leak, user_id: userId })),
            { onConflict: 'user_id,leak_type', ignoreDuplicates: false }
          )
          .select('id, leak_type')
          .limit(100);

        // Link hand examples using returned IDs
        if (upsertedLeaks) {
          for (const { id: savedLeakId, leak_type } of upsertedLeaks) {
            await linkHandExamplesToLeak(supabase, userId, savedLeakId, leak_type);
          }
        }
      }

      // Batch-update resolved leaks — eliminates N+1
      const resolvedIds = Object.entries(existingLeakMap || {})
        .filter(([leakType, existingLeak]) =>
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

      // Fetch existing stats to increment hands
      const { data: existingStats } = await getSupabase()
        .from('user_assistant_stats')
        .select('total_hands_analyzed')
        .eq('user_id', userId)
        .maybeSingle();

      const currentHands = existingStats?.total_hands_analyzed || 0;

      // Atomic Upsert for Stats Sync
      const { error: err_user_assistant_stats_l0t65 } = await getSupabase()
        .from('user_assistant_stats')
        .upsert({
          user_id: userId,
          total_hands_analyzed: currentHands + stats.handsPlayed,
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
    const { data: hands } = await getSupabase()
      .from('hand_history')
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
        const { data: existing } = await getSupabase()
          .from('leak_hand_examples')
          .select('id')
          .eq('leak_id', leakId)
          .eq('hand_history_id', example.hand_history_id)
          .maybeSingle();

        if (!existing) {
          const { error: insErr } = await getSupabase().from('leak_hand_examples').insert(example);
          if (insErr) console.warn('[LeakDetect] Failed to link hand example:', insErr.message);
        }
      }
    }
  } catch (error) {
    console.warn('Error linking hand examples:', error);
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
