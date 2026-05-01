const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 }
  });
  const page = await context.newPage();
  await page.goto('https://smarter.poker/hub/friends', { waitUntil: 'networkidle' });

  const report = await page.evaluate(() => {
    // Find all elements that have scrollHeight > clientHeight
    const scrollableElements = Array.from(document.querySelectorAll('*')).filter(el => {
      const cs = window.getComputedStyle(el);
      return el.scrollHeight > el.clientHeight && cs.overflowY !== 'visible' && cs.overflowY !== 'hidden';
    }).map(el => ({
      tagName: el.tagName,
      id: el.id,
      className: el.className,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: window.getComputedStyle(el).overflowY
    }));

    // Find any element with exactly 100vh or 100% height that also has hidden overflow
    const clippedElements = Array.from(document.querySelectorAll('*')).filter(el => {
      const cs = window.getComputedStyle(el);
      return (cs.height === '812px' || cs.maxHeight === '812px') && cs.overflowY === 'hidden';
    }).map(el => ({
      tagName: el.tagName,
      id: el.id,
      className: el.className,
      height: window.getComputedStyle(el).height,
      overflowY: window.getComputedStyle(el).overflowY
    }));

    // Let's also check the children of #__next
    const next = document.getElementById('__next');
    const nextChild = next ? next.firstElementChild : null;
    const nextChildCS = nextChild ? window.getComputedStyle(nextChild) : null;
    const nextChildInfo = nextChild ? {
      tagName: nextChild.tagName,
      className: nextChild.className,
      height: nextChildCS.height,
      minHeight: nextChildCS.minHeight,
      overflowY: nextChildCS.overflowY,
      scrollHeight: nextChild.scrollHeight
    } : null;

    return { scrollableElements, clippedElements, nextChildInfo };
  });

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
