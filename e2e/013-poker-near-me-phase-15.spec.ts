import { expect, test, type Locator, type Page } from '@playwright/test';

async function expectNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

async function expectInteractionFloor(locator: Locator, label: string) {
  const boxes = await locator.evaluateAll((elements) => elements
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        text: (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 60),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }));
  expect(boxes.length, `${label} should expose at least one visible control`).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.height, `${label} “${box.text}” height`).toBeGreaterThanOrEqual(44);
  }
}

test.describe('Poker Near Me phase 15 secondary interaction foundation', () => {
  test.setTimeout(120_000);

  test('real venue detail exposes one main landmark and resilient remote identity media', async ({ page }) => {
    await page.route(/https?:\/\/(?!127\.0\.0\.1|localhost|smarter\.poker)[^?]+\.(?:png|jpe?g|webp)(?:\?.*)?$/i, (route) => route.abort());
    const response = await page.goto('/hub/venues/1823', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    const main = page.locator('main[data-pnm-secondary-foundation="interaction-v1"]');
    await expect(main).toHaveCount(1);
    await expect(main.getByRole('heading', { level: 1 })).toContainText(/Graton/i, { timeout: 30_000 });

    const identity = main.locator('.venue-profile-identity');
    await expect(identity).toHaveAttribute('data-media-state', 'fallback', { timeout: 30_000 });
    const brokenImages = await main.locator('img').evaluateAll((images: HTMLImageElement[]) => images
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src));
    expect(brokenImages).toEqual([]);
    await expectInteractionFloor(page.locator('.pnm-family-nav__link'), 'family navigation');
    await expectInteractionFloor(main.locator('.section-action-btn, .vr-write-btn'), 'venue actions');
    await expectNoOverflow(page, 'venue detail');
  });

  test('directory, schedule, and community families inherit the semantic main contract', async ({ page }) => {
    for (const route of ['/hub/home-games', '/hub/home-games/near-me', '/hub/poker-series', '/hub/events-calendar']) {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), route).toBe(200);
      await expect(page.locator('main[data-pnm-secondary-foundation="interaction-v1"]'), route).toHaveCount(1);
      await expectNoOverflow(page, route);
    }
  });

  test('390x844 discovery controls preserve the 44px floor without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto('/hub/poker-near-me/map', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('tablist', { name: 'Poker Near Me sections' })).toBeVisible({ timeout: 30_000 });
    await expectInteractionFloor(page.getByRole('tab'), 'primary discovery tabs');
    await expectInteractionFloor(page.locator('.pnm-filter-select'), 'discovery filters');
    await expectNoOverflow(page, '390x844 map');
  });
});
