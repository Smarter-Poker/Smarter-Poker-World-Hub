import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { TRAINING_LIBRARY } from '../src/data/TRAINING_LIBRARY.js';
import * as lobbyFilters from '../src/lib/training/trainingLobbyFilter.mjs';
import * as trainingPresets from '../src/lib/training/trainingPresets.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
const ts = require('typescript');
const LOBBY = fileURLToPath(new URL('../src/components/training/lobby/', import.meta.url));
const { DEFAULT_LOBBY_FILTERS, filterAndSortTrainingGames, buildLobbySections } = lobbyFilters;
const componentCache = new Map();

// Execute the real lobby components together, including real Cards and Shelves.
// Only non-behavioral CSS/art, Next's routing boundary and the native-dialog
// boundary are replaced. Browser focus, scrolling and modal dismissal are
// verified separately; this suite never calls authenticated services.
function loadComponent(name) {
  const filename = path.resolve(LOBBY, name.endsWith('.jsx') ? name : `${name}.jsx`);
  assert.ok(filename.startsWith(LOBBY), `Unexpected component outside the lobby: ${name}`);
  if (componentCache.has(filename)) return componentCache.get(filename);
  const module = { exports: {} };
  componentCache.set(filename, module.exports);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, allowJs: true },
  }).outputText;
  const imports = (specifier) => {
    if (specifier === 'react' || specifier === 'react/jsx-runtime' || specifier === 'lucide-react') return require(specifier);
    if (specifier === 'next/link') return { default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (specifier === './TrainingLobby.module.css') return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (specifier === '../TrainingGameArt') return { default: ({ gameId }) => React.createElement('div', { 'data-art-game': gameId }) };
    if (specifier === './TrainingLobbyDialog') return { default: ({ open, children, labelledBy }) => open
      ? React.createElement('dialog', { open: true, 'aria-labelledby': labelledBy }, children) : null };
    if (specifier.endsWith('/trainingLobbyFilter.mjs')) return lobbyFilters;
    if (specifier.endsWith('/trainingPresets.mjs')) return trainingPresets;
    if (specifier.startsWith('./')) return loadComponent(specifier.slice(2));
    assert.fail(`Unexpected dependency in ${name}: ${specifier}`);
  };
  new Function('require', 'module', 'exports', compiled)(imports, module, module.exports);
  componentCache.set(filename, module.exports);
  return module.exports;
}

const Controls = loadComponent('TrainingLobbyControls').default;
const Results = loadComponent('TrainingLobbyResults').default;
const SortBar = loadComponent('TrainingSortBar').default;
const Header = loadComponent('TrainingLobbyHeader').default;
const Preview = loadComponent('TrainingGamePreviewSheet').default;

function render(t, Component, props) {
  let tree;
  act(() => { tree = create(React.createElement(Component, props)); });
  t.after(() => act(() => tree.unmount()));
  return tree;
}

function text(value) {
  if (Array.isArray(value)) return value.map(text).join('');
  if (value == null || typeof value === 'boolean') return '';
  if (typeof value === 'object') return text(value.props?.children);
  return String(value);
}

function button(tree, label) {
  const matches = tree.root.findAll((node) => node.type === 'button' && text(node.props.children).trim() === label);
  assert.equal(matches.length, 1, `Expected one ${label} button`);
  return matches[0];
}

function cards(tree) {
  return tree.root.findAll((node) => node.type === 'article' && node.props['data-training-game-card']);
}

function resultsProps(filters = DEFAULT_LOBBY_FILTERS, callbacks = {}, context = {}) {
  const items = filterAndSortTrainingGames(TRAINING_LIBRARY, filters, context);
  return {
    sections: buildLobbySections(items, filters),
    filters,
    onStart() {}, onOpenPreview() {}, onToggleFavorite() {},
    ...callbacks,
  };
}

