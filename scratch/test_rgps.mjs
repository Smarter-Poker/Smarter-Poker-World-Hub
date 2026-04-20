import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  await page.goto('https://smarter.poker/hub/tours/RGPS', { waitUntil: 'networkidle' });
  
  const stopsTab = page.locator('text=All Stops').first();
  if (await stopsTab.isVisible()) {
    console.log("Clicking All Stops tab");
    await stopsTab.click();
    await page.waitForTimeout(500);
  } else {
    // If we only have 3 tabs, "All Stops" might be active by default or just listed
    // Wait, the tabs have labels: 'Current Event' or 'Event Schedule', 'All Stops', 'About', 'Results'
  }
  
  const cards = page.locator('.series-card-clickable');
  const count = await cards.count();
  console.log(`Found ${count} clickable venue cards`);
  
  if (count > 0) {
    console.log('Clicking the first venue card');
    await cards.first().click();
    await page.waitForTimeout(1000);
    
    const popup = page.locator('.ssm-backdrop');
    const isVisible = await popup.isVisible();
    console.log('Modal visible after click:', isVisible);
  }
  
  await browser.close();
})();
