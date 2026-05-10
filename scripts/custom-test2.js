const { chromium } = require('@playwright/test');

function resolveChromiumPath() {
  return '/Users/smarter.poker/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
}

async function main() {
  const browser = await chromium.launch({ executablePath: resolveChromiumPath(), headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000/hub/home-games', { waitUntil: 'load' });
  const button = page.locator('button:has-text("Host A Home Game")').first();
  await button.waitFor({ state: 'visible' });
  
  await button.click({ force: true });
  
  // Wait a little bit for navigation
  await page.waitForTimeout(3000);
  
  console.log('Final URL:', page.url());
  await browser.close();
}
main();
