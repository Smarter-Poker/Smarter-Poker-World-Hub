[ignoring loop detection]
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1️⃣ Load the user profile page
  await page.goto('https://smarter.poker/hub/user/MileHighAces', { waitUntil: 'networkidle' });

  // 2️⃣ Click the "See All" button/link in the Friends section
  await page.waitForSelector('a:has-text("See All")', { timeout: 10000 });
  await page.click('a:has-text("See All")');

  // 3️⃣ Wait for navigation to the Friends page (URL contains /hub/friends)
  await page.waitForURL('**/hub/friends**', { timeout: 10000 });

  // 4️⃣ Ensure the Friends header is present
  await page.waitForSelector('h2:has-text("Friends")', { timeout: 10000 });

  // 5️⃣ Capture the tab buttons (they are rendered as <button> inside a tab bar)
  const tabButtons = await page.$$eval('button[data-tab]', btns => btns.map(b => b.textContent.trim()));
  console.log('Tabs found:', tabButtons);

  const required = ['All Friends', 'Mutual Friends', 'Suggested'];
  const missing = required.filter(t => !tabButtons.includes(t));
  if (missing.length) {
    console.error('Missing expected tabs:', missing);
    process.exit(1);
  }

  // 6️⃣ Switch to the Suggested tab
  await page.click('button[data-tab="suggested"]');

  // 7️⃣ Wait for a friend row with an "Add Friend" button
  await page.waitForSelector('button:has-text("Add Friend")', { timeout: 8000 });
  const addBtn = await page.$('button:has-text("Add Friend")');
  await addBtn.click();

  // 8️⃣ Verify the button changes to "Requested"
  await page.waitForSelector('text=Requested', { timeout: 5000 });

  // 9️⃣ Return to the profile page (back navigation)
  await page.goBack({ waitUntil: 'networkidle' });

  // 10️⃣ Verify we are back on the profile and the modal is not present
  const modalHeader = await page.$('h2:has-text("Friends")');
  if (modalHeader) {
    console.error('Unexpected modal present after back navigation');
    process.exit(1);
  }

  await browser.close();
  console.log('PASS');
})();
