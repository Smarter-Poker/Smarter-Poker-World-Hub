import { test, expect, type Locator, type Page } from '@playwright/test';
import { installPersonalAssistantFixtures } from './fixtures/personalAssistantBrowser';

type Fixture = Awaited<ReturnType<typeof installPersonalAssistantFixtures>>;
const fixtures = new WeakMap<Page, Fixture>();
test.beforeEach(async ({ page, context, baseURL }) => {
  fixtures.set(page, await installPersonalAssistantFixtures(page, context, baseURL));
});
test.afterEach(async ({ page }) => {
  const fixture = fixtures.get(page)!;
  expect(fixture.errors, 'No Runtime Page Errors').toEqual([]);
  expect(fixture.unexpected, 'All Assistant Network Contracts Must Be Explicit').toEqual([]);
});

async function activate(control: Locator) {
  await control.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'auto' }));
  await control.click();
}

async function openLanding(page: Page) {
  const response = await page.goto('/hub/personal-assistant', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  // A server-confirmed local VIP fixture also proves the signed-in layout;
  // the concurrent guest conversion bar must not cover the approved design.
  await expect(page.getByRole('button', { name: 'VIP Membership Active', exact: true })).toBeVisible();
  await expect(page.getByText('No Saved Hands Yet', { exact: true })).toBeVisible();
  await expect(page.locator('main').getByRole('link', { name: 'Start Review', exact: true })).toBeVisible();
}

async function healthyLayout(page: Page) {
  await expect(page.getByText('Application Error', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

async function loadTemplate(page: Page, name: string) {
  await activate(page.getByRole('button', { name: 'Templates', exact: true }));
  const sheet = page.getByRole('dialog', { name: 'Scenario Templates', exact: true });
  await expect(sheet).toBeVisible();
  const row = sheet.getByText(name, { exact: true }).locator('..').locator('..');
  await activate(row.getByRole('button', { name: 'Load', exact: true }));
  await expect(sheet).toHaveCount(0);
}

async function enterLiveSpot(page: Page) {
  await openLanding(page);
  await activate(page.locator('main').getByRole('button', { name: /^Log A Hand/ }));
  const logger = page.getByRole('dialog', { name: 'Live Poker Spot Quick Logger', exact: true });
  await expect(logger).toBeVisible();
  await logger.getByLabel('Hero Cards', { exact: true }).fill('Qs Js');
  await logger.getByLabel('Position', { exact: true }).selectOption('CO');
  await logger.getByLabel('Stack (BB)', { exact: true }).fill('85');
  await activate(logger.getByRole('group', { name: 'Game Format', exact: true }).getByRole('button', { name: 'Tournament', exact: true }));
  await activate(logger.getByText('Add Board (Optional)', { exact: true }));
  await logger.getByLabel('Board Cards', { exact: true }).fill('Ts 9h 2c 4d 6c');
  await activate(logger.getByRole('button', { name: 'Review & Action', exact: true }));
  await expect(logger.getByLabel('Facing Action', { exact: true })).toHaveValue('facing_bet');
  await logger.getByLabel('Your Action', { exact: true }).selectOption('call');
  return logger;
}

test('approved artwork, fixed chrome and all six landing destinations work', async ({ page }, testInfo) => {
  await openLanding(page);
  const main = page.locator('main');
  await expect(page.locator('[data-artwork="approved-global-header"]')).toBeVisible();
  const footer = page.locator('[data-global-bottom-nav="true"]');
  await expect(footer).toHaveCount(1);
  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => footer.evaluate(element => ({ position: getComputedStyle(element).position, bottom: Math.round(element.getBoundingClientRect().bottom - innerHeight) }))).toEqual({ position: 'fixed', bottom: 0 });
  const sprite = '/images/personal-assistant/approved-layout-sprite.webp';
  const cardSprite = '/images/personal-assistant/approved-card-edit-sprite.webp';
  const reviewArt = '/images/personal-assistant/review-my-play-art.webp';
  const leaksArt = '/images/personal-assistant/my-leaks-art.webp';
  await expect(page.locator(`link[rel="preload"][as="image"][href="${sprite}"]`)).toHaveAttribute('fetchpriority', 'high');
  for (const [kind, viewBox, source, canvasW, canvasH, intrinsicSize] of [
    ['review', '0 0 960 540', reviewArt, '960', '540', { width: 960, height: 540 }],
    ['sandbox', '89 490 507 164', cardSprite, '1249', '1061', { width: 1360, height: 1156 }],
    ['leaks', '0 0 960 540', leaksArt, '960', '540', { width: 960, height: 540 }],
    ['log', '137 797 153 113', sprite, '1249', '1061', { width: 1249, height: 1061 }],
    ['coaching', '666 792 123 119', sprite, '1249', '1061', { width: 1249, height: 1061 }],
  ] as const) {
    const art = main.locator(`svg[data-approved-illustration="${kind}"]`);
    await art.scrollIntoViewIfNeeded();
    await expect(art).toBeVisible();
    await expect(art).toHaveAttribute('viewBox', viewBox);
    await expect(art).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    const image = art.locator('image');
    await expect(image).toHaveAttribute('href', source);
    await expect(image).toHaveAttribute('width', canvasW);
    await expect(image).toHaveAttribute('height', canvasH);
    await expect(image).toHaveAttribute('clip-path', /^url\(#.+\)$/);
    const [vx, vy, vw, vh] = viewBox.split(' ');
    const clipRect = art.locator('clipPath rect');
    await expect(clipRect).toHaveAttribute('x', vx);
    await expect(clipRect).toHaveAttribute('y', vy);
    await expect(clipRect).toHaveAttribute('width', vw);
    await expect(clipRect).toHaveAttribute('height', vh);
    await expect.poll(() => image.evaluate(async (element: SVGImageElement) => {
      const decoded = new Image();
      decoded.src = element.href.baseVal;
      await decoded.decode();
      return { width: decoded.naturalWidth, height: decoded.naturalHeight };
    })).toEqual(intrinsicSize);
    expect(await image.evaluate((element: SVGImageElement) => ({
      alignment: element.preserveAspectRatio.baseVal.align,
      sizing: element.preserveAspectRatio.baseVal.meetOrSlice,
    }))).toEqual({ alignment: 6, sizing: 1 }); // xMidYMid meet, including the differently sized card edit.
    const scales = await art.evaluate((element: SVGSVGElement) => {
      const matrix = element.getScreenCTM()!;
      return [Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)];
    });
    expect(scales[0]).toBeGreaterThan(0);
    expect(Math.abs(scales[0] / scales[1] - 1), 'Artwork Uses Uniform Scaling').toBeLessThan(0.001);
  }
  if (testInfo.project.use.viewport!.width > 768) {
    const heights = await Promise.all(['review', 'sandbox', 'leaks'].map(name => main.locator(`section[aria-labelledby="card-${name}-title"]`).evaluate(element => element.getBoundingClientRect().height)));
    expect(heights[0]).toBeGreaterThan(heights[1]);
    expect(heights[1]).toBeGreaterThan(heights[2]);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await healthyLayout(page);
  await page.screenshot({ path: testInfo.outputPath('approved-landing.png') });

  await activate(main.getByRole('link', { name: 'Start Review', exact: true }));
  await expect(page).toHaveURL(/\/hub\/personal-assistant\/review$/);
  await expect(main.getByRole('heading', { name: 'Review My Play', exact: true })).toBeVisible();
  const sampleTrigger = main.locator('[data-sample-hand-trigger="true"]');
  await expect(sampleTrigger).toBeVisible();
  await activate(sampleTrigger);
  await expect(main.locator('[data-review-arena-table="true"]')).toBeVisible();
  await activate(main.getByRole('link', { name: 'Personal Assistant', exact: true }));
  await expect(main.getByRole('heading', { name: 'Personal Assistant', exact: true })).toBeVisible();

  // Clicking directly on card artwork/images must also navigate to each destination (#SMARTERDESIGN rule 13)
  await activate(main.locator('svg[data-approved-illustration="review"]'));
  await expect(page).toHaveURL(/\/hub\/personal-assistant\/review$/);
  await openLanding(page);

  await activate(main.locator('svg[data-approved-illustration="sandbox"]'));
  await expect(page).toHaveURL(/\/hub\/personal-assistant\/sandbox$/);
  await expect(page.getByRole('region', { name: 'Poker Table', exact: true })).toBeVisible();
  const arenaTable = page.locator('[data-arena-table="true"]');
  await expect(arenaTable).toBeVisible();
  await expect(page.locator('img[data-arena-table-skin="true"]')).toHaveAttribute('src', /\/hub\/table-theme\/tables\/skin_/);
  await expect(page.locator('[data-arena-pot="true"]')).toBeVisible();
  await expect(page.locator('[data-arena-board="true"]')).toBeVisible();
  await expect(page.locator('[data-arena-hero-cards="true"]')).toBeVisible();
  await expect(page.locator('[data-arena-dealer-button="true"]')).toBeVisible();
  // Geometry invariant: board cards stay inside the Club Arena table bounds and never overlap Hero hole cards
  const tableBox = await arenaTable.boundingBox();
  const boardBox = await page.locator('[data-arena-board="true"]').boundingBox();
  const heroBox = await page.locator('[data-arena-hero-cards="true"]').boundingBox();
  expect(tableBox && boardBox && heroBox).toBeTruthy();
  expect(boardBox!.x).toBeGreaterThanOrEqual(tableBox!.x);
  expect(boardBox!.x + boardBox!.width).toBeLessThanOrEqual(tableBox!.x + tableBox!.width + 1);
  expect(boardBox!.y + boardBox!.height).toBeLessThanOrEqual(heroBox!.y + 1);
  const actionBar = page.locator('[data-arena-action-bar="true"]');
  await expect(actionBar).toBeVisible();
  await expect(actionBar.locator('[data-arena-bet-slider="true"]')).toBeVisible();
  const potBefore = await page.locator('[data-arena-pot="true"]').innerText();
  await activate(actionBar.getByRole('button', { name: /^Bet\b/ }));
  await expect(page.locator('[data-arena-seat-bet="hero"]')).toBeVisible();
  await expect(page.locator('[data-arena-pot-odds="true"]')).toBeVisible();
  await expect.poll(() => page.locator('[data-arena-pot="true"]').innerText()).not.toEqual(potBefore);
  await activate(main.getByRole('link', { name: 'Back To Personal Assistant', exact: true }));

  await activate(main.locator('svg[data-approved-illustration="leaks"]'));
  await expect(page).toHaveURL(/\/hub\/personal-assistant\/leaks$/);
  await expect(main.getByRole('heading', { name: 'Leak Finder', exact: true })).toBeVisible();
  await openLanding(page);

  await activate(main.getByRole('link', { name: /^My Coaching Plan/ }));
  await expect(page).toHaveURL(/\/hub\/personal-assistant\/leaks\?tab=plan$/);
  await expect(page.locator('#leak-coaching')).toBeVisible();
  await page.waitForTimeout(200);
  await openLanding(page);

  await activate(main.getByRole('button', { name: 'Review Settings', exact: true }));
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings).toBeVisible();
  await expect(page).toHaveURL(/\/hub\/personal-assistant\/leaks$/);
  await activate(settings.getByRole('button', { name: 'Close', exact: true }));
  await expect(settings).toHaveCount(0);
  await openLanding(page);

  await activate(main.getByRole('button', { name: /^Log A Hand/ }));
  const logger = page.getByRole('dialog', { name: 'Live Poker Spot Quick Logger', exact: true });
  await expect(logger).toBeVisible();
  await expect(logger.getByRole('form', { name: 'Live Quick Spot', exact: true })).toBeVisible();
  await activate(logger.getByRole('button', { name: 'Close Live Spot Logger', exact: true }));
  await expect(logger).toHaveCount(0);
  await healthyLayout(page);
});

test('landing shows a recoverable data error and restores the account summary', async ({ page }) => {
  let healthy = false;
  let reads = 0;
  await page.route('**/api/assistant/stats', route => {
    reads += 1;
    return route.fulfill({ status: healthy ? 200 : 503, contentType: 'application/json', body: JSON.stringify(healthy
      ? { success: true, isDemo: false, stats: { leaksFound: 2, resolvedLeaks: 5 } }
      : { success: false, error: 'Temporary Interruption' }) });
  });
  await openLanding(page);
  await expect(page.getByText('Live Data Could Not Refresh', { exact: true })).toBeVisible();
  const initialReads = reads;
  healthy = true;
  await activate(page.getByRole('button', { name: 'Retry Now', exact: true }));
  await expect.poll(() => reads).toBeGreaterThan(initialReads);
  const leaks = page.locator('section[aria-labelledby="card-leaks-title"]');
  await expect(leaks.getByText('5 Leaks Fixed', { exact: true })).toBeVisible();
  await expect(leaks.getByText('5 Leaks Fixed', { exact: true })).toHaveAttribute('title', '2 Open');
  await expect(page.getByText('Live Data Could Not Refresh', { exact: true })).toHaveCount(0);
  await healthyLayout(page);
});

test('native multiway runout equity includes the second opponent', async ({ page }) => {
  await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'VIP Membership Active', exact: true })).toBeVisible();
  await loadTemplate(page, 'Multiway Turn');
  await expect(page.getByRole('tablist', { name: 'Active Villain Seat' }).getByRole('tab')).toHaveCount(2);
  const runouts = page.getByRole('region', { name: 'Runouts And Preflop Reference' });
  const average = runouts.getByText('Avg Equity', { exact: true }).locator('..');
  const averageValue = async () => Number((await average.innerText()).match(/[\d.]+/)?.[0] ?? NaN);
  await expect.poll(averageValue, { timeout: 20000 }).toBeLessThan(10);
  await expect(runouts.getByText('Ac', { exact: true })).toBeVisible();
  await expect(runouts.getByText('Ah', { exact: true })).toBeVisible();
  await loadTemplate(page, 'Heads Up Turn');
  await expect(page.getByRole('tablist', { name: 'Active Villain Seat' })).toHaveCount(0);
  await expect.poll(averageValue, { timeout: 20000 }).toBeGreaterThan(85);
  await expect(page.getByText('Ungraded Exploration Workspace', { exact: true })).toBeVisible();
  await healthyLayout(page);
});

test('Hand Replay restores cards, positions, stacks, opponents and wagers after another spot', async ({ page }) => {
  await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'VIP Membership Active', exact: true })).toBeVisible();
  await loadTemplate(page, 'Replay River');
  const metrics = page.getByRole('region', { name: 'Live Scenario Telemetry' });
  const hero = metrics.locator('.metric-tile').filter({ hasText: 'Hero Hand' });
  const pot = metrics.locator('.metric-tile').filter({ hasText: 'Pot & SPR' });
  await expect(hero).toContainText('As Ad');
  await expect(pot).toContainText('16.5 BB');
  await activate(page.getByRole('button', { name: /^Hand Replay \(/ }));
  let replay = page.getByRole('dialog', { name: 'Hand Replay', exact: true });
  await expect(replay).toBeVisible();
  await activate(replay.getByRole('button', { name: 'Close', exact: true }));
  await loadTemplate(page, 'Different Spot');
  await expect(hero).toContainText('Js Ts');
  await expect(pot).toContainText('12.0 BB');
  await activate(page.getByRole('button', { name: /^Hand Replay \(/ }));
  replay = page.getByRole('dialog', { name: 'Hand Replay', exact: true });
  await activate(replay.getByRole('button', { name: 'Hand 1, Not Coached', exact: true }));
  await activate(replay.getByRole('button', { name: 'Load This Hand Into The Sandbox', exact: true }));
  await expect(replay).toHaveCount(0);
  await expect(hero).toContainText('As Ad');
  await expect(pot).toContainText('16.5 BB');
  await expect(pot).toContainText('2 Villains');
  const board = page.getByRole('region', { name: 'Board Builder', exact: true });
  for (const card of ['Kh', '7c', '2d', '9c', '4s']) await expect(board.getByRole('button', { name: `Change ${card}`, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Poker Table · CO', exact: true })).toBeVisible();
  await activate(page.getByRole('button', { name: 'Setup', exact: true }));
  const setup = page.getByRole('dialog', { name: 'Table Setup', exact: true });
  await expect(setup.getByLabel('Hero Stack (BB)', { exact: true })).toHaveValue('85');
  await expect(setup.getByLabel('Starting Pot (BB)', { exact: true })).toHaveValue('6.5');
  await expect(setup.locator('#v-stack-0')).toHaveValue('95');
  await expect(setup.locator('#v-stack-1')).toHaveValue('45');
  await expect(setup.locator('#v-pos-0')).toHaveValue('BB');
  await expect(setup.locator('#v-pos-1')).toHaveValue('SB');
  await activate(setup.getByRole('button', { name: 'Apply To Table', exact: true }));
  const actions = page.getByRole('region', { name: 'Action Builder And Replay', exact: true });
  await expect(actions).toContainText('Bet 5 BB');
  await expect(actions).toContainText('Call 5 BB');
  await healthyLayout(page);
});

test('Log A Hand confirms the save and opens the same Review row after reload using local API fixtures', async ({ page }, testInfo) => {
  const fixture = fixtures.get(page)!;
  const logger = await enterLiveSpot(page);
  await activate(logger.getByRole('button', { name: 'Analyze Live Spot', exact: true }));
  const result = logger.getByRole('region', { name: 'Live Spot Audit Result', exact: true });
  await expect(result.getByRole('status')).toHaveText('1 Hand Saved To Review My Play.');
  expect(fixture.imports.requests).toHaveLength(1);
  const request = fixture.imports.requests[0];
  expect(request).toMatchObject({ evidenceScope: 'self_reported_live', source: 'personal-assistant-live-spot' });
  expect(request.handHistoryText).toContain('Dealt to Hero [Qs Js]');
  expect(request.handHistoryText).toContain('Seat 6: Hero (8500 in chips)');
  expect(request.handHistoryText).toContain('*** RIVER *** [Ts 9h 2c 4d] [6c]');
  expect(request.handHistoryText).toMatch(/Hero: calls \d+/);
  expect(fixture.imports.savedHands.size).toBe(1);
  const [saved] = [...fixture.imports.savedHands.values()];
  expect(saved.hand_data).toMatchObject({
    source: 'manual', evidenceScope: 'self_reported_live', format: 'tournament',
    heroPosition: 'CO', heroCards: ['Qs', 'Js'], communityCards: ['Ts', '9h', '2c', '4d', '6c'],
  });
  const reviewLink = result.getByRole('link', { name: 'Review Saved Hand', exact: true });
  await expect(reviewLink).toHaveAttribute('href', `/hub/personal-assistant/review?hand=${encodeURIComponent(saved.id)}`);
  await activate(reviewLink);
  await expect(page).toHaveURL(new RegExp(`/hub/personal-assistant/review\\?hand=${saved.id}$`));
  const selected = page.getByRole('region', { name: 'Selected Saved Hand', exact: true });
  await expect(selected.getByTestId('review-status-badge')).toHaveText('Saved');
  await expect(selected.locator('[aria-label="Your Hole Cards"]')).toContainText('Q♠');
  await expect(selected.locator('[aria-label="Your Hole Cards"]')).toContainText('J♠');
  const readsBeforeReload = fixture.apiRequests.filter(path => path === '/api/poker/saved-hands').length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(selected.getByTestId('review-status-badge')).toHaveText('Saved');
  await expect.poll(() => fixture.apiRequests.filter(path => path === '/api/poker/saved-hands').length).toBeGreaterThan(readsBeforeReload);
  await expect(page.getByRole('complementary', { name: 'Saved Hands List', exact: true }).locator('button[aria-current="true"]')).toHaveCount(1);
  await expect(selected.locator('[aria-label="Your Hole Cards"]')).toContainText('Q♠');
  await expect(selected.locator('[aria-label="Your Hole Cards"]')).toContainText('J♠');
  await activate(selected.getByRole('tab', { name: 'River', exact: true }));
  const river = selected.getByRole('tabpanel', { name: 'River', exact: true });
  for (const card of ['10♠', '9♥', '2♣', '4♦', '6♣']) await expect(river.locator('[aria-label="River Community Cards"]').getByText(card, { exact: true })).toBeVisible();
  await expect(river.getByRole('listitem').filter({ hasText: 'Hero (Hero)' })).toContainText('Call');
  expect(fixture.imports.requests, 'Reload Only Reads The Saved Queue').toHaveLength(1);
  await healthyLayout(page);
  await page.screenshot({ path: testInfo.outputPath('logged-hand-reloaded-review.png') });
});

test('Log A Hand never reports success or a Review link when the local save cannot be confirmed', async ({ page }) => {
  const fixture = fixtures.get(page)!;
  fixture.imports.failSave = true;
  const logger = await enterLiveSpot(page);
  await activate(logger.getByRole('button', { name: 'Analyze Live Spot', exact: true }));
  await expect(logger.getByRole('alert')).toContainText('Saving To Review My Play Could Not Be Confirmed');
  await expect(logger.getByRole('region', { name: 'Live Spot Audit Result', exact: true })).toHaveCount(0);
  await expect(logger.getByRole('link', { name: /Review .*Saved Hand/ })).toHaveCount(0);
  await expect(logger.getByText('1 Hand Saved To Review My Play.', { exact: true })).toHaveCount(0);
  expect(fixture.imports.requests).toHaveLength(1);
  expect(fixture.imports.savedHands.size).toBe(0);
  await activate(logger.getByRole('button', { name: 'Close Live Spot Logger', exact: true }));
  await activate(page.locator('main').getByRole('link', { name: 'Start Review', exact: true }));
  await expect(page.locator('main').getByRole('heading', { name: 'No Saved Hands Yet', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Selected Saved Hand', exact: true })).toHaveCount(0);
  await healthyLayout(page);
});
