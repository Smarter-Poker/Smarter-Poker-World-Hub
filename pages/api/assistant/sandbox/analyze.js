import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
/**
 * POST /api/assistant/sandbox/analyze
 * ═══════════════════════════════════════════════════════════════════════
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
import { rateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// ═══════════════════════════════════════════════════════════════════════
// ACTION LABELS — Matches DeterministicGTOEngine standard
// ═══════════════════════════════════════════════════════════════════════

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

function getActionLabel(actionCode, potSize = 6, facingBet = false) {
  if (typeof actionCode !== 'string' || actionCode.length === 0) return 'Unknown';
  // 'c' means "check" when the action is open, "call" when facing a bet.
  if (actionCode === 'c') return facingBet ? 'Call' : 'Check';
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
  const label = typeof actionLabel === 'string' ? actionLabel : '';
  for (const [key, color] of Object.entries(ACTION_COLORS || {})) {
    if (label.startsWith(key)) return color;
  }
  return '#3b82f6';
}

const AGGRESSIVE_ACTION_RE = /bet|raise|all[\s_-]?in|shove/;

/**
 * Whether hero is facing a bet/raise ON THE CURRENT STREET.
 * Used to disambiguate the 'c' action code (Check vs Call).
 *
 * Scanning the whole history is wrong: a villain's PREFLOP raise would keep
 * reading as "facing a bet" on the flop/turn/river, so hero would be told to
 * 'Call' when they are actually first to act and should see 'Check'.
 *
 * Newer clients tag each entry with `street`; when any entry carries the tag we
 * filter to the current street. For untagged legacy payloads we fall back to
 * "the LAST entry overall is an aggressive villain action" — i.e. hero has not
 * acted since, which is the only safe read without street information.
 */
function isFacingBet(actionHistory, heroPosition, currentStreet) {
  if (!Array.isArray(actionHistory) || actionHistory.length === 0) return false;
  const entries = actionHistory.filter(a => a && typeof a === 'object');
  if (entries.length === 0) return false;

  const isAggressive = (a) =>
    AGGRESSIVE_ACTION_RE.test(`${a.action || ''} ${a.label || ''}`.toLowerCase());

  const tagged = entries.some(a => typeof a.street === 'string' && a.street);
  if (tagged && currentStreet) {
    const onStreet = entries.filter(a => a.street === currentStreet);
    if (onStreet.length === 0) return false;
    // The last action on this street decides: an aggressive villain action that
    // hero has not yet answered means hero is facing a bet.
    const last = onStreet[onStreet.length - 1];
    return last.position !== heroPosition && isAggressive(last);
  }

  const last = entries[entries.length - 1];
  return !!last && last.position !== heroPosition && isAggressive(last);
}

// ═══════════════════════════════════════════════════════════════════════
// CACHING
// ═══════════════════════════════════════════════════════════════════════

const analysisCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCacheKey(params) {
  const { heroHand, heroPosition, heroStack, gameType, board, exploitMode, bubbleFactor, villainArchetype, socratic, facingBet, potSize, villainRange } = params;
  // Board identity must preserve WHICH card landed on which street —
  // [Ah,Kd,Qs]+2c is a different spot than [Ah,Kd,2c]+Qs.
  const flopPart = [...(board?.flop || [])].filter(Boolean).map(c => String(c).toLowerCase()).sort().join('');
  const boardPart = `${flopPart}|${(board?.turn || '').toLowerCase()}|${(board?.river || '').toLowerCase()}`;
  return JSON.stringify({
    h: [heroHand?.card1, heroHand?.card2].filter(Boolean).sort().join(''),
    p: heroPosition, s: Math.round((Number(heroStack) || 0) / 10) * 10,
    g: gameType,
    b: boardPart,
    em: exploitMode || 'gto',
    bf: bubbleFactor || 1.0,
    va: villainArchetype || null,
    sp: socratic?.userPick || null,
    // The response depends on the action line (Check vs Call labels), the pot
    // and the villain range — all three feed the Grok prompt, so two spots that
    // differ only in those MUST NOT collide on one cache entry.
    fb: !!facingBet,
    ps: Number(potSize) || 6,
    vr: String(villainRange || '').slice(0, 80),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// SOLVER DATA QUERY ENGINE — Mirrors DeterministicGTOEngine patterns
// ═══════════════════════════════════════════════════════════════════════

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

const STACK_BUCKETS = [8, 10, 15, 20, 30, 40, 60, 80, 100, 150, 200];

/**
 * Normalize stack to nearest solver bucket
 */
function normalizeStack(stack) {
  const depth = Number(stack) || 100; // undefined/NaN → assume 100bb, not 8bb
  let closest = STACK_BUCKETS[0];
  let minDiff = Math.abs(depth - closest);
  for (const b of STACK_BUCKETS) {
    const diff = Math.abs(depth - b);
    if (diff < minDiff) { minDiff = diff; closest = b; }
  }
  return closest;
}

/**
 * Neighbouring solver buckets (±1, ±2 positions in the bucket list) —
 * arithmetic ±20/±40 produces depths that are not buckets at all.
 */
function nearbyStackBuckets(stackDepth) {
  const idx = STACK_BUCKETS.indexOf(stackDepth);
  if (idx === -1) return [];
  return [idx - 1, idx + 1, idx - 2, idx + 2]
    .filter(i => i >= 0 && i < STACK_BUCKETS.length)
    .map(i => STACK_BUCKETS[i]);
}

/**
 * Deterministic pick from a result set — the same inputs must always produce
 * the same answer (Math.random() made identical spots return different lines).
 */
function pickDeterministic(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return [...rows].sort((a, b) =>
    String(a?.scenario_hash || a?.id || '').localeCompare(String(b?.scenario_hash || b?.id || ''))
  )[0];
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

const RANK_ORDER = 'AKQJT98765432';
const SUIT_ORDER = 'shdc';

/**
 * Canonical card ordering (rank descending, then suit) — scenario_hash values
 * are stored canonically, while the UI hands us cards in click order.
 */
function canonicalCards(cards) {
  return [...cards]
    .filter(Boolean)
    .map(c => String(c))
    .sort((a, b) => {
      const rd = RANK_ORDER.indexOf(a[0]?.toUpperCase()) - RANK_ORDER.indexOf(b[0]?.toUpperCase());
      if (rd !== 0) return rd;
      return SUIT_ORDER.indexOf(a[1]?.toLowerCase()) - SUIT_ORDER.indexOf(b[1]?.toLowerCase());
    })
    .map(c => c.toLowerCase())
    .join('');
}

/**
 * Board strings to try against scenario_hash — canonical order first, then the
 * raw click order (some legacy rows were hashed in dealt order).
 */
function boardStrVariants(cards) {
  const list = (cards || []).filter(Boolean);
  if (list.length === 0) return [];
  const raw = list.map(c => String(c).toLowerCase()).join('');
  const canonical = canonicalCards(list);
  return canonical === raw ? [canonical] : [canonical, raw];
}

/**
 * Build board string from board object for hash matching
 */
function buildBoardStr(board) {
  const cards = [...(board?.flop || []), board?.turn, board?.river].filter(Boolean);
  return canonicalCards(cards);
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
  const fullBoardCards = [...(board?.flop || []), board?.turn, board?.river].filter(Boolean);
  const flopCards = (board?.flop || []).filter(Boolean);

  const SELECT_COLS = 'id, scenario_hash, street, stack_depth, game_type, strategy_matrix';

  // ━━━ TIER 1: Full board match (canonical order, then dealt order) ━━━
  for (const boardStr of boardStrVariants(fullBoardCards)) {
    try {
      const { data: exactMatches, error } = await getSupabase()
        .from('solved_spots_gold')
        .select(SELECT_COLS)
        .eq('game_type', pioGameType)
        .eq('stack_depth', stackDepth)
        .eq('street', street)
        .ilike('scenario_hash', `%${boardStr}%`)
        .limit(5);

      if (!error && exactMatches && exactMatches.length > 0) {
        const scenario = pickDeterministic(exactMatches);
        if (scenario?.strategy_matrix) {
          // Position / pot / action line are NOT verified by this match —
          // only board + stack + street + game type. Label accordingly.
          return { scenario, matchTier: 1, source: 'PIO Solver — Board Match' };
        }
      }
    } catch (e) { console.warn('[Sandbox] Tier 1 query error:', e.message); }
  }

  // ━━━ TIER 2: Partial board match (flop portion) ━━━
  if (flopCards.length >= 3) {
    for (const flopStr of boardStrVariants(flopCards)) {
      try {
        const { data: partialMatches } = await getSupabase()
          .from('solved_spots_gold')
          .select(SELECT_COLS)
          .eq('game_type', pioGameType)
          .eq('stack_depth', stackDepth)
          .eq('street', street)
          .ilike('scenario_hash', `%${flopStr}%`)
          .limit(5);

        if (partialMatches && partialMatches.length > 0) {
          const scenario = pickDeterministic(partialMatches);
          if (scenario?.strategy_matrix) {
            return { scenario, matchTier: 2, source: 'PIO Solver — Board Approximated' };
          }
        }
      } catch (e) { console.warn('[Sandbox] Tier 2 query error:', e.message); }
    }
  }

  // ━━━ TIER 3: Any scenario with same game_type/street/stack ━━━
  try {
    const { data: anyMatches } = await getSupabase()
      .from('solved_spots_gold')
      .select(SELECT_COLS)
      .eq('game_type', pioGameType)
      .eq('stack_depth', stackDepth)
      .eq('street', street)
      .limit(10);

    if (anyMatches && anyMatches.length > 0) {
      const scenario = pickDeterministic(anyMatches);
      if (scenario?.strategy_matrix) {
        return { scenario, matchTier: 3, source: 'PIO Solver — Similar Spot' };
      }
    }
  } catch (e) { console.warn('[Sandbox] Tier 3 query error:', e.message); }

  // ━━━ TIER 3b: Try nearby stack buckets ━━━
  const nearbyStacks = nearbyStackBuckets(stackDepth);
  if (nearbyStacks.length > 0) {
    try {
      const { data: nearbyMatches } = await getSupabase()
        .from('solved_spots_gold')
        .select(SELECT_COLS)
        .eq('game_type', pioGameType)
        .in('stack_depth', nearbyStacks)
        .eq('street', street)
        .limit(5);

      if (nearbyMatches && nearbyMatches.length > 0) {
        const scenario = pickDeterministic(nearbyMatches);
        if (scenario?.strategy_matrix) {
          return { scenario, matchTier: 3, source: `PIO Solver — ${scenario.stack_depth}bb Approximated` };
        }
      }
    } catch (e) { console.warn('[Sandbox] Tier 3b query error:', e.message); }
  }

  return null; // No solver data — will fall back to Grok
}

/**
 * Query preflop data from memory_charts_gold
 */
async function queryPreflopData(params) {
  const { heroStack, heroPosition, gameType } = params;
  const stackDepth = normalizeStack(heroStack);

  // memory_charts_gold holds PUSH/FOLD Nash charts. Those are only valid for
  // short-stack shove spots in tournament-style games — never for 100bb cash.
  const isShoveFormat = gameType === 'tournament' || gameType === 'mtt' || gameType === 'spin' || gameType === 'sng';
  if (!isShoveFormat || stackDepth > 25) return null; // → Grok handles the spot

  try {
    const { data: charts } = await getSupabase()
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
  } catch (e) { console.warn('[Sandbox] Preflop query error:', e.message); }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// STRATEGY MATRIX PARSER — Extracts per-hand GTO frequencies & EVs
// ═══════════════════════════════════════════════════════════════════════

/**
 * PER-ACTION EV — HONESTY CONTRACT
 * ───────────────────────────────────────────────────────────────────────
 * The sandbox Coach computes its EV delta as (picked action EV − ev.hero)
 * and only trusts it when `typeof action.ev === 'number'`; otherwise it
 * shows a heuristic estimate flagged `evDeltaEstimated: true`.
 *
 * So an `ev` key on an action is a claim that the number was MEASURED, in
 * the same units as `ev.hero` (big blinds, 3dp). Consequences:
 *   • Emit `ev` only when the solver payload actually carries a per-action
 *     EV for this exact hand.
 *   • When it does not, OMIT the key. Never default to 0 — 0 is a perfectly
 *     legitimate EV, so a defaulted 0 would silently launder a guess into a
 *     measured value and turn off the "estimated" warning in the UI.
 *   • The Grok and rule-based paths therefore carry no `ev` at all: a
 *     language model's guess at a spot's EV is not a measurement.
 */

/** Finite number or null — strings are accepted because some dumps quote them. */
function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Solver exports disagree on where per-action EVs live. Two nesting orders are
 * seen in the wild — map[action][hand] and map[hand][action] — under several
 * key names. Probe both, under each key, and return only the actions for which
 * a real finite number was found.
 *
 * A flat `hand_evs` (hand → number, the shape ev.hero is read from) yields
 * nothing here, which is correct: one number per hand is the hand's strategy
 * EV, not a per-action breakdown.
 *
 * @returns {Object|null} action id → EV, or null when nothing was derivable.
 */
const ACTION_EV_CONTAINER_KEYS = ['action_evs', 'actionEVs', 'ev_by_action', 'evs', 'action_ev', 'hand_evs'];

function extractPerActionEVs(strategyMatrix, actionIds, handVariants) {
  if (!isPlainObject(strategyMatrix)) return null;

  for (const containerKey of ACTION_EV_CONTAINER_KEYS) {
    const container = strategyMatrix[containerKey];
    if (!isPlainObject(container)) continue;

    const found = {};
    let hits = 0;

    for (const action of actionIds) {
      // Shape A: container[action][hand]
      const byAction = container[action];
      if (isPlainObject(byAction)) {
        for (const variant of handVariants) {
          const n = toFiniteNumber(byAction[variant]);
          if (n !== null) { found[action] = n; hits++; break; }
        }
      }
      if (found[action] !== undefined) continue;

      // Shape B: container[hand][action]
      for (const variant of handVariants) {
        const byHand = container[variant];
        if (!isPlainObject(byHand)) continue;
        const n = toFiniteNumber(byHand[action]);
        if (n !== null) { found[action] = n; hits++; break; }
      }
    }

    if (hits > 0) return found;
  }

  return null;
}

/**
 * Parse strategy_matrix for a specific hero hand
 */
function parseStrategyForHand(strategyMatrix, heroHandNotation, potSize, facingBet = false) {
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

  // The hero hand is absent from every frequency map (all freqs defaulted to 0).
  // Returning the first action as "optimal at 0%" would present garbage under a
  // solver badge — bail out so the caller falls through to the Grok fallback.
  if (maxFreq <= 0) return null;

  // Per-action EVs for THIS hand, when the solver row exposes them.
  const perActionEV = extractPerActionEVs(strategyMatrix, validActions, handVariants);

  // Build enriched action data
  const actionData = validActions
    .map(action => {
      const label = getActionLabel(action, potSize, facingBet);
      const entry = {
        id: action,
        label,
        frequency: Math.round(handActions[action] * 100),
        frequencyRaw: handActions[action],
        color: getActionColor(label),
        isOptimal: action === optimalAction,
      };
      // Only attach `ev` when a real number exists — see the honesty contract
      // above. An action the solver did not price simply has no `ev` key.
      const actionEV = perActionEV ? perActionEV[action] : undefined;
      if (typeof actionEV === 'number') entry.ev = parseFloat(actionEV.toFixed(3));
      return entry;
    })
    .sort((a, b) => b.frequency - a.frequency);

  // Get EV data
  let heroEV = null;
  for (const variant of handVariants) {
    const n = toFiniteNumber(handEVs[variant]);
    if (n !== null) { heroEV = n; break; }
  }

  // No flat hand EV, but the row does price individual actions: the hand's EV
  // under the solver's own strategy is the frequency-weighted mixture of them.
  // That is a derivation from measured numbers, not an estimate — and without
  // it ev.hero stays 0, which makes the client discard every per-action EV
  // (its delta requires gtoEV !== 0).
  //
  // Only valid when EVERY action carrying frequency is priced. Renormalising
  // over a priced subset would quietly assume the unpriced actions are worth
  // the same as the priced ones, which is a guess wearing a measurement's
  // clothes — in that case ev.hero stays unset and the client keeps flagging
  // its delta as estimated.
  if (heroEV === null && perActionEV) {
    let weighted = 0;
    let pricedWeight = 0;
    let totalWeight = 0;
    for (const action of validActions) {
      const freq = handActions[action];
      if (!(freq > 0)) continue;
      totalWeight += freq;
      const actionEV = perActionEV[action];
      if (typeof actionEV === 'number') {
        weighted += actionEV * freq;
        pricedWeight += freq;
      }
    }
    if (totalWeight > 0 && pricedWeight >= totalWeight - 1e-6) {
      heroEV = weighted / totalWeight;
    }
  }

  if (heroEV === null) heroEV = 0;

  const allEVs = Object.values(handEVs || {}).filter(v => typeof v === 'number');
  const maxEV = allEVs.length > 0 ? Math.max(...allEVs) : heroEV;
  const minEV = allEVs.length > 0 ? Math.min(...allEVs) : heroEV;
  const avgEV = allEVs.length > 0 ? allEVs.reduce((s, v) => s + v, 0) / allEVs.length : 0;

  const isMixed = maxFreq < 0.95 && validActions.filter(a => handActions[a] > 0.05).length > 1;

  return {
    heroHand: heroHandNotation,
    actions: actionData,
    optimalAction: {
      id: optimalAction,
      label: getActionLabel(optimalAction, potSize, facingBet),
      frequency: Math.round(maxFreq * 100),
      color: getActionColor(getActionLabel(optimalAction, potSize, facingBet)),
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
function buildRangeHeatmap(strategyMatrix, facingBet = false) {
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
    actions: actions.map(a => ({ id: a, label: getActionLabel(a, 6, facingBet) })),
    data: rangeData,
    totalHands: allHands.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// PREFLOP CHART PARSER
// ═══════════════════════════════════════════════════════════════════════

/**
 * Per-action EV from a Nash push/fold chart entry, when the chart carries one.
 * Nash solvers usually publish the shove EV alongside the frequency, but the
 * key name varies by import. Returns null when the chart priced nothing — the
 * caller then omits `ev` rather than inventing a 0.
 */
function chartActionEV(handData, action) {
  if (!isPlainObject(handData)) return null;
  const candidates = [
    handData[`${action}_ev`],
    handData[`ev_${action}`],
    isPlainObject(handData.evs) ? handData.evs[action] : undefined,
    isPlainObject(handData.action_evs) ? handData.action_evs[action] : undefined,
    isPlainObject(handData.ev) ? handData.ev[action] : undefined,
  ];
  for (const candidate of candidates) {
    const n = toFiniteNumber(candidate);
    if (n !== null) return n;
  }
  return null;
}

function parsePreflopChart(chart, heroHandNotation) {
  const handMatrix = chart.hand_matrix || {};
  const handData = handMatrix[heroHandNotation] || handMatrix[heroHandNotation?.toUpperCase()];

  // Hand not present in this chart — do NOT fabricate a "Fold 100%" verdict at
  // High confidence. Returning null lets the caller fall through to Grok.
  if (!handData) return null;

  const pushFreq = Math.round((handData.push || 0) * 100);
  const foldFreq = 100 - pushFreq;
  const isPush = pushFreq > 50;

  const pushEV = chartActionEV(handData, 'push');
  const foldEV = chartActionEV(handData, 'fold');

  const actions = [
    { id: 'push', label: 'Push All-In', frequency: pushFreq, color: '#ec4899', isOptimal: isPush },
    { id: 'fold', label: 'Fold', frequency: foldFreq, color: '#ef4444', isOptimal: !isPush },
  ];
  // Attach only what the chart actually priced. A push/fold chart that stores
  // frequencies alone leaves both actions without an `ev` key, and the client
  // keeps flagging its delta as estimated — which is the truth.
  if (pushEV !== null) actions[0].ev = parseFloat(pushEV.toFixed(3));
  if (foldEV !== null) actions[1].ev = parseFloat(foldEV.toFixed(3));

  // Hero EV: an explicit scalar if the chart has one, else the frequency-
  // weighted mixture — but only when every action that actually carries
  // frequency is priced, for the same reason as the postflop path. When
  // neither exists we keep the "no EV available" block ('—' renders as a dash,
  // and the client's gtoEV !== 0 guard keeps the delta flagged as estimated).
  let heroEV = toFiniteNumber(handData.ev);
  if (heroEV === null) heroEV = toFiniteNumber(handData.hero_ev);
  if (heroEV === null && (pushEV !== null || foldEV !== null)) {
    const weights = [{ w: pushFreq / 100, ev: pushEV }, { w: foldFreq / 100, ev: foldEV }];
    let weighted = 0;
    let pricedWeight = 0;
    let totalWeight = 0;
    for (const { w, ev: actionEV } of weights) {
      if (!(w > 0)) continue;
      totalWeight += w;
      if (actionEV !== null) { weighted += actionEV * w; pricedWeight += w; }
    }
    if (totalWeight > 0 && pricedWeight >= totalWeight - 1e-6) {
      heroEV = weighted / totalWeight;
    }
  }

  const pricedEVs = [pushEV, foldEV].filter(v => v !== null);
  const ev = heroEV === null
    ? { hero: 0, heroDisplay: '—', max: 0, min: 0, avg: 0, evLoss: 0 }
    : (() => {
      const pool = pricedEVs.length > 0 ? pricedEVs : [heroEV];
      const maxEV = Math.max(...pool);
      const minEV = Math.min(...pool);
      const avgEV = pool.reduce((s, v) => s + v, 0) / pool.length;
      return {
        hero: parseFloat(heroEV.toFixed(3)),
        heroDisplay: heroEV >= 0 ? `+${heroEV.toFixed(2)} BB` : `${heroEV.toFixed(2)} BB`,
        max: parseFloat(maxEV.toFixed(3)),
        min: parseFloat(minEV.toFixed(3)),
        avg: parseFloat(avgEV.toFixed(3)),
        evLoss: parseFloat(Math.max(0, maxEV - heroEV).toFixed(3)),
      };
    })();

  return {
    heroHand: heroHandNotation,
    actions,
    optimalAction: {
      id: isPush ? 'push' : 'fold',
      label: isPush ? 'Push All-In' : 'Fold',
      frequency: isPush ? pushFreq : foldFreq,
      color: isPush ? '#ec4899' : '#ef4444',
    },
    isMixed: pushFreq > 10 && pushFreq < 90,
    ev,
  };
}

function buildPreflopHeatmap(chart) {
  const handMatrix = chart.hand_matrix || {};
  const allHands = Object.keys(handMatrix || {});
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

// ═══════════════════════════════════════════════════════════════════════
// GROK AI FALLBACK (Tier 4)
// ═══════════════════════════════════════════════════════════════════════

async function analyzeWithGrok(params) {
  try {
    const grok = getGrokClient();
    const { heroHand, heroPosition, heroStack, gameType, villains, board, potSize, exploitMode, villainArchetype, bubbleFactor, villainRange, socratic } = params;

    const boardCards = [...(board?.flop || []), board?.turn, board?.river].filter(Boolean);
    const boardStr = boardCards.length > 0 ? boardCards.join(' ') : 'Preflop';
    const heroHandStr = `${heroHand?.card1 || 'As'} ${heroHand?.card2 || 'Kd'}`;
    const villainDesc = villains?.slice(0, 3).map(v => `${v.archetype?.name || 'Unknown'} (${v.stack}bb)`).join(', ') || 'Unknown';

    // Exploit mode context injection
    let exploitContext = '';
    if (exploitMode === 'exploit' && villainArchetype) {
      const archetypeTendencies = {
        calling_station: 'Villain calls too wide. Value bet thinner, reduce bluff frequency.',
        nit: 'Villain folds too much. Increase bluff frequency, steal more pots. Respect their raises.',
        lag: 'Villain plays loose-aggressive. Trap with strong hands, tighten your range.',
        tag: 'Villain is tight-aggressive. Stay balanced, mix your frequencies, avoid obvious lines.',
        maniac: 'Villain bets and raises too aggressively. Widen value range, reduce bluff frequency, let them hang themselves.',
        fish: 'Villain makes fundamental mistakes. Bet bigger with strong hands, simplify decisions, avoid fancy plays.',
      };
      exploitContext = `\n\nEXPLOIT MODE ACTIVE — Villain Archetype: ${villainArchetype}\n${archetypeTendencies[villainArchetype] || 'Adjust based on villain tendencies.'}`;
    }

    // ICM bubble factor context
    let icmContext = '';
    if (gameType === 'tournament' && bubbleFactor && bubbleFactor !== 1.0) {
      icmContext = `\n\nICM CONTEXT: Bubble Factor = ${bubbleFactor.toFixed(1)}x. ${bubbleFactor > 1.2 ? 'High bubble pressure — survival premium, tighten calling ranges and avoid marginal spots.' : bubbleFactor < 0.8 ? 'Low bubble pressure — chip accumulation mode, can take more risks.' : 'Moderate bubble pressure.'}`;
    }

    // Villain range context (from archetype preflop opening range)
    let villainRangeContext = '';
    if (villainRange && villainRange.trim().length > 0) {
      villainRangeContext = `\n- Villain Opening Range: ${villainRange.substring(0, 80)}${villainRange.length > 80 ? '...' : ''}`;
    }

    // Socratic coach mode context — show what the user picked
    let socraticContext = '';
    if (socratic?.userPick) {
      socraticContext = `\n\nPLAYER SUBMITTED ACTION: ${socratic.userPick}\nPlease evaluate if this is GTO or exploitative, and what the EV difference is.`;
    }

    const prompt = `You are a GTO poker solver. Analyze this scenario with precise frequencies.${exploitMode === 'exploit' ? ' ADJUST for villain tendencies (exploit mode).' : ''}

SCENARIO:
- Hero Hand: ${heroHandStr}
- Hero Position: ${heroPosition || 'BTN'}
- Hero Stack: ${heroStack || 100}bb
- Game Type: ${gameType === 'tournament' ? 'Tournament (ICM)' : 'Cash Game (ChipEV)'}
- Pot Size: ${potSize || 6}bb
- Board: ${boardStr}
- Villains: ${villainDesc}${villainRangeContext}${exploitContext}${icmContext}${socraticContext}

Respond in EXACT JSON format (no markdown):
{
  "actions": [
    { "id": "b66", "label": "Bet 66%", "frequency": 55 },
    { "id": "c", "label": "Check", "frequency": 30 },
    { "id": "b33", "label": "Bet 33%", "frequency": 15 }
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

    // Hard timeout — a hung Grok request must not pin the lambda open.
    let timeoutHandle = null;
    const response = await Promise.race([
      grok.chat.completions.create({
        model: 'grok-3',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 600,
      }),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Grok request timed out')), 15000);
      }),
    ]).finally(() => { if (timeoutHandle) clearTimeout(timeoutHandle); });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Grok response');

    const parsed = JSON.parse(jsonMatch[0]);
    const facingBet = isFacingBet(params.actionHistory, heroPosition, getStreet(board));

    // Grok is NOT guaranteed to return actions sorted by frequency, nor to make
    // them sum to 100 — normalize both before trusting the ordering.
    //
    // Fields are copied EXPLICITLY rather than spread. A spread would forward
    // anything the model volunteered — including an `ev` — and the client reads
    // `typeof action.ev === 'number'` as "this EV was measured", which would
    // switch off its `evDeltaEstimated` warning for a number the model made up.
    // No per-action EV is derivable on this path, so none is emitted.
    const rawActions = (parsed.actions || [])
      .filter(a => a && typeof a === 'object')
      .map(a => ({
        id: typeof a.id === 'string' ? a.id : 'c',
        label: typeof a.label === 'string' && a.label ? a.label : null,
        frequency: Number(a.frequency) > 0 ? Number(a.frequency) : 0,
      }));

    const freqTotal = rawActions.reduce((s, a) => s + a.frequency, 0);
    const grokActions = rawActions
      .map(a => {
        const normalized = freqTotal > 0 ? (a.frequency * 100) / freqTotal : 0;
        const label = a.label || getActionLabel(a.id, potSize, facingBet);
        return {
          id: a.id,
          label,
          frequency: Math.round(normalized),
          frequencyRaw: normalized / 100,
          color: getActionColor(label),
          isOptimal: false,
        };
      })
      .sort((a, b) => b.frequency - a.frequency);

    if (grokActions.length === 0) throw new Error('Grok returned no actions');
    grokActions[0].isOptimal = true;

    return {
      heroHand: heroHandToNotation(heroHand) || `${heroHand?.card1 || ''}${heroHand?.card2 || ''}`.trim() || 'Unknown',
      actions: grokActions,
      optimalAction: grokActions[0] || { id: 'c', label: 'Check', frequency: 100, color: '#6b7280' },
      isMixed: parsed.isMixed || false,
      ev: { hero: 0, heroDisplay: '—', max: 0, min: 0, avg: 0, evLoss: 0 },
      explanation: parsed.explanation || 'Analysis based on GTO principles.',
      confidence: parsed.confidence || 'Medium',
    };
  } catch (error) {
    console.warn('[Sandbox] Grok analysis failed:', error.message);
    return null;
  }
}

/**
 * Hard fallback when Grok also fails — basic rule-based.
 *
 * These frequencies are positional heuristics, so no action carries an `ev`
 * key: there is nothing measured to report, and a 0 would be read by the
 * client as a real EV (see the honesty contract above parseStrategyForHand).
 */
function ruleBasedFallback(params) {
  const { heroHand, heroPosition, heroStack, board, potSize } = params;
  const street = getStreet(board);
  const inPosition = ['BTN', 'CO', 'HJ'].includes(heroPosition);

  let actions;
  if (street === 'preflop') {
    actions = [
      { id: 'r25', label: 'Raise 2.5x', frequency: 70, color: '#22c55e', isOptimal: true },
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

// ═══════════════════════════════════════════════════════════════════════
// EXPLANATION BUILDER
// ═══════════════════════════════════════════════════════════════════════

function buildExplanation(handAnalysis, matchTier, street, exploitMode, villainArchetype, bubbleFactor) {
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

  // Exploit mode — append archetype-specific coaching tips
  if (exploitMode === 'exploit' && villainArchetype) {
    const exploitTips = {
      calling_station: 'Exploit Tip: Bet thinner for value against this calling station. Skip marginal bluffs.',
      nit: 'Exploit Tip: Steal more pots against this nit. Respect their raises — they usually have it.',
      lag: 'Exploit Tip: Tighten up against this LAG. Trap with premium hands and let them bluff into you.',
      tag: 'Exploit Tip: Stay balanced against this TAG. Mix your frequencies and avoid predictable lines.',
      maniac: 'Exploit Tip: Widen your value range against this maniac. Reduce bluff frequency — let them hang themselves.',
      fish: 'Exploit Tip: Bet bigger with strong hands against this fish. Simplify your decisions.',
    };
    const tip = exploitTips[villainArchetype];
    if (tip) explanation += ` ${tip}`;
  }

  // ICM bubble factor context
  if (bubbleFactor && bubbleFactor !== 1.0) {
    if (bubbleFactor > 1.2) {
      explanation += ` ICM Warning: Bubble factor ${bubbleFactor.toFixed(1)}x — survival premium is high. Tighten calling ranges and avoid marginal spots.`;
    } else if (bubbleFactor < 0.8) {
      explanation += ` ICM Note: Bubble factor ${bubbleFactor.toFixed(1)}x — chip accumulation mode. You can take more risks here.`;
    } else {
      explanation += ` ICM: Bubble factor ${bubbleFactor.toFixed(1)}x — moderate pressure.`;
    }
  }

  return explanation.trim();
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Rate limit FIRST — 30/min.
    //
    // This used to sit ~40 lines below, after JWT validation and the context
    // authority check. Both hit the database, so every request in a flood
    // bought one or two DB round-trips BEFORE the limiter that exists to stop
    // it — on the single most expensive endpoint of this surface (solver
    // queries plus a Grok fallback). A limiter has to run before the work it
    // protects, so it runs here, ahead of everything.
    const rl = rateLimit(req, LIMITS.write);
    Object.entries(rl.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    if (!rl.ok) {
      if (rl.retryAfter) res.setHeader('Retry-After', String(rl.retryAfter));
      return res.status(429).json({ success: false, error: 'Too many requests', retryAfter: rl.retryAfter });
    }

    try {
      // JWT Authentication — optional for guest access
      let userId = null;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          // NOTE: `authError` was referenced here instead of `authErr`. Module
          // code is strict-mode, so that threw a ReferenceError on EVERY
          // authenticated request, was swallowed by the catch below, and left
          // userId null — no session row, no stats, no context-authority check.
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
          if (!authErr && authUser) {
            userId = authUser.id;
          }
        } catch (e) { console.warn('[Sandbox] Auth token validation failed:', e.message); }
      }

      const { heroHand, heroPosition, heroStack, gameType, villains, board, betSizing, potSize, actionHistory, exploitMode, villainArchetype, villainRange, socratic } = req.body || {};

      // req.body is untrusted — a string bubbleFactor would blow up .toFixed()
      // in the explanation/ICM builders and 500 the whole request.
      const rawBubble = Number(req.body?.bubbleFactor);
      const bubbleFactor = isFinite(rawBubble) && rawBubble > 0 ? rawBubble : 1.0;

      // Context authority check — only for authenticated users
      if (userId) {
        try {
          const contextAccess = await checkSandboxAccess(getSupabase(), userId);
          if (!contextAccess.allowed) {
            return res.status(403).json({
              success: false, blocked: true,
              contextState: contextAccess.contextState,
              error: contextAccess.message,
            });
          }
        } catch (accessErr) { console.warn('[App] Handled exception:', accessErr?.message || accessErr); }
      }

      // (Rate limiting happens at the top of the handler, before any DB work.)

      // Derived inputs must be computed BEFORE the cache lookup — they are part
      // of the cache identity.
      const street = getStreet(board);
      const heroNotation = heroHandToNotation(heroHand);
      const calculatedPot = potSize || 6;
      const facingBet = isFacingBet(actionHistory, heroPosition, street);

      // Check cache
      const cacheKey = getCacheKey({
        heroHand, heroPosition, heroStack, gameType, board, exploitMode, bubbleFactor,
        villainArchetype, socratic, facingBet, potSize: calculatedPot, villainRange,
      });
      const cached = analysisCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return res.status(200).json({ success: true, cached: true, ...cached.data });
      }

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
          // Preflop chart data (short-stack push/fold only)
          analysis = parsePreflopChart(solverResult.chart, heroNotation);
          if (analysis) {
            rangeHeatmap = buildPreflopHeatmap(solverResult.chart);
            explanation = buildExplanation(analysis, matchTier, 'preflop', exploitMode, villainArchetype, bubbleFactor);
          }
        } else if (solverResult.scenario?.strategy_matrix) {
          // Postflop solver data
          analysis = parseStrategyForHand(solverResult.scenario.strategy_matrix, heroNotation, calculatedPot, facingBet);

          if (analysis) {
            rangeHeatmap = buildRangeHeatmap(solverResult.scenario.strategy_matrix, facingBet);
            explanation = buildExplanation(analysis, matchTier, street, exploitMode, villainArchetype, bubbleFactor);
          }
        }
      }

      // ━━━ GROK FALLBACK (Tier 4) ━━━
      if (!analysis) {
        matchTier = 4;
        source = 'Grok AI Analysis';

        rangeHeatmap = null;
        analysis = await analyzeWithGrok({
          heroHand, heroPosition, heroStack, gameType, villains, board, potSize: calculatedPot,
          exploitMode, villainArchetype, bubbleFactor, villainRange, socratic, actionHistory,
        });

        if (!analysis) {
          // Hard fallback
          analysis = ruleBasedFallback({
            heroHand, heroPosition, heroStack, board, potSize: calculatedPot,
          });
          source = 'Heuristic Estimation';
        }

        explanation = analysis.explanation || buildExplanation(analysis, matchTier, street, exploitMode, villainArchetype, bubbleFactor);
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

      // ━━━ ICM-ADJUSTED EV (Tournament mode with bubble factor) ━━━
      if (gameType === 'tournament' && bubbleFactor && bubbleFactor !== 1.0 && analysis.ev) {
        const icmHero = parseFloat((analysis.ev.hero * bubbleFactor).toFixed(3));
        responseData.icmAdjusted = true;
        responseData.bubbleFactor = bubbleFactor;
        responseData.icmEV = {
          hero: icmHero,
          heroDisplay: `${icmHero >= 0 ? '+' : ''}${icmHero.toFixed(2)} BB (ICM)`,
        };
      }

      // Cache
      analysisCache.set(cacheKey, { data: responseData, ts: Date.now() });
      if (analysisCache.size > 500) {
        const keysToDelete = Array.from(analysisCache.keys()).slice(0, 50);
        keysToDelete.forEach(k => analysisCache.delete(k));
      }

      // Save session — only for authenticated users. Guest analyses must not
      // write null-user rows into sandbox_sessions / user_assistant_stats.
      // savedSessionId is echoed back to the client so a coach verdict logged
      // right after this analysis can be linked to the exact hand instead of
      // relying on the spot+timestamp heuristic. Stays null whenever the row
      // could not be written (guest, missing table, DB error).
      let savedSessionId = null;
      if (userId) {
       try {
        const { data: session } = await getSupabase()
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
            action_history: actionHistory || [],
            bet_sizing_preset: betSizing || 'standard',
            pot_size_bb: calculatedPot,
          })
          .select()
          .maybeSingle();

        if (session) {
          // Normalise to a string — the id may come back as a bigint/number
          // depending on the column type, and every consumer treats it as text.
          savedSessionId = (session.id === null || session.id === undefined || session.id === '')
            ? null
            : String(session.id);

          const { error: resultsErr } = await getSupabase().from('sandbox_results').insert({
            session_id: session.id,
            primary_action: analysis.optimalAction?.label,
            primary_frequency: analysis.optimalAction?.frequency,
            alternative_actions: analysis.actions?.filter(a => !a.isOptimal),
            data_source: matchTier <= 3 ? 'solver_verified' : 'ai_approx',
            confidence: responseData.confidence?.toLowerCase(),
            sensitivity_flags: heroStack < 50 ? ['stack_sensitive'] : [],
            why_not_check: explanation,
            full_analysis: responseData,
            truth_seal: {
              source: matchTier <= 2 ? 'solver_verified' : matchTier === 3 ? 'solver_approx' : 'ai_approx',
              matchTier,
              timestamp: new Date().toISOString(),
            },
          });
          if (resultsErr) console.warn('[Sandbox] Results insert failed:', resultsErr.message);

          // Update user stats. NOTE: total_sessions_reviewed means "reviewed
          // sessions" elsewhere in the app — analyzing a spot is not a review,
          // so only the sandbox/hand counters move here.
          const { data: existing } = await getSupabase()
            .from('user_assistant_stats')
            .select('sandbox_sessions_count, total_hands_analyzed')
            .eq('user_id', userId)
            .maybeSingle();

          const { error: statsErr } = await getSupabase().from('user_assistant_stats').upsert({
            user_id: userId,
            sandbox_sessions_count: (existing?.sandbox_sessions_count || 0) + 1,
            total_hands_analyzed: (existing?.total_hands_analyzed || 0) + 1,
            last_sandbox_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
          if (statsErr) console.warn('[Sandbox] Stats upsert failed:', statsErr.message);
        }
       } catch (dbErr) {
        console.warn('[Sandbox] Session save error (non-fatal):', dbErr.message);
       }
      }

      // sessionId is spread last so a stray key inside responseData can never
      // shadow the real row id. Null for guests / failed writes, which the
      // client treats exactly like "absent" (it omits the key and the server
      // falls back to its spot+time heuristic).
      return res.status(200).json({
        success: true,
        rateLimit: { remaining: rl.remaining },
        ...responseData,
        sessionId: savedSessionId,
      });

    } catch (error) {
      console.warn('[Sandbox] Analysis error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
