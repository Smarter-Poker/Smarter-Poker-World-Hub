/**
 * GUARD: __tests__/openclaw-critical-jobs.test.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * The Club Commander login-bridge probe runs on Open Claw hourly. Until
 * 2026-09-04 its failure reached a journal line, a GitHub issue and a retired error provider
 * event that the exhausted org quota dropped - never a phone. CRITICAL_JOBS
 * pages after two consecutive failures through the same _alert() path the
 * workers healthcheck uses. These pins keep it wired; the functional test in
 * scripts/ci/test-openclaw-critical-jobs.py proves the counting.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'scripts', 'openclaw-cron-dispatcher.py'), 'utf8');

test('the commander login-bridge probe is a critical job with a 2-failure threshold', () => {
  assert.match(src, /CRITICAL_JOBS\s*=\s*\{[\s\S]*?'\/api\/internal\/login-bridge-probe':\s*2/);
});

test('every fire_cron outcome feeds _critical_record (200, non-200, timeout, exception)', () => {
  const body = src.slice(src.indexOf('def fire_cron('), src.indexOf('def fire_script('));
  const calls = body.match(/_critical_record\(path,/g) || [];
  assert.equal(calls.length, 4, 'success, non-200, Timeout and Exception branches must each record');
  assert.match(body, /_critical_record\(path, True\)/);
  assert.match(body, /except requests\.exceptions\.Timeout:[\s\S]*?_critical_record\(path, False/);
});

test('a still-failing critical job re-pages on an escalating ladder', () => {
  // 2026-09-12 to 2026-09-18: the login-bridge probe failed hourly for six
  // days on one SMS, because paging stopped at the first page. The ladder is
  // what stops a missed message from being the whole warning.
  assert.match(src, /CRITICAL_REPAGE_LADDER_S\s*=\s*\(/);
  assert.match(src, /def _critical_repage_due_in\(/);
  assert.match(src, /STILL FAILING/);
  // The ladder must widen rather than repeat one interval, or a flapping job
  // becomes a pager storm.
  const ladder = src.match(/CRITICAL_REPAGE_LADDER_S\s*=\s*\(([^)]*)\)/)[1]
    .split(',').map((n) => Number(n.trim())).filter((n) => Number.isFinite(n));
  assert.ok(ladder.length >= 2, `ladder needs at least two rungs: ${ladder}`);
  for (let i = 1; i < ladder.length; i += 1) {
    assert.ok(ladder[i] > ladder[i - 1], `rung ${i} must be longer than the one before: ${ladder}`);
  }
});

test('the episode survives a restart (ladder fields are persisted and rehydrated)', () => {
  // Slice each function from its own def to the next top-level def, so the
  // bounds cannot drift when neighbouring functions are added or reordered.
  const fn = (name) => {
    const start = src.indexOf(`def ${name}(`);
    assert.ok(start > -1, `${name} not found`);
    const next = src.indexOf('\ndef ', start + 1);
    return src.slice(start, next > -1 ? next : undefined);
  };
  for (const name of ['_alert_bind', '_alert_flush']) {
    const body = fn(name);
    for (const field of ['pages_sent', 'last_page_at', 'failing_since']) {
      assert.ok(body.includes(field), `${name} must carry ${field} across a restart`);
    }
  }
});

test('the functional python test passes (page once, recover once, restart-safe state)', () => {
  const r = spawnSync('python3', [path.join(root, 'scripts', 'ci', 'test-openclaw-critical-jobs.py')], {
    encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(r.status, 0, `python test failed:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /critical-jobs: OK/);
});
