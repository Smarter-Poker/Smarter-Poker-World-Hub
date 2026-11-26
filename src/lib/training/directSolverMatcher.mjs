/**
 * Certified Direct-Corpus Solver Matcher (PioSOLVER V2 + Gold Preflop Charts)
 *
 * PURE & FAIL-CLOSED:
 * - Queries `public.solved_spots_gold` strictly filtered to `quality_status = 'validated'`,
 *   validated through BOTH `customSolverProvenanceIsComplete(row)` AND
 *   `selectTrustedSolverMatrix(row)` (`v2ToAppMatrix`), NEVER touching legacy V1
 *   `f` channels or quarantined/unprovenanced rows.
 * - Matches exact V2 catalog `game_type` families (`hu_cash`, `postflop_complete`,
 *   `mtt_6max_chipev`, `mtt_9max_chipev`, `mtt_3max_chipev`, `mtt_hu_chipev`,
 *   `spin_3max_chipev`, `spin_hu_chipev`), street hash prefixes (`''`, `'turn_'`,
 *   `'river_'`), replayed node pot/facing bet (`bridged.pot_bb` / `bridged.facing_bet_bb`),
 *   and cumulative chip-target sizing (`size_chips` + all-in detection) alongside `size_pct`.
 * - Queries `public.memory_charts_gold` for exact short-stack preflop push/fold
 *   spots (Cash and Tournament), treating omitted hands in a valid sparse chart as
 *   pure folds (`{ fold: 1 }`), refusing limped/multiway pots, and mapping BB all-in calls.
 * - Emits frequencies in canonical `0..100` percentage scale matching `cacheTruthContract.mjs`
 *   and `hand_audit_decisions.NUMERIC(6,2)` with identical classification thresholds.
 */
import { selectTrustedSolverMatrix } from './solverMatrixTrust.js';
import { customSolverProvenanceIsComplete } from './customSolverSpotContract.mjs';
import { BLUNDER_OPTIMAL_FREQUENCY_THRESHOLD } from './solverDecisionEvidence.js';

export { BLUNDER_OPTIMAL_FREQUENCY_THRESHOLD };

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const MEMORY_CHART_STACKS = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25,
];
const SOLVED_SPOT_STACKS = [10, 20, 25, 40, 60, 80, 100, 150, 200];

const V2_SOLVED_SPOT_PROJECTION = [
  'id',
  'scenario_hash',
  'game_type',
  'stack_depth',
  'street',
  'strategy_matrix_v2',
  'solved_v2_at',
  'quality_status',
  'solver_version',
  'solver_binary_checksum',
  'machine_id',
  'pipeline_commit',
  'manifest_version',
  'manifest_checksum',
  'source_artifact_checksum',
  'audited_at',
].join(', ');

const V2_FAMILY_STACKS = Object.freeze({
  hu_cash: new Set([40, 100, 200]),
  postflop_complete: new Set([100]),
  mtt_3max_chipev: new Set([20]),
  mtt_6max_chipev: new Set([10, 20, 40, 100]),
  mtt_9max_chipev: new Set([20, 40, 80, 100]),
  mtt_hu_chipev: new Set([40]),
  spin_3max_chipev: new Set([20, 25]),
  spin_hu_chipev: new Set([10, 20]),
});

const V2_CHIPS_PER_BB = 100;
const SCENARIO_HASH_BATCH_SIZE = 12;

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

/**
 * Canonical percentage-scale classification (`0..100`) aligned verbatim with
 * `src/lib/training/cacheTruthContract.mjs:gradeCanonicalPolicyDecision`.
 */
export function classifyFromPercentFrequency(selectedPct, optimalPct, isOptimalAction = false) {
  if (isOptimalAction || selectedPct >= 20) return 'best';
  if (selectedPct >= 5) return 'correct';
  if (selectedPct >= 1) return 'inaccuracy';
  return optimalPct >= BLUNDER_OPTIMAL_FREQUENCY_THRESHOLD ? 'blunder' : 'wrong';
}

