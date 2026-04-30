const { chromium } = require('playwright');

(async () => {
  console.log('Starting Pass 2: Real-Time Audit for Friends Modal...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Navigate to profile
    console.log('Loading profile page...');
    await page.goto('https://smarter.poker/hub/user/MileHighAces', { waitUntil: 'networkidle' });

    // Wait for the Friends section header
    console.log('Finding Friends section...');
    const friendsSectionH3 = await page.waitForSelector('h3:has-text("Friends")', { timeout: 10000 });
    
    // Find the "See All" button within the same container
    // We can evaluate in page context to find the closest button with text "See All"
    console.log('Clicking "See All" in Friends section...');
    await page.evaluate(() => {
      const h3s = Array.from(document.querySelectorAll('h3'));
      const friendsH3 = h3s.find(h => h.textContent === 'Friends');
      if (!friendsH3) throw new Error('Could not find h3 with text "Friends"');
      
      const container = friendsH3.closest('div').parentElement;
      const buttons = Array.from(container.querySelectorAll('button'));
      const seeAllBtn = buttons.find(b => b.textContent === 'See All');
      
      if (!seeAllBtn) throw new Error('Could not find See All button in Friends section');
      seeAllBtn.click();
    });

    // 2. Wait for modal to open
    console.log('Waiting for modal to open...');
    await page.waitForSelector('h2:has-text("Friends")', { timeout: 5000 });

    // Verify body scroll lock is applied
    const overflowStatus = await page.evaluate(() => document.body.style.overflow);
    if (overflowStatus !== 'hidden') {
      throw new Error(`Body overflow should be 'hidden', but was '${overflowStatus}'`);
    }
    console.log('Scroll lock applied successfully.');

    // 3. Check tabs
    console.log('Checking tabs...');
    const tabTexts = await page.evaluate(() => {
      // Find the tabs container, which is below the header
      const h2s = Array.from(document.querySelectorAll('h2'));
      const modalHeader = h2s.find(h => h.textContent.includes('Friends'));
      const modalContainer = modalHeader.closest('div').parentElement;
      
      // Tabs are in the next div
      const tabsDiv = modalContainer.children[1];
      const buttons = Array.from(tabsDiv.querySelectorAll('button'));
      return buttons.map(b => b.textContent.trim().replace(/\s*\(\d+\)$/, '')); // strip counts like (0)
    });
    
    console.log('Tabs found:', tabTexts);
    
    // We only expect 'All Friends' if not logged in. Since we are testing unauthenticated, 
    // we should only see 'All Friends'. Wait, let's login first to see Mutual/Suggested!
    // Ah, I need to test authenticated flow for 'Suggested' tab.
    
  } catch (error) {
    console.error('Audit failed:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
