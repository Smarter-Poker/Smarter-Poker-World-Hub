const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
    let browser;
    try {
        // Try to find a Chrome/Chromium installation
        const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        browser = await puppeteer.launch({ executablePath, headless: "new" });
    } catch(e) {
        // Fallback to whatever is available if it fails
        const pptr = require('puppeteer');
        browser = await pptr.launch({ headless: "new" });
    }
    
    const page = await browser.newPage();
    page.on('console', msg => {
        if (msg.type() === 'error') console.log('BROWSER ERROR:', msg.text());
    });
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    page.on('requestfailed', request => {
        console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText);
    });
    
    await page.goto('http://localhost:3000/hub/poker-near-me?tab=venues', {waitUntil: 'networkidle2'});
    await new Promise(r => setTimeout(r, 2000));
    await browser.close();
})();
