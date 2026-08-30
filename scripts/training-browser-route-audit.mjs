import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const PAGE_DIR = join(ROOT, 'pages/hub/training');
const BASE_URL = String(process.env.TRAINING_AUDIT_BASE_URL || process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');
const IS_REMOTE_AUDIT = !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/i.test(BASE_URL);
const AUDIT_CONCURRENCY = Math.max(1, Number(process.env.TRAINING_AUDIT_CONCURRENCY || (IS_REMOTE_AUDIT ? 1 : 4)) || 1);
const ROUTE_DELAY_MS = Math.max(0, Number(process.env.TRAINING_AUDIT_ROUTE_DELAY_MS || (IS_REMOTE_AUDIT ? 250 : 0)) || 0);
const REMOTE_BROWSER_ROTATION = Math.max(1, Number(process.env.TRAINING_AUDIT_BROWSER_ROTATION || 20) || 20);
const REMOTE_MAX_ATTEMPTS = Math.max(1, Number(process.env.TRAINING_AUDIT_MAX_ATTEMPTS || 2) || 2);

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
const allRoutes = [...new Set([
  '/training-table-demo',
  '/hub/training',
  ...fixedRoutes,
  '/hub/training/arena/cash-001?level=1',
  '/hub/training/play/cash-001',
  '/hub/training/category/cash',
  '/hub/training/clinic/preflop',
  '/hub/training/tournament/audit',
])].sort();
const routePattern = String(process.env.TRAINING_AUDIT_ROUTE_PATTERN || '').trim();
const routes = routePattern
  ? allRoutes.filter((route) => new RegExp(routePattern, 'i').test(route))
  : allRoutes;

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];
const immersiveRoute = (route) => (
  route === '/training-table-demo'
  || route.startsWith('/hub/training/arena/')
  || route.startsWith('/hub/training/play/')
);
const ignoredConsoleError = (message) => (
  message.includes('/_next/hmr')
  || /Failed to load resource:.*\b401\b/.test(message)
);
const retryableRemoteFailure = (result) => result.failures.some((failure) => (
  /\b(?:429|502|503|504)\b/.test(failure)
  || /Target (?:page, context or browser has been closed|closed)/i.test(failure)
));

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
    const state = await page.evaluate(async () => {
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

      const axeResults = window.axe
        ? await window.axe.run(document, {
          resultTypes: ['violations'],
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        })
        : { violations: [] };
      const accessibilityViolations = axeResults.violations
        .filter((violation) => ['serious', 'critical'].includes(violation.impact))
        .map((violation) => {
          const scopedNodes = violation.nodes.filter((node) => {
            const selector = Array.isArray(node.target) ? node.target[0] : node.target;
            const element = selector ? document.querySelector(selector) : null;
            return !element?.closest('.approved-global-header')
              && !element?.closest('#hmr-reconnect-banner');
          });
          return {
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            nodes: scopedNodes.length,
            targets: scopedNodes.slice(0, 6).map((node) => Array.isArray(node.target) ? node.target.join(' ') : String(node.target)),
          };
        })
        .filter((violation) => violation.nodes > 0);

      return {
        documentTitle: document.title.trim(),
        domNodes: document.getElementsByTagName('*').length,
        interactiveControls: document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]').length,
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
        accessibilityViolations,
      };
    });

    const failures = [];
    if (!response || response.status() >= 400) failures.push(`HTTP ${response?.status() || 0}`);
    if (state.bodyTextLength < 20) failures.push(`empty body (${state.bodyTextLength} characters)`);
    if (finalPathname.startsWith('/hub/training') && !state.documentTitle) failures.push('missing document title');
    if (state.domNodes > 7_500) failures.push(`excessive DOM size ${state.domNodes}`);
    if (state.overflow > 1) failures.push(`horizontal overflow ${state.overflow}px`);
    if (finalPathname.startsWith('/hub/training') && !immersiveRoute(finalPathname) && state.approvedHeaders !== 1) {
      failures.push(`approved global header count ${state.approvedHeaders}`);
    }
    if (state.brokenVisibleImages.length) failures.push(`broken visible images: ${state.brokenVisibleImages.join(', ')}`);
    if (state.unnamedVisibleControls.length) failures.push(`unnamed controls: ${state.unnamedVisibleControls.join(', ')}`);
    if (state.imagesWithoutAlt.length) failures.push(`images without alt: ${state.imagesWithoutAlt.join(', ')}`);
    const ownsFinalSurface = finalPathname.startsWith('/hub/training') || finalPathname === '/training-table-demo';
    if (ownsFinalSurface && state.accessibilityViolations.length) {
      failures.push(`serious accessibility violations: ${state.accessibilityViolations.map((violation) => `${violation.id} (${violation.nodes}: ${violation.targets.join(', ')})`).join(', ')}`);
    }
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

