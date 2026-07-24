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
  return {
    actions: codes, frequencies, hand_evs,
    ev_ip: v2.ev_ip_bb, ev_oop: v2.ev_oop_bb,
    board: v2.board, node: v2.node, street: v2.street,
    source: 'pio_v2', __sanitized: true,
  };
}

export default v2ToAppMatrix;
