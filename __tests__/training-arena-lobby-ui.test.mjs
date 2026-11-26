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
import { fileURLToPath } from 'node:url';

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
    assert.ok(meta.estMinutes >= 1);
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
  for (const query of ['plo', 'omaha']) {
    assert.deepEqual(new Set(find(query)), new Set(omaha.map((game) => game.id)));
  }
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

test('Arena Lobby CSS & dialogs obey #SMARTERDESIGN, mobile 12px floor, and modern <dialog> rules', () => {
  const css = read('src/styles/worlds/training-lobby-arena.css');
  const filtersSheet = read('src/components/training/lobby/TrainingFiltersSheet.jsx');
  const previewSheet = read('src/components/training/lobby/TrainingGamePreviewSheet.jsx');
  const row = read('src/components/training/lobby/TrainingLobbyRow.jsx');

  // Native <dialog closedby="any"> + showModal() + Safari pointer fallback + scroll containment
  for (const sheet of [filtersSheet, previewSheet]) {
    assert.match(sheet, /<dialog/);
    assert.match(sheet, /closedby="any"/);
    assert.match(sheet, /showModal/);
    assert.match(sheet, /'closedBy' in HTMLDialogElement\.prototype/);
    assert.doesNotMatch(sheet, /role="dialog"|aria-modal/);
  }
  assert.match(css, /dialog\.sp-arena-sheet\[open\]/);
  assert.match(css, /dialog\.sp-arena-sheet:modal[\s\S]*?overscroll-behavior:\s*contain/);
  assert.match(css, /dialog\.sp-arena-sheet::backdrop[\s\S]*?overflow:\s*hidden;[\s\S]*?overscroll-behavior:\s*contain/);

  // Below-the-fold rendering deferral paired with contain-intrinsic-size
  assert.match(row, /index >= 6 \? ' sp-arena-row--deferred' : ''/);
  assert.match(css, /\.sp-arena-row--deferred[\s\S]*?content-visibility:\s*auto;[\s\S]*?contain-intrinsic-size:/);

  // Zero display: none outside print, zero forbidden breakpoints
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(cssCode, /display:\s*none/i);
  const allowed = new Set(['900', '768', '600']);
  for (const m of cssCode.matchAll(/@media[^{]*\(max-width:\s*(\d+)px\)/g)) {
    assert.ok(allowed.has(m[1]), `Disallowed breakpoint ${m[1]}px in training-lobby-arena.css`);
  }

  // Zero forbidden text colors (#SMARTERDESIGN: no yellow/gold/amber/purple/violet/pink/magenta text)
  for (const forbidden of [/#f3b151/i, /#ffe16a/i, /#facc15/i, /#ffd700/i, /#c084fc/i, /#c99cff/i, /#f59e0b/i, /#fb923c/i]) {
    assert.doesNotMatch(cssCode, forbidden, `Forbidden accent color ${forbidden} in training-lobby-arena.css`);
  }
});
