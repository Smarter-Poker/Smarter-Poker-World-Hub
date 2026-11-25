#!/usr/bin/env node
/**
 * pa-browser-smoke — headless-browser smoke for the Personal Assistant and Sandbox surfaces.
 *
 * Run it against a preview or production BEFORE merging/announcing a PA change:
 *
 *   node scripts/ci/pa-browser-smoke.mjs --base-url https://smarter.poker
 *   node scripts/ci/pa-browser-smoke.mjs --check-only        (no browser; contract dry run)
 *
 * For every route, at desktop (1440x900) and mobile (390x844):
 *   - the document answers HTTP 200
 *   - the page raised 0 uncaught page errors
 *   - the page has 0px of horizontal overflow
 *   - no <button> contains an invalid block-level / interactive descendant
 *   - /hub/personal-assistant/leaks?format=tournament keeps "tournament" after a
 *     pre-seeded localStorage preference of format "cash" has hydrated
 * And the private APIs fail closed (no authorization header sent): their answer
 * carries `Cache-Control: private, no-store, max-age=0` and `Vary: Authorization`.
 *
 * Playwright's bundled Chromium is used; when it is not installed the script
 * falls back to the machine's Chrome (`channel: 'chrome'`).
 * Exit code: 0 all checks passed, 1 a check failed, 2 the browser could not start.
 */
import { pathToFileURL } from 'node:url';

export const DEFAULT_BASE_URL = 'https://smarter.poker';

export const VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'desktop', width: 1440, height: 900 }),
  Object.freeze({ name: 'mobile', width: 390, height: 844 }),
]);

export const ROUTES = Object.freeze([
  '/hub/personal-assistant',
  '/hub/personal-assistant/leaks',
  '/hub/personal-assistant/leaks?format=tournament',
  '/hub/personal-assistant/leaks?tab=coaching',
  '/hub/personal-assistant/sandbox',
  '/sandbox/demo-hand-001',
]);

/** The route whose explicit ?format= must survive saved-preference hydration. */
export const FORMAT_ROUTE = '/hub/personal-assistant/leaks?format=tournament';
export const PREFS_STORAGE_KEY = 'pa-assistant-prefs-v1:guest';
export const SEEDED_PREFS = Object.freeze({ version: 1, format: 'cash' });

export const PRIVATE_API_PATHS = Object.freeze([
  '/api/assistant/leaks',
  '/api/assistant/coaching',
  '/api/assistant/stats',
  '/api/sandbox/custom-drill',
]);

export const REQUIRED_PRIVATE_HEADERS = Object.freeze({
  'cache-control': 'private, no-store, max-age=0',
  vary: 'authorization',
});

/** Elements that may not live inside a <button> (HTML content model). */
export const INVALID_BUTTON_DESCENDANTS = Object.freeze([
  'div', 'p', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'form', 'fieldset',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'hr',
  'a', 'button', 'input', 'select', 'textarea',
]);

export const CHECKS = Object.freeze([
  'http-200',
  'no-page-errors',
  'no-horizontal-overflow',
  'no-invalid-button-nesting',
  'format-query-preserved',
  'private-api-headers',
]);

export function parseArgs(argv) {
  const out = { baseUrl: DEFAULT_BASE_URL, checkOnly: false, storageState: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check-only') out.checkOnly = true;
    else if (arg === '--base-url') out.baseUrl = argv[++i];
    else if (arg.startsWith('--base-url=')) out.baseUrl = arg.slice('--base-url='.length);
    else if (arg === '--storage-state') out.storageState = argv[++i];
    else if (arg.startsWith('--storage-state=')) out.storageState = arg.slice('--storage-state='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.baseUrl) throw new Error('--base-url needs a value');
  out.baseUrl = new URL(out.baseUrl).origin;
  return out;
}

/** Returns a list of problems with a private API response's headers (empty = fail-closed). */
export function privateHeaderProblems(headers) {
  const problems = [];
  const get = (name) => String(headers?.[name] ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (get('cache-control') !== REQUIRED_PRIVATE_HEADERS['cache-control']) {
    problems.push(`Cache-Control is "${headers?.['cache-control'] ?? ''}", expected "private, no-store, max-age=0"`);
  }
  const vary = get('vary').split(',').map((v) => v.trim());
  if (!vary.includes(REQUIRED_PRIVATE_HEADERS.vary)) {
    problems.push(`Vary is "${headers?.vary ?? ''}", expected it to include "Authorization"`);
  }
  return problems;
}

/** Runs inside the page: counts <button> descendants that are not allowed there. */
function invalidButtonNesting(selectors) {
  const found = [];
  for (const button of document.querySelectorAll('button')) {
    const bad = button.querySelectorAll(selectors);
    for (const node of bad) {
      found.push(`${node.tagName.toLowerCase()} inside button "${(button.textContent || '').trim().slice(0, 40)}"`);
    }
  }
  return found;
}

function overflowPx() {
  const root = document.documentElement;
  return Math.max(0, Math.max(root.scrollWidth, document.body ? document.body.scrollWidth : 0) - root.clientWidth);
}

async function launchBrowser() {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch({ headless: true });
  } catch (bundledError) {
    try {
      return await chromium.launch({ headless: true, channel: 'chrome' });
    } catch (chromeError) {
      const error = new Error(
        `No browser could start. Bundled Chromium: ${String(bundledError.message).split('\n')[0]} | Chrome: ${String(chromeError.message).split('\n')[0]}`,
      );
      error.code = 'NO_BROWSER';
      throw error;
    }
  }
}

async function checkRoute(browser, baseUrl, viewport, route, storageState) {
  const failures = [];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    ...(storageState ? { storageState } : {}),
  });
  await context.addInitScript(([key, value]) => {
    try { window.localStorage.setItem(key, value); } catch { /* storage blocked */ }
  }, [PREFS_STORAGE_KEY, JSON.stringify(SEEDED_PREFS)]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
  try {
    const response = await page.goto(new URL(route, baseUrl).href, { waitUntil: 'networkidle', timeout: 45_000 });
    const status = response ? response.status() : 0;
    if (status !== 200) failures.push(`http-200: answered ${status}`);
    await page.waitForTimeout(1_000);
    if (pageErrors.length) failures.push(`no-page-errors: ${pageErrors.length} (${pageErrors[0]})`);
    const overflow = await page.evaluate(overflowPx);
    if (overflow > 0) failures.push(`no-horizontal-overflow: ${overflow}px`);
    const nested = await page.evaluate(invalidButtonNesting, INVALID_BUTTON_DESCENDANTS.join(','));
    if (nested.length) failures.push(`no-invalid-button-nesting: ${nested.length} (${nested[0]})`);
    if (route === FORMAT_ROUTE) {
      const finalUrl = new URL(page.url());
      if (finalUrl.searchParams.get('format') !== 'tournament') {
        failures.push(`format-query-preserved: URL became ${finalUrl.pathname}${finalUrl.search}`);
      }
      const saved = await page.evaluate((key) => window.localStorage.getItem(key), PREFS_STORAGE_KEY);
      if (saved && JSON.parse(saved).format === 'cash') {
        // Seeded "cash" may remain in storage; the visible filter must not have been flipped to it.
        const cashActive = await page.evaluate(() => {
          const active = document.querySelector('[aria-pressed="true"],[aria-selected="true"],[aria-checked="true"]');
          const pressed = [...document.querySelectorAll('[aria-pressed="true"],[aria-selected="true"],[aria-checked="true"]')]
            .map((el) => (el.textContent || '').trim().toLowerCase());
          return Boolean(active) && pressed.includes('cash') && !pressed.includes('tournament');
        });
        if (cashActive) failures.push('format-query-preserved: Cash filter is active although ?format=tournament was requested');
      }
    }
  } catch (error) {
    failures.push(`navigation: ${String(error.message).split('\n')[0]}`);
  } finally {
    await context.close();
  }
  return failures;
}

