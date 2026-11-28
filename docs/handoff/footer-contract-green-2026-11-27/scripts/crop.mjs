import { chromium } from '/home/claude/trees/claude/node_modules/playwright/index.mjs';
const [base, route, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 393, height: 900 }, deviceScaleFactor: 3, serviceWorkers: 'block' })).newPage();
await p.goto(base + route, { waitUntil: 'networkidle', timeout: 90000 }).catch(()=>{});
await p.waitForSelector('.sd-header-help img'); await p.waitForTimeout(800);
const hb = await p.locator('.sd-header-help').first().evaluate(e => { const h = (e.closest('header')||e.parentElement).getBoundingClientRect(); return { x: h.right - 140, y: h.top, w: 140, h: Math.min(110, h.height) }; });
await p.screenshot({ path: out, clip: { x: hb.x, y: hb.y, width: hb.w, height: hb.h } });
await b.close();
