import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_DIR = join(ROOT, 'pages/hub/training');
const BASE_URL = String(process.env.TRAINING_AUDIT_BASE_URL || process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');

function walk(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (/\.(?:js|jsx|tsx)$/.test(entry.name)) output.push(full);
  }
  return output;
}

function routeFor(file) {
  return `/hub/training/${relative(PAGE_DIR, file)
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

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];
const immersiveRoute = (route) => route.startsWith('/hub/training/arena/') || route.startsWith('/hub/training/play/');
const ignoredConsoleError = (message) => (
  message.includes('/_next/hmr')
  || /Failed to load resource:.*401 \(Unauthorized\)/.test(message)
);

async function inspect(page, route, viewport) {
  const consoleErrors = [];
  const pageErrors = [];
  const onConsole = (message) => {
    if (message.type() === 'error' && !ignoredConsoleError(message.text())) consoleErrors.push(message.text());
  };
  const onPageError = (error) => pageErrors.push(error?.message || String(error));
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => {});
    await page.waitForTimeout(150);

    const finalPathname = new URL(page.url()).pathname;
    const state = await page.evaluate(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const inViewport = (element) => {
        const rect = element.getBoundingClientRect();
        return visible(element) && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      };
      const accessibleName = (element) => (
        element.getAttribute('aria-label')
        || (element.getAttribute('aria-labelledby') && document.getElementById(element.getAttribute('aria-labelledby'))?.textContent)
        || element.getAttribute('title')
        || element.getAttribute('alt')
        || element.textContent
        || ''
      ).trim();

      return {
        bodyTextLength: (document.body?.innerText || '').trim().length,
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        approvedHeaders: document.querySelectorAll('.approved-global-header').length,
        brokenVisibleImages: [...document.images]
          .filter((image) => inViewport(image) && (!image.complete || image.naturalWidth === 0))
          .map((image) => image.currentSrc || image.src),
        unnamedVisibleControls: [...document.querySelectorAll('button, a[href], [role="button"]')]
          .filter((element) => visible(element) && !accessibleName(element))
          .map((element) => `${element.tagName.toLowerCase()}.${String(element.className || '').trim().replace(/\s+/g, '.')}`),
        imagesWithoutAlt: [...document.images]
          .filter((image) => !image.hasAttribute('alt'))
          .map((image) => image.currentSrc || image.src),
      };
    });

    const failures = [];
    if (!response || response.status() >= 400) failures.push(`HTTP ${response?.status() || 0}`);
    if (state.bodyTextLength < 20) failures.push(`empty body (${state.bodyTextLength} characters)`);
    if (state.overflow > 1) failures.push(`horizontal overflow ${state.overflow}px`);
    if (finalPathname.startsWith('/hub/training') && !immersiveRoute(finalPathname) && state.approvedHeaders !== 1) {
      failures.push(`approved global header count ${state.approvedHeaders}`);
    }
    if (state.brokenVisibleImages.length) failures.push(`broken visible images: ${state.brokenVisibleImages.join(', ')}`);
    if (state.unnamedVisibleControls.length) failures.push(`unnamed controls: ${state.unnamedVisibleControls.join(', ')}`);
    if (state.imagesWithoutAlt.length) failures.push(`images without alt: ${state.imagesWithoutAlt.join(', ')}`);
    if (consoleErrors.length) failures.push(`console errors: ${consoleErrors.join(' | ')}`);
    if (pageErrors.length) failures.push(`page errors: ${pageErrors.join(' | ')}`);

    return { route, finalPathname, viewport: viewport.name, ...state, consoleErrors, pageErrors, failures };
  } catch (error) {
    return { route, viewport: viewport.name, failures: [error?.message || String(error)] };
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }
}

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
    });
    const pending = [...routes];
    const workers = await Promise.all(Array.from({ length: 4 }, () => context.newPage()));
    await Promise.all(workers.map(async (page) => {
      while (pending.length) results.push(await inspect(page, pending.shift(), viewport));
    }));
    await context.close();
  }
} finally {
  await browser.close();
}

results.sort((a, b) => a.route.localeCompare(b.route) || a.viewport.localeCompare(b.viewport));
const failures = results.filter((result) => result.failures.length);
process.stdout.write(`${JSON.stringify({
  success: failures.length === 0,
  baseUrl: BASE_URL,
  routesChecked: routes.length,
  viewportChecks: results.length,
  failures: failures.map(({ route, finalPathname, viewport, failures: messages }) => ({
    route,
    finalPathname,
    viewport,
    messages,
  })),
}, null, 2)}\n`);
process.exitCode = failures.length ? 1 : 0;
