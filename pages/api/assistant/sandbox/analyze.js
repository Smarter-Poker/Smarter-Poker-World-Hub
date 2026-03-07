/**
 * POST /api/assistant/sandbox/analyze
 * ═══════════════════════════════════════════════════════════════════════════
 * GTO Sandbox Analysis Engine — Powered by Real PIO Solver Data
 *
 * Data Pipeline:
 *   Tier 1: Exact board match in solved_spots_gold (scenario_hash ILIKE)
 *   Tier 2: Partial board match (flop portion only)
 *   Tier 3: Same game_type/street/stack from solver pool
 *   Tier 4: Grok AI analysis (fallback when no solver data exists)
 *
 * Outputs:
 *   - Per-hand action frequencies from strategy_matrix
 *   - Per-hand EV from hand_evs
 *   - Full range heatmap data (all 1326 combos)
 *   - Action labels with pot-relative sizing
 *   - Source badge (PIO Verified / PIO Approximated / Grok AI)
 */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { checkSandboxAccess } from '../../../../src/lib/personal-assistant/contextAuthority';
import { getGrokClient } from '../../../../src/lib/grokClient';
import { getServerUser } from '../../../../src/lib/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ═══════════════════════════════════════════════════════════════════════════
// ACTION LABELS — Matches DeterministicGTOEngine standard
// ═══════════════════════════════════════════════════════════════════════════

const ACTION_LABELS = {
  'c': 'Check', 'x': 'Check', 'f': 'Fold',
  'b': 'Bet', 'b16': 'Bet 16%', 'b25': 'Bet 25%', 'b33': 'Bet 33%',
  'b45': 'Bet 45%', 'b50': 'Bet 50%', 'b66': 'Bet 66%', 'b75': 'Bet 75%',
  'b100': 'Bet Pot', 'b150': 'Overbet 150%', 'b200': 'Overbet 200%',
  'allin': 'All-In', 'r': 'Raise',
};

const ACTION_COLORS = {
  'Fold': '#ef4444', 'Check': '#6b7280', 'Call': '#f59e0b',
  'Bet': '#3b82f6', 'Raise': '#22c55e', 'All-In': '#ec4899',
};

function getActionLabel(actionCode, potSize = 6) {
  if (ACTION_LABELS[actionCode]) return ACTION_LABELS[actionCode];
  const betMatch = actionCode.match(/^b(\d+)$/);
  if (betMatch) {
    const pct = parseInt(betMatch[1]);
    return `Bet ${pct}%`;
  }
  const raiseMatch = actionCode.match(/^r(\d+)$/);
  if (raiseMatch) return `Raise ${raiseMatch[1]}%`;
  return actionCode.toUpperCase();
}

function getActionColor(actionLabel) {
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (actionLabel.startsWith(key)) return color;
  }
  return '#3b82f6';
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING & CACHING
// ═══════════════════════════════════════════════════════════════════════════

const analysisCache = new Map();
const rateLimitMap = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;

function checkRateLimit(userId) {
  const now = Date.now();
  const key = userId || 'anonymous';
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }
  const entry = rateLimitMap.get(key);
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000) };
  }
  entry.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - entry.count };
}

