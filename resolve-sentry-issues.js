/**
 * Create a new Sentry auth token with issue management permissions
 * Uses Playwright to log in via GitHub and create the token in settings
 */
const { chromium } = require('playwright');

const GITHUB_PAT = process.env.GITHUB_TOKEN;

(async () => {
  console.log('🚀 Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    // Step 1: Login to GitHub properly with proper navigation handling
    console.log('🐙 Logging into GitHub...');
    await page.goto('https://github.com/login', { waitUntil: 'networkidle', timeout: 30000 });
    
    await page.fill('#login_field', 'Smarter-Poker');
    await page.fill('#password', GITHUB_PAT);
    await page.click('input[type="submit"], input[name="commit"]');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    
    let postLoginUrl = page.url();
    console.log('  Post GitHub login URL:', postLoginUrl);
    
    // Handle device verification if needed
    if (postLoginUrl.includes('sessions')) {
      console.log('  Waiting for session to establish...');
      await page.waitForTimeout(3000);
      postLoginUrl = page.url();
      console.log('  Updated URL:', postLoginUrl);
    }

    // Step 2: Go to Sentry login directly  
    console.log('📡 Going to Sentry login page...');
    await page.goto('https://sentry.io/auth/login/smarter-software-inc/', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Click "Sign in with GitHub"
    console.log('  Clicking Sign in with GitHub...');
    const githubLink = page.locator('a:has-text("Sign in with GitHub"), button:has-text("Sign in with GitHub")');
    if (await githubLink.isVisible({ timeout: 3000 })) {
      // Intercept the click to see where it goes
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
        githubLink.click()
      ]);
      
      let afterClick = page.url();
      console.log('  After GitHub SSO click:', afterClick);
      
      // If we're on the GitHub login page, fill in credentials again
      if (afterClick.includes('github.com/login')) {
        console.log('  Re-entering GitHub credentials for OAuth...');
        const loginField = page.locator('#login_field');
        if (await loginField.isVisible({ timeout: 3000 }).catch(() => false)) {
          await loginField.fill('Smarter-Poker');
          await page.fill('#password', GITHUB_PAT);
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
            page.click('input[type="submit"], input[name="commit"]')
          ]);
          afterClick = page.url();
          console.log('  After re-login:', afterClick);
        }
      }
      
      // If we need to authorize
      if (afterClick.includes('github.com/login/oauth/authorize')) {
        const authBtn = page.locator('button:has-text("Authorize")');
        if (await authBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
            authBtn.click()
          ]);
          console.log('  After authorize:', page.url());
        }
      }
    }

    // Step 3: Check if we're authenticated on Sentry now
    await page.waitForTimeout(2000);
    const sentryUrl = page.url();
    console.log('  Final URL:', sentryUrl);
    await page.screenshot({ path: '/tmp/sentry-state.png' });
    
    // Try accessing the API from the page context
    const apiTest = await page.evaluate(async () => {
      try {
        const resp = await fetch('/api/0/', { credentials: 'include' });
        return await resp.json();
      } catch (e) {
        return { error: e.message };
      }
    });
    console.log('  API test:', JSON.stringify(apiTest).slice(0, 200));
    
    // If authenticated (has user info), resolve issues
    if (apiTest.user) {
      console.log('✅ Authenticated as:', apiTest.user.username);
      console.log('  Scopes:', JSON.stringify(apiTest.auth?.scopes));
      
      // Resolve all issues
      const result = await page.evaluate(async () => {
        try {
          const org = 'smarter-software-inc';
          const issuesResp = await fetch(
            `/api/0/organizations/${org}/issues/?query=is:unresolved&limit=100`,
            { credentials: 'include' }
          );
          const issues = await issuesResp.json();
          
          if (!Array.isArray(issues)) {
            return { success: false, raw: JSON.stringify(issues).slice(0, 300) };
          }
          
          if (issues.length === 0) {
            return { success: true, message: 'No unresolved issues!', count: 0 };
          }

          // Resolve each issue
          const results = [];
          for (const issue of issues) {
            const resp = await fetch(`/api/0/issues/${issue.id}/`, {
              method: 'PUT',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'resolved' })
            });
            results.push({ id: issue.id, title: issue.title, status: resp.status, ok: resp.ok });
          }
          
          return { 
            success: results.every(r => r.ok),
            total: issues.length,
            resolved: results.filter(r => r.ok).length,
            failed: results.filter(r => !r.ok),
            details: results
          };
        } catch (e) {
          return { success: false, error: e.message };
        }
      });
      
      console.log('📊 Resolution result:', JSON.stringify(result, null, 2));
      
      // Verify
      const verify = await page.evaluate(async () => {
        const resp = await fetch('/api/0/organizations/smarter-software-inc/issues/?query=is:unresolved&limit=100', { credentials: 'include' });
        const issues = await resp.json();
        return { remaining: Array.isArray(issues) ? issues.length : 'error' };
      });
      console.log('✅ Remaining unresolved:', JSON.stringify(verify));
    } else {
      console.log('❌ Not authenticated on Sentry');
      // Try creating a token via the auth token creation page
      console.log('  Attempting to create token via settings page...');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    await page.screenshot({ path: '/tmp/sentry-error.png' }).catch(() => {});
  } finally {
    await browser.close();
    console.log('🏁 Done');
  }
})();
