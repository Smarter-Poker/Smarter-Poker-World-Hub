#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SWALLOWED-ERROR RATCHET — money paths
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Stops the "log it and carry on" pattern from spreading in code that moves
 * chips.
 *
 * WHY. On 2026-08-19 an audit of the union settlement found that
 * /api/club-arena/settle-period returned `success: true` while losing an
 * entire week of settlement, in five different ways. Every one of them was the
 * same shape:
 *
 *     const { data } = await supabase.from('agents')...   // error not taken
 *     if (err) console.warn('Silent mutation failed', err) // logged, ignored
 *
 * A failed agents read meant zero commissions and a zero union hold, and the
 * period still closed reporting "0 commission records created". A failed
 * period-close UPDATE left the period open while telling the caller it was
 * closed — so a re-run re-paid every commission and re-debited the treasury.
 * None of it threw. None of it alerted. It was found by reading the code.
 *
 * HOW. A hard failure on all of these would block every build — there are
 * hundreds, and they predate this rule. So this is a RATCHET: the current
 * count is frozen as a baseline and the build fails only if the count GOES UP.
 * Existing debt is paid down deliberately; new debt is refused.
 *
 * When you legitimately reduce the count, lower BASELINE in the same commit —
 * that is what makes the ratchet tighten instead of drift.
 *
 * Usage:
 *   node scripts/check-swallowed-money-errors.mjs           # enforce
 *   node scripts/check-swallowed-money-errors.mjs --report  # show the worst files
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/**
 * Directories where a swallowed error means chips, commissions or settlements
 * can go missing. Deliberately narrow: this is not a style rule.
 */
const MONEY_PATHS = [
  'pages/api/club-arena',
  'pages/api/cron',
  'src/lib/club-arena',
];

/**
 * The count frozen on 2026-08-19 (measured, not estimated). LOWER THIS when you remove instances.
 * Never raise it.
 */
const BASELINE = 171;

const PATTERNS = [
  // The explicit marker this codebase generates for an ignored mutation error.
  /Silent mutation failed/g,
  // `if (someErr) console.warn(...)` with no return/throw on the same line.
  /if\s*\(\s*\w*[Ee]rr\w*\s*\)\s*console\.(warn|log|error)\(/g,
];

const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const full = join(dir, e);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.has(e.slice(e.lastIndexOf('.')))) out.push(full);
  }
  return out;
}

const files = MONEY_PATHS.flatMap((p) => walk(join(ROOT, p)));
const perFile = [];
let total = 0;

for (const file of files) {
  let src;
  try {
    src = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  let n = 0;
  for (const re of PATTERNS) n += (src.match(re) || []).length;
  if (n > 0) {
    perFile.push({ file: relative(ROOT, file), n });
    total += n;
  }
}

perFile.sort((a, b) => b.n - a.n);

if (process.argv.includes('--report')) {
  console.log(`Swallowed-error instances in money paths: ${total} (baseline ${BASELINE})\n`);
  for (const f of perFile.slice(0, 25)) console.log(`  ${String(f.n).padStart(4)}  ${f.file}`);
  process.exit(0);
}

if (total > BASELINE) {
  console.error(`\nSWALLOWED-ERROR RATCHET TRIPPED\n`);
  console.error(`Money-path swallowed errors: ${total} (baseline ${BASELINE}, +${total - BASELINE})\n`);
  console.error('A logged-and-ignored error in a chip path is how settlement silently');
  console.error('lost a full week of commissions and the union hold while reporting');
  console.error('success. Handle the error: return a 4xx/5xx, or roll back.\n');
  console.error('Worst files:\n');
  for (const f of perFile.slice(0, 10)) console.error(`  ${String(f.n).padStart(4)}  ${f.file}`);
  console.error('\nIf you genuinely reduced the count, lower BASELINE in this script.\n');
  process.exit(1);
}

if (total < BASELINE) {
  console.log(
    `OK — ${total} swallowed error(s) in money paths, BELOW the ${BASELINE} baseline.\n` +
      `Lower BASELINE to ${total} in scripts/check-swallowed-money-errors.mjs to lock the gain in.`
  );
} else {
  console.log(`OK — ${total} swallowed error(s) in money paths, at the ${BASELINE} baseline.`);
}
process.exit(0);
