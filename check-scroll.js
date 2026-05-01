const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 } // Mobile Viewport (iPhone X)
  });
  const page = await context.newPage();
  await page.goto('https://smarter.poker/hub/friends', { waitUntil: 'networkidle' });

  const report = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const next = document.getElementById('__next');
    const cs = (el) => window.getComputedStyle(el);

    return {
      html: { overflow: cs(html).overflow, overflowX: cs(html).overflowX, overflowY: cs(html).overflowY, height: cs(html).height, minHeight: cs(html).minHeight },
      body: { overflow: cs(body).overflow, overflowX: cs(body).overflowX, overflowY: cs(body).overflowY, height: cs(body).height, minHeight: cs(body).minHeight, flexDirection: cs(body).flexDirection, touchAction: cs(body).touchAction, display: cs(body).display, flex: cs(body).flex },
      next: next ? { overflow: cs(next).overflow, overflowX: cs(next).overflowX, overflowY: cs(next).overflowY, height: cs(next).height, minHeight: cs(next).minHeight } : 'NOT FOUND',
      scrollInfo: {
        bodyScrollHeight: body.scrollHeight,
        bodyClientHeight: body.clientHeight,
        htmlScrollHeight: html.scrollHeight,
        htmlClientHeight: html.clientHeight,
        windowInnerHeight: window.innerHeight
      }
    };
  });

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
