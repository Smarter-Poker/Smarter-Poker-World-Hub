const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();

  const allMessages = [];
  page.on('console', msg => {
    allMessages.push(`[${msg.type()}] ${msg.text()}`);
  });

  const networkErrors = [];
  page.on('response', r => {
    if (!r.ok() && r.status() !== 304 && r.status() !== 308) {
      networkErrors.push(`[${r.status()}] ${r.url().slice(0, 100)}`);
    }
  });

  // Login
  await page.goto('https://smarter.poker/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
  await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/hub**', { timeout: 10000 });
  console.log('✅ Logged in');

  // Navigate directly to /hub/reels
  console.log('\n=== Navigating to /hub/reels ===');
  await page.goto('https://smarter.poker/hub/reels', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: '/tmp/reels_direct_01.png' });
  console.log('Screenshot: /tmp/reels_direct_01.png');
  console.log('URL:', page.url());

  // Check initial DOM state on /hub/reels
  const initialState = await page.evaluate(() => {
    const videos = Array.from(document.querySelectorAll('video'));
    const iframes = Array.from(document.querySelectorAll('iframe'));
    const loadingEls = Array.from(document.querySelectorAll('[class*="loading"], [class*="Loading"], [class*="spinner"], [class*="Spinner"]'));
    const errorEls = Array.from(document.querySelectorAll('[class*="error"], [class*="Error"]'));
    
    return {
      videoCount: videos.length,
      playingVideos: videos.filter(v => !v.paused).length,
      iframeCount: iframes.length,
      loadingElements: loadingEls.length,
      errorElements: errorEls.length,
      loadingTexts: loadingEls.map(el => el.textContent?.trim().slice(0, 50)),
      errorTexts: errorEls.map(el => el.textContent?.trim().slice(0, 50)),
      pageText: document.body.innerText.slice(0, 500),
      url: window.location.href,
    };
  });
  console.log('\nInitial /hub/reels state:', JSON.stringify(initialState, null, 2));

  // Wait more for reels to load
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/reels_direct_02_loaded.png' });
  console.log('Screenshot: /tmp/reels_direct_02_loaded.png');

  const loadedState = await page.evaluate(() => {
    const videos = Array.from(document.querySelectorAll('video'));
    const iframes = Array.from(document.querySelectorAll('iframe'));
    const brokenVideos = videos.filter(v => v.src?.includes('00000000'));
    
    return {
      videoCount: videos.length,
      playingVideos: videos.filter(v => !v.paused).length,
      brokenVideoUrls: brokenVideos.map(v => v.src?.slice(0, 100)),
      iframeCount: iframes.length,
      iframeDetails: iframes.map(i => ({
        src: i.src?.slice(0, 100),
        width: i.offsetWidth,
        height: i.offsetHeight,
        display: window.getComputedStyle(i).display,
        visibility: window.getComputedStyle(i).visibility,
        position: window.getComputedStyle(i).position,
        zIndex: window.getComputedStyle(i).zIndex,
        parentClasses: i.parentElement?.className?.slice(0, 80),
        grandparentClasses: i.parentElement?.parentElement?.className?.slice(0, 80),
      })),
      videoDetails: videos.slice(0, 5).map(v => ({
        src: v.src?.slice(0, 100),
        paused: v.paused,
        readyState: v.readyState,
        networkState: v.networkState,
        muted: v.muted,
        width: v.offsetWidth,
        height: v.offsetHeight,
        display: window.getComputedStyle(v).display,
        visibility: window.getComputedStyle(v).visibility,
        error: v.error?.code,
        parentClasses: v.parentElement?.className?.slice(0, 80),
      })),
      pageText: document.body.innerText.slice(0, 500),
    };
  });
  console.log('\nLoaded state:', JSON.stringify(loadedState, null, 2));

  // Try to interact - tap on the video area
  console.log('\n=== Tapping video area ===');
  try {
    await page.tap('video', { timeout: 5000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/reels_direct_03_tapped.png' });
    console.log('Screenshot: /tmp/reels_direct_03_tapped.png');
    
    const afterTap = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      return {
        videoCount: videos.length,
        playingVideos: videos.filter(v => !v.paused).length,
        mutedVideos: videos.filter(v => v.muted).length,
        readyStates: videos.slice(0,3).map(v => v.readyState),
      };
    });
    console.log('After tap state:', JSON.stringify(afterTap, null, 2));
  } catch (e) {
    console.log('Tap failed:', e.message.slice(0, 100));
  }

  // Swipe up to go to next reel
  console.log('\n=== Swiping up (next reel) ===');
  try {
    await page.touchscreen.swipe(195, 600, 195, 100, { steps: 10 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/reels_direct_04_swiped.png' });
    console.log('Screenshot: /tmp/reels_direct_04_swiped.png');
    
    const afterSwipe = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      const iframes = Array.from(document.querySelectorAll('iframe'));
      return {
        url: window.location.href,
        videoCount: videos.length,
        playingVideos: videos.filter(v => !v.paused).length,
        currentVideoSrc: videos[0]?.src?.slice(0, 80),
        iframeCount: iframes.length,
        iframeSrc: iframes[0]?.src?.slice(0, 80),
      };
    });
    console.log('After swipe state:', JSON.stringify(afterSwipe, null, 2));
  } catch (e) {
    console.log('Swipe failed:', e.message.slice(0, 100));
  }

  console.log('\n=== Console Messages ===');
  const reelMessages = allMessages.filter(m => 
    m.toLowerCase().includes('reel') || 
    m.toLowerCase().includes('video') || 
    m.toLowerCase().includes('youtube') ||
    m.toLowerCase().includes('error') ||
    m.toLowerCase().includes('fail') ||
    m.toLowerCase().includes('warn')
  );
  reelMessages.forEach(m => console.log(m));
  
  console.log('\n=== Network Errors ===');
  networkErrors.forEach(e => console.log(e));

  await browser.close();
  console.log('\nDone!');
})();
