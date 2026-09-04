/**
 * GUARD: __tests__/openclaw-workers-secret.test.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Pins the fix for the 2026-08-31 workers-hop outage.
 *
 * The Open Claw dispatcher talks to TWO services that each validate a bearer
 * token: Vercel (smarter.poker) and the workers VM (private 10.0.0.x). It
 * used to send the SAME `CRON_SECRET` to both. When Vercel's copy was rotated
 * and the workers VM's was not, repairing the dispatcher for Vercel broke it
 * for workers, and 58 scheduled jobs answered
 * `401 {"error":"unauthorized"}` continuously from 2026-08-31 09:00:00 UTC.
 * Nothing noticed for a day: the workers healthcheck pings the UNAUTHENTICATED
 * /health, and the auth-drift watchdog only probed Vercel.
 *
 * Every assertion below is one half of that bug. If you are here because one
 * went red, you have re-merged the two credentials or removed the detection.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(
  path.join(root, 'scripts', 'openclaw-cron-dispatcher.py'),
  'utf8',
);

test('the dispatcher reads a workers-specific secret, falling back to CRON_SECRET', () => {
  assert.match(
    src,
    /WORKERS_CRON_SECRET\s*=\s*os\.environ\.get\('WORKERS_CRON_SECRET',\s*''\)\.strip\(\)\s*or\s*CRON_SECRET/,
    'WORKERS_CRON_SECRET must be defined with a CRON_SECRET fallback',
  );
});

test('fire_cron sends the workers secret on the workers hop and CRON_SECRET on the Vercel hop', () => {
  const body = src.slice(src.indexOf('def fire_cron('), src.indexOf('def fire_script('));
  assert.ok(body.length > 0, 'fire_cron not found');

  // The workers branch must select WORKERS_CRON_SECRET...
  assert.match(body, /target_label\s*=\s*'workers'\s*\n\s*secret\s*=\s*WORKERS_CRON_SECRET/);
  // ...and the Vercel branch must select CRON_SECRET.
  assert.match(body, /target_label\s*=\s*'vercel'\s*\n\s*secret\s*=\s*CRON_SECRET/);
  // The header must use the per-target choice, never the global directly.
  assert.match(body, /'Authorization':\s*f'Bearer \{secret\}'/);
  assert.ok(
    !/'Authorization':\s*f'Bearer \{CRON_SECRET\}'/.test(body),
    'fire_cron must not hardcode CRON_SECRET for both hops again',
  );
});

test('the auth-drift watchdog proves the workers hop, not just Vercel', () => {
  const body = src.slice(
    src.indexOf('def _auth_drift_watchdog_job('),
    src.indexOf('def _percentile('),
  );
  assert.ok(body.length > 0, '_auth_drift_watchdog_job not found');

  // It must actually call the workers host with the workers secret.
  assert.match(body, /WORKERS_BASE_URL/, 'watchdog must probe the workers base URL');
  assert.match(body, /Bearer \{WORKERS_CRON_SECRET\}/, 'watchdog must present the workers secret');

  // A 401 from workers must be a FAILURE (which pages), not a log line.
  assert.match(
    body,
    /status_code\s*==\s*401[\s\S]{0,400}?failures\.append\([\s\S]{0,200}?workers/,
    'a workers 401 must be appended to failures so the watchdog pages',
  );

  // Only a 404 counts as proof: the /cron/* bearer middleware runs before
  // routing, so an accepted secret falls through to "no such route" and
  // executes nothing. Anything else is inconclusive, never a pass.
  assert.match(
    body,
    /status_code\s*==\s*404[\s\S]{0,200}?verified\.append\('WORKERS_CRON_SECRET'\)/,
    'only a 404 (auth passed, route absent) may count as verification',
  );
});

test('the auth-drift watchdog proves the Vercel hop through the no-side-effect probe', () => {
  // Added 2026-09-04 after an agent "corrected" issue #1306 by claiming a 200
  // from Vercel could not be a pass, on the reasoning that reaching 200 means
  // executing a real cron job. That is true of every OTHER gated route and is
  // exactly why /api/internal/cron-auth-probe exists. Nothing pinned the
  // Vercel side, so the mistake was one edit away from landing. It is pinned
  // now. THE TWO HOPS PROVE THEMSELVES DIFFERENTLY:
  //   Vercel  -> dedicated probe endpoint, 200 = accepted, 404 = not deployed
  //   workers -> a route that does not exist, 404 = accepted
  const body = src.slice(
    src.indexOf('def _auth_drift_watchdog_job('),
    src.indexOf('def _percentile('),
  );
  assert.ok(body.length > 0, '_auth_drift_watchdog_job not found');

  // It must probe the DEDICATED endpoint. Any real /api/cron/* route would do
  // work on success, which is what makes probing it unusable.
  assert.match(
    body,
    /requests\.get\(\s*'https:\/\/smarter\.poker\/api\/internal\/cron-auth-probe'/,
    'the Vercel hop must probe /api/internal/cron-auth-probe, never a live cron route',
  );
  assert.ok(
    !/requests\.get\(\s*'https:\/\/smarter\.poker\/api\/cron\//.test(body),
    'the watchdog must never probe a real /api/cron/* route - it would execute that job',
  );

  // 401 pages. Rejection is the whole failure mode this watchdog exists for.
  assert.match(
    body,
    /status_code\s*==\s*401[\s\S]{0,200}?failures\.append\([\s\S]{0,120}?CRON_SECRET rejected/,
    'a Vercel 401 must be appended to failures so the watchdog pages',
  );

  // 404 means the probe endpoint is not deployed - absent, NOT verified.
  // Counting it as proof would make an undeployed probe look like a pass.
  assert.match(
    body,
    /status_code\s*==\s*404[\s\S]{0,200}?absent\.append\([\s\S]{0,120}?probe endpoint not deployed/,
    'a Vercel 404 means the probe endpoint is missing and must be recorded absent, not verified',
  );

  // And the terminal else - i.e. 200 - is what verifies CRON_SECRET.
  assert.match(
    body,
    /else:\s*\n\s*verified\.append\('CRON_SECRET'\)/,
    "200 from the dedicated probe is the success gate: the fall-through must verify CRON_SECRET",
  );
});

test('the Vercel probe endpoint the watchdog depends on actually exists', () => {
  // A watchdog pointed at a route nobody shipped reports 404 forever and
  // proves nothing. Deleting this file must break a test, not a cron.
  const probe = path.join(root, 'pages', 'api', 'internal', 'cron-auth-probe.js');
  assert.ok(
    fs.existsSync(probe),
    'pages/api/internal/cron-auth-probe.js must exist - the auth-drift watchdog probes it',
  );
});

test('the horse social and story jobs are still scheduled and still routed to workers', () => {
  // The user-visible symptom of the outage was horses posting nothing and an
  // empty stories row. These are the jobs that produce both.
  for (const job of [
    '/api/cron/horses-social-all',
    '/api/cron/horses-stories',
    '/api/cron/horse-batch/0',
  ]) {
    assert.ok(src.includes(`'${job}'`), `${job} must remain registered`);
  }
});

test('deploy-openclaw.yml does not manage WORKERS_CRON_SECRET', () => {
  const wf = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'deploy-openclaw.yml'),
    'utf8',
  );
  // The runner cannot reach the private workers VM, so it cannot prove a
  // candidate before writing it. An unproven write is what caused the
  // original incident; it must stay host-local.
  assert.ok(
    !/secrets\.WORKERS_CRON_SECRET/.test(wf),
    'WORKERS_CRON_SECRET must not be stamped from GitHub secrets - it cannot be proved from the runner',
  );
  assert.match(
    wf,
    /WORKERS_CRON_SECRET is deliberately NOT managed here/,
    'the reason it is host-local must stay documented next to the code that would break it',
  );
});
