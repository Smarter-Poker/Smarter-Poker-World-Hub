import { expect, test } from '@playwright/test';

const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    'http://127.0.0.1:3000';

const AUDITED_TRIVIA_ROUTES = [
    '/hub/trivia',
    '/hub/trivia/mtt',
    '/hub/trivia/cash',
    '/hub/trivia/daily',
    '/hub/trivia/endless',
    '/hub/trivia/mixed',
    '/hub/trivia/survival-game',
    '/hub/trivia/pvp',
    '/hub/trivia/tournaments',
    '/hub/trivia/study',
    '/hub/trivia/settings',
];

const SAMPLE_CARD_ASSETS = [
    '/cards/optimized/spades_q.png',
    '/cards/optimized/spades_5.png',
    '/cards/optimized/clubs_7.png',
    '/cards/optimized/diamonds_2.png',
    '/cards/optimized/hearts_3.png',
];

test.describe('Trivia Phase 4 — Structured Question Layout, Card Assets & Responsive Hygiene', () => {
    test('all optimized playing-card PNGs used in Trivia questions return HTTP 200', async ({ request }) => {
        for (const asset of SAMPLE_CARD_ASSETS) {
            const res = await request.get(`${baseUrl}${asset}`);
            expect(res.status(), `${asset} should load cleanly`).toBe(200);
            expect(res.headers()['content-type'] || '').toContain('image/png');
        }
    });

    test('Trivia Settings exposes Auto-Advance On Correct toggle under Gameplay', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const pageErrors: string[] = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));

        const res = await page.goto(`${baseUrl}/hub/trivia/settings`, { waitUntil: 'domcontentloaded' });
        expect(res?.status()).toBe(200);

        const toggle = page.locator('#trivia-setting-auto-advance');
        await expect(toggle).toBeAttached();
        await expect(page.getByText('Auto-Advance On Correct')).toBeVisible();
        expect(pageErrors).toEqual([]);
    });

    test('Trivia routes fit 390px mobile viewport without horizontal overflow or runtime page errors', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const pageErrors: string[] = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));

        for (const route of AUDITED_TRIVIA_ROUTES) {
            const res = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
            expect(res?.status(), `${route} should return 200`).toBe(200);
            await page.waitForTimeout(250);

            const overflow = await page.evaluate(
                () => document.documentElement.scrollWidth - window.innerWidth,
            );
            expect(overflow, `${route} should have zero horizontal overflow on 390px mobile`).toBeLessThanOrEqual(1);
        }

        expect(pageErrors).toEqual([]);
    });
});
