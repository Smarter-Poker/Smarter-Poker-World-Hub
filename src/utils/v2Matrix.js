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
 * are skipped). Output is normalized (sums to 1 per class) and flagged
 * __sanitized so the engine's sanitizer passes it through untouched.
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

export function v2ToAppMatrix(v2) {
  if (!v2 || !v2.frequencies) return null;
  const codes = (Array.isArray(v2.actions) && v2.actions.length)
    ? v2.actions.map((x) => (typeof x === 'string' ? x : x.code))
    : Object.keys(v2.frequencies);
  const map = comboClassMap();
  const evs = Array.isArray(v2.hand_evs_bb) ? v2.hand_evs_bb : [];
  const acc = {};
  for (let idx = 0; idx < 1326; idx++) {
    let total = 0;
    const per = {};
    for (const c of codes) {
      const arr = v2.frequencies[c];
      const v = arr && typeof arr[idx] === 'number' ? arr[idx] : 0;
      per[c] = v; total += v;
    }
    if (total <= 0.001) continue;
    const cls = map[idx];
    if (!cls) continue;
    if (!acc[cls]) { acc[cls] = { __s: 0, __ev: 0, __evn: 0 }; codes.forEach((c) => (acc[cls][c] = 0)); }
    codes.forEach((c) => (acc[cls][c] += per[c]));
    acc[cls].__s += total;
    const ev = evs[idx];
    if (typeof ev === 'number') { acc[cls].__ev += ev; acc[cls].__evn += 1; }
  }
  const frequencies = {};
  codes.forEach((c) => (frequencies[c] = {}));
  const hand_evs = {};
  Object.keys(acc).forEach((cls) => {
    const s = acc[cls].__s || 1;
    codes.forEach((c) => { frequencies[c][cls] = acc[cls][c] / s; });
    if (acc[cls].__evn) hand_evs[cls] = acc[cls].__ev / acc[cls].__evn;
  });
  // ── The pot, and why it needs two keys and a flag ──────────────────────
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
  //    node. A path like `r:0:c:b488:c:7c:c` is a turn node whose pot is much
  //    larger than the root's. Rebasing a deep bet against the root pot would
  //    overstate the bet as a fraction of pot -- a wrong number on the felt,
  //    which is worse than a blank badge. `pot_is_root` tells the consumer to
  //    use this denominator ONLY when the bet is the first action after the
  //    root, and to decline otherwise.
  const potBb = Number(v2.pot_bb);
  const hasPot = Number.isFinite(potBb) && potBb > 0;

  return {
    actions: codes, frequencies, hand_evs,
    ev_ip: v2.ev_ip_bb, ev_oop: v2.ev_oop_bb,
    board: v2.board, node: v2.node, street: v2.street,
    ...(hasPot ? { pot: potBb * V2_CHIPS_PER_BB, pot_bb: potBb, pot_is_root: true } : {}),
    source: 'pio_v2', __sanitized: true,
  };
}

export default v2ToAppMatrix;
