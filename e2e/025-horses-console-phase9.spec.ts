import { expect, test, type Page, type Request, type Response, type Route } from '@playwright/test';

test.use({
  storageState: { cookies: [], origins: [] },
  serviceWorkers: 'block',
});

const OPERATOR_ID = '00000000-0000-4000-8000-000000000909';
const ALL_TAB_PERMISSIONS = [
  'fleet.read',
  'settings.write',
  'money.read',
  'console.read',
  'players.read',
  'clubs.read',
  'audit.read',
  'sql.execute',
];

type RuntimeFailures = {
  pageErrors: string[];
  chunkFailures: string[];
};

function watchRuntime(page: Page): RuntimeFailures {
  const failures: RuntimeFailures = { pageErrors: [], chunkFailures: [] };
  page.on('pageerror', (error) => failures.pageErrors.push(error.message));
  page.on('requestfailed', (request: Request) => {
    if (request.resourceType() === 'script' || /\/_next\/static\/chunks\//.test(request.url())) {
      failures.chunkFailures.push(`${request.url()} ${request.failure()?.errorText || 'request failed'}`);
    }
  });
  page.on('response', (response: Response) => {
    if ((response.request().resourceType() === 'script' || /\/_next\/static\/chunks\//.test(response.url()))
      && response.status() >= 400) {
      failures.chunkFailures.push(`${response.url()} HTTP ${response.status()}`);
    }
  });
  return failures;
}

function canonicalPage(overrides: Record<string, unknown> = {}) {
  return {
    rows: [],
    total: 0,
    limit: 100,
    offset: 0,
    hasMore: false,
    truncated: false,
    ...overrides,
  };
}

function apiFixture(permissions: string[]) {
  const page = canonicalPage();
  return {
    success: true,
    ...page,
    data: page,
    operatorId: OPERATOR_ID,
    userId: OPERATOR_ID,
    permissions,
    operator: {
      id: OPERATOR_ID,
      role: 'god',
      roles: ['god'],
      grantedRoles: ['god'],
      permissions,
      degraded: false,
    },
    policy: {
      approvals_enabled: false,
      allow_self_approve_when_alone: false,
      mint_threshold: 0,
      fund_threshold: 0,
      cashout_threshold: 0,
      approval_ttl_minutes: 1440,
    },
    aloneRule: null,
    badges: { openTickets: 0, pendingCashouts: 0, ledgerCritical: 0 },
    settings: { engine_enabled: true, posts_per_day: 3 },
    stats: {},
    summary: {},
    pages: {},
    codes: [],
    rewardTypes: [],
    questions: [],
    approvals: [],
    pending: [],
    history: [],
    roles: [],
    staff: [],
    clubs: [],
    unions: [],
    players: [],
    entries: [],
    reviews: [],
    reports: [],
    appeals: [],
    incidents: page,
    periods: page,
    payouts: page,
  };
}

async function installSignedInPolicyFixture(page: Page, permissions = ALL_TAB_PERMISSIONS) {
  await page.addInitScript(({ operatorId }) => {
    const payload = btoa(JSON.stringify({
      sub: operatorId,
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 86_400,
    })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    localStorage.setItem('smarter-poker-auth', JSON.stringify({
      access_token: `e30.${payload}.phase9`,
      token_type: 'bearer',
      expires_in: 86_400,
      expires_at: Math.floor(Date.now() / 1000) + 86_400,
      refresh_token: 'phase9-browser-fixture-not-a-credential',
      user: { id: operatorId, email: 'phase9.fixture@example.invalid', role: 'authenticated' },
    }));
    sessionStorage.setItem('sp_auth_confirmed', '1');
  }, { operatorId: OPERATOR_ID });

  const fixture = apiFixture(permissions);
  await page.route('**/api/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify(fixture),
    });
  });

  // A few extracted panels intentionally use caller-scoped Supabase RPCs.
  // Stub only data endpoints. Next documents and JavaScript chunks stay on the
  // real server so a missing or stale lazy chunk remains a visible test failure.
  await page.route('**/rest/v1/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/0' },
      body: '[]',
    });
  });
}

