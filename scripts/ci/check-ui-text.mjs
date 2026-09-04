/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  check-ui-text - no em dashes in anything a player can read
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-08-20 and again 2026-08-31: em dashes are BANNED from use.
 *
 * Club Arena has enforced this since August. The World Hub - which is the
 * site, and therefore most of the pages a player ever sees - never had the
 * gate at all, and was holding roughly 3,900 lines of user-facing copy with
 * one in it. This is the port, widened for how this repo is actually built:
 * Club Arena is TypeScript-only, the World Hub is a mix of .js, .jsx, .ts and
 * .tsx across pages/, src/ and app/.
 *
 * What counts as "a player can read":
 *   JSX text nodes            <span>Held in trust - 400</span>
 *   UI-ish string literals    label: 'Hands - played'
 *   CSS `content:` values     content: '-';
 *
 * Comments are exempt. They are not copy, and this repo's comments carry its
 * institutional memory. Blanking rather than deleting them preserves byte
 * offsets, which is what lets --fix patch the ORIGINAL file at positions found
 * in the stripped copy.
 *
 *   node scripts/ci/check-ui-text.mjs          report
 *   node scripts/ci/check-ui-text.mjs --fix    rewrite to plain hyphens
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const SCAN_ROOTS = ['pages', 'src', 'app', 'components', 'lib', 'public'].map((d) => join(ROOT, d));
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html']);
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  'out',
  'build',
  'coverage',
  '_to_delete',
  '__tests__',
  // `tests` and `e2e` were missing while `__tests__` was here, and this repo
  // keeps 23 files under src/lib/poker-engine/tests/. See IS_TEST_FILE.
  'tests',
  'e2e',
  'test-results',
  '.git',
  'vendor',
]);

/**
 * A TEST TITLE IS NOT COPY (2026-09-04).
 *
 * This gate exists to keep em dashes out of "anything a player can read", and
 * it already ignores comments for exactly that reason. `it('the pot raise is
 * 4.5bb - not 3.5')` never reaches a player either.
 *
 * Club Arena's copy of this script had the identical hole and it cost an agent
 * a blocked push today: a pre-push failure on three test TITLES, with a rule
 * about player-facing copy quoted at them. The obvious escape is --no-verify,
 * which skips every other check in that hook - including the secret scan. A
 * guard that cries wolf teaches people to walk around the guards that are
 * right.
 *
 * Fixed there in Club Arena #2812; this is the second copy. Nothing is lost:
 * a string a player actually reads has to exist in a real source file, all of
 * which are still scanned, and a test can only ASSERT such a string - which is
 * checked at its source.
 */
const IS_TEST_FILE = (rel) =>
  /(^|\/)(tests?|e2e|__tests__)\//.test(rel) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
/**
 * Files where an em dash is CODE, not copy, and rewriting it changes behaviour.
 *
 * Found the hard way on the first --fix run of this gate: these parse content
 * that ALREADY EXISTS, written with an em dash by an earlier version of the
 * app and sitting in the database now. `.split('\u2014')[0]` pulls the venue
 * out of a "Checked in at <venue> \u2014 <note>" post; swapping the character
 * makes every one of those rows stop parsing. That is a data migration with a
 * decision behind it, not a copy fix, so this gate does not get to make it.
 *
 * Regex literals are handled structurally below and need no entry here.
 */
const SKIP_FILES = new Set([
  'scripts/ci/check-ui-text.mjs',
  'pages/hub/social-media/index.js',
  'pages/hub/social-pages/[pageId].js',
  'src/components/social/ChatWindow.jsx',
  'src/components/social/ClubPageDashboard.jsx',
  'src/components/social/ClubPagesView.jsx',
  'src/components/social/PublicGameBoard.jsx',
  'src/components/training/TripleBarrelTrainer.jsx',
  // Not auth debt like the ten below. The js-safety check reads the line
  //     *   import { PokerBrainStorage } from './poker-brain-supabase';
  // out of this file's documentation header and reports it as a broken
  // import. It is a comment, and it says so on main already. Touching the
  // file would make this sweep the thing that surfaced it.
  'src/lib/poker-brain/storage.js',
  'pages/api/admin/cron-health.js',
  'pages/auth/mfa.js',
  'pages/auth/reset-password.js',
  'pages/claim/[token].js',
  'pages/club/[id].js',
  'pages/home-game/[code].js',
  'src/lib/poker-brain/decision-bridge.js',
  'src/engine/CentralBus.js',
  'src/hooks/useMessengerService.js',
  'src/lib/authUtils.js',
]);

/**
 * A single line may opt out with a trailing `ui-text-ignore: <reason>`.
 *
 * For the one-line case the file-level list above is too blunt for: a data
 * parser sitting beside real copy. `useTourMapStops` builds a display name
 * with an em dash AND splits SCRAPED venue names on one, and those are
 * different strings with different lifetimes - the first is drawn this frame,
 * the second is matching rows a scraper wrote months ago.
 *
 * The reason is mandatory. A bare marker is not an exemption.
 */
const LINE_IGNORE = /ui-text-ignore:\s*\S/;
const EM_DASHES = /[—–―‒]/;

const fix = process.argv.includes('--fix');

