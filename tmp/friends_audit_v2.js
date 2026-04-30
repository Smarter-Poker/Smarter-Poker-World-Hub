const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1️⃣ Load the profile page
  await page.goto('https://smarter.poker/hub/user/MileHighAces', { waitUntil: 'networkidle' });

  // 2️⃣ Click the "See All" button/link in the Friends section
  // The button may be a <button> or an <a>. Use a flexible selector.
  await page.waitForSelector('text=See All', { timeout: 10000 });
  await page.click('text=See All');

  // 3️⃣ The UI could open a modal or navigate to a new page. Detect navigation.
  // Wait either for a dialog role or for a new URL that includes '/hub/friends'.
  const navigationPromise = page.waitForURL('**/hub/friends**', { timeout: 8000 }).catch(() => null);
  const dialogPromise = page.waitForSelector('div[role="dialog"]', { timeout: 8000 }).catch(() => null);
  const [newPage] = await Promise.all([navigationPromise, dialogPromise]);

  // Determine context: modal vs page
  const isModal = await page.$('div[role="dialog"]');

  // 4️⃣ Wait for the Friends header to appear (in modal or page)
  await page.waitForSelector('h2:has-text("Friends")', { timeout: 10000 });

  // 5️⃣ Retrieve the tab elements. They may be <button> elements or <a> links.
  const tabSelector = isModal ? 'div[role="dialog"] button' : 'nav button, nav a';
  const tabButtons = await page.$$eval(tabSelector, btns => btns.map(b => b.textContent.trim()));
  console.log('Tabs found:', tabButtons);

  // Verify expected tabs exist
  const required = ['All Friends', 'Mutual Friends', 'Suggested'];
  const missing = required.filter(t => !tabButtons.includes(t));
  if (missing.length) {
    console.error('Missing expected tabs:', missing);
    process.exit(1);
  }

  // Switch to Suggested tab (works for both modal and page)
  await page.click('button:has-text("Suggested")');

  // Wait for an Add Friend button inside the friends list
  await page.waitForSelector('button:has-text("Add Friend")', { timeout: 8000 });
  const addBtn = await page.$('button:has-text("Add Friend")');
  await addBtn.click();

  // Verify the button text changes to Requested (or similar)
  await page.waitForSelector('text=Requested', { timeout: 5000 });

  // Close modal if present, otherwise navigate back.
  if (isModal) {
    await page.keyboard.press('Escape');
    const still = await page.$('h2:has-text("Friends")');
    if (still) {
      console.error('Modal did not close');
      process.exit(1);
    }
  } else {
    // If we navigated to a separate page, go back to profile.
    await page.goBack({ waitUntil: 'networkidle' });
  }

  await browser.close();
  console.log('PASS');
})();
