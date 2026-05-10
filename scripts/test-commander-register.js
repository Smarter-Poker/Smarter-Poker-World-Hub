const { chromium } = require('@playwright/test');

function resolveChromiumPath() {
  const { execSync } = require('child_process');
  try {
    const r = execSync(
      'find "$HOME/Library/Caches/ms-playwright" -name "Google Chrome for Testing" -type f 2>/dev/null | sort | tail -1',
      { encoding: 'utf-8', shell: true }
    ).trim();
    if (r) return r;
  } catch (e) {}
  return '/Users/smarter.poker/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
}

async function main() {
  const browser = await chromium.launch({
    executablePath: resolveChromiumPath(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  console.log('\n=== Testing https://commander.smarter.poker/commander/register ===');
  await page.goto('https://commander.smarter.poker/commander/register?tier=home_game&from=poker_near_me&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate', {
    waitUntil: 'load',
    timeout: 30000,
  });

  // Wait up to 10s for spinner to clear (should clear in <8s via timeout)
  let cleared = false;
  const start = Date.now();
  while (Date.now() - start < 12000) {
    const spinner = await page.$('.animate-spin');
    const body = await page.textContent('body');
    if (!body.includes('Checking Your Commander Access')) {
      cleared = true;
      break;
    }
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: '/tmp/commander-register-test.png' });

  if (cleared) {
    console.log('✅ PASS: Spinner cleared, registration form visible');
    const bodyText = await page.textContent('body');
    console.log('Page excerpt:', bodyText.slice(0, 300).replace(/\s+/g, ' '));
  } else {
    console.log('❌ FAIL: Still showing "Checking Your Commander Access..." after 12s');
  }

  if (errors.length) {
    console.log('JS Errors:', errors);
  }

  console.log('Final URL:', page.url());
  await browser.close();
  process.exit(cleared ? 0 : 1);
}

main();