/**
 * Blank comments AND regex literals in place, so the scan only sees copy.
 *
 * Regex bodies matter as much as comments here and for a sharper reason: a
 * `[\u2014\u2013]` character class exists precisely BECAUSE the data contains
 * those characters. Rewriting it produces `[--]` - a valid, meaningless range -
 * and the pattern silently stops matching. This gate's Club Arena ancestor did
 * exactly that to its own stripper on its first run, and this repo had ten
 * date-range and check-in parsers with the same shape waiting for it.
 *
 * The regex detector is deliberately conservative: a `/` only opens a literal
 * where an operand is legal (after `(`, `,`, `=`, `:`, `[`, `!`, `&`, `|`, `?`,
 * `{`, `;`, `return`, or the start of a line). Anything ambiguous is left
 * alone, which can only ever make this gate stricter, never wrong.
 *
 * Everything is BLANKED rather than deleted so byte offsets survive - that is
 * what lets --fix patch the original file at positions found in this copy.
 */
function stripComments(source, isCss, isHtml) {
  let out = source;
  if (isHtml) out = out.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  out = out.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  if (!isCss) {
    // Line comments, but not the // inside a URL like https://
    out = out.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
    out = blankRegexLiterals(out);
  }
  return out;
}

/** Blank the body of every regex literal, preserving length. */
function blankRegexLiterals(src) {
  const chars = src.split('');
  const OPENS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '\n']);
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== '/') continue;
    // What precedes it, ignoring spaces?
    let j = i - 1;
    while (j >= 0 && (chars[j] === ' ' || chars[j] === '\t')) j--;
    const prev = j >= 0 ? chars[j] : '\n';
    const isReturn = src.slice(Math.max(0, j - 5), j + 1).endsWith('return');
    if (!OPENS.has(prev) && !isReturn) continue;
    // Scan to the closing unescaped '/', bailing at a newline (not a literal).
    let k = i + 1;
    let inClass = false;
    let closed = -1;
    for (; k < chars.length; k++) {
      const c = chars[k];
      if (c === '\\') {
        k++;
        continue;
      }
      if (c === '\n') break;
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) {
        closed = k;
        break;
      }
    }
    if (closed < 0) continue;
    for (let m = i + 1; m < closed; m++) if (chars[m] !== '\n') chars[m] = ' ';
    i = closed;
  }
  return chars.join('');
}

function walk(dir, acc = []) {
  let st;
  try {
    st = statSync(dir);
  } catch {
    return acc; // a root this checkout does not have is not a failure
  }
  if (!st.isDirectory()) {
    if (EXTS.has(extname(dir))) acc.push(dir);
    return acc;
  }
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let est;
    try {
      est = statSync(full);
    } catch {
      continue;
    }
    if (est.isDirectory()) walk(full, acc);
    else if (EXTS.has(extname(entry))) acc.push(full);
  }
  return acc;
}

const files = [...new Set(SCAN_ROOTS.flatMap((r) => walk(r)))];
const offenders = [];
let fixedCount = 0;
let fixedFiles = 0;

for (const file of files) {
  const rel = file.replace(ROOT, '');
  if (SKIP_FILES.has(rel)) continue;
  // A test title is not copy - see IS_TEST_FILE. Also catches suites living
  // beside their source (foo.test.js next to foo.js), which the directory skip
  // above cannot see.
  if (IS_TEST_FILE(rel)) continue;
  const original = readFileSync(file, 'utf8');
  if (!EM_DASHES.test(original)) continue;

  const ext = extname(file);
  const scannable = stripComments(original, ext === '.css', ext === '.html');
  if (!EM_DASHES.test(scannable)) continue; // only in comments -> allowed

  // Line starts, so a per-line opt-out can be honoured by character offset.
  const lineOf = (() => {
    const starts = [0];
    for (let i = 0; i < original.length; i++) if (original[i] === '\n') starts.push(i + 1);
    return (idx) => {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= idx) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };
  })();
  const sourceLines = original.split('\n');
  const exempt = (idx) => LINE_IGNORE.test(sourceLines[lineOf(idx)] ?? '');

  if (fix) {
    const patched = original.split('');
    let n = 0;
    for (let i = 0; i < scannable.length; i++) {
      if (EM_DASHES.test(scannable[i]) && !exempt(i)) {
        patched[i] = '-';
        n++;
      }
    }
    if (n) {
      writeFileSync(file, patched.join(''), 'utf8');
      fixedCount += n;
      fixedFiles++;
    }
    continue;
  }

  scannable.split('\n').forEach((line, idx) => {
    if (!EM_DASHES.test(line)) return;
    if (LINE_IGNORE.test(sourceLines[idx] ?? '')) return;
    offenders.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 120)}`);
  });
}

if (fix) {
  console.log(
    `check-ui-text: replaced ${fixedCount} em dash(es) across ${fixedFiles} file(s), outside comments.`
  );
  process.exit(0);
}

if (offenders.length > 0) {
  console.error('\ncheck-ui-text FAILED: em dashes found in user-facing text.\n');
  console.error('Dan: em dashes are banned from use. Use a plain hyphen.');
  console.error('Autofix: node scripts/ci/check-ui-text.mjs --fix\n');
  offenders.slice(0, 60).forEach((o) => console.error('  ' + o));
  if (offenders.length > 60) console.error(`  ... and ${offenders.length - 60} more`);
  console.error('');
  process.exit(1);
}

console.log(`check-ui-text: OK - no em dashes in UI text (${files.length} files scanned).`);
