import { test, expect } from '@playwright/test';
import { buildHtml } from '../src/lib/dailyDigest/render.mjs';
import { digestLayoutFixture } from './digest-layout-fixture.mjs';

for (const width of [375, 600]) {
    test(`the complete digest stays readable at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.setContent(buildHtml(digestLayoutFixture()));
        const dimensions = await page.evaluate(() => ({
            client: document.documentElement.clientWidth,
            scroll: document.documentElement.scrollWidth,
        }));
        expect(dimensions.scroll, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.client);
        await expect(page.getByText('Month To Date', { exact: true }).last()).toBeVisible();
        for (const cell of await page.locator('.player-period .period-value').all()) {
            const bounds = await cell.boundingBox();
            if (!bounds) throw new Error("A period value cell is hidden");
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        }
        const amount = page.getByText('1,234,567.89', { exact: true }).last();
        await expect(amount).toBeVisible();
        const bounds = await amount.evaluate(el => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, lines: el.getClientRects().length };
        });
        expect(bounds.lines).toBe(1);
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(dimensions.client);
        await expect(page.getByText(/^\d+\. Fixture Horse \d+$/)).toHaveCount(938);
        const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
        for (let i = 0; i < 24; i++) expect(text).toContain(`fixture source ${i} with a long descriptive name`);
    });
}
