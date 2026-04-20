import { chromium, firefox, webkit } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    
    console.log('Navigating to RGPS...');
    await page.goto('https://smarter.poker/hub/tours/RGPS', { waitUntil: 'networkidle' });
    
    console.log('Clicking "All Stops" tab...');
    const allStopsTab = page.locator('button', { hasText: 'All Stops' });
    if (await allStopsTab.isVisible()) {
        await allStopsTab.click();
        await page.waitForTimeout(500);
    }
    
    console.log('Counting cards...');
    const cards = page.locator('.series-card-clickable');
    const count = await cards.count();
    console.log('Cards found:', count);
    
    if (count > 0) {
        console.log('Clicking first card...');
        await cards.first().click();
        await page.waitForTimeout(1000);
        
        const modal = page.locator('.ssm-backdrop');
        const countModal = await modal.count();
        console.log('Modal elements found:', countModal);
        if (countModal > 0) {
            console.log('Modal isVisible:', await modal.first().isVisible());
            const html = await modal.first().innerHTML();
            console.log('Modal HTML preview:', html.substring(0, 300));
        } else {
            console.log('NO MODAL IN DOM');
        }
    }
    
    await browser.close();
})();
