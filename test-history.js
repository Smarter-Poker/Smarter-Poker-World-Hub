const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('https://smarter.poker/hub', { waitUntil: 'networkidle' });
  await page.goto('https://smarter.poker/hub/poker-near-me/tours', { waitUntil: 'networkidle' });
  
  const historyState = await page.evaluate(() => window.history.state);
  console.log(historyState);
  
  await browser.close();
})();
