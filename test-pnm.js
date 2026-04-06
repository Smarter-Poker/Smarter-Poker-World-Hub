const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log('BROWSER_CONSOLE:', msg.text());
    }
  });
  page.on('pageerror', error => {
    console.log('PAGE_ERROR:', error.message);
  });

  console.log('Navigating to lobby...');
  try {
    await page.goto('http://localhost:3000/hub/poker-near-me-lobby', { waitUntil: 'domcontentloaded' });
    console.log('Loaded.');
    await page.waitForTimeout(4000);
    
    // Check if Map View button exists
    const tabs = await page.$$('button');
    let mapBtn;
    for (const tab of tabs) {
       const text = await tab.innerText();
       if (text.includes('Map View') || text.includes('Full Map')) {
           mapBtn = tab;
           console.log('Clicking Map View button');
           await tab.click();
           break;
       }
    }
    
    await page.waitForTimeout(5000); // give it time to crash
  } catch(e) {
    console.error('Fatal:', e);
  }

  await browser.close();
})();
