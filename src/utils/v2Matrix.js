/**
 * v2Matrix.js — bridge the rebuilt PioSOLVER pipeline's strategy_matrix_v2
 * (per-combo: 1326 arrays keyed by action code) into the legacy engine shape
 * the training engine + solutions browser consume:
 *   { actions:[code], frequencies:{code:{handClass:freq}}, hand_evs:{handClass:ev} }
 *
 * Combo map matches the harvest exactly: card = rank*4 + suit
 * (rank 2=0..A=12; suits c,d,h,s = 0..3); combo index = b*(b-1)/2 + a for card
 * indices a<b (2c2d=0 .. AhAs=1325). 1326 combos aggregate into 169 classes
 * (mean over live combos; board-dead / out-of-range combos have zero mass and
 * are skipped). Output is normalized (sums to 1 per class). The engine
 * records the returned object in a process-local WeakSet so an
 * untrusted JSON property can never impersonate a completed validation.
 */
const RANKS = '23456789TJQKA';
const V2_CARD_PATTERN = /^[2-9TJQKA][cdhs]$/;
const V2_STREET_CARD_COUNT = Object.freeze({ flop: 3, turn: 4, river: 5 });

/**
 * Solver chips per big blind in the v2 pipeline's output.
 *
 * Measured, not assumed: across 3000 v2 rows carrying a bet token, the only
 * two (pot_bb, chips) pairs are (7.0, 525) and (6.5, 488). 525/700 is exactly
 * 0.75 and 488/650 is 0.7508 -- two different pot sizes both resolving to the
 * canonical 75%-pot sizing, which pins the scale at 100.
 */
export const V2_CHIPS_PER_BB = 100;
export const V2_COMBO_ORDER = 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325';
export const V2_SOURCE_COMBO_ORDER_SCHEMA = 'piosolver.show_hand_order.v1';
export const V2_ACTION_SIZE_SEMANTICS = 'cumulative_postflop_contribution_target';
const V2_SHA256_PATTERN = /^[0-9a-f]{64}$/;
const V2_POSITION_PATTERN = /^(?:UTG|UTG\+1|UTG\+2|UTG1|UTG2|MP|MP\+1|MP\+2|MP1|MP2|LJ|HJ|CO|BTN|SB|BB)$/;
// Harvested values are rounded to six decimals and there are at most sixteen
// actions, so worst-case independent rounding drift is 0.000008. Anything
// outside ±0.00001 is corruption rather than serialization noise.
export const V2_FREQUENCY_SUM_TOLERANCE = 0.00001;

/** PioSOLVER 3 set_rake is exactly: fraction-of-final-pot, maximum chips. */
export function isExactPioRake(value) {
  if (typeof value !== 'string' || value !== value.trim()) return false;
  const parts = value.split(' ');
  const canonicalFraction = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
  const canonicalInteger = /^(?:0|[1-9]\d*)$/;
  if (parts.length !== 2 || !canonicalFraction.test(parts[0])
      || !canonicalInteger.test(parts[1])) return false;
  const fraction = Number(parts[0]);
  const capChips = Number(parts[1]);
  return Number.isFinite(fraction) && fraction >= 0 && fraction <= 1
    && Number.isFinite(capChips) && capChips >= 0;
}

function sealedV2Checksum(value) {
  return typeof value === 'string'
    && V2_SHA256_PATTERN.test(value)
    && value !== '0'.repeat(64);
}

/**
 * Validate the checksummed solver-input and convergence envelope embedded in
 * every newly admitted V2 artifact. The database RPC independently binds
 * these values to one active authority row; this local mirror prevents a
 * fixture, stale cache, or alternate caller from upgrading an unsealed JSON
 * blob merely because its frequency arrays happen to be well shaped.
 */
