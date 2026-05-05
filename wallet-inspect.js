// wallet-inspect.js — Playwright visual inspection of Diamond Wallet
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 800, height: 900 } });
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
        await page.locator('input[type="password"]').first().fill('Bek454545!!');
        await page.locator('button[type="submit"]').first().click();
        await page.waitForTimeout(3000);
    }

    // Navigate to hub
    await page.goto('https://smarter.poker/hub', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Click the Diamond Wallet button (diamond icon in header/nav)
    // Try clicking the wallet icon/button
    const walletTriggers = [
        '[aria-label*="wallet" i]',
        '[aria-label*="diamond" i]',
        'button:has-text("Wallet")',
        '[data-testid*="wallet"]',
    ];

    let opened = false;
    for (const sel of walletTriggers) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
            await el.click();
            opened = true;
            break;
        }
    }

    if (!opened) {
        // Try clicking the diamond icon in the top nav
        const diamondIcons = await page.$$('svg, img[src*="diamond"], button');
        console.log('Wallet not found by aria-label, found elements:', diamondIcons.length);
        // Take a screenshot of current state so we can see what's there
        await page.screenshot({ path: '/tmp/wallet-before-open.png', fullPage: false });
        console.log('SCREENSHOT_BEFORE:/tmp/wallet-before-open.png');
    }

    await page.waitForTimeout(2000);

    // Screenshot the modal
    await page.screenshot({ path: '/tmp/wallet-modal.png', fullPage: false });
    console.log('SCREENSHOT:/tmp/wallet-modal.png');

    // Try to get bounding boxes of the bg image and overlays
    const imageBox = await page.evaluate(() => {
        const img = document.querySelector('img[alt="Diamond Wallet"]');
        if (!img) return null;
        const r = img.getBoundingClientRect();
        return { top: r.top, left: r.left, width: r.width, height: r.height };
    });
    console.log('IMAGE_BOX:', JSON.stringify(imageBox));

    const overlays = await page.evaluate(() => {
        // Get all absolutely positioned children of the image container
        const img = document.querySelector('img[alt="Diamond Wallet"]');
        if (!img) return [];
        const parent = img.parentElement;
        const results = [];
        for (const child of parent.children) {
            if (child === img) continue;
            const r = child.getBoundingClientRect();
            results.push({
                text: child.innerText?.trim().substring(0, 50),
                top: r.top,
                left: r.left,
                width: r.width,
                height: r.height,
            });
        }
        return results;
    });
    console.log('OVERLAYS:', JSON.stringify(overlays, null, 2));

    await browser.close();
})();
