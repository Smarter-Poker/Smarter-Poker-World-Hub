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
  const destinationTitle = workspace.getByRole('navigation', { name: 'Toke Tracker Tools' }).getByText('Shift Tracker', { exact: true });
  expect(await destinationTitle.evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/Inter|sans-serif/i);
  for (const [slug, title] of [['shift', 'Shift Tracker'], ['analytics', 'Analytics'], ['venues', 'Venue Intel'], ['vault', 'Dealer Vault']]) {
    await workspace.getByRole('navigation', { name: 'Toke Tracker Tools' }).getByRole('link', { name: new RegExp(title) }).click();
    await expect(page).toHaveURL(new RegExp(home + '/' + slug + '$'));
    workspace = await review(page, title, 'toke-' + slug, info);
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
    await expect(page.locator('link[rel="preload"][as="image"][href="/default-avatar.png"]').first()).toBeAttached();
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
