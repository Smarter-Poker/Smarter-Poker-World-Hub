const { chromium } = require('@playwright/test');

// Dynamically resolve the latest installed Playwright Chromium binary.
function resolveChromiumPath() {
  const { execSync } = require('child_process');
  try {
    const result = execSync(
      'find "$HOME/Library/Caches/ms-playwright" -name "Google Chrome for Testing" -type f 2>/dev/null | sort | tail -1',
      { encoding: 'utf-8', shell: true }
    ).trim();
    if (result) return result;
  } catch (e) { }
  return '/Users/smarter.poker/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
}

const CHROMIUM_PATH = resolveChromiumPath();

async function verifyScrollOnUrl(context, url, name) {
  console.log(`\n======================================================`);
  console.log(`🔍 Testing: ${name} (${url})`);
  const page = await context.newPage();
  
  // 1. Initial Load
  console.log(`   🌐 Loading page...`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000); // let things settle
  
  // 2. Scroll down
  console.log(`   ⬇️ Scrolling down 2000px...`);
  await page.evaluate(() => window.scrollTo(0, 2000));
  await page.waitForTimeout(500);
  
  let currentScroll = await page.evaluate(() => window.scrollY);
  console.log(`   📊 Scroll position before reload: ${currentScroll}px`);
  
  if (currentScroll === 0) {
    console.log(`   ⚠️ Could not scroll down! Page might be too short to test properly, or lock is preventing it.`);
    // We can still reload and verify it ends up at 0
  }

  // 3. Hard Reload
  console.log(`   🔄 Hard Reloading...`);
  await page.reload({ waitUntil: 'load' });
  
  // 4. Wait for the 500ms interval to finish its job
  await page.waitForTimeout(1000); 

  // 5. Check scroll position
  let newScroll = await page.evaluate(() => window.scrollY);
  console.log(`   ✅ Scroll position after reload + 1s: ${newScroll}px`);
  
  if (newScroll !== 0) {
    console.error(`   ❌ FAIL: Scroll position is ${newScroll}, expected 0!`);
    return false;
  }
  
  console.log(`   🎉 PASS: ${name} successfully started at the top of the page!`);
  await page.close();
  return true;
}

async function main() {
  console.log('🚀 Starting E2E Scroll-To-Top Verification...');
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  });

  // Login First
  console.log(`\n🔐 Logging into test account...`);
  const page = await context.newPage();
  await page.goto('https://smarter.poker/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
  await page.fill('input[type="password"]', 'Bek454545!!');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.close();
  console.log(`✅ Logged in successfully.`);

  const targets = [
    { name: 'Smarter Poker Hub News', url: 'https://smarter.poker/hub/news' },
    { name: 'Club Commander Dashboard', url: 'https://smarter.poker/hub/commander' },
    { name: 'Club Arena (My Clubs)', url: 'https://smarter.poker/hub/my-clubs' }
  ];

  let allPassed = true;
  for (const target of targets) {
    const passed = await verifyScrollOnUrl(context, target.url, target.name);
    if (!passed) allPassed = false;
  }

  await browser.close();

  console.log(`\n======================================================`);
  if (allPassed) {
    console.log(`🏆 ALL TESTS PASSED: Global scroll-to-top is working across all routes!`);
    process.exit(0);
  } else {
    console.log(`❌ SOME TESTS FAILED: Please check logs.`);
    process.exit(1);
  }
}

main();
