import { test, expect, Page } from '@playwright/test';

async function expectHealthyLayout(page: Page) {
  await expect(page.getByText('Application Error', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Unhandled Runtime Error', { exact: true })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('Personal Assistant primary and secondary surfaces', () => {
  test('strategy hub exposes both systems without layout regression', async ({ page }) => {
    const response = await page.goto('/hub/personal-assistant', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: /Meet Jarvis/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Virtual Sandbox', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Leak Finder', exact: true })).toBeVisible();
    await expectHealthyLayout(page);
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
    await expect(page.getByRole('heading', { name: 'Hand Of The Day' })).toBeVisible();
    await expect(page.getByText('You Hold T9s On The Flop. What Is The GTO Play?')).toBeVisible();
    await expect(page.getByText('BTN · Pot 6 BB')).toBeVisible();
    await expect(page.getByRole('button', { name: /Load In Sandbox/i })).toBeVisible();
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
    await expect(page.getByText('Worst coach-mode spots')).toBeVisible();
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
    await page.route('**/api/assistant/leaks', route => route.fulfill({
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
          recommended_drill: 'cash-rfi',
          suggested_fix: 'Open the solver-approved button range and compare every boundary hand.',
          why_leaking_ev: 'Folding profitable opens gives up uncontested blinds and positional equity.',
          trend_data: [{ date: '2026-08-29', value: 38 }, { date: '2026-08-30', value: 41 }],
          first_detected_at: '2026-08-29T12:00:00.000Z',
        }],
        demoLeaks: [],
      }),
    }));

    await page.goto('/hub/personal-assistant/leaks', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Button Open Frequency.*Open details/i }).click();
    const details = page.getByRole('dialog', { name: 'Leak details: Button Open Frequency' });
    await expect(details).toBeVisible();
    await expect(details.getByRole('heading', { name: 'How To Fix It' })).toBeVisible();
    await expect(details.getByRole('heading', { name: 'Recent Example Hands' })).toBeVisible();
    await expect(details.getByRole('heading', { name: 'Suggested Fixes' })).toBeVisible();
    await expect(details.getByRole('button', { name: 'Practice Leak in Sandbox' })).toBeVisible();
    await expect(details.getByRole('button', { name: 'Train with Focused Drills' })).toBeVisible();
    const guidance = details.getByRole('switch');
    await expect(guidance).toHaveAttribute('aria-checked', 'false');
    await guidance.click();
    await expect(guidance).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(details).toHaveCount(0);
    await expectHealthyLayout(page);
  });

  test('one Leak Finder action completes every signed audit page and shows cumulative progress', async ({ page }) => {
    // This case verifies the explicit user action. Leak Finder also performs an
    // intentional first-visit background audit for eligible empty accounts;
    // suppress that independent path so an instant route mock cannot finish a
    // background pass and then count the manual pass as duplicate pagination.
    await page.addInitScript(() => {
      window.localStorage.setItem('pa-auto-detect-last', String(Date.now()));
    });

    const seenCursors: Array<string | null> = [];
    await page.route('**/api/assistant/leaks/detect', async route => {
      const body = route.request().postDataJSON() as { auditCursor?: string | null } | null;
      const cursor = body?.auditCursor || null;
      seenCursors.push(cursor);
      const response = cursor === null
        ? { success: true, auditInProgress: true, clubArenaSync: { auditCursor: 'signed-page-2', handsFound: 200, handsAudited: 5, decisionsAnalyzed: 12 } }
        : cursor === 'signed-page-2'
          ? { success: true, auditInProgress: true, clubArenaSync: { auditCursor: 'signed-page-3', handsFound: 200, handsAudited: 4, decisionsAnalyzed: 10 } }
          : { success: true, persisted: true, handsAnalyzed: 550, solverDecisionsAnalyzed: 30, leaksDetected: 2, leaks: [], clubArenaSync: { handsFound: 150, handsAudited: 3, decisionsAnalyzed: 8 } };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
    });

    await page.goto('/hub/personal-assistant/leaks', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Run Leak Detection|Continue Leak Audit/i }).click();

    await expect.poll(() => seenCursors.length).toBe(3);
    expect(seenCursors).toEqual([null, 'signed-page-2', 'signed-page-3']);
    await expect(page.getByText(/Scanned 550 Club Arena Hands/i)).toBeVisible();
    await expect(page.getByText('Club Hands Scanned')).toBeVisible();
    await expect(page.getByText('550', { exact: true }).first()).toBeVisible();
    await expectHealthyLayout(page);
  });
});
