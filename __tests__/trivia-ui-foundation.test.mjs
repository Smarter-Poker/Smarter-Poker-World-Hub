import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  TRIVIA_FEATURED_MODE,
  TRIVIA_MIDDLE_MODES,
  TRIVIA_MODE_AVAILABILITY,
  TRIVIA_MODE_FILTER_COUNTS,
  TRIVIA_MODES,
  TRIVIA_QUICK_STAKES_MODE,
  getTriviaModeRoute,
  resolveTriviaModeAvailability,
} from '../src/config/triviaModeRegistry.mjs';
import {
  TRIVIA_LOBBY_CARDS,
  TRIVIA_LOBBY_MODE_IDS,
  filterTriviaLobbyCards,
} from '../src/config/triviaLobbyPresentation.mjs';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const LOBBY = read('src/components/trivia/TriviaLobby.jsx');
const LOBBY_CSS = read('src/components/trivia/TriviaLobby.module.css');
const FRAME_CARD_CSS = read('src/components/trivia/console/TriviaFrameCard.module.css');
const REGISTRY = read('src/config/triviaModeRegistry.mjs');
const LOBBY_PAGE = read('pages/hub/trivia/index.js');

const sha256 = (file) => createHash('sha256')
  .update(readFileSync(join(ROOT, file)))
  .digest('hex');

test('one pure catalogue owns all fifteen Trivia destinations', () => {
  assert.equal(TRIVIA_MODES.length, 15);
  assert.equal(new Set(TRIVIA_MODES.map((mode) => mode.id)).size, 15);
  assert.equal(new Set(TRIVIA_MODES.map((mode) => mode.route)).size, 15);
  assert.equal(TRIVIA_MIDDLE_MODES.length, 13);
  assert.equal(TRIVIA_FEATURED_MODE.id, 'daily');
  assert.equal(TRIVIA_QUICK_STAKES_MODE.id, 'arcade');
  assert.doesNotMatch(REGISTRY, /^\s*import\s/m);
  assert.doesNotMatch(REGISTRY, /\b(?:window|document|navigator|React)\b/);

  const expectedRoutes = {
    daily: '/hub/trivia/daily',
    mtt: '/hub/trivia/mtt',
    cash: '/hub/trivia/cash',
    icm: '/hub/trivia/icm',
    history: '/hub/trivia/history',
    tournaments: '/hub/trivia/tournaments',
    pro: '/hub/trivia/pro',
    survival: '/hub/trivia/survival-game',
    endless: '/hub/trivia/endless',
    mixed: '/hub/trivia/mixed',
    'time-attack': '/hub/trivia/time-attack',
    pvp: '/hub/trivia/pvp',
    rules: '/hub/trivia/rules',
    gto: '/hub/trivia/gto',
    arcade: '/hub/trivia/arcade',
  };
  assert.deepEqual(
    Object.fromEntries(TRIVIA_MODES.map((mode) => [mode.id, getTriviaModeRoute(mode.id)])),
    expectedRoutes,
  );
  assert.equal(getTriviaModeRoute('not-a-real-mode'), '/hub/trivia');
});

test('the approved Daily and Quick Stakes identities cannot drift', () => {
  assert.equal(TRIVIA_FEATURED_MODE.image, '/images/trivia/daily-trivia-header-final.webp?v=v6');
  assert.equal(TRIVIA_FEATURED_MODE.imageAlt, 'Daily Trivia - 10 Questions Fresh Every Day');
  assert.equal(TRIVIA_FEATURED_MODE.imageWidth, 1024);
  assert.equal(TRIVIA_FEATURED_MODE.imageHeight, 309);
  assert.equal(TRIVIA_QUICK_STAKES_MODE.image, '/images/trivia/quick-stakes.webp?v=v6');
  assert.equal(TRIVIA_QUICK_STAKES_MODE.imageWidth, 1600);
  assert.equal(TRIVIA_QUICK_STAKES_MODE.imageHeight, 763);
  assert.equal(
    sha256('public/images/trivia/daily-trivia-header-final.webp'),
    '70a2b61e122cc4f66528a739cba8154051d49a0d54fc7f55fa5aa552c3f1d2b8',
  );
  assert.equal(
    sha256('public/images/trivia/quick-stakes.webp'),
    '86c375cfb29b2b15bbdc3ce0cb10c42ac8110fabb51dc7a78439aaae58b92ce3',
  );
});

