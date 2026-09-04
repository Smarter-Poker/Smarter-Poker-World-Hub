/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  LAW: A SYNTHETIC PROBE NEVER SIGNS A PERSON OUT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-09-04: "ALL TABLES INSIDE THE CLUB ARENA ARE CURRENTLY DOWN,
 * NOBODY CAN PLAY... THEY ALL JUST SAY 'RECONNECTING TO TABLE' AND IT NEVER
 * DOES... JUST SILENTLY FAILS."
 *
 * WHAT IT WAS. /api/cron/login-probe runs every 15 minutes. On 2026-09-03 at
 * 20:15 UTC its PROBE_LOGIN_EMAIL / PROBE_LOGIN_PASSWORD were set to Dan's own
 * account instead of the dedicated probe user the file header has named since
 * May. From the next tick the probe signed in as him and then called
 * `anon.auth.signOut()` - default scope 'global' - which revokes EVERY session
 * the account holds, on every device. Supabase's audit log shows the pair
 * (login, logout, user_agent "node") at :00/:15/:30/:45 for 22 hours: 76
 * global sign-outs in one day. The Club Arena engine verifies every table
 * socket with auth.getUser(), GoTrue said session_not_found, the upgrade got
 * HTTP 401, and every table he opened sat on "Reconnecting To The Table".
 *
 * Nothing in the app noticed, because PostgREST checks only the JWT signature
 * (the lobby kept working) and the access token lives seven days (no refresh
 * was ever attempted). A monitor built to prove login works was the thing
 * breaking it, and it reported green the whole time.
 *
 * THE TWO PINS
 *   1. Server-side and script code never calls a bare `signOut()`. Only
 *      `{ scope: 'local' }` - end the session YOU made - is allowed there.
 *      A person choosing "Log Out" in the UI may sign out globally; a cron
 *      job, an API route or a script may not. The scan below covers
 *      pages/api, scripts, lib and src/lib.
 *   2. login-probe refuses to sign in as anything but a dedicated probe
 *      account (an address under @probe.smarter.poker). Misconfiguration is
 *      reported as 'misconfigured'; it is never acted on.
 *
 * IF THIS FILE GOES RED, YOUR CHANGE IS THE BUG. Do not add an allowlist entry
 * to get past it: if a script genuinely needs to sign a user out everywhere,
 * that is an admin action on a named account and it belongs behind
 * auth.admin.signOut(jwt, scope) with a written reason - not a probe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Directories whose code runs WITHOUT a person behind the keyboard. */
const HEADLESS_DIRS = ['pages/api', 'scripts', 'lib', 'src/lib', 'src/utils'];
const SOURCE_EXT = /\.(m?js|cjs|ts|tsx)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '__tests__', 'tests']);

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

/**
 * Every `.auth.signOut(` call site in headless code, with the argument text.
 * Comments are stripped first so a docblock QUOTING the forbidden form (this
 * incident is documented in login-probe.js) cannot trip the scan.
 */
function signOutCallSites(source) {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
  const sites = [];
  const re = /\.auth\.signOut\s*\(/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    // Capture up to the matching close paren (calls here are one-liners).
    let depth = 1;
    let i = re.lastIndex;
    while (i < stripped.length && depth > 0) {
      if (stripped[i] === '(') depth++;
      else if (stripped[i] === ')') depth--;
      i++;
    }
    sites.push(stripped.slice(re.lastIndex, i - 1).trim());
  }
  return sites;
}

test('LAW 1: no headless code signs a user out globally (bare signOut / scope global)', () => {
  const offenders = [];
  for (const dir of HEADLESS_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const src = readFileSync(file, 'utf8');
      if (!src.includes('signOut')) continue;
      for (const args of signOutCallSites(src)) {
        // auth.admin.signOut(jwt, scope) is the deliberate admin path and is
        // matched by this regex too ('.auth.admin.signOut(' does not contain
        // '.auth.signOut('), so only client-side signOut reaches here.
        const ok = /scope\s*:\s*['"]local['"]/.test(args);
        if (!ok) offenders.push(`${relative(ROOT, file)}: signOut(${args || ''})`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'These call sites can revoke every session a person has, on every device. ' +
      "Use signOut({ scope: 'local' }) - end only the session you created:\n  " +
      offenders.join('\n  ')
  );
});

test('LAW 1 (self-check): the scan sees a bare signOut and a global one', () => {
  assert.deepEqual(signOutCallSites('await anon.auth.signOut();'), ['']);
  assert.deepEqual(signOutCallSites("await x.auth.signOut({ scope: 'global' })"), ["{ scope: 'global' }"]);
  assert.deepEqual(signOutCallSites("await x.auth.signOut({ scope: 'local' }).catch(() => null)"), [
    "{ scope: 'local' }",
  ]);
  // A comment quoting the forbidden form is not a call site.
  assert.deepEqual(signOutCallSites('// called `anon.auth.signOut()` - default scope\n/* x.auth.signOut() */'), []);
});

const LOGIN_PROBE = readFileSync(join(ROOT, 'pages/api/cron/login-probe.js'), 'utf8');

test('LAW 2: login-probe only ever signs in as a dedicated probe account', () => {
  assert.match(
    LOGIN_PROBE,
    /export const PROBE_ACCOUNT_DOMAIN = 'probe\.smarter\.poker'/,
    'the probe-account domain is pinned to probe.smarter.poker'
  );
  assert.match(LOGIN_PROBE, /export function isDedicatedProbeAccount\(/, 'the guard function exists');
  const guardAt = LOGIN_PROBE.indexOf('if (!isDedicatedProbeAccount(email))');
  const loginAt = LOGIN_PROBE.indexOf('anon.auth.signInWithPassword({ email, password })');
  assert.ok(guardAt > 0, 'the handler checks the account before using it');
  assert.ok(loginAt > 0, 'the handler still signs in (the probe still probes)');
  assert.ok(guardAt < loginAt, 'the guard runs BEFORE signInWithPassword, not after');
  assert.match(
    LOGIN_PROBE.slice(guardAt, loginAt),
    /status: 'misconfigured'/,
    'a wrong account is reported as misconfigured and never acted on'
  );
});

test('LAW 2 (behaviour): the guard accepts only @probe.smarter.poker', () => {
  // The route file cannot be imported under plain node (Next.js ESM route),
  // so the helper is evaluated from its own source text - the same text CI
  // deploys.
  const m = LOGIN_PROBE.match(/export function isDedicatedProbeAccount\(email\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'guard source found');
  const fn = new Function(
    'PROBE_ACCOUNT_DOMAIN',
    m[0].replace('export function isDedicatedProbeAccount', 'return function isDedicatedProbeAccount')
  )('probe.smarter.poker');
  assert.equal(fn('probe-login@probe.smarter.poker'), true);
  assert.equal(fn('  Probe-Login@PROBE.smarter.poker  '), true);
  assert.equal(fn('daniel@bekavactrading.com'), false, "a person's account is refused");
  assert.equal(fn('probe-login@smarter.poker'), false, 'the apex domain is not the probe domain');
  assert.equal(fn('x@probe.smarter.poker.evil.com'), false);
  assert.equal(fn(''), false);
  assert.equal(fn(undefined), false);
});

test('LAW 1 (probe): both sign-outs in login-probe are local-scope', () => {
  const sites = signOutCallSites(LOGIN_PROBE);
  assert.equal(sites.length, 2, 'the success path and the failure path each sign out once');
  for (const args of sites) assert.match(args, /scope\s*:\s*'local'/);
});
