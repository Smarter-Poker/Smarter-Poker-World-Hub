const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
  });
  const page = await context.newPage();

  const allErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      allErrors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  // Login
  await page.goto('https://smarter.poker/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
  await page.fill('input[type="password"]', 'Bek454545!!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/hub**', { timeout: 10000 });
  console.log('Logged in');

  // Navigate directly to reels page
  await page.goto('https://smarter.poker/hub/social-media', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // Skip intro
  try {
    const skip = await page.$('button:has-text("Skip")');
    if (skip) { await skip.click(); await page.waitForTimeout(500); }
  } catch(e) {}

  // Now click the Reels nav link specifically (it goes to reels section)
  const reelsLink = await page.$('a[href*="reel"]');
  if (reelsLink) {
    const href = await reelsLink.getAttribute('href');
    console.log('Reels link href:', href);
    await reelsLink.click();
    await page.waitForTimeout(4000);
  }

  console.log('Current URL:', page.url());
  await page.screenshot({ path: '/tmp/reels_v2_01.png' });

  // Get full detailed DOM
  const domInfo = await page.evaluate(() => {
    const videos = Array.from(document.querySelectorAll('video'));
    const iframes = Array.from(document.querySelectorAll('iframe'));

    // Check for broken video URLs (00000000 UUIDs)
    const brokenVideos = videos.filter(v => v.src?.includes('00000000'));
    
    // Check for zero-dimension iframes
    const zeroSizeIframes = iframes.filter(i => i.offsetWidth === 0 || i.offsetHeight === 0);
    
    // Get all visible text to understand current page state
    const visibleText = document.body.innerText.slice(0, 1000);
    
    // Check if ReelsViewer is open
    const reelsViewer = document.querySelector('[class*="ReelsViewer"], [class*="reels-viewer"]');
    
    // Check for play buttons / paused overlays
    const playButtons = Array.from(document.querySelectorAll('button')).filter(b => 
      b.innerHTML.includes('▶') || b.title?.toLowerCase().includes('play')
    );
    
    return {
      totalVideos: videos.length,
      playingVideos: videos.filter(v => !v.paused).length,
      brokenVideoCount: brokenVideos.length,
      brokenVideoUrls: brokenVideos.map(v => v.src?.slice(0, 80)),
      zeroSizeIframes: zeroSizeIframes.length,
      iframeDetails: iframes.map(i => ({
        src: i.src?.slice(0, 80),
        w: i.offsetWidth, h: i.offsetHeight,
        display: window.getComputedStyle(i).display,
        visibility: window.getComputedStyle(i).visibility,
        parentDisplay: i.parentElement ? window.getComputedStyle(i.parentElement).display : 'unknown',
      })),
      reelsViewerOpen: !!reelsViewer,
      pageUrl: window.location.href,
      visibleText: visibleText,
    };
  });
  console.log('DOM Info:', JSON.stringify(domInfo, null, 2));

  // Now click on the first reel card to open viewer
  console.log('\n--- Clicking first reel ---');
  const reelCards = await page.$$('[class*="reel"], [class*="Reel"]');
  console.log('Reel card elements found:', reelCards.length);
  
  if (reelCards.length > 0) {
    await reelCards[0].click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/reels_v2_02_viewer.png' });
    
    const viewerInfo = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      const iframes = Array.from(document.querySelectorAll('iframe'));
      const playBtn = document.querySelector('[aria-label*="play"], [title*="play"], button[class*="play"]');
      const pauseOverlay = document.querySelector('[class*="overlay"], [class*="Overlay"]');
      
      return {
        videoCount: videos.length,
        videoPlaying: videos.filter(v => !v.paused).length,
        videoDetails: videos.slice(0, 3).map(v => ({
          src: v.src?.slice(0, 80),
          paused: v.paused,
          readyState: v.readyState,
          muted: v.muted,
          w: v.offsetWidth,
          h: v.offsetHeight,
          display: window.getComputedStyle(v).display,
        })),
        iframeCount: iframes.length,
        iframeDetails: iframes.map(i => ({
          src: i.src?.slice(0, 80),
          w: i.offsetWidth,
          h: i.offsetHeight,
        })),
        hasPlayButton: !!playBtn,
        hasOverlay: !!pauseOverlay,
        url: window.location.href,
      };
    });
    console.log('Viewer info after click:', JSON.stringify(viewerInfo, null, 2));
    
    // Wait more and take another screenshot
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/reels_v2_03_playing.png' });
    
    const playingInfo = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      return {
        videoCount: videos.length,
        playingVideos: videos.filter(v => !v.paused).length,
        readyStates: videos.map(v => v.readyState),
        networkStates: videos.map(v => v.networkState),
        errors: videos.filter(v => v.error).map(v => ({ code: v.error.code, msg: v.error.message })),
      };
    });
    console.log('Playing state after 5s:', JSON.stringify(playingInfo, null, 2));
  }

  console.log('\n--- All console messages ---');
  allErrors.forEach(e => console.log(e));
  
  await browser.close();
})();
