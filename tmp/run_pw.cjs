const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('Navigating to smarter.poker/horses...');
    await page.goto('https://smarter.poker/horses');
    
    // Login
    console.log('Waiting for login fields...');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
    
    console.log('Clicking login...');
    await page.click('button[type="submit"], button:has-text("Enter The Stable")');
    
    console.log('Waiting for Horses Dashboard to load...');
    await page.waitForTimeout(4000); // Give it time to load data
    
    console.log('Clicking Reviews tab...');
    // The button has "⭐ Reviews" text
    await page.click('button:has-text("⭐ Reviews")');
    
    console.log('Waiting for Reviews tab content to render...');
    await page.waitForTimeout(3000);
    
    // Capture screenshot
    const screenshotPath = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/tmp/review_tab_production.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot saved to:', screenshotPath);
    
    // Quick API check internally via evaluate to double confirm
    const reviewsLoaded = await page.evaluate(() => document.body.innerText.includes('Venue Review Moderation'));
    console.log('Reviews tab confirmed visible on page:', reviewsLoaded);

  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await browser.close();
  }
})();
