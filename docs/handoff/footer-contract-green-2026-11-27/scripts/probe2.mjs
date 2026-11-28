import { chromium } from '/home/claude/trees/claude/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 393, height: 900 }, deviceScaleFactor: 3, serviceWorkers: 'block' })).newPage();
await p.goto(''+(process.env.BASE||'https://smarter.poker')+'/hub/diamond-store?tab=vip', { waitUntil: 'networkidle' }).catch(()=>{});
await p.waitForSelector('.sd-header-help img'); await p.waitForTimeout(800);
await p.keyboard.press('Tab'); await p.locator('.sd-header-help').first().focus();
console.log(await p.evaluate(() => { const el = document.querySelector('.sd-header-help'); const out = []; 
  for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch { continue; } 
    const walk = (rs) => { for (const r of rs) { if (r.cssRules) walk(r.cssRules); if (r.selectorText && r.style && r.style.borderRadius !== '' ) { try { if (el.matches(r.selectorText)) out.push((sh.href||'inline').split('/').pop().slice(0,40)+' | '+r.selectorText.slice(0,160)+' | '+r.style.borderRadius+(r.style.getPropertyPriority('border-radius')?' !important':'')); } catch {} } } }; walk(rules); }
  const a = getComputedStyle(el, '::after'); return { out, afterRadius: a.borderRadius, afterOp: a.opacity }; }));
const bb = await p.locator('.sd-header-help').first().boundingBox();
await p.screenshot({ path: 'store-focus.png', clip: { x: bb.x - 30, y: Math.max(0, bb.y - 20), width: 100, height: 90 } });
await b.close();
