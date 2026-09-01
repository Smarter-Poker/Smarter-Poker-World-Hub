import { expect, test, type Locator, type Page } from '@playwright/test';

// Every menu in this contract is public. Keep the spec independently runnable
// in production verification jobs even when the shared authenticated setup is
// unavailable; CI may still run its normal setup dependency for other specs.
test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(() => test.setTimeout(60_000));

/**
 * World Command Menu end-to-end contract.
 *
 * The old hamburger test covered three legacy drawers and preference toggles.
 * World Hub navigation now has one route-aware command system for fourteen
 * worlds. This suite intentionally owns the product law at the browser layer:
 * one approved trigger, one full-height dialog, and exactly six world-specific
 * primary destinations. Hamburger icon identity is pinned and gear/settings
 * substitutions are forbidden.
 */

type WorldCase = {
  id: string;
  label: string;
  path: string;
  accent: string;
  expectedActiveHref?: string;
  primary: Array<{ href: string; label: string }>;
};

const items = (pairs: Array<[string, string]>): Array<{ href: string; label: string }> =>
  pairs.map(([href, label]) => ({ href, label }));

const WORLDS: WorldCase[] = [
  {
    id: 'personal-assistant',
    label: 'Personal Assistant',
    path: '/hub/personal-assistant',
    accent: '#4599ff',
    primary: items([
      ['/hub/personal-assistant', 'Coach'],
      ['/hub/personal-assistant/sandbox', 'Sandbox'],
      ['/hub/personal-assistant/leaks', 'Leaks'],
      ['/hub/training', 'Train'],
      ['/hub/preflop-charts', 'Charts'],
      ['/hub/poker-tools', 'Odds'],
    ]),
  },
  {
    id: 'training',
    label: 'Training Games',
    path: '/hub/training',
    accent: '#22e67a',
    primary: items([
      ['/hub/training', 'Library'],
      ['/hub/training/play-mode', 'Play'],
      ['/hub/training/daily-challenge', 'Daily'],
      ['/hub/training/progress', 'Progress'],
      ['/hub/training/challenges', 'Goals'],
      ['/hub/training/leaderboard', 'Ranks'],
    ]),
  },
  {
    id: 'news',
    label: 'Poker News',
    path: '/hub/news',
    accent: '#ff7a1a',
    primary: items([
      ['/hub/news', 'Latest'],
      ['/hub/news?tab=videos', 'Videos'],
      ['/hub/news?tab=reels', 'Reels'],
      ['/hub/news?tab=events', 'Events'],
      ['/hub/news?filter=bookmarks', 'Saved'],
      ['/hub/news/sources', 'Sources'],
    ]),
  },
  {
    id: 'trivia',
    label: 'Poker Trivia',
    path: '/hub/trivia',
    accent: '#20d6ff',
    primary: items([
      ['/hub/trivia', 'Lobby'],
      ['/hub/trivia/daily', 'Daily'],
      ['/hub/trivia/arcade', 'Arcade'],
      ['/hub/trivia/pvp', 'PvP'],
      ['/hub/trivia/stats', 'Stats'],
      ['/hub/trivia/leaderboard', 'Ranks'],
    ]),
  },
  {
    id: 'social-media',
    label: 'Social Media',
    path: '/hub/social-media',
    accent: '#1877f2',
    primary: items([
      ['/hub/social-media', 'Feed'],
      ['/hub/social-media/compose', 'Create'],
      ['/hub/friends', 'Friends'],
      ['/hub/messenger', 'Chat'],
      ['/hub/reels', 'Reels'],
      ['/hub/social-pages', 'Pages'],
    ]),
  },
  {
    id: 'diamond-arena',
    label: 'Diamond Arena',
    path: '/hub/diamond-arena',
    accent: '#ffe34d',
    primary: items([
      ['/hub/diamond-arena', 'Arena'],
      ['/hub/diamond-arena/schedule', 'Schedule'],
      ['/hub/diamond-arena/leaderboard', 'Ranks'],
      ['/hub/diamond-arena/stats', 'Stats'],
      ['/hub/diamond-arena/history', 'History'],
      ['/hub/diamond-store', 'Store'],
    ]),
  },
  {
    id: 'my-clubs',
    label: 'My Clubs',
    path: '/hub/my-clubs',
    accent: '#28c9ff',
    primary: items([
      ['/hub/my-clubs', 'Clubs'],
      ['/hub/club-arena', 'Arena'],
      ['/hub/social-pages', 'Pages'],
      ['/hub/my-venues', 'Venues'],
      ['/hub/home-games', 'Games'],
      ['/hub', 'Hub'],
    ]),
  },
  {
    id: 'video-library',
    label: 'Video Library',
    path: '/hub/video-library',
    accent: '#ff5b5b',
    primary: items([
      ['/hub/video-library', 'Videos'],
      ['/hub/video-library?type=cash', 'Cash'],
      ['/hub/video-library?type=tournament', 'Tourneys'],
      ['/hub/video-library?filter=favorites', 'Saved'],
      ['/hub/video-library?filter=history', 'History'],
      ['/hub/video-library?filter=watchlater', 'Later'],
    ]),
  },
  {
    id: 'odds-calculator',
    label: 'Odds Calculator',
    path: '/hub/poker-tools',
    accent: '#4e9cff',
    primary: items([
      ['/hub/poker-tools', 'Odds'],
      ['/hub/training/equity-calculator', 'Equity'],
      ['/hub/training/icm-calculator', 'ICM'],
      ['/hub/preflop-charts', 'Preflop'],
      ['/hub/training/hand-lab', 'Hand Lab'],
      ['/hub', 'Hub'],
    ]),
  },
  {
    id: 'bankroll-manager',
    label: 'Bankroll Manager',
    path: '/hub/bankroll-manager',
    accent: '#f15aff',
    expectedActiveHref: '/hub/bankroll-manager?view=dashboard',
    primary: items([
      ['/hub/bankroll-manager?view=dashboard', 'Summary'],
      ['/hub/bankroll-manager?view=log-session', 'Log'],
      ['/hub/bankroll-manager?view=trips', 'Trips'],
      ['/hub/bankroll-manager?view=reports', 'Reports'],
      ['/hub/bankroll-manager?view=rules', 'Rules'],
      ['/hub/bankroll-manager/export', 'Export'],
    ]),
  },
  {
    id: 'toke-tracker',
    label: 'Toke Tracker',
    path: '/hub/toke-tracker',
    accent: '#ffb020',
    primary: items([
      ['/hub/toke-tracker', 'Tokes'],
      ['/hub/toke-tracker/shift', 'Shift'],
      ['/hub/toke-tracker/analytics', 'Stats'],
      ['/hub/toke-tracker/vault', 'Vault'],
      ['/hub/toke-tracker/vault?tab=tax', 'Taxes'],
      ['/hub/toke-tracker/venues', 'Venues'],
    ]),
  },
  {
    id: 'preflop-charts',
    label: 'Preflop Charts',
    path: '/hub/preflop-charts',
    accent: '#22e6e6',
    primary: items([
      ['/hub/preflop-charts', 'Charts'],
      ['/hub/preflop-charts?mode=speed-drill', 'Speed'],
      ['/hub/preflop-charts/stats', 'Stats'],
      ['/hub/preflop-charts/leaderboard', 'Ranks'],
      ['/hub/preflop-charts/achievements', 'Awards'],
      ['/hub/preflop-charts/tutorial', 'Tutorial'],
    ]),
  },
  {
    id: 'poker-near-me',
    label: 'Poker Near Me',
    path: '/hub/poker-near-me',
    accent: '#38bdf8',
    expectedActiveHref: '/hub/poker-near-me/lobby',
    primary: items([
      ['/hub/poker-near-me/lobby', 'Nearby'],
      ['/hub/poker-near-me/venues', 'Venues'],
      ['/hub/poker-near-me/events', 'Events'],
      ['/hub/poker-near-me/live-games', 'Games'],
      ['/hub/poker-near-me/map', 'Map'],
      ['/hub/poker-near-me/saved', 'Saved'],
    ]),
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    path: '/hub/marketplace',
    accent: '#ffd84a',
    expectedActiveHref: '/hub/diamond-store',
    primary: items([
      ['/hub/marketplace', 'Market'],
      ['/hub/diamond-store', 'Diamonds'],
      ['/hub/merch-store', 'Merch'],
      ['/hub/club-shop', 'Clubs'],
      ['/hub/vip-membership', 'VIP'],
      ['/hub/diamond-store/orders', 'Orders'],
    ]),
  },
];

