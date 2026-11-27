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
 *   - Accessibility & focus checks:
 *     - Every visible <button> and <a href> has a non-empty accessible name
 *     - At least one heading (h1/h2) or landmark (main, [role="main"]) exists
 *     - Primary interactive controls do not collapse below 36px touch height
 *     - Keyboard Tab reaches an interactive element cleanly without throwing errors
 * And the private APIs fail closed (no authorization header sent): their answer
 * carries `Cache-Control: private, no-store, max-age=0` and `Vary: Authorization`.
 * And the live SSR /share/hand?view=review check verifies headers, robots, no +$1,250 and OG tags.
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
  '/hub/personal-assistant/review',
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
  '/api/sandbox/save-hand',
  '/api/poker/saved-hands',
  '/api/assistant/leaks/claim-live-fix',
  '/api/assistant/maintenance-jobs',
  '/api/training/audit-hand-history',
]);

export const RETIRED_API_PATHS = Object.freeze([
  '/api/sandbox/equity-snapshot',
  '/api/assistant/sandbox/analyze',
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

export const SHARE_REVIEW_PATH = '/share/hand?view=review&street=flop&position=BTN';

export const MIN_TOUCH_TARGET_HEIGHT = 36;

export const CHECKS = Object.freeze([
  'http-200',
  'no-page-errors',
  'no-horizontal-overflow',
  'no-invalid-button-nesting',
  'format-query-preserved',
  'private-api-headers',
  'a11y-accessible-name',
  'a11y-landmark-or-heading',
  'a11y-touch-targets',
  'a11y-keyboard-tab',
  'share-review-ssr',
]);

export function parseArgs(argv) {
  const out = { baseUrl: DEFAULT_BASE_URL, checkOnly: false, storageState: null, strictOg: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check-only') out.checkOnly = true;
    else if (arg === '--strict-og') out.strictOg = true;
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

/** Computes accessible name from element attributes / innerText according to accessible name basics. */
export function computeAccessibleName({ tagName, textContent, innerText, ariaLabel, ariaLabelledby, labelledByText, labelLookup, title, imgAlt, svgTitle } = {}) {
  const label = String(ariaLabel || '').trim();
  if (label) return label;
  const resolvedLabelledBy = String(labelledByText || '').trim();
  if (resolvedLabelledBy) return resolvedLabelledBy;
  const labelledBy = String(ariaLabelledby || '').trim();
  if (labelledBy && labelLookup && typeof labelLookup === 'object') {
    const resolved = labelledBy
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => String(labelLookup[id] || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    if (resolved) return resolved;
  }
  const t = String(title || '').trim();
  if (t) return t;
  const txt = String(innerText ?? textContent ?? '').trim();
  if (txt) return txt;
  const alt = String(imgAlt || '').trim();
  if (alt) return alt;
  const svg = String(svgTitle || '').trim();
  if (svg) return svg;
  return '';
}

/** Validates SSR response for /share/hand?view=review */
export function shareReviewProblems({ status, headers = {}, body = '', strictOg = true } = {}) {
  const problems = [];
  if (status !== 200) {
    problems.push(`status is ${status}, expected 200 (no redirect)`);
  }
  const get = (name) => {
    const val = headers?.[name] ?? headers?.[name.toLowerCase()] ?? headers?.[name.toUpperCase()];
    return String(val ?? '').toLowerCase();
  };
  const xRobots = get('x-robots-tag');
  if (!xRobots.includes('noindex')) {
    problems.push(`X-Robots-Tag "${headers?.['x-robots-tag'] || headers?.['X-Robots-Tag'] || ''}" does not contain "noindex"`);
  }
  const cacheControl = get('cache-control');
  if (!cacheControl.includes('no-store')) {
    problems.push(`Cache-Control "${headers?.['cache-control'] || headers?.['Cache-Control'] || ''}" does not contain "no-store"`);
  }
  const hasRobotsMeta = /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex,nofollow[^"']*["']/i.test(body)
    || body.includes('content="noindex,nofollow"');
  if (!hasRobotsMeta) {
    problems.push('HTML missing <meta name="robots" content="noindex,nofollow">');
  }
  if (body.includes('+$1,250')) {
    problems.push('HTML contains fabricated "+$1,250" default winning amount');
  }
  const ogTitleMatches = body.match(/property=["']og:title["']/gi) || [];
  const ogImageMatches = body.match(/property=["']og:image["']/gi) || [];
  const hasOgTitle = /property=["']og:title["']\s+content=["'][^"']*Poker Hand Review[^"']*["']/i.test(body)
    || /<title>[^<]*Poker Hand Review[^<]*<\/title>/i.test(body);
  const hasOgImage = /property=["']og:image["']\s+content=["'][^"']*view=review[^"']*["']/i.test(body);
  if (strictOg || ogTitleMatches.length > 0 || ogImageMatches.length > 0) {
    if (!hasOgTitle) problems.push('og:title does not contain "Poker Hand Review"');
    if (!hasOgImage) problems.push('og:image does not contain "view=review"');
    if (ogTitleMatches.length > 1) problems.push(`duplicate og:title tags (${ogTitleMatches.length})`);
    if (ogImageMatches.length > 1) problems.push(`duplicate og:image tags (${ogImageMatches.length})`);
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

    // A11y 1: Landmark or heading exists
    const landmarkHeadingError = await page.evaluate(() => {
      const headings = document.querySelectorAll('h1, h2');
      const landmarks = document.querySelectorAll('main, [role="main"]');
      if (headings.length === 0 && landmarks.length === 0) {
        return 'no heading (h1/h2) or landmark (main, [role="main"]) found on page';
      }
      return null;
    });
    if (landmarkHeadingError) failures.push(`a11y-landmark-or-heading: ${landmarkHeadingError}`);

    // A11y 2: Visible buttons and links have accessible names
    const unnamedControls = await page.evaluate(() => {
      const problems = [];
      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return (rect.width > 0 && rect.height > 0) || (el.getClientRects && el.getClientRects().length > 0);
      };
      const getName = (el) => {
        const ariaLabel = (el.getAttribute('aria-label') || '').trim();
        if (ariaLabel) return ariaLabel;
        const ariaLabelledby = el.getAttribute('aria-labelledby');
        if (ariaLabelledby) {
          const ids = ariaLabelledby.split(/\s+/).filter(Boolean);
          const text = ids.map((id) => {
            const target = document.getElementById(id);
            return target ? (target.innerText || target.textContent || '').trim() : '';
          }).join(' ').trim();
          if (text) return text;
        }
        const title = (el.getAttribute('title') || '').trim();
        if (title) return title;
        const text = (el.innerText || el.textContent || '').trim();
        if (text) return text;
        const imgAlt = el.querySelector('img[alt]');
        if (imgAlt && (imgAlt.getAttribute('alt') || '').trim()) return imgAlt.getAttribute('alt').trim();
        const svgTitle = el.querySelector('svg title');
        if (svgTitle && (svgTitle.textContent || '').trim()) return svgTitle.textContent.trim();
        return '';
      };
      for (const el of document.querySelectorAll('button, a[href]')) {
        if (!isVisible(el)) continue;
        if (!getName(el)) {
          const tag = el.tagName.toLowerCase();
          const id = el.id ? `#${el.id}` : '';
          const cls = el.className && typeof el.className === 'string'
            ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
            : '';
          problems.push(`${tag}${id}${cls || ''}`);
        }
      }
      return problems;
    });
    if (unnamedControls.length) {
      failures.push(`a11y-accessible-name: ${unnamedControls.length} control(s) missing accessible name (${unnamedControls.slice(0, 3).join(', ')})`);
    }

    // A11y 3: Primary interactive controls do not collapse below 36px touch height
    const collapsedTargets = await page.evaluate((minHeight) => {
      const problems = [];
      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const controls = document.querySelectorAll('button:not([aria-hidden="true"]), [role="button"]:not([aria-hidden="true"]), input[type="button"], input[type="submit"], a.btn, a.pa-btn');
      for (const el of controls) {
        if (!isVisible(el)) continue;
        // Site-wide UniversalHeader chrome is owned outside Personal Assistant.
        if (el.closest('.approved-global-header')) continue;
        const rect = el.getBoundingClientRect();
        if (rect.height < minHeight) {
          const tag = el.tagName.toLowerCase();
          const id = el.id ? `#${el.id}` : '';
          const cls = el.className && typeof el.className === 'string'
            ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
            : '';
          problems.push(`${tag}${id}${cls || ''} (${Math.round(rect.height)}px < ${minHeight}px)`);
        }
      }
      return problems;
    }, MIN_TOUCH_TARGET_HEIGHT);
    if (collapsedTargets.length) {
      failures.push(`a11y-touch-targets: ${collapsedTargets.slice(0, 3).join('; ')}`);
    }

    // A11y 4: Keyboard Tab actually moves focus off <body> to a focusable control
    try {
      await page.keyboard.press('Tab');
      const focusedTag = await page.evaluate(() => {
        const active = document.activeElement;
        return active && active !== document.body && active !== document.documentElement
          ? active.tagName.toLowerCase()
          : '';
      });
      if (!focusedTag) {
        failures.push('a11y-keyboard-tab: Tab did not move focus to any focusable element');
      }
    } catch (tabErr) {
      failures.push(`a11y-keyboard-tab: Tab threw error (${String(tabErr.message).split('\n')[0]})`);
    }

    if (route === FORMAT_ROUTE) {
      const finalUrl = new URL(page.url());
      if (finalUrl.searchParams.get('format') !== 'tournament') {
        failures.push(`format-query-preserved: URL became ${finalUrl.pathname}${finalUrl.search}`);
      }
      const saved = await page.evaluate((key) => window.localStorage.getItem(key), PREFS_STORAGE_KEY);
      if (saved && JSON.parse(saved).format === 'cash') {
        // Seeded "cash" may remain in storage; the visible format filter must not have been flipped to it.
        const cashActive = await page.evaluate(() => {
          const formatButtons = [...document.querySelectorAll('button[aria-pressed], [role="tab"][aria-selected], [role="radio"][aria-checked]')]
            .map((el) => ({
              label: (el.textContent || '').trim().toLowerCase(),
              selected: el.getAttribute('aria-pressed') === 'true'
                || el.getAttribute('aria-selected') === 'true'
                || el.getAttribute('aria-checked') === 'true',
            }))
            .filter((item) => item.label === 'cash' || item.label === 'tournament' || item.label === 'all formats');
          const cashSelected = formatButtons.some((item) => item.label === 'cash' && item.selected);
          const tournamentSelected = formatButtons.some((item) => item.label === 'tournament' && item.selected);
          return cashSelected && !tournamentSelected;
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
  for (const retiredPath of RETIRED_API_PATHS) {
    try {
      const response = await fetch(new URL(retiredPath, baseUrl), {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: '{}',
        redirect: 'manual',
      });
      const headers = Object.fromEntries(response.headers.entries());
      if (response.status !== 410) failures.push(`${retiredPath}: answered ${response.status}, expected 410`);
      for (const problem of privateHeaderProblems(headers)) failures.push(`${retiredPath} (${response.status}): ${problem}`);
    } catch (error) {
      failures.push(`${retiredPath}: request failed (${error.message})`);
    }
  }
  return failures;
}

export async function checkShareHandReviewSsr(baseUrl, { strictOg = true } = {}) {
  const failures = [];
  try {
    const targetUrl = new URL(SHARE_REVIEW_PATH, baseUrl);
    const response = await fetch(targetUrl, {
      headers: { accept: 'text/html,application/xhtml+xml' },
      redirect: 'manual',
    });
    const status = response.status;
    const headers = Object.fromEntries(response.headers.entries());
    const body = await response.text();
    const problems = shareReviewProblems({ status, headers, body, strictOg });
    for (const problem of problems) failures.push(`${SHARE_REVIEW_PATH}: ${problem}`);

    // Duplicate query parameters must never crash SSR with HTTP 500
    const dupUrl = new URL('/share/hand?hero=Ah,Kh&hero=Qs,Qd&board=As,Kd,2c&board=7h&result=won&result=lost', baseUrl);
    const dupResponse = await fetch(dupUrl, {
      headers: { accept: 'text/html,application/xhtml+xml' },
      redirect: 'manual',
    });
    if (dupResponse.status !== 200) {
      failures.push(`/share/hand duplicate query params answered ${dupResponse.status}, expected 200`);
    }
  } catch (error) {
    failures.push(`${SHARE_REVIEW_PATH}: request failed (${error.message})`);
  }
  return failures;
}

export async function runSmoke({ baseUrl, storageState, strictOg = true }) {
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
  results.push({ label: `live SSR ${SHARE_REVIEW_PATH}`, failures: await checkShareHandReviewSsr(baseUrl, { strictOg }) });
  return results;
}

/** --check-only: proves the contract is well-formed without a browser or a network. */
export function checkContract() {
  const problems = [];
  if (!VIEWPORTS.some((v) => v.width === 1440 && v.height === 900)) problems.push('missing desktop 1440x900');
  if (!VIEWPORTS.some((v) => v.width === 390 && v.height === 844)) problems.push('missing mobile 390x844');
  if (!ROUTES.includes(FORMAT_ROUTE)) problems.push('format route is not in ROUTES');
  if (new Set(ROUTES).size !== ROUTES.length) problems.push('duplicate route');
  for (const path of [...ROUTES, ...PRIVATE_API_PATHS, SHARE_REVIEW_PATH.split('?')[0]]) {
    if (!path.startsWith('/')) problems.push(`not absolute: ${path}`);
  }
  if (privateHeaderProblems({ 'cache-control': 'private, no-store, max-age=0', vary: 'Authorization' }).length) {
    problems.push('a compliant header set is rejected');
  }
  if (privateHeaderProblems({ 'cache-control': 'public, max-age=60' }).length !== 2) {
    problems.push('a non-private header set is not rejected');
  }
  // Validate SSR Share Review contract validator
  const validReview = {
    status: 200,
    headers: { 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'private, no-store, max-age=0' },
    body: '<!DOCTYPE html><html><head><title>Poker Hand Review | Smarter.Poker</title><meta property="og:title" content="Poker Hand Review | Smarter.Poker" /><meta property="og:image" content="https://smarter.poker/api/og/hand-card?view=review&amp;street=flop&amp;position=BTN" /><meta name="robots" content="noindex,nofollow" /></head><body><main><h1>Poker Hand Review</h1></main></body></html>',
    strictOg: true,
  };
  if (shareReviewProblems(validReview).length) {
    problems.push('a compliant share review SSR response is rejected');
  }
  const invalidReview = {
    status: 308,
    headers: { 'cache-control': 'public, max-age=3600' },
    body: '<html><body>+$1,250</body></html>',
    strictOg: true,
  };
  if (shareReviewProblems(invalidReview).length < 4) {
    problems.push('an invalid share review SSR response is not properly rejected');
  }
  // Validate a11y helpers
  if (computeAccessibleName({ ariaLabel: 'Submit' }) !== 'Submit') problems.push('accessible name helper failed on aria-label');
  if (computeAccessibleName({ textContent: 'Close' }) !== 'Close') problems.push('accessible name helper failed on textContent');
  if (computeAccessibleName({}) !== '') problems.push('accessible name helper failed on empty element');
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
