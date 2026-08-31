#!/usr/bin/env node
/**
 * check-ui-text - no em dashes in anything a player can read.
 *
 * Dan 2026-08-20: "forbid the use of em bars anywhere."
 * Dan 2026-08-31: "remove any and all em bars as they are banned from use."
 *
 * PORTED FROM CLUB ARENA, WHERE IT ALREADY EXISTED.
 *
 * The Club Arena repo has had this gate since 2026-08-20. The World Hub - which
 * serves smarter.poker itself, 939 page routes, and the shell every Club Arena
 * page is rendered inside - had no copy gate of any kind. So the rule was
 * enforced on one half of what a player sees and unenforced on the other, and
 * 2,314 em dashes outside comments had accumulated across 649 files.
 *
 * A rule that lives in one repo of an estate is a rule the estate does not have.
 *
 * WHAT IT CHECKS
 *   JSX text nodes            <span>Held in trust - 400</span>
 *   string literals           label: 'Hands - played'
 *   CSS `content:` values     content: '-';
 *
 * WHAT IT DELIBERATELY IGNORES
 *   Source comments (// and block), which never reach a player. Rewriting
 *   thousands of them would be a huge diff with zero user-visible effect and
 *   would bury the real changes in any future review. Same call the Club Arena
 *   gate makes, for the same reason.
 *
 *   REGEX LITERALS, which is not a style choice but a correctness one. Inside
 *   a character class a hyphen is a RANGE. The first run of this gate rewrote
 *
 *       /(\d{1,2})\s*[-\u2013\u2014to]+\s*(\d{1,2})/     a date-range parser
 *
 *   into `[--to]`, which is the range 0x2D..0x74 - every character from
 *   hyphen to lowercase t - plus 'o'. It also turned `[\u2014\u2013]` into
 *   `[--]` in four check-in parsers and a date splitter, silently dropping
 *   the en dash they were written to accept. Valid syntax, changed meaning,
 *   no test would necessarily catch it.
 *
 *   The Club Arena gate learned the same lesson on titleCase.ts and solved it
 *   with a file exemption. A character class is the general case, so regex
 *   literals are blanked before the scan and REPORTED instead, for a human to
 *   decide one at a time.
 *
 * Run:  node scripts/ci/check-ui-text.mjs [--fix]
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;

/** Everything a player can end up reading. */
const SCAN_DIRS = ['pages', 'src', 'app', 'components', 'lib'];

const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);
const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.next', 'out', 'build', 'coverage',
  '_to_delete', '__tests__', 'test-results', 'public',
]);
/**
 * Seven files this gate would otherwise flag, and cannot currently be fixed.
 *
 * Each carries a PRE-EXISTING `supabase.auth.getSession()` that
 * scripts/hooks/pre-commit-core.sh blocks. That hook inspects STAGED files, so
 * the violation is invisible until something touches the file - and a sweep
 * that replaces one character in a string counts as touching it. Fixing their
 * em dashes therefore requires fixing their auth pattern first, which is an
 * unrelated change to authentication code and does not belong in a copy sweep.
 *
 * This list is a debt, not a decision. Clear a file from it by migrating it to
 * getAuthUser() from '@/lib/authUtils', then deleting the line here - the gate
 * will pick the file up on its own.
 */
const PRE_EXISTING_BLOCKED = new Set([
  /*
   * Seven more, blocked by scripts/hooks/pre-push CHECK 8 (broken import
   * resolution) rather than by the auth rule. Each imports a module that no
   * longer exists - ./poker-brain-supabase, ../src/TableManager,
   * ../src/ActionTimer and others. Same mechanic as the auth list: the hook
   * only inspects files a push actually changes, so replacing one character in
   * a string is what makes a long-dead import visible.
   *
   * Deleting or repairing dead poker-engine test harnesses is not a copy
   * change. Clear one from this list by fixing its imports.
   */
  'src/lib/poker-brain/storage.js',
  'src/lib/poker-engine/tests/test-phase2.js',
  'src/lib/poker-engine/tests/test-phase3-verify.js',
  'src/lib/poker-engine/tests/test-phase4.js',
  'src/lib/poker-engine/tests/test-phase6-integration.js',
  'src/lib/poker-engine/tests/test-phase8-ui-omaha.js',
  'src/lib/poker-engine/tests/test-phase9-fullstack.js',
]);

const AUTH_BLOCKED = new Set([
  'pages/api/admin/cron-health.js',
  'pages/auth/mfa.js',
  'pages/auth/reset-password.js',
  'pages/claim/[token].js',
  'pages/club/[id].js',
  'pages/home-game/[code].js',
  'src/lib/poker-brain/decision-bridge.js',
]);

