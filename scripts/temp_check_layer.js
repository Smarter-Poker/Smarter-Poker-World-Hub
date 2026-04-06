const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/hub/poker-near-me?tab=map', { waitUntil: 'load' });
  
  // Wait for map to load
  await page.waitForTimeout(5000);
  
  const mapCenter = await page.evaluate(() => {
    // try to find the map container coordinates
    const map = document.querySelector('.leaflet-container');
    if (!map) return 'No leaflet-container';
    const rect = map.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    // Who is really at the center?
    const el = document.elementFromPoint(x, y);
    
    // Also log z-index and pointerEvents of the leaflet container
    const mapStyle = window.getComputedStyle(map);
    return {
      x, y,
      tagName: el ? el.tagName : 'none',
      className: el ? el.className : 'none',
      id: el ? el.id : 'none',
      pointerEvents: window.getComputedStyle(el).pointerEvents,
      mapPointerEvents: mapStyle.pointerEvents,
      mapZIndex: mapStyle.zIndex
    };
  });
  console.log('Center element:', mapCenter);
  await browser.close();
})();
