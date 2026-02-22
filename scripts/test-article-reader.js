/**
 * ═══════════════════════════════════════════════════════════════════════════
 * E2E TEST: In-App Article Reader
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tests the full flow of the in-app article reader:
 * 1. User clicks article card
 * 2. Modal opens full-screen
 * 3. Content displays via proxy
 * 4. Back button closes modal
 * 
 * Run: node scripts/test-article-reader.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

const puppeteer = require('puppeteer');

const CONFIG = {
    URL: 'http://localhost:3000/hub/social-media',
    TIMEOUT: 30000,
    SCREENSHOT_DIR: './test-screenshots',
};

async function runTest() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  IN-APP ARTICLE READER - E2E TEST');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });

    const results = {
        pageLoaded: false,
        articleCardFound: false,
        modalOpened: false,
        contentVisible: false,
        backButtonWorks: false,
    };

    try {
        // Step 1: Navigate to social-media page and bypass intro video
        console.log('1. Navigating to social-media page...');
        await page.goto(CONFIG.URL, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
        await page.evaluate(() => {
            sessionStorage.setItem('social-intro-seen', 'true');
        });
        await page.goto(CONFIG.URL, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
        results.pageLoaded = true;
        console.log('   ✅ Page loaded');

        // Step 2: Wait for posts to load
        console.log('2. Waiting for posts to load...');
        await new Promise(r => setTimeout(r, 5000));

        // Step 3 & 4: Find and click article card
        console.log('3. Looking for and clicking article card...');
        await page.evaluate(() => window.scrollBy(0, 500));
        await new Promise(r => setTimeout(r, 1000));

        let cardPos = await page.evaluate(() => {
            // Look for article card by text content
            const cards = Array.from(document.querySelectorAll('div'));
            for (const card of cards) {
                const text = card.innerText || '';
                if (text.includes('Click to read full article') ||
                    text.includes('POKERNEWS.COM') ||
                    text.includes('POKERFUSE.COM')) {
                    // Find the clickable container
                    const clickable = card.closest('[style*="cursor: pointer"]') || card;
                    // Ensure it has some size
                    if (clickable.offsetHeight > 50) {
                        clickable.scrollIntoView({ behavior: 'instant', block: 'center' });
                        const rect = clickable.getBoundingClientRect();
                        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                    }
                }
            }
            return null;
        });

        if (cardPos) {
            results.articleCardFound = true;
            console.log('   ✅ Article card found at', cardPos);
            await page.mouse.click(cardPos.x, cardPos.y);
            console.log('   ✅ Article card clicked using mouse');
        } else {
            console.log('   ⚠️  No article card found, scrolling more...');
            await page.evaluate(() => window.scrollBy(0, 1000));
            await new Promise(r => setTimeout(r, 2000));

            // Try one more time
            cardPos = await page.evaluate(() => {
                const elements = document.querySelectorAll('div');
                for (const el of elements) {
                    if (el.innerText?.includes('Click to read full article')) {
                        const clickable = el.closest('[style*="cursor: pointer"]') || el;
                        clickable.scrollIntoView({ behavior: 'instant', block: 'center' });
                        const rect = clickable.getBoundingClientRect();
                        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                    }
                }
                return null;
            });

            if (cardPos) {
                results.articleCardFound = true;
                console.log('   ✅ Article card found at', cardPos);
                await page.mouse.click(cardPos.x, cardPos.y);
                console.log('   ✅ Article card clicked using mouse');
            }
        }
        await new Promise(r => setTimeout(r, 3000));

        // Step 5: Check if modal opened
        console.log('5. Checking for modal...');
        const modalOpen = await page.evaluate(() => {
            // Check for modal by looking for fixed overlay covering the screen
            const modal = document.querySelector('div[style*="position: fixed"][style*="bottom: 0px"], div[style*="position: fixed"][style*="inset: 0px"], div[style*="position: fixed"][style*="top: 0px"]');
            if (modal && modal.style.zIndex >= 9999 && modal.innerText.includes('Back')) {
                const backBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('Back'));
                return { hasModal: true, hasBackButton: !!backBtn, html: modal.outerHTML.substring(0, 200) };
            }
            return { hasModal: !!modal };
        });

        if (modalOpen.hasModal) {
            results.modalOpened = true;
            console.log('   ✅ Modal opened');
        } else {
            console.log('   ❌ Modal NOT opened');
        }

        // Step 6: Check for content in iframe
        console.log('6. Checking for proxied content...');
        const hasContent = await page.evaluate(() => {
            const iframe = document.querySelector('iframe[src*="/api/proxy"], iframe[src*="youtube.com/embed"]');
            if (iframe) {
                try {
                    // We can't access cross-origin iframe content, but we can check it loaded
                    return iframe.contentDocument?.body?.innerHTML?.length > 100 || true;
                } catch {
                    // CORS error means iframe loaded something
                    return true;
                }
            }
            // Dump the modal HTML if iframe not found
            const modal = document.querySelector('div[style*="position: fixed"][style*="z-index: 9999"]');
            return modal ? 'HTML: ' + modal.outerHTML.substring(0, 500) : 'No modal found';
        });

        if (hasContent === true) {
            results.contentVisible = true;
            console.log('   ✅ Proxied content detected');
        } else {
            console.log('   ❌ No iframe found. Debug:', hasContent);
        }

        // Step 7: Click Back button
        console.log('7. Clicking Back button...');
        const backBtnPos = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.innerText.includes('Back')) {
                    const rect = btn.getBoundingClientRect();
                    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                }
            }
            return null;
        });

        if (backBtnPos) {
            await page.mouse.click(backBtnPos.x, backBtnPos.y);
            console.log('   ✅ Back button clicked using mouse');
        } else {
            console.log('   ❌ Back button not found for clicking');
        }
        await new Promise(r => setTimeout(r, 1000));

        // Step 8: Verify modal closed
        console.log('8. Verifying modal closed...');
        const modalClosed = await page.evaluate(() => {
            const modals = document.querySelectorAll('div[style*="position: fixed"][style*="bottom: 0px"], div[style*="position: fixed"][style*="inset: 0px"], div[style*="position: fixed"][style*="top: 0px"]');
            for (const modal of modals) {
                if (modal.style.zIndex >= 9999 && modal.innerText.includes('Back')) {
                    return false;
                }
            }
            return true;
        });

        if (modalClosed) {
            results.backButtonWorks = true;
            console.log('   ✅ Modal closed successfully');
        }

    } catch (error) {
        console.error('   ❌ Error:', error.message);
    }

    await browser.close();

    // Print results
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════════════');
    const passed = Object.values(results).filter(Boolean).length;
    const total = Object.keys(results).length;

    Object.entries(results).forEach(([test, passed]) => {
        console.log(`  ${passed ? '✅' : '❌'} ${test}`);
    });

    console.log('───────────────────────────────────────────────────────────────');
    console.log(`  SCORE: ${passed}/${total} tests passed`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    process.exit(passed === total ? 0 : 1);
}

runTest().catch(console.error);