async function checkPrivateApis(baseUrl) {
  const failures = [];
  for (const apiPath of PRIVATE_API_PATHS) {
    try {
      const response = await fetch(new URL(apiPath, baseUrl), { headers: { accept: 'application/json' }, redirect: 'manual' });
      const headers = Object.fromEntries(response.headers.entries());
      for (const problem of privateHeaderProblems(headers)) failures.push(`${apiPath} (${response.status}): ${problem}`);
    } catch (error) {
      failures.push(`${apiPath}: request failed (${error.message})`);
    }
  }
  return failures;
}

export async function runSmoke({ baseUrl, storageState }) {
  const browser = await launchBrowser();
  const results = [];
  try {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        const failures = await checkRoute(browser, baseUrl, viewport, route, storageState);
        results.push({ label: `${viewport.name} ${viewport.width}x${viewport.height} ${route}`, failures });
      }
    }
  } finally {
    await browser.close();
  }
  results.push({ label: 'private APIs fail closed', failures: await checkPrivateApis(baseUrl) });
  return results;
}

/** --check-only: proves the contract is well-formed without a browser or a network. */
export function checkContract() {
  const problems = [];
  if (!VIEWPORTS.some((v) => v.width === 1440 && v.height === 900)) problems.push('missing desktop 1440x900');
  if (!VIEWPORTS.some((v) => v.width === 390 && v.height === 844)) problems.push('missing mobile 390x844');
  if (!ROUTES.includes(FORMAT_ROUTE)) problems.push('format route is not in ROUTES');
  if (new Set(ROUTES).size !== ROUTES.length) problems.push('duplicate route');
  for (const path of [...ROUTES, ...PRIVATE_API_PATHS]) if (!path.startsWith('/')) problems.push(`not absolute: ${path}`);
  if (privateHeaderProblems({ 'cache-control': 'private, no-store, max-age=0', vary: 'Authorization' }).length) {
    problems.push('a compliant header set is rejected');
  }
  if (privateHeaderProblems({ 'cache-control': 'public, max-age=60' }).length !== 2) {
    problems.push('a non-private header set is not rejected');
  }
  return problems;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.checkOnly) {
    const problems = checkContract();
    if (problems.length) {
      console.error(`pa-browser-smoke contract: ${problems.join('; ')}`);
      process.exit(1);
    }
    console.log(`pa-browser-smoke contract ok: ${ROUTES.length} routes x ${VIEWPORTS.length} viewports, ${PRIVATE_API_PATHS.length} private APIs, ${CHECKS.length} checks`);
    return;
  }
  let results;
  try {
    results = await runSmoke(args);
  } catch (error) {
    console.error(`pa-browser-smoke: ${error.message}`);
    process.exit(error.code === 'NO_BROWSER' ? 2 : 1);
  }
  let failed = 0;
  for (const { label, failures } of results) {
    if (failures.length === 0) console.log(`PASS ${label}`);
    else {
      failed += 1;
      console.error(`FAIL ${label}`);
      for (const failure of failures) console.error(`     - ${failure}`);
    }
  }
  console.log(failed === 0 ? `pa-browser-smoke: all ${results.length} checks passed against ${args.baseUrl}` : `pa-browser-smoke: ${failed} of ${results.length} checks failed`);
  process.exit(failed === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
