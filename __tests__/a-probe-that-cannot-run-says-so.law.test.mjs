/**
 * LAW: A PROBE THAT CANNOT RUN SAYS SO WHERE PROBES SPEAK
 *
 * 2026-09-04. recovery-probe's PROBE_RECOVERY_EMAIL was empty. It returned
 * {status:'unconfigured'} and exited before its heartbeat insert, so
 * probe_heartbeats held no row from it for at least a day and the
 * auth-health dashboard, which reads that table, showed nothing - a row that
 * does not exist cannot be drawn red. Found by accident while reading a
 * different probe's rows. A monitor that reports nothing wrong because it
 * reports nothing is the shape of the login-probe outage the same day.
 *
 * PINS
 *   1. Every probe under pages/api/cron/ routes its "missing env" early-return
 *      through unconfiguredProbe(), which writes a 'failed' heartbeat with
 *      details.status='unconfigured' and THEN returns the 500.
 *   2. No probe hand-writes a { status: 'unconfigured', error } response.
 *   3. The helper is fail-open: no admin client, or an insert error, still
 *      returns the 500 - it never turns a config gap into a crash.
 *
 * Registry: this repo has no docs/LAWS.md (see horses-phase4 law header).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { unconfiguredProbe } from '../src/lib/probeUnconfigured.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CRON = join(ROOT, 'pages', 'api', 'cron');
const probes = readdirSync(CRON).filter((f) => /probe.*\.js$/.test(f) && !/restricted/.test(f));

test('LAW 1/2: every probe speaks when unconfigured, and none hand-writes the silent form', () => {
  assert.ok(probes.length >= 3, `expected the three probes, found ${probes.join(', ')}`);
  for (const f of probes) {
    const src = readFileSync(join(CRON, f), 'utf8');
    if (!src.includes("'unconfigured'")) continue;
    assert.match(src, /import \{ unconfiguredProbe \} from/, `${f} must import unconfiguredProbe`);
    assert.doesNotMatch(
      src,
      /json\(\{\s*status: 'unconfigured',\s*error:/,
      `${f} hand-writes an unconfigured response that writes no heartbeat - use unconfiguredProbe()`
    );
  }
});

function fakeRes() {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

test('LAW 3 (behaviour): writes the heartbeat first, then the 500; fail-open without admin', async () => {
  const rows = [];
  const admin = { from: (t) => ({ insert: async (row) => { rows.push({ t, row }); return { error: null }; } }) };
  const res = fakeRes();
  const origErr = console.error; console.error = () => {};
  try {
    await unconfiguredProbe(res, admin, 'recovery-probe', 'Missing PROBE_RECOVERY_EMAIL');
  } finally { console.error = origErr; }
  assert.equal(rows.length, 1);
  assert.equal(rows[0].t, 'probe_heartbeats');
  assert.equal(rows[0].row.probe_name, 'recovery-probe');
  assert.equal(rows[0].row.status, 'failed');
  assert.equal(rows[0].row.details.status, 'unconfigured');
  assert.equal(res.code, 500);
  assert.equal(res.body.status, 'unconfigured');

  // No admin (the service key itself is what is missing): still answers.
  const res2 = fakeRes();
  console.error = () => {};
  try { await unconfiguredProbe(res2, null, 'signup-probe', 'Missing key'); } finally { console.error = origErr; }
  assert.equal(res2.code, 500);

  // Insert error: still answers.
  const bad = { from: () => ({ insert: async () => ({ error: { message: 'boom' } }) }) };
  const res3 = fakeRes();
  const origWarn = console.warn; console.warn = () => {}; console.error = () => {};
  try { await unconfiguredProbe(res3, bad, 'login-probe', 'x'); } finally { console.warn = origWarn; console.error = origErr; }
  assert.equal(res3.code, 500);
});
