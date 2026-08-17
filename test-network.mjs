import { chromium } from 'playwright';

async function verifyLogin() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    page.on('request', request => console.log('>>', request.method(), request.url()));
    page.on('response', response => console.log('<<', response.status(), response.url()));
    
    try {
        await page.goto('https://smarter.poker/auth/login', { waitUntil: 'networkidle' });
        await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
        await page.fill('input[type="password"]', 'Bek454545!!');
        await page.click('button[type="submit"]');
        await page.waitForTimeout(3000); 
        process.exit(0);
    } catch (e) {
        process.exit(1);
    }
}
verifyLogin();
