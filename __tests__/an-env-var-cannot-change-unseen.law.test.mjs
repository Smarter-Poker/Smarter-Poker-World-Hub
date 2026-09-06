/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  LAW: AN ENVIRONMENT VARIABLE CANNOT CHANGE UNSEEN, AND THE WATCHER NEVER
 *       HOLDS A SECRET TO DO IT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Realtime Connections Programme, phase 7 - guardrails.
 *
 * THE TWENTY-TWO HOURS BEGAN WITH ONE ENVIRONMENT VARIABLE. On 2026-09-03 at
 * 20:15 UTC `PROBE_LOGIN_EMAIL` was pointed at Dan's own account in the Vercel
 * dashboard. `/api/cron/login-probe` then signed in as him every fifteen
 * minutes and called a global `signOut()`; every Club Arena table he opened
 * said "Reconnecting To The Table" until somebody worked it out by hand the
 * next day. Every code path was correct. The change left no commit, no log
 * line and no notification, and nothing on this platform could have told you
 * it had happened.
 *
 * PINS
 *   1. The detector exists and is WIRED - a script nobody runs is a comment.
 *   2. It never asks Vercel to decrypt, and never records or prints a value.
 *      A drift detector that had to hold the secrets to notice they moved
 *      would be a worse problem than the one it solves.
 *   3. It exits 2 when it cannot ask. A check that goes green when it can see
 *      nothing is the bug it exists to catch - the same rule
 *      check-cron-fleet-alive was written under.
 *   4. The committed baseline holds shape only, and still names the variable
 *      the outage turned on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER_REL = 'scripts/ci/check-vercel-env-drift.mjs';
const CHECKER = readFileSync(join(ROOT, CHECKER_REL), 'utf8');
/** Comments explain the rules; the rules have to be in the code. */
const CODE = CHECKER.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
const WATCHDOG = readFileSync(join(ROOT, '.github/workflows/publish-watchdog.yml'), 'utf8');

test('LAW 1: the detector is wired into a workflow that actually runs', () => {
  assert.ok(existsSync(join(ROOT, CHECKER_REL)), `${CHECKER_REL} is missing`);
  // The RUN LINE, not a mention of it. The first version of this pin matched
  // anywhere in the file and passed when the run step was replaced by `echo
  // skipped`, because the issue body below still named the script. A pin
  // satisfied by prose is not a pin.
  assert.match(
    WATCHDOG,
    /node scripts\/ci\/check-vercel-env-drift\.mjs 2>&1 \| tee \/tmp\/env-drift\.log/,
    'publish-watchdog.yml must actually RUN the detector - a script nobody runs is a comment'
  );
  // And its non-zero exit has to reach a human.
  assert.match(WATCHDOG, /steps\.env-drift\.outputs\.code == '1'/);
  assert.match(WATCHDOG, /gh issue create/);
  // It rides an existing schedule rather than adding one (CLAUDE.md 11.4).
  assert.doesNotMatch(
    WATCHDOG.slice(WATCHDOG.indexOf('env-drift')),
    /^\s*schedule:/m,
    'it must ride publish-watchdog, not add a schedule: trigger of its own'
  );
});

test('LAW 2: it never decrypts, and never carries a value', () => {
  assert.ok(!/decrypt/i.test(CODE), 'the checker must never ask Vercel to decrypt an env var');
  // The one function that shapes an API entry must not copy `value` through.
  const shape = CODE.slice(CODE.indexOf('export function shapeOf'), CODE.indexOf('async function liveShape'));
  assert.ok(shape.length > 40, 'shapeOf not found - the scan is broken, not the code');
  assert.ok(!/value/.test(shape), 'shapeOf must not carry a value field out of the API response');
  for (const field of ['key', 'target', 'type', 'updatedAt']) {
    assert.ok(shape.includes(field), `shapeOf should record ${field}`);
  }
});

test('LAW 3: it exits 2 when it cannot ask, never 0', () => {
  // Three ways of not being able to see: no token, the API refusing, no
  // baseline. None of them is a pass.
  const noToken = CODE.slice(CODE.indexOf('VERCEL_TOKEN ||'), CODE.indexOf('let live'));
  assert.match(noToken, /process\.exit\(2\)/, 'a missing token is a check that could not run');
  const cannotAsk = CODE.slice(CODE.indexOf('catch (err)'), CODE.indexOf("--update"));
  assert.match(cannotAsk, /process\.exit\(2\)/, 'an unreachable Vercel API is not a pass');
  assert.match(CODE, /no baseline[\s\S]{0,400}?process\.exit\(2\)/, 'a missing baseline is not a pass');
});

test('LAW 4: the baseline is shape only, and still names the variable that did it', () => {
  const p = join(ROOT, 'scripts/ci/vercel-env-baseline.json');
  assert.ok(existsSync(p), 'scripts/ci/vercel-env-baseline.json is missing');
  const base = JSON.parse(readFileSync(p, 'utf8'));
  assert.ok(Array.isArray(base.env) && base.env.length > 20, 'the baseline looks empty');
  for (const e of base.env) {
    assert.ok(!('value' in e), `a value leaked into the baseline for ${e.key}`);
    assert.deepEqual(Object.keys(e).sort(), ['key', 'target', 'type', 'updatedAt']);
  }
  assert.ok(
    base.env.some((e) => e.key === 'PROBE_LOGIN_EMAIL'),
    'PROBE_LOGIN_EMAIL is the variable the outage turned on - if it is not in the baseline, the detector is watching the wrong project'
  );
});
