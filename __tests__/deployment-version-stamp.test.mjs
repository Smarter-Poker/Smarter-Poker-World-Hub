import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const nextConfig = readFileSync(new URL('../next.config.js', import.meta.url), 'utf8');
const healthRoute = readFileSync(new URL('../pages/api/health/index.js', import.meta.url), 'utf8');
const signupHealthRoute = readFileSync(new URL('../pages/api/health/signup.js', import.meta.url), 'utf8');

test('the build stamps its checked-out Git revision when Vercel metadata is absent', () => {
  assert.match(nextConfig, /execFileSync\('git', \['rev-parse', 'HEAD'\]/);
  assert.match(nextConfig, /env:\s*{\s*BUILD_COMMIT_SHA: buildCommitSha/);
});

test('production health surfaces use the immutable build stamp as their fallback', () => {
  const versionFallback = /process\.env\.VERCEL_GIT_COMMIT_SHA \|\| process\.env\.BUILD_COMMIT_SHA \|\| 'local'/;
  assert.match(healthRoute, versionFallback);
  assert.match(signupHealthRoute, versionFallback);
  assert.doesNotMatch(healthRoute, /\.substring\(0,\s*8\)/,
    'the release health contract must expose the exact merge SHA, not a prefix');
});

test('production health cannot hang indefinitely on its database probe', () => {
  // The single flat `DB_HEALTH_TIMEOUT_MS = 3000` this used to pin was split
  // in two on 2026-09-02: a cold lambda could not finish DNS + TLS + its first
  // PostgREST round trip inside 3000ms, so /api/health reported `degraded` on
  // every cold start while the database was answering the same query in 431ms
  // for a warm client.
  //
  // The intent of this test is unchanged and is what still matters — the probe
  // must be BOUNDED. Both bounds are pinned so neither can quietly become an
  // open-ended wait.
  assert.match(healthRoute, /const DB_HEALTH_TIMEOUT_WARM_MS = 3000/);
  assert.match(healthRoute, /const DB_HEALTH_TIMEOUT_COLD_MS = 8000/);
  assert.match(healthRoute, /const COLD_START_WINDOW_S = 10/);
  assert.match(healthRoute, /new AbortController\(\)/);
  assert.match(healthRoute, /\.abortSignal\(controller\.signal\)/);
  assert.match(healthRoute, /Promise\.race\(\[query, timeout\]\)/);
  assert.match(healthRoute, /clearTimeout\(timeoutId\)/);
  assert.match(healthRoute, /HEALTH_DB_TIMEOUT/);
});

test('a missing service key is reported as itself, not as a timeout', () => {
  // The anon key is denied on `profiles` (42501), so a health check that fell
  // back to it could never pass — it would surface as a mysterious timeout
  // rather than naming the variable that is missing.
  assert.match(healthRoute, /HEALTH_DB_NO_SERVICE_KEY/);
  assert.match(healthRoute, /SUPABASE_SERVICE_ROLE_KEY is not set/);
});
