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
    data: { ...page, clubs: [], unions: [] },
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
  await expect(panel.getByText(/^(?:Loading |Reading .*\.\.\.$)/)).toHaveCount(0, { timeout: 15_000 });
  await expect(panel.getByRole('heading', { name: /Could Not Be Displayed$/ })).toHaveCount(0);
}

test.describe('25. Stable Admin Phase 9 architecture smoke', () => {
  test('signed-in certification surfaces make no automatic production mutations', async ({ page }) => {
    test.setTimeout(90_000);
    await installSignedInPolicyFixture(page);
    // Restore the real auth client against a synthetic user, never a live identity.
    await page.route('**/auth/v1/user', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: OPERATOR_ID, email: 'phase9.fixture@example.invalid', role: 'authenticated', app_metadata: {}, user_metadata: {} }),
    }));
    const unsafe: string[] = [];
    const headerReads: string[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== new URL(page.url()).origin) return;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) unsafe.push(`${request.method()} ${url.pathname}`);
      if (url.pathname === '/api/user/get-header-stats' && request.method() === 'GET'
        && request.headers().authorization?.startsWith('Bearer ')) headerReads.push(url.pathname);
    });
    await page.clock.install();
    await page.goto('/horses?tab=floor', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => headerReads.length).toBeGreaterThan(0);
    for (const [id, label, section] of [
      ['floor', 'Live Floor', ''], ['tournaments', 'Tournaments', ''],
      ['integrity', 'Integrity', 'Identity Links'], ['platform', 'Platform Operations', 'Incidents'],
      ['economy', 'Economy Command', 'Close And Jobs'], ['stats', 'Platform Statistics', ''],
      ['settings', 'Engine Settings', ''], ['pipeline', 'Content Pipeline', ''],
    ]) {
      const tab = page.locator(`[role="tab"][data-tabid="${id}"]`);
      await tab.scrollIntoViewIfNeeded();
      await tab.click();
      await expectSelectedTab(page, id);
      await expectPanelChunkSettled(page, label);
      if (section) {
        const panel = page.locator('main[role="tabpanel"]');
        const control = panel.getByRole(id === 'integrity' ? 'tab' : 'button', { name: section, exact: true });
        await control.click();
        await expect(panel.getByText(/^(?:Loading |Reading .*\.\.\.$)/)).toHaveCount(0, { timeout: 15_000 });
      }
    }
    // Drive the deferred global-mount boundary without sleeping or changing
    // application guards. A forbidden egg/profile mount would now emit its POST.
    await page.clock.fastForward(4_100);
    await expect(page.locator('main[role="tabpanel"]')).toBeVisible();
    expect(unsafe).toEqual([]);
  });

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

// Real console components with synthetic data only; private object and database
// authorization are separately qualified by the exported API/native SQL tests.
test.describe('Stable Admin P3 and O7 connected controls', () => {
  for (const width of [1440, 375]) {
    test(`${width}px private incomplete report requires acknowledgement and verifies download`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await installSignedInPolicyFixture(page);
      await page.route('**/api/horses/fleet**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...apiFixture(ALL_TAB_PERMISSIONS), ...canonicalPage({ rows: [{ id: OPERATOR_ID, display_name: 'Fixture Horse' }], total: 1 }) }) }));
      const bytes = 'id,name\n1,fixture\n';
      const contentSha = await import('node:crypto').then(({ createHash }) => createHash('sha256').update(bytes).digest('hex'));
      const job = { id: '00000000-0000-4000-8000-000000000707', surface: 'fleet-roster', state: 'truncated', progress: 1, total: 30000, content_sha256: contentSha, expires_at: new Date(Date.now() + 86400000).toISOString() };
      const requests: any[] = [];
      await page.route('**/api/horses/export-artifacts**', async route => {
        const url = new URL(route.request().url());
        if (url.searchParams.has('download')) {
          expect(url.searchParams.get('acknowledge')).toBe('1');
          await route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'x-content-sha256': contentSha }, body: bytes });
        } else if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON(); requests.push(body);
          await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ job: { ...job, state: 'queued' } }) });
        } else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobs: [job] }) });
      });
      await page.goto('/horses?tab=fleet', { waitUntil: 'domcontentloaded' });
      await page.getByRole('tab', { name: 'Roster', exact: true }).click();
      await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Private Export Files' })).toBeVisible();
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ action: 'request', surface: 'fleet-roster' });
      expect(requests[0].opId).toMatch(/^[0-9a-f-]{36}$/i);
      const download = page.getByRole('button', { name: 'Download Verified CSV' });
      await expect(download).toBeDisabled();
      await page.getByRole('checkbox', { name: 'I Acknowledge This Is An Incomplete Bounded Report.' }).check();
      const saved = page.waitForEvent('download');
      await download.click();
      expect((await saved).suggestedFilename()).toContain('incomplete');
      await expect(page.getByRole('status').filter({ hasText: 'Verified File Download Requested' })).toBeVisible();
    });
  }
});

