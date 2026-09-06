import { test, expect, Locator, Page } from '@playwright/test';

async function activateControl(control: Locator, projectName: string) {
  await control.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'auto' }));
  if (projectName.includes('mobile')) await control.tap();
  else await control.click();
}

async function navigateStable(page: Page, route: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.goto(route, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      lastError = error;
      if (!String((error as Error)?.message || error).match(/interrupted|another navigation/i)) throw error;
      await page.waitForTimeout(150);
    }
  }
  throw lastError;
}

async function expectHealthyLayout(page: Page) {
  await expect(page.getByText('Application Error', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Unhandled Runtime Error', { exact: true })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectAccessibleMain(page: Page) {
  const audit = await page.locator('main').evaluate((main) => {
    const visible = (element: Element) => {
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    const controls = [...main.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="switch"],[role="tab"]')]
      .filter(visible);
    const unnamed = controls.filter((element) => !(
      element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.textContent
      || element.getAttribute('value')
    )?.trim()).length;
    const undersized = controls.filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width < 44 || box.height < 44;
    }).length;
    const imagesWithoutAlt = [...main.querySelectorAll('img')]
      .filter(visible)
      .filter((image) => !image.hasAttribute('alt')).length;
    const ids = [...main.querySelectorAll('[id]')].map((element) => element.id);
    const duplicateIds = new Set(ids.filter((id, index) => ids.indexOf(id) !== index)).size;
    return { unnamed, undersized, imagesWithoutAlt, duplicateIds };
  });
  expect(audit).toEqual({ unnamed: 0, undersized: 0, imagesWithoutAlt: 0, duplicateIds: 0 });
}

async function expectPersonalAssistantCopyPolicy(page: Page) {
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('pa-copy-policy'))).toBe(true);
  const audit = await page.evaluate(() => {
    const mark = String.fromCharCode(0x2014);
    const attributes = ['alt', 'aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'placeholder', 'title', 'data-tooltip'];
    const attributeViolations = [...document.querySelectorAll('*')].filter(element =>
      !element.closest('pre,code,[data-pa-verbatim]') &&
      attributes.some(name => element.getAttribute(name)?.includes(mark))
    ).length;
    const sentenceCaseAttributes = [...document.querySelectorAll('*')].filter(element =>
      !element.closest('pre,code,[data-pa-verbatim]') &&
      attributes.some(name => /(^|[\s·/|:;,.!?()[\]{}"+\-–])([a-z])/.test(element.getAttribute(name) || ''))
    ).length;
    const sentenceCaseText = [...document.querySelectorAll('body *')]
      .filter(element => !['SCRIPT', 'STYLE', 'TEXTAREA', 'TEMPLATE'].includes(element.tagName))
      .filter(element => !element.closest('pre,code,[data-pa-verbatim]'))
      .reduce((count, element) => (
        count + [...element.childNodes]
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .filter(node => /(^|[\s·/|:;,.!?()[\]{}"+\-–])([a-z])/.test(node.textContent || '')).length
      ), 0);
    const transformViolations = [...document.querySelectorAll('main *')].filter(element => {
      if (element.closest('pre,code,[data-pa-verbatim]')) return false;
      const directText = [...element.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .some(node => node.textContent?.trim());
      return directText && window.getComputedStyle(element).textTransform !== 'capitalize';
    }).length;
    return {
      bodyTransform: window.getComputedStyle(document.body).textTransform,
      titleViolations: document.title.includes(mark) ? 1 : 0,
      textViolations: [...document.querySelectorAll('body *')]
        .filter(element => !['SCRIPT', 'STYLE', 'TEXTAREA', 'TEMPLATE'].includes(element.tagName))
        .filter(element => !element.closest('pre,code,[data-pa-verbatim]'))
        .reduce((count, element) => (
          count + [...element.childNodes]
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .reduce((nodeCount, node) => nodeCount + ((node.textContent || '').match(new RegExp(mark, 'g')) || []).length, 0)
        ), 0),
      attributeViolations,
      sentenceCaseAttributes,
      sentenceCaseText,
      transformViolations,
    };
  });
  expect(audit).toEqual({ bodyTransform: 'capitalize', titleViolations: 0, textViolations: 0, attributeViolations: 0, sentenceCaseAttributes: 0, sentenceCaseText: 0, transformViolations: 0 });
}

test.describe('Personal Assistant primary and secondary surfaces', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Headless WebKit can deadlock when it boots the production push worker,
    // while Playwright's serviceWorkers:block shim can return an undefined
    // registration to Next's PWA bootstrap. Model the browser-supported,
    // no-active-worker state instead so Safari behavior stays deterministic
    // without weakening any page-owned checks.
    if (testInfo.project.name.startsWith('pa-')) {
      await page.addInitScript(() => {
        const worker = navigator.serviceWorker;
        if (!worker) return;
        const registration = {
          active: null,
          waiting: null,
          installing: null,
          scope: `${window.location.origin}/`,
          update: async () => undefined,
          unregister: async () => true,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        };
        worker.register = async () => registration as unknown as ServiceWorkerRegistration;
        worker.getRegistration = async () => registration as unknown as ServiceWorkerRegistration;
        worker.getRegistrations = async () => [registration as unknown as ServiceWorkerRegistration];
      });
    }
    // This suite validates PA controls, not the unrelated one-time push opt-in.
    // Spend that prompt for the authenticated fixture before React schedules
    // its 20-second modal, otherwise longer interaction cases are randomly
    // covered halfway through a click.
    await page.addInitScript(() => {
      try {
        const auth = JSON.parse(window.localStorage.getItem('smarter-poker-auth') || '{}');
        const userId = auth?.user?.id;
        if (userId) window.localStorage.setItem(`sp_firstrun_notif_v2_${userId}`, String(Date.now()));
      } catch { /* a malformed fixture should fail auth setup, not this guard */ }
    });
  });

  test('strategy hub exposes both systems without layout regression', async ({ page }) => {
    const response = await page.goto('/hub/personal-assistant', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: /Meet Jarvis/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Virtual Sandbox', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Leak Finder', exact: true })).toBeVisible();
    await expectHealthyLayout(page);
  });

  test('every Personal Assistant workspace meets its page-owned accessibility floor', async ({ page }) => {
    for (const route of [
      '/hub/personal-assistant',
      '/hub/personal-assistant/sandbox',
      '/hub/personal-assistant/leaks',
      '/sandbox/zzzz',
    ]) {
      await navigateStable(page, route);
      await expect(page.locator('main')).toBeVisible();
      await expectAccessibleMain(page);
      await expectPersonalAssistantCopyPolicy(page);
      await expectHealthyLayout(page);
    }
  });

  test('copy policy preserves verbatim URL and JSON content added after hydration', async ({ page }) => {
    await page.goto('/hub/personal-assistant', { waitUntil: 'domcontentloaded' });
    const technicalCopy = await page.evaluate(async () => {
      const url = document.createElement('span');
      url.dataset.paVerbatim = 'true';
      url.textContent = 'https://smarter.poker/sandbox/aBc123?heroPosition=smallBlind';
      const json = document.createElement('code');
      json.textContent = '{"heroPosition":"small blind","shareId":"aBc123"}';
      document.body.append(url, json);
      await new Promise(resolve => window.setTimeout(resolve, 0));
      const result = {
        url: url.textContent,
        json: json.textContent,
        urlTransform: window.getComputedStyle(url).textTransform,
        jsonTransform: window.getComputedStyle(json).textTransform,
      };
      url.remove();
      json.remove();
      return result;
    });
    expect(technicalCopy).toEqual({
      url: 'https://smarter.poker/sandbox/aBc123?heroPosition=smallBlind',
      json: '{"heroPosition":"small blind","shareId":"aBc123"}',
      urlTransform: 'none',
      jsonTransform: 'none',
    });
  });

  test('expired one-time shared hand-off reports the problem and cleans its URL', async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.removeItem('shared-sandbox-state'));
    await page.goto('/hub/personal-assistant/sandbox?loadShared=true', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('That Shared Scenario Has Expired · Open The Original Link Again')).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has('loadShared')).toBe(false);
  });

  test('strategy hub keeps its primary command fully inside the mobile hero bay', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('mobile'), 'mobile project only');
    await page.goto('/hub/personal-assistant', { waitUntil: 'domcontentloaded' });
    const command = page.getByRole('button', { name: 'Start New Scenario' });
    const hero = page.locator('section').filter({ has: command }).first();
    await expect(command).toBeVisible();
    const [commandBox, heroBox] = await Promise.all([command.boundingBox(), hero.boundingBox()]);
    expect(commandBox).not.toBeNull();
    expect(heroBox).not.toBeNull();
    expect(commandBox!.y + commandBox!.height).toBeLessThanOrEqual(heroBox!.y + heroBox!.height - 8);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(commandBox!.y + commandBox!.height).toBeLessThanOrEqual(viewportHeight - 72);
    await expectHealthyLayout(page);
  });

  test('strategy hub renders the live question-shaped Hand Of The Day payload', async ({ page }) => {
    await page.route('**/api/training/hand-of-the-day', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        dailyId: 'daily-test',
        question: {
          id: 'solver-question-test',
          hero_hand: 'T9s',
          // Deliberately stale: the canonical scenario must win.
          heroCards: ['Ah', 'Kd'],
          hero_position: 'BTN',
          board_cards: ['Qc', '5h', '3s'],
          scenario_text: 'You Hold T9s On The Flop. What Is The GTO Play?',
          scenario: { heroHand: 'T9s', heroPosition: 'BTN', pot: 6 },
        },
      }),
    }));
    await page.goto('/hub/personal-assistant', { waitUntil: 'domcontentloaded' });
    const dailySection = page.locator('section[aria-labelledby="daily-title"]');
    await expect(dailySection.getByRole('heading', { name: 'Hand Of The Day' })).toBeVisible();
    await expect(dailySection.getByText('You Hold T9s On The Flop. What Is The GTO Play?')).toBeVisible();
    await expect(dailySection.getByText('BTN · Pot 6 BB')).toBeVisible();
    await expect(dailySection.getByLabel('Hero Hand Ts9s')).toBeVisible();
    await expect(dailySection.getByRole('button', { name: /Load In Sandbox/i })).toBeVisible();
    await expectHealthyLayout(page);
  });

  test('strategy hub exposes recovery and restores the Daily Hand after a feed interruption', async ({ page }, testInfo) => {
    let feedHealthy = false;
    let requestCount = 0;
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/api/training/hand-of-the-day', route => {
      requestCount += 1;
      if (!feedHealthy) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary interruption' }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          question: {
            id: 'recovered-daily-hand',
            heroCards: ['Ah', 'Kd'],
            hero_position: 'CO',
            board_cards: ['Qs', '7c', '2d'],
            scenario_text: 'Recovered Solver Decision',
            scenario: { pot: 8 },
          },
        }),
      });
    });

    await page.goto('/hub/personal-assistant', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Daily Hand Temporarily Unavailable', { exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
    const failedRequestCount = requestCount;
    feedHealthy = true;
    const retryButton = page.getByRole('button', { name: 'Retry Daily Hand' });
    // Playwright WebKit's scrollIntoViewIfNeeded can report an offscreen
    // element as visible on this long dashboard. Use the platform scroll API,
    // then perform a real pointer click against the centered control.
    await activateControl(retryButton, testInfo.project.name);
    await expect.poll(() => requestCount).toBeGreaterThan(failedRequestCount);
    const dailySection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Hand Of The Day' }) });
    await expect(dailySection.getByRole('heading', { name: 'Recovered Solver Decision' })).toBeVisible();
    await expect(dailySection.getByText('CO · Pot 8 BB')).toBeVisible();
    await expectHealthyLayout(page);
  });

  test('Sandbox setup sheet opens, traps context, and closes with Escape', async ({ page }, testInfo) => {
    const response = await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'Virtual Sandbox', exact: true })).toBeAttached();
    await expect(page.locator('#sandbox-table')).toBeVisible();
    await activateControl(page.getByRole('button', { name: 'Open setup' }), testInfo.project.name);
    const dialog = page.getByRole('dialog', { name: /Setup/i });
    await expect(dialog).toBeVisible();
    const focusable = dialog.locator('a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])');
    const first = focusable.first();
    const last = focusable.last();
    // BottomSheet schedules initial focus after mount. Wait for that contract
    // before exercising wraparound so its 60ms focus timer cannot race the
    // Shift+Tab assertion and move focus back to the first control.
    await expect(first).toBeFocused({ timeout: 5_000 });
    await first.press('Shift+Tab');
    await expect(last).toBeFocused();
    await last.press('Tab');
    await expect(first).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expectHealthyLayout(page);
  });

  test('Sandbox card picker and history subflows remain wired', async ({ page }, testInfo) => {
    await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });

    await activateControl(page.getByRole('button', { name: 'Load a saved hand' }), testInfo.project.name);
    await expect(page.getByRole('dialog', { name: /History/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sessions' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Bookmarks' })).toBeVisible();
    await page.keyboard.press('Escape');

    await activateControl(page.getByRole('button', { name: 'Pick my cards' }), testInfo.project.name);
    await expect(page.getByRole('dialog', { name: /Pick card 1 of 2/i })).toBeVisible();
    if (testInfo.project.name.includes('mobile')) {
      await page.getByRole('button', { name: /Rank A,/i }).click();
      await expect(page.getByText('Choose a suit for A')).toBeVisible();
    }
    await page.getByRole('button', { name: 'A of spades' }).click();
    await expect(page.getByRole('dialog', { name: /Pick card 2 of 2/i })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog', { name: /Pick card/i })).toHaveCount(0);
    await expectHealthyLayout(page);
  });

  test('Sandbox templates and study analytics subpages open from their real controls', async ({ page }) => {
    await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Open setup' }).click();
    await page.getByRole('button', { name: 'Templates', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /My templates/i })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Load a saved hand' }).click();
    await page.getByRole('button', { name: /Study analytics/i }).click();
    await expect(page.getByRole('dialog', { name: /Study analytics/i })).toBeVisible();
    await expectHealthyLayout(page);
  });

  test('Sandbox imports a native solver node without inventing missing state', async ({ page }, testInfo) => {
    await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });
    await activateControl(page.getByRole('button', { name: /Open .* Command Menu|Open Menu/i }), testInfo.project.name);
    const commandMenu = page.getByRole('dialog', { name: /Command Menu/i });
    await expect(commandMenu).toBeVisible();
    await commandMenu.getByLabel('Search Menu').fill('Pro Import');
    await activateControl(commandMenu.getByRole('button', { name: 'Pro Import' }), testInfo.project.name);
    const importer = page.getByRole('dialog', { name: 'Import Native Solver Scenario' });
    await expect(importer).toBeVisible();
    await importer.getByLabel('Solver Export Text').fill(`PioSOLVER
Board: Kh Jd 3c
Pot: 75
Effective Stack: 120
Hero Position: CO
Villain Position: BB
Villain Range: AA,KK,QQ,AKs`);
    await activateControl(importer.getByRole('button', { name: 'Check Scenario' }), testInfo.project.name);
    await expect(importer.getByText('PioSolver Import Verified.')).toBeVisible();
    await expect(importer.getByText('CO', { exact: true })).toBeVisible();
    await expect(importer.getByText('BB', { exact: true })).toBeVisible();
    await activateControl(importer.getByRole('button', { name: 'Load Scenario' }), testInfo.project.name);
    await expect(importer).toHaveCount(0);
    await expectHealthyLayout(page);
  });

  test('Sandbox mobile controls remain one-handed and overflow-free', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('mobile'), 'mobile project only');
    await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#run-analysis')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open setup' })).toBeVisible();
    await expect(page.locator('#sandbox-table')).toBeVisible();
    await page.getByRole('button', { name: 'Deal a random flop' }).click();
    const removers = page.getByRole('button', { name: /^Remove / });
    await expect(removers).toHaveCount(3);
    for (const button of await removers.all()) {
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await expectHealthyLayout(page);
  });

  test('Sandbox preflop grid has one tab stop, arrow navigation, and mobile-sized cells', async ({ page }, testInfo) => {
    await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });
    const toggle = page.getByRole('button', { name: /Range Chart/i });
    await activateControl(toggle, testInfo.project.name);
    const grid = page.getByRole('grid', { name: /Preflop Range/i });
    await expect(grid).toBeVisible();
    const cells = grid.getByRole('gridcell');
    await expect(cells).toHaveCount(169);
    expect(await cells.evaluateAll(nodes => nodes.filter(node => node.getAttribute('tabindex') === '0').length)).toBe(1);
    await cells.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(cells.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(cells.nth(14)).toBeFocused();
    if (testInfo.project.name.includes('mobile')) {
      const box = await cells.nth(14).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('Leak Finder switches between leaks and every analytics sub-surface', async ({ page }, testInfo) => {
    await page.route('**/api/assistant/leaks/detect', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, persisted: true, handsAnalyzed: 0, leaksDetected: 0, leaks: [], message: 'No new leaks found.' }),
    }));
    const response = await page.goto('/hub/personal-assistant/leaks', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'Leak Finder' })).toBeVisible();
    const insightsButton = page.getByRole('button', { name: 'Insights' });
    await activateControl(insightsButton, testInfo.project.name);
    await expect(page.locator('#leak-insights')).toBeVisible();
    await expect(page.getByText('Worst Coach-Mode Spots')).toBeVisible();
    await expect(page.getByText('Weekly Leaderboard')).toBeVisible();
    await expect(page.getByText('Macro Leak Detector')).toBeVisible();
    await expect(page.getByText('Position Leak Map')).toBeVisible();
    await expectHealthyLayout(page);
  });

  test('Leak Finder coaching workspace exposes evidence, goals, timeline, reporting, and data controls', async ({ page }, testInfo) => {
    const leakId = '11111111-1111-4111-8111-111111111111';
    const coachingWrites: Array<{ action?: string; preferences?: { analysisDepth?: string } }> = [];
    await page.route(/\/api\/assistant\/leaks(?:\?.*)?$/, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, leaks: [{
        id: leakId,
        leak_type: 'river_overfold',
        leak_name: 'River Overfold',
        situation_class: 'River Overfold',
        status: 'persistent',
        confidence: 'high',
        avg_ev_loss_bb: 0.7,
        ev_loss_measured: true,
        occurrence_count: 12,
        total_samples: 40,
      }] }),
    }));
    await page.route('**/api/assistant/leaks/examples?*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, examples: [{ id: 'example-1', handId: 'hand-1', evLoss: 0.7, snapshot: { external_id: 'club-hand-1', hero_cards: ['As', 'Kh'], board: ['Qc', '7h', '2s', 'Td', '4c'], street: 'river', pot_size: 18 } }] }),
    }));
    await page.route('**/api/assistant/coaching', async route => {
      if (route.request().method() === 'POST') {
        coachingWrites.push(route.request().postDataJSON());
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, result: {} }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          snapshot: {
            receipt: 'pa7-test-receipt',
            versions: { matcher: 'hand-audit-v3' },
            summary: { active: 1, resolved: 0, due: 1, measuredEvLoss: 8.4 },
            coverage: { decisions: 1, verified: 1, partiallyMatched: 0, unpriced: 0, rejected: 0, verifiedPercent: 100 },
            priorities: [{ id: leakId, title: 'River Overfold', category: 'River', status: 'persistent', reason: '12 Repeated Mistakes With 0.70 BB Measured Loss Per Occurrence', confidence: { score: 96, level: 'high', reasons: ['Measured EV Evidence Is Available'] } }],
            nextBestAction: { leakId, title: 'River Overfold', action: 'Complete The Due Corrective Review', reason: 'Highest Measured Impact' },
            timeline: [{ at: '2026-09-06T00:00:00.000Z', leakId, type: 'detected', title: 'River Overfold Detected' }],
            sessionDebrief: { headline: 'One Active Leak Needs Attention', strongestSignal: 'River Overfold', expensiveMistake: 'River Overfold', coverageNote: 'One Of One Decisions Is Solver Verified' },
            weeklyReport: { verifiedCoverage: 100, reviewLoad: 1, measuredEvLoss: 8.4, focus: [{ id: leakId, rank: 1, title: 'River Overfold', targetReviews: 3 }] },
          },
          decisions: [{ hand_external_id: 'club-hand-1', decision_key: 'decision-1', leak_type: 'river_overfold', solver_verified: true, solver_source: 'hand-audit-v3', classification: 'mistake' }],
          reviews: [{ leak_id: leakId, due_at: '2026-09-06T00:00:00.000Z' }],
          goals: [],
          feedback: [],
          preferences: { saved_view: 'coach', analysis_depth: 'guided', panel_layout: {} },
        }),
      });
    });
    await page.route('**/api/assistant/data-controls**', async route => {
      if (route.request().method() === 'POST') {
        const request = route.request().postDataJSON();
        if (request?.action === 'request_deletion') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, scope: request.scope, challenge: 'signed-test-challenge', confirmation: 'DELETE MY PERSONAL ASSISTANT DATA', expiresInSeconds: 600 }),
          });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, preference: { retention_days: 90 } }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          counts: { leaks: 1, decisions: 4, reviews: 2, goals: 0, sandboxSessions: 3, savedHands: 1, coachResults: 5, bookmarks: 1, equityHistory: 2, templates: 1, sharedScenarios: 1, solutionBookmarks: 1 },
          retentionDays: null,
          lastRetentionRunAt: null,
          receipts: [],
          sourceHandsIncludedInDeletion: false,
        }),
      });
    });

    await navigateStable(page, '/hub/personal-assistant/leaks');
    await activateControl(page.getByRole('button', { name: 'Coaching' }), testInfo.project.name);
    await expect(page.getByRole('heading', { name: 'Your Evidence-Backed Improvement Plan' })).toBeVisible();
    await expect(page.getByText('pa7-test-receipt')).toBeVisible();
    await page.getByLabel('Analysis Depth').selectOption('expert');
    await expect.poll(() => coachingWrites.some(write => write?.action === 'save_preferences' && write?.preferences?.analysisDepth === 'expert')).toBe(true);
    await activateControl(page.getByRole('button', { name: 'Evidence', exact: true }), testInfo.project.name);
    await expect(page.getByText('Source-To-Training Trace')).toBeVisible();
    await expect(page.getByLabel('Expert Analysis Provenance')).toBeVisible();
    await expect(page.getByText('Evidence Fingerprint')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Exact Sandbox Spot' })).toBeVisible();
    await activateControl(page.getByRole('button', { name: 'Timeline', exact: true }), testInfo.project.name);
    await expect(page.getByText('From Detection To Real-Play Confirmation')).toBeVisible();
    await activateControl(page.getByRole('button', { name: 'Goals', exact: true }), testInfo.project.name);
    await expect(page.getByText('Tie Progress To Measured Evidence')).toBeVisible();
    await activateControl(page.getByRole('button', { name: 'Report', exact: true }), testInfo.project.name);
    await expect(page.getByText('Your Next Seven Days')).toBeVisible();
    await activateControl(page.getByRole('button', { name: 'Data', exact: true }), testInfo.project.name);
    await expect(page.getByText('Data And Privacy')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download Verified Export' })).toBeVisible();
    await expect(page.getByText('Coach Decisions')).toBeVisible();
    await activateControl(page.getByRole('button', { name: 'Review Permanent Deletion' }), testInfo.project.name);
    const confirmation = page.getByLabel('Exact Confirmation');
    await expect(confirmation).toBeVisible();
    await expect(page.getByRole('button', { name: 'Permanently Remove Selected Records' })).toBeDisabled();
    await confirmation.fill('DELETE MY PERSONAL ASSISTANT DATA');
    await expect(page.getByRole('button', { name: 'Permanently Remove Selected Records' })).toBeEnabled();
    await activateControl(page.getByRole('button', { name: 'Cancel', exact: true }), testInfo.project.name);
    const coachingControlSizes = await page.locator('#leak-coaching').evaluate(root => [...root.querySelectorAll('button,a[href],input,select,textarea')].filter(element => {
      const box = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44);
    }).map(element => ({ text: element.textContent?.trim(), tag: element.tagName, box: element.getBoundingClientRect().toJSON() })));
    expect(coachingControlSizes).toEqual([]);
    await expectAccessibleMain(page);
    await expectHealthyLayout(page);
  });

  test('Leak Finder detail sheet exposes every remediation subflow and closes cleanly', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('pa-auto-detect-last', String(Date.now()));
      window.localStorage.removeItem('pa-auto-guidance');
    });
    await page.route(/\/api\/assistant\/leaks(?:\?.*)?$/, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        leaks: [{
          id: 'e2e-leak-detail',
          leak_type: 'solver_club_arena_preflop_open',
          leak_name: 'Button Open Frequency',
          situation_class: 'Button Open Frequency',
          status: 'persistent',
          confidence: 'high',
          optimal_frequency: 58,
          current_frequency: 41,
          avg_ev_loss_bb: 0.31,
          ev_loss_measured: true,
          occurrence_count: 18,
          source_system: 'solver_engine',
          leak_category: 'preflop',
          recommended_drill: 'cash-002',
          suggested_fix: 'Open the solver-approved button range and compare every boundary hand.',
          why_leaking_ev: 'Folding profitable opens gives up uncontested blinds and positional equity.',
          trend_data: [{ date: '2026-08-29', value: 38 }, { date: '2026-08-30', value: 41 }],
          first_detected_at: '2026-08-29T12:00:00.000Z',
        }],
        demoLeaks: [],
      }),
    }));

    await page.goto('/hub/personal-assistant/leaks', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Button Open Frequency\..*Open details/i }).click();
    const details = page.getByRole('dialog', { name: 'Leak details: Button Open Frequency' });
    await expect(details).toBeVisible({ timeout: 15_000 });
    await expect(details.getByRole('heading', { name: 'How To Fix It' })).toBeVisible();
    await expect(details.getByRole('heading', { name: 'Recent Example Hands' })).toBeVisible();
    await expect(details.getByRole('heading', { name: 'Suggested Fixes' })).toBeVisible();
    await expect(details.getByRole('heading', { name: 'Corrective Review' })).toBeVisible();
    await expect(details.getByText('Exact Training Game', { exact: true })).toBeVisible();
    await expect(details.getByRole('button', { name: 'Start Corrective Review' })).toBeVisible();
    await expect(details.getByRole('button', { name: 'Practice Leak in Sandbox' })).toBeVisible();
    const exactTraining = details.getByRole('button', { name: 'Open Exact Training Game' });
    await expect(exactTraining).toBeVisible();
    const guidance = details.getByRole('switch');
    await expect(guidance).toHaveAttribute('aria-checked', 'false');
    await guidance.click();
    await expect(guidance).toHaveAttribute('aria-checked', 'true');
    await Promise.all([
      page.waitForURL(/\/hub\/training\?.*autoLaunch=cash-002/, { timeout: 15_000 }),
      exactTraining.click(),
    ]);
    await expect(page.getByRole('dialog', { name: 'C-Bet Academy' })).toBeVisible();
    await expectHealthyLayout(page);
  });

  test('Leak Finder labels an unsigned corrective run as practice-only', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('pa-auto-detect-last', String(Date.now()));
    });
    await page.route(/\/api\/assistant\/leaks(?:\?.*)?$/, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        leaks: [{
          id: 'e2e-practice-leak',
          leak_type: 'solver_training_cash_001_flop_btn_general',
          leak_name: 'Button Flop Decisions',
          situation_class: 'BTN Flop General Decisions',
          status: 'emerging',
          confidence: 'high',
          source_system: 'solver_engine',
          leak_category: 'flop',
          recommended_drill: 'cash-001',
          occurrence_count: 8,
        }],
        demoLeaks: [],
      }),
    }));
    await page.route('**/api/sandbox/custom-drill**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        serverVerified: false,
        practiceOnly: true,
        verificationReason: 'solver_provenance_pending',
        evidenceDisclosure: 'Practice Mode Uses Relevant Archived Strategy Data. Rewards Stay Locked Until Solver Provenance Is Sealed.',
        drillToken: null,
        pool: [{
          id: 'practice-spot-1',
          scenario_text: 'Which Action Has The Highest Recorded Frequency?',
          hero_hand: 'As Ks',
          hero_position: 'BTN',
          street: 'flop',
          options: ['Check', 'Bet 33%'],
          correct_answer: 'Check',
          gto_explanation: 'This Is Archived Strategy Data.',
        }],
      }),
    }));

    await page.goto('/hub/personal-assistant/leaks', { waitUntil: 'domcontentloaded' });
    await activateControl(
      page.getByRole('button', { name: /^BTN Flop General Decisions\..*Open details/i }),
      testInfo.project.name,
    );
    const correctiveReview = page.getByRole('dialog', { name: 'Leak details: BTN Flop General Decisions' })
      .getByRole('button', { name: 'Start Corrective Review' });
    await activateControl(correctiveReview, testInfo.project.name);
    const drill = page.getByRole('dialog', { name: 'Quick Spot Drill' });
    await expect(drill).toBeVisible({ timeout: 15_000 });
    await expect(drill.getByRole('note')).toContainText('Rewards Stay Locked Until Solver Provenance Is Sealed.');
    await expectHealthyLayout(page);
  });

  test('one Leak Finder action persists server checkpoints and restores after reload', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('pa-auto-detect-last', String(Date.now()));
    });

    let started = false;
    let initialReads = 0;
    let polls = 0;
    const job = (status: 'queued' | 'running' | 'completed', handsScanned: number) => ({
      id: 'durable-e2e-job',
      status,
      stage: status === 'completed' ? 'completed' : 'importing_hands',
      progress: {
        handsScanned,
        handsEligible: Math.round(handsScanned * 0.4),
        handsAudited: Math.round(handsScanned * 0.02),
        decisionsAnalyzed: Math.round(handsScanned * 0.05),
        batchesCompleted: Math.ceil(handsScanned / 200),
        complete: status === 'completed',
      },
      reconciliation: status === 'completed' ? { consistent: true, checkedAt: '2026-08-31T12:00:00.000Z', persistedDecisions: 30 } : null,
      result: status === 'completed' ? { success: true, persisted: true, handsAnalyzed: 550, leaksDetected: 2, leaks: [] } : null,
    });
    await page.route(/\/api\/assistant\/leaks\/audit-jobs(?:\?.*)?$/, async route => {
      if (route.request().method() === 'POST') {
        started = true;
        return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ success: true, accepted: true, job: job('running', 400) }) });
      }
      if (!started) {
        initialReads += 1;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, job: null }) });
      }
      polls += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, job: job('completed', 550) }) });
    });

    await page.goto('/hub/personal-assistant/leaks', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => initialReads, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    await page.getByRole('button', { name: /Run Leak Detection|Resume Saved Audit/i }).click();

    await expect(page.getByText('Club Hands Scanned')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('400', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await navigateStable(page, '/hub/personal-assistant/leaks');
    await expect.poll(() => polls, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    await expect(page.getByText('Club Hands Scanned')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('550', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Reconciliation Passed/i)).toBeVisible();
    await expectHealthyLayout(page);
  });
});
