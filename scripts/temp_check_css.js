const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/hub/poker-near-me?tab=map', { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  
  const debug = await page.evaluate(() => {
    const map = document.querySelector('.leaflet-container');
    if (!map) return 'no map';
    
    // Find matching CSS rules
    const rules = [];
    for (let sheet of document.styleSheets) {
      try {
        for (let rule of sheet.cssRules) {
          if (rule.selectorText && map.matches(rule.selectorText)) {
            rules.push({ selector: rule.selectorText, cssText: rule.cssText });
          }
        }
      } catch (e) {} // cross-origin issues
    }
    return rules.filter(r => r.cssText.includes('pointer-events'));
  });
  console.log(JSON.stringify(debug, null, 2));
  await browser.close();
})();
