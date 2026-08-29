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

try {
    const visual = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const visualPage = await visual.newPage();
    visualPage.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await visualPage.goto(`${BASE_URL}/hub/training/category/MTT?revision=casino-realism-audit`, { waitUntil: 'networkidle' });
    await visualPage.locator('.sp-category-grid').waitFor();
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
    await visualPage.screenshot({ path: join(OUTPUT, 'category-mobile.png'), fullPage: false });
    const mobileOverflow = await visualPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(mobileOverflow <= 1, `mobile page overflows horizontally by ${mobileOverflow}px`);
    await visual.close();

    const audit = await browser.newContext({ viewport: { width: 430, height: 900 } });
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
            await card.scrollIntoViewIfNeeded();
            const destination = new URL(`/hub/training/play/${game.id}`, BASE_URL).pathname;
            await Promise.all([
                page.waitForURL((url) => url.pathname === destination, { timeout: 10_000 }),
                card.click(),
            ]);
            clicked.push(game.id);
            await page.goto(categoryUrl, { waitUntil: 'domcontentloaded' });
            await page.locator('.sp-category-grid').waitFor();
        }
    }

    assert.deepEqual(clicked, games.map((game) => game.id));
    assert.equal(artwork.size, 107, 'all card image URLs must be unique');
    await audit.close();

    process.stdout.write(JSON.stringify({
        baseUrl: BASE_URL,
        clickedGames: clicked.length,
        uniqueArtworkUrls: artwork.size,
        desktopGeometry,
        mobileOverflow,
        consoleErrors,
        screenshots: [
            join(OUTPUT, 'category-desktop.png'),
            join(OUTPUT, 'category-mobile.png'),
        ],
    }, null, 2));
} finally {
    await browser.close();
}

