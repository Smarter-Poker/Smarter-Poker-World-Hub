const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

function resolveChromiumPath() {
  const { execSync } = require('child_process');
  try {
    return execSync(
      'find "$HOME/Library/Caches/ms-playwright" -name "Google Chrome for Testing" -type f 2>/dev/null | sort | tail -1',
      { encoding: 'utf-8', shell: true }
    ).trim();
  } catch (e) { }
  return '/Users/smarter.poker/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
}

const CHROMIUM_PATH = resolveChromiumPath();

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  
  try {
    await page.goto('http://localhost:3000/hub/home-games', { waitUntil: 'load', timeout: 30000 });
    
    // Find the button with text "Host A Home Game"
    const button = page.locator('button:has-text("Host A Home Game")').first();
    await button.waitFor({ state: 'visible', timeout: 5000 });
    
    // Take a before screenshot
    await page.screenshot({ path: '/tmp/before-click.png' });
    
    // Click the button
    await button.click({ force: true });
    
    // Wait for the "Checking..." text to appear
    const checkingText = page.locator('text=Checking...');
    await checkingText.waitFor({ state: 'visible', timeout: 5000 });
    
    // Take an after screenshot
    await page.screenshot({ path: '/tmp/after-click.png' });
    
    console.log('SUCCESS');
  } catch (e) {
    console.error('FAILED', e);
  } finally {
    await browser.close();
  }
}

main();
