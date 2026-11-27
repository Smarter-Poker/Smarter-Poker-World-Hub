import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { TRAINING_LIBRARY } from '../src/data/TRAINING_LIBRARY.js';
import {
  DEFAULT_LOBBY_FILTERS,
  buildLobbySections,
  filterAndSortTrainingGames,
  getLobbyResultsPage,
} from '../src/lib/training/trainingLobbyFilter.mjs';

const hub = readFileSync(new URL('../pages/hub/training.js', import.meta.url), 'utf8');
const category = readFileSync(new URL('../pages/hub/training/category/[categoryId].js', import.meta.url), 'utf8');

test('eight games per page, every game reachable once in global recommended order', () => {
  const items = filterAndSortTrainingGames(TRAINING_LIBRARY, DEFAULT_LOBBY_FILTERS, {
    recommendedGameId: TRAINING_LIBRARY.at(-1).id,
  });
  const sections = buildLobbySections(items, DEFAULT_LOBBY_FILTERS);
  const expected = sections.flatMap((section) => section.items.map((item) => item.game.id));
  const ids = [];
  const lastPage = Math.ceil(expected.length / 8);
  for (let index = 1; index <= lastPage; index++) {
    const result = getLobbyResultsPage(sections, index);
    const pageIds = result.groups.flatMap((group) => group.items.map((item) => item.game.id));
    assert.equal(result.first, (index - 1) * 8 + 1);
    assert.equal(result.last, Math.min(index * 8, items.length));
    assert.equal(result.pageCount, lastPage);
    assert.deepEqual(pageIds, expected.slice(result.first - 1, result.last));
    ids.push(...pageIds);
  }
  assert.equal(new Set(ids).size, TRAINING_LIBRARY.length);
  assert.deepEqual(ids, expected);
  assert.equal(getLobbyResultsPage(sections, 999).page, lastPage);
  assert.equal(getLobbyResultsPage([], 999).first, 0);
});

test('search and category filters reach later games before pagination', () => {
  const game = TRAINING_LIBRARY.at(-1);
  for (const library of [TRAINING_LIBRARY, TRAINING_LIBRARY.filter((item) => item.category === game.category)]) {
    const filters = { ...DEFAULT_LOBBY_FILTERS, query: game.id, category: game.category };
    const filtered = filterAndSortTrainingGames(library, filters);
    const result = getLobbyResultsPage(buildLobbySections(filtered, filters), 1);
    assert.deepEqual(result.groups.flatMap((group) => group.items.map((item) => item.game.id)), [game.id]);
    assert.equal(result.total, 1);
  }
  assert.match(hub, /filterAndSortTrainingGames\(TRAINING_LIBRARY, filters/);
  assert.match(category, /filterAndSortTrainingGames\(games, categoryFilters/);
  for (const source of [hub, category]) {
    assert.match(source, /<TrainingLobbyResults\s+key=\{JSON\.stringify/);
    assert.doesNotMatch(source, /gridSentinelRef|visibleCardCount/);
  }
  assert.match(category, /onOpenFilters=\{\(\) => setFiltersOpen\(true\)\}/);
  assert.match(category, /<TrainingFiltersSheet\s+isOpen=\{filtersOpen\}/);
});

test('training home and category games open a dedicated preset arena', () => {
  const arena = readFileSync(new URL('../pages/hub/training/arena/[gameId].js', import.meta.url), 'utf8');
  const controls = readFileSync(new URL('../src/components/training/lobby/TrainingLobbyControls.jsx', import.meta.url), 'utf8');

  assert.match(controls, /data-category-tab=\{id\.toLowerCase\(\)\}/);
  assert.match(hub, /onStart=\{handleRowStart\}/);
  assert.ok(hub.indexOf('id="training-library"') < hub.indexOf('aria-labelledby="stats-h"'));
  assert.doesNotMatch(category, /data-specialty-brain-panel|data-brain-variant-tab/);
  assert.match(category, /onStart=\{playGame\}/);
  for (const source of [hub, category]) {
    assert.match(source, /pathname: '\/hub\/training\/arena\/\[gameId\]'/);
  }
  assert.match(hub, /const query = \{ gameId: game\.id, start: '1', source: 'training-home' \}/);
  assert.match(category, /source: 'training-category'/);
  assert.match(arena, /startsWithPreset = Boolean\(game && !customLaunch\.error && \(presetLaunch \|\| !customLaunch\.config\)\)/);
  assert.match(arena, /\.\.\.resolvePresetForGame\(game\),\s*\.\.\.customLaunch\.config/);
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
  assert.match(table, /!presetOnly && brainMeta && \(\s*<div/);
  assert.match(table, /data-training-feedback="verdict"/);
  for (const attribute of ['data-table-study-tools-disclosure', 'data-posthand-simulators-disclosure']) {
    assert.match(table, new RegExp('!presetOnly && <details[^>]*' + attribute));
  }
});
