/**
 * Certified Direct-Corpus Solver Matcher (PioSOLVER V2 + Gold Preflop Charts)
 *
 * PURE & FAIL-CLOSED:
 * - Queries `public.solved_spots_gold` (strictly validated `strategy_matrix_v2`
 *   via `selectTrustedSolverMatrix`, NEVER touching legacy V1 `f` channels) for
 *   exact postflop concrete-combo matches on indexed `scenario_hash`.
 * - Queries `public.memory_charts_gold` (indexed by `(game_type, stack_depth,
 *   hero_position, villain_action)`) for exact short-stack preflop push/fold
 *   matches (both Cash and Tournament).
 * - Returns `null` on ANY ambiguity, stack drift > 1bb, pot drift > 0.5bb,
 *   unmatched sizing, board collision, or missing trust envelope. Never
 *   fabricates solver grades or EV loss numbers.
 */
import { selectTrustedSolverMatrix } from './solverMatrixTrust.js';

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const MEMORY_CHART_STACKS = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25,
];
const SOLVED_SPOT_STACKS = [20, 40, 60, 100, 150, 200];

export function cardIndex(card) {
  const clean = String(card || '').trim();
  if (clean.length !== 2) return -1;
  const r = RANKS.indexOf(clean[0].toUpperCase());
  const s = SUITS.indexOf(clean[1].toLowerCase());
  if (r < 0 || s < 0) return -1;
  return r * 4 + s;
}

/** Exact PioSOLVER 1,326-combo index matching v2Matrix.js (`2c2d=0 .. AhAs=1325`). */
export function comboIndex(holeCards) {
  if (!Array.isArray(holeCards) || holeCards.length !== 2) return -1;
  const i0 = cardIndex(holeCards[0]);
  const i1 = cardIndex(holeCards[1]);
  if (i0 < 0 || i1 < 0 || i0 === i1) return -1;
  const a = Math.min(i0, i1);
  const b = Math.max(i0, i1);
  return (b * (b - 1)) / 2 + a;
}

function normalizeCard(card) {
  const clean = String(card || '').trim();
  if (clean.length !== 2) return null;
  const r = clean[0].toUpperCase();
  const s = clean[1].toLowerCase();
  if (!RANKS.includes(r) || !SUITS.includes(s)) return null;
  return `${r}${s}`;
}

/**
 * Generate exact board strings preserving turn/river order while allowing any
 * of the 6 canonical flop permutations (since flop cards are dealt simultaneously).
 */
export function exactBoardStrings(boardCards) {
  if (!Array.isArray(boardCards) || boardCards.length < 3 || boardCards.length > 5) return [];
  const norm = boardCards.map(normalizeCard);
  if (norm.some(c => !c) || new Set(norm).size !== norm.length) return [];
  const [f0, f1, f2, turn, river] = norm;
  const tail = `${turn || ''}${river || ''}`;
  const perms = [
    `${f0}${f1}${f2}${tail}`,
    `${f0}${f2}${f1}${tail}`,
    `${f1}${f0}${f2}${tail}`,
    `${f1}${f2}${f0}${tail}`,
    `${f2}${f0}${f1}${tail}`,
    `${f2}${f1}${f0}${tail}`,
  ];
  return [...new Set(perms)];
}

function handClassNotation(holeCards) {
  if (!Array.isArray(holeCards) || holeCards.length !== 2) return null;
  const c0 = normalizeCard(holeCards[0]);
  const c1 = normalizeCard(holeCards[1]);
  if (!c0 || !c1 || c0 === c1) return null;
  const r0 = RANKS.indexOf(c0[0]);
  const r1 = RANKS.indexOf(c1[0]);
  const hi = r0 >= r1 ? c0 : c1;
  const lo = r0 >= r1 ? c1 : c0;
  if (hi[0] === lo[0]) return `${hi[0]}${lo[0]}`;
  return `${hi[0]}${lo[0]}${hi[1] === lo[1] ? 's' : 'o'}`;
}

function classifyFromFrequency(selectedFreq, optimalFreq) {
  if (selectedFreq >= 0.35 || selectedFreq >= optimalFreq - 0.10) return 'correct';
  if (selectedFreq >= 0.15) return 'inaccuracy';
  if (selectedFreq >= 0.03) return 'wrong';
  return 'blunder';
}

function normalizeActionLabel(key) {
  const k = String(key || '').trim().toLowerCase();
  if (k === 'c' || k === 'check') return 'check';
  if (k === 'f' || k === 'fold') return 'fold';
  if (k === 'call') return 'call';
  if (k === 'push' || k === 'shove' || k === 'allin' || k === 'all_in') return 'allin';
  if (k.startsWith('bet')) return k;
  if (k.startsWith('raise')) return k;
  return k || 'unknown';
}

