import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    VIDEO_LIBRARY_POKER_TYPES,
    cleanVideoTitle,
    dedupeVideos,
    isCasinoGameFiledAsPoker,
    isCuratedFeedVideo,
    isDisplayableVideoTitle,
    mixedContentFilter,
    nextThumbnailFallback,
    thumbnailCandidates,
    youtubeThumbnail,
} from '../src/lib/videoLibraryCuration.mjs';

/*
 * Video Library Phase 1 (owner update 2026-10-12): poker first, off-topic,
 * duplicate and unreadable rows out of the feed, readable Title Case titles,
 * phone-sized thumbnails with a fallback ladder.
 */

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const CATALOG = read('../pages/api/video-library/catalog.js');
const DISCOVERY = read('../pages/api/video-library/discovery.js');
const PAGE = read('../pages/hub/video-library.js');
const WATCH = read('../src/lib/videoLibraryWatch.mjs');

test('All Videos is poker only in both the catalog and search APIs', () => {
    assert.deepEqual([...VIDEO_LIBRARY_POKER_TYPES], ['cash', 'tournament']);
    assert.match(CATALOG, /else if \(!idsRequested\) query = query\.in\('type', VIDEO_LIBRARY_POKER_TYPES\)/);
    assert.match(DISCOVERY, /VIDEO_LIBRARY_ALLOWED_TYPES\.includes\(type\) \? \[type\] : VIDEO_LIBRARY_POKER_TYPES/);
    // A saved video keeps showing in the player's own library whatever its type.
    assert.match(CATALOG, /idsRequested\s*\?\s*normalised/);
});

test('a mixed-content channel shows only its poker videos', () => {
    assert.equal(mixedContentFilter(), 'source_id.not.in.(6bfb1441-98ed-41d6-929f-e147626dbffa),title.ilike.*poker*');
    assert.match(CATALOG, /else query = query\.or\(mixedContentFilter\(\)\)/);
    const botez = { source: '6bfb1441-98ed-41d6-929f-e147626dbffa' };
    assert.equal(isCuratedFeedVideo({ ...botez, rawTitle: 'Botez Glute Day' }), false);
    assert.equal(isCuratedFeedVideo({ ...botez, rawTitle: 'Alexandra Plays High Stakes Poker' }), true);
    assert.equal(isCuratedFeedVideo({ source: 'HCL', rawTitle: 'Brutal Cooler' }), true);
});

test('test streams and emoji-only titles never reach a feed', () => {
    assert.equal(isDisplayableVideoTitle('Testing...Testing'), false);
    assert.equal(isDisplayableVideoTitle('\u{1FAE0}'), false);
    assert.equal(isDisplayableVideoTitle('Test Your Reads: AK vs QQ'), true);
    assert.match(CATALOG, /isDisplayableVideoTitle\(video\.rawTitle\)/);
});

test('titles lose emoji, hashtags and shouting, and follow Title Case', () => {
    const cases = [
        ['This is a BRUTAL Cooler \u{1F976}\u{1F92E}', 'This Is A Brutal Cooler'],
        ['Play the Player (Not the Cards)… #shorts #poker', 'Play The Player (Not The Cards)…'],
        ['HIGH LIMIT PHOENIX LINK!!!!!!!!!!!', 'High Limit Phoenix Link!'],
        ['Houston TCH LIVE $1/2 NLH CASH GAME', 'Houston TCH Live $1/2 NLH Cash Game'],
        ['i lost a piece of my soul', 'I Lost A Piece Of My Soul'],
        ['Spain Beat Croatia 2-1! \u{1F1EA}\u{1F1F8}\u{1F525} #USA', 'Spain Beat Croatia 2-1!'],
        ['PokerGO HIGHLIGHTS', 'PokerGO Highlights'],
        ['Hellmuth vs Negreanu', 'Hellmuth vs Negreanu'],
        ['Guess who\'s back? @globaldannypoker', 'Guess Who\'s Back? @globaldannypoker'],
        ['2nd place AA vs KK', '2nd Place AA vs KK'],
    ];
    for (const [raw, expected] of cases) assert.equal(cleanVideoTitle(raw), expected, raw);
    assert.match(WATCH, /title: cleanVideoTitle\(row\.title\),\s*rawTitle: row\.title/);
    assert.match(CATALOG, /const normaliseVideo = normaliseVideoRow;/);
    assert.match(DISCOVERY, /title: cleanVideoTitle\(row\.title\), rawTitle: row\.title/);
});

