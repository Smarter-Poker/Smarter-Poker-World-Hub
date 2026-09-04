import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildDiscoveryUrl,
  getCurrentDay,
  getTabSlug,
  normalizeRadiusMiles,
  normalizeRouteSlug,
  normalizeVenueType,
  resolveDiscoveryDeepLink,
  safeSetItem,
  snapshotAgeDays,
  trackSearchEvent,
  venueMatchesGameType,
  venueMatchesStakes,
} from '../src/components/poker-near-me/discoveryController.js';
import {
  LOBBY_DESTINATIONS,
  clearSharedGpsLocation,
  createLobbyJsonLd,
  normalizeVoiceFilters,
  persistSharedGpsLocation,
} from '../src/components/poker-near-me/lobby/lobbyController.js';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('phase 4 route pages delegate controller and recovery responsibilities', async () => {
  const [lobby, directory, lobbyController, discoveryController, recovery, lobbyInteractions, gestures] = await Promise.all([
    source('pages/hub/poker-near-me/lobby.js'),
    source('pages/hub/poker-near-me/[pnmTab].js'),
    source('src/components/poker-near-me/lobby/lobbyController.js'),
    source('src/components/poker-near-me/discoveryController.js'),
    source('src/components/poker-near-me/ControllerRecovery.jsx'),
    source('src/components/poker-near-me/lobby/useLobbyInteractionController.js'),
    source('src/components/poker-near-me/useDiscoveryGestureController.js'),
  ]);

  assert.match(lobby, /from '\.\.\/\.\.\/\.\.\/src\/components\/poker-near-me\/lobby\/lobbyController'/);
  assert.match(directory, /from '\.\.\/\.\.\/\.\.\/src\/components\/poker-near-me\/discoveryController'/);
  assert.match(directory, /import \{\s+buildDiscoveryUrl,[\s\S]{0,900}from '\.\.\/\.\.\/\.\.\/src\/components\/poker-near-me\/discoveryController'/);
  assert.doesNotMatch(directory, /buildDiscoveryUrl,[\s\S]{0,160}pokerNearMePreferences/);
  assert.match(lobby, /import \{ PodErrorBoundary \}/);
  assert.match(directory, /import \{ FavLiveToast, TabErrorBoundary \}/);
  assert.doesNotMatch(lobby, /function normalizeVoiceFilters/);
  assert.doesNotMatch(directory, /function normalizeRouteSlug/);
  assert.doesNotMatch(directory, /function venueMatchesGameType/);
  assert.match(lobbyController, /export function normalizeVoiceFilters/);
  assert.match(discoveryController, /export function normalizeRouteSlug/);
  assert.match(recovery, /class ControllerErrorBoundary/);
  assert.match(lobby, /useLobbyDialogController/);
  assert.match(
    lobby,
    /className="lobby-panel-page"[\s\S]{0,700}zIndex:\s*10100/,
    'the aria-modal pod panel must remain above the fixed global header'
  );
  assert.match(lobbyInteractions, /export function useLobbyDialogController/);
  assert.match(directory, /useDiscoveryGestureController/);
  assert.match(gestures, /export default function useDiscoveryGestureController/);
});

test('canonical route controller keeps aliases, URL state, and metadata synchronized', () => {
  assert.equal(normalizeRouteSlug('live'), 'live-games');
  assert.equal(normalizeRouteSlug(['daily']), 'daily-tournaments');
  assert.equal(normalizeRouteSlug('calendar'), 'events-calendar');
  assert.equal(normalizeRouteSlug('bogus'), null);
  assert.equal(
    getTabSlug({ showLiveTab: false, activeTab: 'events', activeEventTab: 'daily' }),
    'daily-tournaments'
  );
  assert.equal(
    getTabSlug({ showLiveTab: false, activeTab: 'more', activeMoreTab: 'roadtrip' }),
    'roadtrip'
  );
  assert.equal(getTabSlug({ showLiveTab: true, activeTab: 'venues' }), 'live-games');

  assert.deepEqual(buildDiscoveryUrl({
    showLiveTab: false,
    activeTab: 'events',
    activeEventTab: 'daily',
    searchQuery: 'St Augustine',
    venueType: 'tour_stop',
  }), {
    pathSlug: 'daily-tournaments',
    url: '/hub/poker-near-me/daily-tournaments?q=St+Augustine&filter=tour_stop',
  });
  assert.deepEqual(resolveDiscoveryDeepLink({
    pathname: '/hub/poker-near-me/daily',
    search: '?q=St%20Augustine&filter=poker_tour',
  }), {
    query: 'St Augustine',
    openSearch: true,
    showLiveTab: false,
    activeTab: 'events',
    activeEventTab: 'daily',
    activeMoreTab: null,
    venueType: 'tour_stop',
    canonicalLiveUrl: null,
  });
});

test('shared filter controller keeps voice, list, map, and persisted domains honest', () => {
  assert.equal(normalizeRadiusMiles('any'), 150);
  assert.equal(normalizeRadiusMiles(999), 150);
  assert.equal(normalizeRadiusMiles(-1), 50);
  assert.equal(normalizeVenueType('poker_tour'), 'tour_stop');
  assert.equal(normalizeVenueType('card_room'), 'poker_club');
  assert.equal(normalizeVenueType('untrusted'), null);

  const unknown = { games_offered: [], stakes_cash: [] };
  assert.equal(venueMatchesGameType(unknown, 'nlh'), true);
  assert.equal(venueMatchesStakes(unknown, '$2/5'), true);
  const mixed = { games_offered: ['No Limit Holdem', 'Pot Limit Omaha'] };
  assert.equal(venueMatchesGameType(mixed, 'mixed'), true);
  assert.equal(venueMatchesGameType(mixed, 'stud'), false);
  assert.equal(venueMatchesStakes({ stakes_cash: ['$1/3', '$5/10'] }, '$1/2'), true);

  assert.deepEqual(normalizeVoiceFilters({
    gameType: 'PLO',
    venueType: 'casino',
    radius: 30,
    minBuyin: 75,
    maxBuyin: 500,
    stakes: '2/5',
    tab: 'daily',
  }), {
    gameType: 'plo',
    svGameType: 'plo',
    venueType: 'casino',
    svVenueType: 'casino',
    radius: '50',
    svRadius: '50',
    nmRadius: '50',
    svMinBuyin: '75',
    nmMinBuyin: '75',
    svMaxBuyin: '500',
    nmMaxBuyin: '500',
  });
});

test('lobby crawl graph remains a complete canonical destination contract', () => {
  const graph = createLobbyJsonLd({ '@type': 'WebSite', name: 'Smarter.Poker' });
  assert.equal(LOBBY_DESTINATIONS.length, 12);
  assert.equal(graph['@graph'][1].itemListElement.length, 12);
  assert.equal(graph['@graph'][1].itemListElement[0].position, 1);
  assert.match(graph['@graph'][1].itemListElement[0].url, /^https:\/\/smarter\.poker\/hub\//);
});

test('location persistence writes the platform key and emits one refresh signal', () => {
  const values = new Map();
  const events = [];
  const storage = {
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  class FakeEvent {
    constructor(type) { this.type = type; }
  }
  const target = { Event: FakeEvent, dispatchEvent: (event) => events.push(event.type) };
  assert.equal(persistSharedGpsLocation({ lat: 29.9, lng: -81.3 }, storage, target), true);
  assert.deepEqual(JSON.parse(values.get('sp-user-gps')), {
    lat: 29.9,
    lng: -81.3,
    time: JSON.parse(values.get('sp-user-gps')).time,
  });
  assert.equal(clearSharedGpsLocation(storage, target), true);
  assert.deepEqual(events, ['sp_user_gps_updated', 'sp_user_gps_updated']);
  assert.equal(values.has('sp-user-gps'), false);
});

test('bounded analytics persistence evicts cache data and strips large payloads', () => {
  const values = new Map([
    ['sp-offline-venues', 'large'],
    ['sp-search-analytics', '[]'],
  ]);
  let quota = true;
  const storage = {
    getItem: (key) => values.get(key) || null,
    removeItem: (key) => { values.delete(key); quota = false; },
    setItem: (key, value) => {
      if (quota) {
        const error = new Error('quota');
        error.name = 'QuotaExceededError';
        throw error;
      }
      values.set(key, value);
    },
  };
  assert.equal(safeSetItem('filters', '{}', storage), true);
  assert.equal(values.has('sp-offline-venues'), false);

  const analyticsStorage = {
    getItem: (key) => values.get(key) || null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
  const runtimeWindow = { localStorage: analyticsStorage, __SEARCH_ANALYTICS__: [] };
  assert.equal(trackSearchEvent('search', { query: 'St Augustine', venues: Array(500) }, runtimeWindow), true);
  const persisted = JSON.parse(values.get('sp-search-analytics'));
  assert.equal(persisted.at(-1).query, 'St Augustine');
  assert.equal('venues' in persisted.at(-1), false);
});

test('time helpers remain deterministic at controller boundaries', () => {
  assert.equal(snapshotAgeDays('2026-08-29T00:00:00Z', Date.parse('2026-08-31T23:00:00Z')), 2);
  assert.equal(snapshotAgeDays('invalid'), undefined);
  assert.equal(getCurrentDay(new Date('2026-08-31T12:00:00Z')), 'Monday');
});

test('shared production gate avoids the Commander root redirect loop', async () => {
  const vercel = JSON.parse(await source('vercel.json'));
  const rootIndex = vercel.rewrites.findIndex((rewrite) => rewrite.source === '/commander');
  const nestedIndex = vercel.rewrites.findIndex((rewrite) => rewrite.source === '/commander/:path*');

  assert.notEqual(rootIndex, -1);
  assert.notEqual(nestedIndex, -1);
  assert.ok(rootIndex < nestedIndex, 'exact root rewrite must run before the nested catch-all');
  // 2026-09-04 (#1344): smarter.poker/commander lands on Commander's real
  // landing page (pages/commander/index.js on the commander origin), not on
  // commander.smarter.poker/ - which is a scaffold stub reading "migration in
  // progress". This pin used to insist on the stub and went red the moment
  // the menu row was made to navigate somewhere real. Neither destination
  // can loop: the commander origin serves both paths directly (200, no
  // redirect), and the hub only rewrites, never redirects, here.
  assert.equal(vercel.rewrites[rootIndex].destination, 'https://commander.smarter.poker/commander');
  assert.equal(
    vercel.rewrites[nestedIndex].destination,
    'https://commander.smarter.poker/commander/:path*'
  );
  for (const rewrite of [vercel.rewrites[rootIndex], vercel.rewrites[nestedIndex]]) {
    assert.ok(!('permanent' in rewrite) && !('statusCode' in rewrite), 'a rewrite, not a redirect - a redirect here is how a loop starts');
  }
});