async function visitWorld(page: Page, world: WorldCase): Promise<void> {
  await page.addInitScript(() => {
    (window as Window & { __worldCommandClicks?: string[] }).__worldCommandClicks = [];
    document.addEventListener('click', (event) => {
      const target = event.target as Element | null;
      const command = target?.closest?.('[data-command-target]');
      if (!command) return;
      event.preventDefault();
      (window as Window & { __worldCommandClicks?: string[] }).__worldCommandClicks?.push(
        command.getAttribute('data-command-target') || ''
      );
    }, true);
  });
  if (world.id === 'news') {
    await page.addInitScript(() => window.sessionStorage.setItem('news-intro-seen', 'true'));
  }
  await page.goto(world.path, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Application Error', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Unhandled Runtime Error', { exact: true })).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-world-copy-policy', world.id);

  const copyContract = await page.evaluate(() => {
    const scope = document.querySelector('.world-copy-scope');
    const visibleCopy = document.body.innerText || '';
    const accessibleCopy = Array.from(document.querySelectorAll('*')).flatMap((element) =>
      ['aria-label', 'aria-description', 'placeholder', 'title', 'alt', 'data-tooltip']
        .map((name) => element.getAttribute(name) || '')
    ).join('\n');
    return {
      scopeCapitalization: scope ? getComputedStyle(scope).textTransform : '',
      hasLongBar: /[\u2013\u2014]/u.test(`${visibleCopy}\n${accessibleCopy}`),
    };
  });
  expect(copyContract.scopeCapitalization).toBe('capitalize');
  expect(copyContract.hasLongBar).toBe(false);

  await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.id = 'world-copy-policy-fixture';
    fixture.textContent = 'dynamic poker copy — ready';
    fixture.setAttribute('aria-label', 'dynamic poker control – ready');
    document.body.appendChild(fixture);
  });
  const fixture = page.locator('#world-copy-policy-fixture');
  await expect(fixture).toHaveText('Dynamic Poker Copy: Ready');
  await expect(fixture).toHaveAttribute('aria-label', 'Dynamic Poker Control: Ready');
}

