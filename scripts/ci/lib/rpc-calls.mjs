/**
 * rpc-calls.mjs - the `.rpc('name')` scanner shared by CHECK 26 and its law.
 *
 * Kept in lib/ for the same reason from-calls.mjs is: the scanner and the test
 * that proves the scanner works must read the source the SAME way, or the test
 * proves nothing about what CI runs.
 *
 * WHY COMMENTS ARE STRIPPED FIRST, AND WHY THAT MATTERS HERE
 * A retired function's name does not leave the repository when the call goes.
 * It stays in the header comment that explains why the call went, which is
 * exactly where it belongs. `decrement_club_table_count` is named four times
 * in prose in this repository today and called zero times. A scanner that read
 * raw source would report every one of those explanations as a live call, so
 * the fix for a dead RPC would be to stop explaining it. That is backwards, so
 * this reads comment-stripped source and nothing else.
 */

/** Strip // and /* *\/ comments, preserving string and template literals and
 *  line numbering. Same algorithm as check-phantom-columns' local copy. */
export function stripComments(src) {
  let out = '';
  let mode = 'code';
  for (let i = 0; i < src.length;) {
    const c = src[i];
    const d = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; i += 2; continue; }
      if (c === "'") mode = 'sq';
      else if (c === '"') mode = 'dq';
      else if (c === '`') mode = 'tpl';
      out += c; i += 1; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c; } i += 1; continue; }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = 'code'; i += 2; continue; } if (c === '\n') out += c; i += 1; continue; }
    if (c === '\\') { out += c + (d === undefined ? '' : d); i += 2; continue; }
    if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`')) mode = 'code';
    out += c; i += 1;
  }
  return out;
}

/* Only a STRING LITERAL first argument is read. `.rpc(fnName, args)` and
   `.rpc(`fn_${x}`)` name no single function at scan time, so they are skipped
   rather than guessed at: a gate that guesses gets switched off. */
const RPC_RE = /\.\s*rpc\s*\(\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1/g;

/**
 * Every `.rpc('name')` in already-comment-stripped source.
 * @returns {Array<{name: string, offset: number}>}
 */
export function rpcCalls(cleanSrc) {
  const out = [];
  RPC_RE.lastIndex = 0;
  for (let m; (m = RPC_RE.exec(cleanSrc)) !== null;) {
    out.push({ name: m[2], offset: m.index });
  }
  return out;
}

/** Convenience: strip then scan. */
export function rpcCallsInSource(src) {
  return rpcCalls(stripComments(src));
}
