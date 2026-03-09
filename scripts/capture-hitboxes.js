const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Load the local HTML file - go up one dir since we are in scripts/
    const fileUrl = `file://${path.resolve(__dirname, '../test-hitboxes.html')}`;
    await page.goto(fileUrl);

    // Take a full page screenshot
    await page.screenshot({ path: 'hitbox-test.png', fullPage: true });

    await browser.close();
})();
