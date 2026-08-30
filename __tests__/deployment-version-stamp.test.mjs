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
});

test('production health cannot hang indefinitely on its database probe', () => {
  assert.match(healthRoute, /const DB_HEALTH_TIMEOUT_MS = 3000/);
  assert.match(healthRoute, /new AbortController\(\)/);
  assert.match(healthRoute, /\.abortSignal\(controller\.signal\)/);
  assert.match(healthRoute, /Promise\.race\(\[query, timeout\]\)/);
  assert.match(healthRoute, /clearTimeout\(timeoutId\)/);
  assert.match(healthRoute, /HEALTH_DB_TIMEOUT/);
});
