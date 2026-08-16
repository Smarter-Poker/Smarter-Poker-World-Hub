const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  
  // Login
  await page.goto('https://smarter.poker/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
  await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/hub**');

  const pages = [
    '/hub/friends',
    '/hub/social-media', 
    '/hub/poker-near-me',
    '/hub/daily-tournaments',
    '/hub/training'
  ];

  for (const url of pages) {
    await page.goto('https://smarter.poker' + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const result = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const cs = (el) => window.getComputedStyle(el);
      
      // Actually try scrolling
      const beforeY = window.scrollY;
      window.scrollTo(0, 500);
      const afterY = window.scrollY;
      window.scrollTo(0, 0);
      
      return {
        htmlOverflow: cs(html).overflow,
        htmlOverflowY: cs(html).overflowY,
        bodyOverflow: cs(body).overflow,
        bodyOverflowY: cs(body).overflowY,
        bodyClasses: Array.from(body.classList).join(' '),
        bodyInlineStyle: body.getAttribute('style') || 'none',
        htmlInlineStyle: html.getAttribute('style') || 'none',
        contentHeight: body.scrollHeight,
        viewportHeight: window.innerHeight,
        hasScrollableContent: body.scrollHeight > window.innerHeight,
        scrolledTo500: afterY >= 400,  // allow some tolerance
        scrollYAfter: afterY
      };
    });

    const status = result.hasScrollableContent && result.scrolledTo500 ? 'PASS' : 
                   !result.hasScrollableContent ? 'SKIP (no content)' : 'FAIL';
    console.log(`${status} | ${url} | content=${result.contentHeight}px viewport=${result.viewportHeight}px scrollY=${result.scrollYAfter} | body.overflow=${result.bodyOverflowY} html.overflow=${result.htmlOverflowY} | bodyStyle="${result.bodyInlineStyle}" | classes="${result.bodyClasses}"`);
  }

  await browser.close();
})();
