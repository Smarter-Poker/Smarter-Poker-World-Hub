/**
 * MOBILE PERFORMANCE BUDGET for the ten rollout pages.
 *
 * Dan, 2026-09-03 (mobile programme, item 10): "add a Lighthouse mobile
 * budget to CI so it cannot regress." Lighthouse itself needs a full Chrome
 * plus its own harness on the estate's self-hosted runners; Playwright is
 * already there (Global Footer E2E builds and serves production), so the
 * budget is measured with it: at 375px, unauthenticated, against the
 * production build. Numbers come from the browser's own Performance API.
 *
 * What is measured per route:
 *   - jsBytes: transferred bytes of every script the page loads before
 *     `load` (the thing that actually hurts on a phone radio);
 *   - lcpMs: Largest Contentful Paint;
 *   - overflow: document.scrollWidth must equal innerWidth (no sideways
 *     page scroll, the always-displayed law);
 *   - smallText: no rendered text under 12px;
 *   - tinyTargets: no <button>/<a role=button> under 44px on either axis
 *     (excluding hidden ones).
 *
 * Budgets live in scripts/ci/mobile-budget.json. A converted phase gets its
 * own tighter row there; unconverted pages keep the generous default so this
 * spec does not block PRs for pages nobody has touched yet. Tighten, never
 * loosen: a row may only go down.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { assertPnmMobileBudget } from '../scripts/ci/lib/pnmMobileBudget.mjs';

type Budget = { jsKb: number; lcpMs: number; converted: boolean };
const budgets: Record<string, Budget> = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'scripts/ci/mobile-budget.json'), 'utf8'),
).routes;

const ROUTES = Object.keys(budgets);

// Only the PNM budget needs this actual Chromium LCP measurement. Other worlds
// retain their existing project/browser settings. No unsupported zero is a pass.
const pnmMeasuredTest = test.extend({
  page: async ({ playwright }, providePage) => {
    const browser = await playwright.chromium.launch();
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
    try {
      const page = await context.newPage();
      const network = await context.newCDPSession(page);
      await network.send('Network.enable');
      await network.send('Network.setCacheDisabled', { cacheDisabled: true });
      await providePage(page);
    }
    finally { await context.close(); await browser.close(); }
  },
});

for (const route of ROUTES) {
  const budget = budgets[route];
  const routeTest = route === '/hub/poker-near-me' ? pnmMeasuredTest : test;
  routeTest(`mobile budget: ${route}`, async ({ page }) => {
    const scripts: { url: string; bytes: number }[] = [];
    const scriptMeasurements: Promise<void>[] = [];
    let unmeasuredScripts = 0;
    page.on('response', (res) => {
      const req = res.request();
      if (req.resourceType() !== 'script') return;
      scriptMeasurements.push((async () => {
      try {
        await res.finished();
        const sizes = await req.sizes();
        if (!Number.isFinite(sizes.responseBodySize) || sizes.responseBodySize <= 0) unmeasuredScripts += 1;
        scripts.push({ url: res.url(), bytes: sizes.responseBodySize });
      } catch (_) {
        unmeasuredScripts += 1;
      }
      })());
    });

    await page.goto(route, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForTimeout(1500);

    const metrics = await page.evaluate(async () => {
      const lcp: number = await new Promise((resolve) => {
        let value = 0;
        try {
          const po = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) value = (e as PerformanceEntry).startTime;
          });
          po.observe({ type: 'largest-contentful-paint', buffered: true });
          setTimeout(() => {
            po.disconnect();
            resolve(value);
          }, 300);
        } catch (_) {
          resolve(0);
        }
      });
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      let smallText = 0;
      let tinyTargets = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set<Element>();
      while (walker.nextNode()) {
        const el = walker.currentNode.parentElement;
        if (!el || seen.has(el) || !walker.currentNode.textContent?.trim()) continue;
        seen.add(el);
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // The approved header is artwork scaled to the viewport; its badge
        // digits are pinned by global-header-approved.test.mjs, not here.
        if (el.closest('.approved-global-header, [data-artwork]')) continue;
        if (parseFloat(cs.fontSize) < 12 && !el.closest('[data-allow-small]')) smallText += 1;
      }
      for (const el of Array.from(document.querySelectorAll('button, a[role="button"], [role="button"]'))) {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (el.closest('.approved-global-header, [data-artwork]')) continue; // artwork hit regions are measured by their own test
        // A paint grid (Preflop Charts' 13x13 range matrix, mobile phase 2) is
        // ONE control with 169 states, the way a colour picker or a slider is
        // one control: the player drags across it, and a 44px cell would make
        // it 628px wide at 375px. Its cells are role="gridcell", not buttons,
        // so they never reach this loop; the attribute is here so a future
        // control inside such a grid is judged the same way. The grid itself
        // is measured for overflow above like everything else.
        if (el.closest('[data-allow-small-target]')) continue;
        if (r.width < 44 || r.height < 44) tinyTargets += 1;
      }
      return { lcp, overflow, smallText, tinyTargets };
    });

    await Promise.all(scriptMeasurements);
    const jsBytes = scripts.reduce((n, s) => n + (s.bytes || 0), 0);
    const jsKb = Math.round(jsBytes / 1024);

    if (route === '/hub/poker-near-me') {
      assertPnmMobileBudget({ jsBytes, lcpMs: metrics.lcp, scriptCount: scripts.length, unmeasuredScripts, overflow: metrics.overflow }, budget);
    }

    test.info().annotations.push({ type: 'budget', description: JSON.stringify({ route, jsKb, ...metrics }) });

    expect(metrics.overflow, `${route} scrolls sideways by ${metrics.overflow}px`).toBeLessThanOrEqual(0);
    expect(jsKb, `${route} ships ${jsKb}KB of JS (budget ${budget.jsKb}KB)`).toBeLessThanOrEqual(budget.jsKb);
    if (metrics.lcp > 0) {
      expect(metrics.lcp, `${route} LCP ${Math.round(metrics.lcp)}ms (budget ${budget.lcpMs}ms)`).toBeLessThanOrEqual(budget.lcpMs);
    }
    if (budget.converted) {
      expect(metrics.smallText, `${route} renders ${metrics.smallText} text nodes under 12px`).toBe(0);
      expect(metrics.tinyTargets, `${route} has ${metrics.tinyTargets} tap targets under 44px`).toBe(0);
    }
  });
}
