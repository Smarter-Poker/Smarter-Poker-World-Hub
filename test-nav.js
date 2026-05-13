const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  console.log('Navigating to Midway Club Details page...');
  await page.goto('http://localhost:3000/hub/venues/046469d3-480b-42cd-8b35-c8c67db19ccb', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const content = await page.content();
  if (content.includes('Midway')) {
    console.log('Successfully found "Midway" in content!');
  } else {
    console.log('Could not find "Midway" in content.');
  }
  await browser.close();
})();
