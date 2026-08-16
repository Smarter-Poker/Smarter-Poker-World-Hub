const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 viewport
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const consoleWarnings = [];
  const networkErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });

  page.on('response', response => {
    if (!response.ok() && response.status() !== 304) {
      networkErrors.push(`[${response.status()}] ${response.url()}`);
    }
  });

  console.log('=== STEP 1: Login ===');
  await page.goto('https://smarter.poker/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  try {
    await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/hub**', { timeout: 10000 });
    console.log('✅ Logged in, at:', page.url());
  } catch (e) {
    console.log('Login failed:', e.message);
  }

  console.log('\n=== STEP 2: Navigate to Social Media ===');
  await page.goto('https://smarter.poker/hub/social-media', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/reels_01_social_initial.png' });
  console.log('Screenshot: /tmp/reels_01_social_initial.png');

  // Skip intro if present
  try {
    const skipBtn = await page.$('button:has-text("Skip")');
    if (skipBtn) {
      console.log('Found Skip button - clicking it');
      await skipBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch (e) {}

  await page.screenshot({ path: '/tmp/reels_02_after_skip.png' });
  console.log('Screenshot: /tmp/reels_02_after_skip.png');

  console.log('\n=== STEP 3: Look for Reels tab ===');
  // Check what tabs/buttons are visible
  const allButtons = await page.$$eval('button, [role="tab"], a', els => 
    els.map(el => ({ text: el.textContent?.trim(), tag: el.tagName, classes: el.className }))
       .filter(el => el.text && el.text.length < 50)
       .slice(0, 30)
  );
  console.log('Visible buttons/tabs:', JSON.stringify(allButtons, null, 2));

  // Try to find and click the Reels tab
  let reelsTabClicked = false;
  const tabTexts = ['Reels', 'reels', 'REELS', 'Watch', '▶'];
  for (const text of tabTexts) {
    try {
      const tab = await page.$(`button:has-text("${text}"), [role="tab"]:has-text("${text}"), a:has-text("${text}")`);
      if (tab) {
        console.log(`Found tab with text "${text}" - clicking`);
        await tab.click();
        reelsTabClicked = true;
        await page.waitForTimeout(3000);
        break;
      }
    } catch (e) {}
  }

  if (!reelsTabClicked) {
    console.log('Could not find Reels tab by text, trying by data-tab attribute...');
    try {
      const reelsTab = await page.$('[data-tab="reels"], [data-view="reels"]');
      if (reelsTab) {
        await reelsTab.click();
        reelsTabClicked = true;
        await page.waitForTimeout(3000);
      }
    } catch (e) {}
  }

  await page.screenshot({ path: '/tmp/reels_03_reels_tab.png' });
  console.log('Screenshot: /tmp/reels_03_reels_tab.png');

  console.log('\n=== STEP 4: Check Reels DOM state ===');
  // Get the full page HTML structure around reels
  const reelsDom = await page.evaluate(() => {
    // Look for video elements
    const videos = Array.from(document.querySelectorAll('video'));
    const iframes = Array.from(document.querySelectorAll('iframe'));
    const reelsContainers = Array.from(document.querySelectorAll('[class*="reel"], [class*="Reel"]'));
    
    return {
      videoCount: videos.length,
      videoDetails: videos.map(v => ({
        src: v.src || v.currentSrc,
        paused: v.paused,
        readyState: v.readyState,
        networkState: v.networkState,
        error: v.error?.message,
        muted: v.muted,
        width: v.offsetWidth,
        height: v.offsetHeight,
        display: window.getComputedStyle(v).display,
        visibility: window.getComputedStyle(v).visibility,
      })),
      iframeCount: iframes.length,
      iframeDetails: iframes.map(i => ({
        src: i.src,
        width: i.offsetWidth,
        height: i.offsetHeight,
        display: window.getComputedStyle(i).display,
      })),
      reelsContainerCount: reelsContainers.length,
      bodyText: document.body.innerText.slice(0, 500),
    };
  });
  console.log('Reels DOM state:', JSON.stringify(reelsDom, null, 2));

  console.log('\n=== STEP 5: Click on a Reel to open viewer ===');
  // Try clicking on reel thumbnail or play button
  let reelOpened = false;
  const reelSelectors = [
    '[data-reel]', '[class*="reel-thumb"]', '[class*="ReelCard"]', 
    '[class*="reel-card"]', '[class*="reel-item"]', 'video', 
    '[class*="thumbnail"]', '[class*="Thumbnail"]'
  ];
  
  for (const sel of reelSelectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        console.log(`Clicking: ${sel}`);
        await el.click();
        reelOpened = true;
        await page.waitForTimeout(4000);
        break;
      }
    } catch (e) {}
  }

  await page.screenshot({ path: '/tmp/reels_04_viewer.png' });
  console.log('Screenshot: /tmp/reels_04_viewer.png');

  console.log('\n=== STEP 6: Check viewer DOM state ===');
  const viewerDom = await page.evaluate(() => {
    const videos = Array.from(document.querySelectorAll('video'));
    const iframes = Array.from(document.querySelectorAll('iframe'));
    const loadingSpinners = Array.from(document.querySelectorAll('[class*="loading"], [class*="Loading"], [class*="spinner"]'));
    const errorElements = Array.from(document.querySelectorAll('[class*="error"], [class*="Error"]'));
    
    return {
      videoCount: videos.length,
      videoDetails: videos.map(v => ({
        src: v.src?.slice(0, 100),
        paused: v.paused,
        readyState: v.readyState,
        networkState: v.networkState,
        error: v.error?.code,
        muted: v.muted,
        width: v.offsetWidth,
        height: v.offsetHeight,
        display: window.getComputedStyle(v).display,
        visibility: window.getComputedStyle(v).visibility,
        poster: v.poster?.slice(0, 100),
      })),
      iframeCount: iframes.length,
      iframeDetails: iframes.map(i => ({
        src: i.src?.slice(0, 100),
        width: i.offsetWidth,
        height: i.offsetHeight,
        display: window.getComputedStyle(i).display,
      })),
      loadingSpinners: loadingSpinners.length,
      errorElements: errorElements.length,
      url: window.location.href,
    };
  });
  console.log('Viewer DOM state:', JSON.stringify(viewerDom, null, 2));

  console.log('\n=== STEP 7: Wait and check video playback ===');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/tmp/reels_05_playback.png' });

  const playbackState = await page.evaluate(() => {
    const videos = Array.from(document.querySelectorAll('video'));
    const iframes = Array.from(document.querySelectorAll('iframe[src*="youtube"]'));
    return {
      videoCount: videos.length,
      playingVideos: videos.filter(v => !v.paused).length,
      mutedVideos: videos.filter(v => v.muted).length,
      videoErrors: videos.filter(v => v.error).map(v => v.error?.code),
      youtubeIframes: iframes.length,
      currentUrl: window.location.href,
      pageVisible: !document.hidden,
    };
  });
  console.log('Playback state after 5s:', JSON.stringify(playbackState, null, 2));

  console.log('\n=== SUMMARY ===');
  console.log('Console errors:', consoleErrors.length);
  consoleErrors.forEach(e => console.log('  ERROR:', e));
  console.log('Console warnings (reel-related):', consoleWarnings.filter(w => w.toLowerCase().includes('reel')).length);
  consoleWarnings.filter(w => w.toLowerCase().includes('reel')).forEach(w => console.log('  WARN:', w));
  console.log('Network errors:', networkErrors.slice(0, 20));

  await browser.close();
  console.log('\nDone!');
})();
