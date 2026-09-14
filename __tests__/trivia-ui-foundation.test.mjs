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

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const LOBBY = read('src/components/trivia/TriviaLobby.jsx');
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

test('all thirteen middle cards keep complete unique artwork', () => {
  assert.equal(TRIVIA_MODE_FILTER_COUNTS.all, 13);
  assert.equal(new Set(TRIVIA_MIDDLE_MODES.map((mode) => mode.code)).size, 13);
  assert.equal(new Set(TRIVIA_MIDDLE_MODES.map((mode) => mode.image)).size, 13);
  for (const mode of TRIVIA_MIDDLE_MODES) {
    assert.match(mode.image, /^\/images\/trivia\/modes-v2\/[a-z0-9-]+\.webp$/);
    assert.equal(existsSync(join(ROOT, 'public', mode.image)), true, `${mode.id} artwork is missing`);
    assert.ok(mode.name && mode.description && mode.icon && mode.route, `${mode.id} is incomplete`);
  }
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
  assert.match(LOBBY, /TRIVIA_MIDDLE_MODES as MODE_CARDS/);
  assert.match(LOBBY, /getTriviaModeRoute as getModeRoute/);
  assert.match(LOBBY, /resolveTriviaModeAvailability/);
  assert.doesNotMatch(LOBBY, /const MODE_ROUTES\s*=/);
  assert.doesNotMatch(LOBBY, /const MODE_CARDS\s*=\s*\[/);
  assert.doesNotMatch(LOBBY, /Daily 7 PM CST/);
  assert.match(LOBBY, /data-mode-availability=\{availability\.state\}/);
  assert.match(LOBBY, /disabled=\{isRouting \|\| unavailable\}/);
  assert.match(LOBBY_PAGE, /modeAvailability=\{modeAvailability\}/);
  assert.match(LOBBY_PAGE, /pvp: isTriviaPvpReleased\(process\.env\)/);
  assert.match(LOBBY_PAGE, /tournaments: areTriviaTournamentsReleased\(process\.env\)/);
  assert.doesNotMatch(LOBBY_PAGE, /NEXT_PUBLIC_TRIVIA_(?:PVP|TOURNAMENT)/);
});

test('desktop stays a grid while every mobile card stays image-first and stacked', () => {
  const cardStart = LOBBY.indexOf('<button\n                                key={mode.id}');
  const cardMarkup = LOBBY.slice(cardStart, LOBBY.indexOf('</button>', cardStart));
  assert.ok(cardStart > -1);
  assert.ok(cardMarkup.indexOf('mode-image-card__art') < cardMarkup.indexOf('mode-image-card__body'));
  assert.match(LOBBY, /\.modes-grid \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  // PIN MOVED (mobile phase 7, 2026-09-14): the phone block sits at the
  // standard's 768px boundary, not 700 (docs/mobile-standard, three breakpoints).
  assert.match(LOBBY, /@media \(max-width: 768px\)[\s\S]*?\.modes-grid \{[\s\S]*?grid-template-columns: 1fr !important;/);
  assert.match(LOBBY, /@media \(max-width: 768px\)[\s\S]*?\.mode-image-card \{[\s\S]*?flex-direction: column;/);
  assert.match(LOBBY, /@media \(max-width: 768px\)[\s\S]*?\.mode-image-card__art \{[\s\S]*?aspect-ratio: 4 \/ 3;/);
});
