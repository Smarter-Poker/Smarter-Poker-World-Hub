// wallet-measure.js — Open wallet, measure image and key visual targets
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
        await page.locator('input[type="password"]').first().fill(process.env.TEST_USER_PASSWORD);
        await page.locator('button[type="submit"]').first().click();
        await page.waitForTimeout(3500);
    }

    await page.goto('https://smarter.poker/hub', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('button[title="Diamond Wallet"]');
    await page.waitForTimeout(2500);

    const data = await page.evaluate(() => {
        // Find ALL images
        const imgs = [...document.querySelectorAll('img')];
        const largeImgs = imgs.map(img => {
            const r = img.getBoundingClientRect();
            return { src: img.src?.split('/').pop(), alt: img.alt, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) };
        }).filter(i => i.w > 50); // only large images

        // Find the actual wallet bg container (position:relative parent of the large image)
        const allDivs = [...document.querySelectorAll('div[style]')];
        const walletBgContainer = allDivs.find(d => d.style.position === 'relative' && d.querySelector('img[src*="diamond-wallet"]'));
        
        let containerData = null;
        if (walletBgContainer) {
            const r = walletBgContainer.getBoundingClientRect();
            const children = [...walletBgContainer.children].map(child => {
                const cr = child.getBoundingClientRect();
                return {
                    tag: child.tagName,
                    text: child.innerText?.trim().substring(0, 60),
                    top: Math.round(cr.top - r.top),
                    left: Math.round(cr.left - r.left),
                    width: Math.round(cr.width),
                    height: Math.round(cr.height),
                    topPct: +((((cr.top + cr.height/2) - r.top) / r.height) * 100).toFixed(1),
                    centerLeftPct: +((((cr.left - r.left) + cr.width/2) / r.width) * 100).toFixed(1),
                };
            });
            containerData = {
                containerWidth: Math.round(r.width),
                containerHeight: Math.round(r.height),
                children,
            };
        }

        return { largeImgs, containerData };
    });

    console.log('LARGE_IMGS:', JSON.stringify(data.largeImgs, null, 2));
    console.log('CONTAINER:', JSON.stringify(data.containerData, null, 2));

    // Also take an annotated screenshot
    // Overlay debug boxes
    await page.evaluate(() => {
        const allDivs = [...document.querySelectorAll('div[style]')];
        const walletBgContainer = allDivs.find(d => d.style.position === 'relative' && d.querySelector('img[src*="diamond-wallet"]'));
        if (!walletBgContainer) return;
        // Mark each child with a red border
        [...walletBgContainer.children].forEach((child, i) => {
            if (child.tagName === 'IMG') return;
            child.style.border = '2px solid red';
            child.style.boxSizing = 'border-box';
        });
    });
    await page.screenshot({ path: '/tmp/wallet-annotated.png', fullPage: false });
    console.log('ANNOTATED_SCREENSHOT:/tmp/wallet-annotated.png');

    await browser.close();
})();
