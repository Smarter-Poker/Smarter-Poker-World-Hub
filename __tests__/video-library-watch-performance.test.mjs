/**
 * Watch page phone performance guarantees (2026-11-27).
 *
 * Measured on a 375px phone profile against production 387ba16e, before any
 * scroll or tap: 102 first-party requests / 2.06 MB, plus the YouTube embed
 * (16 requests / 1.15 MB). This pins the fixes:
 *
 * 1. The chrome border-image slices exist ONCE, in public/images/smarterdesign/.
 *    The Video Library used to ship byte-identical copies under
 *    public/assets/video-library/mast/ and console-pages/, so the watch page
 *    fetched the same chrome-active frame twice (and the SEO kit's copy a
 *    third time on other pages' caches).
 * 2. The below-the-fold account panels mount near the viewport, so their
 *    painted plates (about 113 KB of PNG) wait for a scroll.
 * 3. Related / channel thumbnails stay lazy and async.
 * 4. A size budget for the chrome art and the mast scene.
 *
 * What is deliberately NOT here: a click-to-play facade. Google's video
 * guidance says not to load primary content on user interaction, and these
 * pages exist so Google can index each video, so the privacy-enhanced player
 * stays in server HTML (pinned in video-library-watch-pages.test.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(join(root, p), 'utf8');
const WATCH_PAGE = read('pages/hub/video-library/watch/[videoId]/[[...slug]].js');
const CHROME_SLICES = ['chrome-readout', 'chrome-row', 'chrome-stat', 'chrome-active'];
const VIDEO_LIBRARY_STYLES = [
    'src/styles/worlds/video-library.css',
    'src/styles/worlds/video-library-pages.css',
    'src/components/video-library/VideoLibraryWorkspaceHeader.module.css',
];

function filesUnder(dir) {
    const abs = join(root, dir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs).flatMap(name => {
        const rel = join(dir, name);
        return statSync(join(root, rel)).isDirectory() ? filesUnder(rel) : [rel];
    });
}
const sha = rel => createHash('sha256').update(readFileSync(join(root, rel))).digest('hex');

test('the Video Library paints its chrome from the one shared copy of each slice', () => {
    for (const file of VIDEO_LIBRARY_STYLES) {
        const css = read(file);
        assert.doesNotMatch(css, /\/assets\/video-library\/(?:mast|console-pages)\/chrome-/, `${file} must not point at a duplicate chrome slice`);
        for (const match of css.matchAll(/url\('([^']*chrome-[a-z]+\.webp)'\)/g)) {
            assert.match(match[1], /^\/images\/smarterdesign\/chrome-(?:readout|row|stat|active)\.webp$/, `${file}: ${match[1]}`);
        }
    }
    const pages = read('src/styles/worlds/video-library-pages.css');
    for (const slice of CHROME_SLICES) assert.match(pages, new RegExp(`/images/smarterdesign/${slice}\\.webp`));
});

test('no Video Library asset is a byte-identical copy of another public image', () => {
    const shared = new Map(filesUnder('public/images/smarterdesign').map(f => [sha(f), f]));
    const seen = new Map();
    for (const file of filesUnder('public/assets/video-library')) {
        const hash = sha(file);
        assert.ok(!shared.has(hash), `${file} duplicates ${shared.get(hash)}; reference the shared copy`);
        assert.ok(!seen.has(hash), `${file} duplicates ${seen.get(hash)}`);
        seen.set(hash, file);
    }
});

test('the chrome art and mast scene stay inside their byte budgets', () => {
    const size = rel => statSync(join(root, rel)).size;
    let total = 0;
    for (const slice of CHROME_SLICES) {
        const bytes = size(`public/images/smarterdesign/${slice}.webp`);
        assert.ok(bytes <= 12 * 1024, `${slice}.webp is ${bytes} B (budget 12 KB)`);
        total += bytes;
    }
    assert.ok(total <= 32 * 1024, `chrome slices total ${total} B (budget 32 KB)`);
    assert.ok(size('public/assets/video-library/mast/video-library-mast-v1.webp') <= 100 * 1024, 'mast scene art over 100 KB');
    assert.ok(size('public/assets/video-library/mast/header-help-chrome-v1.png') <= 12 * 1024, 'help icon over 12 KB');
});

test('the below-the-fold account panels mount only near the viewport', () => {
    assert.match(WATCH_PAGE, /import DeferUntilNear from '[^']*src\/components\/video-library\/DeferUntilNear'/);
    assert.match(WATCH_PAGE, /<DeferUntilNear[^>]*>\s*<SmarterAccountUnlockGate/);
    assert.match(WATCH_PAGE, /<DeferUntilNear[^>]*>\s*<SmarterConversionCta/);
    const defer = read('src/components/video-library/DeferUntilNear.jsx');
    assert.match(defer, /new window\.IntersectionObserver/);
    assert.match(defer, /rootMargin: margin/);
    // No observer, no deferral: the panel renders rather than vanishing.
    assert.match(defer, /typeof window\.IntersectionObserver !== 'function'\)\s*\{\s*setNear\(true\)/);
    assert.match(defer, /observer\.disconnect\(\)/);
});

test('related and channel thumbnails are lazy and decode off the main thread', () => {
    const thumb = read('src/components/video-library/VideoThumbnail.jsx');
    assert.match(thumb, /priority = false/);
    assert.match(thumb, /loading=\{priority \? 'eager' : 'lazy'\}/);
    assert.match(thumb, /decoding="async"/);
    const list = WATCH_PAGE.slice(WATCH_PAGE.indexOf('function VideoList'), WATCH_PAGE.indexOf('export default function VideoWatchPage'));
    assert.match(list, /<Thumbnail videoId=\{item\.videoId\} size="mqdefault"/);
    assert.doesNotMatch(list, /priority/);
    assert.match(WATCH_PAGE, /<img src=\{channel\.logo\} alt="" loading="lazy" decoding="async" \/>/);
});

test('the one player is the privacy-enhanced embed, present without a tap and never autoplaying', () => {
    const iframes = WATCH_PAGE.match(/<iframe\b/g) || [];
    assert.equal(iframes.length, 1);
    assert.match(WATCH_PAGE, /src=\{`https:\/\/www\.youtube-nocookie\.com\/embed\/\$\{video\.videoId\}\?autoplay=0&/);
    assert.doesNotMatch(WATCH_PAGE, /src=\{`https:\/\/www\.youtube\.com\/embed/);
});
