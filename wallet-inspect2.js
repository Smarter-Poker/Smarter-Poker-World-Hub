// wallet-inspect2.js — Click the diamond wallet icon, screenshot modal, measure overlays
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 800, height: 950 } });
    const page = await context.newPage();

    // Login
    await page.goto('https://smarter.poker', { waitUntil: 'networkidle' });
    const signInBtn = page.locator('button:has-text("Sign In"), a:has-text("Sign In"), button:has-text("Log in")').first();
    if (await signInBtn.isVisible()) {
        await signInBtn.click();
        await page.waitForTimeout(1000);
    }
    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.isVisible()) {
        await emailInput.fill('daniel@bekavactrading.com');
        await page.locator('input[type="password"]').first().fill(process.env.TEST_USER_PASSWORD);
        await page.locator('button[type="submit"]').first().click();
        await page.waitForTimeout(3500);
    }

    // Navigate to hub
    await page.goto('https://smarter.poker/hub', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // The diamond icon is at approximately x=612, y=24 based on the screenshot
    // It's the first icon in the top-right icon strip
    // Let's find all buttons/SVGs in the header and log them
    const headerElements = await page.evaluate(() => {
        const header = document.querySelector('header, nav, [class*="header"], [class*="nav"]');
        if (!header) return 'no header found';
        const btns = [...header.querySelectorAll('button, a[role="button"]')];
        return btns.map((b, i) => ({
            index: i,
            text: b.innerText?.trim().substring(0, 30),
            ariaLabel: b.getAttribute('aria-label'),
            title: b.title,
            className: b.className?.substring(0, 60),
        }));
    });
    console.log('HEADER_ELEMENTS:', JSON.stringify(headerElements, null, 2));

    // Click at the diamond icon position (top-right area)
    await page.mouse.click(612, 24);
    await page.waitForTimeout(2000);

    // Screenshot after click
    await page.screenshot({ path: '/tmp/wallet-after-click.png' });
    console.log('SCREENSHOT_AFTER_CLICK:/tmp/wallet-after-click.png');

    // Check if wallet modal opened
    const imgBox = await page.evaluate(() => {
        const img = document.querySelector('img[alt="Diamond Wallet"]');
        if (!img) return null;
        const r = img.getBoundingClientRect();
        return { top: r.top, left: r.left, width: r.width, height: r.height };
    });
    console.log('IMAGE_BOX:', JSON.stringify(imgBox));

    if (imgBox) {
        // Measure the overlay children
        const overlays = await page.evaluate(() => {
            const img = document.querySelector('img[alt="Diamond Wallet"]');
            if (!img) return [];
            const parent = img.parentElement;
            const imgRect = img.getBoundingClientRect();
            const results = [];
            for (const child of parent.children) {
                if (child === img) continue;
                const r = child.getBoundingClientRect();
                // Express as % of image size
                results.push({
                    text: child.innerText?.trim().substring(0, 80),
                    topPx: Math.round(r.top - imgRect.top),
                    leftPx: Math.round(r.left - imgRect.left),
                    widthPx: Math.round(r.width),
                    heightPx: Math.round(r.height),
                    topPct: (((r.top - imgRect.top) / imgRect.height) * 100).toFixed(1),
                    leftPct: (((r.left - imgRect.left + r.width / 2) / imgRect.width) * 100).toFixed(1),
                });
            }
            return results;
        });
        console.log('OVERLAYS:', JSON.stringify(overlays, null, 2));
    }

    await browser.close();
})();
