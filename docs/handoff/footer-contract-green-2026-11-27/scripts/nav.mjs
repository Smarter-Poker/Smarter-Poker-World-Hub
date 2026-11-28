import { chromium } from '/home/claude/trees/claude/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
const origin = 'https://smarter.poker';
await p.route('**/*', r => { const u = new URL(r.request().url()); if (u.pathname.startsWith('/rest/v1/')) return r.fulfill({ json: [] }); if (u.pathname.startsWith('/api/')) return r.fulfill({ json: {} }); if (u.origin === origin && r.request().method() === 'GET') return r.continue(); return r.abort(); });
const cdp = await ctx.newCDPSession(p);
await cdp.send('Page.enable');
cdp.on('Page.frameRequestedNavigation', e => console.log('REQUESTED', e.reason, e.disposition, e.url));
cdp.on('Page.frameScheduledNavigation', e => console.log('SCHEDULED', e.reason, e.url));
p.on('console', m => { if (/NAVTRACE/.test(m.text())) console.log(m.text().slice(0, 1500)); });
await p.addInitScript(() => {
  const trace = (k, u) => console.log('NAVTRACE ' + k + ' ' + u + '\n' + new Error().stack);
  const pd = Object.getOwnPropertyDescriptor(History.prototype, 'pushState');
  try { const loc = window.location; const a = loc.assign.bind(loc), rp = loc.replace.bind(loc); } catch {}
  window.addEventListener('beforeunload', () => console.log('NAVTRACE beforeunload ' + new Error().stack));
  document.addEventListener('click', e => console.log('NAVTRACE click ' + (e.target && e.target.outerHTML || '').slice(0,200)), true);
});
p.on('request', r => { if (r.isNavigationRequest()) console.log('NAVREQ', r.url()); });
await p.goto(origin + '/hub/bankroll-manager/export', { waitUntil: 'load' });
await p.waitForFunction(() => window.next?.router?.isReady);
await p.waitForTimeout(1500);
console.log('--- going offline');
await ctx.setOffline(true);
await p.waitForTimeout(6000);
console.log('url now', p.url(), await p.evaluate(() => document.title).catch(e => 'ERR ' + e.message));
await b.close();
