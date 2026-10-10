import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { admitExportRequest, admitDownload, confirmJob, recoveryOptions, observeJob, verifyDownloadedStream } from './lib/horses-export-delivery-contract.mjs';
const BASE_URL = process.env.HORSES_VERIFY_BASE_URL || '';
const EXPECTED_SHA = process.env.HORSES_VERIFY_EXPECTED_SHA || '';
const EMAIL = process.env.TEST_USER_EMAIL || '', PASSWORD = process.env.TEST_USER_PASSWORD || '';
const PRODUCTION_ORIGIN = 'https://smarter.poker';
const RECEIPT_PATH = resolve(process.env.HORSES_VERIFY_RECEIPT || 'horses-export-delivery.json');
const receipt = { schemaVersion: 1, kind: 'stable-admin-export-delivery', status: 'running', startedAt: new Date().toISOString(), completedAt: null, target: { expectedSha: EXPECTED_SHA }, operationId: null, jobId: null, state: null, rows: null, download: null, admittedExportRequests: 0, blockedMutations: 0, failureCode: null, provenance: { repositorySha: process.env.GITHUB_SHA || null, runId: process.env.GITHUB_RUN_ID || null, runAttempt: process.env.GITHUB_RUN_ATTEMPT || null } };
function requireCondition(value, code) { if (!value) throw new Error(code); }
async function health() {
  const response = await fetch(`${BASE_URL}/api/health`, { cache: 'no-store', redirect: 'error' });
  requireCondition(response.status === 200, 'health_http_failed');
  const body = await response.json();
  requireCondition(body.status === 'ok' && body.checks?.db?.status === 'ok', 'health_not_ready');
  requireCondition((body.commitSha || body.version) === EXPECTED_SHA && /^dpl_/.test(body.deploymentId || ''), 'health_identity_mismatch');
  return { sha: body.commitSha || body.version, deploymentId: body.deploymentId };
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


let browser, context, downloadJob;
try {
  requireCondition(BASE_URL === PRODUCTION_ORIGIN && /^[0-9a-f]{40}$/.test(EXPECTED_SHA), 'target_invalid');
  requireCondition(EMAIL && PASSWORD, 'configured_test_identity_missing');
  const recovery = recoveryOptions(process.env.HORSES_VERIFY_JOB_ID, process.env.HORSES_VERIFY_OP_ID, process.env.HORSES_VERIFY_ACKNOWLEDGE_BOUNDED === 'true');
  receipt.mode = recovery.jobId ? 'original_job_download' : 'new_complete_report';
  receipt.operationId = recovery.opId; receipt.jobId = recovery.jobId;
  receipt.reportComplete = null; receipt.deliveryVerified = false;
  const before = await health(); receipt.target.before = before;
  browser = await chromium.launch();
  const storageState = await authenticate(browser);
  context = await browser.newContext({ baseURL: BASE_URL, storageState, acceptDownloads: true, serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
  await context.route('**/*', async route => {
    const admission = admitExportRequest(route.request(), Boolean(recovery.jobId) || receipt.admittedExportRequests > 0);
    if (admission === 'read') {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/horses/export-artifacts' && url.searchParams.has('download') && !admitDownload(route.request(), downloadJob, recovery.bounded)) { receipt.blockedMutations++; return route.abort('blockedbyclient'); }
      return route.continue();
    }
    if (admission) { receipt.operationId = admission.opId; receipt.admittedExportRequests++; return route.continue(); }
    receipt.blockedMutations++; return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  let pageErrors = 0; page.on('pageerror', () => { pageErrors++; });
  await page.goto('/horses?tab=floor', { waitUntil: 'domcontentloaded', timeout: 45000 });
  requireCondition(new URL(page.url()).origin === PRODUCTION_ORIGIN, 'page_left_origin');
  await page.getByRole('heading', { name: 'Live Floor', exact: true }).waitFor({ timeout: 30000 });
  const center = page.getByRole('region', { name: 'Private export files', exact: true });
  let job;
  if (recovery.jobId) {
    job = { id: recovery.jobId };
    await center.getByRole('button', { name: 'Export Files', exact: true }).click();
  } else {
    const acceptedResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/horses/export-artifacts' && r.request().method() === 'POST', { timeout: 30000 });
    await page.getByRole('button', { name: 'Export Full Floor', exact: true }).click();
    const accepted = await acceptedResponse;
    requireCondition(accepted.status() === 202, 'export_request_not_accepted');
    const answer = await accepted.json(); job = (answer.data || answer).job;
    observeJob(receipt, job);
    confirmJob(job, receipt.operationId); receipt.jobId = job.id;
  }
  await center.getByRole('heading', { name: 'Private Export Files', exact: true }).waitFor({ timeout: 30000 });
  let ready;
  // Finite explicit status reads through the owning console; never resume/retry a write.
  const statusDeadline = Date.now() + 240000;
  for (let attempt = 0; attempt < 60 && Date.now() < statusDeadline; attempt++) {
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/horses/export-artifacts' && r.request().method() === 'GET' && !new URL(r.url()).searchParams.has('download'), { timeout: 20000 });
    await center.getByRole('button', { name: 'Refresh Export Status', exact: true }).click();
    const read = await response; requireCondition(read.ok(), 'export_status_unavailable');
    const body = await read.json();
    ready = observeJob(receipt, ((body.data || body).jobs || []).find(candidate => candidate.id === job.id));
    confirmJob(ready, receipt.operationId, job.id, recovery);
    receipt.state = ready.state;
    if (ready.state === 'ready' || ready.state === 'truncated' && recovery.bounded) break;
    await page.waitForTimeout(2000);
  }
  requireCondition(ready?.state === 'ready' || ready?.state === 'truncated' && recovery.bounded, 'export_status_deadline');
  downloadJob = ready;
  const article = center.locator('article').filter({ hasText: `Job ${job.id}.` });
  if (ready.state === 'truncated') {
    await article.getByRole('checkbox', { name: 'I Acknowledge This Is An Incomplete Bounded Report.', exact: true }).check();
    receipt.boundedReportAcknowledged = true;
  }
  const downloaded = page.waitForEvent('download', { timeout: 30000 });
  const fileResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/horses/export-artifacts' && new URL(r.url()).searchParams.get('id') === job.id && new URL(r.url()).searchParams.get('download') === '1', { timeout: 30000 });
  await article.getByRole('button', { name: 'Download Verified CSV', exact: true }).click();
  const [download, file] = await Promise.all([downloaded, fileResponse]);
  requireCondition(file.status() === 200 && !await download.failure(), 'export_download_failed');
  receipt.download = await verifyDownloadedStream(await download.createReadStream(), ready, file.headers()['x-content-sha256']);
  receipt.rows = ready.progress; receipt.state = ready.state;
  requireCondition(receipt.admittedExportRequests === (recovery.jobId ? 0 : 1) && receipt.blockedMutations === 0 && pageErrors === 0, 'export_unexpected_mutation_or_error');
  const after = await health(); receipt.target.after = after;
  requireCondition(before.sha === after.sha && before.deploymentId === after.deploymentId, 'deployment_changed_during_export');
  receipt.target.stableAcrossRun = true; receipt.deliveryVerified = true; receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  // Unknown exception messages can contain provider details: retain only known code vocabulary.
  receipt.failureCode = /^(export|health|target|configured|page|deployment)_[a-z_]+$/.test(error.message || '') ? error.message : 'export_verification_failed';
  process.exitCode = 1;
} finally {
  await context?.close(); await browser?.close();
  receipt.completedAt = new Date().toISOString();
  await mkdir(dirname(RECEIPT_PATH), { recursive: true });
  await writeFile(RECEIPT_PATH, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ kind: receipt.kind, status: receipt.status, failureCode: receipt.failureCode }));
}
