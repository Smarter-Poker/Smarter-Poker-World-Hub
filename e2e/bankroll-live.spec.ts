/**
 * bankroll-live: READ-ONLY signed-in verification of the PUBLISHED Bankroll
 * Manager on https://smarter.poker.
 *
 * Every Bankroll Manager fix on 2026-11-27 was proven with synthetic rows in a
 * render harness. This suite closes that gap: it signs in as the platform
 * service account (TEST_USER_EMAIL, never Dan's account; the auth setup refuses
 * to guess), pins the deployment it is looking at, and walks every section by
 * its real URL at 375px and on desktop.
 *
 * Each section must: load signed in, raise no uncaught page error, show no
 * error/retry state, keep the global footer fixed at the bottom, and overflow
 * nothing at its width. On the dashboard every chart type is crossed with every
 * time filter through the real dropdowns: the Bankroll Trend renders an SVG
 * path (or the heatmap grid) when the period has data, and otherwise one of its
 * honest empty states.
 *
 * It makes NO writes. Every request is classified by
 * e2e/fixtures/bankrollLiveGuard.mjs before it leaves the browser; a ledger or
 * API write is aborted and fails the test that attempted it. Nothing here
 * clicks a save, log, delete or upload control.
 *
 * Run only through playwright.bankroll-live.config.ts (the `bankroll-live`
 * suite of .github/workflows/e2e-tests.yml). The default config ignores it.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';
import { APP_ORIGIN, classifyRequest, describeRequest, normaliseSha } from './fixtures/bankrollLiveGuard.mjs';
import { CEILING, PHONE_PROFILE, SPEED_RUNS, ceilingBreaches, supabaseLabel } from './fixtures/bankrollPhoneSpeed.mjs';
import { FIXTURE_LOW_CENTS, FIXTURE_PEAK_CENTS, isFixtureRow, isTestRow, missingFixtureSessions } from './fixtures/bankrollWriteGuard.mjs';
import { buildTrend } from '../src/lib/bankroll/analyticsView.mjs';

const EXPECTED_SHA = normaliseSha(process.env.BANKROLL_LIVE_EXPECTED_SHA);
const RECEIPT_DIR = path.resolve(__dirname, '../test-results/bankroll-live/sections');

// URL view -> the heading the page must resolve to (section[aria-label]).
const SECTIONS: Array<{ view: string; title: string; query?: string }> = [
  { view: 'dashboard', title: 'Bankroll Manager' },
  { view: 'trips', title: 'Trip Tracker' },
  { view: 'series', title: 'Series Tracker' },
  { view: 'receipts', title: 'Saved Receipts' },
  { view: 'players', title: 'Player Notes' },
  { view: 'staking', title: 'Staking Tracker' },
  { view: 'staking-profile', title: 'Staking Profile' },
  { view: 'toke-tracker', title: 'Toke Tracker' },
  { view: 'tax', title: 'Tax Reports' },
  { view: 'reports', title: 'Reports' },
  { view: 'tournament-calendar', title: 'Tournament Calendar' },
  { view: 'badges', title: 'Badges' },
  { view: 'rules', title: 'Bankroll Rules' },
  { view: 'goals', title: 'Bankroll Goals' },
  { view: 'settings', title: 'Settings' },
  { view: 'leaks', title: 'Leak Analysis' },
  { view: 'hand-review', title: 'Hand Review' },
  // Category dashboards reached from the World Hub menu (?type=).
  { view: 'type-cash', title: 'Cash Games', query: 'type=cash' },
  { view: 'type-tournament', title: 'Tournaments', query: 'type=tournament' },
  { view: 'type-casino', title: 'Table Games', query: 'type=casino' },
  { view: 'type-slots', title: 'Slots', query: 'type=slots' },
  { view: 'type-sports', title: 'Sports Betting', query: 'type=sports' },
  { view: 'type-expense', title: 'Expenses', query: 'type=expense' },
];

const CHART_TYPES: Array<{ id: string; label: string; title: string }> = [
  { id: 'line', label: 'Line Chart', title: 'Cumulative Net' },
  { id: 'bar', label: 'Bar Chart', title: 'Period Results' },
  { id: 'donut', label: 'Donut Chart', title: 'Category Mix' },
  { id: 'stacked', label: 'Stacked Bar', title: 'Results By Game' },
  { id: 'histogram', label: 'Histogram', title: 'Session Distribution' },
  { id: 'heatmap', label: 'Heatmap', title: 'Daily Results' },
];
const TIME_FILTERS = ['Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'This Year', 'All Time'];
const HONEST_EMPTY = ['No Data For This Period', 'Every Category Is Even For This Period.', 'No Gaming Sessions In This Period.'];

type Guard = { pageErrors: string[]; writes: string[]; shell: string[]; provision: string[]; telemetry: number; sessionRefreshes: number; consoleErrors: number };

function sectionUrl(entry: { view: string; query?: string }) {
  if (entry.query) return `/hub/bankroll-manager?${entry.query}`;
  return `/hub/bankroll-manager?view=${entry.view}`;
}

async function readHealth() {
  const response = await fetch(`${APP_ORIGIN}/api/health`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000) });
  const body: any = await response.json();
  return { ok: response.ok && body?.status === 'ok', sha: normaliseSha(body?.commitSha), deploymentId: String(body?.deploymentId || '') };
}

async function guardPage(page: Page): Promise<Guard> {
  const guard: Guard = { pageErrors: [], writes: [], shell: [], provision: [], telemetry: 0, sessionRefreshes: 0, consoleErrors: 0 };
  await installRealtimeSessionGuard(page.context());
  // The page tutorial prompt is a local-only first-visit card; mark it seen so
  // it never covers a control. No server state is involved.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('bankroll_tutorial_seen_v1', '1');
      localStorage.setItem('bankroll_tutorial_seen_v1:prompt', '1');
    } catch {}
  });
  await page.context().route('**/*', (route) => {
    const request = route.request();
    const kind = classifyRequest(request.method(), request.url(), request.headers());
    if (kind === 'read') return route.continue();
    if (kind === 'session') { guard.sessionRefreshes += 1; return route.continue(); }
    const label = describeRequest(request.method(), request.url());
    if (kind === 'data-write') guard.writes.push(label);
    else if (kind === 'shell') guard.shell.push(label);
    else if (kind === 'provision') guard.provision.push(label);
    else guard.telemetry += 1;
    return route.abort('blockedbyclient');
  });
  page.on('pageerror', (error) => guard.pageErrors.push(String(error?.message || error).slice(0, 300)));
  page.on('console', (message) => { if (message.type() === 'error') guard.consoleErrors += 1; });
  return guard;
}

