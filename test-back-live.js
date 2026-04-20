const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Navigating to poker-tours...');
  await page.goto('https://smarter.poker/hub/poker-tours', { waitUntil: 'domcontentloaded' });
  
  // Try to click MSPT or any tour card
  console.log('Finding MSPT card...');
  const card = await page.locator('text="Mid-States Poker Tour"').first();
  await card.click();
  
  // Wait for it to navigate
  await page.waitForTimeout(3000);
  console.log('Current URL should be MSPT: ', page.url());
  
  // Click Universal Header Back button
  const backBtn = await page.locator('.header-nav-btn, button:has(img[src*="back"]), button:has-text("BACK")').first();
  await backBtn.click();
  
  await page.waitForTimeout(3000);
  console.log('Current URL after back button: ', page.url());
  
  if (page.url().includes('poker-near-me')) {
     console.log('FAILED! It went to the weird page instead of going back!');
  } else if (page.url().includes('poker-tours')) {
     console.log('SUCCESS! It popped the history stack!');
  } else {
     console.log('UNKNOWN STATE');
  }
  
  await browser.close();
})();
