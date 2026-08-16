#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// playwright-test.js — Reusable Browser Test Runner for Antigravity Agents
// ═══════════════════════════════════════════════════════════════════════════════
//
// USAGE:
//   node scripts/playwright-test.js --url https://smarter.poker
//   node scripts/playwright-test.js --url https://smarter.poker/hub/social-media --screenshot /tmp/out.png
//   node scripts/playwright-test.js --url https://smarter.poker/login --login
//   node scripts/playwright-test.js --url https://smarter.poker/hub/training --check-console
//
// FLAGS:
//   --url <url>            Required. URL to navigate to.
//   --screenshot <path>    Optional. Save screenshot to path (default: /tmp/playwright-shot.png)
//   --login                Optional. Log in with test account before testing.
//   --check-console        Optional. Report any JS console errors on the page.
//   --wait <ms>            Optional. Extra wait in ms after navigation (default: 2000).
//   --text <selector>      Optional. Print innerText of a CSS selector.
//
// CREDENTIALS: daniel@bekavactrading.com / ${process.env.TEST_USER_PASSWORD}
//
// EXIT CODES:
//   0 = success (page loaded, no fatal errors)
//   1 = failure (navigation failed, console errors found when --check-console)
// ═══════════════════════════════════════════════════════════════════════════════

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 && args[i + 1] ? args[i + 1] : null; };
const hasFlag = (flag) => args.includes(flag);

const TARGET_URL    = getArg('--url');
const SCREENSHOT    = getArg('--screenshot') || '/tmp/playwright-shot.png';
const DO_LOGIN      = hasFlag('--login');
const CHECK_CONSOLE = hasFlag('--check-console');
const EXTRA_WAIT    = parseInt(getArg('--wait') || '2000');
const TEXT_SEL      = getArg('--text');

const TEST_EMAIL    = 'daniel@bekavactrading.com';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;
const LOGIN_URL     = 'https://smarter.poker/login';

// Dynamically resolve the latest installed Playwright Chromium binary.
// This prevents breakage when `npx playwright install chromium` upgrades to a new version.
function resolveChromiumPath() {
  const { execSync } = require('child_process');
  const os = require('os');
  const glob = require('child_process');
  try {
    // Use find to locate all installed binaries, pick the lexicographically last (highest version)
    const result = execSync(
      'find "$HOME/Library/Caches/ms-playwright" -name "Google Chrome for Testing" -type f 2>/dev/null | sort | tail -1',
      { encoding: 'utf-8', shell: true }
    ).trim();
    if (result) return result;
  } catch (e) { /* fall through */ }
  // Hard fallback if discovery fails
  return '/Users/smarter.poker/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
}

const CHROMIUM_PATH = resolveChromiumPath();

if (!TARGET_URL) {
  console.error('❌  --url is required');
  console.error('    Usage: node scripts/playwright-test.js --url https://smarter.poker');
  process.exit(1);
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('🎭 Playwright Agent Test Runner');
  console.log('═══════════════════════════════════════════════════');
  console.log(`   URL:        ${TARGET_URL}`);
  console.log(`   Login:      ${DO_LOGIN}`);
  console.log(`   Console:    ${CHECK_CONSOLE}`);
  console.log(`   Screenshot: ${SCREENSHOT}`);
  console.log('═══════════════════════════════════════════════════\n');

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  });

  const consoleErrors = [];
  const page = await context.newPage();

  if (CHECK_CONSOLE) {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[ERROR] ${msg.text()}`);
      }
    });
    page.on('pageerror', err => {
      consoleErrors.push(`[PAGEERROR] ${err.message}`);
    });
  }

  try {
    // ── Login flow ──
    if (DO_LOGIN) {
      console.log('   🔐 Logging in with test account...');
      await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
      console.log(`   ✅ Logged in — now at: ${page.url()}`);
    }

    // ── Navigate to target ──
    console.log(`   🌐 Navigating to: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 30000 });

    if (EXTRA_WAIT > 0) {
      await page.waitForTimeout(EXTRA_WAIT);
    }

    const title = await page.title();
    const url   = page.url();
    console.log(`   📄 Title: ${title}`);
    console.log(`   🔗 URL:   ${url}`);

    // ── Optional text extraction ──
    if (TEXT_SEL) {
      try {
        const text = await page.locator(TEXT_SEL).first().innerText({ timeout: 5000 });
        console.log(`   📝 "${TEXT_SEL}" → ${text.slice(0, 200)}`);
      } catch (e) {
        console.log(`   ⚠️  Selector "${TEXT_SEL}" not found`);
      }
    }

    // ── Screenshot ──
    const screenshotDir = path.dirname(SCREENSHOT);
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: SCREENSHOT, fullPage: false });
    console.log(`   📸 Screenshot saved: ${SCREENSHOT}`);

    // ── Console error report ──
    if (CHECK_CONSOLE) {
      if (consoleErrors.length === 0) {
        console.log('   ✅ No JS console errors detected');
      } else {
        console.log(`\n   ❌ ${consoleErrors.length} console error(s) detected:`);
        consoleErrors.forEach(e => console.log(`      ${e}`));
      }
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('PLAYWRIGHT_TEST:PASS');
    console.log(`PAGE_TITLE:${title}`);
    console.log(`FINAL_URL:${url}`);
    console.log(`SCREENSHOT:${SCREENSHOT}`);
    if (CHECK_CONSOLE) console.log(`CONSOLE_ERRORS:${consoleErrors.length}`);
    console.log('═══════════════════════════════════════════════════');

    await browser.close();
    process.exit(CHECK_CONSOLE && consoleErrors.length > 0 ? 1 : 0);

  } catch (e) {
    console.error(`\n   ❌ Test failed: ${e.message}`);
    await browser.close().catch(() => {});
    console.log('\nPLAYWRIGHT_TEST:FAIL');
    console.log(`ERROR:${e.message}`);
    process.exit(1);
  }
}

main();