test('all categories stay selectable and cross-mode selections produce real matching games', (t) => {
  const counts = Object.fromEntries(['MTT', 'CASH', 'SPINS', 'ADVANCED', 'PSYCHOLOGY'].map((category) => [category, TRAINING_LIBRARY.filter((game) => game.category === category).length]));
  let nextPatch;
  let filters = { ...DEFAULT_LOBBY_FILTERS, group: 'DRILLS', category: 'CASH' };
  const props = () => ({
    filters, counts, totalCount: TRAINING_LIBRARY.length, filteredCount: 1, favoriteCount: 0,
    onUpdateFilters(patch) { nextPatch = patch; }, onResetFilters() {}, onOpenFiltersSheet() {},
  });
  const tree = render(t, Controls, props());
  const cases = [
    ['advanced', 'ADVANCED', 'LABS'], ['cash', 'CASH', 'DRILLS'],
    ['psychology', 'PSYCHOLOGY', 'LABS'], ['mtt', 'MTT', 'DRILLS'],
    ['spins', 'SPINS', 'DRILLS'], ['all', 'ALL', 'ALL'],
  ];
  for (const [buttonId, category, group] of cases) {
    const visibleCategories = tree.root.findAll((node) => node.type === 'button' && node.props['data-category-tab']);
    assert.equal(visibleCategories.length, 6);
    act(() => tree.root.findByProps({ 'data-category-tab': buttonId }).props.onClick());
    filters = { ...filters, ...nextPatch };
    assert.equal(filters.group, group);
    assert.equal(filters.category, category);
    const matches = filterAndSortTrainingGames(TRAINING_LIBRARY, filters);
    assert.ok(matches.length > 0, `${category} must not be accidentally excluded by the prior mode`);
    if (category !== 'ALL') assert.ok(matches.every((item) => item.game.category === category));
    else assert.equal(matches.length, TRAINING_LIBRARY.length);
    act(() => tree.update(React.createElement(Controls, props())));
    assert.equal(tree.root.findByProps({ 'data-category-tab': buttonId }).props['aria-pressed'], true);
  }
});

test('search, clear, favorites and mode controls preserve the real filter contract', (t) => {
  let patch;
  let opened = 0;
  let filters = { ...DEFAULT_LOBBY_FILTERS };
  const props = () => ({ filters, totalCount: TRAINING_LIBRARY.length, filteredCount: 107, counts: {}, favoriteCount: 1,
    onUpdateFilters(next) { patch = next; }, onResetFilters() {}, onOpenFiltersSheet() { opened += 1; } });
  const tree = render(t, Controls, props());
  const game = TRAINING_LIBRARY.find((entry) => entry.id === 'mtt-001');
  act(() => tree.root.findByType('input').props.onChange({ target: { value: game.name } }));
  filters = { ...filters, ...patch };
  assert.deepEqual(filterAndSortTrainingGames(TRAINING_LIBRARY, filters).map((item) => item.game.id), [game.id]);
  act(() => tree.update(React.createElement(Controls, props())));
  act(() => tree.root.findByProps({ 'aria-label': 'Clear Search' }).props.onClick());
  assert.equal(patch.query, '');
  act(() => tree.root.findByProps({ 'data-open-filters-sheet': 'true' }).props.onClick());
  assert.equal(opened, 1);
  act(() => tree.root.findByProps({ 'data-favorites-toggle': 'true' }).props.onClick());
  assert.equal(patch.favoritesOnly, true);
  assert.equal(patch.group, 'ALL');
  assert.equal(patch.category, 'ALL');
  act(() => tree.root.findByProps({ 'data-group-plate': 'LABS' }).props.onClick());
  assert.deepEqual(patch, { group: 'LABS', category: 'ALL', favoritesOnly: false });
});

test('default shelves expose all 107 canonical games exactly once and keep card actions distinct', (t) => {
  let started, configured, favorited;
  const tree = render(t, Results, resultsProps(DEFAULT_LOBBY_FILTERS, {
    onStart(game) { started = game; }, onOpenPreview(item) { configured = item; }, onToggleFavorite(id) { favorited = id; },
  }));
  const displayed = cards(tree);
  assert.equal(TRAINING_LIBRARY.length, 107);
  assert.equal(displayed.length, TRAINING_LIBRARY.length);
  assert.deepEqual(new Set(displayed.map((card) => card.props['data-game-id'])), new Set(TRAINING_LIBRARY.map((game) => game.id)));
  assert.equal(tree.root.findByProps({ 'data-lobby-layout': 'shelves' }).type, 'div');
  const card = displayed[0];
  const id = card.props['data-game-id'];
  act(() => card.findByProps({ 'data-play-game': id }).props.onClick());
  assert.equal(started, TRAINING_LIBRARY.find((game) => game.id === id));
  act(() => card.findByProps({ 'data-preview-game': id }).props.onClick());
  assert.equal(configured.game.id, id);
  assert.ok(configured.meta.preset);
  act(() => card.findByProps({ 'data-favorite-game': id }).props.onClick());
  assert.equal(favorited, id);
  assert.equal(card.findByProps({ 'data-favorite-game': id }).props['aria-pressed'], false);
});

test('category and list results page through real games without duplicate or missing entries', (t) => {
  const filters = { ...DEFAULT_LOBBY_FILTERS, group: 'DRILLS', category: 'MTT' };
  const props = resultsProps(filters);
  const expectedIds = filterAndSortTrainingGames(TRAINING_LIBRARY, filters).map((item) => item.game.id);
  const tree = render(t, Results, props);
  const seen = [];
  assert.equal(cards(tree).length, 8);
  while (true) {
    seen.push(...cards(tree).map((card) => card.props['data-game-id']));
    const next = button(tree, 'Next');
    if (next.props.disabled) break;
    act(() => next.props.onClick());
  }
  assert.deepEqual(seen, expectedIds);
  assert.equal(new Set(seen).size, expectedIds.length);
  act(() => tree.update(React.createElement(Results, { ...props, viewMode: 'list' })));
  assert.equal(tree.root.findByProps({ 'data-lobby-layout': 'list' }).type, 'div');
  assert.ok(cards(tree).every((card) => card.props['data-category'] === 'mtt'));
});