function normalizeActionLabel(key, action = null, bridged = null) {
  const k = String(key || '').trim().toLowerCase();
  if (k === 'c' || k === 'check') return 'check';
  if (k === 'f' || k === 'fold') return 'fold';
  if (k === 'call') return 'call';
  if (k === 'push' || k === 'shove' || k === 'allin' || k === 'all_in') return 'allin';
  if (action && bridged && isV2ActionAllIn(action, bridged)) return 'allin';
  if (k.startsWith('bet')) return k;
  if (k.startsWith('raise')) return k;
  return k || 'unknown';
}

function extractV2TargetChips(action) {
  const explicit = Number(action?.size_chips);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const codeMatch = String(action?.code || '').trim().match(/^b(\d+)$/i);
  if (codeMatch) return Number(codeMatch[1]);
  const keyMatch = String(action?.key || '').trim().match(/(?:bet|raise)_chips_(\d+)/i);
  if (keyMatch) return Number(keyMatch[1]);
  return null;
}

function isV2ActionAllIn(action, bridged) {
  const k = String(action?.key || '').toLowerCase();
  if (k.includes('allin') || k.includes('shove') || k.includes('jam')) return true;
  const targetChips = extractV2TargetChips(action);
  const effStackChips = Number(bridged?.eff_stack_bb) * V2_CHIPS_PER_BB;
  if (Number.isFinite(targetChips) && Number.isFinite(effStackChips) && effStackChips > 0) {
    return targetChips >= effStackChips - 1;
  }
  return false;
}

/**
 * Derive percentage-of-pot sizing for a PioSOLVER V2 aggressive action.
 * Handles BOTH explicit `size_pct` AND harvested `size_chips` (where `size_pct` is null
 * and `size_chips` is cumulative postflop contribution target per `pio_harvest.py`).
 */
export function deriveV2ActionSizingPct(action, bridged) {
  const explicitPct = Number(action?.size_pct);
  if (Number.isFinite(explicitPct) && explicitPct > 0) return explicitPct;

  const targetChips = extractV2TargetChips(action);
  const potChips = Number(bridged?.pot);
  const actorContributionChips = Number(bridged?.actor_contribution_chips);
  const facingBetChips = Number(bridged?.facing_bet_bb) * V2_CHIPS_PER_BB;
  if (!Number.isFinite(targetChips) || !Number.isFinite(potChips) || potChips <= 0) return null;

  const actorContrib = Number.isFinite(actorContributionChips) ? actorContributionChips : 0;
  const addedChips = targetChips - actorContrib;
  if (!Number.isFinite(addedChips) || addedChips <= 0) return null;

  if (Number.isFinite(facingBetChips) && facingBetChips > 0) {
    // Facing a bet: compare additional raise-over-call or total wager against pot after call
    const potAfterCall = potChips + facingBetChips;
    const raiseAdded = Math.max(0, addedChips - facingBetChips);
    return (raiseAdded / potAfterCall) * 100;
  }
  return (addedChips / potChips) * 100;
}

function matchV2Action(actions, point, bridged) {
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
      const jam = betActions.find(a => isV2ActionAllIn(a, bridged));
      if (jam) return jam;
    }
    const sizingPct = Number(point?.sizingPct);
    const pointAmountBB = Number(point?.amountBB ?? point?.amount);
    const potBeforeBB = Number(point?.potBeforeBB);
    const derivedPointPct = Number.isFinite(sizingPct) && sizingPct > 0
      ? sizingPct
      : (Number.isFinite(pointAmountBB) && pointAmountBB > 0 && Number.isFinite(potBeforeBB) && potBeforeBB > 0
          ? (pointAmountBB / potBeforeBB) * 100
          : null);
    if (!Number.isFinite(derivedPointPct) || derivedPointPct <= 0) return null;

    let best = null;
    let bestDiff = Infinity;
    for (const action of betActions) {
      const sizePct = deriveV2ActionSizingPct(action, bridged);
      if (!Number.isFinite(sizePct) || sizePct <= 0) continue;
      const diff = Math.abs(sizePct - derivedPointPct);
      if (diff <= 12 && diff < bestDiff) {
        best = action;
        bestDiff = diff;
      }
    }
    return best;
  }
  return null;
}

