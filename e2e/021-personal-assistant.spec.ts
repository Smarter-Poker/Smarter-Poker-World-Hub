import { test, expect, Page } from '@playwright/test';

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
      attributes.some(name => element.getAttribute(name)?.includes(mark))
    ).length;
    const sentenceCaseAttributes = [...document.querySelectorAll('*')].filter(element =>
      attributes.some(name => /(^|[\s·/|:;,.!?()[\]{}"+\-–])([a-z])/.test(element.getAttribute(name) || ''))
    ).length;
    const transformViolations = [...document.querySelectorAll('main *')].filter(element => {
      const directText = [...element.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .some(node => node.textContent?.trim());
      return directText && window.getComputedStyle(element).textTransform !== 'capitalize';
    }).length;
    return {
      bodyTransform: window.getComputedStyle(document.body).textTransform,
      titleViolations: document.title.includes(mark) ? 1 : 0,
      textViolations: (document.body.innerText.match(new RegExp(mark, 'g')) || []).length,
      attributeViolations,
      sentenceCaseAttributes,
      transformViolations,
    };
  });
  expect(audit).toEqual({ bodyTransform: 'capitalize', titleViolations: 0, textViolations: 0, attributeViolations: 0, sentenceCaseAttributes: 0, transformViolations: 0 });
}

test.describe('Personal Assistant primary and secondary surfaces', () => {
  test.beforeEach(async ({ page }) => {
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
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main')).toBeVisible();
      await expectAccessibleMain(page);
      await expectPersonalAssistantCopyPolicy(page);
      await expectHealthyLayout(page);
    }
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
          heroCards: ['Ts', '9s'],
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
    await expect(dailySection.getByRole('button', { name: /Load In Sandbox/i })).toBeVisible();
    await expectHealthyLayout(page);
  });

  test('strategy hub exposes recovery and restores the Daily Hand after a feed interruption', async ({ page }) => {
    let feedHealthy = false;
    await page.route('**/api/training/hand-of-the-day', route => {
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
    feedHealthy = true;
    await page.getByRole('button', { name: 'Retry Daily Hand' }).click();
    const dailySection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Hand Of The Day' }) });
    await expect(dailySection.getByRole('heading', { name: 'Recovered Solver Decision' })).toBeVisible();
    await expect(dailySection.getByText('CO · Pot 8 BB')).toBeVisible();
    await expectHealthyLayout(page);
  });

  test('Sandbox setup sheet opens, traps context, and closes with Escape', async ({ page }) => {
    const response = await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'Virtual Sandbox', exact: true })).toBeAttached();
    await expect(page.locator('#sandbox-table')).toBeVisible();
    await page.getByRole('button', { name: 'Open setup' }).click();
    await expect(page.getByRole('dialog', { name: /Setup/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /Setup/i })).toHaveCount(0);
    await expectHealthyLayout(page);
  });

  test('Sandbox card picker and history subflows remain wired', async ({ page }, testInfo) => {
    await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Load a saved hand' }).click();
    await expect(page.getByRole('dialog', { name: /History/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sessions' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Bookmarks' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Pick my cards' }).click();
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

  test('Leak Finder switches between leaks and every analytics sub-surface', async ({ page }) => {
    await page.route('**/api/assistant/leaks/detect', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, persisted: true, handsAnalyzed: 0, leaksDetected: 0, leaks: [], message: 'No new leaks found.' }),
    }));
    const response = await page.goto('/hub/personal-assistant/leaks', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'Leak Finder' })).toBeVisible();
    await page.getByRole('button', { name: 'Insights' }).click();
    await expect(page.locator('#leak-insights')).toBeVisible();
    await expect(page.getByText('Worst Coach-Mode Spots')).toBeVisible();
    await expect(page.getByText('Weekly Leaderboard')).toBeVisible();
    await expect(page.getByText('Macro Leak Detector')).toBeVisible();
    await expect(page.getByText('Position Leak Map')).toBeVisible();
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
    await expect(details).toBeVisible();
    await expect(details.getByRole('heading', { name: 'How To Fix It' })).toBeVisible();
    await expect(details.getByRole('heading', { name: 'Recent Example Hands' })).toBeVisible();
    await expect(details.getByRole('heading', { name: 'Suggested Fixes' })).toBeVisible();
    await expect(details.getByRole('heading', { name: 'Corrective Review' })).toBeVisible();
    await expect(details.getByText('Exact Training Game')).toBeVisible();
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

    await expect(page.getByText('Club Hands Scanned')).toBeVisible();
    await expect(page.getByText('400', { exact: true }).first()).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => polls, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    await expect(page.getByText('Club Hands Scanned')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('550', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Reconciliation Passed/i)).toBeVisible();
    await expectHealthyLayout(page);
  });
});