function matchV2Action(actions, point) {
  if (!Array.isArray(actions) || actions.length === 0) return null;
  const played = String(point?.action || '').toLowerCase();
  if (played === 'check') {
    return actions.find(a => String(a?.key || '').toLowerCase() === 'check' || String(a?.code || '').toLowerCase() === 'c') || null;
  }
  if (played === 'fold') {
    return actions.find(a => String(a?.key || '').toLowerCase() === 'fold' || String(a?.code || '').toLowerCase() === 'f') || null;
  }
  if (played === 'call') {
    return actions.find(a => String(a?.key || '').toLowerCase() === 'call' || String(a?.code || '').toLowerCase() === 'call') || null;
  }
  if (played === 'bet' || played === 'raise' || played === 'allin') {
    const betActions = actions.filter(a => {
      const k = String(a?.key || '').toLowerCase();
      const c = String(a?.code || '').toLowerCase();
      return k.startsWith('bet') || k.startsWith('raise') || k.includes('allin') || c.startsWith('b') || c.startsWith('r');
    });
    if (betActions.length === 0) return null;
    if (played === 'allin') {
      const jam = betActions.find(a => String(a?.key || '').toLowerCase().includes('allin') || String(a?.key || '').toLowerCase().includes('shove'));
      if (jam) return jam;
    }
    const sizingPct = Number(point?.sizingPct);
    if (!Number.isFinite(sizingPct) || sizingPct <= 0) return null;
    let best = null;
    let bestDiff = Infinity;
    for (const action of betActions) {
      const sizePct = Number(action?.size_pct);
      if (!Number.isFinite(sizePct) || sizePct <= 0) continue;
      const diff = Math.abs(sizePct - sizingPct);
      if (diff <= 10 && diff < bestDiff) {
        best = action;
        bestDiff = diff;
      }
    }
    return best;
  }
  return null;
}

function v2NodeMatchesPoint(v2, point) {
  const node = String(v2?.node || '').trim();
  const heroRole = String(v2?.hero || '').toUpperCase();
  if (!node || !heroRole) return false;
  if (point.nodeClass === 'hero_bets_or_checks') {
    if (heroRole === 'OOP' && node === 'r:0') return true;
    if (heroRole === 'IP' && node === 'r:0:c') return true;
    return false;
  }
  if (point.nodeClass === 'hero_faces_bet') {
    return /:b\d+$/i.test(node);
  }
  return false;
}