export function v2ArtifactEnvelopeIsExact(v2) {
  if (!v2 || typeof v2 !== 'object' || Array.isArray(v2)) return false;
  const rootPotBb = v2.pot_bb;
  const effectiveStackBb = v2.eff_stack_bb;
  const exploitabilityPct = v2.exploitability_pct;
  const convergence = v2.convergence;
  const numeric = (value) => typeof value === 'number' && Number.isFinite(value);
  if (v2.combo_order !== V2_COMBO_ORDER
    || v2.range_combo_order !== V2_COMBO_ORDER
    || v2.source_combo_order_schema !== V2_SOURCE_COMBO_ORDER_SCHEMA
    || !sealedV2Checksum(v2.source_combo_order_sha256)
    || !sealedV2Checksum(v2.oop_range_checksum)
    || !sealedV2Checksum(v2.ip_range_checksum)
    || !sealedV2Checksum(v2.training_game_contracts_sha256)
    || v2.solver !== 'PioSOLVER'
    || !isExactPioRake(v2.rake)
    || typeof v2.tree_geometry !== 'string'
    || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(v2.tree_geometry)
    || !numeric(rootPotBb) || rootPotBb <= 0
    || !numeric(effectiveStackBb) || effectiveStackBb <= 0
    || !numeric(exploitabilityPct) || exploitabilityPct < 0
    || !Array.isArray(v2.board)
    || !Object.hasOwn(V2_STREET_CARD_COUNT, v2.street)
    || !V2_POSITION_PATTERN.test(String(v2.position || ''))
    || !V2_POSITION_PATTERN.test(String(v2.oop_player || ''))
    || !V2_POSITION_PATTERN.test(String(v2.ip_player || ''))
    || v2.oop_player === v2.ip_player
    || !['OOP', 'IP'].includes(v2.hero)
    || v2.position !== (v2.hero === 'OOP' ? v2.oop_player : v2.ip_player)
    || !convergence || typeof convergence !== 'object' || Array.isArray(convergence)
    || convergence.schema !== 'piosolver.calc-results.v1'
    || convergence.source_command !== 'calc_results') return false;

  const accuracyFraction = convergence.accuracy_fraction;
  const startingPotChips = convergence.starting_pot_chips;
  const achievedChips = convergence.achieved_exploitability_chips;
  const achievedFraction = convergence.achieved_exploitability_fraction;
  return numeric(accuracyFraction) && accuracyFraction > 0 && accuracyFraction <= 0.01
    && numeric(startingPotChips) && startingPotChips > 0
    && Math.abs(startingPotChips - rootPotBb * V2_CHIPS_PER_BB) <= 0.000001
    && numeric(achievedChips) && achievedChips >= 0
    && numeric(achievedFraction) && achievedFraction >= 0
    && Math.abs(achievedFraction - achievedChips / startingPotChips) <= 0.000000001
    && achievedFraction <= accuracyFraction + 0.000000001
    && Math.abs(exploitabilityPct - achievedFraction * 100) <= 0.0000001;
}

function canonicalNodeTokens(node) {
  if (typeof node !== 'string') return null;
  const parts = node.split(':');
  if (parts.length < 2 || parts.length > 64
    || parts[0] !== 'r' || parts[1] !== '0'
    || parts.some((part) => part.length === 0)) return null;
  return parts.slice(2);
}

function canonicalBoardCards(board, street) {
  const expectedCount = V2_STREET_CARD_COUNT[street];
  if (!expectedCount) return null;
  const cards = Array.isArray(board)
    ? [...board]
    : (typeof board === 'string' && board.length === expectedCount * 2
      ? Array.from({ length: expectedCount }, (_, index) => board.slice(index * 2, index * 2 + 2))
      : null);
  if (!cards || cards.length !== expectedCount
    || cards.some((card) => typeof card !== 'string' || !V2_CARD_PATTERN.test(card))
    || new Set(cards).size !== cards.length) return null;
  return cards;
}

function v2BoardStreetRunoutIsExact(v2, nodeTokens) {
  const boardCards = canonicalBoardCards(v2?.board, v2?.street);
  if (!boardCards || !Array.isArray(nodeTokens)) return false;
  const runoutCards = nodeTokens.filter((token) => V2_CARD_PATTERN.test(token));
  const maximumRunoutCards = boardCards.length - V2_STREET_CARD_COUNT.flop;
  // A solve may load the complete board at r:0. When its node exposes runout
  // cards, however, it must expose the complete exact Turn/River suffix in order.
  // This binds the replayed betting state to the matrix identity even for
  // local fixtures and other callers that do not have a relational row wrapper.
  return (runoutCards.length === 0 || runoutCards.length === maximumRunoutCards)
    && runoutCards.every((card, index) => (
      card === boardCards[boardCards.length - runoutCards.length + index]
    ));
}