function v2NodeMatchesPoint(v2, bridged, point) {
  const node = String(v2?.node || '').trim();
  const heroRole = String(v2?.hero || '').toUpperCase();
  if (!node || !heroRole || !bridged) return false;
  const facingBetBb = Number(bridged.facing_bet_bb);
  if (!Number.isFinite(facingBetBb) || facingBetBb < 0) return false;

  if (point.nodeClass === 'hero_bets_or_checks') {
    // At any check-or-bet node (flop, turn, or river), facingBetBb is strictly 0.
    // On flop, also verify exact root/check-back line; on turn/river, bridged.node_state_exact
    // already proved the full UPI replay lands on `heroRole` with 0 facing bet.
    if (facingBetBb !== 0) return false;
    if (String(point.street || '').toLowerCase() === 'flop') {
      if (heroRole === 'OOP' && node === 'r:0') return true;
      if (heroRole === 'IP' && node === 'r:0:c') return true;
      return false;
    }
    return true;
  }
  if (point.nodeClass === 'hero_faces_bet') {
    if (facingBetBb <= 0 || !/:b\d+$/i.test(node)) return false;
    const pointFacing = Number(point?.facingBetBB ?? point?.toCallBB);
    if (Number.isFinite(pointFacing) && pointFacing > 0) {
      return Math.abs(facingBetBb - pointFacing) <= Math.max(0.5, pointFacing * 0.15);
    }
    return true;
  }
  return false;
}

function parseBigBlindFromStakes(stakes) {
  if (!stakes || typeof stakes !== 'string') return null;
  const slashMatch = /[$€£]?\s*([\d,]+(?:\.\d+)?)\s*\/\s*[$€£]?\s*([\d,]+(?:\.\d+)?)/.exec(stakes);
  if (slashMatch) {
    const bb = Number(slashMatch[2].replace(/,/g, ''));
    return Number.isFinite(bb) && bb > 0 ? bb : null;
  }
  return null;
}

function isHeroPlayerEntry(player, hand) {
  if (!player || typeof player !== 'object') return false;
  if (player.isHero === true) return true;
  const heroId = hand?.hero?.id ?? null;
  if (heroId !== null && heroId !== undefined && String(heroId) !== '') {
    const pId = player.id ?? player.userId ?? player.playerId ?? null;
    if (pId !== null && pId !== undefined && String(pId) === String(heroId)) return true;
  }
  const heroName = hand?.hero?.name ? String(hand.hero.name).trim() : '';
  if (heroName && player.name && String(player.name).trim() === heroName) return true;
  return false;
}