async function assertSignedIn(page: Page) {
  const signedIn = await page.evaluate(() => {
    try {
      const session = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
      const expiresAt = Number(session?.expires_at || 0);
      return Boolean(session?.user?.id) && (!expiresAt || expiresAt * 1000 > Date.now());
    } catch {
      return false;
    }
  });
  expect(signedIn, 'the service-account session is missing or expired: the page would be checked logged out').toBe(true);
  expect(new URL(page.url()).pathname, 'the page redirected away from the Bankroll Manager').toBe('/hub/bankroll-manager');
}

async function waitForSection(page: Page, title: string) {
  const main = page.locator('section.bankroll-main-content');
  await expect(main, `section did not resolve to "${title}"`).toHaveAttribute('aria-label', title, { timeout: 45_000 });
  await expect(main).toBeVisible();
  // First-paint skeletons and any busy region must settle (useLoadFailsafe caps a load at 8s).
  await expect(page.locator('section.bankroll-main-content [aria-busy="true"]:visible'), 'section is stuck loading').toHaveCount(0, { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1_000);
  return main;
}

async function errorStates(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const cs = getComputedStyle(el as HTMLElement);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const found: string[] = [];
    const bad = /could not|couldn.t|failed|unavailable|went wrong|error loading|try again/i;
    for (const el of document.querySelectorAll('[role="alert"]')) {
      const text = (el.textContent || '').trim();
      if (visible(el) && bad.test(text)) found.push(`alert: ${text.slice(0, 160)}`);
    }
    for (const el of document.querySelectorAll('button, a[role="button"]')) {
      const text = (el.textContent || '').trim();
      if (visible(el) && /^(retry|try again|reload)\b/i.test(text)) found.push(`button: ${text.slice(0, 80)}`);
    }
    for (const el of document.querySelectorAll('h1, h2, h3, p')) {
      const text = (el.textContent || '').trim();
      if (visible(el) && /temporarily unavailable$/i.test(text)) found.push(`boundary: ${text.slice(0, 120)}`);
    }
    return found;
  });
}

