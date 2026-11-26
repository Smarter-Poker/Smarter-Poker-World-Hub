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

test('training home and category games open a dedicated preset arena', () => {
  const category = readFileSync(new URL('../pages/hub/training/category/[categoryId].js', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../pages/hub/training/arena/[gameId].js', import.meta.url), 'utf8');

  assert.match(hub, /<Link key=\{category\}[^\n]+href=\{`\/hub\/training\/category\//);
  assert.match(hub, /onStart=\{\(\) => playGame\(g\)\}/);
  assert.ok(hub.indexOf('id="training-library"') < hub.indexOf('aria-labelledby="stats-h"'));
  assert.doesNotMatch(category, /data-specialty-brain-panel|data-brain-variant-tab/);
  assert.match(category, /onClick=\{playGame\}/);
  for (const source of [hub, category]) {
    assert.match(source, /pathname: '\/hub\/training\/arena\/\[gameId\]'/);
    assert.match(source, /query: \{ gameId: game\.id, start: '1', source: 'training-(?:home|category)' \}/);
  }
  assert.match(arena, /startsWithPreset = Boolean\(game && !customLaunch\.config && !customLaunch\.error\)/);
  assert.match(arena, /customLaunch\.config \|\| \(startsWithPreset \? resolvePresetForGame\(game\) : null\)/);
  assert.match(arena, /initialConfig=\{initialConfig\}/);
});

test('preset play keeps study tooling out of the shared game table', () => {
  const load = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const arena = load('pages/hub/training/arena/[gameId].js');
  const game = load('src/components/training/GodModeArena.jsx');
  const router = load('src/components/training/GameUIRouter.jsx');
  const table = load('src/components/training/games/UniversalDynamicTable.jsx');

  assert.match(arena, /presetOnly=\{startsWithPreset\}/);
  assert.match(game, /<GameUIRouter\s+presetOnly=\{presetOnly\}/);
  assert.match(router, /<UniversalDynamicTable\s+presetOnly=\{presetOnly\}/);
  assert.match(game, /onConfigClick=\{presetOnly \? null : handleConfigClick\}/);
  for (const attribute of ['data-table-study-tools-disclosure', 'data-posthand-simulators-disclosure']) {
    assert.match(table, new RegExp('!presetOnly && <details[^>]*' + attribute));
  }
});
