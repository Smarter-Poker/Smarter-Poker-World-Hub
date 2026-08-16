const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  
  await page.goto('https://smarter.poker/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
  await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/hub**');
  
  await page.goto('https://smarter.poker/hub/friends', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const report = await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div')).filter(el => {
      const cs = window.getComputedStyle(el);
      return el.clientHeight === window.innerHeight && cs.overflowY === 'auto';
    }).map(el => {
      // Build selector path
      let path = [];
      let cur = el;
      while (cur && cur !== document.body) {
        let sel = cur.tagName.toLowerCase();
        if (cur.id) sel += '#' + cur.id;
        if (cur.className) sel += '.' + cur.className.split(' ').join('.');
        path.unshift(sel);
        cur = cur.parentElement;
      }
      return {
        path: path.join(' > '),
        inlineStyle: el.getAttribute('style')
      };
    });
    return divs;
  });

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
