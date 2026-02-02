const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.setViewport({ width: 430, height: 932 });

        console.log('=== FULL E2E VERIFICATION ===');
        console.log('1. Loading social feed...');
        await page.goto('http://localhost:3000/hub/social-media', { waitUntil: 'networkidle0', timeout: 60000 });
        await new Promise(r => setTimeout(r, 8000));

        // Scroll down to find articles
        console.log('2. Scrolling to find article posts...');
        for (let i = 0; i < 15; i++) {
            await page.evaluate(() => window.scrollBy(0, 300));
            await new Promise(r => setTimeout(r, 400));
        }

        // Count images
        const stats = await page.evaluate(() => {
            const imgs = document.querySelectorAll('img');
            const hasLinkIcon = document.body.innerHTML.includes('\uD83D\uDD17'); // 🔗

            // Find article cards with proper styling
            let articleCardCount = 0;
            let clickableArticles = 0;
            document.querySelectorAll('div').forEach(div => {
                const style = div.getAttribute('style') || '';
                const text = div.innerText || '';
                if (text.includes('News Article') || (text.includes('View Article') && text.includes('Click to read'))) {
                    articleCardCount++;
                    if (style.includes('cursor: pointer') || style.includes('cursor:pointer')) {
                        clickableArticles++;
                    }
                }
            });

            return {
                imageCount: imgs.length,
                hasLinkIconFallback: hasLinkIcon,
                articleCardCount,
                clickableArticles
            };
        });

        console.log('3. Results:');
        console.log('   Total images:', stats.imageCount);
        console.log('   Has link icon fallback:', stats.hasLinkIconFallback ? 'YES - BAD' : 'NO - GOOD');
        console.log('   Article cards found:', stats.articleCardCount);
        console.log('   Clickable articles:', stats.clickableArticles);

        // Take screenshot
        await page.screenshot({
            path: '/Users/smarter.poker/.gemini/antigravity/brain/2661f12b-6dbc-4229-a9c4-cbf9e50f4088/e2e_final_test.png',
            fullPage: false
        });
        console.log('4. Screenshot saved');

        // Final verdict
        console.log('\n=== VERIFICATION SUMMARY ===');
        if (stats.imageCount > 10 && !stats.hasLinkIconFallback) {
            console.log('✅ Images display: PASS');
        } else {
            console.log('❌ Images display: FAIL');
        }

        if (stats.articleCardCount > 0) {
            console.log('✅ Article cards present: PASS');
        } else {
            console.log('⚠️ Article cards: NOT FOUND (may need to scroll more)');
        }

        await browser.close();
    } catch (e) {
        console.error('ERROR:', e.message);
    }
})();