function nearestExactStack(heroStack, allowedStacks) {
  const stack = Number(heroStack);
  if (!Number.isFinite(stack) || stack <= 0) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const candidate of allowedStacks) {
    const diff = Math.abs(stack - candidate);
    if (diff <= 1 && diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best;
}

/**
 * Exact concrete-combo postflop match against `solved_spots_gold.strategy_matrix_v2`.
 * Strictly refuses untrusted legacy V1 rows, non-matching boards/stacks/pots/nodes,
 * or ambiguous sizings.
 */
export async function findSolvedSpotV2Match(db, hand, point) {
  if (!db || typeof db.from !== 'function') return null;
  if (!['flop', 'turn', 'river'].includes(String(point?.street || '').toLowerCase())) return null;
  if (!['cash', 'tournament'].includes(hand?.format)) return null;

  const cIdx = comboIndex(point?.holeCards);
  if (cIdx < 0) return null;

  const normHole = point.holeCards.map(normalizeCard);
  const normBoard = (point.board || []).map(normalizeCard);
  if (normBoard.some(c => !c || normHole.includes(c))) return null;

  const stackDepth = nearestExactStack(hand?.hero?.stack, SOLVED_SPOT_STACKS);
  if (stackDepth === null) return null;

  const pos = String(point?.position || '').toUpperCase();
  if (!pos) return null;

  const boardStrings = exactBoardStrings(point.board);
  if (boardStrings.length === 0) return null;

  const gameTypes = hand.format === 'cash'
    ? (Number(hand?.tableSize) === 2 ? ['hu_cash'] : ['6max_cash'])
    : ['mtt_6max', 'mtt_9max'];

  const candidateHashes = [];
  for (const gt of gameTypes) {
    for (const b of boardStrings) {
      candidateHashes.push(`${gt}_${pos}_${stackDepth}bb_${b}`);
    }
  }

  let rows;
  try {
    const res = await db
      .from('solved_spots_gold')
      .select('id, scenario_hash, game_type, stack_depth, street, strategy_matrix_v2, solved_v2_at, quality_status')
      .in('scenario_hash', candidateHashes)
      .not('solved_v2_at', 'is', null)
      .not('strategy_matrix_v2', 'is', null)
      .limit(12);
    if (res?.error) return null;
    rows = Array.isArray(res?.data) ? res.data : [];
  } catch (_) {
    return null;
  }

  const matchedCandidates = [];
  for (const row of rows) {
    const v2 = row?.strategy_matrix_v2;
    if (!v2 || typeof v2 !== 'object') continue;
    // Enforce the repository's canonical V2 bridge trust boundary.
    const bridged = selectTrustedSolverMatrix(row);
    if (!bridged) continue;

    if (String(v2.street || '').toLowerCase() !== String(point.street).toLowerCase()) continue;
    if (String(v2.position || '').toUpperCase() !== pos) continue;
    if (!v2NodeMatchesPoint(v2, point)) continue;

    const villainExpected = String(v2.hero || '').toUpperCase() === 'IP'
      ? String(v2.oop_player || '').toUpperCase()
      : String(v2.ip_player || '').toUpperCase();
    if (point.villainPosition && villainExpected && String(point.villainPosition).toUpperCase() !== villainExpected) {
      continue;
    }

    const potBb = Number(v2.pot_bb);
    const pointPot = Number(point?.potBeforeBB);
    if (!Number.isFinite(potBb) || !Number.isFinite(pointPot) || Math.abs(potBb - pointPot) > 0.5) {
      continue;
    }

    const actions = Array.isArray(v2.actions) ? v2.actions : [];
    const freqs = v2.frequencies;
    if (!freqs || typeof freqs !== 'object' || actions.length === 0) continue;

    const actionProbs = [];
    let totalMass = 0;
    let corrupt = false;
    for (const action of actions) {
      const code = String(action?.code || '');
      const vec = freqs[code] ?? freqs[action?.key];
      if (!Array.isArray(vec) || vec.length !== 1326) {
        corrupt = true;
        break;
      }
      const prob = Number(vec[cIdx]);
      if (!Number.isFinite(prob) || prob < -0.001 || prob > 1.001) {
        corrupt = true;
        break;
      }
      const clamped = Math.max(0, Math.min(1, prob));
      totalMass += clamped;
      actionProbs.push({ action, prob: clamped });
    }
    if (corrupt || totalMass < 0.98 || totalMass > 1.02) continue;

    const selectedEntry = matchV2Action(actions, point);
    if (!selectedEntry) continue;

    const selectedObj = actionProbs.find(item => item.action === selectedEntry);
    if (!selectedObj) continue;

    const sortedByProb = [...actionProbs].sort((a, b) => b.prob - a.prob);
    const optimalObj = sortedByProb[0];
    const selectedFrequency = +(selectedObj.prob / totalMass).toFixed(4);
    const optimalFrequency = +(optimalObj.prob / totalMass).toFixed(4);

    // Per-action EVs are measured only when exact per-action combo EV vectors exist.
    let evLoss = null;
    let evLossMeasured = false;
    const actionEvs = v2.action_evs_bb;
    if (actionEvs && typeof actionEvs === 'object') {
      const selVec = actionEvs[selectedEntry.code] ?? actionEvs[selectedEntry.key];
      const optVec = actionEvs[optimalObj.action.code] ?? actionEvs[optimalObj.action.key];
      if (Array.isArray(selVec) && Array.isArray(optVec)) {
        const selEv = Number(selVec[cIdx]);
        const optEv = Number(optVec[cIdx]);
        if (Number.isFinite(selEv) && Number.isFinite(optEv)) {
          evLoss = +Math.max(0, optEv - selEv).toFixed(4);
          evLossMeasured = true;
        }
      }
    }

    matchedCandidates.push({
      questionId: `ssg:${row.id}`,
      gameId: hand.format === 'tournament' ? 'mtt-002' : 'cash-002',
      spotType: `${point.street}_${String(v2.hero || '').toLowerCase()}_${point.nodeClass}`,
      villainPosition: villainExpected || null,
      solverSource: 'PIOSOLVER',
      solverAction: normalizeActionLabel(optimalObj.action.key || optimalObj.action.code),
      selectedFrequency,
      optimalFrequency,
      classification: classifyFromFrequency(selectedFrequency, optimalFrequency),
      evLoss,
      evLossMeasured,
      matchTier: 1,
      solverVerified: true,
    });
  }

  if (matchedCandidates.length === 0) return null;
  // Fail closed if multiple rows disagree on the optimal action/frequency.
  const fingerprints = new Set(matchedCandidates.map(c => `${c.solverAction}|${c.selectedFrequency}|${c.optimalFrequency}`));
  if (fingerprints.size !== 1) return null;
  return matchedCandidates[0];
}

function mapChartAction(cell, point) {
  const played = String(point?.action || '').toLowerCase();
  const keys = Object.keys(cell || {});
  if (played === 'fold' && keys.includes('fold')) return 'fold';
  if (played === 'call' && keys.includes('call')) return 'call';
  if ((played === 'allin' || played === 'raise' || played === 'bet')) {
    if (keys.includes('push') && played === 'allin') return 'push';
    if (keys.includes('raise') && played !== 'allin') return 'raise';
    // On pure push/fold short-stack charts (only push + fold keys), any open/all-in
    // is evaluated ONLY when the player actually shoved all-in. Never conflate a
    // min-raise with a shove!
    if (keys.includes('push') && played === 'allin') return 'push';
  }
  return null;
}

/**
 * Exact preflop push/fold chart match against `public.memory_charts_gold`.
 * Covers both Cash and Tournament short-stack spots (2..20bb, 25bb) when hero's
 * stack, position, and villain action match the chart's unique index exactly.
 */
export async function findMemoryChartMatch(db, hand, point) {
  if (!db || typeof db.from !== 'function') return null;
  if (String(point?.street || '').toLowerCase() !== 'preflop') return null;
  if (!['cash', 'tournament'].includes(hand?.format)) return null;

  const notation = handClassNotation(point?.holeCards);
  if (!notation) return null;

  const pos = String(point?.position || '').toUpperCase();
  if (!['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'].includes(pos)) return null;

  const stackDepth = nearestExactStack(hand?.hero?.stack, MEMORY_CHART_STACKS);
  if (stackDepth === null) return null;

  let villainAction = null;
  if (point.nodeClass === 'preflop_open') {
    villainAction = 'fold_to_hero';
  } else if (
    point.nodeClass === 'preflop_facing_raise'
    && pos === 'BB'
    && String(point.villainPosition || '').toUpperCase() === 'SB'
    && Array.isArray(point.priorActions)
    && point.priorActions.some(a => String(a?.position || '').toUpperCase() === 'SB' && String(a?.action || '').toLowerCase() === 'allin')
  ) {
    villainAction = 'sb_push';
  }
  if (!villainAction) return null;

  const gameType = hand.format === 'tournament' ? 'Tournament' : 'Cash';
  let row = null;
  try {
    const res = await db
      .from('memory_charts_gold')
      .select('chart_id, game_type, stack_depth, hero_position, villain_action, hand_matrix')
      .eq('game_type', gameType)
      .eq('stack_depth', stackDepth)
      .eq('hero_position', pos)
      .eq('villain_action', villainAction)
      .maybeSingle();
    if (res?.error || !res?.data) return null;
    row = res.data;
  } catch (_) {
    return null;
  }

  const cell = row?.hand_matrix?.[notation];
  if (!cell || typeof cell !== 'object' || Array.isArray(cell)) return null;

  const entries = Object.entries(cell)
    .map(([k, v]) => [String(k).toLowerCase(), Number(v)])
    .filter(([, v]) => Number.isFinite(v) && v >= -0.001 && v <= 1.001);
  const sum = entries.reduce((acc, [, v]) => acc + Math.max(0, v), 0);
  if (entries.length === 0 || sum < 0.98 || sum > 1.02) return null;

  const selectedKey = mapChartAction(Object.fromEntries(entries), point);
  if (!selectedKey) return null;

  const selectedVal = Math.max(0, Number(Object.fromEntries(entries)[selectedKey]) || 0);
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const [optKey, optVal] = sorted[0];
  const selectedFrequency = +(selectedVal / sum).toFixed(4);
  const optimalFrequency = +(Math.max(0, optVal) / sum).toFixed(4);

  return {
    questionId: `mcg:${row.chart_id}`,
    gameId: hand.format === 'tournament' ? 'mtt-001' : 'cash-001',
    spotType: `preflop_${villainAction}_${stackDepth}bb`,
    villainPosition: villainAction === 'sb_push' ? 'SB' : null,
    solverSource: 'MEMORY_CHARTS_GOLD',
    solverAction: normalizeActionLabel(optKey),
    selectedFrequency,
    optimalFrequency,
    classification: classifyFromFrequency(selectedFrequency, optimalFrequency),
    evLoss: null,
    evLossMeasured: false,
    matchTier: 1,
    solverVerified: true,
  };
}

/** Unified fail-closed direct-corpus solver lookup (PioSOLVER V2 postflop + Gold Preflop Charts). */
export async function findDirectCorpusSolverMatch(db, hand, point) {
  if (!point?.street) return null;
  if (String(point.street).toLowerCase() === 'preflop') {
    return findMemoryChartMatch(db, hand, point);
  }
  return findSolvedSpotV2Match(db, hand, point);
}

export default {
  cardIndex,
  comboIndex,
  exactBoardStrings,
  findSolvedSpotV2Match,
  findMemoryChartMatch,
  findDirectCorpusSolverMatch,
};
