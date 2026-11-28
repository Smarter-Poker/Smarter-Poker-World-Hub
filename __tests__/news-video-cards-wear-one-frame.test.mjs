import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Owner, 2026-11-27: the Poker Videos cards showed a thick rounded silver frame
// behind the thin chrome rim. The card itself draws no frame; the rim comes
// from NewsSmarterDesignStyles alone.
const card = readFileSync(new URL('../src/components/news/VideoCard.js', import.meta.url), 'utf8');
const sd = readFileSync(new URL('../src/components/news/NewsSmarterDesignStyles.js', import.meta.url), 'utf8');

test('a video card draws no frame of its own', () => {
    assert.doesNotMatch(card, /\.video-card::after/);
    assert.doesNotMatch(card, /border:\s*\d+px solid rgba\(180, 195, 220/);
    for (const selector of ['.video-card {', '.video-thumbnail {']) {
        const start = card.indexOf(selector);
        assert.notEqual(start, -1, `missing ${selector}`);
        const rule = card.slice(start, card.indexOf('}', start));
        assert.match(rule, /border-radius: 0;/, `${selector} must be square under the chrome rim`);
    }
});

test('the one frame is the thin chrome rim', () => {
    assert.match(sd, /\.news-hub\.smarterdesign \.video-card,[\s\S]*?border: 3px solid transparent !important;\s*border-image: var\(--nsd-row\) !important;/);
});