function cardsToClass(a, b) {
  let r1 = Math.floor(b / 4), s1 = b % 4;
  let r2 = Math.floor(a / 4), s2 = a % 4;
  if (r1 < r2) { const tr = r1; r1 = r2; r2 = tr; const ts = s1; s1 = s2; s2 = ts; }
  const R1 = RANKS[r1], R2 = RANKS[r2];
  if (R1 === R2) return R1 + R2;
  return R1 + R2 + (s1 === s2 ? 's' : 'o');
}

let _map = null;
function comboClassMap() {
  if (_map) return _map;
  _map = new Array(1326);
  for (let b = 1; b < 52; b++) for (let a = 0; a < b; a++) _map[(b * (b - 1)) / 2 + a] = cardsToClass(a, b);
  return _map;
}

/** Reconstruct the exact pot and amount currently facing hero from a HU UPI path. */
export function deriveNodePotState(node, rootPotChips, effectiveStackChips = null) {
  const root = Number(rootPotChips);
  const stack = effectiveStackChips === null || effectiveStackChips === undefined
    ? null
    : Number(effectiveStackChips);
  if (!Number.isFinite(root) || root <= 0) return null;
  if (stack !== null && (!Number.isFinite(stack) || stack <= 0)) return null;
  const tokens = canonicalNodeTokens(node);
  if (!tokens) return null;
  // Pio bNNN tokens are cumulative postflop contribution targets. They do not
  // reset to zero when a turn or river card is dealt. Keep both players'
  // cumulative contributions and separately remember the matched contribution
  // at the start of the current street. This lets consumers distinguish:
  //   target     = the raw Pio cumulative target,
  //   raise-to   = target minus the street baseline, and
  //   increment  = target minus the acting player's current contribution.
  // Official UPI contract: https://piosolver.com/docs/upi/ — NodeID bets are
  // "always the cumulative amount invested by the player so far". The
  // add_line example in https://piosolver.com/docs/upi/commands/ likewise
  // encodes a 60-chip Turn bet as 90 after 30 was invested on the Flop.
  const contributions = [0, 0];
  let streetBaseline = 0;
  let actor = 0; // OOP acts first on every postflop street.
  let pot = root;
  let checksThisStreet = 0;
  let lastFullRaiseSize = 0;
  let roundClosed = false;
  let allInOutstanding = false;
  let terminal = false;
  const runoutCards = new Set();
  for (const token of tokens) {
    if (terminal) return null;
    if (V2_CARD_PATTERN.test(token)) {
      // Equal contributions alone do not close a street: r:0:Ts is not a
      // legal runout. A board card may appear only after check-check or a
      // non-all-in bet/raise has been called.
      if (!roundClosed || allInOutstanding || runoutCards.has(token)) return null;
      runoutCards.add(token);
      streetBaseline = contributions[0];
      actor = 0;
      checksThisStreet = 0;
      lastFullRaiseSize = 0;
      roundClosed = false;
      continue;
    }
    if (roundClosed) return null;
    if (token === 'c') {
      const target = Math.max(...contributions);
      const delta = target - contributions[actor];
      if (delta < 0) return null;
      pot += delta;
      contributions[actor] = target;
      actor = 1 - actor;
      if (delta > 0) {
        roundClosed = true;
        terminal = allInOutstanding;
      } else {
        checksThisStreet += 1;
        if (checksThisStreet >= 2) roundClosed = true;
      }
      continue;
    }
    // Pio's NodeID grammar uses `b` for both an opening bet and a raise;
    // whether it is presented as Bet or Raise is derived from the exact
    // contribution state. `rNNN` is not a Pio aggressive-action token.
    const aggressive = token.match(/^b(\d+)$/);
    if (aggressive) {
      const target = Number(aggressive[1]);
      const delta = target - contributions[actor];
      const amountFaced = Math.max(...contributions);
      const facingBeforeAction = amountFaced - contributions[actor];
      const raiseIncrement = target - amountFaced;
      const isAllIn = stack !== null && Math.abs(target - stack) <= 1e-9;
      // A wager or raise must move the contribution target beyond the amount
      // already faced. Merely adding chips relative to the actor's own smaller
      // contribution (b500 -> b200) is neither a call nor a legal raise.
      // A non-all-in re-raise must also be at least one prior full raise. Pio
      // may encode a short all-in target, but it cannot encode a freely chosen
      // under-minimum raise.
      if (!Number.isSafeInteger(target)
        || target <= amountFaced || delta <= 0
        || (lastFullRaiseSize === 0
          && raiseIncrement < V2_CHIPS_PER_BB
          && !isAllIn)
        || (lastFullRaiseSize > 0 && raiseIncrement < lastFullRaiseSize && !isAllIn)
        || (stack !== null && target > stack)) return null;
      pot += delta;
      contributions[actor] = target;
      actor = 1 - actor;
      checksThisStreet = 0;
      if (raiseIncrement >= lastFullRaiseSize) lastFullRaiseSize = raiseIncrement;
      allInOutstanding = isAllIn;
      continue;
    }
    // Fold/all-in tokens terminate a line or omit the exact amount; neither
    // can describe a later decision node without additional state.
    return null;
  }
  // A closed betting round or an all-in call is not a decision node. It may be
  // traversed only by a legal next runout token, and an all-in call has no
  // further player action at all.
  if (roundClosed || terminal) return null;
  const facing = Math.max(...contributions) - contributions[actor];
  if (!Number.isFinite(pot) || pot <= 0 || facing < 0) return null;
  const opponent = 1 - actor;
  return {
    potChips: pot,
    facingBetChips: facing,
    actor,
    actorContributionChips: contributions[actor],
    opponentContributionChips: contributions[opponent],
    streetBaselineChips: streetBaseline,
    actorStreetContributionChips: contributions[actor] - streetBaseline,
    opponentStreetContributionChips: contributions[opponent] - streetBaseline,
    lastFullRaiseSizeChips: lastFullRaiseSize,
    wagerIsAllIn: allInOutstanding,
    raiseReopened: !allInOutstanding,
  };
}

