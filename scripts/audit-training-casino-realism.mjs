import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = process.argv[2] || 'http://127.0.0.1:3012';
const OUTPUT = join(ROOT, '.agent/audits/training-casino-realism');
mkdirSync(OUTPUT, { recursive: true });

const source = readFileSync(join(ROOT, 'src/data/TRAINING_LIBRARY.js'), 'utf8');
const block = source.match(/export const TRAINING_LIBRARY = \[([\s\S]*?)\n\];/)?.[1] || '';
const games = [...block.matchAll(/\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*focus:\s*'([^']+)',\s*category:\s*'([^']+)'/g)]
    .map((match) => ({ id: match[1], name: match[2], focus: match[3], category: match[4] }));

assert.equal(games.length, 107, 'the click audit must cover the complete 107-game catalog');

const browser = await chromium.launch({ headless: true });
const consoleErrors = [];

async function revealLazyArtwork(page) {
    await page.evaluate(async () => {
        const step = Math.max(320, Math.floor(window.innerHeight * 0.75));
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise((resolve) => setTimeout(resolve, 35));
        }
        window.scrollTo(0, 0);
    });
    await page.waitForTimeout(350);
}

async function assertArtworkLoaded(page, category) {
    const broken = await page.locator('.sp-casino-game-visual img').evaluateAll((images) => images
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.getAttribute('src')));
    assert.deepEqual(broken, [], `${category} has broken or unloaded artwork: ${broken.join(', ')}`);
}

try {
    const visual = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const visualPage = await visual.newPage();
    visualPage.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await visualPage.goto(`${BASE_URL}/hub/training/category/MTT?revision=casino-realism-audit`, { waitUntil: 'networkidle' });
    await visualPage.locator('.sp-category-grid').waitFor();
    await revealLazyArtwork(visualPage);
    await assertArtworkLoaded(visualPage, 'MTT desktop');
    await visualPage.screenshot({ path: join(OUTPUT, 'category-desktop.png'), fullPage: true });

    const desktopGeometry = await visualPage.locator('.sp-casino-game-card').first().evaluate((element) => {
        const style = getComputedStyle(element);
        return { borderRadius: style.borderRadius, clipPath: style.clipPath, minHeight: style.minHeight };
    });
    assert.equal(desktopGeometry.borderRadius, '0px');
    assert.ok(desktopGeometry.clipPath === 'none' || desktopGeometry.clipPath === 'unset');

    await visualPage.setViewportSize({ width: 390, height: 844 });
    await visualPage.goto(`${BASE_URL}/hub/training/category/ADVANCED?revision=casino-realism-audit-mobile`, { waitUntil: 'networkidle' });
    await visualPage.locator('.sp-category-grid').waitFor();
    await revealLazyArtwork(visualPage);
    await assertArtworkLoaded(visualPage, 'ADVANCED mobile');
    await visualPage.screenshot({ path: join(OUTPUT, 'category-mobile.png'), fullPage: false });
    const mobileOverflow = await visualPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(mobileOverflow <= 1, `mobile page overflows horizontally by ${mobileOverflow}px`);

    const responsiveCategories = [];
    for (const category of ['MTT', 'CASH', 'SPINS', 'PSYCHOLOGY', 'ADVANCED']) {
        await visualPage.goto(`${BASE_URL}/hub/training/category/${category}?revision=casino-realism-responsive-audit`, { waitUntil: 'networkidle' });
        await visualPage.locator('.sp-category-grid').waitFor();
        await revealLazyArtwork(visualPage);
        await assertArtworkLoaded(visualPage, `${category} mobile`);
        const overflow = await visualPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `${category} mobile page overflows horizontally by ${overflow}px`);
        responsiveCategories.push(category);
    }
    await visual.close();

    const audit = await browser.newContext({ viewport: { width: 430, height: 900 }, reducedMotion: 'reduce' });
    await audit.route(/\.(?:png|jpe?g|webp|gif|svg)(?:\?|$)/i, (route) => route.abort());
    const page = await audit.newPage();
    const clicked = [];
    const artwork = new Set();

    for (const category of ['MTT', 'CASH', 'SPINS', 'PSYCHOLOGY', 'ADVANCED']) {
        const categoryGames = games.filter((game) => game.category === category);
        const categoryUrl = `${BASE_URL}/hub/training/category/${category}?revision=casino-realism-click-audit`;
        await page.goto(categoryUrl, { waitUntil: 'domcontentloaded' });
        await page.locator('.sp-category-grid').waitFor();
        assert.equal(await page.locator('.sp-casino-game-card').count(), categoryGames.length, `${category} card count`);

        const imageSources = await page.locator('.sp-casino-game-visual img').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
        imageSources.forEach((src) => artwork.add(src));

        for (const game of categoryGames) {
            const card = page.getByRole('button', { name: new RegExp(`^${game.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`) });
            assert.equal(await card.count(), 1, `${game.id} must have one clickable game card`);
            const destination = new URL(`/hub/training/play/${game.id}`, BASE_URL).pathname;
            await Promise.all([
                page.waitForURL((url) => url.pathname === destination, { timeout: 10_000 }),
                // The catalog can restore its previous scroll position after
                // each return navigation. The unique semantic button has
                // already been resolved, so dispatch its native click instead
                // of letting Playwright reject an off-viewport animation frame.
                card.evaluate((element) => element.click()),
            ]);
            clicked.push(game.id);
            await page.goto(categoryUrl, { waitUntil: 'domcontentloaded' });
            await page.locator('.sp-category-grid').waitFor();
        }
    }

    assert.deepEqual(clicked, games.map((game) => game.id));
    assert.equal(artwork.size, 107, 'all card image URLs must be unique');
    await audit.close();

    const unexpectedConsoleErrors = consoleErrors.filter((message) => !message.includes('/_next/hmr'));
    assert.deepEqual(unexpectedConsoleErrors, [], `unexpected browser console errors: ${unexpectedConsoleErrors.join(' | ')}`);

    process.stdout.write(JSON.stringify({
        baseUrl: BASE_URL,
        clickedGames: clicked.length,
        uniqueArtworkUrls: artwork.size,
        desktopGeometry,
        mobileOverflow,
        responsiveCategories,
        consoleErrors,
        screenshots: [
            join(OUTPUT, 'category-desktop.png'),
            join(OUTPUT, 'category-mobile.png'),
        ],
    }, null, 2));
} finally {
    await browser.close();
}
