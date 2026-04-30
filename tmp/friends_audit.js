const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://smarter.poker/hub/user/MileHighAces', { waitUntil: 'networkidle' });
  // Wait for Friends section button
  await page.waitForSelector('text=See All', { timeout: 10000 });
  await page.click('text=See All');
  // Wait for modal
  await page.waitForSelector('h2:has-text("Friends")', { timeout: 10000 });
  // Verify tabs
  const tabs = await page.$$eval('button', bs => bs.map(b => b.textContent.trim()));
  console.log('Tabs:', tabs);
  if (!tabs.includes('All Friends') || !tabs.includes('Mutual Friends') || !tabs.includes('Suggested')) {
    console.error('Missing expected tabs');
    process.exit(1);
  }
  // Switch to Suggested tab
  await page.click('button:has-text("Suggested")');
  // Wait for friend rows
  await page.waitForSelector('button:has-text("Add Friend")', { timeout: 5000 });
  // Click first Add Friend
  const addBtn = await page.$('button:has-text("Add Friend")');
  if (addBtn) {
    await addBtn.click();
    // Verify button changes to Requested
    await page.waitForSelector('text=Requested', { timeout: 5000 });
  }
  // Close modal with Escape
  await page.keyboard.press('Escape');
  // Verify modal closed (header not present)
  const modalHeader = await page.$('h2:has-text("Friends")');
  if (modalHeader) {
    console.error('Modal did not close');
    process.exit(1);
  }
  await browser.close();
  console.log('PASS');
})();
