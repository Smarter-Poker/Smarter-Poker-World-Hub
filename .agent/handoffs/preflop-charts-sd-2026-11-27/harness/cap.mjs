import { chromium } from '/home/claude/smarter-poker-world-hub/node_modules/playwright/index.mjs';
const [,, url, out, width='393', clickSel] = process.argv;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: +width, height: 900 }, deviceScaleFactor: 1 });
p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0,200)));
await p.goto(url, { waitUntil: 'networkidle', timeout: 600000 }).catch(e=>console.log('goto',e.message));
await p.waitForTimeout(4000);
if (clickSel) { for (const s of clickSel.split('||')) { try { await p.locator(s).first().click({timeout:8000}); await p.waitForTimeout(1500);} catch(e){console.log('click fail',s)} } }
await p.screenshot({ path: out, fullPage: true });
await b.close();
