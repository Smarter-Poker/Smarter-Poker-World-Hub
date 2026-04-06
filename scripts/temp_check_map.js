const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/hub/poker-near-me?tab=map');
  await page.waitForTimeout(5000);
  
  // Find what element is at the center of the map
  const mapCenter = await page.evaluate(() => {
    const map = document.querySelector('.leaflet-container');
    if (!map) return null;
    const rect = map.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const el = document.elementFromPoint(x, y);
    return {
      x, y,
      tagName: el ? el.tagName : 'none',
      className: el ? el.className : 'none',
      id: el ? el.id : 'none',
    };
  });
  console.log('Element at map center:', mapCenter);

  // Try to drag the map
  if (mapCenter) {
    await page.mouse.move(mapCenter.x, mapCenter.y);
    await page.mouse.down();
    await page.mouse.move(mapCenter.x + 200, mapCenter.y + 200, { steps: 10 });
    await page.mouse.up();
    console.log('Performed drag.');
  }
  
  await browser.close();
})();
