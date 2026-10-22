/**
 * POKER ARENA IS ALWAYS THE FIRST CARD IN THE WORLD HUB.
 *
 * Dan, 2026-10-11, verbatim: "Poker Arena needs to ALWAYS be first card
 * DISPLAYED INSIDE THE WORLD HUB."
 *
 * The hub's card lists are assembled from the registry, then reshaped by the
 * Toke Tracker and Club Commander injections, the reader's hidden cards
 * (localStorage + profiles.hub_preferences), the last/most visited history
 * that orders the quick-launch row, and a remembered carousel position. Any
 * one of those could put another card first, so the order is enforced at the
 * end of each pipeline by pinPokerArenaFirst. This file pins the function and
 * the wiring.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const { pinPokerArenaFirst, POKER_ARENA_ORB_ID } = await import('../src/orbs/manifest/hubCardOrder.js');

const card = (id) => ({ id });
const ids = (list) => list.map((c) => c.id);
const ARENA = { id: 'club-arena', label: 'Poker Arena' };

test('Poker Arena is the registry id the hub opens at /hub/club-arena', () => {
  assert.equal(POKER_ARENA_ORB_ID, 'club-arena');
  const registry = read('src/orbs/manifest/registry.ts');
  const first = registry.slice(registry.indexOf('export const POKER_IQ_ORBS'));
  assert.match(first, /^export const POKER_IQ_ORBS: OrbConfig\[\] = \[\s*\{\s*id: 'club-arena',\s*color: [^\n]+\n\s*label: 'Poker Arena'/, 'the registry still lists Poker Arena first');
  assert.match(registry, /export const PINNED_ORB_IDS: string\[\] = \[[^\]]*'club-arena'/, 'Poker Arena can never be hidden');
});

test('a list that starts with another card is reordered, nothing lost or duplicated', () => {
  const out = pinPokerArenaFirst([card('toke-tracker'), card('club-commander'), card('club-arena'), card('news')]);
  assert.deepEqual(ids(out), ['club-arena', 'toke-tracker', 'club-commander', 'news']);
});

test('the input array is not mutated', () => {
  const input = [card('news'), card('club-arena')];
  pinPokerArenaFirst(input);
  assert.deepEqual(ids(input), ['news', 'club-arena']);
});

test('a list without Poker Arena (visit history, an old hidden preference) gets it inserted first', () => {
  const out = pinPokerArenaFirst([card('trivia'), card('news')], { arena: ARENA });
  assert.deepEqual(ids(out), ['club-arena', 'trivia', 'news']);
  assert.equal(out[0], ARENA);
});

test('bounded card lists keep Toke Tracker and lead with Poker Arena', () => {
  // A reader whose history is all other cards: last visited trivia, Toke Tracker injected first.
  const footer = ['toke-tracker', 'trivia', 'news', 'training', 'marketplace', 'video-library'].map(card);
  const out = pinPokerArenaFirst(footer, { arena: ARENA, limit: 6, keepIds: ['toke-tracker'] });
  assert.equal(out.length, 6);
  assert.equal(out[0].id, 'club-arena');
  assert.ok(ids(out).includes('toke-tracker'));
  assert.deepEqual(ids(out), ['club-arena', 'toke-tracker', 'trivia', 'news', 'training', 'marketplace']);
  // A five-card subset still keeps Poker Arena first.
  assert.equal(out.slice(0, 5)[0].id, 'club-arena');
});

test('an arena argument that is not Poker Arena is never inserted, and empty input is safe', () => {
  assert.deepEqual(ids(pinPokerArenaFirst([card('news')], { arena: card('news') })), ['news']);
  assert.deepEqual(pinPokerArenaFirst(undefined), []);
  assert.deepEqual(ids(pinPokerArenaFirst([null, card('club-arena')])), ['club-arena']);
});

test('the World Hub pins Poker Arena at the final step of every card list it renders', () => {
  const hub = read('src/world/WorldHub.tsx');
  assert.match(hub, /import \{ pinPokerArenaFirst \} from '\.\.\/orbs\/manifest\/hubCardOrder';/);
  // Carousel: the memo returns the pinned list.
  const carousel = hub.slice(hub.indexOf('const carouselOrbs = useMemo'), hub.indexOf('}, [hasCommanderAccount, effectiveHiddenIds]);'));
  assert.match(carousel, /return pinPokerArenaFirst\(visible, \{ arena: POKER_ARENA_ORB \}\);\s*$/);
  // The footer row was removed by the owner's October 22 cleanup request.
  assert.doesNotMatch(hub, /footerCards|<FooterCard/);
  // The remaining carousel opens on card zero, not a remembered index.
  assert.match(hub, /orbs=\{carouselOrbs\}/);
  assert.match(hub, /initialIndex=\{0\}/);
  assert.doesNotMatch(hub, /initialIndex=\{getLastCarouselIndex\(\)\}/);
});

test('the Customize My Hub list and the hub menu grid also lead with Poker Arena', () => {
  const panel = read('src/world/components/CardCustomizerPanel.tsx');
  assert.match(panel, /const ALL_CUSTOMIZABLE = pinPokerArenaFirst\(\[/);
  const menus = read('src/config/hamburgerMenus.js');
  const hubHome = menus.slice(menus.indexOf("'hub-home': (user, state, handlers) => ({"));
  const grid = hubHome.slice(hubHome.indexOf('createMenuItem.grid(['));
  assert.match(grid.slice(0, 400), /label: 'Poker Arena',\s*href: '\/hub\/club-arena'/, 'Poker Arena is the first Quick Navigation tile');
});
