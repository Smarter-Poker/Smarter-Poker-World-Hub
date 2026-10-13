import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VIDEO_LIBRARY_PLAYERS, getVideoLibraryPlayer, getVideoPlayers, matchesVideoPlayer, playerCatalogFilter } from '../src/lib/videoLibraryPlayers.mjs';
import { isVideoLibraryVideoAllowed, BLOCKED_VIDEO_LIBRARY_IDS } from '../src/lib/videoLibraryAvailability.js';
import { VIDEO_LIBRARY_POKER_TYPES, dedupeVideos, isCuratedFeedVideo, mixedContentFilter } from '../src/lib/videoLibraryCuration.mjs';
import { VIDEO_ROW_FIELDS, normaliseVideoRow } from '../src/lib/videoLibraryWatch.mjs';

test('player identity has one canonical full-name address and rejects arbitrary values', () => {
    const player = getVideoLibraryPlayer('Daniel-Negreanu');
    assert.equal(player.name, 'Daniel Negreanu');
    assert.equal(player.path, '/hub/video-library/players/daniel-negreanu');
    for (const input of ['daniel', 'negreanu', 'unknown', 'daniel-negreanu,private.eq.true', ['daniel-negreanu'], null]) assert.equal(getVideoLibraryPlayer(input), null);
    assert.equal(new Set(VIDEO_LIBRARY_PLAYERS.map(item => item.id)).size, VIDEO_LIBRARY_PLAYERS.length);
});

test('only explicit full-name title boundaries or an exact full-name tag match', () => {
    assert.deepEqual(getVideoPlayers({ type: 'cash', title: 'PHIL IVEY vs Daniel Negreanu!' }).map(item => item.id), ['daniel-negreanu', 'phil-ivey']);
    assert.equal(matchesVideoPlayer({ type: 'tournament', title: 'A Poker Hand', tags: ['Daniel Negreanu'] }, 'daniel-negreanu'), true);
    assert.equal(matchesVideoPlayer({ type: 'cash', rawTitle: 'Daniel   Negreanu: A Decision' }, 'daniel-negreanu'), true);
    for (const title of ['Negreanu Calls', 'Daniel Makes A Call', 'Daniel Negreanus Wins', 'XDaniel Negreanu Wins', 'Phil Iveyson']) assert.deepEqual(getVideoPlayers({ type: 'cash', title }), []);
    assert.deepEqual(getVideoPlayers({ type: 'cash', title: 'Poker Hand', tags: ['Daniel Negreanu Discussion'], sourceName: 'Phil Ivey' }), []);
    assert.deepEqual(getVideoPlayers({ type: 'sports', title: 'Phil Ivey' }), []);
    assert.equal(matchesVideoPlayer({ type: 'cash', title: 'Phil Ivey' }, { id: 'phil-ivey', name: 'Injected' }), true);
});

test('query candidates use the validated canonical name and JSONB tag containment', () => {
    const filter = playerCatalogFilter('phil-ivey');
    assert.match(filter, /^title\.ilike\.%Phil Ivey%/);
    assert.match(filter, /tags\.cs\.\["Phil Ivey"\]/);
    assert.match(filter, /tags\.cs\.\["PHIL IVEY"\]/);
    assert.equal(playerCatalogFilter({ id: 'arbitrary', name: 'bad,private.eq.true' }), null);
    assert.equal(playerCatalogFilter('missing'), null);
});