async function openWorldMenu(
  page: Page,
  world: WorldCase
): Promise<{ trigger: Locator; dialog: Locator }> {
  const trigger = page.locator('[data-world-menu-trigger]');
  await expect(trigger, `${world.label} must expose exactly one command trigger`).toHaveCount(1);
  await expect(trigger).toBeVisible();
  const triggerOwner = await trigger.getAttribute('data-world-menu-trigger');
  await expect(trigger).toHaveAttribute(
    'data-menu-symbol',
    triggerOwner === 'approved-header' ? 'hamburger' : 'command-grid'
  );
  await expect(trigger).toHaveAttribute(
    'aria-label',
    new RegExp(`Open ${world.label} Command Menu`, 'i')
  );
  await expect
    .poll(async () => trigger.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThanOrEqual(24);

  await trigger.click();
  const dialog = page.locator(`[data-world-command-menu="${world.id}"]`);
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toHaveAttribute('data-menu-symbol', 'command-grid');
  return { trigger, dialog };
}

for (const world of WORLDS) {
  test(`${world.label} owns one premium six-command menu`, async ({ page }) => {
    await visitWorld(page, world);
    const { trigger, dialog } = await openWorldMenu(page, world);

    const primaryDeck = dialog.locator(`[data-world-primary-commands="${world.id}"]`);
    await expect(primaryDeck).toHaveCount(1);
    const primaryTiles = primaryDeck.locator('.sp-grid-tile');
    await expect(primaryTiles, `${world.label} must render six primary commands`).toHaveCount(6);

    for (const { href, label } of world.primary) {
      const tile = primaryDeck.locator(`.sp-grid-tile[href="${href}"]`);
      await expect(tile, `${world.label} is missing ${label} (${href})`).toHaveCount(1);
      await expect(tile).toBeVisible();
      await expect(tile).toContainText(label);
    }

    const activeHref = world.expectedActiveHref || world.primary[0].href;
    await expect(primaryDeck.locator('.sp-grid-tile[aria-current="page"]')).toHaveCount(1);
    await expect(primaryDeck.locator(`.sp-grid-tile[href="${activeHref}"]`)).toHaveAttribute(
      'aria-current',
      'page'
    );

    // The drawer keeps its existing six-node command mark. The approved global
    // header keeps its hamburger artwork. Neither trigger may regress to a
    // gear or settings icon.
    if ((await trigger.getAttribute('data-world-menu-trigger')) === 'route-fallback') {
      await expect(trigger.locator('i')).toHaveCount(6);
    }
    await expect(dialog.locator('.sp-command-grid-mark i')).toHaveCount(6);
    const settingsIconViolations = await trigger.evaluate((control) => {
      const violations: string[] = [];
      if (/^(?:gear|settings)$/i.test(control.getAttribute('data-menu-symbol') || '')) {
        violations.push('data-menu-symbol');
      }
      control.querySelectorAll('svg').forEach((svg) => {
        const lucide = (svg.getAttribute('data-lucide') || '').toLowerCase();
        if (['settings', 'settings-2', 'cog'].includes(lucide)) {
          violations.push(`lucide:${lucide}`);
        }
      });
      return violations;
    });
    expect(settingsIconViolations).toEqual([]);

    await expect
      .poll(
        async () => dialog.evaluate((element) => Math.abs(element.getBoundingClientRect().x)),
        { timeout: 15_000 },
      )
      .toBeLessThanOrEqual(1);

    const metrics = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        accent: style.getPropertyValue('--world-accent').trim().toLowerCase(),
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        documentOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyOverflow: getComputedStyle(document.body).overflow,
      };
    });

    expect(metrics.accent).toBe(world.accent);
    expect(Math.abs(metrics.height - metrics.viewportHeight)).toBeLessThanOrEqual(1);
    expect(metrics.width).toBeLessThanOrEqual(Math.min(400, metrics.viewportWidth) + 1);
    expect(Math.abs(metrics.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.y)).toBeLessThanOrEqual(1);
    expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
    expect(metrics.bodyOverflow).toBe('hidden');

    if (world.id === 'social-media') {
      const socialChrome = await dialog.locator('.sp-command-utility-rail').evaluate((element) => ({
        background: getComputedStyle(element).backgroundImage,
        title: getComputedStyle(element.querySelector('.sp-command-title') as Element).color,
      }));
      expect(socialChrome.background).toContain('rgb(255, 255, 255)');
      expect(socialChrome.title).toBe('rgb(5, 5, 5)');
    }

    // Exercise every command's real React activation path without leaving the
    // world. A capture listener cancels only the browser's default navigation;
    // the component handler still records the command and closes the drawer.
    for (const [index, destination] of world.primary.entries()) {
      const command = primaryDeck.locator(`.sp-grid-tile[href="${destination.href}"]`);
      await command.click();
      await expect(dialog).toBeHidden();
      const captured = await page.evaluate(() =>
        (window as Window & { __worldCommandClicks?: string[] }).__worldCommandClicks || []
      );
      expect(captured.at(-1)).toBe(destination.href);
      if (index < world.primary.length - 1) {
        await trigger.click();
        await expect(dialog).toBeVisible();
      }
    }

    await trigger.click();
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  });
}

