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

const fs = require('fs');
const puppeteer = require('puppeteer');

const defaultChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const configuredChromePath = process.env.PUPPETEER_EXECUTABLE_PATH
    || (fs.existsSync(defaultChromePath) ? defaultChromePath : undefined);

const CONFIG = {
    URL: process.env.ARTICLE_READER_BASE_URL
        ? `${process.env.ARTICLE_READER_BASE_URL.replace(/\/$/, '')}/hub/social-media`
        : 'http://localhost:3000/hub/social-media',
    TIMEOUT: 30000,
    SCREENSHOT_DIR: './test-screenshots',
};

async function runTest() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  IN-APP ARTICLE READER - E2E TEST');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const browser = await puppeteer.launch({
        headless: 'new',
        ...(configuredChromePath ? { executablePath: configuredChromePath } : {}),
    });
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
        // The install prompt shares the same fixed/z-index visual vocabulary as
        // the reader. Dismiss it so it cannot be mistaken for the article modal
        // or intercept a card click in a fresh browser profile.
        await page.evaluate(() => {
            const installPrompt = document.querySelector(
                '[role="dialog"][aria-label="Install Smarter Poker"]'
            );
            installPrompt?.querySelector('button')?.click();
        });

        // Step 3 & 4: Find and click article card
        console.log('3. Looking for and clicking article card...');
        await page.evaluate(() => window.scrollBy(0, 500));
        await new Promise(r => setTimeout(r, 1000));

        let cardPos = await page.evaluate(() => {
            // Start from the smallest matching text node. Scanning broad divs
            // can select the entire feed and click its center instead of the card.
            const labels = Array.from(document.querySelectorAll('div, span, p'))
                .filter((el) => el.children.length === 0);
            for (const label of labels) {
                const text = label.innerText || '';
                if (text.includes('Click to read full article')) {
                    const clickable = label.closest('[style*="cursor: pointer"]');
                    // Ensure it has some size
                    if (clickable?.offsetHeight > 50) {
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
                const elements = document.querySelectorAll('div, span, p');
                for (const el of elements) {
                    if (el.children.length === 0 && el.innerText?.includes('Click to read full article')) {
                        const clickable = el.closest('[style*="cursor: pointer"]');
                        if (!clickable) continue;
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
            const iframe = document.querySelector('iframe[src*="/api/proxy"], iframe[src*="youtube.com/embed"]');
            const modal = iframe?.closest('div[style*="position: fixed"]');
            const backBtn = modal
                ? Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('Back'))
                : null;
            return { hasModal: !!modal, hasBackButton: !!backBtn };
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
                    // Same-origin proxied articles must contain a meaningful document.
                    // Cross-origin embeds cannot be inspected, but a populated src proves
                    // that the reader mounted the requested external content.
                    if (iframe.contentDocument) {
                        return (iframe.contentDocument.body?.innerHTML?.length || 0) > 100;
                    }
                    return Boolean(iframe.getAttribute('src'));
                } catch {
                    return Boolean(iframe.getAttribute('src'));
                }
            }
            // Dump the modal HTML if iframe not found
            const modal = document.querySelector('iframe[src*="/api/proxy"], iframe[src*="youtube.com/embed"]')
                ?.closest('div[style*="position: fixed"]');
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
            const iframe = document.querySelector('iframe[src*="/api/proxy"], iframe[src*="youtube.com/embed"]');
            const modal = iframe?.closest('div[style*="position: fixed"]');
            const btn = modal
                ? Array.from(modal.querySelectorAll('button')).find((candidate) => candidate.innerText.includes('Back'))
                : null;
            if (!btn) return null;
            const rect = btn.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
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
            return !document.querySelector(
                'iframe[src*="/api/proxy"], iframe[src*="youtube.com/embed"]'
            );
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

runTest().catch((error) => {
    console.error('   ❌ Fatal test error:', error.message);
    process.exitCode = 1;
});
