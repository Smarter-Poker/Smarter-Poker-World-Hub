'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = String(process.env.TRAINING_AUDIT_BASE_URL || process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');
const PAGE_DIR = path.join(ROOT, 'pages/hub/training');

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (/\.(?:js|jsx|tsx)$/.test(entry.name)) output.push(full);
  }
  return output;
}

function routeFor(file) {
  return `/hub/training/${path.relative(PAGE_DIR, file)
    .replace(/\\/g, '/')
    .replace(/\.(?:js|jsx|tsx)$/, '')
    .replace(/\/index$/, '')}`.replace(/\/$/, '');
}

const fixedRoutes = walk(PAGE_DIR).map(routeFor).filter((route) => !route.includes('['));
const routes = [...new Set([
  '/hub/training',
  ...fixedRoutes,
  '/hub/training/arena/cash-001?level=1',
  '/hub/training/play/cash-001',
  '/hub/training/category/cash',
  '/hub/training/clinic/preflop',
  '/hub/training/tournament/audit',
])].sort();

async function inspect(route) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${BASE_URL}${route}`, {
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': 'SmarterPokerTrainingRouteAudit/1.0' },
    });
    const text = await response.text();
    const failureMarkers = [
      /Internal Server Error/i,
      /Application error: a client-side exception/i,
      /This page could not be found/i,
      /__next_error__/i,
    ].filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
    const okStatus = response.status >= 200 && response.status < 400;
    return {
      route,
      status: response.status,
      location: response.headers.get('location') || null,
      bytes: Buffer.byteLength(text),
      failureMarkers,
      success: okStatus && failureMarkers.length === 0,
    };
  } catch (error) {
    return { route, status: 0, bytes: 0, failureMarkers: [], success: false, error: error?.message || String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const results = [];
  const pending = [...routes];
  const workers = Array.from({ length: Math.min(8, pending.length) }, async () => {
    while (pending.length > 0) results.push(await inspect(pending.shift()));
  });
  await Promise.all(workers);
  results.sort((a, b) => a.route.localeCompare(b.route));
  const failures = results.filter((result) => !result.success);
  console.log(JSON.stringify({
    success: failures.length === 0,
    baseUrl: BASE_URL,
    routesChecked: results.length,
    statusCounts: results.reduce((acc, result) => {
      acc[result.status] = (acc[result.status] || 0) + 1;
      return acc;
    }, {}),
    failures,
  }, null, 2));
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
