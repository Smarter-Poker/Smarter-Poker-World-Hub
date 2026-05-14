const { chromium } = require('@playwright/test');

function resolveChromiumPath() {
  const { execSync } = require('child_process');
  try {
    const result = execSync(
      'find "$HOME/Library/Caches/ms-playwright" -name "Google Chrome for Testing" -type f 2>/dev/null | sort | tail -1',
      { encoding: 'utf-8', shell: true }
    ).trim();
    if (result) return result;
  } catch (e) { }
  return '/Users/smarter.poker/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
}

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ 
      headless: true, 
      executablePath: resolveChromiumPath() 
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Logging in...');
    await page.goto('https://smarter.poker/login');
    await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
    await page.fill('input[type="password"]', 'Bek454545!!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/hub**', { timeout: 15000 });
    console.log('Logged in successfully.');

    console.log('Navigating to The Midway Club home game...');
    await page.goto('https://smarter.poker/hub/home-games/the-midway-club');
    await page.waitForLoadState('networkidle');

    console.log('Checking for Reputation Badge...');
    const repBadge = await page.locator('.hgs-rep-badge');
    const badgeCount = await repBadge.count();
    if (badgeCount > 0) {
      console.log('Badge found:', await repBadge.innerText());
    } else {
      console.log('No badge found (expected if scores are 0).');
    }

    console.log('Looking for Vouch button...');
    const vouchBtn = await page.locator('#hgs-vouch-btn');
    console.log('Vouch button found:', await vouchBtn.count() > 0);
    
    // Check initial state
    const initialText = await vouchBtn.innerText();
    console.log('Initial Vouch button text:', initialText.trim());

    // Click it to toggle
    console.log('Clicking Vouch button...');
    await vouchBtn.click();
    await page.waitForTimeout(1500); // Wait for API response and state update
    
    // Check new state
    const newText = await vouchBtn.innerText();
    console.log('New Vouch button text:', newText.trim());

    // Click the voucher count to open the modal
    console.log('Clicking vouch count button...');
    const countBtn = await page.locator('.hgs-vouch-count-btn');
    if (await countBtn.count() > 0) {
      await countBtn.click();
      await page.waitForTimeout(1000);
      
      console.log('Taking screenshot of modal...');
      await page.screenshot({ path: '/tmp/vouch-modal.png' });
      console.log('Screenshot saved to /tmp/vouch-modal.png');
      
      const modalText = await page.locator('.hgs-vouchers-modal').innerText();
      console.log('Modal text snippet:', modalText.slice(0, 100).replace(/\n/g, ' '));
    } else {
      console.log('No vouch count button found!');
    }

  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await browser.close();
  }
})();
