import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2026-10-12: the hub rendered all 107 game cards (~5,250 of 5,600 elements)
// at once, which kept it unresponsive for ~7s in Safari's engine. The first
// cards render immediately; the rest mount in batches as the reader scrolls.
const hub = readFileSync(new URL('../pages/hub/training.js', import.meta.url), 'utf8');

test('the training hub renders a first batch of game cards, not the whole library', () => {
  assert.match(hub, /const INITIAL_GAME_CARDS = 12;/);
  assert.match(hub, /const GAME_CARD_BATCH = 24;/);
  assert.match(hub, /const visibleGames = filtered\.slice\(0, visibleCardCount\);/);
  assert.match(hub, /\{visibleGames\.map\(g => \(/);
  assert.doesNotMatch(hub, /\{filtered\.map\(g => \(/);
});

test('the rest of the library mounts as the reader approaches it, and filters restart the batch', () => {
  assert.match(hub, /new IntersectionObserver\(/);
  assert.match(hub, /rootMargin: '1200px 0px'/);
  assert.match(hub, /setVisibleCardCount\(\(count\) => Math\.min\(filtered\.length, count \+ GAME_CARD_BATCH\)\)/);
  assert.match(hub, /useEffect\(\(\) => \{ setVisibleCardCount\(INITIAL_GAME_CARDS\); \}, \[activeCat, debouncedQuery\]\);/);
  // Without IntersectionObserver every card renders rather than none.
  assert.match(hub, /typeof IntersectionObserver !== 'function'\) \{\s*setVisibleCardCount\(filtered\.length\);/);
});
