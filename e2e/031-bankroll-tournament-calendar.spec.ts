import { expect, test } from '@playwright/test';
import { captureBankrollPanel } from './fixtures/bankrollPanelCapture';
import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';

const calendar = '/hub/bankroll-manager?view=tournament-calendar';
test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
test.beforeEach(async ({ context, baseURL }) => {
  await installRealtimeSessionGuard(context);
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ json: [] });
    if (url.origin === origin && request.method() === 'GET') return route.continue();
    return route.abort();
  });
});

for (const [timezoneId, locale] of [
  ['America/Chicago', 'en-US'],
  ['Pacific/Kiritimati', 'en-GB'],
]) {
  test.describe(`Tournament Calendar in ${timezoneId}`, () => {
    test.use({ timezoneId, locale });

    test('lists the advertised date through the final local day and supports keyboard planning', async ({ page }, info) => {
      // 11:30 PM locally on the last day in each timezone.
      await page.clock.setFixedTime(new Date(timezoneId === 'America/Chicago' ? '2026-12-18T05:30:00Z' : '2026-12-17T09:30:00Z'));
      await page.goto(calendar, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'List', exact: true }).click();
      const event = page.getByRole('button', { name: 'View WPT Championship Details' });
      const shortDate = locale === 'en-GB' ? '10 Dec' : 'Dec 10';
      await expect(event.locator('time')).toHaveText(shortDate);
      const favorite = page.getByRole('button', { name: 'Favorite WPT Championship', exact: true });
      await favorite.focus();
      await page.keyboard.press('Space');
      await expect(favorite).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText('$10,400 Needed')).toBeVisible();
      await expect(page.getByRole('region', { name: 'WPT Championship' })).toHaveCount(0);

      await event.focus();
      await page.keyboard.press('Enter');
      const detail = page.getByRole('region', { name: 'WPT Championship' });
      await expect(detail.getByRole('heading', { name: 'WPT Championship' })).toBeFocused();
      const range = detail.locator('time');
      await expect(range.first()).toHaveText(locale === 'en-GB' ? '10 December 2026' : 'December 10, 2026');
      await expect(range.last()).toHaveAttribute('datetime', '2026-12-17');
      if (locale === 'en-US') await captureBankrollPanel(page, detail, info, 'calendar-event-details');
      await detail.getByRole('button', { name: 'Remove From Plan' }).click();
      await expect(favorite).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByText('$10,400 Needed')).toHaveCount(0);
      await detail.getByRole('button', { name: 'Close Event Details' }).click();
      await expect(event).toBeFocused();
      await expect(detail).toHaveCount(0);

      // Midnight on the following local day retires the event from Upcoming.
      await page.clock.setFixedTime(new Date(timezoneId === 'America/Chicago' ? '2026-12-18T06:01:00Z' : '2026-12-17T10:01:00Z'));
      await page.getByRole('button', { name: 'Calendar', exact: true }).click();
      await page.getByRole('button', { name: 'List', exact: true }).click();
      await expect(event).toHaveCount(0);
    });
  });
}

test.describe('Tournament Calendar month boundaries', () => {
  test.use({ timezoneId: 'America/Chicago', locale: 'en-US' });

  test('covers each civil day across months and advances across New Year', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-06-29T17:00:00Z'));
    await page.goto(calendar, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Main Event, June 28, 2026', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Main Event, June 27, 2026', exact: true })).toHaveCount(0);
    const next = page.getByRole('button', { name: 'Next Month' });
    await next.click();
    for (const day of [1, 15]) {
      await expect(page.getByRole('button', { name: `Main Event, July ${day}, 2026`, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Main Event, July 16, 2026', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'WSOP Online Series, July 1, 2026', exact: true })).toBeVisible();
    for (let month = 8; month <= 12; month++) await next.click();
    const first = page.getByRole('button', { name: 'WPT Championship, December 10, 2026', exact: true });
    await first.focus();
    await page.keyboard.press('Space');
    const detail = page.getByRole('region', { name: 'WPT Championship' });
    await expect(detail.getByRole('heading')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(first).toBeFocused();
    await next.click();
    await expect(page.getByText('January 2027', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /WPT Championship,/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Previous Month' }).click();
    await expect(first).toBeVisible();
  });
});
