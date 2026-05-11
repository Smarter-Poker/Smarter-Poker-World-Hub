const { chromium } = require('@playwright/test');
const fs = require('fs');

async function resolveIssues() {
  const browser = await chromium.launch({ headless: true, executablePath: '/Users/smarter.poker/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
  const context = await browser.newContext({
    storageState: '/Users/smarter.poker/.sentry-storage-state.json'
  });
  const page = await context.newPage();
  
  try {
    // Navigate to Sentry Issues
    await page.goto('https://smarter-software-inc.sentry.io/issues/', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Check if we are logged in by waiting for the issue list or login page
    if (page.url().includes('login')) {
      console.error('Not logged in to Sentry!');
      await page.screenshot({ path: '/tmp/sentry-login.png' });
      process.exit(1);
    }
    
    // Wait for the issue list to load
    await page.waitForSelector('input[aria-label="Select all issues"]', { timeout: 10000 }).catch(() => {});
    
    // Check "Select All" checkbox
    const selectAllCheckbox = await page.$('input[aria-label="Select all issues"]');
    if (selectAllCheckbox) {
      await selectAllCheckbox.click({ force: true });
      console.log('Checked "Select All"');
      
      // Click Resolve button
      const resolveButton = await page.$('button[aria-label="Resolve"]');
      if (resolveButton) {
        await resolveButton.click({ force: true });
        console.log('Clicked "Resolve"');
      } else {
        // sometimes it's text "Resolve"
        await page.getByRole('button', { name: 'Resolve' }).first().click();
        console.log('Clicked "Resolve" by text');
      }
      
      await page.waitForTimeout(3000);
      console.log('Issues resolved successfully.');
    } else {
      console.log('No unresolved issues found or checkbox not present.');
    }
  } catch (err) {
    console.error('Error:', err);
    await page.screenshot({ path: '/tmp/sentry-error.png' });
  } finally {
    await browser.close();
  }
}
resolveIssues();
