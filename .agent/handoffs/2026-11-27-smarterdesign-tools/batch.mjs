// Usage: node batch.mjs <outdir> <routesFile> [width] [base]
// Signed-in stub session, Supabase aborted, viewport screenshot + audit per route.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire('/home/claude/smarter-poker-world-hub/package.json');
const { chromium } = require('playwright');

const [outdir, routesFile, widthArg, baseArg] = process.argv.slice(2);
const width = Number(widthArg || 393);
const base = baseArg || 'http://localhost:3100';
fs.mkdirSync(outdir, { recursive: true });
const routes = fs.readFileSync(routesFile, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const reportPath = path.join(outdir, 'report.json');
const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : {};

const now = Math.floor(Date.now() / 1000);
const fakeSession = {
  access_token: 'stub', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'stub',
  user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'stub@example.test',
    user_metadata: { username: 'StubPlayer' }, app_metadata: {}, created_at: new Date().toISOString() },
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
});
const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 852 : 900 }, deviceScaleFactor: width < 600 ? 2 : 1 });
await ctx.addInitScript((s) => { try { localStorage.setItem('smarter-poker-auth', JSON.stringify(s)); } catch {} }, fakeSession);
await ctx.route(/supabase\.co/, r => r.abort());
await ctx.route(/googletagmanager|google-analytics|vercel-insights|vitals/, r => r.abort());

for (const route of routes) {
  const name = route.replace(/^\/hub\//, '').replace(/\//g, '_') || 'hub';
  if (report[route]?.ok) continue;
  const page = await ctx.newPage();
  try {
    await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(3500);
    const audit = await page.evaluate(() => {
      const forbidden = (rgb) => {
        const m = rgb.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
        if (!m) return false;
        const [r, g, b, a] = [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
        if (a < 0.35) return false;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max - min < 50) return false;
        let h; const d = max - min;
        if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
        return (h >= 30 && h <= 65 && r > 150) || (h >= 255 && h <= 340);
      };
      const bad = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const t = walker.currentNode.textContent.trim();
        if (!t) continue;
        const el = walker.currentNode.parentElement;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (forbidden(cs.color)) bad.push(`${t.slice(0, 40)} [${cs.color}]`);
      }
      const head = document.querySelector('[data-header-art]');
      const helpImg = document.querySelector('img[src*="help-chrome"], img[src*="header-help"]');
      let helpGap = null;
      if (head && helpImg) {
        const h = head.getBoundingClientRect(), i = helpImg.getBoundingClientRect();
        helpGap = { top: Math.round(i.top - h.top), right: Math.round(h.right - i.right) };
      }
      const backs = [...document.querySelectorAll('a,button')].filter(e => /back/i.test(e.textContent || ''));
      const backInside = head ? backs.some(b => head.contains(b)) : false;
      const backAbove = head ? backs.some(b => !head.contains(b) && b.getBoundingClientRect().bottom <= head.getBoundingClientRect().top + 2) : false;
      const h1s = [...document.querySelectorAll('h1')].map(h => h.textContent.trim());
      const wrongHelp = [...document.querySelectorAll('button')].filter(b => /^\?$/.test((b.textContent || '').trim())).length;
      return {
        header: !!head, art: head?.getAttribute('data-header-art') || null, help: !!helpImg, helpGap,
        backInside, backAbove, h1s, wrongHelp, bad: [...new Set(bad)].slice(0, 12),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    await page.screenshot({ path: path.join(outdir, name + '.png') });
    report[route] = { ok: true, name, ...audit };
    console.log('OK', route, JSON.stringify(audit).slice(0, 220));
  } catch (e) {
    report[route] = { ok: false, name, error: String(e).slice(0, 200) };
    console.log('FAIL', route, String(e).slice(0, 120));
  } finally {
    await page.close();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 1));
  }
}
await browser.close();
