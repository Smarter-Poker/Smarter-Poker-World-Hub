import { expect, test, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type TriviaBudget = {
  lcpMs: number;
  inpMs: number;
  cls: number;
  jsKb: number;
  cssKb: number;
  imageKb: number;
  queryCount: number;
  jsHeapMb: number;
};

type TriviaBudgetRegistry = {
  samples: number;
  defaults: TriviaBudget;
  routes: Record<string, Partial<TriviaBudget>>;
};

type Sample = TriviaBudget & {
  status: number;
};

const registry = (JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'scripts/ci/mobile-budget.json'), 'utf8'),
) as { trivia: TriviaBudgetRegistry }).trivia;

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
const kb = (bytes: number) => bytes / 1024;
const mb = (bytes: number) => bytes / (1024 * 1024);

function p75(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.75) - 1)];
}

async function installVitalObservers(page: Page) {
  await page.addInitScript(() => {
    const supported = new Set(PerformanceObserver.supportedEntryTypes || []);
    const state = {
      lcpMs: null as number | null,
      cls: 0,
      inpMs: null as number | null,
      lcpSupported: supported.has('largest-contentful-paint'),
      clsSupported: supported.has('layout-shift'),
      inpSupported: supported.has('event') && Boolean(performance.eventCounts),
    };

    Object.defineProperty(window, '__triviaPhase11Vitals', {
      value: state,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    if (state.lcpSupported) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.lcpMs = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    }

    if (state.clsSupported) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
          if (!entry.hadRecentInput) state.cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    }

    if (state.inpSupported) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { duration: number; interactionId: number }>) {
          if (entry.interactionId > 0) state.inpMs = Math.max(state.inpMs || 0, entry.duration);
        }
      }).observe({
        type: 'event',
        buffered: true,
        durationThreshold: 16,
      } as PerformanceObserverInit & { durationThreshold: number });
    }
  });
}

async function trustedNonNavigatingInteraction(page: Page) {
  const point = await page.evaluate(() => {
    const root = document.querySelector('main') || document.body;
    const rect = root.getBoundingClientRect();
    const candidates = [
      [rect.left + rect.width * 0.5, rect.top + Math.min(rect.height * 0.5, window.innerHeight * 0.6)],
      [window.innerWidth - 8, window.innerHeight * 0.55],
      [8, window.innerHeight * 0.55],
    ];

    for (const [rawX, rawY] of candidates) {
      const x = Math.max(2, Math.min(window.innerWidth - 2, rawX));
      const y = Math.max(2, Math.min(window.innerHeight - 2, rawY));
      const target = document.elementFromPoint(x, y);
      if (target && !target.closest('a, button, input, select, textarea, [role="button"]')) return { x, y };
    }
    return { x: Math.max(2, window.innerWidth - 3), y: Math.max(2, window.innerHeight - 3) };
  });

  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(300);
}

