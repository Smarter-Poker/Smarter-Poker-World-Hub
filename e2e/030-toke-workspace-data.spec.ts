import { captureBankrollPanel } from './fixtures/bankrollPanelCapture';
import { expect, test, type Page } from '@playwright/test';
import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block', contextOptions: { reducedMotion: 'reduce' } });

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
    if (table === 'toke_gigs') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      if (id) return route.fulfill({ json: completed.filter(gig => gig.id === id) });
      return route.fulfill({ json: url.searchParams.get('status') === 'eq.active' ? [liveGig] : completed });
    }
    if (table === 'toke_downs') {
      const id = url.searchParams.get('gig_id');
      return route.fulfill({ json: live ? [] : id?.startsWith('eq.') ? downs.filter(down => 'eq.' + down.gig_id === id) : downs });
    }
    if (table === 'toke_gig_days') return route.fulfill({ json: [{ id: 'fixture-day', gig_id: liveGig.id, day_number: 1, ended_at: null }] });
    return route.fulfill({ json: [] });
  });
}

test.beforeEach(async ({ context, page }) => {
  await installRealtimeSessionGuard(context);
  await dealerFixture(page);
});

test('Dealer earnings chart exposes its source amounts, keyboard tooltip and responsive rows', async ({ page }, info) => {
  const windows:string[]=[];
  await page.route('**/rest/v1/toke_gigs*',route=>{
    const cutoff=new URL(route.request().url()).searchParams.get('start_date');
    if(!cutoff) return route.fallback();
    windows.push(cutoff);return route.fulfill({json:[]});
  });
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
  await charts.getByRole('button',{name:'Per Event'}).click();
  await expect(page.locator('.recharts-bar-rectangle path').first()).toBeVisible();
  await charts.getByRole('button',{name:'Monthly'}).click();
  await expect(page.getByRole(viewport ? 'list' : 'table',{name:'Monthly Data'})).toBeVisible();
  const period=page.getByRole('group',{name:'Earnings Period'});
  await period.getByRole('button',{name:'30 Days'}).click();
  await expect(page.locator('.sd-metric').filter({hasText:'Period Tokes'})).toContainText('$0.00');
  expect(windows).toHaveLength(1); expect(windows[0]).toMatch(/^gte\.\d{4}-\d{2}-\d{2}$/);
  await period.getByRole('button',{name:'Career'}).click();
  await expect(page.locator('.sd-metric').filter({hasText:'Career Tokes'})).toContainText('$125.00');
  await charts.getByRole('button',{name:'Trend'}).click();
  await captureBankrollPanel(page,page.locator('section.sd-panel').filter({has:charts}),info,'toke-earnings');
});

