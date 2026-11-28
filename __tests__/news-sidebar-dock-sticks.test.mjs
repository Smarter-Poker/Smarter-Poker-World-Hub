import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The desktop sidebar dock is position: sticky. On 2026-11-28 it shipped and
// never stuck, because .news-hub carried overflow-x: hidden, which makes the
// page a scroll container and pins sticky children to it instead of the window.
const css = readFileSync(new URL('../src/components/news/NewsSmarterDesignStyles.js', import.meta.url), 'utf8');

test('the desktop dock is sticky and the page wrapper clips instead of scrolling', () => {
    const desktop = css.slice(css.indexOf('@media (min-width: 1001px)'));
    assert.match(desktop, /\.news-hub\.smarterdesign \{\s*overflow-x: clip !important;\s*overflow-y: visible !important;/);
    assert.match(desktop, /\.sidebar-dock \{\s*position: sticky;/);
});

test('the dock dissolves into the sidebar grid at 1000px and below', () => {
    assert.match(css, /@media \(max-width: 1000px\) \{\s*\.news-hub\.smarterdesign \.sidebar-dock \{\s*display: contents;/);
});
