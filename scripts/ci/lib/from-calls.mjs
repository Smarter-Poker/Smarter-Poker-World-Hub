/**
 * from-calls.mjs - find every `.from('table')` in a source file, fast.
 *
 * THE 86-SECOND REGEX (2026-09-04). Three CI checks - phantom tables (CHECK
 * 11 and U4.2), phantom columns (CHECK 13) and stranded writers (CHECK 12) -
 * each carried a copy of this pattern:
 *
 *   /([A-Za-z_$][A-Za-z0-9_$]*)?\s*(?:\(\))?\s*(\.\s*storage)?\s*\.\s*from\(.../g
 *
 * It BEGINS with an optional identifier. A regex that begins with something
 * optional has no literal to anchor on, so V8 attempts a match at every one of
 * the 32MB of characters in the scanned tree - and at each attempt the optional
 * group greedily eats an identifier, fails on `.from(`, and backtracks through
 * every shorter prefix of that identifier before giving up. Measured on the
 * repo on 2026-09-04: comment-stripping 833 files took 171ms; running this
 * pattern over them took over 90 seconds. Three copies, run in sequence, was
 * more than four minutes of every Pre-Deploy Safety Checks run, and a fourth
 * copy ran again in the Supabase Invariants workflow. The PostgREST schema
 * fetch everyone assumed was the cost takes 1.4 seconds.
 *
 * Same answer, different order of work: find the literal `.from(` first (a
 * literal prefix lets the engine skip straight to candidates), then read the
 * receiver BACKWARDS from that point with a pattern anchored at the end of a
 * short window. Every site the old pattern found, this finds, with the same
 * receiver and the same storage flag - the tests pin that.
 *
 * `lineIndex` replaces `clean.slice(0, idx).split('\n').length` per match,
 * which re-split the whole file for every one of thousands of matches.
 */

/** The literal-anchored candidate. Group 1 is the table name. */
const FROM_LITERAL_RE = /\.\s*from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;

/**
 * What sits immediately before the `.from(`: an optional receiver identifier,
 * an optional `()` call, an optional `.storage`. Anchored at the END of the
 * window, so it is evaluated once per candidate over at most WINDOW chars.
 */
const RECEIVER_RE = /([A-Za-z_$][A-Za-z0-9_$]*)?\s*(?:\(\))?\s*(\.\s*storage)?\s*$/;
const WINDOW = 200;

/**
 * Every `.from('x')` call in comment-stripped source.
 *
 * @param {string} clean  source with comments already stripped
 * @returns {Array<{index:number,end:number,receiver:string,isStorage:boolean,table:string}>}
 *   `index` is where the receiver (or the `.from`) starts, exactly as the old
 *   pattern's `m.index` did; `end` is one past the closing `)` of `.from(...)`.
 */
export function fromCalls(clean) {
  const out = [];
  FROM_LITERAL_RE.lastIndex = 0;
  let m;
  while ((m = FROM_LITERAL_RE.exec(clean)) !== null) {
    const before = clean.slice(Math.max(0, m.index - WINDOW), m.index);
    const r = RECEIVER_RE.exec(before);
    const receiver = (r && r[1]) || '';
    const isStorage = Boolean(r && r[2]);
    // The old pattern's match began at the receiver; keep that for callers
    // that report a position.
    const index = r ? m.index - r[0].length : m.index;
    out.push({ index, end: m.index + m[0].length, receiver, isStorage, table: m[1] });
  }
  return out;
}

/** A line-number lookup built once per file: O(log lines) per query. */
export function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (idx) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}
