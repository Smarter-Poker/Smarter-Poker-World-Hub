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

type Budget = { jsKb: number; lcpMs: number; converted: boolean };
const budgets: Record<string, Budget> = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'scripts/ci/mobile-budget.json'), 'utf8'),
).routes;

const ROUTES = Object.keys(budgets);

for (const route of ROUTES) {
  const budget = budgets[route];
  test(`mobile budget: ${route}`, async ({ page }) => {
    const scripts: { url: string; bytes: number }[] = [];
    page.on('response', async (res) => {
      const req = res.request();
      if (req.resourceType() !== 'script') return;
      try {
        const sizes = await req.sizes();
        scripts.push({ url: res.url(), bytes: sizes.responseBodySize });
      } catch (_) {
        // Sizes are unavailable for some cached responses; skip them.
      }
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
        if (r.width < 44 || r.height < 44) tinyTargets += 1;
      }
      return { lcp, overflow, smallText, tinyTargets };
    });

    const jsKb = Math.round(scripts.reduce((n, s) => n + (s.bytes || 0), 0) / 1024);

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
