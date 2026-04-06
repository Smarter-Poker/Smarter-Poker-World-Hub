const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    await page.goto('http://localhost:3000/hub/poker-near-me', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Check if Map View button exists
    const tabs = await page.$$('button');
    for (const tab of tabs) {
       const text = await tab.innerText();
       if (text.includes('Full Map') || text.includes('Map') && !text.includes('Map Preference')) {
           console.log('Clicking Map View button');
           await tab.click();
           break;
       }
    }
    
    await page.waitForTimeout(3000); // give it time to load map
    await page.screenshot({ path: 'map-rendered.png' });
    console.log('Screenshot saved to map-rendered.png');
  } catch(e) {
    console.error('Fatal:', e);
  }

  await browser.close();
})();