const FALLBACK_SECONDARY_CASES = [
  {
    worldId: 'training',
    path: '/hub/training/aggregate',
    absentLabels: ['View Mode', 'Sound Effects', 'Timer', 'Auto-Advance', 'Show Hints'],
  },
  {
    worldId: 'trivia',
    path: '/hub/trivia/cash',
    absentLabels: ['Sound Effects', 'Timer', 'Hints'],
  },
  {
    worldId: 'preflop-charts',
    path: '/hub/preflop-charts/achievements',
    absentLabels: ['Sound Effects', 'Keyboard Shortcuts', 'Show Timer', 'Visual Hints'],
  },
];

for (const entry of FALLBACK_SECONDARY_CASES) {
  const canonicalWorld = WORLDS.find((world) => world.id === entry.worldId)!;
  test(`${canonicalWorld.label} fallback route omits handlerless secondary controls`, async ({ page }) => {
    const routeWorld = { ...canonicalWorld, path: entry.path };
    await visitWorld(page, routeWorld);
    const { dialog } = await openWorldMenu(page, routeWorld);

    await expect(
      dialog.locator(`[data-world-primary-commands="${canonicalWorld.id}"] .sp-grid-tile`)
    ).toHaveCount(6);
    for (const label of entry.absentLabels) {
      await expect(dialog.getByText(label, { exact: true })).toHaveCount(0);
    }
    await expect(dialog.getByText('Unavailable', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Application Error', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Unhandled Runtime Error', { exact: true })).toHaveCount(0);
  });
}

test('Bankroll Log deep links preserve the visible authorization gate and clean their URL', async ({ page }) => {
  await page.goto('/hub/bankroll-manager?view=log-session', { waitUntil: 'domcontentloaded' });
  const dialog = page.getByRole('dialog', { name: 'Sign In Required' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/view=log-session/);
});

test('Toke Taxes opens for an empty account and closes without stale deep-link state', async ({ page }) => {
  await page.goto('/hub/toke-tracker/vault?tab=tax', { waitUntil: 'domcontentloaded' });
  const dialog = page.getByRole('dialog', { name: 'Annual Tax Summary' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/No Completed Events In \d{4}/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Close Tax Summary' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/tab=tax/);
});

test('Diamond Arena content never hides beneath its fixed world footer', async ({ page }) => {
  await page.goto('/hub/diamond-arena', { waitUntil: 'domcontentloaded' });
  const arena = page.locator('[data-diamond-arena-page="true"]');
  const footer = page.locator('[data-global-bottom-nav="true"]');
  await expect(arena).toBeVisible();
  await expect(footer).toBeVisible();
  await expect.poll(async () => {
    const [arenaBox, footerBox] = await Promise.all([arena.boundingBox(), footer.boundingBox()]);
    if (!arenaBox || !footerBox) return Number.POSITIVE_INFINITY;
    return arenaBox.y + arenaBox.height - footerBox.y;
  }).toBeLessThanOrEqual(1);
});
