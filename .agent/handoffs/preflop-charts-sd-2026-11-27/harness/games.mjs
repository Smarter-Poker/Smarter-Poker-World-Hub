import { chromium } from '/home/claude/smarter-poker-world-hub/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 393, height: 900 } });
p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0,200)));
const go = async (label) => { await p.goto('http://localhost:3000/hub/preflop-charts', { waitUntil: 'networkidle', timeout: 600000 }); await p.waitForTimeout(2000);
  await p.locator('.preflop-mode-card', { hasText: label }).click(); await p.locator('.preflop-launch-button').click(); await p.waitForTimeout(2500); };
// Pattern
await go('Pattern'); await p.locator('.preflop-sd-primary').click(); await p.waitForTimeout(800);
await p.screenshot({ path: 'g-pattern-play.png' });
for (let i=0;i<8;i++){ await p.locator('button', { hasText: 'Fold Range' }).click().catch(()=>{}); await p.waitForTimeout(500); if (i===0) await p.screenshot({ path: 'g-pattern-reveal.png' }); await p.locator('button', { hasText: /Next Question|View Results/ }).click().catch(()=>{}); await p.waitForTimeout(500); }
await p.waitForTimeout(1500); await p.evaluate(()=>scrollTo(0,0)); await p.screenshot({ path: 'g-pattern-result.png', fullPage: true });
// Speed
await go('Speed Drill'); await p.locator('.preflop-sd-primary').click(); await p.waitForTimeout(800); await p.screenshot({ path: 'g-speed-play.png' });
for (let i=0;i<12;i++){ const fold=p.locator('button', { hasText: /^1?FOLD$/ }); await p.keyboard.press('1').catch(()=>{}); await p.waitForTimeout(400); await p.locator('button', { hasText: /Next Hand|View Results/ }).click({timeout:1500}).catch(()=>{}); await p.waitForTimeout(400); if (await p.locator('text=Performance Grade').count()) break; }
await p.waitForTimeout(1500); await p.evaluate(()=>scrollTo(0,0)); await p.screenshot({ path: 'g-speed-result.png', fullPage: true });
// VS
await go('Local VS'); await p.locator('.preflop-sd-primary').click(); await p.waitForTimeout(1500); await p.screenshot({ path: 'g-vs-battle.png', fullPage: true });
for (let i=0;i<5;i++){ await p.locator('.preflop-sd-game button[style*="min-height: 52"]').first().click().catch(()=>{}); await p.waitForTimeout(600); if(i===0) await p.screenshot({ path: 'g-vs-reveal.png', fullPage: true }); await p.locator('button', { hasText: /Next Round|View Results/ }).click().catch(()=>{}); await p.waitForTimeout(800); }
await p.evaluate(()=>scrollTo(0,0)); await p.screenshot({ path: 'g-vs-result.png', fullPage: true });
await b.close();