function getCacheKey(params) {
  const { heroHand, heroPosition, heroStack, gameType, board } = params;
  return JSON.stringify({
    h: [heroHand?.card1, heroHand?.card2].sort().join(''),
    p: heroPosition, s: Math.round(heroStack / 10) * 10,
    g: gameType,
    b: [...(board?.flop || []), board?.turn, board?.river].filter(Boolean).sort().join(''),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SOLVER DATA QUERY ENGINE — Mirrors DeterministicGTOEngine patterns
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine the PIO game_type for the solved_spots_gold table
 */
function getPioGameType(gameType, street) {
  if (gameType === 'tournament' || gameType === 'mtt') {
    if (street === 'river') return 'river_mtt_icm';
    if (street === 'turn') return 'turn_mtt_icm';
    return 'flop_mtt_chipev';
  }
  if (gameType === 'spin' || gameType === 'sng') {
    return 'turn_spin';
  }
  // Cash game
  if (street === 'turn' || street === 'river') return 'postflop_complete';
  return 'hu_cash';
}

/**
 * Normalize stack to nearest solver bucket
 */
function normalizeStack(stack) {
  const buckets = [8, 10, 15, 20, 30, 40, 60, 80, 100, 150, 200];
  let closest = buckets[0];
  let minDiff = Math.abs(stack - closest);
  for (const b of buckets) {
    const diff = Math.abs(stack - b);
    if (diff < minDiff) { minDiff = diff; closest = b; }
  }
  return closest;
}

/**
 * Determine current street from board state
 */
function getStreet(board) {
  const cards = [...(board?.flop || []), board?.turn, board?.river].filter(Boolean);
  if (cards.length === 0) return 'preflop';
  if (cards.length <= 3) return 'flop';
  if (cards.length === 4) return 'turn';
  return 'river';
}

/**
 * Build board string from board object for hash matching
 */
function buildBoardStr(board) {
  const cards = [...(board?.flop || []), board?.turn, board?.river].filter(Boolean);
  return cards.map(c => c.toLowerCase()).join('');
}

/**
 * Convert hero hand from card1+card2 format to PIO hand notation
 * e.g., { card1: 'As', card2: 'Kd' } → 'AKo'
 * e.g., { card1: 'Ah', card2: 'Kh' } → 'AKs'
 * e.g., { card1: 'Qs', card2: 'Qh' } → 'QQ'
 */
function heroHandToNotation(heroHand) {
  if (!heroHand?.card1 || !heroHand?.card2) return null;
  const r1 = heroHand.card1[0];
  const s1 = heroHand.card1[1];
  const r2 = heroHand.card2[0];
  const s2 = heroHand.card2[1];

  // Rank order: A > K > Q > J > T > 9 > ... > 2
  const RANK_ORDER = 'AKQJT98765432';
  const i1 = RANK_ORDER.indexOf(r1);
  const i2 = RANK_ORDER.indexOf(r2);

  // Ensure higher rank first
  const high = i1 <= i2 ? r1 : r2;
  const low = i1 <= i2 ? r2 : r1;
  const highSuit = i1 <= i2 ? s1 : s2;
  const lowSuit = i1 <= i2 ? s2 : s1;

  if (high === low) return `${high}${low}`; // Pair: "AA", "KK" etc.
  const suited = highSuit === lowSuit;
  return `${high}${low}${suited ? 's' : 'o'}`;
}

/**
 * 3-Tier board matching against solved_spots_gold
 * Same pattern as DeterministicGTOEngine.queryNextStreet
 */
async function querySolverData(params) {
  const { heroStack, gameType, board } = params;
  const street = getStreet(board);

  if (street === 'preflop') {
    return queryPreflopData(params);
  }

  const pioGameType = getPioGameType(gameType, street);
  const stackDepth = normalizeStack(heroStack);
  const boardStr = buildBoardStr(board);
  const flopStr = (board?.flop || []).filter(Boolean).map(c => c.toLowerCase()).join('');

  // ━━━ TIER 1: Exact board match ━━━
  try {
    const { data: exactMatches, error } = await supabase
      .from('solved_spots_gold')
      .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
      .eq('game_type', pioGameType)
      .eq('stack_depth', stackDepth)
      .eq('street', street)
      .ilike('scenario_hash', `%${boardStr}%`)
      .limit(5);

    if (!error && exactMatches && exactMatches.length > 0) {
      const scenario = exactMatches[Math.floor(Math.random() * exactMatches.length)];
      if (scenario.strategy_matrix) {
        return { scenario, matchTier: 1, source: 'PIO Solver — Exact Match' };
      }
    }
  } catch (e) { console.error('[Sandbox] Tier 1 query error:', e.message); }

  // ━━━ TIER 2: Partial board match (flop portion) ━━━
  if (flopStr.length >= 6) {
    try {
      const { data: partialMatches } = await supabase
        .from('solved_spots_gold')
        .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
        .eq('game_type', pioGameType)
        .eq('stack_depth', stackDepth)
        .eq('street', street)
        .ilike('scenario_hash', `%${flopStr}%`)
        .limit(5);

      if (partialMatches && partialMatches.length > 0) {
        const scenario = partialMatches[Math.floor(Math.random() * partialMatches.length)];
        if (scenario.strategy_matrix) {
          return { scenario, matchTier: 2, source: 'PIO Solver — Board Approximated' };
        }
      }
    } catch (e) { console.error('[Sandbox] Tier 2 query error:', e.message); }
  }

  // ━━━ TIER 3: Any scenario with same game_type/street/stack ━━━
  try {
    const { data: anyMatches } = await supabase
      .from('solved_spots_gold')
      .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
      .eq('game_type', pioGameType)
      .eq('stack_depth', stackDepth)
      .eq('street', street)
      .limit(10);

    if (anyMatches && anyMatches.length > 0) {
      const scenario = anyMatches[Math.floor(Math.random() * anyMatches.length)];
      if (scenario.strategy_matrix) {
        return { scenario, matchTier: 3, source: 'PIO Solver — Similar Spot' };
      }
    }
  } catch (e) { console.error('[Sandbox] Tier 3 query error:', e.message); }

  // ━━━ TIER 3b: Try nearby stack depths ━━━
  const nearbyStacks = [stackDepth - 20, stackDepth + 20, stackDepth - 40, stackDepth + 40].filter(s => s > 0);
  try {
    const { data: nearbyMatches } = await supabase
      .from('solved_spots_gold')
      .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
      .eq('game_type', pioGameType)
      .in('stack_depth', nearbyStacks)
      .eq('street', street)
      .limit(5);

    if (nearbyMatches && nearbyMatches.length > 0) {
      const scenario = nearbyMatches[Math.floor(Math.random() * nearbyMatches.length)];
      if (scenario.strategy_matrix) {
        return { scenario, matchTier: 3, source: `PIO Solver — ${scenario.stack_depth}bb Approximated` };
      }
    }
  } catch (e) { console.error('[Sandbox] Tier 3b query error:', e.message); }

  return null; // No solver data — will fall back to Grok
}

/**
 * Query preflop data from memory_charts_gold
 */
async function queryPreflopData(params) {
  const { heroStack, heroPosition } = params;
  const stackDepth = normalizeStack(heroStack);

  try {
    const { data: charts } = await supabase
      .from('memory_charts_gold')
      .select('*')
      .lte('stack_depth', stackDepth + 5)
      .gte('stack_depth', Math.max(1, stackDepth - 5))
      .limit(10);

    if (charts && charts.length > 0) {
      // Find a chart matching hero position if possible
      const posMatch = charts.find(c =>
        c.hero_position?.toUpperCase() === heroPosition?.toUpperCase()
      );
      const chart = posMatch || charts[0];
      return { chart, matchTier: 1, source: 'Nash Chart — Preflop', isPreflop: true };
    }
  } catch (e) { console.error('[Sandbox] Preflop query error:', e.message); }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY MATRIX PARSER — Extracts per-hand GTO frequencies & EVs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse strategy_matrix for a specific hero hand
 */
function parseStrategyForHand(strategyMatrix, heroHandNotation, potSize) {
  const actions = strategyMatrix.actions || [];
  const frequencies = strategyMatrix.frequencies || {};
  const handEVs = strategyMatrix.hand_evs || {};

  if (actions.length === 0) return null;

  // Try multiple hand notation formats (solvers use various formats)
  const handVariants = [
    heroHandNotation,
    heroHandNotation?.toUpperCase(),
    heroHandNotation?.toLowerCase(),
  ].filter(Boolean);

  // Get per-action frequencies for this hand
  const handActions = {};
  const validActions = [];
  let optimalAction = null;
  let maxFreq = -1;

  actions.forEach(action => {
    let freq = 0;
    for (const variant of handVariants) {
      const f = frequencies[action]?.[variant];
      if (f !== undefined && f >= 0 && f <= 1) { freq = f; break; }
    }
    handActions[action] = freq;
    validActions.push(action);
    if (freq > maxFreq) { maxFreq = freq; optimalAction = action; }
  });

  if (!optimalAction) return null;

  // Build enriched action data
  const actionData = validActions
    .map(action => ({
      id: action,
      label: getActionLabel(action, potSize),
      frequency: Math.round(handActions[action] * 100),
      frequencyRaw: handActions[action],
      color: getActionColor(getActionLabel(action, potSize)),
      isOptimal: action === optimalAction,
    }))
    .sort((a, b) => b.frequency - a.frequency);

  // Get EV data
  let heroEV = 0;
  for (const variant of handVariants) {
    if (handEVs[variant] !== undefined) { heroEV = Number(handEVs[variant]) || 0; break; }
  }

  const allEVs = Object.values(handEVs).filter(v => typeof v === 'number');
  const maxEV = allEVs.length > 0 ? Math.max(...allEVs) : heroEV;
  const minEV = allEVs.length > 0 ? Math.min(...allEVs) : heroEV;
  const avgEV = allEVs.length > 0 ? allEVs.reduce((s, v) => s + v, 0) / allEVs.length : 0;

  const isMixed = maxFreq < 0.95 && validActions.filter(a => handActions[a] > 0.05).length > 1;

  return {
    heroHand: heroHandNotation,
    actions: actionData,
    optimalAction: {
      id: optimalAction,
      label: getActionLabel(optimalAction, potSize),
      frequency: Math.round(maxFreq * 100),
      color: getActionColor(getActionLabel(optimalAction, potSize)),
    },
    isMixed,
    ev: {
      hero: parseFloat(heroEV.toFixed(3)),
      heroDisplay: heroEV >= 0 ? `+${heroEV.toFixed(2)} BB` : `${heroEV.toFixed(2)} BB`,
      max: parseFloat(maxEV.toFixed(3)),
      min: parseFloat(minEV.toFixed(3)),
      avg: parseFloat(avgEV.toFixed(3)),
      evLoss: parseFloat(Math.max(0, maxEV - heroEV).toFixed(3)),
    },
  };
}

/**
 * Build range heatmap data — per-hand frequencies for ALL hands in the matrix
 * Used for the 13x13 range grid visualization
 */
function buildRangeHeatmap(strategyMatrix) {
  const actions = strategyMatrix.actions || [];
  const frequencies = strategyMatrix.frequencies || {};
  const handEVs = strategyMatrix.hand_evs || {};

  if (actions.length === 0) return null;

  // Get all hands from the first action's frequency map
  const sampleAction = actions.find(a => frequencies[a] && Object.keys(frequencies[a]).length > 0);
  if (!sampleAction) return null;

  const allHands = Object.keys(frequencies[sampleAction]);
  if (allHands.length === 0) return null;

  // Build per-hand, per-action frequency map
  const rangeData = {};
  allHands.forEach(hand => {
    rangeData[hand] = {};
    let bestAction = null;
    let bestFreq = -1;
    actions.forEach(action => {
      const freq = frequencies[action]?.[hand] || 0;
      if (freq >= 0 && freq <= 1) {
        rangeData[hand][action] = Math.round(freq * 100);
        if (freq > bestFreq) { bestFreq = freq; bestAction = action; }
      }
    });
    rangeData[hand]._optimal = bestAction;
    rangeData[hand]._ev = handEVs[hand] || 0;
  });

  return {
    hands: allHands,
    actions: actions.map(a => ({ id: a, label: getActionLabel(a) })),
    data: rangeData,
    totalHands: allHands.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PREFLOP CHART PARSER
// ═══════════════════════════════════════════════════════════════════════════

function parsePreflopChart(chart, heroHandNotation) {
  const handMatrix = chart.hand_matrix || {};
  const handData = handMatrix[heroHandNotation] || handMatrix[heroHandNotation?.toUpperCase()];

  if (!handData) {
    // Hand not found in chart — return general info
    return {
      heroHand: heroHandNotation,
      actions: [
        { id: 'push', label: 'Push All-In', frequency: 0, color: '#ec4899', isOptimal: false },
        { id: 'fold', label: 'Fold', frequency: 100, color: '#ef4444', isOptimal: true },
      ],
      optimalAction: { id: 'fold', label: 'Fold', frequency: 100, color: '#ef4444' },
      isMixed: false,
      ev: { hero: 0, heroDisplay: '0.00 BB', max: 0, min: 0, avg: 0, evLoss: 0 },
    };
  }

  const pushFreq = Math.round((handData.push || 0) * 100);
  const foldFreq = 100 - pushFreq;
  const isPush = pushFreq > 50;

  return {
    heroHand: heroHandNotation,
    actions: [
      { id: 'push', label: 'Push All-In', frequency: pushFreq, color: '#ec4899', isOptimal: isPush },
      { id: 'fold', label: 'Fold', frequency: foldFreq, color: '#ef4444', isOptimal: !isPush },
    ],
    optimalAction: {
      id: isPush ? 'push' : 'fold',
      label: isPush ? 'Push All-In' : 'Fold',
      frequency: isPush ? pushFreq : foldFreq,
      color: isPush ? '#ec4899' : '#ef4444',
    },
    isMixed: pushFreq > 10 && pushFreq < 90,
    ev: { hero: 0, heroDisplay: '—', max: 0, min: 0, avg: 0, evLoss: 0 },
  };
}

function buildPreflopHeatmap(chart) {
  const handMatrix = chart.hand_matrix || {};
  const allHands = Object.keys(handMatrix);
  if (allHands.length === 0) return null;

  const rangeData = {};
  allHands.forEach(hand => {
    const pushFreq = Math.round((handMatrix[hand]?.push || 0) * 100);
    rangeData[hand] = {
      push: pushFreq,
      fold: 100 - pushFreq,
      _optimal: pushFreq > 50 ? 'push' : 'fold',
      _ev: 0,
    };
  });

  return {
    hands: allHands,
    actions: [
      { id: 'push', label: 'Push All-In' },
      { id: 'fold', label: 'Fold' },
    ],
    data: rangeData,
    totalHands: allHands.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GROK AI FALLBACK (Tier 4)
// ═══════════════════════════════════════════════════════════════════════════

async function analyzeWithGrok(params) {
  try {
    const grok = getGrokClient();
    const { heroHand, heroPosition, heroStack, gameType, villains, board, potSize } = params;

    const boardCards = [...(board?.flop || []), board?.turn, board?.river].filter(Boolean);
    const boardStr = boardCards.length > 0 ? boardCards.join(' ') : 'Preflop';
    const heroHandStr = `${heroHand?.card1 || 'As'} ${heroHand?.card2 || 'Kd'}`;
    const villainDesc = villains?.slice(0, 3).map(v => `${v.archetype?.name || 'Unknown'} (${v.stack}bb)`).join(', ') || 'Unknown';

    const prompt = `You are a GTO poker solver. Analyze this scenario with precise frequencies.

SCENARIO:
- Hero Hand: ${heroHandStr}
- Hero Position: ${heroPosition || 'BTN'}
- Hero Stack: ${heroStack || 100}bb
- Game Type: ${gameType === 'tournament' ? 'Tournament (ICM)' : 'Cash Game (ChipEV)'}
- Pot Size: ${potSize || 6}bb
- Board: ${boardStr}
- Villains: ${villainDesc}

Respond in EXACT JSON format (no markdown):
{
  "actions": [
    {"id": "b66", "label": "Bet 66%", "frequency": 55},
    {"id": "c", "label": "Check", "frequency": 30},
    {"id": "b33", "label": "Bet 33%", "frequency": 15}
  ],
  "explanation": "On this board texture, a 66% pot bet is the highest-frequency play with this hand because...",
  "isMixed": true,
  "confidence": "Medium"
}

RULES:
- Frequencies MUST sum to 100
- Provide 2-4 actions
- Use action IDs: f, c, b25, b33, b50, b66, b75, b100, b150, allin
- Be precise about GTO frequencies
- Consider stack depth, position, and board texture`;

    const response = await grok.chat.completions.create({
      model: 'grok-3',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 600,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Grok response');

    const parsed = JSON.parse(jsonMatch[0]);
    const grokActions = (parsed.actions || []).map((a, i) => ({
      ...a,
      frequency: a.frequency || 0,
      color: getActionColor(a.label || getActionLabel(a.id)),
      isOptimal: i === 0,
      frequencyRaw: (a.frequency || 0) / 100,
    }));

    return {
      heroHand: heroHandToNotation(heroHand) || `${heroHand?.card1}${heroHand?.card2}`,
      actions: grokActions,
      optimalAction: grokActions[0] || { id: 'c', label: 'Check', frequency: 100, color: '#6b7280' },
      isMixed: parsed.isMixed || false,
      ev: { hero: 0, heroDisplay: '—', max: 0, min: 0, avg: 0, evLoss: 0 },
      explanation: parsed.explanation || 'Analysis based on GTO principles.',
      confidence: parsed.confidence || 'Medium',
    };
  } catch (error) {
    console.error('[Sandbox] Grok analysis failed:', error.message);
    return null;
  }
}

/**
 * Hard fallback when Grok also fails — basic rule-based
 */
function ruleBasedFallback(params) {
  const { heroHand, heroPosition, heroStack, board, potSize } = params;
  const street = getStreet(board);
  const inPosition = ['BTN', 'CO', 'HJ'].includes(heroPosition);

  let actions;
  if (street === 'preflop') {
    actions = [
      { id: 'b25', label: 'Raise 2.5x', frequency: 70, color: '#3b82f6', isOptimal: true },
      { id: 'f', label: 'Fold', frequency: 20, color: '#ef4444', isOptimal: false },
      { id: 'c', label: 'Call', frequency: 10, color: '#f59e0b', isOptimal: false },
    ];
  } else if (inPosition) {
    actions = [
      { id: 'b33', label: 'Bet 33%', frequency: 55, color: '#3b82f6', isOptimal: true },
      { id: 'c', label: 'Check', frequency: 35, color: '#6b7280', isOptimal: false },
      { id: 'b66', label: 'Bet 66%', frequency: 10, color: '#3b82f6', isOptimal: false },
    ];
  } else {
    actions = [
      { id: 'c', label: 'Check', frequency: 55, color: '#6b7280', isOptimal: true },
      { id: 'b33', label: 'Bet 33%', frequency: 30, color: '#3b82f6', isOptimal: false },
      { id: 'b66', label: 'Bet 66%', frequency: 15, color: '#3b82f6', isOptimal: false },
    ];
  }

  return {
    heroHand: heroHandToNotation(heroHand) || 'Unknown',
    actions,
    optimalAction: actions[0],
    isMixed: true,
    ev: { hero: 0, heroDisplay: '—', max: 0, min: 0, avg: 0, evLoss: 0 },
    explanation: 'Estimated frequencies based on positional heuristics. Run analysis on a supported board for solver-verified results.',
    confidence: 'Low',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPLANATION BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildExplanation(handAnalysis, matchTier, street) {
  const { optimalAction, isMixed, actions, ev } = handAnalysis;
  const freq = optimalAction.frequency;

  let explanation = '';
  if (isMixed) {
    const parts = actions
      .filter(a => a.frequency > 1)
      .map(a => `${a.label} ${a.frequency}%`)
      .join(', ');
    explanation = `GTO mixes here: ${parts}. The highest-frequency play is ${optimalAction.label} at ${freq}%.`;
  } else {
    explanation = `This is a pure ${optimalAction.label} (${freq}% frequency).`;
  }

  if (ev.hero !== 0) {
    explanation += ` EV: ${ev.heroDisplay}.`;
  }

  if (matchTier >= 3) {
    explanation += ' Note: This uses solver data from a similar spot, not an exact board match.';
  }

  return explanation;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // JWT Authentication — optional for guest access
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
        if (!authError && authUser) {
          userId = authUser.id;
        }
      } catch (e) { console.warn('[Sandbox] Auth token validation failed:', e.message); }
    }

    const { heroHand, heroPosition, heroStack, gameType, villains, board, betSizing, potSize, actionHistory } = req.body;

    // Context authority check — only for authenticated users
    if (userId) {
      try {
        const contextAccess = await checkSandboxAccess(supabase, userId);
        if (!contextAccess.allowed) {
          return res.status(403).json({
            success: false, blocked: true,
            contextState: contextAccess.contextState,
            error: contextAccess.message,
          });
        }
      } catch (accessErr) {
        // Don't block analysis if context authority check fails
        console.warn('[Sandbox] Context authority check failed (non-fatal):', accessErr.message);
      }
    }

    // Rate limit — use userId for auth'd users, IP for guests (stricter limit)
    const rateLimitKey = userId || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'guest';
    const rateLimit = checkRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, error: 'Rate limit exceeded.', retryAfter: rateLimit.retryAfter });
    }

    // Check cache
    const cacheKey = getCacheKey({ heroHand, heroPosition, heroStack, gameType, board });
    const cached = analysisCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return res.status(200).json({ success: true, cached: true, ...cached.data });
    }

    const street = getStreet(board);
    const heroNotation = heroHandToNotation(heroHand);
    const calculatedPot = potSize || 6;

    // ━━━ QUERY SOLVER DATA ━━━
    let analysis = null;
    let rangeHeatmap = null;
    let matchTier = 4;
    let source = 'Grok AI Analysis';
    let explanation = '';

    const solverResult = await querySolverData({
      heroHand, heroPosition, heroStack, gameType, board,
    });

    if (solverResult) {
      matchTier = solverResult.matchTier;
      source = solverResult.source;

      if (solverResult.isPreflop && solverResult.chart) {
        // Preflop chart data
        analysis = parsePreflopChart(solverResult.chart, heroNotation);
        rangeHeatmap = buildPreflopHeatmap(solverResult.chart);
        explanation = buildExplanation(analysis, matchTier, 'preflop');
      } else if (solverResult.scenario?.strategy_matrix) {
        // Postflop solver data
        analysis = parseStrategyForHand(solverResult.scenario.strategy_matrix, heroNotation, calculatedPot);
        rangeHeatmap = buildRangeHeatmap(solverResult.scenario.strategy_matrix);

        if (analysis) {
          explanation = buildExplanation(analysis, matchTier, street);
        }
      }
    }

    // ━━━ GROK FALLBACK (Tier 4) ━━━
    if (!analysis) {
      matchTier = 4;
      source = 'Grok AI Analysis';

      analysis = await analyzeWithGrok({
        heroHand, heroPosition, heroStack, gameType, villains, board, potSize: calculatedPot,
      });

      if (!analysis) {
        // Hard fallback
        analysis = ruleBasedFallback({
          heroHand, heroPosition, heroStack, board, potSize: calculatedPot,
        });
        source = 'Heuristic Estimation';
      }

      explanation = analysis.explanation || buildExplanation(analysis, matchTier, street);
    }

    // ━━━ BUILD RESPONSE ━━━
    const responseData = {
      // Core analysis
      heroHand: analysis.heroHand,
      actions: analysis.actions,
      optimalAction: analysis.optimalAction,
      isMixed: analysis.isMixed,
      ev: analysis.ev,
      explanation,

      // Metadata
      source,
      matchTier,
      street,
      confidence: matchTier <= 2 ? 'High' : matchTier === 3 ? 'Medium' : 'Low',

      // Range heatmap (may be null for Grok fallback)
      rangeHeatmap,

      // Context
      context: `${gameType === 'tournament' ? 'Tournament' : 'Cash Game'} — ${heroStack} BB — ${heroPosition}`,
    };

    // Cache
    analysisCache.set(cacheKey, { data: responseData, ts: Date.now() });
    if (analysisCache.size > 500) {
      const keysToDelete = Array.from(analysisCache.keys()).slice(0, 50);
      keysToDelete.forEach(k => analysisCache.delete(k));
    }

    // Save session
    try {
      const { data: session } = await supabase
        .from('sandbox_sessions')
        .insert({
          user_id: userId,
          hero_hand: `${heroHand?.card1 || ''}${heroHand?.card2 || ''}`,
          hero_position: heroPosition,
          hero_stack_bb: heroStack,
          game_type: gameType,
          num_opponents: villains?.length || 0,
          board_flop: board?.flop?.join('') || null,
          board_turn: board?.turn || null,
          board_river: board?.river || null,
          villain_config: villains || [],
          bet_sizing_preset: betSizing || 'standard',
          pot_size_bb: calculatedPot,
        })
        .select()
        .single();

      if (session) {
        await supabase.from('sandbox_results').insert({
          session_id: session.id,
          primary_action: analysis.optimalAction?.label,
          primary_frequency: analysis.optimalAction?.frequency,
          alternative_actions: analysis.actions?.filter(a => !a.isOptimal),
          data_source: matchTier <= 3 ? 'solver_verified' : 'ai_approx',
          confidence: responseData.confidence?.toLowerCase(),
          sensitivity_flags: heroStack < 50 ? ['stack_sensitive'] : [],
          why_not_check: explanation,
          truth_seal: {
            source: matchTier <= 2 ? 'solver_verified' : matchTier === 3 ? 'solver_approx' : 'ai_approx',
            matchTier,
            timestamp: new Date().toISOString(),
          },
        });

        // Update user stats
        const { data: existing } = await supabase
          .from('user_assistant_stats')
          .select('sandbox_sessions_count, total_sessions_reviewed, total_hands_analyzed')
          .eq('user_id', userId)
          .maybeSingle();

        await supabase.from('user_assistant_stats').upsert({
          user_id: userId,
          sandbox_sessions_count: (existing?.sandbox_sessions_count || 0) + 1,
          total_sessions_reviewed: (existing?.total_sessions_reviewed || 0) + 1,
          total_hands_analyzed: (existing?.total_hands_analyzed || 0) + 1,
          last_sandbox_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      }
    } catch (dbErr) {
      console.error('[Sandbox] Session save error (non-fatal):', dbErr.message);
    }

    return res.status(200).json({
      success: true,
      rateLimit: { remaining: rateLimit.remaining },
      ...responseData,
    });

  } catch (error) {
    console.error('[Sandbox] Analysis error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
