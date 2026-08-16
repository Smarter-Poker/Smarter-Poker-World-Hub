import { chromium } from 'playwright';

(async () => {
    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });
    // Use an existing test user context if possible, otherwise we have to authenticate via an API or cookie if we can.
    // To solve this, let's just go directly to the profile page.
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to login...');
    await page.goto('https://smarter.poker/login', { waitUntil: 'networkidle' });
    
    // Login if necessary
    try {
        await page.waitForSelector('input[type="email"]', { timeout: 10000 });
        console.log('Logging in...');
        await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
        await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
        await page.waitForTimeout(5000); 
    } catch(e) {
        console.log('Login failed or not needed: ' + e);
    }

    console.log('Navigating to profile...');
    await page.goto('https://smarter.poker/hub/user/TestAlias99', { waitUntil: 'networkidle' });
    
    // Switch to All tab explicitly
    console.log('Clearing localstorage and reloading to get All tab...');
    await page.evaluate(() => {
        localStorage.removeItem('sp-filters-user-profile');
    });
    
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(5000); // Wait for components to hydrate

    // Take screenshot
    await page.screenshot({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/verify_profile.png', fullPage: true });
    console.log('Saved big screenshot.');

    await browser.close();
    console.log('Done.');
})();