const launchBrowser = () => chromium.launch({
  headless: true,
  args: ['--mute-audio', '--autoplay-policy=user-gesture-required'],
});
let browser = await launchBrowser();
const results = [];
const contextOptions = (viewport) => ({
  viewport: { width: viewport.width, height: viewport.height },
  reducedMotion: 'reduce',
});

async function createAuditContext(viewport) {
  const context = await browser.newContext(contextOptions(viewport));
  await context.addInitScript({ content: AXE_SOURCE });
  return context;
}

try {
  if (IS_REMOTE_AUDIT) {
    let routesSinceLaunch = 0;
    for (const viewport of viewports) {
      for (const route of routes) {
        if (routesSinceLaunch >= REMOTE_BROWSER_ROTATION) {
          await browser.close().catch(() => {});
          browser = await launchBrowser();
          routesSinceLaunch = 0;
        }
        let result;
        for (let attempt = 1; attempt <= REMOTE_MAX_ATTEMPTS; attempt += 1) {
          if (!browser.isConnected()) browser = await launchBrowser();
          const context = await createAuditContext(viewport);
          try {
            result = await inspect(await context.newPage(), route, viewport);
          } finally {
            await context.close().catch(() => {});
          }
          if (!retryableRemoteFailure(result) || attempt === REMOTE_MAX_ATTEMPTS) break;
          await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
        }
        results.push(result);
        routesSinceLaunch += 1;
        if (ROUTE_DELAY_MS) await new Promise((resolve) => setTimeout(resolve, ROUTE_DELAY_MS));
      }
    }
  } else {
    for (const viewport of viewports) {
      const context = await createAuditContext(viewport);
      const pending = [...routes];
      const workers = await Promise.all(Array.from(
        { length: Math.min(AUDIT_CONCURRENCY, pending.length) },
        () => context.newPage(),
      ));
      await Promise.all(workers.map(async (initialPage) => {
        let page = initialPage;
        while (pending.length) {
          results.push(await inspect(page, pending.shift(), viewport));
          if (page.isClosed() && pending.length) page = await context.newPage();
        }
      }));
      await context.close();
    }
  }
} finally {
  await browser.close().catch(() => {});
}

results.sort((a, b) => a.route.localeCompare(b.route) || a.viewport.localeCompare(b.viewport));
const failures = results.filter((result) => result.failures.length);
process.stdout.write(`${JSON.stringify({
  success: failures.length === 0,
  baseUrl: BASE_URL,
  routesChecked: routes.length,
  viewportChecks: results.length,
  concurrency: AUDIT_CONCURRENCY,
  routeDelayMs: ROUTE_DELAY_MS,
  browserRotation: IS_REMOTE_AUDIT ? REMOTE_BROWSER_ROTATION : null,
  maxAttempts: IS_REMOTE_AUDIT ? REMOTE_MAX_ATTEMPTS : 1,
  failures: failures.map(({ route, finalPathname, viewport, failures: messages }) => ({
    route,
    finalPathname,
    viewport,
    messages,
  })),
}, null, 2)}\n`);
process.exitCode = failures.length ? 1 : 0;
