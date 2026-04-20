const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err));
  
  console.log('Navigating to poker-near-me/tours...');
  await page.goto('https://smarter.poker/hub/poker-near-me/tours', { waitUntil: 'networkidle' });
  
  console.log('Clicking the Events tab if needed...');
  // It should be on events tab. Let's wait for Tours grid
  await page.waitForTimeout(2000);
  
  console.log('Navigating to RGPS...');
  const rgpsLink = await page.$('a[href="/hub/tours/RGPS"], div:has-text("RunGood Poker Series")');
  if (rgpsLink) {
    await rgpsLink.click();
    await page.waitForTimeout(3000);
  } else {
    console.log('Could not find RGPS link');
    // Just force navigation
    await page.goto('https://smarter.poker/hub/tours/RGPS', { waitUntil: 'networkidle' });
  }

  console.log('Navigating BACK...');
  await page.goBack({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  const text = await page.textContent('.results-count').catch(()=>'not found');
  console.log('Results count after back:', text);
  
  const emptyState = await page.$('.empty-state');
  if (emptyState) {
     console.log('Empty state is VISIBLE');
  } else {
     console.log('Empty state is NOT visible');
  }

  await browser.close();
})();
