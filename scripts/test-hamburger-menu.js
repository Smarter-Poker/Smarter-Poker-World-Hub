const { chromium } = require('@playwright/test');

function resolveChromiumPath() {
  const { execSync } = require('child_process');
  try {
    const result = execSync(
      'find "$HOME/Library/Caches/ms-playwright" -name "Google Chrome for Testing" -type f 2>/dev/null | sort | tail -1',
      { encoding: 'utf-8', shell: true }
    ).trim();
    if (result) return result;
  } catch (e) { /* fall through */ }
  return '/Users/smarter.poker/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
}

async function main() {
  const browser = await chromium.launch({
    executablePath: resolveChromiumPath(),
    headless: true,
  });
  
  // Use mobile viewport to ensure hamburger menu is easily accessible if it's responsive
  const context = await browser.newContext({ viewport: { width: 414, height: 896 } }); 
  const page = await context.newPage();

  console.log('Navigating to login...');
  await page.goto('https://smarter.poker/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
  await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});

  console.log('Navigating to Poker News...');
  await page.goto('https://smarter.poker/hub/news', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000); // Give JS time to hydrate and load data
  
  // Hide OneSignal overlay which blocks clicks
  await page.evaluate(() => {
    document.querySelectorAll('[id^="onesignal"]').forEach(el => el.style.display = 'none');
  });

  async function testMenu(menuName, screenshotName) {
    console.log(`\n--- Testing ${menuName} ---`);
    
    // The hamburger menu button might be in the UniversalHeader or within the news header. 
    // Let's try to click the one that looks like a menu button.
    try {
        const hamburgerBtn = page.locator('button[aria-label="Open Menu"]').first();
        await hamburgerBtn.click({ timeout: 5000, force: true });
        await page.waitForTimeout(1500); // Wait for menu slide-in animation
        
        // Take screenshot of open menu
        const menuShotPath = `/Users/smarter.poker/.gemini/antigravity/brain/1fae7edf-4610-444d-b8e7-838326b3c6c5/${screenshotName}-menu.png`;
        await page.screenshot({ path: menuShotPath });
        console.log(`Saved menu screenshot to ${menuShotPath}`);

        // Click menu item
        await page.locator(`text="${menuName}"`).first().click({ timeout: 5000, force: true });
        
        // Wait for the route to change and page to re-render
        await page.waitForTimeout(2500); 
        
        // Take screenshot of the new view
        const viewShotPath = `/Users/smarter.poker/.gemini/antigravity/brain/1fae7edf-4610-444d-b8e7-838326b3c6c5/${screenshotName}.png`;
        await page.screenshot({ path: viewShotPath });
        console.log(`Saved view screenshot to ${viewShotPath}`);
    } catch(e) {
        console.error(`Failed to test ${menuName}:`, e.message);
    }
  }

  await testMenu('Videos', 'test-videos');
  await testMenu('Events', 'test-events');
  await testMenu('Bookmarks', 'test-bookmarks');
  // 'Read Later' might be the exact text
  await testMenu('Read Later', 'test-later');

  console.log('\n--- Testing Toggles ---');
  try {
      await page.locator('button[aria-label="Open Menu"]').first().click({ force: true });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '/Users/smarter.poker/.gemini/antigravity/brain/1fae7edf-4610-444d-b8e7-838326b3c6c5/test-toggles.png' });
      console.log(`Saved toggles screenshot`);
  } catch(e) {
      console.error(`Failed to test toggles:`, e.message);
  }

  await browser.close();
  console.log('\n✅ Testing complete!');
}

main().catch(e => { console.error(e); process.exit(1); });
