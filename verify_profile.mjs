import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to login...');
    await page.goto('https://smarter.poker/hub/social-media', { waitUntil: 'networkidle' });
    
    // Login if necessary
    const emailInput = await page.$('input[type="email"]');
    if (emailInput) {
        console.log('Logging in...');
        await emailInput.fill('daniel@bekavactrading.com');
        const passInput = await page.$('input[type="password"]');
        if (passInput) await passInput.fill(process.env.TEST_USER_PASSWORD);
        
        const loginBtn = await page.$('button[type="submit"]');
        if (loginBtn) {
            await loginBtn.click();
            await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
            await page.waitForTimeout(3000); // wait for session
        }
    }

    console.log('Navigating to profile...');
    await page.goto('https://smarter.poker/hub/user/TestAlias99', { waitUntil: 'networkidle' });
    
    // Switch to All tab explicitly
    console.log('Clearing localstorage and reloading to get All tab...');
    await page.evaluate(() => {
        localStorage.removeItem('sp-filters-user-profile');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(4000); // Wait for components to hydrate

    // Take screenshot
    await page.screenshot({ path: 'profile_verification.png', fullPage: true });

    // Verify DOM
    const components = await page.evaluate(() => {
        const textContent = document.body.innerText;
        return {
            LiveSessionToggle: textContent.includes("I'M AT THE TABLE") || textContent.includes("START LIVE SESSION"),
            LiveActivityFeed: textContent.includes("LIVE SESSIONS") || textContent.includes("Friends At The Table"),
            ViralGrowthModule: textContent.includes("VIRAL GROWTH") || textContent.includes("Invite Friends & Earn Diamonds"),
            CrewDashboard: textContent.includes("YOUR CREWS") || textContent.includes("Team Up & Compete")
        };
    });

    console.log('Component Verification Results:');
    console.log(JSON.stringify(components, null, 2));

    await browser.close();
    console.log('Done.');
})();
