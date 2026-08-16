const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 }
  });
  const page = await context.newPage();
  
  // Navigate and login
  await page.goto('https://smarter.poker/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
  await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/hub**'); // wait for login redirect
  
  // Go to friends page
  await page.goto('https://smarter.poker/hub/friends', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // wait for data to load

  const report = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    
    // Find scrollable element
    const scrollableElements = Array.from(document.querySelectorAll('*')).filter(el => {
      const cs = window.getComputedStyle(el);
      return el.scrollHeight > el.clientHeight && (cs.overflowY === 'auto' || cs.overflowY === 'scroll');
    }).map(el => ({
      tagName: el.tagName,
      className: el.className,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: window.getComputedStyle(el).overflowY
    }));

    return {
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      bodyOverflowY: window.getComputedStyle(body).overflowY,
      scrollableElements,
      url: window.location.href,
      pageTextLength: document.body.innerText.length
    };
  });

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
