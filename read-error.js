const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    await page.goto('http://localhost:3000/hub/poker-near-me', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    const tabs = await page.$$('button');
    for (const tab of tabs) {
       const text = await tab.innerText();
       if (text.includes('Map') && !text.includes('Preference')) {
           console.log('Clicking tab:', text);
           await tab.click();
           break;
       }
    }
    
    await page.waitForTimeout(4000);
    
    const mapContent = await page.$eval('.map-tab-container', el => el.innerText).catch(() => 'no container');
    console.log('MAP_CONTAINER_TEXT:', mapContent);
  } catch(e) {
    console.error('Fatal:', e);
  }

  await browser.close();
})();
