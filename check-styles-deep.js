const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  
  await page.goto('https://smarter.poker/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
  await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/hub**');
  
  await page.goto('https://smarter.poker/hub/friends', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const report = await page.evaluate(() => {
    // Force a cache bypass on fetch if needed
    const html = document.documentElement;
    const body = document.body;
    
    // Let's get the matched CSS rules for the body element
    const rules = [];
    for (let i = 0; i < document.styleSheets.length; i++) {
      try {
        const sheet = document.styleSheets[i];
        if (sheet.cssRules) {
          for (let j = 0; j < sheet.cssRules.length; j++) {
            const rule = sheet.cssRules[j];
            if (rule.selectorText && (rule.selectorText.includes('body') || rule.selectorText.includes('html'))) {
              rules.push({ selector: rule.selectorText, cssText: rule.cssText });
            }
          }
        }
      } catch (e) {
        // CORS or other errors
      }
    }

    return {
      bodyOverflowY: window.getComputedStyle(body).overflowY,
      htmlOverflowY: window.getComputedStyle(html).overflowY,
      rules: rules
    };
  });

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
