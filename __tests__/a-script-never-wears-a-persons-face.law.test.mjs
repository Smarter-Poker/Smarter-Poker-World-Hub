/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  LAW: A SCRIPT NEVER WEARS A PERSON'S FACE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-09-04: "DON'T USE MY ACCOUNT FOR THE CRON ... KEEP MY ACCOUNT
 * CLEAN." and "Do not hardcode any credentials. Always read from the
 * .env.local files."
 *
 * The login probe was the loud one (see synthetic-probes-never-sign-out-a-
 * person.law.test.mjs). The quiet one was everywhere else: thirty-seven files
 * in this repo carried his personal address as a literal - e2e/00-auth.setup.ts
 * signed every CI run in as him, the production watchdog signed in as him on
 * every deploy, and two dozen one-off scripts did the same. The Supabase audit
 * log for one afternoon shows his account logging in from Windows Chrome, an
 * iPhone, a Pixel 5, Safari and "node" inside a single minute - all of it CI.
 *
 * THE PINS
 *   1. His personal address appears in no source file, script, workflow or
 *      .env.example (docs, JSON/CSV data and comments excepted). The account
 *      a script uses is TEST_USER_EMAIL from the environment - the platform
 *      service account - and CI passes it from the repository variable.
 *   2. The two files that decide what CI signs in as (e2e/00-auth.setup.ts
 *      and e2e-tests.yml) read TEST_USER_EMAIL and refuse to guess.
 *
 * IF THIS FILE GOES RED, YOUR CHANGE IS THE BUG. Read the account from the
 * environment. Do not add the address back as a default.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PERSONAL = ['daniel@', 'bekavactrading', '.com'].join('').toLowerCase();

const SCAN_DIRS = ['e2e', 'scripts', 'pages', 'src', 'lib', 'tmp', '__tests__', 'tests', '.github'];
const SOURCE_EXT = /\.(m?js|cjs|ts|tsx|sh|ya?ml|example)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '_archive']);
/**
 * Data about Dan, not a credential: the Commander seed lists him as a venue
 * owner with a phone and a PIN, the way it lists every other owner. That row
 * is a business record and stays. Nothing else is exempt.
 */
const DATA_NOT_CREDENTIAL = new Set(['scripts/seed-commander-jaqk.js']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (SOURCE_EXT.test(name)) out.push(p);
  }
  return out;
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

test("LAW 1: Dan's personal address is not a literal in any script, page, test or workflow", () => {
  const rootScripts = readdirSync(ROOT)
    .filter((n) => /\.(m?js|cjs|ts)$/.test(n) && !n.includes('.config.'))
    .map((n) => join(ROOT, n));
  const files = [...SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))), ...rootScripts, join(ROOT, '.env.example')];
  const offenders = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (rel === relative(ROOT, fileURLToPath(import.meta.url))) continue;
    if (rel === '__tests__/synthetic-probes-never-sign-out-a-person.law.test.mjs') continue; // quotes the incident
    if (DATA_NOT_CREDENTIAL.has(rel)) continue;
    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!src.toLowerCase().includes(PERSONAL)) continue;
    const code = /\.(m?js|cjs|ts|tsx)$/.test(file) ? stripComments(src) : src.replace(/^\s*#.*$/gm, '');
    if (code.toLowerCase().includes(PERSONAL)) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    'read the account from TEST_USER_EMAIL (repository variable in CI, .env.local locally):\n  ' +
      offenders.join('\n  ')
  );
});

test('LAW 2: the CI sign-in reads TEST_USER_EMAIL from the environment and refuses to guess', () => {
  const setup = readFileSync(join(ROOT, 'e2e/00-auth.setup.ts'), 'utf8');
  assert.match(setup, /process\.env\.TEST_USER_EMAIL/);
  assert.match(setup, /refusing to guess an account/);
  const wf = readFileSync(join(ROOT, '.github/workflows/e2e-tests.yml'), 'utf8');
  assert.match(wf, /TEST_USER_EMAIL: \$\{\{ vars\.TEST_USER_EMAIL/);
  const watchdog = readFileSync(join(ROOT, '.github/workflows/personal-assistant-production-watchdog.yml'), 'utf8');
  assert.match(watchdog, /TEST_USER_EMAIL: \$\{\{ vars\.TEST_USER_EMAIL/);
});
