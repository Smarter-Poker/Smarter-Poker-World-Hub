const puppeteer = require('puppeteer');

(async () => {
  console.log("Starting Chrome...");
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => {
    console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText);
  });

  console.log("Navigating to https://smarter.poker/hub ...");
  try {
    const response = await page.goto('https://smarter.poker/hub', { waitUntil: 'networkidle2', timeout: 30000 });
    console.log("Status:", response.status());

    await page.screenshot({ path: 'production_screenshot.png' });
    console.log("Saved screenshot to production_screenshot.png");

    const bodyContent = await page.evaluate(() => document.body.innerHTML.substring(0, 500));
    console.log("Body content snippet (first 500 chars):", bodyContent);

    const displayStyle = await page.evaluate(() => {
      return window.getComputedStyle(document.body).display;
    });
    console.log("Body computed display style:", displayStyle);

    const errors = await page.evaluate(() => {
      return window.__NEXT_DATA__ ? "Next.js loaded" : "__NEXT_DATA__ missing";
    });
    console.log("Next JS Data:", errors);
  } catch (e) {
    console.error("Puppeteer Error:", e);
  }

  await browser.close();
})();
