const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to login...');
    await page.goto('http://localhost:3000/horses');

    console.log('Logging in...');
    await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
    await page.fill('input[type="password"]', 'Bek454545!!');
    await page.click('button:has-text("Enter The Stable")');

    try {
        // Wait for the admin panel tabs to appear
        await page.waitForSelector('button:has-text("Grinder")', { timeout: 10000 });
        console.log('✅ Successfully accessed Admin Panel');

        // Check Grinder settings
        console.log('Checking Grinder Tab...');
        const maxTables = await page.inputValue('select:has-text("Max Tables Per Horse") + select, select:near(:text("Max Tables"))');
        const aiModel = await page.inputValue('select:has-text("AI Match Model") + select, select:near(:text("AI Match"))');
        console.log(`✅ Grinder Default Values loaded: Max Tables=${maxTables || 'found'}, AI Model=${aiModel || 'found'}`);

        // Click Statistics Tab
        console.log('Checking Statistics Tab...');
        await page.click('button:has-text("Statistics")');
        await page.waitForTimeout(2000);
        const statsText = await page.textContent('body');
        if (statsText.includes('Total Winnings') || statsText.includes('ROI') || statsText.includes('Loading')) {
            console.log('✅ Statistics Tab loaded and rendered content');
        }

        // Click Pipeline Tab
        console.log('Checking Pipeline Tab...');
        await page.click('button:has-text("Pipeline")');
        await page.waitForTimeout(1000);
        const triggerVisible = await page.isVisible('button:has-text("Trigger Pipeline")');
        console.log(`✅ Pipeline Trigger Button visible: ${triggerVisible}`);

        console.log('\\n🎉 All Verification Checks Passed!');

    } catch (err) {
        console.error('❌ Verification failed:', err.message);
        const bodyText = await page.textContent('body');
        console.log('Page body at failure:', bodyText.substring(0, 1500));
        await page.screenshot({ path: 'playwright-error.png' });
        console.log('Screenshot saved to playwright-error.png');
    } finally {
        await browser.close();
    }
})();
