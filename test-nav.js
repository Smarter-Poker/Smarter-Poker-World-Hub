const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://smarter.poker/hub/poker-near-me');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  
  // Dump all links with "Venue Details"
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button, .fsp-trigger'))
      .filter(el => el.textContent.includes('View Details') || el.textContent.includes('Venue Details') || el.innerText?.includes('Details'))
      .map(el => ({ text: el.textContent, href: el.href || el.getAttribute('data-url'), class: el.className }));
  });
  console.log("Found Details links:", links);
  
  // also dump the DOM of Midway club if it's there
  const html = await page.content();
  if (html.toLowerCase().includes('midway')) {
    console.log("Midway club is found on the page!");
  } else {
    console.log("Midway club is NOT found on the page.");
  }
  
  await browser.close();
})();
