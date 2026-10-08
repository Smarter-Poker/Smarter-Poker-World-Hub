import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/horses-production-certificate.yml', import.meta.url);
const verifierPath = new URL('../scripts/verify-horses-production-certificate.mjs', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');
const verifier = await readFile(verifierPath, 'utf8');

test('production certificate is manual, immutable-revision, and service-account only', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+schedule:/m);
  assert.doesNotMatch(workflow, /^\s+deployment_status:/m);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ inputs\.expected_sha \}\}/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /HORSES_VERIFY_BASE_URL: https:\/\/smarter\.poker/);
  assert.match(workflow, /TEST_USER_EMAIL: \$\{\{ vars\.TEST_USER_EMAIL \|\| secrets\.TEST_USER_EMAIL \}\}/);
  assert.match(workflow, /TEST_USER_PASSWORD: \$\{\{ secrets\.TEST_USER_PASSWORD \}\}/);
  assert.match(workflow, /node scripts\/verify-horses-production-certificate\.mjs/);
  assert.match(workflow, /node-version: 24\.12\.0/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /if: always\(\)[\s\S]*horses-production-certificate\.json/);
  assert.doesNotMatch(workflow, /playwright-report|storageState|\.auth\/|screenshot|trace|video/);
});

test('verifier binds both viewport passes to one healthy production deployment', () => {
  assert.match(verifier, /BASE_URL === PRODUCTION_ORIGIN/);
  assert.match(verifier, /width: 1440, height: 900/);
  assert.match(verifier, /width: 375, height: 812/);
  assert.match(verifier, /healthBefore = await readHealth\(\)/);
  assert.match(verifier, /healthAfter = await readHealth\(\)/);
  assert.match(verifier, /deployment_sha_changed_during_run/);
  assert.match(verifier, /deployment_id_changed_during_run/);
  assert.match(verifier, /body\?\.checks\?\.db\?\.status === 'ok'/);
  assert.match(verifier, /serviceWorkers: 'block'/);
  assert.match(verifier, /panel_\$\{tabId\}_still_loading/);
  assert.match(verifier, /new URL\(page\.url\(\)\)\.origin === PRODUCTION_ORIGIN/);
  assert.match(verifier, /responseUrl\.origin === PRODUCTION_ORIGIN/);
  assert.doesNotMatch(verifier, /page\.route\([^)]*fulfill|route\.fulfill/);
});

test('verifier covers Phase 11 surfaces and blocks admin mutations', () => {
  for (const token of [
    "'floor'", "'tournaments'", "'integrity'", "'platform'", "'economy'",
    "'Identity Link Correlation'", "'Platform Incidents'",
    "'Durable Profit And Loss Snapshot'", "'Signed Daily Closes'",
    "'Durable Weekly Digest Runs'", "'Prepared Export Receipts'",
  ]) assert.ok(verifier.includes(token), `missing ${token}`);
  assert.match(verifier, /SAFE_METHODS = new Set\(\['GET', 'HEAD', 'OPTIONS'\]\)/);
  assert.match(verifier, /context\.route\('\*\*\/\*'/);
  assert.match(verifier, /route\.abort\('blockedbyclient'\)/);
  assert.match(verifier, /mutationAttempts\.length === 0/);
  assert.match(verifier, /tab\.scrollIntoViewIfNeeded\(\)/);
  assert.match(verifier, /await tab\.click\(\)/);
  for (const surface of ['floor', 'tournaments', 'identity-links', 'incidents', 'close-and-jobs']) {
    assert.match(verifier, new RegExp(`assertNoOverflow\\(page, viewport, '${surface}'`));
  }
});

test('receipt schema contains only sanitized operational evidence', () => {
  const receiptSchema = verifier.slice(
    verifier.indexOf('const receipt = {'),
    verifier.indexOf('class CertificateFailure'),
  );
  for (const forbidden of ['email:', 'userId:', 'accessToken:', 'token:', 'cookie:', 'headers:', 'body:', 'localStorage:']) {
    assert.ok(!receiptSchema.includes(forbidden), `receipt must not define ${forbidden}`);
  }
  assert.match(verifier, /failureCode: null/);
  assert.match(verifier, /pageErrorCount/);
  assert.match(verifier, /chunkFailureCount/);
  assert.match(verifier, /mutationAttemptCount/);
  assert.match(verifier, /apiStatuses/);
});


test('failed viewport diagnostics retain bounded counts without arbitrary URLs', () => {
  assert.match(verifier, /receipt.failedViewport =/);
  assert.match(verifier, /mutationAttempts: mutationAttempts.slice\(0, 20\)/);
  assert.match(verifier, /\? '\/api\/horses\/stable-admin' : '\[redacted\]'/);
  assert.doesNotMatch(verifier, /path: requestUrl.pathname/);
});


test('read-only certificate includes later fleet, settings and retired-pipeline consumers', () => {
  for (const [tab, heading, surface] of [['stats', 'Platform Statistics', 'statistics'], ['settings', 'Engine Settings', 'settings'], ['pipeline', 'Content Pipeline', 'pipeline']]) {
    assert.ok(verifier.includes(`waitForPanel(page, '${tab}', '${heading}')`));
    assert.ok(verifier.includes(`assertNoOverflow(page, viewport, '${surface}'`));
  }
  assert.match(verifier, /analytics_unavailable/);
  assert.match(verifier, /posting_modes_unavailable/);
  assert.match(verifier, /pipeline_unavailable/);
  assert.match(verifier, /laterConsumers: \['statistics', 'settings', 'pipeline'\]/);
});
