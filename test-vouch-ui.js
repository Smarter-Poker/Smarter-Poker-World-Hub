const { chromium } = require('@playwright/test');

function resolveChromiumPath() {
  const { execSync } = require('child_process');
  try {
    const result = execSync(
      'find "$HOME/Library/Caches/ms-playwright" -name "Google Chrome for Testing" -type f 2>/dev/null | sort | tail -1',
      { encoding: 'utf-8', shell: true }
    ).trim();
    if (result) return result;
  } catch (e) { }
  return '/Users/smarter.poker/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: resolveChromiumPath() });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  try {
    await page.goto('https://smarter.poker/login');
    await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
    await page.fill('input[type="password"]', 'Bek454545!!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/hub**', { timeout: 15000 });

    await page.goto('https://smarter.poker/hub/home-games/the-midway-club');
    
    const vouchBtn = page.locator('#hgs-vouch-btn');
    await vouchBtn.waitFor({ state: 'visible', timeout: 15000 });

    console.log('Clicking Vouch button...');
    await vouchBtn.click();
    
    console.log('Waiting for network idle to let API finish...');
    await page.waitForTimeout(4000); 

    const countBtn = page.locator('.hgs-vouch-count-btn');
    if (await countBtn.count() > 0) {
      await countBtn.click();
      await page.waitForTimeout(1000);
      const modalText = await page.locator('.hgs-vouchers-modal').innerText();
      console.log('Modal text snippet:', modalText.slice(0, 100).replace(/\n/g, ' '));
    }
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await browser.close();
  }
})();
