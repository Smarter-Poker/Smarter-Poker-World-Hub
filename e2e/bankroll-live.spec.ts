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
import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';
import { APP_ORIGIN, classifyRequest, describeRequest, normaliseSha } from './fixtures/bankrollLiveGuard.mjs';

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
        const drawn = region.locator('svg path[d]:not([d=""])');
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
