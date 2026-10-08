import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const BASE_URL = process.env.HORSES_VERIFY_BASE_URL || '';
const EXPECTED_SHA = process.env.HORSES_VERIFY_EXPECTED_SHA || '';
const RECEIPT_PATH = resolve(process.env.HORSES_VERIFY_RECEIPT || 'horses-production-certificate.json');
const EMAIL = process.env.TEST_USER_EMAIL || '';
const PASSWORD = process.env.TEST_USER_PASSWORD || '';
const PRODUCTION_ORIGIN = 'https://smarter.poker';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const REQUIRED_TABS = ['floor', 'tournaments', 'integrity', 'platform', 'economy'];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile-375', width: 375, height: 812 },
];

const receipt = {
  schemaVersion: 1,
  kind: 'stable-admin-production-certificate',
  status: 'running',
  startedAt: new Date().toISOString(),
  completedAt: null,
  provenance: {
    repositorySha: process.env.GITHUB_SHA || null,
    runId: process.env.GITHUB_RUN_ID || null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  },
  target: {
    host: null,
    expectedSha: EXPECTED_SHA || null,
    observedSha: null,
    deploymentId: null,
    deploymentUrl: null,
    databaseStatus: null,
    stableAcrossRun: false,
  },
  authenticated: false,
  viewports: [],
  failedViewport: null,
  failureCode: null,
};

class CertificateFailure extends Error {
  constructor(code) {
    super(code);
    this.name = 'CertificateFailure';
    this.code = code;
  }
}

function requireCondition(value, code) {
  if (!value) throw new CertificateFailure(code);
}

async function saveReceipt() {
  await mkdir(dirname(RECEIPT_PATH), { recursive: true });
  await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
}

function productionUrl(pathname) {
  return new URL(pathname, BASE_URL).toString();
}

async function readHealth() {
  const response = await fetch(productionUrl('/api/health'), {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    cache: 'no-store',
    redirect: 'error',
  });
  requireCondition(response.status === 200, 'health_http_not_200');
  const body = await response.json();
  const observedSha = String(body?.commitSha || body?.version || '');
  requireCondition(body?.status === 'ok', 'health_status_not_ok');
  requireCondition(body?.checks?.db?.status === 'ok', 'health_database_not_ok');
  requireCondition(observedSha === EXPECTED_SHA, 'health_sha_mismatch');
  requireCondition(typeof body?.deploymentId === 'string' && body.deploymentId.startsWith('dpl_'), 'health_deployment_id_missing');
  requireCondition(typeof body?.deploymentUrl === 'string' && body.deploymentUrl.length > 0, 'health_deployment_url_missing');
  return {
    observedSha,
    deploymentId: body.deploymentId,
    deploymentUrl: body.deploymentUrl,
    databaseStatus: body.checks.db.status,
  };
}

async function authenticate(browser) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  try {
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    requireCondition(new URL(page.url()).origin === PRODUCTION_ORIGIN, 'login_left_production_origin');
    const continueToHub = page.getByRole('button', { name: /continue to hub/i });
    if (!new URL(page.url()).pathname.startsWith('/hub')) {
      if (await continueToHub.isVisible()) {
        await continueToHub.click();
      } else {
        await page.locator('input[type="email"]').fill(EMAIL);
        await page.locator('input[type="password"]').fill(PASSWORD);
        await page.locator('button[type="submit"]').click();
        const outcome = await Promise.race([
          page.waitForURL(/\/hub(?:\/|$|\?)/, { timeout: 45_000 }).then(() => 'hub'),
          continueToHub.waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'continue'),
        ]);
        if (outcome === 'continue') await continueToHub.click();
      }
    }
    await page.waitForURL(/\/hub(?:\/|$|\?)/, { timeout: 45_000 });
    requireCondition(new URL(page.url()).origin === PRODUCTION_ORIGIN, 'authenticated_page_left_production_origin');
    const sessionReady = await page.evaluate(() => {
      try {
        const session = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
        if (!session?.access_token || !session?.user?.id) return false;
        localStorage.setItem(`sp_firstrun_notif_v2_${session.user.id}`, String(Date.now()));
        return true;
      } catch {
        return false;
      }
    });
    requireCondition(sessionReady, 'authenticated_session_missing');
    return await context.storageState();
  } finally {
    await context.close();
  }
}

async function waitForPanel(page, tabId, heading) {
  const tab = page.locator(`[role="tab"][data-tabid="${tabId}"]`);
  await tab.scrollIntoViewIfNeeded();
  await tab.click();
  await page.waitForFunction((id) => new URL(location.href).searchParams.get('tab') === id, tabId);
  await page.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
  const panel = page.locator('main[role="tabpanel"]');
  await panel.getByText(/^Loading /).waitFor({ state: 'detached', timeout: 20_000 }).catch(() => {});
  requireCondition(await panel.getByText(/^Loading /).count() === 0, `panel_${tabId}_still_loading`);
  requireCondition(await panel.getByText(/Could Not Be Loaded|The Code For This Tab Did Not Arrive/i).count() === 0, `panel_${tabId}_load_failure`);
}

