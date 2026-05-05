// wallet-inspect3.js — Click Diamond Wallet by title selector
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 800, height: 950 } });
    const page = await context.newPage();

    // Login
    await page.goto('https://smarter.poker', { waitUntil: 'networkidle' });
    const signInBtn = page.locator('button:has-text("Sign In"), a:has-text("Sign In")').first();
    if (await signInBtn.isVisible()) {
        await signInBtn.click();
        await page.waitForTimeout(1000);
    }
    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.isVisible()) {
        await emailInput.fill('daniel@bekavactrading.com');
        await page.locator('input[type="password"]').first().fill('Bek454545!!');
        await page.locator('button[type="submit"]').first().click();
        await page.waitForTimeout(3500);
    }

    await page.goto('https://smarter.poker/hub', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Click the Diamond Wallet button by its title attribute
    await page.click('button[title="Diamond Wallet"]');
    await page.waitForTimeout(2500);

    // Screenshot the open modal
    await page.screenshot({ path: '/tmp/wallet-open.png', fullPage: false });
    console.log('SCREENSHOT:/tmp/wallet-open.png');

    // Get image and overlay bounding boxes
    const data = await page.evaluate(() => {
        const img = document.querySelector('img[alt="Diamond Wallet"]');
        if (!img) return { error: 'no image found' };
        const imgRect = img.getBoundingClientRect();
        const parent = img.parentElement;

        const overlays = [];
        for (const child of parent.children) {
            if (child === img) continue;
            const r = child.getBoundingClientRect();
            overlays.push({
                text: child.innerText?.trim().substring(0, 80),
                // position relative to image top-left
                topPx: Math.round(r.top - imgRect.top),
                centerLeftPx: Math.round(r.left - imgRect.left + r.width / 2),
                widthPx: Math.round(r.width),
                heightPx: Math.round(r.height),
                // Express as percentage of image dimensions
                topPct: +((((r.top + r.height/2) - imgRect.top) / imgRect.height) * 100).toFixed(1),
                centerLeftPct: +((((r.left - imgRect.left) + r.width / 2) / imgRect.width) * 100).toFixed(1),
            });
        }
        return {
            imgWidth: Math.round(imgRect.width),
            imgHeight: Math.round(imgRect.height),
            imgTop: Math.round(imgRect.top),
            imgLeft: Math.round(imgRect.left),
            overlays,
        };
    });
    console.log('MEASUREMENTS:', JSON.stringify(data, null, 2));

    await browser.close();
})();
