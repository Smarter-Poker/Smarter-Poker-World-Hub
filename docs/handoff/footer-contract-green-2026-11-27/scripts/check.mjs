// Live verification of the image-header "?" standard on smarter.poker.
// Usage: node check.mjs <baseURL> <outDir>
import { chromium } from '/home/claude/trees/claude/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const base = process.argv[2] || 'https://smarter.poker';
const out = process.argv[3] || '/home/claude/livecheck/shots';
fs.mkdirSync(out, { recursive: true });
const routes = [
  '/hub/bankroll-manager?view=trips',
  '/hub/toke-tracker/shift',
  '/hub/bankroll-manager/export',
  '/hub/poker-tools',
  '/hub/vip-membership/compare',
  '/hub/training/hand-lab',
  '/hub/training/icm-calculator',
  '/hub/training/equity-calculator',
];
const widths = [393, 1280];
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
        return getComputedStyle(el, '::after').opacity === '1' && getComputedStyle(el).boxShadow === 'none';
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
