#!/usr/bin/env node
/**
 * Exact short deck (6+ Hold'em, 36 cards) and 52-card enumerations behind
 * the figures in src/lib/research/shortDeckFacts.mjs.
 *
 *   node scripts/research/short-deck-math.mjs
 *
 * prints every figure; __tests__/the-research-figures-are-real.law.test.mjs
 * imports these functions and recomputes the fast ones on every run. The
 * previous report text ("1.96% Flush Vs 3.26% Full House", "AA 54.4% Vs JTs")
 * failed this enumeration and was replaced by its output.
 */
export function choose(n, k) {
  let r = 1;
  for (let i = 0; i < k; i += 1) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

export const SHORT_RANKS = [6, 7, 8, 9, 10, 11, 12, 13, 14];
export const FULL_RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function buildDeck(ranks) {
  const d = [];
  for (const r of ranks) for (let s = 0; s < 4; s += 1) d.push(r * 4 + s);
  return d;
}

export const card = (rank, suit) => rank * 4 + suit;

function straightHigh(rankSet, short) {
  // In short deck the ace plays low as A-6-7-8-9.
  const seq = short ? [14, 6, 7, 8, 9, 10, 11, 12, 13, 14] : [14, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  let best = 0;
  let run = 0;
  for (let i = 0; i < seq.length; i += 1) {
    if (rankSet.has(seq[i])) {
      run += 1;
      if (run >= 5) best = i === 4 ? (short ? 9 : 5) : seq[i];
    } else run = 0;
  }
  return best;
}

function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Best hand value. Short deck: flush beats full house, and
 * tripsBeatStraight picks between the two published 6+ rule sets.
 */
export function evaluate(cards, short, tripsBeatStraight = false) {
  const rc = new Map();
  const sc = [[], [], [], []];
  for (const c of cards) {
    const r = c >> 2;
    rc.set(r, (rc.get(r) || 0) + 1);
    sc[c & 3].push(r);
  }
  const order = short
    ? tripsBeatStraight
      ? { SF: 9, Q: 8, F: 7, FH: 6, T: 5, S: 4, TP: 3, P: 2, H: 1 }
      : { SF: 9, Q: 8, F: 7, FH: 6, S: 5, T: 4, TP: 3, P: 2, H: 1 }
    : { SF: 9, Q: 8, FH: 7, F: 6, S: 5, T: 4, TP: 3, P: 2, H: 1 };
  let sf = 0;
  let flushSuit = -1;
  for (let s = 0; s < 4; s += 1) {
    if (sc[s].length >= 5) {
      flushSuit = s;
      sf = Math.max(sf, straightHigh(new Set(sc[s]), short));
    }
  }
  const groups = [...rc.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const st = straightHigh(new Set(rc.keys()), short);
  const kick = (ex, n) => [...rc.keys()].filter((r) => !ex.includes(r)).sort((a, b) => b - a).slice(0, n);
  const cands = [[order.H, ...kick([], 5)]];
  if (sf) cands.push([order.SF, sf]);
  if (groups[0][1] === 4) cands.push([order.Q, groups[0][0], ...kick([groups[0][0]], 1)]);
  if (flushSuit >= 0) cands.push([order.F, ...sc[flushSuit].sort((a, b) => b - a).slice(0, 5)]);
  if (groups[0][1] === 3 && groups.length > 1 && groups[1][1] >= 2) cands.push([order.FH, groups[0][0], groups[1][0]]);
  if (st) cands.push([order.S, st]);
  if (groups[0][1] === 3) cands.push([order.T, groups[0][0], ...kick([groups[0][0]], 2)]);
  if (groups[0][1] === 2 && groups[1] && groups[1][1] === 2) {
    cands.push([order.TP, groups[0][0], groups[1][0], ...kick([groups[0][0], groups[1][0]], 1)]);
  }
  if (groups[0][1] === 2) cands.push([order.P, groups[0][0], ...kick([groups[0][0]], 3)]);
  cands.sort(compare);
  return cands[cands.length - 1];
}

export function* combinations(arr, k, start = 0, cur = []) {
  if (cur.length === k) {
    yield cur;
    return;
  }
  for (let i = start; i <= arr.length - (k - cur.length); i += 1) {
    cur.push(arr[i]);
    yield* combinations(arr, k, i + 1, cur);
    cur.pop();
  }
}

/** Exact all-in preflop equity of hand a against hand b over every board. */
export function exactEquity(a, b, ranks, short, tripsBeatStraight = false) {
  const deck = buildDeck(ranks).filter((c) => !a.includes(c) && !b.includes(c));
  let win = 0;
  let tie = 0;
  let n = 0;
  for (const board of combinations(deck, 5)) {
    const x = compare(evaluate([...a, ...board], short, tripsBeatStraight), evaluate([...b, ...board], short, tripsBeatStraight));
    if (x > 0) win += 1;
    else if (x === 0) tie += 1;
    n += 1;
  }
  return { equity: (win + tie / 2) / n, boards: n };
}

/** Seven-card category counts over every 7-card set of the 36-card deck. */
export function shortDeckSevenCardCounts() {
  let n = 0;
  let flush = 0;
  let fullHouse = 0;
  for (const h of combinations(buildDeck(SHORT_RANKS), 7)) {
    n += 1;
    const rc = new Map();
    const sc = [0, 0, 0, 0];
    for (const c of h) {
      rc.set(c >> 2, (rc.get(c >> 2) || 0) + 1);
      sc[c & 3] += 1;
    }
    const v = [...rc.values()].sort((a, b) => b - a);
    const fs = sc.findIndex((x) => x >= 5);
    let straightFlush = false;
    if (fs >= 0) straightFlush = straightHigh(new Set(h.filter((c) => (c & 3) === fs).map((c) => c >> 2)), true) > 0;
    if (straightFlush || v[0] === 4) continue;
    if (fs >= 0) flush += 1;
    else if (v[0] === 3 && v[1] >= 2) fullHouse += 1;
  }
  return { hands: n, flush, fullHouse };
}

/** Probability that at least one of `outs` arrives in `cards` draws from `unseen`. */
export function hitProbability(outs, unseen, cards) {
  return 1 - choose(unseen - outs, cards) / choose(unseen, cards);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const AA = [card(14, 0), card(14, 1)];
  const JTs = [card(11, 2), card(10, 2)];
  console.log({
    shortCombos: choose(36, 2),
    fullCombos: choose(52, 2),
    shortBoards: choose(36, 5),
    shortSevenCard: shortDeckSevenCardCounts(),
    aaVsJtsFull: exactEquity(AA, JTs, FULL_RANKS, false),
    aaVsJtsShortStraightBeatsTrips: exactEquity(AA, JTs, SHORT_RANKS, true, false),
    aaVsJtsShortTripsBeatStraight: exactEquity(AA, JTs, SHORT_RANKS, true, true),
    oesdShort: hitProbability(8, 31, 2),
    flushDrawShort: hitProbability(5, 31, 2),
    oesdFull: hitProbability(8, 47, 2),
    flushDrawFull: hitProbability(9, 47, 2),
  });
}