async function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const H = window.innerHeight;
    const problems: string[] = [];
    const describe = (el: Element) => {
      const h = el as HTMLElement;
      const cls = typeof h.className === 'string' ? h.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
      const label = h.getAttribute('aria-label') || (h.textContent || '').trim().slice(0, 40);
      return `${h.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${label}"`;
    };
    if (document.documentElement.scrollWidth > W + 1) problems.push(`document scrolls sideways: ${document.documentElement.scrollWidth}px > ${W}px`);
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.right <= W + 1 && r.left >= -1) continue;
      const cs = getComputedStyle(el as HTMLElement);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (acs.overflowX !== 'visible' || acs.position === 'fixed' || a.getAttribute('aria-hidden') === 'true') { clipped = true; break; }
      }
      if (clipped) continue;
      problems.push(`overflows ${W}px (left ${Math.round(r.left)}, right ${Math.round(r.right)}): ${describe(el)}`);
      if (problems.length > 8) break;
    }
    const nav = document.querySelector('nav.bn-nav');
    if (!nav) problems.push('global footer nav.bn-nav is missing');
    else {
      const cs = getComputedStyle(nav);
      const r = nav.getBoundingClientRect();
      if (cs.position !== 'fixed') problems.push(`footer position is ${cs.position}, not fixed`);
      if (cs.bottom !== '0px') problems.push(`footer bottom is ${cs.bottom}, not 0px`);
      // Shown: flush with the viewport bottom. Hidden-on-scroll: slid fully below it.
      const flush = Math.abs(r.bottom - H) <= 1.5;
      const slidOff = r.top >= H - 1.5;
      if (!flush && !slidOff) problems.push(`footer floats mid-page: top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)}, viewport ${H}`);
    }
    return problems;
  });
}

async function checkLayout(page: Page) {
  expect(await layoutProblems(page), 'layout at the top of the section').toEqual([]);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(600);
  expect(await layoutProblems(page), 'layout after scrolling to the end of the section').toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
}

function finish(info: TestInfo, guard: Guard, extra: Record<string, unknown> = {}) {
  const record = {
    test: info.title,
    project: info.project.name,
    expectedSha: EXPECTED_SHA,
    pageErrors: guard.pageErrors,
    blockedWrites: guard.writes,
    blockedShellSideEffects: [...new Set(guard.shell)],
    blockedCreateOnlyProvisioning: [...new Set(guard.provision)],
    blockedTelemetry: guard.telemetry,
    sessionRefreshes: guard.sessionRefreshes,
    consoleErrors: guard.consoleErrors,
    ...extra,
  };
  info.annotations.push({ type: 'bankroll-live', description: JSON.stringify(record) });
  fs.mkdirSync(RECEIPT_DIR, { recursive: true });
  const name = `${info.project.name}--${info.title}`.replace(/[^a-z0-9-]+/gi, '_').slice(0, 120);
  fs.writeFileSync(path.join(RECEIPT_DIR, `${name}.json`), JSON.stringify(record, null, 2));
}

test.describe.configure({ mode: 'parallel' });

test.beforeAll(async () => {
  expect(EXPECTED_SHA, 'BANKROLL_LIVE_EXPECTED_SHA must be the full deployed commit SHA').not.toBeNull();
  const health = await readHealth();
  expect(health.ok, '/api/health is not ok').toBe(true);
  expect(health.sha, 'production is not serving the pinned deployment').toBe(EXPECTED_SHA);
  expect(health.deploymentId.startsWith('dpl_')).toBe(true);
});