export function resolveSolverStackDepthBb(hand, point) {
  const explicitBbCandidates = [
    point?.effectiveStackBb,
    point?.effective_stack_bb,
    point?.stackDepthBb,
    point?.stack_depth_bb,
    hand?.effectiveStackBb,
    hand?.effective_stack_bb,
    hand?.effective_stack_bb_at_deal,
    hand?.hero?.effectiveStackBb,
    hand?.hero?.effective_stack_bb,
    hand?.hero?.effective_stack_bb_at_deal,
    hand?.hero_effective_stack_bb,
  ];
  for (const c of explicitBbCandidates) {
    if (c !== null && c !== undefined && c !== '') {
      const num = Number(c);
      if (Number.isFinite(num) && num > 0) return num;
    }
  }

  const playersList = Array.isArray(hand?.players) ? hand.players : [];
  const heroFromPlayers = playersList.find(p => isHeroPlayerEntry(p, hand)) || null;
  const rawHeroStack = Number(
    hand?.hero?.stack
    ?? hand?.hero?.startingStack
    ?? heroFromPlayers?.stack
    ?? heroFromPlayers?.startingStack
    ?? heroFromPlayers?.chips
  );
  const heroStack = Number.isFinite(rawHeroStack) && rawHeroStack > 0 ? rawHeroStack : null;
  if (heroStack === null) return null;

  const villainStacks = playersList
    .filter(p => p && p !== heroFromPlayers && !isHeroPlayerEntry(p, hand))
    .map(p => Number(p?.stack ?? p?.startingStack ?? p?.chips))
    .filter(s => Number.isFinite(s) && s > 0);
  const effectiveRawStack = villainStacks.length > 0
    ? Math.min(heroStack, Math.max(...villainStacks))
    : heroStack;

  const isBbUnit = hand?.stackUnit === 'bb'
    || hand?.hero?.stackUnit === 'bb'
    || hand?.site === 'smarter-poker-club-arena'
    || String(hand?.id || '').startsWith('club-arena:');
  if (isBbUnit) {
    return effectiveRawStack;
  }

  const hasExplicitBbProp = (hand?.bigBlind !== undefined && hand?.bigBlind !== null && hand?.bigBlind !== '')
    || (hand?.big_blind !== undefined && hand?.big_blind !== null && hand?.big_blind !== '');
  const explicitBb = Number(hand?.bigBlind ?? hand?.big_blind);
  if (hasExplicitBbProp) {
    if (!Number.isFinite(explicitBb) || explicitBb <= 0) return null;
    return effectiveRawStack / explicitBb;
  }

  const stakesBb = parseBigBlindFromStakes(hand?.stakes ?? hand?.blindLevel);
  if (Number.isFinite(stakesBb) && stakesBb > 0) {
    return effectiveRawStack / stakesBb;
  }

  if (hand?.stackUnit === 'chips' || hand?.hero?.stackUnit === 'chips') {
    return null;
  }

  return effectiveRawStack;
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

function candidateV2GameTypes(hand, stackDepth) {
  const tableSize = Number(hand?.tableSize);
  const raw = hand?.format === 'cash'
    ? (tableSize === 2 ? ['hu_cash', 'postflop_complete'] : ['postflop_complete', 'hu_cash'])
    : (tableSize === 2
        ? ['mtt_hu_chipev', 'spin_hu_chipev', 'mtt_6max_chipev']
        : (tableSize === 3
            ? ['mtt_3max_chipev', 'spin_3max_chipev', 'mtt_6max_chipev']
            : (tableSize >= 7
                ? ['mtt_9max_chipev', 'mtt_6max_chipev']
                : ['mtt_6max_chipev', 'mtt_9max_chipev'])));
  return raw.filter(gt => V2_FAMILY_STACKS[gt]?.has(stackDepth));
}

function streetHashPrefix(street) {
  const s = String(street || '').toLowerCase();
  if (s === 'turn') return 'turn_';
  if (s === 'river') return 'river_';
  return '';
}

/**
 * Exact concrete-combo postflop match against `solved_spots_gold.strategy_matrix_v2`.
 * Strictly refuses untrusted legacy V1 rows, quarantined/unprovenanced rows,
 * non-matching boards/stacks/pots/nodes, or ambiguous sizings.
 */
export async function findSolvedSpotV2Match(db, hand, point) {
  if (!db || typeof db.from !== 'function') return null;
  const street = String(point?.street || '').toLowerCase();
  if (!['flop', 'turn', 'river'].includes(street)) return null;
  if (!['cash', 'tournament'].includes(hand?.format)) return null;

  const cIdx = comboIndex(point?.holeCards);
  if (cIdx < 0) return null;

  const normHole = point.holeCards.map(normalizeCard);
  const normBoard = (point.board || []).map(normalizeCard);
  if (normBoard.some(c => !c || normHole.includes(c))) return null;

  const stackDepth = nearestExactStack(resolveSolverStackDepthBb(hand, point), SOLVED_SPOT_STACKS);
  if (stackDepth === null) return null;

  const pos = String(point?.position || '').toUpperCase();
  if (!pos) return null;

  const boardStrings = exactBoardStrings(point.board);
  if (boardStrings.length === 0) return null;

  const gameTypes = candidateV2GameTypes(hand, stackDepth);
  if (gameTypes.length === 0) return null;

  const prefix = streetHashPrefix(street);
  const candidateHashes = [];
  for (const gt of gameTypes) {
    for (const b of boardStrings) {
      candidateHashes.push(`${prefix}${gt}_${pos}_${stackDepth}bb_${b}`);
    }
  }

  const rows = [];
  try {
    for (let offset = 0; offset < candidateHashes.length; offset += SCENARIO_HASH_BATCH_SIZE) {
      const batch = candidateHashes.slice(offset, offset + SCENARIO_HASH_BATCH_SIZE);
      const res = await db
        .from('solved_spots_gold')
        .select(V2_SOLVED_SPOT_PROJECTION)
        .in('scenario_hash', batch)
        .eq('quality_status', 'validated')
        .not('solved_v2_at', 'is', null)
        .not('strategy_matrix_v2', 'is', null)
        .limit(SCENARIO_HASH_BATCH_SIZE);
      if (res?.error) return null;
      if (Array.isArray(res?.data) && res.data.length > 0) {
        rows.push(...res.data);
      }
    }
  } catch (_) {
    return null;
  }

  const matchedCandidates = [];
  for (const row of rows) {
    const v2 = row?.strategy_matrix_v2;
    if (!v2 || typeof v2 !== 'object') continue;
    // Enforce BOTH relational solver provenance AND the canonical V2 matrix bridge.
    if (!customSolverProvenanceIsComplete(row)) continue;
    const bridged = selectTrustedSolverMatrix(row);
    if (!bridged || bridged.source !== 'pio_v2') continue;

    if (String(v2.street || '').toLowerCase() !== street) continue;
    if (String(v2.position || '').toUpperCase() !== pos) continue;
    if (!v2NodeMatchesPoint(v2, bridged, point)) continue;

    const villainExpected = String(v2.hero || '').toUpperCase() === 'IP'
      ? String(v2.oop_player || '').toUpperCase()
      : String(v2.ip_player || '').toUpperCase();
    if (point.villainPosition && villainExpected && String(point.villainPosition).toUpperCase() !== villainExpected) {
      continue;
    }

    // Compare against bridged.pot_bb (exact replayed current-node pot), NOT root v2.pot_bb.
    const nodePotBb = Number(bridged.pot_bb);
    const pointPot = Number(point?.potBeforeBB);
    if (!Number.isFinite(nodePotBb) || !Number.isFinite(pointPot) || Math.abs(nodePotBb - pointPot) > 0.5) {
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

    const selectedEntry = matchV2Action(actions, point, bridged);
    if (!selectedEntry) continue;

    const selectedObj = actionProbs.find(item => item.action === selectedEntry);
    if (!selectedObj) continue;

    const sortedByProb = [...actionProbs].sort((a, b) => b.prob - a.prob);
    const optimalObj = sortedByProb[0];
    // Canonical 0..100 percentage scale matching cacheTruthContract.mjs and NUMERIC(6,2).
    const selectedFrequency = +((selectedObj.prob / totalMass) * 100).toFixed(2);
    const optimalFrequency = +((optimalObj.prob / totalMass) * 100).toFixed(2);
    const isOptimal = selectedObj.action === optimalObj.action;

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
      spotType: `${street}_${String(v2.hero || '').toLowerCase()}_${point.nodeClass}`,
      villainPosition: villainExpected || null,
      solverSource: 'PIOSOLVER',
      solverAction: normalizeActionLabel(optimalObj.action.key || optimalObj.action.code, optimalObj.action, bridged),
      selectedFrequency,
      optimalFrequency,
      classification: classifyFromPercentFrequency(selectedFrequency, optimalFrequency, isOptimal),
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

function mapChartAction(cell, point, villainAction) {
  const played = String(point?.action || '').toLowerCase();
  const keys = Object.keys(cell || {});
  if (played === 'fold' && keys.includes('fold')) return 'fold';
  if (played === 'call' && keys.includes('call')) return 'call';
  if (played === 'allin') {
    if (keys.includes('push')) return 'push';
    // When BB faces an SB shove and calls all-in (shorter stack), Club Arena records 'all_in' -> 'allin'.
    if (villainAction === 'sb_push' && keys.includes('call')) return 'call';
    return null;
  }
  if ((played === 'raise' || played === 'bet') && keys.includes('raise')) {
    return 'raise';
  }
  return null;
}

function hasPriorPreflopCalls(point) {
  const prior = Array.isArray(point?.priorActions) ? point.priorActions : [];
  return prior.some(a => String(a?.action || '').toLowerCase() === 'call');
}

/**
 * Exact preflop push/fold chart match against `public.memory_charts_gold`.
 * Covers both Cash and Tournament short-stack spots (2..20bb, 25bb) when hero's
 * stack, position, and villain action match the chart's unique index exactly.
 * Treats missing hands in a valid non-empty sparse chart as pure folds (`{ fold: 1 }`).
 */
export async function findMemoryChartMatch(db, hand, point) {
  if (!db || typeof db.from !== 'function') return null;
  if (String(point?.street || '').toLowerCase() !== 'preflop') return null;
  if (!['cash', 'tournament'].includes(hand?.format)) return null;

  const notation = handClassNotation(point?.holeCards);
  if (!notation) return null;

  const pos = String(point?.position || '').toUpperCase();
  if (!['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'].includes(pos)) return null;

  const stackDepth = nearestExactStack(resolveSolverStackDepthBb(hand, point), MEMORY_CHART_STACKS);
  if (stackDepth === null) return null;

  // Reject limped or multiway pots — memory_charts_gold push/fold charts apply strictly
  // to unopened (`fold_to_hero`) or heads-up SB-shove (`sb_push`) spots.
  if (hasPriorPreflopCalls(point)) return null;

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

  const matrix = row?.hand_matrix;
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix) || Object.keys(matrix).length === 0) {
    return null;
  }

  // `memory_charts_gold.hand_matrix` is sparse by design (matching SolverPolicyService.js:931):
  // an omitted hand in a present, populated chart is a pure fold (`{ fold: 1 }`), not missing data.
  const rawCell = matrix[notation];
  let cell;
  if (rawCell === undefined || rawCell === null) {
    cell = villainAction === 'sb_push' ? { call: 0, fold: 1 } : { push: 0, fold: 1 };
  } else if (typeof rawCell === 'object' && !Array.isArray(rawCell)) {
    cell = rawCell;
  } else {
    return null;
  }

  const entries = Object.entries(cell)
    .map(([k, v]) => [String(k).toLowerCase(), Number(v)])
    .filter(([, v]) => Number.isFinite(v) && v >= -0.001 && v <= 1.001);
  const sum = entries.reduce((acc, [, v]) => acc + Math.max(0, v), 0);
  if (entries.length === 0 || sum < 0.98 || sum > 1.02) return null;

  const cellObj = Object.fromEntries(entries);
  const selectedKey = mapChartAction(cellObj, point, villainAction);
  if (!selectedKey) return null;

  const selectedVal = Math.max(0, Number(cellObj[selectedKey]) || 0);
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const [optKey, optVal] = sorted[0];
  // Canonical 0..100 percentage scale matching cacheTruthContract.mjs and NUMERIC(6,2).
  const selectedFrequency = +((selectedVal / sum) * 100).toFixed(2);
  const optimalFrequency = +((Math.max(0, optVal) / sum) * 100).toFixed(2);
  const isOptimal = selectedKey === optKey;

  return {
    questionId: `mcg:${row.chart_id}`,
    gameId: hand.format === 'tournament' ? 'mtt-001' : 'cash-001',
    spotType: `preflop_${villainAction}_${stackDepth}bb`,
    villainPosition: villainAction === 'sb_push' ? 'SB' : null,
    solverSource: 'MEMORY_CHARTS_GOLD',
    solverAction: normalizeActionLabel(optKey),
    selectedFrequency,
    optimalFrequency,
    classification: classifyFromPercentFrequency(selectedFrequency, optimalFrequency, isOptimal),
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
  BLUNDER_OPTIMAL_FREQUENCY_THRESHOLD,
  cardIndex,
  comboIndex,
  exactBoardStrings,
  deriveV2ActionSizingPct,
  classifyFromPercentFrequency,
  resolveSolverStackDepthBb,
  findSolvedSpotV2Match,
  findMemoryChartMatch,
  findDirectCorpusSolverMatch,
};
