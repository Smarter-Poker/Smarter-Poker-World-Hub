const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://smarter.poker/hub/user/MileHighAces', { waitUntil: 'networkidle' });

  // Open the Friends modal
  await page.waitForSelector('button:text("See All")', { timeout: 10000 });
  await page.click('button:text("See All")');

  // Wait for modal header
  await page.waitForSelector('h2:has-text("Friends")', { timeout: 10000 });

  // Verify tabs – target only the modal’s tab buttons
  const tabButtons = await page.$$eval('div[role="dialog"] button', btns =>
    btns.map(b => b.textContent.trim())
  );
  console.log('Tabs in modal:', tabButtons);

  if (
    !tabButtons.includes('All Friends') ||
    !tabButtons.includes('Mutual Friends') ||
    !tabButtons.includes('Suggested')
  ) {
    console.error('Missing expected tabs');
    process.exit(1);
  }

  // Switch to Suggested tab
  await page.click('button:has-text("Suggested")');

  // Wait for a friend row with an Add Friend button
  await page.waitForSelector('button:text("Add Friend")', { timeout: 8000 });

  // Click the first Add Friend
  const addBtn = await page.$('button:text("Add Friend")');
  await addBtn.click();

  // Verify button changes to Requested
  await page.waitForSelector('text=Requested', { timeout: 5000 });

  // Close modal with Escape
  await page.keyboard.press('Escape');

  // Ensure modal is gone
  const modalHeader = await page.$('h2:has-text("Friends")');
  if (modalHeader) {
    console.error('Modal did not close');
    process.exit(1);
  }

  await browser.close();
  console.log('PASS');
})();