test('P3 permitted controls preserve reason and show authoritative permission refusal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installSignedInPolicyFixture(page, [...ALL_TAB_PERMISSIONS, 'moderation.write', 'players.write']);
  const target = '00000000-0000-4000-8000-000000000303';
  const mutations: any[] = [];
  await page.route('**/api/horses/player-admin**', async route => {
    const section = new URL(route.request().url()).searchParams.get('section');
    if (route.request().method() === 'POST') {
      mutations.push(route.request().postDataJSON());
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture Authoritative Permission Refused' }) });
    } else if (section === 'control_outcome') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actorId: OPERATOR_ID, operation: null, writable: true }) });
    else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(section === 'player'
      ? { profile: { id: target, displayName: 'Fixture Player' }, restrictions: [], enforced: true }
      : { ...canonicalPage({ rows: [{ id: target, display_name: 'Fixture Player' }], total: 1 }), enforced: true }) });
  });
  await page.goto('/horses?tab=players', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Fixture Player', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restrict', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'End Existing Sessions', exact: true }).click();
  const group = page.getByRole('group', { name: 'End Existing Sessions' });
  await expect(group.getByRole('button', { name: 'End Existing Sessions', exact: true })).toBeDisabled();
  await group.getByLabel('Reason', { exact: true }).fill('Fixture session safety request');
  await group.getByRole('button', { name: 'End Existing Sessions', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Fixture Authoritative Permission Refused' })).toBeVisible();
  expect(mutations).toHaveLength(1);
  expect(mutations[0]).toMatchObject({ action: 'force_logout', userId: target, note: 'Fixture session safety request' });
  expect(mutations[0].opId).toMatch(/^restrict-[0-9a-f-]{36}$/i);
  const retained = await page.evaluate(({ actorId, target }) => JSON.parse(localStorage.getItem(`stable-player-logout:${actorId}:${target}`) || 'null'), { actorId: OPERATOR_ID, target });
  expect(retained).toMatchObject({ actorId: OPERATOR_ID, userId: target, note: 'Fixture session safety request', opId: mutations[0].opId });
  await expect(page.getByRole('button', { name: 'Retry Same Logout', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Read Logout Receipt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry Same Logout', exact: true })).toBeEnabled();
  expect(mutations).toHaveLength(1);
  expect(await page.evaluate(({ actorId, target }) => JSON.parse(localStorage.getItem(`stable-player-logout:${actorId}:${target}`) || 'null'), { actorId: OPERATOR_ID, target })).toEqual(retained);
});

for (const width of [1440, 375]) {
  test(`${width}px O1 C2 engine unknown receipt and O2 stop CAS recovery`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await installSignedInPolicyFixture(page, [...ALL_TAB_PERMISSIONS, 'clubs.write']);
    let command: any;
    await page.route('**/api/horses/engine-control**', async route => {
      const url = new URL(route.request().url());
      const result = route.request().method() === 'POST'
        ? { command: { id: (command = route.request().postDataJSON()).operationId, status: 'unknown' } }
        : url.searchParams.has('capabilities') ? { capabilities: { floor: ['pause'], maintenance: ['start'] } }
        : { command: { id: command.operationId, status: 'completed' } };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
    });
    await page.route('**/api/horses/platform-admin?section=registry**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [{ key: 'Fixture Registry Source Ready', domain: 'fixture', kind: 'projection', state: 'Open' }] }) }));
    let stop: any;
    await page.route('**/api/horses/emergency-stops**', async route => {
      if (route.request().method() === 'POST') {
        stop = route.request().postDataJSON();
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture Stop Version Changed', code: 'stop_version_changed' }) });
      } else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actorId: OPERATOR_ID, stops: [{ path: 'positive_issuance', label: 'Positive Issuance', stopped: false, version: 7, writable: true }] }) });
    });
    await page.goto('/horses?tab=floor', { waitUntil: 'domcontentloaded' });
    const floor = page.getByRole('region', { name: 'floor Operator Commands' });
    await floor.getByLabel('Audit Reason').fill('Fixture floor safety request');
    await floor.getByRole('button', { name: 'Submit Command' }).click();
    await expect(floor).toContainText('unknown');
    await expect(floor.getByRole('button', { name: 'Submit Command' })).toBeDisabled();
    await floor.getByRole('button', { name: 'Read Durable Outcome' }).click();
    await expect(floor).toContainText('completed');
    expect(command).toMatchObject({ domain: 'floor', action: 'pause' });
    await page.locator('[data-tabid="platform"]').click();
    await Promise.all([page.waitForResponse(response => response.url().includes('/api/horses/platform-admin?section=maintenance')), page.getByRole('button', { name: 'Maintenance', exact: true }).click()]);
    await expect(page.getByRole('button', { name: 'Refresh Active Section', exact: true })).toBeEnabled();
    const maintenance = page.getByRole('region', { name: 'maintenance Operator Commands' });
    await maintenance.getByLabel('Audit Reason').fill('Fixture maintenance safety request');
    await expect(maintenance.getByLabel('Audit Reason')).toHaveValue('Fixture maintenance safety request');
    await expect(maintenance.getByRole('button', { name: 'Submit Command' })).toBeEnabled();
    await maintenance.getByRole('button', { name: 'Submit Command' }).click();
    await expect(maintenance).toContainText('unknown');
    expect(command).toMatchObject({ domain: 'maintenance', action: 'start' });
    await Promise.all([page.waitForResponse(response => response.url().includes('/api/horses/platform-admin?section=registry')), page.getByRole('button', { name: 'Control Registry', exact: true }).click()]);
    await expect(page.getByRole('button', { name: 'Refresh Active Section', exact: true })).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'Fixture Registry Source Ready', exact: true })).toBeVisible();
    const stops = page.locator('section').filter({ has: page.locator('#emergency-stop-title') }).last();
    await expect(stops).toContainText('Positive Issuance');
    await stops.getByLabel('Required Reason').fill('Fixture positive issuance safety');
    await expect(stops.getByRole('button', { name: 'Apply Stop', exact: true })).toBeEnabled();
    await stops.getByRole('button', { name: 'Apply Stop', exact: true }).click({ timeout: 5000 });
    await expect(stops.getByRole('alert')).toHaveText('Fixture Stop Version Changed');
    expect(stop).toMatchObject({ path: 'positive_issuance', stopped: true, expectedVersion: 7 });
    try { await expect(stops.getByRole('button', { name: 'Apply Stop', exact: true })).toBeEnabled(); } catch (failure) { await testInfo.attach('stop-final-state', { body: JSON.stringify({ state: await inspectStopState(), html: await stops.evaluate(element => element.outerHTML) }), contentType: 'application/json' }); throw failure; }
  });
}