test.afterAll(async () => {
  const health = await readHealth();
  expect(health.sha, 'production changed deployment while the suite ran; results are not attributable').toBe(EXPECTED_SHA);
});

for (const entry of SECTIONS) {
  test(`section ${entry.view}`, async ({ page }, info) => {
    const guard = await guardPage(page);
    const extra: Record<string, unknown> = { url: sectionUrl(entry), title: entry.title };
    try {
      const response = await page.goto(sectionUrl(entry), { waitUntil: 'domcontentloaded', timeout: 60_000 });
      expect(response?.status(), 'page response').toBeLessThan(400);
      await waitForSection(page, entry.title);
      await assertSignedIn(page);
      if (entry.view === 'dashboard') {
        // Category dashboards (?type=) render CategoryOverview, which has no trend.
        const region = page.getByRole('region', { name: 'Bankroll Trend' });
        await expect(region).toBeVisible();
        extra.trend = (await region.innerText()).split('\n').slice(0, 3).join(' | ').slice(0, 160);
      }
      extra.errorStates = await errorStates(page);
      expect(extra.errorStates, 'error or retry state shown').toEqual([]);
      await checkLayout(page);
      expect(guard.pageErrors, 'uncaught page errors').toEqual([]);
      expect(guard.writes, 'the page attempted a write (aborted before it left the browser)').toEqual([]);
      extra.passed = true;
    } finally {
      finish(info, guard, extra);
    }
  });
}

async function pickFromDropdown(page: Page, current: RegExp, option: string) {
  const trigger = page.locator('.bankroll-filters-row button').filter({ hasText: current }).first();
  await trigger.click();
  const item = page.locator('.bankroll-dropdown-menu').getByRole('button', { name: option, exact: true });
  await item.click();
  await expect(page.locator('.bankroll-dropdown-menu')).toHaveCount(0);
}

