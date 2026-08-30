import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1100, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

const expectedClubFooterHeight = (viewportWidth: number) =>
  Math.min(263, Math.max(44, viewportWidth * 0.1372));

test.describe('global footer route and visual contract', () => {
  test('World Hub keeps one complete footer fixed at every supported width', async ({
    page,
  }, testInfo) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto('/hub/install', { waitUntil: 'domcontentloaded' });

      const nav = page.locator('[data-global-bottom-nav="true"]');
      await expect(nav).toHaveCount(1);
      await expect(nav).toBeVisible();
      await expect(nav).toHaveCSS('position', 'fixed');
      await expect(nav).toHaveCSS('transform', 'none');
      await expect(nav).toHaveCSS('transition-duration', '0s');

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const navBox = await nav.boundingBox();
      expect(navBox).not.toBeNull();
      expect(Math.abs(navBox!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(navBox!.y + navBox!.height - viewport.height)).toBeLessThan(4);
      expect(navBox!.width).toBeLessThanOrEqual(viewport.width + 1);

      const links = nav.getByRole('link');
      await expect(links).toHaveCount(6);
      for (let index = 0; index < 6; index += 1) {
        const box = await links.nth(index).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }

      const clearance = page.locator('[data-bottom-nav-clearance="true"]');
      await expect(clearance).toHaveCount(1);
      const clearanceBox = await clearance.boundingBox();
      expect(clearanceBox).not.toBeNull();
      expect(clearanceBox!.height).toBeGreaterThan(navBox!.height);

      await testInfo.attach(`world-footer-${viewport.width}x${viewport.height}`, {
        body: await nav.screenshot(),
        contentType: 'image/png',
      });
    }
  });

  test('Club Arena lobby stays footerless and its probe route stays complete', async ({ page }) => {
    await page.goto('/hub/club-arena', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-global-bottom-nav="true"]')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Club Arena' })).toHaveCount(0);

    // Club Arena owns a service worker and shell-refresh lifecycle. A fresh
    // page mirrors the production monitor's direct visit and prevents a lobby
    // tab's in-flight shell reload from interrupting WebKit's next navigation.
    const probePage = await page.context().newPage();
    await probePage.goto('/hub/club-arena/dev/footer', { waitUntil: 'domcontentloaded' });
    const clubNav = probePage.getByRole('navigation', { name: 'Club Arena' });
    await expect(clubNav).toHaveCount(1);
    await expect(clubNav).toHaveCSS('position', 'fixed');
    await expect(clubNav.locator('[data-footer-control]')).toHaveCount(6);

    const viewport = probePage.viewportSize();
    const box = await clubNav.boundingBox();
    expect(viewport).not.toBeNull();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.y + box!.height - viewport!.height)).toBeLessThan(4);
    expect(
      Math.abs(box!.height - expectedClubFooterHeight(viewport!.width)),
    ).toBeLessThanOrEqual(1);
    await probePage.close();
  });
});