test('actual server loader reads only the public catalog and rejects unsafe or unrelated candidates', async () => {
    const source = readFileSync(new URL('../src/lib/server/videoLibraryPlayers.js', import.meta.url), 'utf8').replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace(/export /g, '');
    const checked = new Date().toISOString();
    const rows = [
        ['Daniel Negreanu Poker Hand', 'cash', 'verified'],
        ['Daniel Negreanu Poker Discussion', 'tournament', 'verified'],
        ['Daniel Negreanus Poker Hand', 'cash', 'verified'],
        ['Daniel Negreanu Blackjack', 'cash', 'verified'],
        ['Daniel Negreanu Sports', 'sports', 'verified'],
        ['Daniel Negreanu Unavailable', 'cash', 'unknown'],
    ].map(([title, type, status], index) => ({ youtube_video_id: `${index}2345678901`, title, type, source_id: 'HCL', source_name: 'Hustler Casino Live', availability_status: status, embeddable: true, availability_checked_at: checked, tags: [] }));
    const calls = [];
    let failure = null;
    const query = new Proxy({}, { get(_object, method) { if (method === 'then') return resolve => resolve({ data: rows, count: 72, error: failure }); return (...args) => { calls.push([method, ...args]); return query; }; } });
    const bindings = { channelServerClient: () => ({ from(table) { calls.push(['from', table]); return query; } }), isVideoLibraryVideoAllowed, BLOCKED_VIDEO_LIBRARY_IDS, VIDEO_LIBRARY_POKER_TYPES, dedupeVideos, isCuratedFeedVideo, mixedContentFilter, VIDEO_ROW_FIELDS, normaliseVideoRow, getVideoLibraryPlayer, matchesVideoPlayer, playerCatalogFilter };
    const load = new Function(...Object.keys(bindings), `${source}\nreturn loadVideoLibraryPlayer;`)(...Object.values(bindings));
    const payload = await load({ playerId: 'daniel-negreanu', offset: 5, limit: 1000 });
    assert.deepEqual(payload.data.map(video => video.rawTitle), ['Daniel Negreanu Poker Hand', 'Daniel Negreanu Poker Discussion']);
    assert.deepEqual(calls.find(call => call[0] === 'from'), ['from', 'video_library_public_catalog']);
    assert.deepEqual(calls.find(call => call[0] === 'in'), ['in', 'type', ['cash', 'tournament']]);
    assert.deepEqual(calls.find(call => call[0] === 'range'), ['range', 5, 64]);
    assert.deepEqual(calls.filter(call => call[0] === 'or'), [['or', playerCatalogFilter('daniel-negreanu')], ['or', mixedContentFilter()]]);
    assert.ok(calls.findIndex(call => call[0] === 'or' && call[1] === mixedContentFilter()) < calls.findIndex(call => call[0] === 'range'), 'The SSR candidate set must apply the same mixed-content predicate before pagination as subsequent catalog pages');
    assert.deepEqual(payload.pagination, { limit: 60, offset: 5, nextOffset: 11, hasMore: true });
    calls.length = 0;
    assert.equal((await load({ playerId: 'unknown' })).player, null);
    assert.equal(calls.length, 0);
    failure = new Error('Catalog Failed');
    await assert.rejects(load({ playerId: 'daniel-negreanu' }), /Catalog Failed/);
});

test('player page distinguishes unknown identity, unavailable catalog and native verified watch links', () => {
    const page = readFileSync(new URL('../pages/hub/video-library/players/[playerId].js', import.meta.url), 'utf8');
    assert.match(page, /if \(!getVideoLibraryPlayer\(params\?\.playerId\)\) return \{ notFound: true \}/);
    assert.match(page, /res\.statusCode = 503/);
    assert.match(page, /permanent: true/);
    assert.match(page, /canonical=\{`https:\/\/smarter\.poker\$\{player\.path\}`\}/);
    assert.match(page, /payload\.player\?\.id !== id/);
    assert.match(page, /payload\.data\.some\(video => !matchesVideoPlayer\(video, id\)\)/);
    assert.match(page, /href=\{watchPath\(video\)\}/);
    assert.match(page, /Videos Whose Published Titles Or Tags Name This Player/);
    assert.doesNotMatch(page, /\.from\(['"]profiles|Career Earnings|Win Rate|Biography|avatar_url|is_horse/);
});
