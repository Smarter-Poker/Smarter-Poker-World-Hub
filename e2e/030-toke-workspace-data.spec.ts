import { expect, test, type Page } from '@playwright/test';
import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block', reducedMotion: 'reduce' });

const dealerId = '00000000-0000-4000-8000-000000000001';
const liveGig = {
  id: '7d38bc95-acdd-4a1d-8422-b48b11cbd206', status: 'active', venue_name: 'Dealer Desk',
  start_date: '2026-05-03', hourly_rate: 20,
};
const completed = [
  { ...liveGig, id: '902e421d-386a-4ec9-816b-245a238fea70', start_date: '2026-05-01', status: 'completed', venue_name: 'River Room' },
  { ...liveGig, id: '9c2c876f-9c95-4c58-950a-7e24ed86d141', start_date: '2026-05-02', status: 'completed', venue_name: 'Summit Room' },
];
const downs = completed.map((gig, i) => ({
  id: 'down-' + i, gig_id: gig.id, down_type: i ? 'tournament' : 'cash', toke_amount: i ? 75 : 50,
  started_at: gig.start_date + 'T12:00:00Z', ended_at: gig.start_date + 'T13:00:00Z',
}));

// Only the application assets and pages use the real server. All identities,
// financial records, API endpoints and realtime sockets are local fixtures.
async function dealerFixture(page: Page) {
  const user = { id: dealerId, role: 'authenticated', email: 'toke-ui@example.invalid', user_metadata: {} };
  await page.addInitScript(user => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const body = btoa(JSON.stringify({ sub: user.id, role: user.role, exp })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    localStorage.setItem('smarter-poker-auth', JSON.stringify({
      access_token: 'e30.' + body + '.fixture', refresh_token: 'toke-ui-fixture',
      expires_at: exp, expires_in: 3600, token_type: 'bearer', user,
    }));
    sessionStorage.setItem('sp_auth_confirmed', '1');
  }, user);
  await page.route('**/auth/v1/**', route => route.fulfill({ json: user }));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/rest/v1/**', async route => {
    const url = new URL(route.request().url());
    const live = url.searchParams.get('gig_id') === 'eq.' + liveGig.id;
    const table = url.pathname.split('/').pop();
    if (route.request().method() !== 'GET') return route.fulfill({ json: [] });
    if (table === 'profiles') return route.fulfill({ json: { id: user.id, settings: {} } });
    if (table === 'toke_gigs') return route.fulfill({ json: url.searchParams.get('status') === 'eq.active' ? [liveGig] : completed });
    if (table === 'toke_downs') return route.fulfill({ json: live ? [] : downs });
    if (table === 'toke_gig_days') return route.fulfill({ json: [{ id: 'fixture-day', gig_id: liveGig.id, day_number: 1, ended_at: null }] });
    return route.fulfill({ json: [] });
  });
}

test.beforeEach(async ({ context, page }) => {
  await installRealtimeSessionGuard(context);
  await dealerFixture(page);
});

test('Dealer earnings chart exposes its source amounts, keyboard tooltip and responsive rows', async ({ page }) => {
  await page.goto('/hub/toke-tracker/analytics');
  const charts = page.getByRole('group', { name: 'Earnings Charts' });
  await expect(charts.getByRole('button', { name: 'Trend' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sd-metric').filter({ hasText: 'Career Tokes' })).toContainText('$125.00');
  const graph = page.locator('.recharts-wrapper [tabindex="0"]').first();
  await graph.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tooltip')).toHaveText(/Room.*Tokes/);
  await page.getByText('View Chart Data', { exact: true }).click();
  const viewport = await page.evaluate(() => matchMedia('(max-width: 768px)').matches);
  const data = page.getByRole(viewport ? 'list' : 'table', { name: 'Trend Data' });
  await expect(data).toContainText('Summit Room');
  await expect(data).toContainText('$125.00');
  await charts.getByRole('button', { name: 'Down Types' }).click();
  const distribution = page.getByRole(viewport ? 'list' : 'table', { name: 'Down Types Data' });
  await expect(distribution).toContainText('Cash Game');
  await expect(distribution).toContainText('Tournament');
});

test('Dealer can change down types and return to the shift from the native dialog', async ({ page }) => {
  await page.goto('/hub/toke-tracker/shift');
  const launch = page.getByRole('button', { name: 'Add Down', exact: true });
  await launch.click();
  const form = page.getByRole('dialog', { name: 'Add Down' });
  await form.getByLabel('Stakes').selectOption('5/10');
  await form.getByRole('button', { name: 'Tournament', exact: true }).click();
  await form.getByLabel('Tournament Name').fill('Local Finals');
  await expect(form.getByLabel('Stakes')).toHaveCount(0);
  await form.getByRole('button', { name: 'Cash Game' }).click();
  await expect(form.getByLabel('Stakes')).toHaveValue('5/10');
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
  await expect(launch).toBeFocused();
});
