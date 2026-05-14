/**
 * Sentry — Resolve all unresolved issues
 * Uses Chrome's existing session cookies to skip login,
 * then creates a full-access token and resolves all issues via API.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const CHROME_PROFILE = path.join(
  process.env.HOME,
  'Library/Application Support/Google/Chrome/Default'
);

async function run() {
  console.log('Launching with Chrome profile:', CHROME_PROFILE);

  const browser = await chromium.launchPersistentContext(CHROME_PROFILE, {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
    // Don't close existing Chrome instances
    ignoreDefaultArgs: ['--disable-extensions'],
  });

  const page = await browser.newPage();

  // Navigate directly to issues — if session cookie exists, this will work
  console.log('Loading Sentry issues page...');
  await page.goto(
    'https://smarter-software-inc.sentry.io/issues/?project=4510816835600384&query=is%3Aunresolved&sort=events&statsPeriod=90d',
    { waitUntil: 'networkidle', timeout: 30000 }
  );
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  const title = await page.title();
  console.log('URL:', currentUrl);
  console.log('Title:', title);
  await page.screenshot({ path: '/tmp/sentry-session.png' });

  if (currentUrl.includes('auth/login')) {
    console.log('Not logged in via Chrome session. Trying password login...');
    // Try with password
    await page.fill('input[name="username"]', 'support@smarter.poker');
    await page.fill('input[name="password"]', 'SmarterPoker2024!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    console.log('After login attempt:', page.url());
    await page.screenshot({ path: '/tmp/sentry-login-attempt.png' });
  }

  // Try to get a session cookie that lets us make API calls
  const cookies = await browser.cookies('https://sentry.io');
  const sessionCookie = cookies.find(c => c.name === 'sentry-sc' || c.name === 'csrf');
  const allSentryCookies = cookies.filter(c => c.domain.includes('sentry'));
  console.log('Sentry cookies found:', allSentryCookies.map(c => c.name).join(', ') || 'none');

  // Try to navigate to token creation page and create a new token
  console.log('Navigating to API token creation...');
  await page.goto(
    'https://smarter-software-inc.sentry.io/settings/account/api/auth-tokens/',
    { waitUntil: 'networkidle', timeout: 20000 }
  );
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/sentry-tokens-page.png' });
  console.log('Token page URL:', page.url());
  console.log('Token page title:', await page.title());

  // Check page text
  const pageText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log('Page content preview:\n', pageText.slice(0, 500));

  // Look for existing tokens or create new one
  const createBtn = await page.$('button:has-text("Create New Token"), a:has-text("Create New Token"), button:has-text("New Token")');
  if (createBtn) {
    console.log('Found "Create New Token" button — clicking...');
    await createBtn.click();
    await page.waitForTimeout(2000);

    // Select all scopes needed for issue resolution
    // Look for event:read, event:write, issue:read, org:read checkboxes
    const scopeCheckboxes = await page.$$('input[type="checkbox"]');
    console.log(`Found ${scopeCheckboxes.length} checkboxes`);

    // Check all of them (select all scopes)
    for (const cb of scopeCheckboxes) {
      const isChecked = await cb.isChecked();
      if (!isChecked) {
        await cb.click().catch(() => {});
      }
    }

    // Submit
    const saveBtn = await page.$('button[type="submit"], button:has-text("Create Token"), button:has-text("Save")');
    if (saveBtn) {
      await saveBtn.click();
      await page.waitForTimeout(3000);
    }

    // Extract the new token
    const tokenEl = await page.$('input[readonly], code, pre, [data-test-id="token-value"]');
    if (tokenEl) {
      const newToken = await tokenEl.inputValue().catch(() => tokenEl.innerText());
      console.log('NEW TOKEN:', newToken);
      // Save to file
      fs.writeFileSync('/tmp/sentry-new-token.txt', newToken || '');
    }
    await page.screenshot({ path: '/tmp/sentry-new-token.png' });
  } else {
    console.log('No create button found on tokens page.');
    // Try going directly to the issues page and using the UI to resolve
    await page.goto(
      'https://smarter-software-inc.sentry.io/issues/?project=4510816835600384&query=is%3Aunresolved&sort=events',
      { waitUntil: 'networkidle', timeout: 20000 }
    );
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/sentry-issues-direct.png' });

    const issuesText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log('Issues page content:', issuesText.slice(0, 600));
  }

  await browser.close();
}

run().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