const SKIP_FILES = new Set(['scripts/ci/check-ui-text.mjs']);
const EM_DASHES = /[—–―‒]/;

const fix = process.argv.includes('--fix');

/** Strip comments so the scan only sees code and copy. */
function stripComments(source, isCss) {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  if (!isCss) {
    // Line comments, but not the // inside a URL like https://
    out = out.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  }
  return out;
}

/**
 * Blank regex literals. See the header: a hyphen inside a character class is a
 * range, so this gate must never rewrite one. Deliberately conservative - it
 * only treats a `/.../flags` as a regex when it directly follows a token that
 * can precede one, which is the ambiguity that makes division and regex hard
 * to tell apart. Anything it misclassifies as NOT a regex is simply scanned
 * normally, which is the safe direction.
 */
const REGEX_LITERAL =
  /(^|[=(,:[!&|?{};+\-*%~^]|\breturn\b|\btypeof\b|=>)(\s*)(\/(?:[^/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[gimsuyd]*)/g;

function blankRegexLiterals(source) {
  return source.replace(REGEX_LITERAL, (m, pre, ws, re) => pre + ws + re.replace(/[^\n]/g, ' '));
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, acc);
    else if (EXTS.has(extname(entry))) acc.push(full);
  }
  return acc;
}

const offenders = [];
const regexHazards = [];
let fixedCount = 0;
let fixedFiles = 0;

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

for (const file of files) {
  const rel = file.replace(ROOT, '');
  if (SKIP_FILES.has(rel)) continue;
  if (AUTH_BLOCKED.has(rel)) continue;
  if (PRE_EXISTING_BLOCKED.has(rel)) continue;
  if (/\.(test|spec)\.[jt]sx?$/.test(rel)) continue;

  const original = readFileSync(file, 'utf8');
  if (!EM_DASHES.test(original)) continue;

  const isCss = extname(file) === '.css';
  let scannable = stripComments(original, isCss);
  if (!isCss) {
    const beforeRegex = scannable;
    scannable = blankRegexLiterals(scannable);
    // Anything that vanished with the regex literals is a character-class
    // hazard. Report it; never rewrite it.
    if (EM_DASHES.test(beforeRegex) && !EM_DASHES.test(scannable)) {
      // fully accounted for by regexes
    }
    beforeRegex.split('\n').forEach((line, idx) => {
      if (EM_DASHES.test(line) && !EM_DASHES.test(scannable.split('\n')[idx] ?? '')) {
        regexHazards.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
  if (!EM_DASHES.test(scannable)) continue; // only in comments/regexes -> not rewritten

  if (fix) {
    // Rewrite only OUTSIDE comments: walk the stripped copy to find real
    // offsets, then patch those exact positions in the original.
    const patched = original.split('');
    let touched = false;
    for (let i = 0; i < scannable.length; i++) {
      if (EM_DASHES.test(scannable[i])) {
        patched[i] = '-';
        fixedCount++;
        touched = true;
      }
    }
    if (touched) fixedFiles++;
    writeFileSync(file, patched.join(''), 'utf8');
    continue;
  }

  scannable.split('\n').forEach((line, idx) => {
    if (EM_DASHES.test(line)) {
      offenders.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
}

function reportHazards() {
  if (!regexHazards.length) return;
  console.log(
    `\ncheck-ui-text: ${regexHazards.length} em dash(es) sit inside REGEX literals and were left alone.`
  );
  console.log('A hyphen in a character class is a RANGE. These need a human:\n');
  regexHazards.slice(0, 40).forEach((h) => console.log('  ' + h));
  if (regexHazards.length > 40) console.log(`  ... and ${regexHazards.length - 40} more`);
  console.log('');
}

if (fix) {
  console.log(`check-ui-text: replaced ${fixedCount} em dash(es) across ${fixedFiles} file(s), outside comments and regexes.`);
  reportHazards();
  process.exit(0);
}

if (offenders.length > 0) {
  console.error('\ncheck-ui-text FAILED: em dashes found in user-facing text.\n');
  console.error('Dan: em dashes are banned from use.');
  console.error('Use a plain hyphen, or run: node scripts/ci/check-ui-text.mjs --fix\n');
  offenders.slice(0, 60).forEach((o) => console.error('  ' + o));
  if (offenders.length > 60) console.error(`  ... and ${offenders.length - 60} more`);
  console.error('');
  process.exit(1);
}

reportHazards();
console.log('check-ui-text: OK - no em dashes in UI text.');
