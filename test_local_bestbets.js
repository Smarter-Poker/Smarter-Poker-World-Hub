const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1080 }
  });
  const page = await context.newPage();
  
  console.log('Logging in...');
  await page.goto('http://localhost:3000/auth/login');
  await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
  await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
  
  await page.waitForNavigation({ waitUntil: 'networkidle' });
  
  console.log('Navigating to Best Bets...');
  await page.goto('http://localhost:3000/hub/MLB-ANALYTICS/best-bets', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Wait for the carousels to load
  await page.waitForTimeout(5000);
  
  console.log('Taking screenshot...');
  await page.screenshot({ path: '/Users/smarter.poker/.gemini/antigravity/brain/0454c0bb-f4eb-4332-9df3-f26de1ed85fc/media_local.png', fullPage: true });
  
  await browser.close();
  console.log('Done.');
})();