/**
 * Validate the actions exported for the decision reached by `deriveNodePotState`.
 *
 * Replaying the parent node is not enough: a well-shaped artifact can still
 * advertise Fold at a check node, or a cumulative raise target below the wager
 * hero is facing.  This is the shared JavaScript admission boundary used by
 * every solver-policy consumer; callers must never reconstruct legality from a
 * label or from whether the source token begins with `b` versus `r`.
 */
export function v2OutgoingActionsAreLegal(v2, codes, state, effectiveStackChips) {
  if (!v2 || !Array.isArray(codes) || codes.length < 2 || !state) return false;
  const stack = Number(effectiveStackChips);
  if (!Number.isFinite(stack) || stack <= 0) return false;

  const frequencyCodes = Object.keys(v2.frequencies || {});
  if (frequencyCodes.length !== codes.length
    || new Set(codes).size !== codes.length
    || codes.some((code) => !frequencyCodes.includes(code))) return false;

  const facing = Number(state.facingBetChips);
  const actorContribution = Number(state.actorContributionChips);
  const opponentContribution = Number(state.opponentContributionChips);
  const lastFullRaiseSize = Number(state.lastFullRaiseSizeChips);
  if (!Number.isFinite(facing) || facing < 0
    || !Number.isFinite(actorContribution) || actorContribution < 0
    || !Number.isFinite(opponentContribution) || opponentContribution < 0
    || !Number.isFinite(lastFullRaiseSize) || lastFullRaiseSize < 0
    || typeof state.wagerIsAllIn !== 'boolean'
    || typeof state.raiseReopened !== 'boolean') return false;

  const amountFaced = Math.max(actorContribution, opponentContribution);
  // Check/Call is the mandatory passive branch at every nonterminal Pio
  // decision. A player facing a live wager must also be offered Fold. Omitting
  // either branch makes the exported strategy incomplete and unsafe to teach.
  if (!codes.includes('c') || (facing > 0 && !codes.includes('f'))) return false;
  const targets = new Set();
  for (const code of codes) {
    if (typeof code !== 'string' || code !== code.toLowerCase()) return false;
    if (code === 'c') continue; // Exact state owns whether this means Check or Call.
    if (code === 'f') {
      if (facing <= 0) return false;
      continue;
    }

    const aggressive = code.match(/^b([1-9]\d*)$/);
    if (!aggressive) return false;
    const target = Number(aggressive[1]);
    const isAllIn = target === stack;
    const actorIncrement = target - actorContribution;
    const raiseIncrement = target - amountFaced;
    if (!Number.isSafeInteger(target)
      || targets.has(target)
      || target <= amountFaced
      || target > stack
      || actorIncrement <= 0) return false;

    // A short all-in does not reopen betting. In heads-up postflop geometry it
    // also consumes the opponent's effective stack, so only Fold/Call remain;
    // keep the explicit state gate instead of relying on target<=stack alone.
    if (facing > 0 && (!state.raiseReopened || state.wagerIsAllIn)) return false;

    // A postflop opening wager is at least one big blind unless the actor's
    // remaining effective stack is shorter. Facing a wager, the minimum full
    // raise repeats the last full raise size; a shorter raise is legal only
    // when it consumes the exact effective stack.
    if (facing > 0) {
      if (raiseIncrement < lastFullRaiseSize && !isAllIn) return false;
    } else if (actorIncrement < V2_CHIPS_PER_BB && !isAllIn) {
      return false;
    }
    targets.add(target);
  }
  return true;
}

