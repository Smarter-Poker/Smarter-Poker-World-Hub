const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/hub/poker-near-me?tab=map', { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  
  const rules = await page.evaluate(() => {
    const map = document.querySelector('.leaflet-container');
    if (!map) return 'No leaflet-container found';
    
    // We want to find out what rule is applying pointer-events: none
    // Instead of parsing stylesheets, let's just log the computed style
    // and check the inline style.
    
    // Actually, getting all matched CSS rules in JS is hard without DevTools API.
    // Instead, let's look at the parent hierarchy to see if `.map-preview-card` or something else is present
    let path = [];
    let cur = map;
    while(cur) {
      path.push(cur.tagName + '#' + cur.id + '.' + cur.className);
      cur = cur.parentElement;
    }
    
    return {
      computedPointerEvents: window.getComputedStyle(map).pointerEvents,
      inlinePointerEvents: map.style.pointerEvents,
      path: path
    };
  });
  console.log(JSON.stringify(rules, null, 2));
  await browser.close();
})();
