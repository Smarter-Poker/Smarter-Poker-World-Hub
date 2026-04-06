const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/hub/poker-near-me?tab=map', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'map_debug.png' });
  await browser.close();
})();