export function v2ToAppMatrix(v2) {
  // A 1,326-value vector has no physical-card meaning without its ordering.
  // Refuse absent, legacy, or differently ordered arrays rather than silently
  // assigning one combo's strategy and EV to another pair of cards.
  if (!v2ArtifactEnvelopeIsExact(v2) || !v2.frequencies) return null;
  const sourceActions = Array.isArray(v2.actions) ? v2.actions : [];
  // New harvests publish the meaning of `size_chips` explicitly. Historical
  // rows predate that marker, so absence remains readable, but a row that
  // explicitly declares any other meaning must never be reinterpreted as a
  // cumulative Pio target. The numeric compatibility field must also agree
  // exactly with the raw bNNN token when both are present.
  if (sourceActions.some((entry) => {
    if (!entry || typeof entry === 'string') return false;
    const match = String(entry.code || '').match(/^b(\d+(?:\.\d+)?)$/);
    if (!match) return false;
    const metadataChips = Number(entry.size_chips);
    return (entry.size_semantics != null
        && entry.size_semantics !== V2_ACTION_SIZE_SEMANTICS)
      || (entry.size_chips != null
        && (!Number.isFinite(metadataChips) || Math.abs(metadataChips - Number(match[1])) > 1e-9));
  })) return null;
  const codes = (sourceActions.length)
    ? sourceActions.map((x) => (typeof x === 'string' ? x : x.code))
    : Object.keys(v2.frequencies);
  const nodeTokens = canonicalNodeTokens(v2.node);
  if (!nodeTokens || !v2BoardStreetRunoutIsExact(v2, nodeTokens)) return null;
  const map = comboClassMap();
  const evs = Array.isArray(v2.hand_evs_bb) ? v2.hand_evs_bb : [];
  if (codes.length < 2 || evs.length !== 1326) return null;
  if (codes.some((code) => !Array.isArray(v2.frequencies[code])
    || v2.frequencies[code].length !== 1326)) return null;
  const acc = {};
  for (let idx = 0; idx < 1326; idx++) {
    let total = 0;
    const per = {};
    for (const c of codes) {
      const arr = v2.frequencies[c];
      const v = arr[idx];
      if (!Number.isFinite(v) || v < 0 || v > 1) return null;
      per[c] = v; total += v;
    }
    if (total <= 0.001) continue;
    const floatingPointSlack = Number.EPSILON * codes.length;
    if (Math.abs(total - 1) > V2_FREQUENCY_SUM_TOLERANCE + floatingPointSlack
      || !Number.isFinite(evs[idx])) return null;
    const cls = map[idx];
    if (!cls) continue;
    if (!acc[cls]) { acc[cls] = { __s: 0, __ev: 0, __evn: 0 }; codes.forEach((c) => (acc[cls][c] = 0)); }
    codes.forEach((c) => (acc[cls][c] += per[c]));
    acc[cls].__s += total;
    const ev = evs[idx];
    acc[cls].__ev += ev; acc[cls].__evn += 1;
  }
  if (Object.keys(acc).length === 0) return null;
  const frequencies = {};
  codes.forEach((c) => (frequencies[c] = {}));
  const hand_evs = {};
  Object.keys(acc).forEach((cls) => {
    const s = acc[cls].__s || 1;
    codes.forEach((c) => { frequencies[c][cls] = acc[cls][c] / s; });
    if (acc[cls].__evn) hand_evs[cls] = acc[cls].__ev / acc[cls].__evn;
  });
  // ── Exact current-node pot reconstruction ─────────────────────────────
  //
  // Every v2 row carries `pot_bb` (measured 2026-08-15: 3000/3000 rows), and
  // this bridge used to drop it. That mattered because
  // DeterministicGTOEngine._villainBetBB rebases the solver's bet onto the
  // felt's pot as `chips / nodePot * feltPot`, and reads that denominator off
  // `strategy_matrix.pot` -- which the bridge never supplied. So the chip
  // badge could not have rendered from a v2 row even once the machines start
  // harvesting facing-bet nodes.
  //
  // TWO UNIT HAZARDS, both measured rather than assumed:
  //
  // 1. `pot_bb` is in BIG BLINDS; the node path's bet token is in SOLVER
  //    CHIPS. Dividing one by the other directly is meaningless. The scale is
  //    100 chips to the big blind, confirmed across 3000 rows at two
  //    independent pot sizes: pot_bb 7.0 with b525 is exactly 75% of pot, and
  //    pot_bb 6.5 with b488 is 75.1%. Two different pots landing on the same
  //    canonical sizing is not a coincidence. `pot` below is therefore
  //    pot_bb * 100, in the same unit as the node path.
  //
  // 2. `pot_bb` is the pot at the ROOT of the solve (r:0), NOT at an arbitrary
  //    node. Replaying the UPI path is therefore mandatory for a turn/river
  //    row. If a token cannot be interpreted exactly, reject the whole bridge.
  const rootPotBb = Number(v2.pot_bb);
  const effectiveStackBb = Number(v2.eff_stack_bb);
  if (!Number.isFinite(effectiveStackBb) || effectiveStackBb <= 0) return null;
  const state = deriveNodePotState(
    v2.node,
    rootPotBb * V2_CHIPS_PER_BB,
    effectiveStackBb * V2_CHIPS_PER_BB,
  );
  if (!state) return null;
  if (v2.hero !== (state.actor === 0 ? 'OOP' : 'IP')) return null;
  if (!v2OutgoingActionsAreLegal(
    v2,
    codes,
    state,
    effectiveStackBb * V2_CHIPS_PER_BB,
  )) return null;

  return {
    actions: codes, frequencies, hand_evs,
    ev_ip: v2.ev_ip_bb, ev_oop: v2.ev_oop_bb,
    board: v2.board, node: v2.node, street: v2.street,
    hero: v2.hero,
    position: v2.position,
    oop_player: v2.oop_player,
    ip_player: v2.ip_player,
    eff_stack_bb: v2.eff_stack_bb,
    exploitability_pct: v2.exploitability_pct,
    pot: state.potChips,
    pot_bb: state.potChips / V2_CHIPS_PER_BB,
    root_pot_bb: rootPotBb,
    pot_is_root: state.potChips === rootPotBb * V2_CHIPS_PER_BB,
    facing_bet_bb: state.facingBetChips / V2_CHIPS_PER_BB,
    node_actor: state.actor,
    actor_contribution_chips: state.actorContributionChips,
    opponent_contribution_chips: state.opponentContributionChips,
    street_baseline_chips: state.streetBaselineChips,
    actor_contribution_bb: state.actorContributionChips / V2_CHIPS_PER_BB,
    opponent_contribution_bb: state.opponentContributionChips / V2_CHIPS_PER_BB,
    street_baseline_bb: state.streetBaselineChips / V2_CHIPS_PER_BB,
    actor_street_contribution_bb: state.actorStreetContributionChips / V2_CHIPS_PER_BB,
    opponent_street_contribution_bb: state.opponentStreetContributionChips / V2_CHIPS_PER_BB,
    last_full_raise_size_chips: state.lastFullRaiseSizeChips,
    last_full_raise_size_bb: state.lastFullRaiseSizeChips / V2_CHIPS_PER_BB,
    wager_is_all_in: state.wagerIsAllIn,
    raise_reopened: state.raiseReopened,
    node_state_exact: true,
    source: 'pio_v2',
  };
}

export default v2ToAppMatrix;
