import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Dan, 2026-10-11, three /hub/news fixes:
// 1. the phone layout follows the desktop one (hero, then a two-column card grid);
// 2. a source chip must change the stories on screen;
// 3. no per-source coloured stripe down the side of the cards.
const PAGE = readFileSync(new URL('../pages/hub/news.js', import.meta.url), 'utf8');
const STYLES = readFileSync(new URL('../src/components/news/LiveWireStyles.js', import.meta.url), 'utf8');

test('a selected source builds the top grid from that source, not the fixed source boxes', () => {
  assert.match(PAGE, /const FILTERED_TOP_GRID_SIZE = 7;/);
  assert.match(PAGE, /const sourceFilterActive = activeSourceFilters\.length > 0;/);
  assert.match(
    PAGE,
    /const allTopArticles = sourceFilterActive\s*\?\s*filteredNews\.filter\(a => activeSourceFilters\.includes\(a\.source_name\)\)\.slice\(0, FILTERED_TOP_GRID_SIZE\)\s*:\s*\(sourceBoxes\.length > 0/
  );
  // The grid is derived from the filtered feed, so the feed must exist first.
  assert.ok(PAGE.indexOf('const filteredNews = news.filter(') < PAGE.indexOf('const allTopArticles ='));
});

test('cards carry no coloured source stripe', () => {
  assert.doesNotMatch(PAGE, /\.news-box::before\s*\{/);
  assert.doesNotMatch(STYLES, /\.news-box::before\s*\{/);
  assert.doesNotMatch(PAGE, /background: var\(--src-accent/);
});

test('phone layout is a hero plus a two-column card grid with plain block wrappers', () => {
  const mobile = STYLES.slice(STYLES.indexOf('@media (max-width: 768px)'));
  assert.match(mobile, /\.news-grid:not\(\.news-grid-list\) \{[\s\S]{0,120}grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;/);
  assert.match(mobile, /> \.news-card-wrap \{[\s\S]{0,60}display: block !important;/);
  assert.match(mobile, /> \.news-card-wrap:first-child \{[\s\S]{0,60}grid-column: 1 \/ -1 !important;/);
  // The old phone rules made each card a 96px-wide row; they must not return.
  assert.doesNotMatch(mobile, /grid-template-columns: 96px/);
});
