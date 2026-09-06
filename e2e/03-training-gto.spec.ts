import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const savedAuthState = JSON.parse(
  readFileSync(resolve(process.cwd(), 'playwright/.auth/user.json'), 'utf8'),
);
const savedSmarterPokerStorage = (savedAuthState.origins || [])
  .find((origin: { origin: string }) => new URL(origin.origin).hostname === 'smarter.poker')
  ?.localStorage || [];

test.describe('3. GTO Training Flow', () => {
  test('Club Arena gameplay grades, persists, and waits for explicit Next', async ({ page }) => {
    test.setTimeout(90_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    // Playwright scopes localStorage to the saved production origin. Protected
    // previews and local release builds use the same authenticated account but
    // another hostname, so copy only those saved entries before navigation.
    await page.addInitScript((entries) => {
      for (const entry of entries) localStorage.setItem(entry.name, entry.value);
    }, savedSmarterPokerStorage);
    await page.route('**/api/training/record-question', async (route) => {
      const response = await route.fetch();
      // Keep the real server write and response, but hold delivery long enough
      // to prove two rapid Next clicks cannot enter two transitions.
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_500));
      await route.fulfill({ response });
    });

    await page.goto('/hub/training/arena/cash-001?level=1&revision=phase6-ci', {
      waitUntil: 'domcontentloaded',
    });

    const start = page.locator('.sp-arena-lobby__start');
    await expect(start).toBeVisible({ timeout: 60_000 });
    await expect(start).toBeEnabled({ timeout: 60_000 });
    await start.click();

    const table = page.locator('[data-training-ui="club-arena-table"]');
    await expect(table).toBeVisible({ timeout: 60_000 });
    await expect(table).toHaveAttribute('data-training-street', 'preflop');
    await expect(table).toHaveAttribute('data-training-player-count', '6');
    await expect(table.locator('[data-training-seat]')).toHaveCount(6);
    await expect(page.locator('.approved-global-header')).toHaveCount(1);
    await expect(page.locator('[data-global-bottom-nav="true"][data-footer-world="training"]')).toHaveCount(0);

    const actionButtons = table.locator('.sp-club-gto-actions [data-action]');
    await expect(actionButtons).toHaveCount(4);
    const geometry = await table.evaluate((root) => {
      const felt = root.querySelector<HTMLElement>('[data-training-table="true"]');
      const hero = root.querySelector<HTMLElement>('[data-training-seat="hero"]');
      const actionRail = root.querySelector<HTMLElement>('.sp-club-gto-actions');
      const cards = [...root.querySelectorAll<HTMLElement>('.sp-club-gto-hero-card')];
      const box = (node: HTMLElement | null) => node?.getBoundingClientRect() || null;
      return {
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        source: root.getAttribute('data-training-club-arena-source'),
        felt: box(felt),
        hero: box(hero),
        actionRail: box(actionRail),
        cards: cards.map((card) => box(card)),
        portraitSizes: [...root.querySelectorAll<HTMLElement>('[data-training-seat]')].map((seat) => ({
          width: Number(seat.dataset.trainingAvatarWidth),
          height: Number(seat.dataset.trainingAvatarHeight),
        })),
      };
    });
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.source).toBe('30702e1af');
    expect(geometry.felt).not.toBeNull();
    expect(geometry.hero?.bottom || Infinity).toBeLessThanOrEqual((geometry.actionRail?.top || 0) + 2);
    expect(geometry.cards.every((card) => (card?.bottom || Infinity) <= (geometry.actionRail?.top || 0) + 1)).toBe(true);
    expect(geometry.portraitSizes.every(({ width, height }) => width > 0 && height > 0)).toBe(true);

    const persistence = page.waitForResponse(
      (response) => response.url().includes('/api/training/record-question'),
      { timeout: 30_000 },
    );
    await actionButtons.first().click();
    const verdict = table.locator('[data-training-feedback="verdict"]');
    await expect(verdict).toBeVisible({ timeout: 30_000 });

    const next = table.locator('.sp-training-next-button:visible').filter({
      hasText: /Next Question|Next - Continue Hand/,
    }).first();
    await expect(next).toBeVisible();
    await page.waitForTimeout(1_200);
    await expect(verdict).toBeVisible();
    await expect(next).toBeVisible();
    await next.click();
    await next.click();
    await page.waitForTimeout(100);
    await expect(verdict).toBeVisible();

    const recordResponse = await persistence;
    expect(recordResponse.status()).toBeLessThan(400);
    await expect(table).toHaveAttribute('data-training-visual-state', 'action', { timeout: 30_000 });
    await expect(table.getByText(/Question 2 Of 20/i).first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