for (const width of [1440, 375]) {
  test(`${width}px C4 cancellation approval retains operation without claiming refunds`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await installSignedInPolicyFixture(page, [...ALL_TAB_PERMISSIONS, 'clubs.write', 'money.write']);
    const event = { id: '00000000-0000-4000-8000-000000000404', name: 'Fixture Prestart Event', status: 'scheduled' };
    await page.route('**/api/horses/floor-admin**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(new URL(route.request().url()).searchParams.get('section') === 'event' ? { event } : { tournaments: canonicalPage({ rows: [event], total: 1 }) }) }));
    let request: any;
    let cancellationPosts = 0;
    await page.route('**/api/horses/tournament-admin**', async route => {
      if (route.request().method() === 'POST') {
        cancellationPosts += 1;
        request = route.request().postDataJSON();
        await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ actorId: OPERATOR_ID, operation: { op_id: request.opId, tournament_id: event.id, pending: true, approval_id: 'fixture-approval' } }) });
      } else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(new URL(route.request().url()).searchParams.has('opId')
        ? { actorId: OPERATOR_ID, operation: { op_id: request.opId, tournament_id: event.id, state: 'pending' } }
        : { actorId: OPERATOR_ID, writable: true, eligible: true }) });
    });
    await page.goto('/horses?tab=tournaments', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'View Event Evidence' }).first().click();
    const controls = page.locator('section').filter({ has: page.locator('#cancel-refund-title') }).last();
    await expect(controls.getByRole('button', { name: 'Cancel And Refund This Event' })).toBeDisabled();
    await controls.getByLabel('Required Cancellation Reason').fill('Fixture prestart cancellation safety');
    await controls.getByRole('button', { name: 'Cancel And Refund This Event' }).click();
    await expect(controls.getByRole('status')).toContainText('No Refund Has Been Applied');
    expect(request).toMatchObject({ action: 'cancel_refund', tournamentId: event.id });
    await expect(controls).toContainText(request.opId);
    await expect(controls.getByLabel('Required Cancellation Reason')).toBeDisabled();
    await expect(controls.getByRole('button', { name: 'Read Outcome', exact: true })).toBeEnabled();
    await expect(controls.getByRole('button', { name: 'Retry Same Operation', exact: true })).toBeDisabled();
    await controls.getByRole('button', { name: 'Read Outcome', exact: true }).click();
    await expect(controls.getByRole('button', { name: 'Retry Same Operation', exact: true })).toBeEnabled();
    expect(cancellationPosts).toBe(1);
    await expect(controls).toContainText(request.opId);
    await expect(controls.getByLabel('Required Cancellation Reason')).toBeDisabled();
  });
}
