const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Testing /hub/poker-tours back button...');
  await page.goto('https://smarter.poker/hub/poker-tours');
  await page.waitForLoadState('networkidle');
  console.log('On page:', page.url());
  
  // Click the MSPT card (link to /hub/tours/MSPT)
  await page.click('a[href="/hub/tours/MSPT"], .tour-card:has-text("MSPT"), text="Mid-States Poker Tour"');
  await page.waitForLoadState('networkidle');
  console.log('Navigated to:', page.url());

  // Wait for Universal Header back button
  await page.waitForSelector('button:has-text("BACK"), .header-img-btn');
  // There are two header image buttons (hamburger and back). Typically back is the second one or has an SVG/img.
  // Actually UniversalHeader back button uses a specific img or svg.
  // Let's just click the back button image
  const backButtons = await page.$$('button:has(img[src*="back"]), button:has-text("BACK"), img[src*="back"]');
  if (backButtons.length > 0) {
      await backButtons[0].click({ force: true });
  } else {
      console.log("Could not find back button image. Let me try other selectors...");
      await page.click('.header-left button:nth-child(2), .universal-header button:nth-child(2)');
  }
  
  await page.waitForTimeout(2000);
  console.log('After clicking BACK, current URL is:', page.url());

  if (page.url() === 'https://smarter.poker/hub/poker-tours') {
     console.log("SUCCESS: Back button worked correctly!");
  } else {
     console.log("FAIL: Back button went to:", page.url());
  }
  
  await browser.close();
})();
