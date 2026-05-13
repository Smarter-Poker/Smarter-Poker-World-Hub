const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  console.log('Navigating to Midway Club Details page on PROD...');
  await page.goto('https://smarter.poker/hub/venues/046469d3-480b-42cd-8b35-c8c67db19ccb', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // Give SWR time to fetch and render
  const content = await page.content();
  if (content.includes('Midway')) {
    console.log('✅ Successfully found "Midway" in content!');
  } else {
    console.log('❌ Could not find "Midway" in content.');
  }
  if (content.includes('Bounty')) {
    console.log('✅ Successfully found "Bounty" in content!');
  } else {
    console.log('❌ Could not find "Bounty" in content.');
  }
  if (content.includes('PLO')) {
    console.log('✅ Successfully found "PLO" in content!');
  } else {
    console.log('❌ Could not find "PLO" in content.');
  }
  await browser.close();
})();