test('all thirteen canonical middle-mode definitions keep their legacy artwork and destinations', () => {
  assert.equal(TRIVIA_MODE_FILTER_COUNTS.all, 13);
  assert.equal(new Set(TRIVIA_MIDDLE_MODES.map((mode) => mode.code)).size, 13);
  assert.equal(new Set(TRIVIA_MIDDLE_MODES.map((mode) => mode.image)).size, 13);
  for (const mode of TRIVIA_MIDDLE_MODES) {
    assert.match(mode.image, /^\/images\/trivia\/modes-console-v1\/[a-z0-9-]+\.webp$/);
    assert.equal(existsSync(join(ROOT, 'public', mode.image)), true, `${mode.id} artwork is missing`);
    assert.ok(mode.name && mode.description && mode.icon && mode.route, `${mode.id} is incomplete`);
  }
});

test('the approved discovery gallery has twelve cards with 1v1 and Daily Tournament first', () => {
  const expectedOrder = [
    'pvp', 'tournaments', 'gto', 'mtt', 'cash', 'icm',
    'history', 'pro', 'rules', 'survival', 'endless', 'time-attack',
  ];
  assert.deepEqual(TRIVIA_LOBBY_MODE_IDS, expectedOrder);
  assert.deepEqual(TRIVIA_LOBBY_CARDS.map((card) => card.id), expectedOrder);
  assert.equal(new Set(TRIVIA_LOBBY_CARDS.map((card) => card.id)).size, 12);
  assert.equal(TRIVIA_LOBBY_CARDS[0].displayName, '1v1 Battle');
  assert.equal(TRIVIA_LOBBY_CARDS[1].displayName, 'Daily Tournament');
  assert.ok(!TRIVIA_LOBBY_CARDS.some((card) => card.id === 'mixed'));

  // Removing Mixed from discovery must not remove historical links or run recovery.
  assert.equal(getTriviaModeRoute('mixed'), '/hub/trivia/mixed');
  assert.equal(getTriviaModeRoute('survival'), '/hub/trivia/survival-game');
  assert.match(LOBBY, /SOLO_RECOVERY_MODES\s*=\s*Object\.freeze\(\[[^\]]*'mixed'/);
  assert.match(LOBBY, /onClick=\{\(\) => void routeToMode\(activeSoloRecovery\.mode\)\}/);
});

test('each approved card has distinct shipped art and preserves canonical gameplay metadata', () => {
  assert.equal(new Set(TRIVIA_LOBBY_CARDS.map((card) => card.image)).size, 12);
  const artworkHashes = new Set();
  for (const card of TRIVIA_LOBBY_CARDS) {
    const canonical = TRIVIA_MODES.find((mode) => mode.id === card.id);
    assert.ok(canonical, `${card.id} must refer to a canonical mode`);
    for (const field of [
      'route', 'category', 'availability', 'enabledByDefault',
      'maintenanceLabel', 'maintenanceMessage', 'diamondReward', 'perfectBonus',
    ]) {
      assert.deepEqual(card[field], canonical[field], `${card.id} changed canonical ${field}`);
    }
    assert.ok(card.displayName && card.caption, `${card.id} needs readable live card text`);
    assert.match(card.image, /^\/images\/trivia\/approved-chrome\/[a-z0-9-]+\.webp$/);
    const file = join('public', card.image);
    assert.equal(existsSync(join(ROOT, file)), true, `${card.id} artwork is missing`);
    assert.equal(existsSync(join(ROOT, 'public', card.imageSmall)), true, `${card.id} mobile artwork is missing`);
    assert.ok(card.imageWidth > 576 && card.imageHeight > 0, `${card.id} must declare its image dimensions`);
    artworkHashes.add(sha256(file));
  }
  assert.equal(artworkHashes.size, 12, 'Every card must ship its own illustration, not copies under different names');
});

test('gallery search handles case, whitespace and no matches without reintroducing Mixed', () => {
  const ids = (cards) => cards.map((card) => card.id);
  assert.deepEqual(ids(filterTriviaLobbyCards()), TRIVIA_LOBBY_MODE_IDS);
  assert.deepEqual(ids(filterTriviaLobbyCards('   ')), TRIVIA_LOBBY_MODE_IDS);
  assert.deepEqual(ids(filterTriviaLobbyCards('  1V1 BATTLE  ')), ['pvp']);
  assert.deepEqual(ids(filterTriviaLobbyCards('daily tournament')), ['tournaments']);
  assert.deepEqual(ids(filterTriviaLobbyCards('icm & chip ev')), ['icm']);
  assert.deepEqual(ids(filterTriviaLobbyCards('no-such-trivia-game')), []);
  assert.deepEqual(ids(filterTriviaLobbyCards('mixed mode')), []);
  assert.deepEqual(TRIVIA_LOBBY_CARDS.map((card) => card.id), TRIVIA_LOBBY_MODE_IDS);
});

test('existing category deep links filter the approved cards without changing their priority', () => {
  const ids = (query, category) => filterTriviaLobbyCards(query, category).map((card) => card.id);
  assert.deepEqual(ids('', 'knowledge'), ['history', 'pro', 'rules']);
  assert.deepEqual(ids('', 'strategy'), ['gto', 'mtt', 'cash', 'icm']);
  assert.deepEqual(ids('', 'competitive'), ['pvp', 'tournaments']);
  assert.deepEqual(ids('', 'challenge'), ['survival', 'endless', 'time-attack']);
  assert.deepEqual(ids('rules', 'knowledge'), ['rules']);
  assert.deepEqual(ids('cash', 'knowledge'), []);
  assert.deepEqual(ids('', 'unknown-category'), TRIVIA_LOBBY_MODE_IDS);
});

test('PvP and Tournaments fail closed in maintenance until capability enables them', () => {
  for (const modeId of ['pvp', 'tournaments']) {
    const mode = TRIVIA_MODES.find((candidate) => candidate.id === modeId);
    assert.equal(mode.enabledByDefault, false);
    assert.equal(mode.availability, TRIVIA_MODE_AVAILABILITY.MAINTENANCE);
    assert.match(mode.maintenanceMessage, /Upgrades Are In Progress/);
    assert.deepEqual(resolveTriviaModeAvailability(modeId), {
      enabled: false,
      state: TRIVIA_MODE_AVAILABILITY.MAINTENANCE,
      label: 'Maintenance',
      message: mode.maintenanceMessage,
    });
    assert.equal(resolveTriviaModeAvailability(modeId, { [modeId]: true }).enabled, true);
  }
});

test('the lobby derives presentation and routes from the catalogue', () => {
  assert.match(LOBBY, /from '\.\.\/\.\.\/config\/triviaModeRegistry\.mjs'/);
  assert.match(LOBBY, /from '\.\.\/\.\.\/config\/triviaLobbyPresentation\.mjs'/);
  assert.match(LOBBY, /filterTriviaLobbyCards\(searchQuery, activeFilter\)/);
  assert.match(LOBBY, /getTriviaModeRoute as getModeRoute/);
  assert.match(LOBBY, /resolveTriviaModeAvailability/);
  assert.doesNotMatch(LOBBY, /const MODE_ROUTES\s*=/);
  assert.doesNotMatch(LOBBY, /const MODE_CARDS\s*=\s*\[/);
  assert.doesNotMatch(LOBBY, /Daily 7 PM CST/);
  assert.match(LOBBY, /data-mode-availability=\{availability\.state\}/);
  assert.match(LOBBY, /disabled=\{isRouting \|\| playerDataLoading \|\| unavailable\}/);
  assert.match(LOBBY_PAGE, /modeAvailability=\{modeAvailability\}/);
  assert.match(LOBBY_PAGE, /pvp: isTriviaPvpReleased\(process\.env\)/);
  assert.match(LOBBY_PAGE, /tournaments: areTriviaTournamentsReleased\(process\.env\)/);
  assert.doesNotMatch(LOBBY_PAGE, /NEXT_PUBLIC_TRIVIA_(?:PVP|TOURNAMENT)/);
});

test('the approved gallery uses two columns and custom art with a bounded failure fallback', () => {
  assert.match(LOBBY, /className=\{`mode-card /);
  assert.match(LOBBY, /<TriviaModeArt mode=\{mode\}/);
  assert.match(LOBBY, /src=\{fallback \? mode\.fallbackImage : mode\.image\}/);
  assert.match(LOBBY, /if \(!fallback && mode\.fallbackImage\) setFallback\(true\);\s*else setFailed\(true\);/);
  assert.match(LOBBY_CSS, /\.gameGrid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(LOBBY_CSS, /\.gameGrid\s*\{[^}]*grid-template-columns:\s*(?:1fr|repeat\([134],)/);
  assert.match(FRAME_CARD_CSS, /\.card \{[\s\S]*?flex-direction: column;/);
  assert.match(FRAME_CARD_CSS, /\.art \{[\s\S]*?object-fit: contain;/);
});
