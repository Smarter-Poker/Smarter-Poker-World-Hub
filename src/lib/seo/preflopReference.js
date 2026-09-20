/**
 * THE CHARTS, AS WORDS (AEO phase 3, 2026-09-19).
 *
 * Measured on production, /hub/preflop-charts served 112 words: its summary
 * block and nothing else. The charts themselves are drawn by the range lab
 * after mount, so a crawler that does not run JavaScript was told the page
 * exists and never told what is on it.
 *
 * The corpus is not behind a fetch. src/config/solverRanges.js is an
 * authored 6-max cash 100 big blind reference, bundled with the app, and
 * /api/training/preflop-ranges already reads it straight out of the module.
 *
 * "What does UTG open in 6-max?" is a question an engine is asked and can
 * only answer from a page that says so in words. This turns the same corpus
 * the lab drills into readable text, with the frequencies intact and the
 * provenance attached: it is an authored teaching reference, not a
 * checksummed solver export, and the page says that rather than implying
 * otherwise.
 *
 * Plain JavaScript, no JSX and no imports, so a law can read what it
 * produces under plain node instead of pattern matching a component.
 */

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

/** A pair is 6 combos, a suited hand 4, an offsuit hand 12. 1,326 in all. */
export function combosFor(hand) {
  if (typeof hand !== 'string') return 0;
  if (hand.length === 2) return 6;
  if (hand.endsWith('s')) return 4;
  if (hand.endsWith('o')) return 12;
  return 0;
}

export const TOTAL_COMBOS = 1326;

/** Strongest first, the order a chart is read in. */
export function sortHands(hands) {
  const rank = (card) => RANKS.indexOf(card);
  const weight = (hand) => {
    const [a, b] = [hand[0], hand[1]];
    const suffix = hand.length > 2 ? hand[2] : '';
    const pair = a === b ? 0 : 1;
    return [pair, rank(a), rank(b), suffix === 's' ? 0 : 1];
  };
  return [...hands].sort((a, b) => {
    const wa = weight(a);
    const wb = weight(b);
    for (let i = 0; i < wa.length; i += 1) {
      if (wa[i] !== wb[i]) return wa[i] - wb[i];
    }
    return 0;
  });
}

/** The share of a frequency map that belongs to one action, as a percentage. */
export function actionShare(freqMap, action) {
  let combos = 0;
  for (const [hand, actions] of Object.entries(freqMap || {})) {
    const frequency = Number(actions?.[action]) || 0;
    if (frequency > 0) combos += combosFor(hand) * frequency;
  }
  return Math.round((combos / TOTAL_COMBOS) * 1000) / 10;
}

/**
 * The share of combinations the range touches at all, mixed hands counted in
 * full. Two numbers describe a mixed range and they are far apart: UTG opens
 * 8.4 percent of combinations by frequency and takes a hand from 13.6
 * percent of them at least some of the time. The inline comments in
 * src/config/solverRanges.js quote roughly the second kind and are higher
 * again, so this page prints both and says which is which rather than
 * picking one and being wrong half the time.
 */
export function supportShare(freqMap, action) {
  let combos = 0;
  for (const [hand, actions] of Object.entries(freqMap || {})) {
    if ((Number(actions?.[action]) || 0) > 0) combos += combosFor(hand);
  }
  return Math.round((combos / TOTAL_COMBOS) * 1000) / 10;
}

/**
 * One range, split the way a reader uses it: the hands taken every time, and
 * the hands taken some of the time with how often. A hand played at a
 * frequency between the two is the whole reason a chart is not a list.
 */
export function describeRange(freqMap, action) {
  const always = [];
  const mixed = [];
  for (const [hand, actions] of Object.entries(freqMap || {})) {
    const frequency = Number(actions?.[action]) || 0;
    if (frequency >= 0.999) always.push(hand);
    else if (frequency > 0) mixed.push({ hand, frequency: Math.round(frequency * 100) });
  }
  return {
    action,
    percent: actionShare(freqMap, action),
    reach: supportShare(freqMap, action),
    always: sortHands(always),
    mixed: sortHands(mixed.map((m) => m.hand)).map(
      (hand) => mixed.find((m) => m.hand === hand),
    ),
  };
}

/** Every opening range in the corpus, in seat order. */
export function openingRanges(rfi, order) {
  return (order || Object.keys(rfi || {}))
    .filter((position) => rfi?.[position])
    .map((position) => ({ position, ...describeRange(rfi[position], 'raise') }));
}

/**
 * A big blind defending spot: what it three-bets and what it calls. Both
 * numbers matter, and a page that prints only one of them is teaching the
 * wrong lesson about defending.
 */
export function defenceRanges(bbDefense, order) {
  return (order || Object.keys(bbDefense || {}))
    .filter((key) => bbDefense?.[key])
    .map((key) => ({
      versus: String(key).replace(/^vs_/, ''),
      threeBet: describeRange(bbDefense[key], 'raise'),
      call: describeRange(bbDefense[key], 'call'),
    }));
}

/** Facing a three-bet: what four-bets and what continues. */
export function fourBetRanges(fourBet, order) {
  return (order || Object.keys(fourBet || {}))
    .filter((key) => fourBet?.[key])
    .map((key) => ({
      position: String(key).replace(/_vs_3bet$/, ''),
      fourBet: describeRange(fourBet[key], 'raise'),
      call: describeRange(fourBet[key], 'call'),
    }));
}
