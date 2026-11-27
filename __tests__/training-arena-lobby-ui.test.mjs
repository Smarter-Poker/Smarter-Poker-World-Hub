/**
 * Training Games Arena Lobby — Functional, Persistence & Design Law Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies:
 *   1. Pure 3-tier filtering, search, favorites, sorting, and section grouping
 *      across all 107 canonical TRAINING_LIBRARY games.
 *   2. Authoritative Training Game Favorites API + hook + SQL migration
 *      (JWT-only auth, canonical gameId validation, strict 503 on DB error).
 *   3. #SMARTERDESIGN & Modern Web Guidance compliance on the new lobby CSS
 *      and native <dialog> sheets.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { readGuestTrainingFavorites, toggleGuestTrainingFavorite } from '../src/lib/training/guestTrainingFavorites.mjs';
import { TRAINING_LIBRARY } from '../src/data/TRAINING_LIBRARY.js';
import {
  DEFAULT_LOBBY_FILTERS,
  buildLobbyGameMeta,
  countAdvancedFilters,
  filterAndSortTrainingGames,
  buildLobbySections,
} from '../src/lib/training/trainingLobbyFilter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('trainingLobbyFilter: enriches all 107 canonical games with coherent Arena-row telemetry', () => {
  assert.equal(TRAINING_LIBRARY.length, 107);
  for (const game of TRAINING_LIBRARY) {
    const meta = buildLobbyGameMeta(game);
    assert.ok(meta, `Missing meta for ${game.id}`);
    assert.ok(['DRILLS', 'LABS'].includes(meta.group));
    assert.ok(meta.difficulty >= 1 && meta.difficulty <= 5);
    if (game.category === 'PSYCHOLOGY') assert.equal(meta.stackBb, null);
    else assert.equal(meta.stackBb, meta.preset.stackDepthBb);
    assert.ok(meta.plaqueLabel.length >= 3);
    assert.ok(meta.styleLabel.length >= 3);
  }
});

test('trainingLobbyFilter: 3-tier selector deck filters accurately by group, category, favorites, quick pills, and search', () => {
  const drills = filterAndSortTrainingGames(TRAINING_LIBRARY, { ...DEFAULT_LOBBY_FILTERS, group: 'DRILLS' });
  const labs = filterAndSortTrainingGames(TRAINING_LIBRARY, { ...DEFAULT_LOBBY_FILTERS, group: 'LABS' });
  assert.equal(drills.length + labs.length, 107);
  assert.ok(drills.every((item) => ['MTT', 'CASH', 'SPINS'].includes(item.meta.category)));
  assert.ok(labs.every((item) => ['ADVANCED', 'PSYCHOLOGY'].includes(item.meta.category)));

  const mttOnly = filterAndSortTrainingGames(TRAINING_LIBRARY, { ...DEFAULT_LOBBY_FILTERS, category: 'MTT' });
  assert.equal(mttOnly.length, 27);
  assert.ok(mttOnly.every((item) => item.meta.category === 'MTT'));

  const favOnly = filterAndSortTrainingGames(
    TRAINING_LIBRARY,
    { ...DEFAULT_LOBBY_FILTERS, favoritesOnly: true },
    { favoriteIds: new Set(['mtt-001', 'cash-001']) },
  );
  assert.deepEqual(favOnly.map((i) => i.game.id), ['mtt-001', 'cash-001']);

  const beginner = filterAndSortTrainingGames(TRAINING_LIBRARY, { ...DEFAULT_LOBBY_FILTERS, quickFilter: 'BEGINNER' });
  assert.ok(beginner.length > 0 && beginner.every((i) => i.meta.difficulty <= 2));

  const pro = filterAndSortTrainingGames(TRAINING_LIBRARY, { ...DEFAULT_LOBBY_FILTERS, quickFilter: 'PRO' });
  assert.ok(pro.length > 0 && pro.every((i) => i.meta.difficulty >= 4));

  const inProgress = filterAndSortTrainingGames(
    TRAINING_LIBRARY,
    { ...DEFAULT_LOBBY_FILTERS, quickFilter: 'IN_PROGRESS' },
    { getProgress: (id) => (id === 'cash-002' ? 45 : id === 'mtt-001' ? 100 : 0) },
  );
  assert.deepEqual(inProgress.map((i) => i.game.id), ['cash-002']);

  const icmSearch = filterAndSortTrainingGames(TRAINING_LIBRARY, { ...DEFAULT_LOBBY_FILTERS, query: 'icm' });
  assert.ok(icmSearch.length >= 3);
  assert.ok(icmSearch.some((i) => i.game.id === 'mtt-002'));
});

test('poker search understands common spellings and does not match PLO inside exploitative', () => {
  const find = (query) => filterAndSortTrainingGames(TRAINING_LIBRARY, { query }).map(({ game }) => game.id);
  assert.ok(find('3bet').includes('cash-007'));
  assert.deepEqual(find('3 bet'), find('3-bet'));
  assert.deepEqual(find('3bet'), find('3-bet'));
  assert.ok(find('sit and go').includes('spins-001'));
  const omaha = TRAINING_LIBRARY.filter((game) => buildLobbyGameMeta(game).preset.variant.startsWith('plo'));
  assert.ok(omaha.length > 0);
  for (const query of ['plo', 'omaha', 'plo5', 'five-card', 'hi-lo']) {
    assert.deepEqual(new Set(find(query)), new Set(omaha.map((game) => game.id)));
  }
  const fiveCard = filterAndSortTrainingGames(TRAINING_LIBRARY, { variant: 'plo5' });
  assert.deepEqual(new Set(fiveCard.map(({ game }) => game.id)), new Set([...omaha, ...TRAINING_LIBRARY.filter(g => g.category === 'CASH')].map(g => g.id)));
  for (const game of TRAINING_LIBRARY) {
    assert.ok(find(game.name).includes(game.id), game.name);
  }
});

test('trainingLobbyFilter: column sorting, advanced count, and section grouping stay deterministic', () => {
  const byDiffAsc = filterAndSortTrainingGames(TRAINING_LIBRARY, {
    ...DEFAULT_LOBBY_FILTERS,
    sortKey: 'difficulty',
    sortDir: 'asc',
  });
  for (let i = 1; i < byDiffAsc.length; i += 1) {
    assert.ok(byDiffAsc[i - 1].meta.difficulty <= byDiffAsc[i].meta.difficulty);
  }

  for (const sortDir of ['asc', 'desc']) {
    const sorted = filterAndSortTrainingGames(TRAINING_LIBRARY, { sortKey: 'stack', sortDir });
    const stacks = sorted.map(({ meta }) => meta.stackBb);
    const numeric = stacks.filter((bb) => bb != null);
    assert.deepEqual(stacks.slice(0, numeric.length), numeric.toSorted((a, b) => sortDir === 'asc' ? a - b : b - a));
    assert.equal(stacks.at(-1), null);
  }

  const byNameDesc = filterAndSortTrainingGames(TRAINING_LIBRARY, {
    ...DEFAULT_LOBBY_FILTERS,
    sortKey: 'name',
    sortDir: 'desc',
  });
  assert.ok(byNameDesc[0].game.name.localeCompare(byNameDesc[byNameDesc.length - 1].game.name) > 0);

  assert.equal(countAdvancedFilters(DEFAULT_LOBBY_FILTERS), 0);
  assert.equal(
    countAdvancedFilters({ ...DEFAULT_LOBBY_FILTERS, variant: 'plo4', styleTag: 'gto', sortKey: 'difficulty' }),
    3,
  );

  // Recommended view groups Featured/Favorites first then by category without duplicates
  const recItems = filterAndSortTrainingGames(TRAINING_LIBRARY, DEFAULT_LOBBY_FILTERS, {
    recommendedGameId: 'cash-002',
    favoriteIds: new Set(['mtt-004']),
  });
  const sections = buildLobbySections(recItems, DEFAULT_LOBBY_FILTERS);
  assert.equal(sections[0].id, 'featured');
  assert.deepEqual(sections[0].items.map((i) => i.game.id), ['cash-002', 'mtt-004']);
  const totalInSections = sections.reduce((sum, s) => sum + s.items.length, 0);
  assert.equal(totalInSections, 107);
});

test('game-favorites API, hook, and SQL migration enforce JWT auth, idempotency, and honest 503 failure', () => {
  const api = read('pages/api/training/game-favorites.js');
  const hook = read('src/hooks/useTrainingFavorites.js');
  const sql = read('supabase/migrations/20261126191500_training_game_favorites_hardened.sql');

  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const apiCode = stripComments(api);
  assert.match(apiCode, /getServerUserWithFallback/);
  assert.doesNotMatch(apiCode, /x-user-id/i);
  assert.match(apiCode, /CANONICAL_GAME_IDS\.has\(gameId\)/);
  assert.match(apiCode, /onConflict: 'user_id,game_id'/);
  assert.match(apiCode, /status\(503\)/);
  assert.doesNotMatch(apiCode, /status\(200\)\.json\(\{ success: false/);

  assert.match(hook, /body\?\.success !== true/);
  assert.match(hook, /Favorite Change Was Not Saved\. Your Display Has Not Been Changed\./);

  assert.match(sql, /PRIMARY KEY \(user_id, game_id\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.training_game_favorites FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(sql, /GRANT SELECT, INSERT, DELETE ON TABLE public\.training_game_favorites TO authenticated;/);
  assert.match(sql, /auth\.uid\(\) = user_id/);
});

test('approved lobby keeps chrome controls, readable mobile text, and native accessible dialogs', () => {
  const css = read('src/components/training/lobby/TrainingLobby.module.css');
  const filtersSheet = read('src/components/training/lobby/TrainingFiltersSheet.jsx');
  const previewSheet = read('src/components/training/lobby/TrainingGamePreviewSheet.jsx');
  const dialog = read('src/components/training/lobby/TrainingLobbyDialog.jsx');
  const card = read('src/components/training/lobby/TrainingGameCard.jsx');
  const hub = read('pages/hub/training.js');

  assert.match(css, /--training-chrome:\s*linear-gradient/);
  assert.match(css, /--training-blue:\s*linear-gradient/);
  assert.match(css, /\.chromeButton\s*\{[\s\S]*?min-height:\s*48px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.equal(countAdvancedFilters({ ...DEFAULT_LOBBY_FILTERS, quickFilter: 'BEGINNER' }), 1);
  assert.match(filtersSheet, /data-quick-filter=\{pill.id.toLowerCase\(\)\}/);

  // One shared native dialog owns focus containment, Escape, backdrop, and scroll cleanup.
  for (const sheet of [filtersSheet, previewSheet]) {
    assert.match(sheet, /<TrainingLobbyDialog\s+open=/);
    assert.doesNotMatch(sheet, /role="dialog"|aria-modal/);
  }
  assert.match(dialog, /<dialog/);
  assert.match(dialog, /dialog\.showModal\(\)/);
  assert.match(dialog, /dialog\.addEventListener\('close', handleClose\)/);
  assert.match(dialog, /pressedOutside\.current && outside\(event\)/);
  assert.match(dialog, /acquireScrollLock\('training-lobby-dialog'\)/);
  assert.match(dialog, /if \(dialog.open\) dialog.close\(\)/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(css, /\.dialog::backdrop/);
  assert.match(card, /loading=\{index < 3 \? 'eager' : 'lazy'\}/);

  // Poker formats remain inside Filters; the rejected standalone rail cannot return.
  assert.doesNotMatch(hub, /data-variant-filter-bar|VARIANT_FILTERS/);
  for (const variant of ['nlh', 'plo4', 'plo5', 'plo6', 'plo8']) {
    assert.ok(filtersSheet.includes(`id: '${variant}'`));
  }
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of cssCode.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(match[1]) >= 12, `Unreadable mobile font size: ${match[1]}px`);
  }

  // Zero forbidden text colors (#SMARTERDESIGN: no yellow/gold/amber/purple/violet/pink/magenta text)
  for (const forbidden of [/#f3b151/i, /#ffe16a/i, /#facc15/i, /#ffd700/i, /#c084fc/i, /#c99cff/i, /#f59e0b/i, /#fb923c/i]) {
    assert.doesNotMatch(cssCode, forbidden, `Forbidden accent color ${forbidden} in TrainingLobby.module.css`);
  }

  // Legacy global training.css rules must exclude the approved chrome lobby shell,
  // Jarvis head crop must defeat mobile img max-width: 100%, LCP artwork is preloaded,
  // and the temporary preview harness stays removed.
  const worldCss = read('src/styles/worlds/training.css');
  assert.match(worldCss, /:where\(button, \[role='button'\], \.sp-card, \.sp-card-sm, \.sp-card-lg\):not\([^)]*\.sp-arena-lobby-shell \*\)/);
  assert.match(worldCss, /:where\(button, \[role='button'\]\):not\([^)]*\.sp-arena-lobby-shell \*\)/);
  assert.match(worldCss, /:where\(\.sp-card, \.sp-card-sm, \.sp-card-lg, article, fieldset\):not\([^)]*\.sp-arena-lobby-shell \*\)/);
  assert.match(worldCss, /:where\(input, textarea, select\):not\([^)]*\.sp-arena-lobby-shell \*\)/);
  assert.match(css, /\.jarvisPortrait img\s*\{[^}]*max-width:\s*none !important/);
  assert.match(hub, /rel="preload"[\s\S]{0,200}approved-chrome\/640\/mtt-001\.avif/);
  assert.equal(fs.existsSync(path.join(ROOT, 'public/__training_review_c868.html')), false);
});

test('guest favorites survive lobby re-entry in the same tab and report storage failures', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.deepEqual([...toggleGuestTrainingFavorite(storage, 'cash-002')], ['cash-002']);
  assert.deepEqual([...readGuestTrainingFavorites(storage)], ['cash-002']);
  assert.deepEqual([...toggleGuestTrainingFavorite(storage, 'cash-002')], []);
  assert.deepEqual([...readGuestTrainingFavorites(storage)], []);
  storage.getItem = () => 'invalid json';
  assert.deepEqual([...readGuestTrainingFavorites(storage)], []);
  storage.setItem = () => { throw new Error('Storage blocked'); };
  assert.throws(() => toggleGuestTrainingFavorite(storage, 'cash-002'), /Storage blocked/);
});

test('preview follows current favorite state on both entry points while preserving custom selections', () => {
  for (const page of ['pages/hub/training.js', 'pages/hub/training/category/[categoryId].js']) {
    assert.ok(read(page).includes('isFavorite={favoriteIds.has(previewItem?.game.id)}'));
  }
  const preview = read('src/components/training/lobby/TrainingGamePreviewSheet.jsx');
  assert.ok(preview.includes('aria-pressed={Boolean(isFavorite)}'));
  assert.ok(preview.includes('[item, defaultVariant]'));
  assert.ok(!preview.includes('item.isFavorite'));
  const header = read('src/components/training/lobby/TrainingLobbyHeader.jsx');
  assert.ok(header.includes("'Play Again'"));
  assert.ok(!header.includes("'Resume Session'"));
});

const nodeRequire = createRequire(import.meta.url);
function loadFavoriteModule(file, dependencies) {
  const ts = nodeRequire('typescript');
  const code = ts.transpile(read(file), {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
  });
  const exports = {};
  const resolve = name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  };
  new Function('require', 'exports', code)(resolve, exports);
  return exports.default;
}

test('favorites wait for identity, support retry, and ignore writes and reads from prior accounts', async () => {
  const React = nodeRequire('react');
  const { act, create } = nodeRequire('react-test-renderer');
  const requests = [];
  const useFavorites = loadFavoriteModule('src/hooks/useTrainingFavorites.js', {
    react: React,
    '../lib/authUtils': {
      authedFetch: (_url, options) => new Promise(resolve => requests.push({ options, resolve })),
    },
    '../stores/toastStore': { default: { error: () => {}, info: () => {} } },
    '../lib/training/guestTrainingFavorites.mjs': { readGuestTrainingFavorites, toggleGuestTrainingFavorite },
  });
  let state, tree;
  function Probe({ id, initializing }) {
    state = useFavorites(id ? { id } : null, initializing);
    return null;
  }
  const view = (id, initializing = false) => React.createElement(Probe, { id, initializing });
  const answer = (request, ok, body) => request.resolve({ ok, json: async () => body });
  await act(async () => { tree = create(view(null, true)); });
  try {
    assert.equal(requests.length, 0);
    assert.equal(state.favoritesLoading, true);
    await act(async () => { tree.update(view('first')); });
    assert.equal(await state.toggleFavorite('cash-002'), false);
    await act(async () => { answer(requests[0], false, { success: false }); });
    assert.ok(state.favoritesError);
    assert.equal(await state.toggleFavorite('cash-002'), false);
    await act(async () => { state.retryFavorites(); });
    await act(async () => { answer(requests[1], true, { success: true, favorites: ['mtt-001'] }); });
    assert.deepEqual([...state.favoriteIds], ['mtt-001']);
    let writing;
    await act(async () => { writing = state.toggleFavorite('cash-002'); });
    assert.equal(requests[2].options.headers['X-Expected-Account'], 'first');
    assert.equal(await state.toggleFavorite('cash-002'), false);
    await act(async () => { tree.update(view('second')); });
    assert.equal(state.favoritesLoading, true);
    assert.equal(state.favoriteIds.size, 0);
    await act(async () => { tree.update(view('third')); });
    await act(async () => { answer(requests[4], true, { success: true, favorites: ['cash-005'] }); });
    await act(async () => {
      answer(requests[3], true, { success: true, favorites: ['cash-004'] });
      answer(requests[2], true, { success: true });
      assert.equal(await writing, false);
    });
    assert.deepEqual([...state.favoriteIds], ['cash-005']);
    assert.equal(state.favoritesLoading, false);
    assert.equal(state.favoritesError, null);
  } finally {
    await act(async () => { tree.unmount(); });
  }
});

test('favorites API rejects a refreshed token for a different account before any database operation', async () => {
  const handler = loadFavoriteModule('pages/api/training/game-favorites.js', {
    '../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user: { id: 'second' } }) },
    '../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
    '../../../src/utils/trainingApiUtils': { withTiming() {} },
    '../../../src/lib/apiErrorHandler': { reportApiError() { assert.fail('Unexpected API error'); } },
    '../../../src/data/TRAINING_LIBRARY': { TRAINING_LIBRARY },
  });
  for (const method of ['GET', 'POST', 'DELETE']) {
    const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({ method, headers: { authorization: 'Bearer test', 'x-expected-account': 'first' } }, response);
    assert.equal(response.code, 409);
    assert.equal(response.body.success, false);
  }
});