async function measureColdMobileSample(browser: Browser, route: string): Promise<Sample> {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await installVitalObservers(page);

  const transferred = { script: 0, stylesheet: 0, image: 0 };
  let queryCount = 0;
  const pendingSizes = new Set<Promise<void>>();
  const sizeErrors: string[] = [];

  page.on('request', (request) => {
    if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') queryCount += 1;
  });
  page.on('response', (response) => {
    const type = response.request().resourceType();
    if (type !== 'script' && type !== 'stylesheet' && type !== 'image') return;
    const read = response.request().sizes()
      .then((sizes) => { transferred[type] += Math.max(0, sizes.responseBodySize || 0); })
      .catch(() => {
        sizeErrors.push(`${route} did not expose transfer size for ${response.url()}`);
      })
      .finally(() => pendingSizes.delete(read));
    pendingSizes.add(read);
  });

  try {
    const response = await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'load', timeout: 90_000 });
    const status = response?.status() || 0;
    expect(status, `${route} must render successfully before its performance result is meaningful`).toBeGreaterThanOrEqual(200);
    expect(status, `${route} must render successfully before its performance result is meaningful`).toBeLessThan(400);

    await page.evaluate(async () => { await document.fonts?.ready; });
    await page.waitForTimeout(900);
    await trustedNonNavigatingInteraction(page);
    await Promise.all([...pendingSizes]);
    expect(sizeErrors, sizeErrors.join('\n')).toEqual([]);

    const vitals = await page.evaluate(() => {
      const state = (window as typeof window & {
        __triviaPhase11Vitals?: {
          lcpMs: number | null;
          cls: number;
          inpMs: number | null;
          lcpSupported: boolean;
          clsSupported: boolean;
          inpSupported: boolean;
        };
      }).__triviaPhase11Vitals;
      const clickCount = performance.eventCounts?.get('click') || 0;
      return {
        ...state,
        // Event Timing reports only interactions at or above its 16ms floor.
        // A trusted click with no entry is therefore a measured sub-16ms INP,
        // not a missing result. Unsupported APIs remain null and fail below.
        inpMs: state?.inpMs ?? (state?.inpSupported && clickCount > 0 ? 0 : null),
      };
    });
    const chromeMetrics = await cdp.send('Performance.getMetrics');
    const heapBytes = chromeMetrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value;

    expect(vitals?.lcpSupported, `${route} browser did not support LCP observation`).toBe(true);
    expect(vitals?.clsSupported, `${route} browser did not support CLS observation`).toBe(true);
    expect(vitals?.inpSupported, `${route} browser did not support Event Timing/INP observation`).toBe(true);
    expect(vitals?.lcpMs, `${route} produced no LCP entry`).not.toBeNull();
    expect(vitals?.inpMs, `${route} produced no trusted interaction timing`).not.toBeNull();
    expect(Number.isFinite(heapBytes), `${route} produced no Chromium JS heap metric`).toBe(true);

    return {
      status,
      lcpMs: vitals?.lcpMs as number,
      inpMs: vitals?.inpMs as number,
      cls: vitals?.cls as number,
      jsKb: kb(transferred.script),
      cssKb: kb(transferred.stylesheet),
      imageKb: kb(transferred.image),
      queryCount,
      jsHeapMb: mb(heapBytes as number),
    };
  } finally {
    await context.close();
  }
}

for (const [route, override] of Object.entries(registry.routes)) {
  test(`Trivia mobile p75 budget: ${route}`, async ({ browser }) => {
    test.setTimeout(150_000);
    const budget = { ...registry.defaults, ...override };
    const samples: Sample[] = [];
    for (let index = 0; index < registry.samples; index += 1) {
      samples.push(await measureColdMobileSample(browser, route));
    }

    const measured = {
      lcpMs: p75(samples.map((sample) => sample.lcpMs)),
      inpMs: p75(samples.map((sample) => sample.inpMs)),
      cls: p75(samples.map((sample) => sample.cls)),
      jsKb: p75(samples.map((sample) => sample.jsKb)),
      cssKb: p75(samples.map((sample) => sample.cssKb)),
      imageKb: p75(samples.map((sample) => sample.imageKb)),
      queryCount: p75(samples.map((sample) => sample.queryCount)),
      jsHeapMb: p75(samples.map((sample) => sample.jsHeapMb)),
    };

    test.info().annotations.push({
      type: 'trivia-phase-11-budget',
      description: JSON.stringify({ route, samples, p75: measured, budget }),
    });

    expect(measured.lcpMs, `${route} p75 LCP ${Math.round(measured.lcpMs)}ms`).toBeLessThanOrEqual(budget.lcpMs);
    expect(measured.inpMs, `${route} p75 INP ${Math.round(measured.inpMs)}ms`).toBeLessThanOrEqual(budget.inpMs);
    expect(measured.cls, `${route} p75 CLS ${measured.cls.toFixed(3)}`).toBeLessThanOrEqual(budget.cls);
    expect(measured.jsKb, `${route} p75 JS ${measured.jsKb.toFixed(0)}KB`).toBeLessThanOrEqual(budget.jsKb);
    expect(measured.cssKb, `${route} p75 CSS ${measured.cssKb.toFixed(0)}KB`).toBeLessThanOrEqual(budget.cssKb);
    expect(measured.imageKb, `${route} p75 images ${measured.imageKb.toFixed(0)}KB`).toBeLessThanOrEqual(budget.imageKb);
    expect(measured.queryCount, `${route} p75 browser query count ${measured.queryCount}`).toBeLessThanOrEqual(budget.queryCount);
    expect(measured.jsHeapMb, `${route} p75 JS heap ${measured.jsHeapMb.toFixed(1)}MB`).toBeLessThanOrEqual(budget.jsHeapMb);
  });
}