for (const chart of CHART_TYPES) {
  test(`dashboard trend ${chart.id} across every time filter`, async ({ page }, info) => {
    const guard = await guardPage(page);
    await page.goto('/hub/bankroll-manager?view=dashboard', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForSection(page, 'Bankroll Manager');
    await assertSignedIn(page);
    const chartLabels = new RegExp(`^(${CHART_TYPES.map((c) => c.label).join('|')})`);
    await pickFromDropdown(page, chartLabels, chart.label);
    const results: Record<string, string> = {};
    try {
    let current = /^(Last 7 Days|Last 30 Days|Last 90 Days|This Year|All Time)/;
    for (const filter of TIME_FILTERS) {
      await pickFromDropdown(page, current, filter);
      const region = page.getByRole('region', { name: 'Bankroll Trend' });
      await expect(region).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
      await expect(region, 'trend subtitle did not follow the controls').toContainText(`${chart.title} · ${filter}`);
      const text = await region.innerText();
      const empty = HONEST_EMPTY.find((line) => text.includes(line));
      if (empty) {
        if (empty === 'No Data For This Period') {
          await expect(region.locator('strong').first(), 'an empty period must not show a total').toHaveText('N/A');
        }
        results[filter] = `empty: ${empty}`;
      } else if (chart.id === 'heatmap') {
        await expect(region.getByRole('button', { name: 'Previous Month' })).toBeVisible();
        const days = await region.locator('button[aria-label*=", "]').count();
        expect(days, 'heatmap rendered no day cells').toBeGreaterThan(0);
        results[filter] = `heatmap: ${days} day cells`;
      } else {
        // The plot is dynamically imported: wait for a drawn path, not a placeholder.
        // Recharts' own surface: the header's Activity icon is an SVG path too,
        // so a bare `svg path[d]` was satisfied before any chart was drawn.
        const drawn = region.locator('svg.recharts-surface path[d]:not([d=""])');
        await expect(drawn.first(), `${chart.label} / ${filter} has data but drew no SVG path`).toBeAttached({ timeout: 20_000 });
        const sessions = await region.locator('dl').innerText().catch(() => '');
        results[filter] = `svg: ${await drawn.count()} paths; ${sessions.replace(/\s+/g, ' ').slice(0, 80)}`;
      }
      current = new RegExp(`^${filter}`);
    }
    expect(await errorStates(page), 'error or retry state shown').toEqual([]);
    await checkLayout(page);
    expect(guard.pageErrors, 'uncaught page errors').toEqual([]);
    expect(guard.writes, 'the dashboard attempted a write (aborted before it left the browser)').toEqual([]);
    results.passed = 'true';
    } finally {
      finish(info, guard, { chartType: chart.id, results });
    }
  });
}

// PHONE SPEED (2026-11-28). How long the dashboard takes to become usable on a
// mid-range phone over cellular: Lighthouse's mobile reference (4x CPU, Slow 4G),
// cold, signed in, through the same read-only guard as every test above. Runs
// only in the bankroll-live-phone-speed project, alone on its worker, so no
// other test competes for the throttled CPU. See e2e/fixtures/bankrollPhoneSpeed.mjs
// for the profile's source and the disaster ceiling's reasoning.
const SPEED_DIR = path.resolve(__dirname, '../test-results/bankroll-live/speed');

for (let run = 1; run <= SPEED_RUNS; run += 1) {
  test(`phone speed: cold dashboard load ${run} of ${SPEED_RUNS}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'bankroll-live-phone-speed', 'measured only on the throttled phone project');
    const guard = await guardPage(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: PHONE_PROFILE.latencyMs,
      downloadThroughput: PHONE_PROFILE.downloadBytesPerSecond,
      uploadThroughput: PHONE_PROFILE.uploadBytesPerSecond,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: PHONE_PROFILE.cpuThrottlingRate });

    // Bytes on the wire, from Chrome's own accounting (compressed, headers included).
    const types = new Map<string, string>();
    const js = { transferred: 0, decoded: 0, requests: 0 };
    let totalTransferred = 0;
    cdp.on('Network.responseReceived', (e: any) => types.set(e.requestId, e.type));
    cdp.on('Network.dataReceived', (e: any) => { if (types.get(e.requestId) === 'Script') js.decoded += e.dataLength; });
    cdp.on('Network.loadingFinished', (e: any) => {
      totalTransferred += e.encodedDataLength;
      if (types.get(e.requestId) === 'Script') { js.transferred += e.encodedDataLength; js.requests += 1; }
    });
    // Supabase reads: method + path for the receipt, a hash of the full URL
    // only to tell an exact repeat from a different read.
    const supabaseByPath: Record<string, number> = {};
    const exact = new Map<string, number>();
    page.on('request', (request) => {
      const label = supabaseLabel(request.method(), request.url());
      if (!label) return;
      supabaseByPath[label] = (supabaseByPath[label] || 0) + 1;
      const key = createHash('sha256').update(`${request.method()} ${request.url()}`).digest('hex').slice(0, 16);
      exact.set(key, (exact.get(key) || 0) + 1);
    });

    // Timings from navigation start, polled in the page every 50ms.
    await page.addInitScript(() => {
      const w = window as any;
      const s = w.__phoneSpeed = { lcp: [] as number[], longTaskMs: 0, tilesAt: null as number | null, chartAt: null as number | null, chartOutcome: null as string | null, emptyBeforeTiles: false };
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) s.lcp.push(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) s.longTaskMs += e.duration; }).observe({ type: 'longtask', buffered: true }); } catch {}
      const empties = ['No Data For This Period', 'Every Category Is Even For This Period.', 'No Gaming Sessions In This Period.'];
      const timer = setInterval(() => {
        const now = performance.now();
        if (s.tilesAt === null) {
          const tiles = Array.from(document.querySelectorAll('section.bankroll-main-content .bankroll-stats-grid .sd-metric'));
          if (tiles.length >= 2 && tiles.every((t) => /\d/.test(t.textContent || ''))) s.tilesAt = now;
        }
        if (s.chartAt === null) {
          const region = document.querySelector('section[aria-label="Bankroll Trend"]');
          if (region && region.getAttribute('aria-busy') === 'false') {
            const text = region.textContent || '';
            const empty = empties.find((line) => text.includes(line));
            if (region.querySelector('svg.recharts-surface path[d]:not([d=""])')) s.chartOutcome = 'drawn';
            else if (region.querySelector('button[aria-label*=", "]')) s.chartOutcome = 'heatmap';
            else if (empty) s.chartOutcome = `empty: ${empty}`;
            if (s.chartOutcome) s.chartAt = now;
            // An empty trend while the tiles still read "-" is the page
            // claiming "no data" before it has read any: a false empty.
            if (s.chartOutcome && s.chartOutcome.startsWith('empty') && s.tilesAt === null) s.emptyBeforeTiles = true;
          }
        }
        if (s.tilesAt !== null && s.chartAt !== null) clearInterval(timer);
      }, 50);
    });

    const record: Record<string, unknown> = { run, profile: PHONE_PROFILE.name };
    try {
      const response = await page.goto('/hub/bankroll-manager?view=dashboard', { waitUntil: 'domcontentloaded', timeout: 120_000 });
      expect(response?.status(), 'page response').toBeLessThan(400);
      await page.waitForFunction(() => {
        const s = (window as any).__phoneSpeed;
        return s && s.tilesAt !== null && s.chartAt !== null;
      }, undefined, { timeout: CEILING.chartMs + 30_000, polling: 250 }).catch(() => undefined);
      // Let the first load finish its trailing reads before counting them.
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      await assertSignedIn(page);
      const timings = await page.evaluate(() => {
        const s = (window as any).__phoneSpeed;
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        return {
          lcpMs: s.lcp.length ? s.lcp[s.lcp.length - 1] : null,
          tilesMs: s.tilesAt, chartMs: s.chartAt, chartOutcome: s.chartOutcome, emptyBeforeTiles: s.emptyBeforeTiles,
          longTaskMs: Math.round(s.longTaskMs),
          ttfbMs: nav ? nav.responseStart : null,
          domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
          loadMs: nav && nav.loadEventEnd > 0 ? nav.loadEventEnd : null,
        };
      });
      Object.assign(record, timings, {
        jsTransferredBytes: js.transferred,
        jsDecodedBytes: js.decoded,
        jsRequests: js.requests,
        totalTransferredBytes: totalTransferred,
        supabaseRequests: Object.values(supabaseByPath).reduce((a, b) => a + b, 0),
        supabaseExactDuplicates: [...exact.values()].reduce((a, n) => a + (n - 1), 0),
        supabaseByPath,
      });
      // The default period can be empty for the service account, and then
      // the "chart drawn" above is its honest empty state. All Time is the
      // widest window the account has: the time from choosing it to the plot
      // drawn includes the Recharts chunk, which the first load never fetched.
      if (timings.tilesMs !== null && timings.chartMs !== null) {
        const started = Date.now();
        await pickFromDropdown(page, /^(Last 7 Days|Last 30 Days|Last 90 Days|This Year|All Time)/, 'All Time');
        const outcome = await page.waitForFunction(() => {
          const region = document.querySelector('section[aria-label="Bankroll Trend"]');
          if (!region || region.getAttribute('aria-busy') !== 'false' || !(region.textContent || '').includes('All Time')) return null;
          if (region.querySelector('svg.recharts-surface path[d]:not([d=""])')) return 'drawn';
          const text = region.textContent || '';
          return ['No Data For This Period', 'Every Category Is Even For This Period.', 'No Gaming Sessions In This Period.'].find((line) => text.includes(line)) ? 'empty' : null;
        }, undefined, { timeout: CEILING.chartMs, polling: 50 }).then((h) => h.jsonValue()).catch(() => null);
        record.allTimeChartMs = outcome ? Date.now() - started : null;
        record.allTimeChartOutcome = outcome || 'not drawn';
      }
      expect(guard.writes, 'the dashboard attempted a write (aborted before it left the browser)').toEqual([]);
      expect(ceilingBreaches(record), 'phone load crossed the disaster ceiling').toEqual([]);
      record.passed = true;
    } finally {
      fs.mkdirSync(SPEED_DIR, { recursive: true });
      fs.writeFileSync(path.join(SPEED_DIR, `run-${run}.json`), JSON.stringify(record, null, 2));
      finish(info, guard, { phoneSpeed: record });
    }
  });
}

/** "+$29,217" / "\u2212$14,363" -> cents. */
function trendCents(text: string): number {
  const t = String(text).replace(/\s/g, '');
  const m = /([+\-\u2212]?)[$\u20ac]([\d,]+(?:\.\d{1,2})?)/.exec(t);
  if (!m) throw new Error(`no amount in "${text}"`);
  const value = Math.round(Number(m[2].replace(/,/g, '')) * 100);
  return m[1] === '-' || m[1] === '\u2212' ? -value : value;
}

// When the bankroll-write-live fixture is on the service account, the All Time
// trend must show its peak and low (READ-ONLY: GETs as the signed-in user).
test('dashboard All Time trend shows the fixture peak and low', async ({ page }, info) => {
  const guard = await guardPage(page);
  let supabase: string | null = null, apikey: string | null = null;
  page.on('request', (request) => {
    if (!apikey && /\.supabase\.co\/rest\/v1\//.test(request.url()) && request.headers().apikey) {
      supabase = new URL(request.url()).origin;
      apikey = request.headers().apikey;
    }
  });
  const extra: Record<string, unknown> = {};
  try {
    await page.goto('/hub/bankroll-manager?view=dashboard', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForSection(page, 'Bankroll Manager');
    await assertSignedIn(page);
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}'));
    expect(supabase && apikey, 'no Supabase read seen').toBeTruthy();
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const response = await fetch(`${supabase}/rest/v1/bankroll_ledger?select=id,category,entry_date,gross_in,gross_out,net_result,notes&user_id=eq.${session.user.id}&is_revision=eq.false&order=id.asc`, {
        headers: { apikey: apikey!, Authorization: `Bearer ${session.access_token}`, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
      });
      expect(response.ok, 'ledger read').toBe(true);
      const batch = await response.json();
      rows.push(...batch);
      if (batch.length < 1000) break;
    }
    const fixturePresent = missingFixtureSessions(rows).length === 0;
    extra.fixturePresent = fixturePresent;
    if (!fixturePresent) {
      extra.passed = 'fixture absent: nothing to compare';
      return;
    }
    const foreign = rows.filter((r) => !isFixtureRow(r) && !isTestRow(r) && r.category !== 'deposit' && r.category !== 'withdrawal');
    const all = buildTrend(rows, '2000-01-01', '2099-12-31');
    const expected = foreign.length ? { peak: all.high, low: all.low } : { peak: FIXTURE_PEAK_CENTS, low: FIXTURE_LOW_CENTS };
    extra.foreignResultRows = foreign.length;
    await pickFromDropdown(page, /^(Line Chart|Bar Chart|Donut Chart|Stacked Bar|Histogram|Heatmap)/, 'Line Chart');
    await pickFromDropdown(page, /^(Last 7 Days|Last 30 Days|Last 90 Days|This Year|All Time)/, 'All Time');
    const region = page.getByRole('region', { name: 'Bankroll Trend' });
    await expect(region).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
    const curve = region.locator('path.recharts-area-curve').first();
    await expect(curve, 'the line chart drew no curve').toBeAttached({ timeout: 20_000 });
    const ys = ((await curve.getAttribute('d')) || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter((_, i) => i % 2 === 1) || [];
    const peak = trendCents(await region.locator('dl div').filter({ hasText: 'Peak Net' }).locator('dd').innerText());
    const low = trendCents(await region.locator('dl div').filter({ hasText: 'Lowest Net' }).locator('dd').innerText());
    Object.assign(extra, { points: ys.length, peak, low, expected });
    expect(ys.length, 'the line has no more than two points').toBeGreaterThan(2);
    expect(Math.max(...ys), 'the line is flat').not.toBe(Math.min(...ys));
    expect(peak, 'Peak Net').toBe(expected.peak);
    expect(low, 'Lowest Net').toBe(expected.low);
    expect(guard.writes, 'the dashboard attempted a write').toEqual([]);
    extra.passed = true;
  } finally {
    finish(info, guard, extra);
  }
});
