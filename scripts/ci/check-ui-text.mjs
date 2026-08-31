/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NO EM DASHES IN ANYTHING A PERSON READS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-08-31: "REMOVE ANY AND ALL M BARS AS THEY ARE BANNED FROM USE."
 *
 * Club Arena has had this gate since 2026-08-27. The apex site never did, so
 * every page and sub page it serves was unchecked, and em dashes accumulated in
 * page titles, headings and the placeholder dash tables use for an empty cell.
 *
 * WHAT IS CHECKED. Comments are stripped before scanning, so a note ABOUT the
 * rule is not an instance of it, and neither is a file header banner. What is
 * left is code and copy, which is what reaches a person.
 *
 * --fix rewrites only the occurrences OUTSIDE comments, to a plain hyphen. It
 * walks the stripped copy to find real offsets and patches those exact
 * positions in the original, so a comment is never touched.
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const DIRS = ['pages', 'components', 'src'];
const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.html']);
const SKIP_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', 'coverage', '_to_delete',
  '__tests__', 'test-results', 'public',
]);
/**
 * TEN FILES THIS GATE CANNOT CLEAN, AND WHY THAT IS RECORDED HERE RATHER THAN
 * QUIETLY WORKED AROUND.
 *
 * The pre-commit hook refuses any staged file containing
 * supabase.auth.getSession(). All ten carry that call ON origin/main ALREADY -
 * verified, file by file - so it is pre-existing auth-migration debt, not
 * anything this sweep introduced. Cleaning their dashes would have meant either
 * fixing somebody else's auth migration inside a cosmetic sweep, or bypassing a
 * guard that exists because unguarded getSession() calls caused real incidents.
 *
 * Neither is a trade worth making, so they are listed. REMOVE A LINE FROM THIS
 * LIST THE MOMENT ITS FILE IS MIGRATED OFF getSession() - the entry is a debt
 * marker, not a permission.
 */
const SKIP_FILES = new Set([
  'scripts/ci/check-ui-text.mjs',
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
const EM_DASHES = /[—–―‒]/;

const fix = process.argv.includes('--fix');

/** Strip comments so the scan only sees code and copy. */
function stripComments(source, isCss, isHtml) {
  let out = source;
  if (isHtml) out = out.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  out = out.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  if (!isCss) {
    // Line comments, but not the // inside a URL like https://
    out = out.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  }
  return out;
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (EXTS.has(extname(entry))) acc.push(full);
  }
  return acc;
}

const files = DIRS.flatMap((d) => walk(join(ROOT, d)));
const offenders = [];
let fixedCount = 0;
let fixedFiles = 0;

for (const file of files) {
  const rel = file.replace(ROOT, '');
  if (SKIP_FILES.has(rel)) continue;
  const original = readFileSync(file, 'utf8');
  if (!EM_DASHES.test(original)) continue;

  const isCss = extname(file) === '.css';
  const isHtml = extname(file) === '.html';
  const scannable = stripComments(original, isCss, isHtml);
  if (!EM_DASHES.test(scannable)) continue; // only in comments -> allowed

  if (fix) {
    const patched = original.split('');
    let touched = 0;
    for (let i = 0; i < scannable.length; i++) {
      if (EM_DASHES.test(scannable[i])) {
        patched[i] = '-';
        touched++;
      }
    }
    if (touched > 0) {
      writeFileSync(file, patched.join(''), 'utf8');
      fixedCount += touched;
      fixedFiles++;
    }
    continue;
  }

  scannable.split('\n').forEach((line, idx) => {
    if (EM_DASHES.test(line)) {
      offenders.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
}

if (fix) {
  console.log(`check-ui-text: fixed ${fixedCount} em dash(es) across ${fixedFiles} file(s).`);
  process.exit(0);
}

if (offenders.length > 0) {
  console.error('\ncheck-ui-text: em dashes are banned in anything a person reads.\n');
  for (const o of offenders.slice(0, 40)) console.error(`  ${o}`);
  if (offenders.length > 40) console.error(`  ... and ${offenders.length - 40} more`);
  console.error('\nUse a plain hyphen, or run: node scripts/ci/check-ui-text.mjs --fix\n');
  process.exit(1);
}

console.log('check-ui-text: OK - no em dashes in UI text.');
