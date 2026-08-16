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
    const html = document.documentElement;
    const body = document.body;
    const next = document.getElementById('__next');
    const cs = (el) => window.getComputedStyle(el);

    return {
      html: {
        scrollHeight: html.scrollHeight,
        clientHeight: html.clientHeight,
        overflowY: cs(html).overflowY
      },
      body: {
        scrollHeight: body.scrollHeight,
        clientHeight: body.clientHeight,
        overflowY: cs(body).overflowY
      },
      next: next ? {
        scrollHeight: next.scrollHeight,
        clientHeight: next.clientHeight,
        overflowY: cs(next).overflowY,
        height: cs(next).height,
        minHeight: cs(next).minHeight,
        maxHeight: cs(next).maxHeight
      } : null,
      scrollableElements: Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el);
        return el.scrollHeight > el.clientHeight && (style.overflowY === 'auto' || style.overflowY === 'scroll');
      }).map(el => ({
        tagName: el.tagName,
        className: el.className,
        id: el.id,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        overflowY: window.getComputedStyle(el).overflowY
      }))
    };
  });

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
