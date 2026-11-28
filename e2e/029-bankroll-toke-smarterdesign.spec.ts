import { verifyBankrollHeader } from './fixtures/verifyBankrollHeader';
import { captureBankrollPanel } from './fixtures/bankrollPanelCapture';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block', contextOptions: { reducedMotion: 'reduce' } });

// These are read-only guest paths. Intercept the ledger, vault, auth and API
// transports before navigation so no user, financial or document data is used.
test.beforeEach(async ({ page, baseURL, context }) => {
  await installRealtimeSessionGuard(context);
  const origin = new URL(baseURL!).origin;
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/rest/v1/')) {
      return route.fulfill({ json: request.headers().accept?.includes('vnd.pgrst.object') ? null : [] });
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
    if (url.origin === origin && request.method() === 'GET') return route.continue();
    return route.abort();
  });
});

async function checkInterior(root: Locator) {
  await expect(root).toBeVisible();
  const problems = await root.evaluate(element => {
    const failures: string[] = [];
    const viewport = document.documentElement.clientWidth;
    const meaningful = /[\p{L}\p{N}%$]/u;
    const seen = new Set<string>();
    const normalize = document.createElement('canvas').getContext('2d')!;
    function checkColor(value: string, label: string, channel: string) {
      if (!value || value === 'none' || value === 'transparent') return;
      normalize.fillStyle = '#000';
      normalize.fillStyle = value;
      const normalized = normalize.fillStyle;
      const hex = /^#([a-f0-9]{6})$/i.exec(normalized);
      const numbers = normalized.match(/[\d.]+/g);
      const rgb = hex ? [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)) : numbers?.map(Number);
      if (!rgb || rgb.length < 3 || rgb[3] === 0) return;
      const [r, g, b] = rgb;
      const maximum = Math.max(r, g, b);
      const chroma = maximum - Math.min(r, g, b);
      if (chroma < 12) return;
      let hue = maximum === r ? (g - b) / chroma : maximum === g ? 2 + (b - r) / chroma : 4 + (r - g) / chroma;
      hue = (hue * 60 + 360) % 360;
      if ((hue >= 20 && hue < 80) || (hue >= 250 && hue < 348)) {
        const entry = channel + ' ' + value + ' ' + label.slice(0, 70);
        if (!seen.has(entry)) failures.push(entry);
        seen.add(entry);
      }
    }
    const rect = element.getBoundingClientRect();
    if (rect.left < -1 || rect.right > viewport + 1) failures.push('Interior outside viewport');
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const target = node.parentElement;
      const label = node.textContent?.trim() || '';
      if (!target || !meaningful.test(label) || target.closest('style,script,[hidden]')) continue;
      if (target.namespaceURI === 'http://www.w3.org/2000/svg' && !target.closest('text,tspan')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const bounds = [...range.getClientRects()].filter(box => box.width && box.height);
      if (!bounds.length) continue;
      const css = getComputedStyle(target);
      if (css.visibility !== 'visible' || /material (icons|symbols)|font awesome/i.test(css.fontFamily)) continue;
      checkColor(css.color, label, 'text');
      checkColor(css.webkitTextFillColor, label, 'text-fill');
      if (target.closest('svg text')) checkColor(css.fill, label, 'chart fill');
      if (css.backgroundClip.includes('text')) {
        for (const stop of css.backgroundImage.match(/rgba?\([^)]+\)/g) || []) checkColor(stop, label, 'text gradient');
      }
      const control = target.closest('button,a');
      if (control && element.contains(control)) {
        const box = control.getBoundingClientRect();
        if (box.width && bounds.some(ink => ink.left < box.left - 2 || ink.right > box.right + 2)) {
          failures.push('Clipped control label: ' + label);
        }
      }
    }
    for (const input of element.querySelectorAll<HTMLInputElement>('input[placeholder],textarea[placeholder]')) {
      if (input.getClientRects().length && !input.value) {
        checkColor(getComputedStyle(input, '::placeholder').color, input.placeholder, 'placeholder');
      }
    }
    return failures;
  });
  expect(problems, 'Rendered text colors, control ink and viewport containment').toEqual([]);
}

async function review(page: Page, title: string, label: string, info: TestInfo) {
  const root = page.locator('.smarterdesign').filter({ has: page.getByRole('heading', { level: 1, name: title, exact: true }) }).first();
  await expect(root.locator('.sd-masthead h1')).toHaveText(title);
  await page.evaluate(() => document.fonts.ready);
  await checkInterior(root);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width || 0) + 1);
  if (info.project.use.isMobile) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const path = info.outputPath(label + '.png');
    await page.screenshot({ path, animations: 'disabled', style: 'nextjs-portal{display:none}' });
    await info.attach(label, { path, contentType: 'image/png' });
  }
  return root;
}

