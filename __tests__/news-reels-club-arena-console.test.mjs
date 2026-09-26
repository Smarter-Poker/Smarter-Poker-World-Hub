import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = fs.readFileSync(path.join(ROOT, 'pages/hub/news.js'), 'utf8');
const CARD = fs.readFileSync(path.join(ROOT, 'src/components/news/ReelCard.js'), 'utf8');

function between(source, start, end) {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex + start.length);
    assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
    assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
    return source.slice(startIndex, endIndex + end.length);
}

const PREVIEW = between(
    NEWS,
    'CLUB ARENA NEWS REELS PREVIEW START',
    'CLUB ARENA NEWS REELS PREVIEW END'
);
const FULL = between(
    NEWS,
    'CLUB ARENA NEWS REELS FULL START',
    'CLUB ARENA NEWS REELS FULL END'
);
const VIEWER = between(
    NEWS,
    'CLUB ARENA NEWS REELS VIEWER START',
    'CLUB ARENA NEWS REELS VIEWER END'
);
const REELS_CSS = between(
    NEWS,
    'CLUB ARENA NEWS REELS CSS START',
    'CLUB ARENA NEWS REELS CSS END'
);

test('News Reels surfaces use one exact shared console master per surface', () => {
    assert.match(NEWS, /from '\.\.\/\.\.\/src\/components\/video-library\/console'/);

    for (const [name, surface] of Object.entries({ PREVIEW, FULL, VIEWER })) {
        assert.equal(
            (surface.match(/<VideoLibraryConsole\b/g) || []).length,
            1,
            `${name} must contain exactly one console master`
        );
        assert.match(surface, /titleAs="h2"/);
    }

    assert.match(PREVIEW, /foot="foot"/);
    assert.match(FULL, /foot="foot"/);
    assert.match(VIEWER, /plates=\{\{/);
    assert.match(VIEWER, /titleId="news-reels-viewer-title"/);
    assert.match(NEWS, /aria-labelledby="news-reels-viewer-title"/);
});

test('Reel scans are real media or explicit no-image text, never generic art', () => {
    assert.doesNotMatch(CARD, /FALLBACK_IMAGES|default-avatar|lucide-react|<svg|<Play\b/);
    assert.match(CARD, /thumbnailUrl && !posterFailed/);
    assert.match(CARD, /Poster Unavailable/);
    assert.match(CARD, /https:\/\/img\.youtube\.com\/vi\/\$\{videoId\}\/hqdefault\.jpg/);
    assert.match(CARD, /<button[\s\S]*?type="button"[\s\S]*?aria-label=\{`Play Reel:/);

    for (const forbidden of [
        /border-radius/i,
        /linear-gradient/i,
        /radial-gradient/i,
        /box-shadow/i,
        /:hover/i,
        /onMouseEnter|onMouseLeave/,
    ]) {
        assert.doesNotMatch(CARD, forbidden);
    }
});

test('News Reels listing states and controls stay inside the console glass', () => {
    assert.match(PREVIEW, /Loading Reels\.\.\./);
    assert.match(PREVIEW, /Reels Are Temporarily Unavailable\./);
    assert.match(PREVIEW, /No Reels Available Yet\. Check Back Soon\./);
    assert.match(FULL, /Loading Reels\.\.\./);
    assert.match(FULL, /Reels Are Temporarily Unavailable\./);
    assert.match(FULL, /No Reels Available Yet\. Check Back Soon\./);
    assert.match(PREVIEW, /See All Reels/);
    assert.match(PREVIEW, /Previous Reels/);
    assert.match(PREVIEW, /Next Reels/);

    for (const surface of [PREVIEW, FULL, VIEWER]) {
        assert.doesNotMatch(surface, /<Film\b|<Chevron|<svg|FALLBACK_IMAGES/);
        assert.doesNotMatch(surface, /linear-gradient|borderRadius|boxShadow|onMouseEnter|onMouseLeave/i);
    }
});

test('opening and navigating News Reels retains exact index wiring', () => {
    assert.match(PREVIEW, /reels\.slice\(0, 10\)\.map\(\(reel, idx\) =>/);
    assert.match(PREVIEW, /onClick=\{\(\) => openReelViewer\(idx\)\}/);
    assert.match(FULL, /reels\.map\(\(reel, idx\) =>/);
    assert.match(FULL, /onClick=\{\(\) => openReelViewer\(idx\)\}/);
    assert.match(VIEWER, /label: 'Previous Reel'/);
    assert.match(VIEWER, /Math\.max\(safeReelIndex - 1, 0\)/);
    assert.match(VIEWER, /disabled: safeReelIndex === 0/);
    assert.match(VIEWER, /label: 'Next Reel'/);
    assert.match(VIEWER, /Math\.min\(safeReelIndex \+ 1, reels\.length - 1\)/);
    assert.match(VIEWER, /disabled: safeReelIndex >= reels\.length - 1/);
    assert.match(NEWS, /if \(start > end && safeReelIndex < reels\.length - 1\)/);
    assert.match(NEWS, /if \(start < end && safeReelIndex > 0\)/);
});

test('Reels CSS is mobile first, tactile, and contains no generic chrome', () => {
    assert.match(REELS_CSS, /min-height: 44px/);
    assert.match(REELS_CSS, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(REELS_CSS, /@media \(min-width: 769px\)/);
    assert.match(REELS_CSS, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(REELS_CSS, /scroll-snap-type: x mandatory/);
    assert.match(REELS_CSS, /:focus-visible/);
    assert.match(REELS_CSS, /:active/);

    for (const forbidden of [
        /border-radius/i,
        /linear-gradient/i,
        /radial-gradient/i,
        /box-shadow/i,
        /:hover/i,
    ]) {
        assert.doesNotMatch(REELS_CSS, forbidden);
    }
});

test('viewer recovery, keyboard containment, and real media playback remain wired', () => {
    assert.match(NEWS, /surface: 'NewsReelsViewer'/);
    assert.match(NEWS, /if \(e\.key === 'Escape'\)/);
    assert.match(NEWS, /querySelectorAll\('button:not\(\[disabled\]\), a\[href\], video\[controls\]'\)/);
    assert.match(VIEWER, /www\.youtube-nocookie\.com\/embed/);
    assert.match(VIEWER, /<YouTubeErrorOverlay/);
    assert.match(VIEWER, /actionLabel="Skipping In 3 Seconds"/);
    assert.match(VIEWER, /<video/);
    assert.match(VIEWER, /onEnded=\{\(\) =>/);
    assert.match(VIEWER, /onError=\{\(\) =>/);
    assert.match(VIEWER, /Close Viewer/);
});

