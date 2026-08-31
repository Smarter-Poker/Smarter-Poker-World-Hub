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

/**
 * Solver chips per big blind in the v2 pipeline's output.
 *
 * Measured, not assumed: across 3000 v2 rows carrying a bet token, the only
 * two (pot_bb, chips) pairs are (7.0, 525) and (6.5, 488). 525/700 is exactly
 * 0.75 and 488/650 is 0.7508 -- two different pot sizes both resolving to the
 * canonical 75%-pot sizing, which pins the scale at 100.
 */
export const V2_CHIPS_PER_BB = 100;

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
export function deriveNodePotState(node, rootPotChips) {
  const root = Number(rootPotChips);
  if (!Number.isFinite(root) || root <= 0 || typeof node !== 'string' || !node.startsWith('r:0')) return null;
  const tokens = node.split(':').slice(2).filter(Boolean);
  const contributions = [0, 0];
  let actor = 0; // OOP acts first on every postflop street.
  let pot = root;
  for (const token of tokens) {
    if (/^[2-9TJQKA][cdhs]$/i.test(token)) {
      contributions[0] = 0;
      contributions[1] = 0;
      actor = 0;
      continue;
    }
    if (token === 'c') {
      const target = Math.max(...contributions);
      const delta = target - contributions[actor];
      if (delta < 0) return null;
      pot += delta;
      contributions[actor] = target;
      actor = 1 - actor;
      continue;
    }
    const aggressive = token.match(/^[br](\d+)$/i);
    if (aggressive) {
      const target = Number(aggressive[1]);
      const delta = target - contributions[actor];
      if (!Number.isFinite(target) || target <= 0 || delta <= 0) return null;
      pot += delta;
      contributions[actor] = target;
      actor = 1 - actor;
      continue;
    }
    // Fold/all-in tokens terminate a line or omit the exact amount; neither
    // can describe a later decision node without additional state.
    return null;
  }
  const facing = Math.max(...contributions) - contributions[actor];
  if (!Number.isFinite(pot) || pot <= 0 || facing < 0) return null;
  return { potChips: pot, facingBetChips: facing, actor };
}

export function v2ToAppMatrix(v2) {
  if (!v2 || !v2.frequencies) return null;
  const codes = (Array.isArray(v2.actions) && v2.actions.length)
    ? v2.actions.map((x) => (typeof x === 'string' ? x : x.code))
    : Object.keys(v2.frequencies);
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
      if (!Number.isFinite(v) || v < 0 || v > 1.02) return null;
      per[c] = v; total += v;
    }
    if (total <= 0.001) continue;
    if (Math.abs(total - 1) > 0.05 || !Number.isFinite(evs[idx])) return null;
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
  const state = deriveNodePotState(v2.node, rootPotBb * V2_CHIPS_PER_BB);
  if (!state) return null;

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
    node_state_exact: true,
    source: 'pio_v2',
  };
}

export default v2ToAppMatrix;
