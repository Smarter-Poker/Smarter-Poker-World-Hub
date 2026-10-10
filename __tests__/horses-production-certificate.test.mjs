import { sanitizedMutationPath } from '../scripts/lib/horses-certificate-diagnostics.mjs';
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
  assert.match(verifier, /path: sanitizedMutationPath\(requestUrl, PRODUCTION_ORIGIN\)/);
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


test('mutation labels expose only fixed same-origin endpoints without queries', () => {
  const origin = 'https://smarter.poker';
  for (const path of ['/api/horses/stable-admin', '/api/auth/ensure-profile', '/api/user/get-header-stats', '/api/pwa/prompt-status', '/api/rewards/eggs/evaluate']) {
    assert.equal(sanitizedMutationPath(new URL(`${origin}${path}?userId=private&token=private`), origin), path);
    assert.equal(sanitizedMutationPath(new URL(`https://foreign.example${path}`), origin), '[redacted]');
  }
  for (const path of ['/api/private', '/api/auth/ensure-profile/private-id', '/api/user/12345678-1234-1234-1234-123456789012']) {
    assert.equal(sanitizedMutationPath(new URL(`${origin}${path}`), origin), '[redacted]');
  }
});

test('live floor proof follows the shipped control disclosure and reads its actual engine contract', async () => {
  const floor = await readFile(new URL('../src/components/horses/FloorPanel.jsx', import.meta.url), 'utf8');
  const disclosure = 'Live Table Evidence With Global Pause, Park, Resume And Cash-Table Closure.';
  assert.ok(floor.includes(disclosure));
  assert.ok(verifier.includes(disclosure), 'live proof must await the disclosure the console ships');
  assert.doesNotMatch(verifier, /Owner Pause, Resume And Empty-Table Close Stay In Club Arena/);
  assert.match(verifier, /waitForApi\(apiStatuses, '\/api\/horses\/engine-control'\)/);
  assert.match(verifier, /engine_contract_unverified/);
  assert.match(verifier, /SAFE_METHODS = new Set\(\['GET', 'HEAD', 'OPTIONS'\]\)/);
});

test('audit certificate visits all three changed read consumers inside each viewport and records fixed metadata only', async () => {
  const consumers = [
    ['players', 'Players', 'Loading Players', '/api/horses/player-admin'],
    ['geeves', 'Geeves Knowledge Base', 'Loading Geeves Analytics', '/api/geeves/analytics'],
    ['scrapers', 'Scraper Health', 'Loading Scraper Status', '/api/admin/scraper-health'],
  ];
  const probe = verifier.slice(verifier.indexOf('async function probeViewport'), verifier.indexOf('let browser;'));
  for (const [tab, heading, loading, path] of consumers) {
    assert.ok(probe.includes(`waitForPanel(page, '${tab}', '${heading}')`));
    assert.ok(probe.includes(`waitForAuditRead(apiStatuses, '${path}'`));
    assert.ok(probe.includes(`assertAuditPanelSettled(page, '${tab}', '${loading}')`));
    assert.ok(probe.includes(`assertNoOverflow(page, viewport, '${tab}'`));
    const component = await readFile(new URL(`../src/components/horses/${tab === 'players' ? 'Players' : tab === 'geeves' ? 'Geeves' : 'Scrapers'}Panel.jsx`, import.meta.url), 'utf8');
    assert.ok(component.includes(heading));
    assert.ok(component.includes(loading));
  }
  assert.match(verifier, /AUDIT_API_PATHS = \['\/api\/geeves\/analytics', '\/api\/admin\/scraper-health'\]/);
  assert.match(probe, /waitForAuditRead\(apiStatuses, '\/api\/geeves\/analytics', 'summary'\)/);
  assert.match(probe, /waitForAuditRead\(apiStatuses, '\/api\/geeves\/analytics', 'top_missed'\)/);
  assert.match(probe, /auditConsumers: \['players', 'geeves', 'scrapers'\]/);
  assert.match(verifier, /for \(const viewport of VIEWPORTS\)[\s\S]*probeViewport\(browser, storageState, viewport\)/);
  assert.doesNotMatch(probe, /openPlayer|mark_resolved|page\.getByRole\('button', \{ name: 'Search'/);
  assert.match(verifier, /matches.length > 0,.*not_observed/);
});

function auditHelpers(clock = Date) {
  const start = verifier.indexOf('async function waitForAuditRead(');
  const end = verifier.indexOf('async function probeViewport(', start);
  assert.ok(start >= 0 && end > start, 'maintained verifier owns the audit helpers');
  return new Function('requireCondition', 'CertificateFailure', 'Date', 'setTimeout', `${verifier.slice(start, end)}; return { waitForAuditRead, assertAuditPanelSettled };`)(
    (value, code) => { if (!value) throw new Error(code); }, Error, clock, (resolveWait) => resolveWait(),
  );
}

test('audit API observations refuse missing reads, wrong action, non-GET and non-2xx instead of empty success', async () => {
  let time = 0;
  const { waitForAuditRead } = auditHelpers({ now: () => { time += 10_001; return time; } });
  await assert.rejects(waitForAuditRead([], '/api/admin/scraper-health'), /not_observed/);
  await assert.rejects(waitForAuditRead([{ path: '/api/geeves/analytics', readAction: 'summary', method: 'GET', status: 200 }], '/api/geeves/analytics', 'top_missed'), /not_observed/);
  for (const entry of [{ method: 'POST', status: 200 }, { method: 'GET', status: 403 }, { method: 'GET', status: 503 }]) {
    await assert.rejects(waitForAuditRead([{ path: '/api/admin/scraper-health', ...entry }], '/api/admin/scraper-health'), /not_2xx/);
  }
  await waitForAuditRead([{ path: '/api/geeves/analytics', readAction: 'top_missed', method: 'GET', status: 200 }], '/api/geeves/analytics', 'top_missed');
});

test('audit panel settlement refuses lingering loading, raw list errors, alerts and failed waits', async () => {
  const { assertAuditPanelSettled } = auditHelpers();
  const page = (loadingCount, errorCount, waitError = null) => ({ locator: () => ({
    getByText: () => ({ waitFor: async () => { if (waitError) throw waitError; }, count: async () => loadingCount }),
    locator: (selector) => {
      assert.ok(selector.includes('errorNote') && selector.includes('errorState') && selector.includes('role="alert"'));
      return { count: async () => errorCount };
    },
  }) });
  await assert.rejects(assertAuditPanelSettled(page(1, 0), 'players', 'Loading Players'), /still_loading/);
  await assert.rejects(assertAuditPanelSettled(page(0, 1), 'players', 'Loading Players'), /audit_read_failure/);
  await assert.rejects(assertAuditPanelSettled(page(0, 0, new Error('loading wait failed')), 'geeves', 'Loading Geeves Analytics'), /loading wait failed/);
  await assertAuditPanelSettled(page(0, 0), 'scrapers', 'Loading Scraper Status');
});
