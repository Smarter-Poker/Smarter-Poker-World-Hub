#!/usr/bin/env node

/**
 * Read-Only Training Deployment Verification
 *
 * Usage:
 *   node scripts/verify_training_flow.js [baseUrl] [expectedBuildSha]
 *
 * This script intentionally performs no authentication and no database writes.
 * It verifies the public Training shell, key secondary pages, deployment health,
 * and the protected gameplay redirect contract for signed-out visitors. The
 * gameplay guard runs after hydration, so the verifier uses a clean browser
 * context when the server correctly returns the application shell.
 */

const baseUrl = String(
  process.env.TRAINING_AUDIT_BASE_URL
  || process.argv[2]
  || 'https://smarter.poker',
).replace(/\/$/, '');
const expectedBuildSha = String(
  process.env.EXPECTED_BUILD_SHA
  || process.argv[3]
  || '',
).trim().slice(0, 8);

const publicRoutes = [
  { path: '/hub/training', marker: 'Browse The Training Library' },
  { path: '/hub/training/coach-mode', marker: 'Coach Mode' },
  { path: '/hub/training/tournament-prep', marker: 'Tournament Prep Planner' },
  { path: '/hub/training/solutions', marker: 'GTO Solutions' },
];

const protectedRoutes = [
  '/hub/training/arena/cash-001?level=1',
  '/hub/training/play/cash-001',
];

const results = [];
let authBrowser = null;

async function request(path, options = {}) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
    headers: { 'user-agent': 'SmarterPoker-Training-Deployment-Verification/3' },
    ...options,
  });
  return { response, latencyMs: Date.now() - startedAt };
}

async function verifyHealth() {
  const { response, latencyMs } = await request('/api/health');
  const payload = await response.json().catch(() => null);
  const failures = [];

  if (response.status !== 200) failures.push(`Expected HTTP 200, Received ${response.status}`);
  if (payload?.status !== 'ok') failures.push(`Expected Status Ok, Received ${payload?.status || 'Missing'}`);
  if (payload?.checks?.db?.status !== 'ok') failures.push(`Expected Database Ok, Received ${payload?.checks?.db?.status || 'Missing'}`);
  if (expectedBuildSha && payload?.version !== expectedBuildSha) {
    failures.push(`Expected Build ${expectedBuildSha}, Received ${payload?.version || 'Missing'}`);
  }

  results.push({
    check: 'Production Health',
    path: '/api/health',
    status: response.status,
    latencyMs,
    build: payload?.version || null,
    failures,
  });
}

async function verifyPublicRoute({ path, marker }) {
  const { response, latencyMs } = await request(path);
  const body = await response.text();
  const failures = [];

  if (response.status !== 200) failures.push(`Expected HTTP 200, Received ${response.status}`);
  if (body.length < 1_000) failures.push(`Expected Rendered HTML, Received ${body.length} Characters`);
  if (!body.toLowerCase().includes(marker.toLowerCase())) failures.push(`Missing Marker: ${marker}`);

  results.push({ check: 'Public Training Route', path, status: response.status, latencyMs, failures });
}

async function verifyProtectedRoute(path) {
  const { response, latencyMs } = await request(path);
  const location = response.headers.get('location') || '';
  const failures = [];
  const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
  let finalUrl = location;
  let redirectMode = 'server';

  if (!isRedirect && response.status === 200) {
    redirectMode = 'client';
    try {
      const { chromium } = await import('playwright');
      authBrowser ||= await chromium.launch({ headless: true });
      const context = await authBrowser.newContext();
      const page = await context.newPage();
      try {
        await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForURL((url) => url.pathname === '/auth/login', { timeout: 12_000 });
        finalUrl = page.url();
      } finally {
        await context.close();
      }
    } catch (error) {
      failures.push(`Client Authentication Redirect Failed: ${error?.message || String(error)}`);
    }
  } else if (!isRedirect) {
    failures.push(`Expected Application Shell Or Authentication Redirect, Received HTTP ${response.status}`);
  }

  let redirectUrl = null;
  try {
    redirectUrl = new URL(finalUrl, baseUrl);
  } catch (_) {
    // The assertions below report the malformed or missing redirect.
  }
  if (redirectUrl?.pathname !== '/auth/login') {
    failures.push(`Expected Canonical Login Redirect, Received ${finalUrl || 'Missing Location'}`);
  }
  const preservedDestination = redirectUrl?.searchParams.get('redirect') || '';
  if (!preservedDestination.startsWith(path.split('?')[0])) {
    failures.push(`Authentication Redirect Does Not Preserve Destination: ${preservedDestination || 'Missing'}`);
  }

  results.push({
    check: 'Protected Gameplay Contract',
    path,
    status: response.status,
    latencyMs,
    redirectMode,
    location: finalUrl,
    failures,
  });
}

async function main() {
  try {
    await verifyHealth();
    for (const route of publicRoutes) await verifyPublicRoute(route);
    for (const route of protectedRoutes) await verifyProtectedRoute(route);
  } finally {
    await authBrowser?.close();
  }

  const failures = results.filter((result) => result.failures.length > 0);
  process.stdout.write(`${JSON.stringify({
    success: failures.length === 0,
    readOnly: true,
    baseUrl,
    expectedBuildSha: expectedBuildSha || null,
    checksRun: results.length,
    results,
  }, null, 2)}\n`);
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
  process.stderr.write(`Training Verification Failed: ${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
