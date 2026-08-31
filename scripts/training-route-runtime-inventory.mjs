import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const MANIFEST_PATH = resolve(ROOT, '.agent/audits/2026-08-31-training-phase-2-inventory.json');
const DEFAULT_OUTPUT = resolve(ROOT, '.agent/audits/2026-08-31-training-phase-2-runtime.json');
const SCREENSHOT_DIR = resolve(ROOT, '.agent/audits/2026-08-31-training-phase-2-screenshots');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const BASE_URL = option('--base-url', 'http://127.0.0.1:3033').replace(/\/$/, '');
const OUTPUT = resolve(ROOT, option('--output', DEFAULT_OUTPUT));
const OFFSET = Math.max(0, Number(option('--offset', '0')) || 0);
const LIMIT = Number(option('--limit', '0')) || 0;
const CONCURRENCY = Math.max(1, Number(option('--concurrency', '4')) || 4);
const NAVIGATION_TIMEOUT_MS = Math.max(5_000, Number(option('--timeout-ms', '30000')) || 30_000);
const ALLOW_FAILURES = process.argv.includes('--allow-failures');
const SCREENSHOTS = process.argv.includes('--screenshots');

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const canonicalRoutes = manifest.routes.map((route) => ({
  path: route.sample.path,
  source: 'route-template',
  template: route.template,
  productionSafe: route.sample.productionSafe,
}));
const gameRoutes = manifest.games.flatMap((game) => ([
  { path: game.playRoute, source: 'canonical-game-play', gameId: game.id, template: '/hub/training/play/[gameId]', productionSafe: true },
  { path: game.arenaRoute, source: 'canonical-game-arena', gameId: game.id, template: '/hub/training/arena/[gameId]', productionSafe: true },
]));
const routeMap = new Map([...canonicalRoutes, ...gameRoutes].map((route) => [route.path, route]));
const allRoutes = [...routeMap.values()];
const routes = allRoutes.slice(OFFSET, LIMIT ? OFFSET + LIMIT : undefined);
const viewports = [
  { name: 'desktop', width: 1440, height: 1000, isMobile: false, hasTouch: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
];
const jobs = viewports.flatMap((viewport) => routes.map((route) => ({ route, viewport })));

const screenshotPaths = new Set([
  '/hub/training/coach-mode',
  '/hub/training/icm-calculator',
  '/hub/training/arena/cash-001?level=1',
  '/hub/training/play/cash-001',
]);

function relevantConsoleError(message) {
  return /(?:hydration|uncaught|referenceerror|typeerror|syntaxerror|chunkloaderror|application error|failed to fetch dynamically imported module)/i.test(message);
}

async function inspectJob(page, job) {
  const pageErrors = [];
  const consoleErrors = [];
  const onPageError = (error) => pageErrors.push(error?.stack || error?.message || String(error));
  const onConsole = (message) => {
    if (message.type() === 'error' && relevantConsoleError(message.text())) consoleErrors.push(message.text());
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  const startedAt = Date.now();
  let responseStatus = null;
  let navigationError = null;
  try {
    const response = await page.goto(`${BASE_URL}${job.route.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    responseStatus = response?.status() || null;
    await page.waitForTimeout(550);
  } catch (error) {
    navigationError = error?.message || String(error);
  }

  const metrics = navigationError ? null : await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const bodyText = body?.innerText || '';
    const images = [...document.images];
    const brokenImages = images
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src || image.alt || '<unknown>');
    const errorOverlay = !!document.querySelector('[data-nextjs-dialog-overlay], [data-nextjs-error-page]')
      || /Application error: a client-side exception has occurred/i.test(bodyText);
    const scanlines = document.querySelectorAll('.scanline, .scan-line, .hud-scanline, [class*="scanline"]').length;
    const headerCandidates = document.querySelectorAll('[data-global-header], .universal-header, .sp-universal-header').length;
    return {
      pathname: location.pathname,
      search: location.search,
      title: document.title,
      bodyTextLength: bodyText.trim().length,
      horizontalOverflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
      brokenImages,
      errorOverlay,
      scanlines,
      headerCandidates,
    };
  });

  let screenshot = null;
  if (SCREENSHOTS && !navigationError && screenshotPaths.has(job.route.path)) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const safeName = job.route.path.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '');
    screenshot = resolve(SCREENSHOT_DIR, `${job.viewport.name}-${safeName}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
  }

  page.off('pageerror', onPageError);
  page.off('console', onConsole);
  const failureReasons = [
    ...(navigationError ? [`navigation: ${navigationError}`] : []),
    ...(responseStatus !== null && responseStatus >= 500 ? [`http-${responseStatus}`] : []),
    ...pageErrors.map((error) => `page-error: ${error}`),
    ...consoleErrors.map((error) => `console-error: ${error}`),
    ...(metrics?.errorOverlay ? ['next-error-overlay'] : []),
    ...(metrics?.horizontalOverflowPx > 2 ? [`horizontal-overflow-${metrics.horizontalOverflowPx}px`] : []),
    ...(metrics?.brokenImages || []).map((image) => `broken-image: ${image}`),
    ...(metrics && metrics.bodyTextLength < 5 ? ['empty-document'] : []),
    ...(metrics?.scanlines ? [`scanline-elements-${metrics.scanlines}`] : []),
  ];
  return {
    path: job.route.path,
    template: job.route.template,
    source: job.route.source,
    gameId: job.route.gameId || null,
    productionSafe: job.route.productionSafe,
    viewport: job.viewport.name,
    requestedUrl: `${BASE_URL}${job.route.path}`,
    finalUrl: page.url(),
    responseStatus,
    durationMs: Date.now() - startedAt,
    metrics,
    pageErrors,
    consoleErrors,
    screenshot,
    failureReasons,
    passed: failureReasons.length === 0,
  };
}

async function runWorker(browser, queue, output) {
  while (queue.length) {
    const job = queue.shift();
    if (!job) return;
    const context = await browser.newContext({
      viewport: { width: job.viewport.width, height: job.viewport.height },
      isMobile: job.viewport.isMobile,
      hasTouch: job.viewport.hasTouch,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    output.push(await inspectJob(page, job));
    if (output.length % 50 === 0 || output.length === jobs.length) {
      process.stderr.write(`[training-route-runtime] ${output.length}/${jobs.length} jobs complete\n`);
    }
    await context.close().catch(() => {});
  }
}

const browser = await chromium.launch({ headless: true });
const queue = [...jobs];
const results = [];
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => runWorker(browser, queue, results)));
await browser.close();

results.sort((a, b) => `${a.viewport}:${a.path}`.localeCompare(`${b.viewport}:${b.path}`));
const failed = results.filter((result) => !result.passed);
const report = {
  schemaVersion: 1,
  generatedBy: 'scripts/training-route-runtime-inventory.mjs',
  baseUrl: BASE_URL,
  generatedAt: new Date().toISOString(),
  frozenInvariants: manifest.frozenInvariants,
  scope: {
    routeTemplates: manifest.routes.length,
    canonicalGames: manifest.games.length,
    allUniquePaths: allRoutes.length,
    offset: OFFSET,
    uniquePaths: routes.length,
    viewports: viewports.map((viewport) => viewport.name),
    jobs: jobs.length,
  },
  summary: {
    passed: results.length - failed.length,
    failed: failed.length,
    scanlineElements: results.reduce((sum, result) => sum + (result.metrics?.scanlines || 0), 0),
    overflowFailures: results.filter((result) => (result.metrics?.horizontalOverflowPx || 0) > 2).length,
    brokenImages: results.reduce((sum, result) => sum + (result.metrics?.brokenImages.length || 0), 0),
    pageErrors: results.reduce((sum, result) => sum + result.pageErrors.length, 0),
    consoleErrors: results.reduce((sum, result) => sum + result.consoleErrors.length, 0),
  },
  failures: failed.map(({ path, viewport, failureReasons }) => ({ path, viewport, failureReasons })),
  results,
};

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output: OUTPUT, scope: report.scope, summary: report.summary }, null, 2)}\n`);
if (failed.length && !ALLOW_FAILURES) process.exitCode = 1;