test('reposted short clips collapse, separate long sessions never do', () => {
    const clips = [
        { source: 'GALFOND', title: 'Not Knowing Is Part Of The Game', duration: '0:09' },
        { source: 'GALFOND', title: 'Not Knowing Is Part of the Game', duration: '0:10' },
        { source: 'TCH', title: 'Houston TCH Live $1/2 NLH Cash Game', duration: '2:49:30' },
        { source: 'TCH', title: 'Houston TCH Live $1/2 NLH Cash Game', duration: '2:48:21' },
    ];
    assert.equal(dedupeVideos(clips).length, 3);
    assert.match(PAGE, /libraryFilter === 'ALL' \? dedupeVideos\(unique\) : unique/);
});

test('thumbnails start at publisher resolution, Shorts use the vertical frame, and nothing goes blank', () => {
    assert.equal(youtubeThumbnail('abcdefghijk'), 'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg');
    assert.deepEqual(thumbnailCandidates('x', { catalogThumbnail: 'https://i.ytimg.com/vi/x/maxresdefault.jpg' }), [
        'https://i.ytimg.com/vi/x/maxresdefault.jpg',
        'https://i.ytimg.com/vi/x/sddefault.jpg',
        'https://i.ytimg.com/vi/x/hqdefault.jpg',
        'https://i.ytimg.com/vi/x/mqdefault.jpg',
    ]);
    const shorts = thumbnailCandidates('x', { vertical: true });
    assert.equal(shorts[0], 'https://i.ytimg.com/vi/x/oar2.jpg');
    assert.equal(nextThumbnailFallback(shorts[0], shorts), 'https://i.ytimg.com/vi/x/hqdefault.jpg');
    assert.equal(nextThumbnailFallback(shorts[shorts.length - 1], shorts), null);
    assert.equal(thumbnailCandidates('x', { catalogThumbnail: 'https://evil.example/x.jpg' }).length, 4);
    assert.doesNotMatch(PAGE, /getThumbnail/);
    assert.match(PAGE, /function VideoThumbnail\(/);
    assert.match(PAGE, /<VideoThumbnail video=\{short\} vertical \/>/);
});

test('casino table games filed as cash games stay out of the poker feed, sitemap and watch pages', () => {
    const blackjack = { source: 'GRIPSED', type: 'cash', rawTitle: 'I Won A Blackjack Tournament on ACR!!!' };
    assert.equal(isCasinoGameFiledAsPoker(blackjack), true);
    assert.equal(isCuratedFeedVideo(blackjack), false);
    assert.equal(isCasinoGameFiledAsPoker({ type: 'tournament', rawTitle: 'Black jack Moneymaker' }), true);
    assert.equal(isCasinoGameFiledAsPoker({ type: 'cash', rawTitle: 'Roulette Night' }), true);
    // The Slots chip keeps its casino videos; poker titles that mention slots stay.
    assert.equal(isCasinoGameFiledAsPoker({ type: 'slots', rawTitle: 'Blackjack High Roller' }), false);
    assert.equal(isCuratedFeedVideo({ type: 'cash', rawTitle: 'TOP SET vs a SLOTS PLAYER?? $18,000 POT!!' }), true);
    assert.equal(isCuratedFeedVideo({ type: 'cash', rawTitle: 'Crapshoot River Call' }), true);
    const CATALOG = readFileSync(new URL('../pages/api/video-library/catalog.js', import.meta.url), 'utf8');
    assert.match(CATALOG, /!isCasinoGameFiledAsPoker\(video\)/);
});