test('Dealer can change down types and return to the shift from the native dialog', async ({ page }) => {
  await page.goto('/hub/toke-tracker/shift');
  const launch = page.getByRole('button', { name: 'Add + · Down', exact: true });
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

test('Shift expense and completed reports open from their controls with the selected amounts', async ({ page }, info) => {
  await page.goto('/hub/toke-tracker/shift');
  await expect(page.getByRole('heading', {name:'Dealer Desk'})).toBeVisible();
  await page.screenshot({path: info.outputPath('shift-active.png')});
  await info.attach('shift-active', {path: info.outputPath('shift-active.png'), contentType:'image/png'});
  const expense = page.getByRole('button', { name: 'Expense', exact:true });
  await expense.click();
  const dialog = page.getByRole('dialog', {name:'Add Expense'});
  await expect(dialog.getByLabel('Amount ($)')).toBeFocused();
  await dialog.getByLabel('Category').selectOption('gas');
  await dialog.getByLabel('Amount ($)').fill('24.50');
  await expect(dialog.getByRole('button',{name:'Scan Receipt'})).toBeVisible();
  await page.screenshot({path: info.outputPath('shift-expense.png')});
  await info.attach('shift-expense', {path: info.outputPath('shift-expense.png'), contentType:'image/png'});
  await page.keyboard.press('Escape');
  await expect(expense).toBeFocused();
  const history = page.getByRole('region',{name:'Completed Events'});
  await history.getByRole('button',{name:'Edit River Room'}).click();
  await expect(history.getByLabel('Venue Name')).toHaveValue('River Room');
  await history.getByRole('button',{name:'Cancel'}).click();
  const report = history.getByRole('button',{name:'View Report For River Room'});
  await report.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'River Room'})).toBeVisible();
  await expect(page.locator('.sd-metric').filter({hasText:'Total Tokes'})).toContainText('$50.00');
  await page.getByRole('button',{name:/Back To Events/}).click();
  await expect(history).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Venue Intel ranks recorded shifts and its calendar opens the selected date and existing create form', async ({page}, info)=>{
  const today=new Date();
  const year=today.getFullYear();
  const eventDate=String(year+1)+'-06-17';
  await page.route('**/rest/v1/dealer_calendar_events*',r=>r.fulfill({json:[{
    id:'fixture-event',user_id:dealerId,title:'Summer Dealer Shift',venue_name:'Main Room',event_date:eventDate
  }]}));
  await page.goto('/hub/toke-tracker/venues');
  const venues=page.getByRole('region',{name:'Career Intelligence'});
  await expect(venues).toContainText('River Room');
  await expect(venues).toContainText('$125.00');
  await venues.getByRole('button',{name:'Total $',exact:true}).click();
  await expect(venues.getByRole('button',{name:'Total $',exact:true})).toHaveAttribute('aria-pressed','true');
  const calendar=page.getByRole('region',{name:'Event Calendar'});
  await expect(calendar).toContainText('0 Upcoming Events In '+year);
  await calendar.getByRole('button',{name:'Next Year'}).click();
  await expect(calendar).toContainText('1 Upcoming Event In '+(year+1));
  await calendar.getByRole('button',{name:/^June/}).click();
  await calendar.getByRole('button',{name:'Summer Dealer Shift',exact:true}).click();
  const details=page.getByRole('dialog');
  await expect(details).toContainText('Main Room');
  await details.getByRole('button',{name:'Close',exact:true}).click();
  await calendar.getByRole('button',{name:'Today',exact:true}).click();
  await expect(calendar.getByRole('button',{name:new RegExp('^'+today.toLocaleDateString('en-US',{month:'long'}))})).toHaveAttribute('aria-expanded','true');
  await page.getByRole('button',{name:'Add + · New Calendar Event'}).click();
  const edit=page.getByRole('dialog',{name:'New Calendar Event'});
  await edit.getByLabel('Event Date').fill(eventDate);
  await expect(edit.getByLabel('Event Date')).toHaveValue(eventDate);
  await edit.getByRole('button',{name:'Cancel'}).click();
  await expect(edit).toBeHidden();
  await captureBankrollPanel(page,venues,info,'venue-intel');
});

test('A running cash down offers an amount at end and the timed table check returns to the active shift', async ({ page }, info) => {
  const now = new Date();
  await page.clock.install({time: now});
  const active = {id:'fixture-active-down',gig_id:liveGig.id,day_id:'fixture-day',down_type:'cash',game_type:'Holdem',table_number:'12',
    started_at:new Date(now.getTime() - 34 * 60000).toISOString(),ended_at:null,toke_amount:0};
  let writes = 0;
  await page.route('**/rest/v1/toke_downs*', route => {
    if (route.request().method() !== 'GET') { writes++; return route.fulfill({json:[]}); }
    return new URL(route.request().url()).searchParams.get('gig_id') === 'eq.' + liveGig.id
      ? route.fulfill({json:[active]}) : route.fallback();
  });
  await page.goto('/hub/toke-tracker/shift');
  const end = page.getByRole('button',{name:'End',exact:true});
  await end.click();
  const amount = page.getByRole('dialog',{name:'End Down'});
  await expect(amount.getByLabel('Tokes Received ($)')).toBeFocused();
  await amount.getByLabel('Tokes Received ($)').fill('12.50');
  await page.keyboard.press('Escape');
  await expect(end).toBeFocused();
  await page.clock.fastForward(61000);
  const timer = page.getByRole('dialog',{name:/Same Table/});
  await expect(timer.getByText(/Holdem.*Table 12/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(timer.getByRole('button',{name:'Yes, Double Down'})).toBeVisible();
  await expect(timer.getByRole('button',{name:'No, New Down'})).toBeVisible();
  await page.screenshot({path: info.outputPath('shift-timer.png')});
  expect(writes).toBe(0);
});