test('View All selects the shelf category, while favorites stay in a direct result view', (t) => {
  let selected;
  const tree = render(t, Results, resultsProps(DEFAULT_LOBBY_FILTERS, { onUpdateFilters(patch) { selected = patch; } }));
  act(() => tree.root.findByProps({ 'aria-label': 'View All Tournaments Games' }).props.onClick());
  assert.deepEqual(selected, { category: 'MTT', group: 'DRILLS', favoritesOnly: false });
  const favoriteIds = new Set(['mtt-001', 'cash-001']);
  const filters = { ...DEFAULT_LOBBY_FILTERS, favoritesOnly: true };
  act(() => tree.update(React.createElement(Results, resultsProps(filters, {}, { favoriteIds }))));
  assert.equal(tree.root.findAll((node) => node.type === 'section' && node.props['data-training-shelf']).length, 0);
  assert.deepEqual(new Set(cards(tree).map((card) => card.props['data-game-id'])), favoriteIds);
  for (const id of favoriteIds) assert.equal(tree.root.findByProps({ 'data-favorite-game': id }).props['aria-pressed'], true);
});

test('sort, layout, warmup and History retain their live action destinations', (t) => {
  let sort, layout, launched;
  const warmup = { game: TRAINING_LIBRARY[0], basis: 'daily-warmup', overrides: { questionsCount: 10, variant: 'nlh' } };
  const tree = render(t, SortBar, {
    filters: DEFAULT_LOBBY_FILTERS, filteredCount: 107, totalCount: 107, viewMode: 'grid',
    onSortChange(...args) { sort = args; }, onViewModeChange(value) { layout = value; },
    fiveMinuteLeakFix: warmup, onPlayGame(...args) { launched = args; },
  });
  act(() => tree.root.findByType('select').props.onChange({ target: { value: 'stack:desc' } }));
  assert.deepEqual(sort, ['stack', 'desc']);
  act(() => tree.root.findByProps({ 'data-training-view': 'list' }).props.onClick());
  assert.equal(layout, 'list');
  act(() => tree.root.findByProps({ 'data-training-warmup': 'true' }).props.onClick());
  assert.deepEqual(launched, [warmup.game, warmup.overrides]);
  assert.equal(tree.root.findByType('a').props.href, '/hub/session-history');
});

test('quick play and replay use the selected game while the Jarvis button opens Personal Assistant', (t) => {
  const heroGame = TRAINING_LIBRARY[0];
  const continueTarget = { game: TRAINING_LIBRARY[1], preset: { variant: 'nlh', questionsCount: 10 } };
  let launched;
  const onPlayGame = (...args) => { launched = args; };
  const tree = render(t, Header, { heroGame, onPlayGame });
  act(() => tree.root.findByProps({ 'data-start-training-cta': 'true' }).props.onClick());
  assert.equal(launched[0], heroGame);
  act(() => tree.update(React.createElement(Header, { heroGame, continueTarget, onPlayGame })));
  act(() => button(tree, 'Play Again').props.onClick());
  assert.deepEqual(launched, [continueTarget.game, continueTarget.preset]);
  const assistant = tree.root.findByProps({ 'data-personal-assistant-leaks': 'true' });
  assert.equal(assistant.props.href, '/hub/personal-assistant/leaks?source=training-home');
  assert.equal(assistant.findByType('img').props.src, '/images/jarvis-avatar.webp');
});

test('Configure changes variant and street before launching the same canonical game', (t) => {
  const item = filterAndSortTrainingGames(TRAINING_LIBRARY, DEFAULT_LOBBY_FILTERS).find((entry) => entry.game.id === 'cash-005');
  let closed = 0;
  let launched;
  const tree = render(t, Preview, { item, defaultVariant: 'ALL', isFavorite: false,
    onClose() { closed += 1; }, onLaunch(...args) { launched = args; }, onToggleFavorite() {} });
  act(() => button(tree, 'PLO5').props.onClick());
  act(() => button(tree, 'Turn').props.onClick());
  assert.equal(button(tree, 'PLO5').props['aria-pressed'], true);
  assert.equal(button(tree, 'Turn').props['aria-pressed'], true);
  act(() => button(tree, 'Play Drill').props.onClick());
  assert.equal(closed, 1);
  assert.equal(launched[0], item.game);
  assert.deepEqual(launched[1], { variant: 'plo5', bettingStructure: 'pot_limit', targetStreet: 'turn' });
});