async function expectSelectedTab(page: Page, id: string) {
  const tab = page.locator(`[role="tab"][data-tabid="${id}"]`);
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(tab).toHaveAttribute('tabindex', '0');
  await expect(page.locator('main[role="tabpanel"]')).toHaveAttribute('aria-labelledby', `horses-tab-${id}`);
  await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe(id);
}

async function expectPanelChunkSettled(page: Page, label: string) {
  const panel = page.locator('main[role="tabpanel"]');
  await expect(panel.getByText(`Loading ${label}`, { exact: true })).toHaveCount(0, { timeout: 15_000 });
  await expect(panel.getByRole('heading', { name: `${label} Could Not Be Loaded`, exact: true })).toHaveCount(0);
  await expect(panel.getByText('The Code For This Tab Did Not Arrive.', { exact: false })).toHaveCount(0);
}

test.describe('25. Stable Admin Phase 9 architecture smoke', () => {
  test('discovers and visits every rendered top-level tab without a runtime or chunk failure', async ({ page }) => {
    test.setTimeout(180_000);
    const failures = watchRuntime(page);
    await installSignedInPolicyFixture(page);
    await page.goto('/horses', { waitUntil: 'domcontentloaded' });

    const tablist = page.getByRole('tablist', { name: 'Stable Admin Tabs' });
    await expect(tablist).toBeVisible();
    const tabs = tablist.getByRole('tab');
    await expect(tabs).toHaveCount(28);

    const discovered = await tabs.evaluateAll((nodes) => nodes.map((node) => ({
      id: (node as HTMLElement).dataset.tabid || '',
      label: (node.textContent || '').replace(/\s+\([\d,]+\)$/, '').trim(),
    })));
    expect(new Set(discovered.map(({ id }) => id)).size).toBe(28);

    for (const { id, label } of discovered) {
      expect(id, `tab ${label} needs a stable data-tabid`).not.toBe('');
      await page.locator(`[role="tab"][data-tabid="${id}"]`).evaluate((element: HTMLButtonElement) => element.click());
      await expectSelectedTab(page, id);
      await expectPanelChunkSettled(page, label);
    }

    expect(failures.pageErrors).toEqual([]);
    expect(failures.chunkFailures).toEqual([]);
  });

  test('every registered nested navigation surface settles without a runtime or chunk failure', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize(testInfo.project.name.startsWith('mobile')
      ? { width: 375, height: 812 } : { width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const failures = watchRuntime(page);
    await installSignedInPolicyFixture(page);
    await page.goto('/horses', { waitUntil: 'domcontentloaded' });
    const groups = [
      { id: 'fleet', label: 'Fleet Command', role: 'tablist' as const, name: 'Fleet Command Sections', count: 6 },
      { id: 'players', label: 'Players', role: 'tablist' as const, name: 'Players Sections', count: 6 },
      { id: 'integrity', label: 'Integrity', role: 'tablist' as const, name: 'Integrity Sections', count: 8 },
      { id: 'hg-moderation', label: 'HG Moderation', role: 'tablist' as const, name: 'Moderation Sections', count: 4 },
      { id: 'economy', label: 'Economy', role: 'navigation' as const, name: 'Economy sections', count: 6 },
      { id: 'platform', label: 'Platform Operations', role: 'navigation' as const, name: 'Platform Operations Sections', count: 7 },
    ];
    const panel = page.locator('main[role="tabpanel"]');
    for (const group of groups) {
      const topTab = page.locator(`[role="tab"][data-tabid="${group.id}"]`);
      await topTab.scrollIntoViewIfNeeded();
      await topTab.click();
      await expectSelectedTab(page, group.id);
      await expectPanelChunkSettled(page, group.label);
      const navigation = panel.getByRole(group.role, { name: group.name, exact: true });
      const items = navigation.getByRole(group.role === 'tablist' ? 'tab' : 'button');
      await expect(items).toHaveCount(group.count);
      for (let index = 0; index < group.count; index += 1) {
        await items.nth(index).scrollIntoViewIfNeeded();
        await items.nth(index).click();
        if (group.role === 'tablist') await expect(items.nth(index)).toHaveAttribute('aria-selected', 'true');
        await expect(panel.getByText(/^(?:Loading |Reading .*\.\.\.$)/)).toHaveCount(0, { timeout: 15_000 });
        await expect(panel.getByText('The Code For This Tab Did Not Arrive.', { exact: false })).toHaveCount(0);
      }
    }
    const clubTab = page.locator('[role="tab"][data-tabid="clubarena"]');
    await clubTab.scrollIntoViewIfNeeded();
    await clubTab.click();
    await expectSelectedTab(page, 'clubarena');
    await expectPanelChunkSettled(page, 'Club Arena');
    const sections = [
      ['overview', 'Overview'], ['clubs', 'Clubs'], ['revenue', 'Revenue'],
      ['ledger', 'Ledger'], ['finance', 'Cashouts'], ['users', 'Users'],
      ['unions', 'Unions'], ['approvals', 'Union Applications'],
      ['operations', 'Operations'], ['announcements', 'Announcements'],
    ];
    for (const [id, label] of sections) {
      await panel.getByRole('button', { name: new RegExp(`^${label}(?: \u0028[\d,]+\u0029)?$`) }).click();
      await expect.poll(() => (new URL(page.url()).searchParams.get('section') || 'overview')).toBe(id);
      await expect(panel.getByText(/^(?:Loading |Reading .*\.\.\.$)/)).toHaveCount(0, { timeout: 15_000 });
      await expect(panel.getByText('The Code For This Tab Did Not Arrive.', { exact: false })).toHaveCount(0);
    }
    expect(failures.pageErrors).toEqual([]);
    expect(failures.chunkFailures).toEqual([]);
  });

  test('top-level tabs implement automatic Arrow, Home and End keyboard navigation', async ({ page }) => {
    await installSignedInPolicyFixture(page);
    await page.goto('/horses', { waitUntil: 'domcontentloaded' });
    const tabs = page.getByRole('tablist', { name: 'Stable Admin Tabs' }).getByRole('tab');
    await expect(tabs).toHaveCount(28);
    await expectSelectedTab(page, 'stable');

    await tabs.first().focus();
    await expect(tabs.first()).toBeFocused();
    await page.keyboard.press('ArrowRight');
    const secondId = await tabs.nth(1).getAttribute('data-tabid');
    expect(secondId).toBeTruthy();
    await expectSelectedTab(page, secondId as string);
    await expect(tabs.nth(1)).toBeFocused();

    await page.keyboard.press('End');
    const lastId = await tabs.last().getAttribute('data-tabid');
    expect(lastId).toBeTruthy();
    await expectSelectedTab(page, lastId as string);
    await expect(tabs.last()).toBeFocused();

    await page.keyboard.press('Home');
    const firstId = await tabs.first().getAttribute('data-tabid');
    expect(firstId).toBeTruthy();
    await expectSelectedTab(page, firstId as string);
    await expect(tabs.first()).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await expectSelectedTab(page, lastId as string);
    await expect(tabs.last()).toBeFocused();
  });

  test('375px has no document overflow and reduced motion disables smooth tab scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const calls: ScrollIntoViewOptions[] = [];
      Object.defineProperty(window, '__phase9ScrollCalls', { value: calls, configurable: true });
      Element.prototype.scrollIntoView = function scrollIntoView(options?: boolean | ScrollIntoViewOptions) {
        if (options && typeof options === 'object') calls.push(options);
      };
    });
    await installSignedInPolicyFixture(page);
    await page.goto('/horses', { waitUntil: 'domcontentloaded' });

    const tabs = page.getByRole('tablist', { name: 'Stable Admin Tabs' }).getByRole('tab');
    await expect(tabs).toHaveCount(28);
    await tabs.nth(10).evaluate((element: HTMLButtonElement) => element.click());
    await expect.poll(() => page.evaluate(() => {
      const calls = (window as typeof window & { __phase9ScrollCalls?: ScrollIntoViewOptions[] }).__phase9ScrollCalls || [];
      return calls.at(-1)?.behavior || null;
    })).toBe('auto');

    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth - document.body.clientWidth,
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    }));
    expect(overflow.reduced).toBe(true);
    expect(overflow.body).toBeLessThanOrEqual(1);
    expect(overflow.document).toBeLessThanOrEqual(1);
  });

  test('HG Moderation inner tabs expose complete ARIA relationships and keyboard behavior', async ({ page }) => {
    const failures = watchRuntime(page);
    await installSignedInPolicyFixture(page);
    await page.goto('/horses?tab=hg-moderation', { waitUntil: 'domcontentloaded' });
    await expectSelectedTab(page, 'hg-moderation');
    await expectPanelChunkSettled(page, 'HG Moderation');

    const innerList = page.getByRole('tablist', { name: 'Moderation Sections' });
    const innerTabs = innerList.getByRole('tab');
    await expect(innerTabs).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expect(innerTabs.nth(index)).toHaveAttribute('id', `hg-moderation-tab-${index}`);
      await expect(innerTabs.nth(index)).toHaveAttribute('aria-controls', 'hg-moderation-panel');
    }
    const innerPanel = page.locator('#hg-moderation-panel[role="tabpanel"]');
    await expect(innerPanel).toHaveAttribute('aria-labelledby', 'hg-moderation-tab-0');

    await innerTabs.first().focus();
    await innerTabs.first().press('End');
    await expect(innerTabs.last()).toBeFocused();
    await expect(innerTabs.last()).toHaveAttribute('aria-selected', 'true');
    await expect(innerPanel).toHaveAttribute('aria-labelledby', 'hg-moderation-tab-3');
    await innerTabs.last().press('Home');
    await expect(innerTabs.first()).toBeFocused();
    await innerTabs.first().press('ArrowRight');
    await expect(innerTabs.nth(1)).toBeFocused();
    await innerTabs.nth(1).press('ArrowLeft');
    await expect(innerTabs.first()).toBeFocused();

    expect(failures.pageErrors).toEqual([]);
    expect(failures.chunkFailures).toEqual([]);
  });

  test('three legacy bookmarks return 307 and preserve unrelated query values', async ({ page }) => {
    await installSignedInPolicyFixture(page);
    const cases = [
      ['/horses/sql-console', 'sql-console'],
      ['/horses/hg-moderation', 'hg-moderation'],
      ['/horses/hand-reviews', 'hand-reviews'],
    ] as const;

    for (const [legacyPath, tab] of cases) {
      const redirect = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === legacyPath && response.status() === 307;
      });
      await page.goto(`${legacyPath}?keep=phase9&tab=stale`, { waitUntil: 'domcontentloaded' });
      await redirect;
      await expect.poll(() => {
        const url = new URL(page.url());
        return { path: url.pathname, tab: url.searchParams.get('tab'), keep: url.searchParams.get('keep') };
      }).toEqual({ path: '/horses', tab, keep: 'phase9' });
      await expectSelectedTab(page, tab);
    }
  });

  test('SQL Console is hidden and a restricted direct deep link safely relocates', async ({ page }) => {
    const restricted = ALL_TAB_PERMISSIONS.filter((permission) => permission !== 'sql.execute');
    const failures = watchRuntime(page);
    await installSignedInPolicyFixture(page, restricted);
    await page.goto('/horses?tab=sql-console', { waitUntil: 'domcontentloaded' });

    const tablist = page.getByRole('tablist', { name: 'Stable Admin Tabs' });
    await expect(tablist).toBeVisible();
    await expect(tablist.getByRole('tab', { name: 'SQL Console', exact: true })).toHaveCount(0);
    await expectSelectedTab(page, 'stable');
    await expect(page.locator('main[role="tabpanel"]')).not.toContainText('Execute SQL');
    expect(failures.pageErrors).toEqual([]);
    expect(failures.chunkFailures).toEqual([]);
  });
});
