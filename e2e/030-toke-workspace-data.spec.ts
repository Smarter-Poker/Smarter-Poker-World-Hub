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
async function dealerFixture(page: Page, ownerId = dealerId) {
  const user = { id: ownerId, role: 'authenticated', email: 'toke-ui@example.invalid', user_metadata: {} };
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
  const windows:string[][]=[];
  let releaseSlowRead:()=>void;
  const slowRead=new Promise<void>(resolve=>{releaseSlowRead=resolve;});
  await page.route('**/rest/v1/toke_gigs*',async route=>{
    const limits=new URL(route.request().url()).searchParams.getAll('start_date');
    if(!limits.length)return route.fallback();
    windows.push(limits);
    if(windows.length===2)await slowRead;
    await route.fulfill({json:[]});
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
  const dates=await page.evaluate(()=>{
    const now=new Date();
    return [0,29,89].map(offset=>{
      const day=new Date(now.getFullYear(),now.getMonth(),now.getDate()-offset);
      return [day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');
    });
  });
  expect(windows).toEqual([['gte.'+dates[1],'lte.'+dates[0]]]);
  await period.getByRole('button',{name:'90 Days'}).click();
  await expect.poll(()=>windows.length).toBe(2);
  expect(windows[1]).toEqual(['gte.'+dates[2],'lte.'+dates[0]]);
  await expect(page.getByLabel('Earnings Breakdown')).toHaveCount(0);
  await period.getByRole('button',{name:'Career'}).click();
  await expect(page.locator('.sd-metric').filter({hasText:'Career Tokes'})).toContainText('$125.00');
  const settled=page.waitForResponse(response=>new URL(response.url()).searchParams.getAll('start_date').includes('gte.'+dates[2]));
  releaseSlowRead!();
  await settled;
  await expect(page.locator('.sd-metric').filter({hasText:'Career Tokes'})).toContainText('$125.00');
  await charts.getByRole('button',{name:'Trend'}).click();
  const earnings=page.getByRole('region',{name:'Dealer Earnings',exact:true});
  const plot=earnings.getByRole('region',{name:'Earnings Breakdown'});
  await expect(plot.getByRole('heading',{name:'Cumulative Tokes'})).toBeVisible();
  await expect(plot.getByRole('group',{name:'Earnings Charts'})).toBeVisible();
  const toggle=earnings.getByRole('button',{name:'Earnings Overview'});
  await toggle.click(); await expect(plot).toBeHidden();
  await toggle.click(); await expect(plot).toBeVisible();
  const readouts=earnings.getByRole('definition').filter({hasText:'$125.00'});
  await expect(readouts.first()).toBeVisible();
  await expect(earnings.getByText('View Chart Data',{exact:true})).toBeVisible();
  const group=earnings.locator('header').first();
  await expect(group.getByRole('group',{name:'Earnings Period'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await captureBankrollPanel(page,earnings,info,'toke-earnings');
});

test('Monthly income goal uses recorded toke totals, keeps each dealer’s target and restores editing focus',async ({page,context},info)=>{
  const day=new Date();
  const stamp=[day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),'01'].join('-');
  await page.addInitScript(()=>{
    if (!sessionStorage.getItem('fixture-device-goal-seeded')) {
      localStorage.setItem('toke_monthly_goal','120');
      sessionStorage.setItem('fixture-device-goal-seeded','1');
    }
  });
  await page.route('**/rest/v1/toke_gigs*',route=>{
    const url=new URL(route.request().url());
    if(url.searchParams.get('status')!=='neq.deleted')return route.fallback();
    return route.fulfill({json:[{...completed[0],start_date:stamp,user_id:dealerId}]});
  });
  await page.goto('/hub/toke-tracker/shift');
  const panel=page.getByRole('region',{name:'Monthly Income Goal',exact:true});
  const set=panel.getByRole('button',{name:'Set Monthly Income Goal'});
  await set.click();
  const amount=panel.getByLabel('Monthly Target ($)',{exact:true});
  await expect(amount).toBeFocused();
  await expect(amount).toHaveValue('');
  await panel.getByRole('button',{name:'Use Previous Device Goal'}).click();
  await expect(amount).toHaveValue('120');
  await amount.fill('-12'); await panel.getByRole('button',{name:'Save Goal'}).click();
  expect(await amount.evaluate((input:HTMLInputElement)=>input.validity.rangeUnderflow)).toBe(true);
  await amount.fill('250'); await amount.press('Enter');
  await expect(panel.getByRole('status')).toHaveText('Goal Saved.');
  expect(await page.evaluate(()=>localStorage.getItem('toke_monthly_goal'))).toBeNull();
  const edit=panel.getByRole('button',{name:'Edit Monthly Income Goal'});
  await expect(edit).toBeFocused();
  await expect(panel.getByText('$50.00',{exact:true})).toBeVisible();
  await expect(panel.getByRole('progressbar')).toHaveAttribute('value','20');
  await edit.click(); await amount.fill('900'); await amount.press('Escape');
  await expect(edit).toBeFocused();
  await page.reload();
  await expect(panel.getByRole('progressbar')).toHaveAttribute('value','20');
  await expect(panel).toContainText('$250.00');
  await captureBankrollPanel(page,panel,info,'monthly-income-goal');
  await edit.click();
  await captureBankrollPanel(page,panel,info,'monthly-income-goal-edit');
  await panel.getByRole('button',{name:'Cancel'}).click();
  const other=await context.newPage();
  await dealerFixture(other,'00000000-0000-4000-8000-000000000002');
  await other.goto('/hub/toke-tracker/shift');
  const otherGoal=other.getByRole('region',{name:'Monthly Income Goal',exact:true});
  await expect(otherGoal.getByRole('button',{name:'Set Monthly Income Goal'})).toBeVisible();
  await expect(otherGoal.getByRole('progressbar')).toHaveCount(0);
  await other.close();
});

test('Dealer can change down types and return to the shift from the native dialog', async ({ page }, info) => {
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
  await expect(form.getByRole('button', { name: 'Close Add Down' })).toBeVisible();
  await captureBankrollPanel(page, form, info, 'shift-down');
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
  await captureBankrollPanel(page, history, info, 'shift-completed-edit');
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

test('Venue Intel ranks completed shifts and saves a validated event through its native calendar dialog', async ({ page }, info) => {
  const today = new Date();
  const year = today.getFullYear();
  const eventDate = String(year + 1) + '-06-17';
  const upcoming = { id:'fixture-event', user_id:dealerId, title:'Summer Dealer Shift', venue_name:'Main Room', event_date:eventDate, notes:'Tournament coverage', alert_enabled:true };
  const writes: Record<string,unknown>[] = [];
  await page.route('**/rest/v1/dealer_calendar_events*',route=>{
    if (route.request().method()==='POST') {
      const data=route.request().postDataJSON(); writes.push(data);
      return route.fulfill({status:201,json:{...data,id:'added-fixture-event'}});
    }
    return route.fulfill({json:[upcoming,...writes.map(item=>({...item,id:'added-fixture-event'}))]});
  });
  await page.route('**/rest/v1/toke_downs*',route=>route.fulfill({json:downs.map((row,index)=>index?{...row,tournament_buyin:300,ended_at:completed[1].start_date+'T15:00:00Z'}:row)}));
  await page.goto('/hub/toke-tracker/venues');
  const career=page.getByRole('region',{name:'Career Intelligence'});
  const venues=career.getByRole('region',{name:'Venue Performance'});
  const games=career.getByRole('region',{name:'Game Type Profitability'});
  const ranked=venues.getByRole('list',{name:'Ranked Venues'}).getByRole('listitem');
  await expect(career).toContainText('$125.00');
  await expect(ranked.first()).toContainText('River Room');
  await venues.getByRole('button',{name:'Total Tokes',exact:true}).click();
  await expect(ranked.first()).toContainText('Summit Room');
  await expect(ranked.first()).toContainText('$75.00');
  await expect(ranked.first()).toContainText('$25.00');
  await expect(games).toContainText('Tournament');
  await expect(career.getByRole('region',{name:'Tournament Buy-In Analysis'})).toContainText('$250-$499');
  await games.getByRole('button',{name:'Game Type Profitability'}).click();
  await expect(games.getByText("Hold'em",{exact:true}).first()).toBeHidden();
  await games.getByRole('button',{name:'Game Type Profitability'}).click();
  await captureBankrollPanel(page,career,info,'venue-intel');
  const calendar=page.getByRole('region',{name:'Event Calendar'});
  await expect(calendar).toContainText('0 Upcoming Events In '+year);
  await calendar.getByRole('button',{name:'Next Year'}).click();
  await expect(calendar).toContainText('1 Upcoming Event In '+(year+1));
  await calendar.getByRole('button',{name:/^June/}).click();
  await captureBankrollPanel(page,calendar,info,'venue-event-calendar');
  await calendar.getByRole('button',{name:'Summer Dealer Shift',exact:true}).click();
  const detail=page.getByRole('dialog',{name:'Summer Dealer Shift'});
  await expect(detail).toContainText('Main Room');
  expect(await detail.evaluate(el=>el.matches(':modal'))).toBe(true);
  await detail.getByRole('button',{name:'Close',exact:true}).click();
  await expect(calendar.getByRole('button',{name:'Summer Dealer Shift',exact:true})).toBeFocused();
  await calendar.getByRole('button',{name:'Today',exact:true}).click();
  await expect(calendar.getByRole('button',{name:new RegExp('^'+today.toLocaleDateString('en-US',{month:'long'}))})).toHaveAttribute('aria-expanded','true');
  const add=page.getByRole('button',{name:'Add + · New Calendar Event'});
  await add.click();
  const edit=page.getByRole('dialog',{name:'New Calendar Event'});
  expect(await edit.evaluate(el=>el.matches(':modal'))).toBe(true);
  const title=edit.getByLabel('Event Title');
  await expect(title).toBeFocused();
  await edit.getByRole('button',{name:'Add Event',exact:true}).click();
  expect(await title.evaluate(el=>(el as HTMLInputElement).validity.valueMissing)).toBe(true);
  await title.fill('  ');
  await edit.getByRole('button',{name:'Add Event',exact:true}).click();
  await expect(edit.getByRole('alert')).toHaveText('Enter An Event Title.');
  expect(writes).toHaveLength(0);
  await title.fill('Championship Evening Shift');
  await edit.getByLabel('Event Date').fill(eventDate);
  await edit.getByLabel(/Venue/).fill('Summit Room');
  await edit.getByLabel(/Notes/).fill('Report to the floor desk at 5 PM.');
  const alert=edit.getByRole('button',{name:'Day-Of Alert'});
  await alert.click();
  await expect(alert).toHaveAttribute('aria-pressed','false');
  const geometry=await edit.evaluate(el=>{
    const dialog=el.getBoundingClientRect();
    const close=el.querySelector('button[aria-label="Close"]')!.getBoundingClientRect();
    const all=Array.from(el.querySelectorAll('input,textarea,button,fieldset,legend,label'));
    return {
      modalFits:dialog.left>=0 && dialog.right<=innerWidth+1 && dialog.top>=0 && dialog.bottom<=innerHeight+1,
      fieldsFit:all.every(node=>{const rect=node.getBoundingClientRect();return rect.left>=dialog.left && rect.right<=dialog.right+1}),
      closeFits:close.width>=44 && close.height>=44 && close.top<=dialog.top+25 && close.right>=dialog.right-30,
      footerFits:el.querySelector('button[type=submit]')!.getBoundingClientRect().bottom<=dialog.bottom,
    };
  });
  expect(geometry).toEqual({modalFits:true,fieldsFit:true,closeFits:true,footerFits:true});
  await captureBankrollPanel(page,edit,info,'venue-calendar-new-event');
  await edit.getByRole('button',{name:'Add Event',exact:true}).click();
  await expect(edit).toBeHidden();
  expect(writes).toEqual([{user_id:dealerId,title:'Championship Evening Shift',venue_name:'Summit Room',event_date:eventDate,notes:'Report to the floor desk at 5 PM.',alert_enabled:false}]);
  await add.click();
  await page.keyboard.press('Escape');
  await expect(edit).toBeHidden();
  await expect(add).toBeFocused();
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

test('Dealer Reference submits the signed-in question, retains failures and shows earlier answers', async ({page}, info) => {
  const requests: { query: string; history: { question: string; answer: string }[] }[] = [];
  let signed = false;
  await page.route('**/api/jarvis/dealer-reference', async route => {
    signed = /^Bearer \S+/.test(route.request().headers().authorization || '');
    const body = route.request().postDataJSON();
    requests.push(body);
    if (requests.length === 1) return route.fulfill({status: 503, json: {error: 'Temporarily unavailable.'}});
    return route.fulfill({json: {answer: requests.length === 2 ? 'The button marks the dealer position.' : 'Move it clockwise.'}});
  });
  await page.goto('/hub/toke-tracker/shift');
  const panel = page.getByRole('region', {name: 'Jarvis Dealer Reference'});
  const input = panel.getByLabel('Your Question');
  await expect(input).toBeVisible();
  const images = panel.locator('header img');
  await expect(images).toHaveCount(2);
  await expect.poll(() => images.evaluateAll(items => items.every(item => (item as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const ask = panel.getByRole('button', {name: 'Ask Jarvis'});
  await expect(ask).toBeDisabled();
  await input.fill('What does the dealer button mark?');
  await input.press('Enter');
  await expect(panel.getByRole('alert')).toHaveText('Temporarily unavailable.');
  await expect(input).toHaveValue('What does the dealer button mark?');
  await ask.click();
  await expect(panel.getByText('The button marks the dealer position.')).toBeVisible();
  expect(signed).toBe(true);
  await input.fill('Which direction should I move it?');
  await ask.click();
  await expect(panel.getByText('Move it clockwise.')).toBeVisible();
  expect(requests[2].history).toEqual([{question: requests[1].query, answer: 'The button marks the dealer position.'}]);
  await panel.getByText('Earlier Questions (1)').click();
  await expect(panel.getByText('The button marks the dealer position.')).toBeVisible();
  await captureBankrollPanel(page, panel, info, 'dealer-reference');
  await panel.getByRole('button', {name:'Help For Jarvis Dealer Reference'}).click();
  const help = page.getByRole('dialog', {name: 'Jarvis Dealer Reference Help'});
  await expect(help).toContainText(/call the floor/i);
  await page.keyboard.press('Escape');
  await panel.getByRole('button', {name:'Ask A Dealing Question'}).click();
  await expect(input).toBeHidden();
});

test('Dealer Vault filters stored records and opens a header upload from the collapsed library', async ({ page }, info) => {
  const year = new Date().getFullYear();
  const base = { user_id: dealerId, created_at: year + '-01-12T12:00:00Z', file_url: '/fixture.pdf' };
  const records = [
    { ...base, id: 'permit', category: 'gaming_license', label: 'Nevada Dealer Permit', state: 'NV', expiry_date: (year + 1) + '-07-31' },
    { ...base, id: 'tax', category: 'tax', label: 'Year End Statement', sub_type: 'w2', tax_year: year },
  ];
  let writes = 0;
  await page.route('**/rest/v1/dealer_documents*', route => {
    if (route.request().method() !== 'GET') writes++;
    return route.fulfill({ json: records });
  });
  await page.goto('/hub/toke-tracker/vault');
  const library = page.getByRole('region', { name: 'Documents', exact: true });
  const disclosure = library.getByRole('button', { name: /Documents.*Stored/ });
  const categories = library.getByRole('group', { name: 'Document Categories' });
  await expect(library.getByRole('list', { name: 'Stored Documents' })).toContainText('Nevada Dealer Permit');
  await captureBankrollPanel(page, library, info, 'dealer-vault-documents');
  await categories.getByRole('button', { name: 'Tax Documents' }).click();
  await expect(library.getByText('Year End Statement')).toBeVisible();
  await library.getByRole('group', { name: 'Document Year' }).getByRole('button', { name: String(year - 1) }).click();
  await expect(library.getByRole('status')).toHaveText(/No Tax Documents/);
  await categories.getByRole('button', { name: 'Gaming Licenses' }).click();
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add + · Upload Document' }).click();
  const pageText = 'BT /F1 12 Tf 12 24 Td (Dealer document sample for reviewing a renewal in the document library.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + pageText.length + ' >>\nstream\n' + pageText + '\nendstream',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, i) => {
    const offset = pdf.length;
    pdf += (i + 1) + ' 0 obj\n' + object + '\nendobj\n';
    return String(offset).padStart(10, '0') + ' 00000 n \n';
  });
  const xref = pdf.length;
  pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.join('') + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  await (await picker).setFiles({ name:'dealer-document-sample.pdf', mimeType:'application/pdf', buffer:Buffer.from(pdf) });
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  const details = library.getByRole('form', { name: 'Document Details' });
  await expect(details.getByText('dealer-document-sample.pdf')).toBeVisible();
  await expect(details.getByRole('status')).toHaveCount(0);
  await details.getByLabel('Document Label').fill('Dealer Permit Renewal');
  await details.getByLabel('Issuing State').selectOption('NV');
  await details.getByLabel('License Number').fill('DEMO-104');
  await expect(details.getByRole('button', { name: 'Upload', exact: true })).toBeEnabled();
  await captureBankrollPanel(page, details, info, 'dealer-vault-upload');
  await details.getByRole('button', { name: 'Close Document Details' }).click();
  await expect(details).toHaveCount(0);
  await expect(library.getByText('Nevada Dealer Permit')).toBeVisible();
  expect(writes).toBe(0);
});
