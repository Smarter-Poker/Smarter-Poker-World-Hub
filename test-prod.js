const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  console.log('Navigating to Midway Club Details page on PROD...');
  await page.goto('https://smarter.poker/hub/venues/046469d3-480b-42cd-8b35-c8c67db19ccb', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // Give SWR time to fetch and render
  const content = await page.content();
  const fs = require('fs');
  fs.writeFileSync('page.html', content);
  console.log('Saved page.html');
  await browser.close();
})();
