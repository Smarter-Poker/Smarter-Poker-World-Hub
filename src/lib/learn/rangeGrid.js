/**
 * A RANGE AS A 13 BY 13 TABLE (AEO section 3.7, 2026-09-22).
 *
 * The /learn preflop lessons print their charts as a real HTML <table>, so
 * a reader without JavaScript, and an engine, gets the same grid the range
 * lab draws. This builds that grid from a frequency map in the bundled
 * corpus (src/config/solverRanges.js); nothing in a chart is typed by hand.
 *
 * Layout is the one every chart uses: rows and columns run A down to 2,
 * pairs sit on the diagonal, suited hands above it and offsuit hands below.
 *
 * Plain JavaScript, no JSX and no imports, so a law can run it under node.
 */

export const GRID_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

/** The hand in row `row`, column `col`: "AA", "AKs" above, "AKo" below. */
export function handAt(row, col) {
  const r = GRID_RANKS[row];
  const c = GRID_RANKS[col];
  if (row === col) return r + c;
  if (col > row) return `${r}${c}s`;
  return `${c}${r}o`;
}

/** A frequency as a whole percentage, 0 when the hand is not in the map. */
function percentOf(freqMap, hand, action) {
  const value = Number(freqMap?.[hand]?.[action]) || 0;
  return Math.round(value * 100);
}

/**
 * The full grid. Each cell carries the hand, one percentage per action and
 * the text a reader sees, so the page renders it without doing any math.
 * `actions` is a list of { key, label } in display order, for example
 * [{ key: 'raise', label: 'Raise' }] or a three bet and a call.
 */
export function rangeGrid(freqMap, actions) {
  const rows = [];
  for (let row = 0; row < GRID_RANKS.length; row += 1) {
    const cells = [];
    for (let col = 0; col < GRID_RANKS.length; col += 1) {
      const hand = handAt(row, col);
      const values = actions.map((a) => ({ key: a.key, label: a.label, percent: percentOf(freqMap, hand, a.key) }));
      const played = values.reduce((sum, v) => sum + v.percent, 0);
      const text = actions.length === 1
        ? `${hand} ${values[0].percent}%`
        : `${hand} ${values.map((v) => `${v.label} ${v.percent}%`).join(' ')}`;
      cells.push({ hand, values, played: Math.min(100, played), text });
    }
    rows.push({ rank: GRID_RANKS[row], cells });
  }
  return { ranks: GRID_RANKS, actions, rows };
}
