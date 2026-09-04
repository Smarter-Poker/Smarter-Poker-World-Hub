/**
 * GUARD: __tests__/openclaw-critical-jobs.test.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * The Club Commander login-bridge probe runs on Open Claw hourly. Until
 * 2026-09-04 its failure reached a journal line, a GitHub issue and a Sentry
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
  assert.match(src, /CRITICAL_JOBS\s*=\s*\{[\s\S]*?'\/api\/commander\/internal\/login-bridge-probe':\s*2/);
});

test('every fire_cron outcome feeds _critical_record (200, non-200, timeout, exception)', () => {
  const body = src.slice(src.indexOf('def fire_cron('), src.indexOf('def fire_script('));
  const calls = body.match(/_critical_record\(path,/g) || [];
  assert.equal(calls.length, 4, 'success, non-200, Timeout and Exception branches must each record');
  assert.match(body, /_critical_record\(path, True\)/);
  assert.match(body, /except requests\.exceptions\.Timeout:[\s\S]*?_critical_record\(path, False/);
});

test('the functional python test passes (page once, recover once, restart-safe state)', () => {
  const r = spawnSync('python3', [path.join(root, 'scripts', 'ci', 'test-openclaw-critical-jobs.py')], {
    encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(r.status, 0, `python test failed:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /critical-jobs: OK/);
});