async function assertNoOverflow(page, viewport, surface, samples) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  requireCondition(
    overflow.body <= 1 && overflow.document <= 1,
    `${viewport.name}_${surface}_horizontal_overflow`
  );
  samples.push({ surface, ...overflow });
}

async function waitForApi(apiStatuses, path, afterCount = 0) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const matches = apiStatuses.filter((entry) => entry.path === path);
    if (matches.length > afterCount) return matches;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new CertificateFailure(`${path.split('/').at(-1)}_not_observed`);
}

async function probeViewport(browser, storageState, viewport) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: viewport.width, height: viewport.height },
    storageState,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const pageErrors = [];
  const chunkFailures = [];
  const apiStatuses = [];
  const mutationAttempts = [];
  const overflowSamples = [];

  page.on('pageerror', () => pageErrors.push('pageerror'));
  page.on('requestfailed', (request) => {
    if (request.resourceType() === 'script' || /\/_next\/static\/chunks\//.test(request.url())) {
      chunkFailures.push('request_failed');
    }
  });
  page.on('response', (response) => {
    const responseUrl = new URL(response.url());
    const path = responseUrl.pathname;
    if ((response.request().resourceType() === 'script' || /\/_next\/static\/chunks\//.test(path)) && response.status() >= 400) {
      chunkFailures.push(`http_${response.status()}`);
    }
    if (responseUrl.origin === PRODUCTION_ORIGIN && path.startsWith('/api/horses/')) {
      apiStatuses.push({ method: response.request().method(), path, status: response.status() });
    }
    // Evidence only: the seated-humans count the console served, so it can be
    // compared with a direct database count taken at the same moment.
    if (responseUrl.origin === PRODUCTION_ORIGIN && path === '/api/horses/platform-admin'
        && responseUrl.searchParams.get('section') === 'engine' && response.status() === 200) {
      response.json().then((body) => {
        const value = body?.database?.humansSeated;
        receipt.platformHumansSeated = {
          value: Number.isInteger(value) ? value : null,
          observedAt: new Date().toISOString(),
          viewport: viewport.name,
        };
      }).catch(() => {});
    }
  });

  await context.route('**/*', async (route) => {
    const method = route.request().method();
    if (!SAFE_METHODS.has(method)) {
      const requestUrl = new URL(route.request().url());
      mutationAttempts.push({
        method,
        scope: requestUrl.origin === PRODUCTION_ORIGIN ? 'production' : 'external',
        path: requestUrl.origin === PRODUCTION_ORIGIN && requestUrl.pathname === '/api/horses/stable-admin'
          ? '/api/horses/stable-admin' : '[redacted]',
      });
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  try {
    await page.goto('/horses?tab=floor', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.getByRole('tablist', { name: 'Stable Admin Tabs' }).waitFor({ state: 'visible', timeout: 45_000 });
    requireCondition(new URL(page.url()).origin === PRODUCTION_ORIGIN, `${viewport.name}_route_left_production_origin`);
    requireCondition(new URL(page.url()).pathname === '/horses', `${viewport.name}_route_not_horses`);
    await page.getByRole('heading', { name: 'STABLE ADMIN', exact: true }).waitFor({ state: 'visible' });

    const tabs = page.getByRole('tablist', { name: 'Stable Admin Tabs' }).getByRole('tab');
    const tabCount = await tabs.count();
    requireCondition(tabCount === 28, `${viewport.name}_tab_count_mismatch`);
    for (const tabId of REQUIRED_TABS) {
      requireCondition(await page.locator(`[role="tab"][data-tabid="${tabId}"]`).count() === 1, `${viewport.name}_${tabId}_tab_missing`);
    }

    await waitForPanel(page, 'floor', 'Live Floor');
    await waitForApi(apiStatuses, '/api/horses/floor-admin');
    await page.getByText('Owner Pause, Resume And Empty-Table Close Stay In Club Arena.', { exact: false }).waitFor({ state: 'visible' });
    await assertNoOverflow(page, viewport, 'floor', overflowSamples);

    const floorReadsBeforeTournaments = apiStatuses.filter((entry) => entry.path === '/api/horses/floor-admin').length;
    await waitForPanel(page, 'tournaments', 'Tournaments');
    await waitForApi(apiStatuses, '/api/horses/floor-admin', floorReadsBeforeTournaments);
    await page.getByText(/Tournament Oversight Is (Read-Only|Partial)|Database And Engine Tournament Counts Disagree/).waitFor({ state: 'visible' });
    await assertNoOverflow(page, viewport, 'tournaments', overflowSamples);

    await waitForPanel(page, 'integrity', 'Integrity');
    const integrityReadsBeforeLinks = apiStatuses.filter((entry) => entry.path === '/api/horses/integrity-admin').length;
    await page.getByRole('tab', { name: 'Identity Links', exact: true }).click();
    await waitForApi(apiStatuses, '/api/horses/integrity-admin', integrityReadsBeforeLinks);
    await page.getByRole('heading', { name: 'Identity Link Correlation', exact: true }).waitFor({ state: 'visible' });
    await page.getByText('A Link Is Never A Verdict.', { exact: false }).waitFor({ state: 'visible' });
    await assertNoOverflow(page, viewport, 'identity-links', overflowSamples);

    await waitForPanel(page, 'platform', 'Platform Operations');
    const platformReadsBeforeIncidents = apiStatuses.filter((entry) => entry.path === '/api/horses/platform-admin').length;
    await page.getByRole('button', { name: 'Incidents', exact: true }).click();
    await waitForApi(apiStatuses, '/api/horses/platform-admin', platformReadsBeforeIncidents);
    await page.getByRole('heading', { name: 'Platform Incidents', exact: true }).waitFor({ state: 'visible' });
    await assertNoOverflow(page, viewport, 'incidents', overflowSamples);

    await waitForPanel(page, 'economy', 'Economy Command');
    const economyReadsBeforeClose = apiStatuses.filter((entry) => entry.path === '/api/horses/economy-admin').length;
    await page.getByRole('button', { name: 'Close And Jobs', exact: true }).click();
    await waitForApi(apiStatuses, '/api/horses/economy-admin', economyReadsBeforeClose);
    for (const heading of ['Durable Profit And Loss Snapshot', 'Signed Daily Closes', 'Durable Weekly Digest Runs', 'Prepared Export Receipts']) {
      await page.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
    }

    await page.waitForFunction(() => !document.body.innerText.includes('Reading Economy Evidence...'), null, { timeout: 20_000 });
    await assertNoOverflow(page, viewport, 'close-and-jobs', overflowSamples);
    const requiredApiPaths = [
      '/api/horses/floor-admin',
      '/api/horses/integrity-admin',
      '/api/horses/platform-admin',
      '/api/horses/economy-admin',
    ];
    for (const path of requiredApiPaths) {
      const matches = apiStatuses.filter((entry) => entry.path === path);
      requireCondition(matches.every((entry) => entry.status >= 200 && entry.status < 300), `${viewport.name}_${path.split('/').at(-1)}_not_2xx`);
    }
    requireCondition(mutationAttempts.length === 0, `${viewport.name}_mutation_attempted`);
    requireCondition(pageErrors.length === 0, `${viewport.name}_page_error`);
    requireCondition(chunkFailures.length === 0, `${viewport.name}_chunk_failure`);

    return {
      name: viewport.name,
      width: viewport.width,
      height: viewport.height,
      pathname: new URL(page.url()).pathname,
      tabCount,
      requiredTabs: true,
      phase11Surfaces: true,
      overflowPx: overflowSamples,
      pageErrorCount: pageErrors.length,
      chunkFailureCount: chunkFailures.length,
      apiStatuses,
      mutationAttemptCount: mutationAttempts.length,
    };
  } catch (error) {
    // Preserve counts and the known static offender even when a viewport fails.
    // Never retain arbitrary URL segments, queries, bodies or authentication.
    receipt.failedViewport = {
      name: viewport.name,
      pageErrorCount: pageErrors.length,
      chunkFailureCount: chunkFailures.length,
      mutationAttemptCount: mutationAttempts.length,
      mutationAttempts: mutationAttempts.slice(0, 20),
    };
    throw error;
  } finally {
    await context.close();
  }
}

let browser;
try {
  requireCondition(BASE_URL === PRODUCTION_ORIGIN, 'base_url_not_production');
  requireCondition(/^[0-9a-f]{40}$/.test(EXPECTED_SHA), 'expected_sha_invalid');
  requireCondition(Boolean(EMAIL), 'test_user_email_missing');
  requireCondition(Boolean(PASSWORD), 'test_user_password_missing');
  receipt.target.host = new URL(BASE_URL).host;
  await saveReceipt();

  const healthBefore = await readHealth();
  Object.assign(receipt.target, healthBefore);
  await saveReceipt();

  browser = await chromium.launch({ headless: true });
  const storageState = await authenticate(browser);
  receipt.authenticated = true;
  await saveReceipt();

  for (const viewport of VIEWPORTS) {
    receipt.viewports.push(await probeViewport(browser, storageState, viewport));
    await saveReceipt();
  }

  const healthAfter = await readHealth();
  requireCondition(healthAfter.observedSha === healthBefore.observedSha, 'deployment_sha_changed_during_run');
  requireCondition(healthAfter.deploymentId === healthBefore.deploymentId, 'deployment_id_changed_during_run');
  receipt.target.stableAcrossRun = true;
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failureCode = error instanceof CertificateFailure ? error.code : 'unexpected_verifier_failure';
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  receipt.completedAt = new Date().toISOString();
  await saveReceipt();
  process.stdout.write(`${JSON.stringify({
    status: receipt.status,
    expectedSha: receipt.target.expectedSha,
    observedSha: receipt.target.observedSha,
    deploymentId: receipt.target.deploymentId,
    authenticated: receipt.authenticated,
    viewports: receipt.viewports.map(({ name, width, height }) => ({ name, width, height })),
    failureCode: receipt.failureCode,
  })}\n`);
}
