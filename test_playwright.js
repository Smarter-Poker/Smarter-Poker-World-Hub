const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    console.log('Navigating to production...');
    await page.goto('https://smarter.poker/hub/bankroll-manager');
    await page.waitForTimeout(2000);

    // Take screenshot before login
    await page.screenshot({ path: '/tmp/step1_initial.png' });
    console.log('Step 1 initial screenshot saved.');

    // Click sign in if present
    const signInBtn = page.locator('button:has-text("Sign In"), a:has-text("Sign In"), button:has-text("Log In"), a:has-text("Log In")').first();
    if (await signInBtn.isVisible()) {
      await signInBtn.click();
      await page.waitForTimeout(1000);
    }

    // Fill credentials
    console.log('Entering login details...');
    await page.locator('input[type="email"], input[name="email"]').fill('daniel@bekavactrading.com');
    await page.locator('input[type="password"], input[name="password"]').fill('Bek454545!!');
    
    // Click submit
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")').first();
    await submitBtn.click();
    console.log('Login submitted...');
    await page.waitForTimeout(5000);

    await page.screenshot({ path: '/tmp/step2_after_login.png' });
    console.log('Step 2 screenshot saved.');

    // Look for the diamond balance button to open Diamond Wallet Modal
    // The diamond balance button usually has text with diamonds or a diamond icon
    // Let's find any button in the header that has the diamond count or has an icon/text
    console.log('Searching for diamond balance button...');
    const diamondButton = page.locator('button:has-text("💎"), div:has-text("💎"), span:has-text("💎")').first();
    if (await diamondButton.isVisible()) {
      console.log('Diamond button found, clicking...');
      await diamondButton.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/step3_modal_open.png' });
      console.log('Step 3 modal open screenshot saved.');
    } else {
      console.log('Diamond button not found. Let us search for any elements with "diamonds" in id or class');
      const anyDiamond = page.locator('[id*="diamond"], [class*="diamond"]').first();
      if (await anyDiamond.isVisible()) {
        await anyDiamond.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: '/tmp/step3_modal_open.png' });
      }
    }

  } catch (err) {
    console.error('Playwright Error:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
})();
