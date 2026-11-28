// Live verification of the image-header "?" standard on smarter.poker.
// Usage: node check.mjs <baseURL> <outDir>
import { chromium } from '/home/claude/trees/claude/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const base = process.argv[2] || 'https://smarter.poker';
const out = process.argv[3] || '/home/claude/livecheck/shots';
fs.mkdirSync(out, { recursive: true });
const routes = ["/hub/bankroll-manager", "/hub/bankroll-manager?view=trips", "/hub/bankroll-manager?view=series", "/hub/bankroll-manager?view=players", "/hub/bankroll-manager?view=receipts", "/hub/bankroll-manager?view=staking", "/hub/bankroll-manager?view=toke-tracker", "/hub/bankroll-manager?view=tax", "/hub/bankroll-manager?view=staking-profile", "/hub/bankroll-manager?view=tournament-calendar", "/hub/bankroll-manager?view=reports", "/hub/bankroll-manager?view=settings", "/hub/bankroll-manager?view=rules", "/hub/bankroll-manager?view=goals", "/hub/bankroll-manager?type=cash", "/hub/bankroll-manager?type=tournament", "/hub/bankroll-manager?type=casino", "/hub/bankroll-manager?type=slots", "/hub/bankroll-manager?type=sports", "/hub/bankroll-manager?type=expense", "/hub/bankroll-manager/export", "/hub/toke-tracker", "/hub/toke-tracker/shift", "/hub/toke-tracker/analytics", "/hub/toke-tracker/vault", "/hub/toke-tracker/venues", "/hub/poker-tools", "/hub/memory-games", "/hub/memory-games/stats", "/hub/memory-games/leaderboard", "/hub/memory-games/achievements", "/hub/memory-games/tutorial", "/hub/training/icm-calculator", "/hub/training/hand-lab", "/hub/training/equity-calculator", "/hub/vip-membership/compare", "/hub/vip-membership/manage", "/hub/diamond-store?tab=vip"];
const widths = (process.env.WIDTHS || "393").split(",").map(Number);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const results = [];
for (const width of widths) {
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const bad = [];
    page.on('response', (r) => {
      const t = r.request().resourceType();
      if ((t === 'image' || t === 'stylesheet') && r.status() >= 400) bad.push(r.status() + ' ' + r.url());
    });
    let r = { route, width };
    try {
      await page.goto(base + route, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
      await page.waitForSelector('.sd-header-help img', { timeout: 45000 });
      await page.waitForTimeout(800);
      r = { ...r, ...(await page.evaluate(() => {
        const help = document.querySelector('.sd-header-help');
        const img = help.querySelector('img');
        const header = help.closest('header') || help.parentElement;
        const h = header.getBoundingClientRect(), i = img.getBoundingClientRect();
        const textQ = [...header.querySelectorAll('button,a,span')].filter((e) => e.children.length === 0 && e.textContent.trim() === '?').length;
        const backInside = [...header.querySelectorAll('a')].some((a) => /back to dashboard/i.test(a.textContent));
        const stack = header.closest('[data-header-stack]');
        const backAbove = stack ? !!stack.querySelector(':scope > .sd-header-back [data-header-back]') : null;
        const addBtn = [...document.querySelectorAll('button,a')].find((b) => /^add\s*\+?$/i.test(b.textContent.trim()));
        const hs = getComputedStyle(help);
        return {
          restShadow: hs.boxShadow, restRadius: hs.borderTopLeftRadius,
          src: new URL(img.currentSrc || img.src).pathname, loaded: img.naturalWidth > 0, iconW: Math.round(i.width),
          top: +(i.top - h.top).toFixed(1), right: +(h.right - i.right).toFixed(1),
          textQ, backInside, backAbove,
          addBg: addBtn ? getComputedStyle(addBtn).borderImageSource.match(/chrome-active[^"')]*/)?.[0] || 'n/a' : 'no Add +',
        };
      })) };
      await page.keyboard.press('Tab');
      await page.locator('.sd-header-help').first().focus();
      r.focusRing = await page.evaluate(() => {
        const el = document.querySelector('.sd-header-help');
        const st = getComputedStyle(el); return getComputedStyle(el, '::after').opacity === '1' && st.boxShadow === 'none' && (st.outlineStyle === 'none' || st.outlineWidth === '0px') && st.borderTopLeftRadius === '50%';
      });
      const name = `${width}-${route.replace(/[^a-z0-9]+/gi, '_')}.png`;
      await page.screenshot({ path: `${out}/${name}` });
      r.shot = name;
    } catch (e) { r.error = String(e.message).split('\n')[0]; }
    r.badAssets = bad;
    results.push(r);
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
