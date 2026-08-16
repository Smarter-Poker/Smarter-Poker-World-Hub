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
    // Find elements that are position fixed/absolute and take up the whole screen
    const overlays = Array.from(document.querySelectorAll('*')).filter(el => {
      const cs = window.getComputedStyle(el);
      const isFixed = cs.position === 'fixed' || cs.position === 'absolute';
      const coversWidth = el.clientWidth >= window.innerWidth - 20;
      const coversHeight = el.clientHeight >= window.innerHeight - 20;
      const blocksPointer = cs.pointerEvents !== 'none';
      const isVisible = cs.opacity !== '0' && cs.visibility !== 'hidden' && cs.display !== 'none';
      
      return isFixed && coversWidth && coversHeight && blocksPointer && isVisible;
    }).map(el => ({
      tagName: el.tagName,
      id: el.id,
      className: el.className,
      zIndex: window.getComputedStyle(el).zIndex
    }));
    return overlays;
  });

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
