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

    // A PAGE THAT HAS NOT PAINTED HAS NOT PASSED (2026-10-16). The observer
    // used to be created 1.5s after `load` and read for 300ms. A route whose
    // first paint came later than that reported LCP 0, and `lcp > 0` below
    // then skipped the budget entirely: the slowest loads were the ones that
    // passed. Locally, against the production build of main 3155bce, ten of
    // the twelve roots measured 0 that way. Observe from navigation start and,
    // when nothing has painted yet, wait for the first paint (bounded) instead
    // of reading zero. Same browser, viewport and settle window otherwise.
    await page.addInitScript(() => {
      const w = window as unknown as { __mobileBudgetLcp: number[]; __mobileBudgetLcpSupported: boolean };
      w.__mobileBudgetLcp = [];
      w.__mobileBudgetLcpSupported = false;
      try {
        if (!PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')) return;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            w.__mobileBudgetLcp.push(e.startTime);
            // Named in the failure message, so an LCP miss says WHAT painted last.
            const el = (e as PerformanceEntry & { element?: Element | null; url?: string }).element;
            const url = (e as PerformanceEntry & { url?: string }).url || '';
            (w as unknown as { __mobileBudgetLcpWho?: string }).__mobileBudgetLcpWho =
              `${el ? `<${el.tagName.toLowerCase()} class="${String(el.getAttribute('class') || '').slice(0, 80)}">` : '(detached)'}${url ? ` ${url.slice(-90)}` : ''}`;
            const le = e as unknown as { element?: Element; url?: string; size?: number; renderTime?: number; loadTime?: number };
            const el2 = le.element;
            ((w as unknown as { __lcpDiag: unknown[] }).__lcpDiag ||= []).push({ t: Math.round(e.startTime), render: Math.round(le.renderTime || 0), load: Math.round(le.loadTime || 0), size: le.size, url: le.url, tag: el2 ? el2.tagName + '.' + String((el2 as HTMLElement).className || '').slice(0, 80) + '#' + (el2.id || '') : null, text: el2 ? (el2.textContent || '').trim().slice(0, 60) : null });
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        w.__mobileBudgetLcpSupported = true;
      } catch (_) {
        // Unsupported is recorded, never read as an instant paint.
      }
    });

    await page.goto(route, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => {
      const w = window as unknown as { __mobileBudgetLcp?: number[]; __mobileBudgetLcpSupported?: boolean };
      return !w.__mobileBudgetLcpSupported || (w.__mobileBudgetLcp?.length ?? 0) > 0;
    }, undefined, { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(300);

    const metrics = await page.evaluate(async () => {
      const w = window as unknown as { __mobileBudgetLcp?: number[]; __mobileBudgetLcpSupported?: boolean };
      const lcpSupported = Boolean(w.__mobileBudgetLcpSupported);
      const lcp: number = w.__mobileBudgetLcp?.length ? w.__mobileBudgetLcp[w.__mobileBudgetLcp.length - 1] : 0;
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      let smallText = 0;
      const smallTextNodes: string[] = [];
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
        if (parseFloat(cs.fontSize) < 12 && !el.closest('[data-allow-small]')) {
          smallText += 1;
          if (smallTextNodes.length < 8) smallTextNodes.push(`${cs.fontSize} <${el.tagName.toLowerCase()} class="${String(el.getAttribute('class') || '').slice(0, 60)}"> "${(walker.currentNode.textContent || '').trim().slice(0, 40)}"`);
        }
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
      const lcpElement = (w as unknown as { __mobileBudgetLcpWho?: string }).__mobileBudgetLcpWho || '';
      return { lcp, lcpSupported, overflow, smallText, tinyTargets, smallTextNodes, lcpElement };
    });

    await Promise.all(scriptMeasurements);
    const jsBytes = scripts.reduce((n, s) => n + (s.bytes || 0), 0);
    const jsKb = Math.round(jsBytes / 1024);

    if (route === '/hub/poker-near-me') {
      assertPnmMobileBudget({ jsBytes, lcpMs: metrics.lcp, scriptCount: scripts.length, unmeasuredScripts, overflow: metrics.overflow }, budget);
    }

    // WIP measurement only: per-script breakdown.
    console.log(`BUDGETDUMP ${route} total=${jsKb}KB ` + JSON.stringify(scripts.map((s) => [s.url.replace(/^https?:\/\/[^/]+/, ''), Math.round(s.bytes / 1024)]).sort((a, b) => (b[1] as number) - (a[1] as number))));
    const lcpDiag = await page.evaluate(() => (window as unknown as { __lcpDiag?: unknown[] }).__lcpDiag || []);
    const navT = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined; const fcp = performance.getEntriesByName('first-contentful-paint')[0]; return n ? { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null } : null; });
    console.log(`LCPDIAG ${route} lcp=${Math.round(metrics.lcp)} nav=${JSON.stringify(navT)} ${JSON.stringify(lcpDiag)}`);
    if (route === '/hub/poker-tools' || route === '/hub/toke-tracker') {
      try {
        const cm = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.next', 'wip-chunk-modules.json'), 'utf8'));
        for (const s of scripts) {
          if (s.bytes < 4096) continue;
          const f = s.url.split('/').pop() || '';
          console.log(`CHUNKMODS ${route} ${f} ${Math.round(s.bytes / 1024)}KB ` + JSON.stringify((cm[f] || []).slice(0, 25)));
        }
      } catch (e) { console.log('CHUNKMODS error ' + String(e)); }
    }
    test.info().annotations.push({ type: 'budget', description: JSON.stringify({ route, jsKb, ...metrics }) });

    expect(metrics.overflow, `${route} scrolls sideways by ${metrics.overflow}px`).toBeLessThanOrEqual(0);
    // A miss names the heaviest scripts, so the log says what to cut.
    const heaviest = [...scripts].sort((x, y) => (y.bytes || 0) - (x.bytes || 0)).slice(0, 15)
      .map((s) => `${((s.bytes || 0) / 1024).toFixed(1)}KB ${s.url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')}`).join('\n  ');
    expect(jsKb, `${route} ships ${jsKb}KB of JS (budget ${budget.jsKb}KB); heaviest:\n  ${heaviest}`).toBeLessThanOrEqual(budget.jsKb);
    expect(metrics.lcpSupported, `${route} ran in a browser without Largest Contentful Paint`).toBe(true);
    expect(metrics.lcp, `${route} never reported a Largest Contentful Paint`).toBeGreaterThan(0);
    expect(metrics.lcp, `${route} LCP ${Math.round(metrics.lcp)}ms (budget ${budget.lcpMs}ms); last LCP element ${metrics.lcpElement}`).toBeLessThanOrEqual(budget.lcpMs);
    if (budget.converted) {
      expect(metrics.smallText, `${route} renders ${metrics.smallText} text nodes under 12px: ${metrics.smallTextNodes.join('; ')}`).toBe(0);
      expect(metrics.tinyTargets, `${route} has ${metrics.tinyTargets} tap targets under 44px`).toBe(0);
    }
  });
}