test('Bankroll dashboard, filters and export keep their real controls readable', async ({ page }, info) => {
  await page.goto('/hub/bankroll', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/hub\/bankroll-manager(?:[?#]|$)/);
  const owner = await review(page, 'Bankroll Manager', 'bankroll-dashboard', info);
  await owner.getByRole('button', { name: /All Time/ }).click();
  await owner.getByRole('button', { name: 'Last 7 Days', exact: true }).click();
  await expect(owner.getByRole('button', { name: /Last 7 Days/ })).toBeVisible();
  const add = owner.getByRole('button', { name: 'Add +', exact: true });
  await add.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Sign In Required' });
  await checkInterior(dialog);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/hub/bankroll-manager/export', { waitUntil: 'domcontentloaded' });
  const exports = await review(page, 'Export Data', 'bankroll-export', info);
  await expect(exports.getByRole('list', { name: 'Export Formats' }).getByRole('button')).toHaveCount(3);
});

test('Toke destinations retain readable navigation and an accessible tax sheet', async ({ page }, info) => {
  const home = '/hub/toke-tracker';
  await page.goto(home, { waitUntil: 'domcontentloaded' });
  let workspace = await review(page, 'Toke Tracker', 'toke-home', info);
  const returnHome = workspace.getByRole('link', { name: 'Back To Dashboard' });
  await expect(returnHome).toHaveAttribute('href', '/hub/bankroll-manager');
  const destinationTitle = workspace.getByRole('navigation', { name: 'Toke Tracker Tools' }).getByText('Shift Tracker', { exact: true });
  expect(await destinationTitle.evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/Inter|sans-serif/i);
  for (const [slug, title] of [['shift', 'Shift Tracker'], ['analytics', 'Analytics'], ['venues', 'Venue Intel'], ['vault', 'Dealer Vault']]) {
    await workspace.getByRole('navigation', { name: 'Toke Tracker Tools' }).getByRole('link', { name: new RegExp(title) }).click();
    await expect(page).toHaveURL(new RegExp(home + '/' + slug + '$'));
    workspace = await review(page, title, 'toke-' + slug, info);
    await workspace.getByRole('button', {name: 'Help For ' + title}).click();
    const help = page.getByRole('dialog', {name: title + ' Help'});
    await expect(help).toBeVisible();
    await help.getByRole('button', {name:'Close Help'}).click();
    await expect(help).toBeHidden();
    await expect(workspace.getByRole('link', {name:'Back To Dashboard'})).toHaveAttribute('href','/hub/bankroll-manager');
    await expect(workspace.getByRole('link', { name: title, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  // The guest workspace offers the annual tax sheet via its Taxes destination.
  // The inline annual report button is reserved for ledgers with completed gigs.
  await page.goto(home + '/vault?tab=tax', { waitUntil: 'domcontentloaded' });
  const tax = page.getByRole('dialog', { name: /Annual Tax Summary/ });
  await checkInterior(tax);
  await expect(tax.getByRole('button', { name: /Print/ })).toBeVisible();
  const close = tax.getByRole('button', { name: 'Close Tax Summary' });
  await close.focus();
  await page.keyboard.press('Enter');
  await expect(tax).toBeHidden();
});

// #3256: a category view's Add + now goes through the page's own gates
// (Bankroll Pro, starting bankroll), the same as the dashboard's Add +. A
// test that expects the log form to open has to be a Pro member whose
// bankroll is already initialised, or it correctly meets the gate instead.
async function installInitialisedProBankroll(page: Page, userId: string) {
  await page.route('**/api/vip/check-status?*', route => route.fulfill({ json: { isVip: true } }));
  await page.route('**/rest/v1/bankroll_segments*', route => route.fulfill({ json: [{
    user_id: userId, segment_type: 'poker', initial_deposit: 1000, current_balance: 1000,
  }] }));
}

async function installBankrollSession(page: Page) {
  const user = { id: '1ad77cca-ddcb-4000-9777-b1fdce8e7381', email: 'layout@example.invalid', role: 'authenticated', user_metadata: {} };
  await page.addInitScript(({ user }) => {
    const expires = Math.floor(Date.now() / 1000) + 86400;
    const payload = btoa(JSON.stringify({ sub: user.id, role: user.role, exp: expires })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    localStorage.setItem('smarter-poker-auth', JSON.stringify({
      access_token: 'e30.' + payload + '.localfixture', refresh_token: 'layout-fixture-only',
      token_type: 'bearer', expires_at: expires, expires_in: 86400, user,
    }));
    sessionStorage.setItem('sp_auth_confirmed', '1');
  }, { user });
  await page.route('**/auth/v1/user*', route => route.fulfill({ json: user }));
  return user;
}

test('Bankroll dashboard owns its launcher, popup actions and contextual Add controls', async ({ page }, info) => {
  await installBankrollSession(page);
  await page.route('**/api/vip/check-status?*', route => route.fulfill({ json: { isVip: true } }));
  await page.addInitScript(() => {
    localStorage.setItem('sp-filters-bankroll-manager', JSON.stringify({ __v: { activeSection: 'players' }, __exp: Date.now() + 60000 }));
  });
  await page.goto('/hub/bankroll-manager');
  const nav = page.getByRole('navigation', { name: 'Bankroll Manager Sections' });
  await expect(nav.getByRole('button')).toHaveCount(16);
  await expect(page.locator('[data-tutorial="insights"]')).toBeVisible();
  expect(await nav.evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('[data-tutorial="insights"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await nav.getByRole('button', { name: 'Adjust Bankroll' }).click();
  const adjust = page.getByRole('heading', { name: 'Adjust Bankroll' });
  await expect(adjust).toBeVisible();
  const editor = page.getByRole('dialog', {name:'Adjust Bankroll'});
  const centered = await editor.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return node.matches(':modal') && Math.abs(rect.top + rect.height / 2 - innerHeight / 2) < 3;
  });
  expect(centered).toBe(true);
  await captureBankrollPanel(page, editor, info, 'adjust-bankroll');
  await editor.getByRole('button', {name:'Withdraw',exact:true}).click();
  await editor.getByRole('textbox', {name:/Amount/}).fill('82.50');
  await expect(editor.getByRole('button', {name:'Withdraw From Bankroll'})).toBeEnabled();
  await page.getByRole('dialog', { name: 'Adjust Bankroll' }).getByRole('button', { name: 'Close Adjust Bankroll' }).click();
  await expect(adjust).toBeHidden();
  await expect(nav.getByRole('button')).toHaveCount(16);
  await nav.getByRole('button', { name: 'Player Notes' }).click();
  await expect(page).toHaveURL(/view=players/);
  await expect(nav).toHaveCount(0);
  const header = page.locator('.sd-masthead');
  await header.getByRole('button', { name: /Add .*Player Note/ }).click();
  await expect(page.getByRole('heading', { name: 'Add Player', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await header.getByRole('button', { name: 'Help For Player Notes' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  // Back To Dashboard sits above the image header, never inside it (Dan, 2026-11-27).
  await expect(header.getByRole('link', { name: 'Back To Dashboard' })).toHaveCount(0);
  await page.locator('[data-header-back]').click();
  await expect(nav.getByRole('button')).toHaveCount(16);
  await page.goto('/hub/bankroll-manager?view=obsolete-bookmark');
  await expect(nav.getByRole('button')).toHaveCount(16);
});

test('A bookmarked projection opens its popup and returns to the dashboard', async ({ page }) => {
  await installBankrollSession(page);
  await page.route('**/api/vip/check-status?*', route => route.fulfill({ json: { isVip: true } }));
  await page.goto('/hub/bankroll-manager?view=projection', { waitUntil: 'domcontentloaded' });
  const modal = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /Bankroll Projection/ }) });
  await expect(modal).toBeVisible({ timeout: 20000 });
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page).toHaveURL(/\/hub\/bankroll-manager$/);
  await expect(page.getByRole('navigation', { name: 'Bankroll Manager Sections' }).getByRole('button')).toHaveCount(16);
});

test('Tournament entry names its controls and keeps optional fields linked to their visible labels', async ({ page }) => {
  const user = await installBankrollSession(page);
  await page.route('**/api/vip/check-status?*', route => route.fulfill({ json: { isVip: true } }));
  await page.route('**/rest/v1/bankroll_segments*', route => route.fulfill({ json: [{
    user_id: user.id, segment_type: 'poker', initial_deposit: 1000, current_balance: 1000,
  }] }));
  await page.addInitScript(() => localStorage.setItem('bankroll_tutorial_seen_v1:prompt', '1'));
  await page.goto('/hub/bankroll-manager', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Add +', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tournaments', exact: true }).click();

  const form = page.getByRole('dialog', { name: 'Log Tournaments', exact: true });
  await expect(form).toBeVisible();
  const name = form.getByRole('textbox', { name: 'Tournament Name', exact: true });
  await form.getByText('Tournament Name', { exact: true }).click();
  await expect(name).toBeFocused();
  const type = form.getByRole('combobox', { name: 'Tournament Type', exact: true });
  await type.selectOption('mystery_bounty');
  await expect(form.getByRole('spinbutton', { name: 'Bounties Collected ($)', exact: true })).toBeVisible();
  await type.selectOption('satellite');
  await expect(form.getByRole('spinbutton', { name: 'Bounties Collected ($)', exact: true })).toHaveCount(0);

  const rebuys = form.getByRole('spinbutton', { name: 'Rebuys', exact: true });
  await form.getByRole('button', { name: 'Increase Rebuys', exact: true }).click();
  await expect(rebuys).toHaveValue('1');
  await form.getByRole('button', { name: 'Decrease Rebuys', exact: true }).click();
  await expect(rebuys).toHaveValue('0');
  for (const [section, field] of [['Swap Deductions', 'Player Name'], ['Staking Deductions', 'Staker Name'], ['Sold Action', 'Buyer Name']]) {
    const toggle = form.getByRole('button', { name: section, exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(form.getByLabel(field, { exact: true })).toBeVisible();
  }
  await expect(form.getByLabel('Location / Venue', { exact: true })).toBeVisible();
  for (const period of ['Start Time Period', 'End Time Period']) {
    await expect(form.getByRole('combobox', { name: period, exact: true })).toBeVisible();
  }
  for (const field of await form.locator('input:visible,select:visible,textarea:visible').all()) {
    await expect(field).toHaveAccessibleName(/\S/);
  }
  await form.getByRole('button', { name: 'Back', exact: true }).click();
  const categories = page.getByRole('dialog', { name: 'Log Session', exact: true });
  await categories.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(categories).toHaveCount(0);
});

test('Tournament entry records the entered buy-in and applies each bounty once across edits', async ({ page }) => {
  const user = await installBankrollSession(page);
  await installInitialisedProBankroll(page, user.id);
  await page.addInitScript(() => localStorage.setItem('bankroll_tutorial_seen_v1:prompt', '1'));
  const id = '84159925-e03a-4bf0-bbac-5041cb551b10';
  let saved: Record<string, unknown> | undefined;
  const writes: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/bankroll_ledger*', async route => {
    const request = route.request();
    if (request.method() === 'POST' || request.method() === 'PATCH') {
      const data = request.postDataJSON();
      if (request.method() === 'POST') expect(data.user_id).toBe(user.id);
      else {
        const params = new URL(request.url()).searchParams;
        expect(params.get('id')).toBe('eq.' + id);
        expect(params.get('user_id')).toBe('eq.' + user.id);
      }
      writes.push(data);
      saved = { ...saved, ...data, id, user_id: user.id };
      await route.fulfill({ json: saved });
    } else {
      await route.fulfill({ json: saved ? [saved] : [] });
    }
  });
  await page.goto('/hub/bankroll-manager?type=tournament', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Add + · Log Category Entry' }).click();
  const form = page.getByRole('dialog', { name: 'Log Tournaments' });
  await form.getByLabel('Tournament Name', { exact: true }).fill('Fixture Bounty');
  const personalNotes = 'Keep this hand history.\nBounties: $999 was my previous event.';
  await form.getByLabel('Session Notes', { exact: true }).fill(personalNotes);
  await form.getByLabel('Buy-In ($)', { exact: true }).fill('100');
  await form.getByLabel('Cash-Out ($)', { exact: true }).fill('250');
  await form.getByRole('button', { name: 'Increase Rebuys' }).click();
  await form.getByLabel('Add-On ($)', { exact: true }).fill('5');
  await form.getByLabel('Tournament Type', { exact: true }).selectOption('pko');
  await form.getByLabel('Bounties Collected ($)', { exact: true }).fill('20');
  await expect(form.getByText('Total Buy-In:')).toContainText('$205');
  await expect(form.getByText('Net: +$65', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: 'Log Entry', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({
    category: 'poker_mtt', buy_in_amount: 100, reentry_count: 1, add_on_amount: 5,
    gross_in: 205, gross_out: 270, bounties_collected: 20,
  });
  for (const [bounty, payout] of [[20, 270], [30, 280]]) {
    await page.getByRole('button', { name: 'Entry Actions' }).click();
    await page.getByRole('button', { name: /Edit/ }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Tournaments' });
    await expect(edit.getByLabel('Buy-In ($)', { exact: true })).toHaveValue('100');
    await edit.getByLabel('Bounties Collected ($)', { exact: true }).fill(String(bounty));
    await edit.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect(edit).toHaveCount(0);
    expect(writes.at(-1)).toMatchObject({
      buy_in_amount: 100, gross_in: 205, gross_out: payout, bounties_collected: bounty,
      notes: personalNotes + '\nRebuys: 1 (Total Buy-In: $205) | Add-On: $5 | Bounties: $' + bounty,
    });
  }
});

test('Bankroll entry screens open their own real form from the masthead', async ({ page }) => {
  const user = await installBankrollSession(page);
  await installInitialisedProBankroll(page, user.id);
  const cases = [
    ['view=trips', 'Trip Tracker', 'Start A New Trip', 'New Trip'],
    ['view=series', 'Series Tracker', 'Start A New Series', 'New Series'],
    ['view=staking', 'Staking Tracker', 'New Staking Deal', 'New Staking Arrangement'],
    ['type=cash', 'Cash Games', 'Log Category Entry', 'Log Cash Games'],
    ['view=receipts', 'Saved Receipts', 'Scan Receipt', 'Scan Receipt'],
  ];
  for (const [query, title, action, form] of cases) {
    await page.goto('/hub/bankroll-manager?' + query, { waitUntil: 'domcontentloaded' });
    const header = page.locator('.sd-masthead').filter({ has: page.getByRole('heading', { name: title, level: 1, exact: true }) });
    await expect(header.getByRole('link', { name: 'Back To Dashboard' })).toHaveCount(0);
    await expect(page.locator('[data-header-stack] > .sd-header-back + header.sd-masthead')).toHaveCount(1);
    await expect(page.locator('[data-header-back]')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Bankroll Manager Sections' })).toHaveCount(0);
    await header.getByRole('button', { name: 'Add + · ' + action }).click();
    await expect(page.getByRole('heading', { name: form, exact: true })).toBeVisible();
  }
  await page.goto('/hub/bankroll-manager?view=advanced-tax', { waitUntil: 'domcontentloaded' });
  const header = page.locator('.sd-masthead');
  await expect(header.getByRole('heading', { name: 'Tax Reports', exact: true })).toBeVisible();
  await header.getByRole('button', { name: 'Add + · Upload W-2G' }).click();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
});

test('Reports count filtered ledger sessions across pages and preserve signed currency', async ({ page }) => {
  const user = await installBankrollSession(page);
  const rows = Array.from({ length: 501 }, (_, i) => ({
    id: 'fixture-' + i, user_id: user.id, category: 'poker_cash', is_revision: false, entry_date: '2026-10-10',
    gross_in: 20, gross_out: 20, net_result: i === 500 ? -125.25 : 0,
  }));
  const offsets: number[] = [];
  await page.route('**/rest/v1/bankroll_ledger*', route => {
    const request = route.request();
    const q = new URL(request.url()).searchParams;
    if (request.method() === 'GET' && q.get('limit') === '500' && q.get('select')?.includes('bankroll_locations')) {
      const offset = Number(q.get('offset') || 0);
      offsets.push(offset);
      return route.fulfill({ json: rows.slice(offset, offset + 500) });
    }
    return route.fallback();
  });
  await page.goto('/hub/bankroll-manager?view=reports');
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Bankroll Manager Sections' })).toHaveCount(0);
  const metrics = page.locator('dl').filter({ hasText: 'Total Sessions' });
  await expect(metrics.locator('dd')).toHaveText(['501', '0%', '-$125.25', '-$0.25']);
  expect(offsets).toContain(500);
  await page.goto('/hub/bankroll-manager/export');
  await page.getByRole('link', { name: 'Back To Dashboard' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bankroll Manager' })).toBeVisible();
});

test('Section help can start the dashboard tutorial', async ({ page }) => {
  await page.goto('/hub/bankroll-manager?view=players', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Help For Player Notes' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Page Tutorial' }).click();
  await expect(page).toHaveURL(/\/hub\/bankroll-manager$/);
  await expect(page.locator('[data-tutorial-open="true"]')).toBeVisible();
});

test('An unavailable Reports ledger offers retry without showing an empty balance', async ({ page }) => {
  await installBankrollSession(page);
  let unavailable = true;
  await page.route('**/rest/v1/bankroll_ledger*', route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('limit') === '500' && params.get('select')?.includes('bankroll_locations') && unavailable) {
      return route.fulfill({ status: 403, json: { code: '42501', message: 'Fixture Read Unavailable' } });
    }
    return route.fallback();
  });
  await page.goto('/hub/bankroll-manager?view=reports', { waitUntil: 'domcontentloaded' });
  const warning = page.getByRole('alert').filter({ hasText: 'Could Not Refresh Reports' });
  await expect(warning).toBeVisible({ timeout: 15000 });
  const metrics = page.locator('dl').filter({ hasText: 'Total Sessions' });
  await expect(metrics).toHaveCount(0);
  unavailable = false;
  await warning.getByRole('button', { name: 'Retry' }).click();
  await expect(metrics.locator('dd')).toHaveText(['0', '0%', '$0.00', '$0.00']);
  await expect(warning).toHaveCount(0);
});

test('Dealer Vault announces its stored document count for empty, singular and plural inventories', async ({ page }) => {
  const user = await installBankrollSession(page);
  const documents = [1, 2, 3].map(id => ({ id: String(id), category: 'other', label: 'Fixture ' + id }));
  let count = 0;
  await page.route('**/rest/v1/dealer_documents*', route => {
    const request = route.request();
    if (request.method() !== 'GET' || new URL(request.url()).searchParams.get('user_id') !== 'eq.' + user.id) return route.abort();
    return route.fulfill({ json: documents.slice(0, count) });
  });
  for (const [total, caption] of [[0, '0 Documents Stored'], [1, '1 Document Stored'], [3, '3 Documents Stored']] as const) {
    count = total;
    await page.goto('/hub/toke-tracker/vault', { waitUntil: 'domcontentloaded' });
    const disclosure = page.getByRole('button', { name: /^Documents / });
    await expect(disclosure).toHaveAccessibleName(new RegExp('^Documents ' + caption + '(?: |$)'));
    await expect(disclosure.getByText(caption, { exact: true })).toHaveText(caption, { useInnerText: true });
  }
});

test('A named completed trip wraps and opens its matching report from the keyboard', async ({ page }) => {
  const user = await installBankrollSession(page);
  const trip = {
    id: '33e5a310-b179-47f9-b012-626f52ea10fd', user_id: user.id,
    name: 'International Poker Championship Road Trip With The Team',
    status: 'completed', trip_type: 'trip', start_date: '2026-10-03', end_date: '2026-10-09',
    bankroll_locations: { name: 'Northern Championship Convention Center And Resort' },
  };
  await page.route('**/rest/v1/bankroll_trips*', route => {
    const parameters = new URL(route.request().url()).searchParams;
    if (route.request().method() !== 'GET' || parameters.get('user_id') !== 'eq.' + user.id) return route.abort();
    return route.fulfill({ json: parameters.get('status') === 'eq.active' ? [] : [trip] });
  });
  await page.goto('/hub/bankroll-manager?view=trips', { waitUntil: 'domcontentloaded' });
  const root = page.locator('.bankroll-page');
  const summary = root.getByText(trip.name, { exact: true });
  await expect(summary).toBeVisible();
  const opener = root.getByRole('button', { name: new RegExp(trip.name) });
  await expect(opener).toBeVisible();
  await checkInterior(root);
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(root.getByRole('heading', { name: trip.name, level: 2 })).toBeVisible();
  await checkInterior(root);
  await root.getByRole('button', { name: /Back To Trip Tracker/ }).click();
  await expect(opener).toBeVisible();
});

for (const format of ['CSV', 'JSON', 'PDF']) {
  test('Standalone ' + format + ' export explains offline access without starting a request', async ({ page, context }) => {
    await installBankrollSession(page);
    const requests: string[] = [];
    const downloads: string[] = [];
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path === '/api/bankroll/export' || path === '/api/bankroll/export-pdf') requests.push(path);
    });
    page.on('download', download => downloads.push(download.suggestedFilename()));
    await page.goto('/hub/bankroll-manager/export', { waitUntil: 'load' });
    // The server already renders the buttons. Wait for the client route and
    // the header's post-mount avatar signal before disconnecting the browser.
    await page.waitForFunction(() => {
      const app = window as Window & { next?: { router?: { isReady: boolean; pathname: string } } };
      return app.next?.router?.isReady && app.next.router.pathname === '/hub/bankroll-manager/export';
    });
    // #3252 seats a hashed 192px derivative of the default portrait
    // (HEADER_DEFAULT_AVATAR in UniversalHeader.js), so match the family, not
    // one file name: the signal is that the mounted header preloaded it.
    await expect(page.locator('link[rel="preload"][as="image"][href*="default-avatar"]').first()).toBeAttached();
    const button = page.getByRole('button', { name: 'Export ' + format, exact: true });
    await expect(button).toBeVisible();
    await context.setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await button.click();
    await expect.soft(page.getByText('You Are Offline. Try Again When Connected.', { exact: true })).toBeVisible();
    expect(requests, 'No export request should start while offline').toEqual([]);
    expect(downloads).toEqual([]);
  });
}

test('Ledger chart modes, venue ordering, history and staking privacy use the displayed records', async ({page}, info) => {
  const user = await installBankrollSession(page);
  await page.addInitScript(()=>localStorage.setItem('bankroll_tutorial_seen_v1:prompt','1'));
  const dates = [4, 3, 1].map(offset => new Date(Date.now() - offset * 86400000).toISOString().slice(0,10));
  const rows = dates.map((entry_date, i) => ({
    id:'sample-'+i, user_id:user.id, entry_date, category:i===2?'poker_mtt':'poker_cash',
    gross_in:20, gross_out:[8.5,27.25,39.5][i], net_result:[-11.5,7.25,19.5][i],
    location_id:i===2?'summit':'river', bankroll_locations:{name:i===2?'Summit Room':'River Room'},
    start_time:entry_date+'T12:00:00Z',end_time:entry_date+'T14:00:00Z',is_revision:false,
  }));
  await page.route('**/rest/v1/bankroll_ledger*', route => {
    const q = new URL(route.request().url()).searchParams;
    return q.get('select')?.includes('bankroll_locations') ? route.fulfill({json:rows}) : route.fallback();
  });
  await page.route('**/rest/v1/profiles*', route => {
    const profile = {id:user.id, username:'FixtureDealer', is_vip:true};
    return route.fulfill({json:route.request().headers().accept?.includes('vnd.pgrst.object')?profile:[profile]});
  });
  await page.route('**/api/vip/check-status?*', route=>route.fulfill({json:{isVip:true}}));
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
    writeText:async (value:string)=>{sessionStorage.setItem('captured-copy',value);}
  }}));
  await page.goto('/hub/bankroll-manager');
  const trend = page.getByRole('region',{name:'Bankroll Trend'});
  await expect(trend).toContainText('+$15.25');
  await expect(trend.locator('.recharts-area-curve')).toBeVisible();
  const shots = (locator:Locator,name:string) => captureBankrollPanel(page,locator,info,name);
  await shots(trend,'ledger-trend');
  let previous='Line Chart';
  for(const [next, painted] of [
    ['Bar Chart','.recharts-bar-rectangle path'],['Stacked Bar','.recharts-bar-rectangle path'],
    ['Histogram','.recharts-bar-rectangle path'],['Donut Chart','.recharts-pie-sector path'],['Heatmap','button[aria-pressed]']
  ]){
    await page.getByRole('button',{name:new RegExp('^'+previous)}).first().click();
    await page.getByRole('button',{name:next,exact:true}).click();
    await expect(trend.locator(painted).first()).toBeVisible();
    await trend.getByText('View Chart Data',{exact:true}).click();
    await expect(trend.locator('.sp-rtable')).toBeVisible();
    await trend.getByText('View Chart Data',{exact:true}).click();
    previous=next;
  }
  const venue=page.getByRole('region',{name:'Venue Analytics'});
  await expect(venue.getByRole('listitem').first()).toContainText('Summit Room');
  await venue.getByRole('button',{name:'Sessions'}).click();
  await expect(venue.getByRole('listitem').first()).toContainText('River Room');
  await expect(page.getByRole('region',{name:'Variance Analysis'})).toContainText('3 With Recorded Hours');
  const history=page.getByRole('region',{name:'Historical Comparison'});
  await history.getByRole('button',{name:'Year'}).click();
  await expect(history).toContainText('+$15.25');
  await shots(page.locator('[data-tutorial="analytics"]'),'analytics-grid');
  await page.goto('/hub/bankroll-manager?view=staking-profile');
  const profile=page.getByRole('region',{name:'Staking Profile Card'});
  await expect(profile.getByRole('img',{name:'Running Net Across Recorded Sessions'})).toBeVisible();
  await shots(profile,'staking-profile');
  await profile.getByRole('button',{name:'Net Result',exact:true}).click();
  await profile.getByRole('button',{name:'Result Trend',exact:true}).click();
  await profile.getByRole('button',{name:'Copy Stats Card'}).click();
  await expect(profile.getByRole('status')).toHaveText('Selected Stats Card Copied.');
  const copy=await page.evaluate(()=>sessionStorage.getItem('captured-copy'));
  expect(copy).toContain('Sessions: 3'); expect(copy).not.toContain('Net Result'); expect(copy).not.toContain('Result Trend');
  await page.reload();
  await expect(profile.getByRole('button',{name:'Net Result',exact:true})).toHaveAttribute('aria-pressed','false');
  await profile.getByRole('button',{name:'Copy Public Profile Link'}).click();
  await expect(profile.getByRole('status')).toHaveText('Public Profile Link Copied.');
  expect(await page.evaluate(()=>sessionStorage.getItem('captured-copy'))).toMatch(/\/u\/FixtureDealer$/);
  await profile.getByRole('button',{name:'Close Staking Profile'}).click();
  await expect(page.getByRole('heading',{name:'Bankroll Manager',exact:true})).toBeVisible();
});

test('Jarvis Insights opens the owner report and recalculates the selected ledger window', async ({ page }, info) => {
  const { analyzeSessionRecords, analysisWindow } = await import('../src/lib/bankroll/sessionInsights.mjs');
  await installBankrollSession(page);
  await page.route('**/api/vip/check-status?*', route => route.fulfill({ json: { isVip: true } }));
  const requests: number[] = [];
  await page.route('**/api/jarvis/bankroll-analysis', route => {
    const { days } = route.request().postDataJSON();
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    requests.push(days);
    const rows = [
      { category: 'poker_cash', entry_date: '2026-05-30', net_result: 42.50, start_time: '2026-05-30T10:00:00Z', end_time: '2026-05-30T12:00:00Z' },
      { category: 'poker_mtt', entry_date: '2026-05-01', net_result: -12 },
    ];
    const insights = analyzeSessionRecords(rows, analysisWindow(days, new Date('2026-05-31T18:00:00Z')));
    return route.fulfill({ json: { success: true, insights } });
  });
  await page.goto('/hub/bankroll-manager');
  const launch = page.getByRole('button', { name: /Jarvis Insights/ });
  await launch.click();
  const dialog = page.getByRole('dialog', {name:'Jarvis Insights'});
  await expect(dialog.getByRole('button',{name:'90 Days'})).toHaveAttribute('aria-pressed','true');
  await verifyBankrollHeader(page,dialog.locator('[data-header-art]'),'Jarvis Insights','jarvis',info);
  await expect(dialog.locator('.sd-metric').filter({hasText:'Session Net'})).toContainText('$30.50');
  await expect(dialog.getByRole('heading',{name:'Results By Format'})).toBeVisible();
  expect(await dialog.evaluate(el => el.matches(':modal'))).toBe(true);
  const close = dialog.getByRole('button',{name:'Close Jarvis Insights'});
  expect(await close.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
  const image = info.outputPath('jarvis-ledger-results.png');
  await page.screenshot({path: image});
  await info.attach('jarvis-ledger-results', {path: image, contentType:'image/png'});
  await dialog.getByRole('button',{name:'7 Days'}).click();
  await expect(dialog.getByText('May 25, 2026 To May 31, 2026')).toBeVisible();
  await expect(dialog.locator('.sd-metric').filter({hasText:'Session Net'})).toContainText('$42.50');
  await expect(dialog.locator('.sd-metric').filter({hasText:'Net Per Hour'})).toContainText('$21.25');
  await dialog.getByText('How These Figures Are Calculated',{exact:true}).click();
  await expect(dialog.getByText(/superseded entries/i)).toBeVisible();
  await dialog.getByRole('button',{name:'Refresh Analysis'}).click();
  await expect.poll(() => requests).toEqual([90,7,7]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(launch).toBeFocused();
});

test('Dealer Vault places document actions in the header, keeps categories and exposes real files', async ({page}, info) => {
  const user = await installBankrollSession(page);
  const doc = { id: 'fa632919-1035-418b-aa61-ff27f3580b04', user_id: user.id, label: 'Fixture License', category: 'gaming_license', file_url: 'https://example.invalid/fixture.pdf', created_at: '2026-04-15' };
  await page.route('**/rest/v1/dealer_documents*', route => route.fulfill({json:[doc]}));
  await page.goto('/hub/toke-tracker/vault');
  const workspace = await review(page,'Dealer Vault','vault-library',info);
  await expect(workspace.getByRole('button',{name:'Delete Fixture License'})).toBeVisible();
  const select = page.waitForEvent('filechooser');
  await workspace.getByRole('button',{name:'Add + · Upload Document',exact:true}).click();
  expect((await select).isMultiple()).toBe(false);
  await workspace.getByRole('button',{name:'Pay Stubs',exact:true}).click();
  await expect(workspace.getByRole('button',{name:'Pay Stubs',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(workspace.getByText('No Pay Stubs Uploaded Yet')).toBeVisible();
  await workspace.getByRole('link',{name:'Back To Dashboard'}).click();
  await expect(page.getByRole('heading',{level:1,name:'Bankroll Manager'})).toBeVisible();
});

test('State Tax Report switches periods, recalculates its visible estimate and exports the selected year', async ({page}, info) => {
  await installBankrollSession(page);
  await page.route('**/api/vip/check-status?*', route => route.fulfill({json:{isVip:true}}));
  await page.goto('/hub/bankroll-manager?view=tax');
  const report = page.getByRole('region',{name:'State Tax Report'});
  await expect(report).toBeVisible();
  const year = report.getByLabel('Tax Year');
  const previous = String(Number(await year.inputValue()) - 1);
  await year.selectOption(previous);
  await report.getByLabel('Jurisdiction').selectOption('IL');
  await report.getByText('Itemized Deductions',{exact:true}).click();
  await report.getByLabel('Travel & Lodging',{exact:true}).fill('82.50');
  await expect(report.getByText('-$82.50',{exact:true})).toBeVisible();
  await report.getByText('Itemized Deductions',{exact:true}).click();
  await expect(report.getByRole('table',{name:'Quarterly Results ' + previous}).getByRole('row')).toHaveCount(5);
  await captureBankrollPanel(page, report, info, 'bankroll-tax-report');
  const download = page.waitForEvent('download');
  await report.getByRole('button',{name:'Export Tax Report',exact:true}).click();
  expect((await download).suggestedFilename()).toBe('poker-tax-report-' + previous + '-IL.txt');
});

const bankrollHeaders = [
  ['Bankroll Manager','bankroll',''], ['Trip Tracker','trips','?view=trips'], ['Series Tracker','series','?view=series'],
  ['Player Notes','players','?view=players'], ['Saved Receipts','receipts','?view=receipts'], ['Staking Tracker','staking','?view=staking'],
  ['Tax Reports','tax','?view=tax'], ['Staking Profile','staking-profile','?view=staking-profile'],
  ['Tournament Calendar','tournament-calendar','?view=tournament-calendar'], ['Reports','reports','?view=reports'],
  ['Bankroll Rules','rules','?view=rules'], ['Bankroll Goals','goals','?view=goals'], ['Settings','settings','?view=settings'],
  ['Export Data','export','/export'], ['Cash Games','poker_cash','?type=cash'], ['Tournaments','poker_mtt','?type=tournament'],
  ['Table Games','casino_table','?type=casino'], ['Slots','slots','?type=slots'], ['Sports Betting','sports','?type=sports'],
  ['Expenses','expense','?type=expense'],
];
const dealerHeaders = [
  ['Toke Tracker','toke-home',''],['Shift Tracker','toke-shift','/shift'],['Analytics','toke-analytics','/analytics'],
  ['Dealer Vault','toke-vault','/vault'],['Venue Intel','toke-venues','/venues'],
];
for (const [base, headers] of [
  ['/hub/bankroll-manager', bankrollHeaders],
  ['/hub/toke-tracker', dealerHeaders],
] as const) {
  for (const [title, art, suffix] of headers) {
    test(title + ' renders its Cashier-standard title and keyboard Help', async ({ page }, info) => {
      await installBankrollSession(page);
      await page.addInitScript(() => localStorage.setItem('bankroll_tutorial_seen_v1:prompt', '1'));
      await page.goto(base + suffix, { waitUntil: 'domcontentloaded' });
      await verifyBankrollHeader(page, page.locator('header.sd-masthead').first(), title, art, info);
    });
  }
}
