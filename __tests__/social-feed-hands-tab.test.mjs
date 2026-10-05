/**
 * Phase 8: the Hands tab and the topic filter of GET /api/social/feed.
 *
 * The predicate lives INSIDE the PostgREST query (topics=cs.{hand}) so the
 * raw offset counts only matching rows and a sparse tab never burns the
 * scan budget. An unknown tab or topic is a 400 with the exact message the
 * client contract names. Every post carries topics, coverFrameUrl and
 * transcodeStatus next to the fields it always had.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FEED_SOURCE,
    id,
    loadFeedRoute,
    runFeed,
    textPost,
} from './social-feed-api-harness.mjs';

const route = loadFeedRoute();
// U+2013 and U+2014, built from code points so this file carries neither.
const DASH_RE = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');

function rows() {
    return [
        textPost(1, { author: id(901) }),
        textPost(2, { author: id(902), topics: ['poker', 'hand'] }),
        textPost(3, { author: id(903), topics: ['poker', 'cash'] }),
        textPost(4, { author: id(904), topics: ['poker', 'hand', 'puzzle'] }),
        textPost(5, { author: id(905), topics: null }),
        textPost(6, { author: id(906), topics: ['poker', 'cash', 'hand'] }),
    ];
}

test('the exported contract names two tabs and thirteen topics', () => {
    assert.deepEqual(route.FEED_TABS, ['all', 'hands']);
    assert.equal(route.FEED_TOPICS.length, 13);
    assert.ok(route.FEED_TOPICS.includes('hand'));
    assert.equal(typeof route.readSafePostWindow, 'function');
    assert.equal(typeof route.parseFeedQuery, 'function');
});

test('tab=hands adds topics=cs.{hand} to the PostgREST query and returns only hand posts', async () => {
    const { res, postQueries } = await runFeed(rows(), { query: { tab: 'hands', limit: '10' } });
    assert.equal(res.statusCode, 200);
    assert.equal(postQueries.length, 1);
    assert.deepEqual(postQueries[0].searchParams.getAll('topics'), ['cs.{hand}']);
    assert.match(postQueries[0].search, /topics=cs\.%7Bhand%7D/, 'the raw query string carries the containment filter');
    assert.deepEqual(res.body.posts.map(post => post.id), [id(2), id(4), id(6)]);
    assert.equal(res.body.tab, 'hands');
    assert.equal(res.body.hasMore, false);
    assert.equal(res.body.nextOffset, 3, 'the offset counts matching rows only');
    assert.deepEqual(res.body.carry, [id(2), id(4), id(6)]);
});

test('the default tab is all and adds no topics filter', async () => {
    for (const query of [{ limit: '10' }, { limit: '10', tab: '' }, { limit: '10', tab: 'all' }]) {
        const { res, postQueries } = await runFeed(rows(), { query });
        assert.equal(res.statusCode, 200, JSON.stringify(query));
        assert.deepEqual(postQueries[0].searchParams.getAll('topics'), []);
        assert.equal(res.body.tab, 'all');
        assert.equal(res.body.posts.length, 6);
    }
});

test('a topic narrows the page; with tab=hands the two compose as AND', async () => {
    const cash = await runFeed(rows(), { query: { topic: 'cash', limit: '10' } });
    assert.deepEqual(cash.postQueries[0].searchParams.getAll('topics'), ['cs.{cash}']);
    assert.deepEqual(cash.res.body.posts.map(post => post.id), [id(3), id(6)]);

    const both = await runFeed(rows(), { query: { tab: 'hands', topic: 'cash', limit: '10' } });
    assert.deepEqual(both.postQueries[0].searchParams.getAll('topics'), ['cs.{hand}', 'cs.{cash}']);
    assert.deepEqual(both.res.body.posts.map(post => post.id), [id(6)]);

    const same = await runFeed(rows(), { query: { tab: 'hands', topic: 'hand', limit: '10' } });
    assert.deepEqual(same.postQueries[0].searchParams.getAll('topics'), ['cs.{hand}'], 'the same facet twice is sent once');
});

test('an unknown tab or topic is a 400 with the contract message, before any read', async () => {
    for (const tab of ['reels', 'HANDS', 'hands ', ['all', 'hands']]) {
        const { res, calls } = await runFeed(rows(), { query: { tab } });
        assert.equal(res.statusCode, 400, JSON.stringify(tab));
        assert.deepEqual(res.body, { error: 'Unsupported feed tab' });
        assert.equal(calls.length, 0, 'no fetch happens for a bad tab');
        assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0', 'privacy headers precede the 400');
    }
    for (const topic of ['video', 'unknown', 'Hand', ['cash']]) {
        const { res, calls } = await runFeed(rows(), { query: { topic } });
        assert.equal(res.statusCode, 400, JSON.stringify(topic));
        assert.deepEqual(res.body, { error: 'Unsupported feed topic' });
        assert.equal(calls.length, 0);
    }
    assert.deepEqual(route.parseFeedQuery({}), { tab: 'all', topic: null, excludeIds: new Set() });
    assert.deepEqual(route.parseFeedQuery({ tab: 'hands', topic: 'news' }).topic, 'news');
});

test('every post carries topics, coverFrameUrl and transcodeStatus next to the fields it always had', async () => {
    const page = rows();
    page[0].cover_frames = ['https://cdn.test/f0.jpg', 'https://cdn.test/f1.jpg', 'https://cdn.test/f2.jpg'];
    page[0].cover_frame_index = 2;
    page[1].cover_frames = ['https://cdn.test/g0.jpg'];
    page[1].cover_frame_index = null;
    page[2].cover_frames = ['https://cdn.test/h0.jpg', 'https://cdn.test/h1.jpg'];
    page[2].cover_frame_index = 9;
    page[3].cover_frames = [];
    page[3].transcode_status = 'done';
    const { res } = await runFeed(page, { query: { limit: '10' } });
    const byId = new Map(res.body.posts.map(post => [post.id, post]));
    assert.deepEqual(byId.get(id(1)).topics, ['unknown']);
    assert.deepEqual(byId.get(id(4)).topics, ['poker', 'hand', 'puzzle']);
    assert.deepEqual(byId.get(id(5)).topics, [], 'a null column is an empty array');
    assert.equal(byId.get(id(1)).coverFrameUrl, 'https://cdn.test/f2.jpg', 'the chosen frame');
    assert.equal(byId.get(id(2)).coverFrameUrl, 'https://cdn.test/g0.jpg', 'a null index is frame 0');
    assert.equal(byId.get(id(3)).coverFrameUrl, 'https://cdn.test/h0.jpg', 'an index past the end falls back to frame 0');
    assert.equal(byId.get(id(4)).coverFrameUrl, null, 'no frames, no url');
    assert.equal(byId.get(id(4)).transcodeStatus, 'done');
    assert.equal(byId.get(id(1)).transcodeStatus, null);
    for (const post of res.body.posts) {
        assert.equal(post.playedWith, false, 'anonymous viewers never carry a played-with flag');
        for (const field of ['id', 'authorId', 'content', 'contentType', 'mediaUrls', 'thumbnailUrl', 'thumbnail_url',
            'likeCount', 'commentCount', 'shareCount', 'reactions', 'isLiked', 'isBookmarked', 'viewCount',
            'visibility', 'createdAt', 'link_url', 'metadata', 'playback_type', 'topic',
            'rights_status', 'source_asset_id', 'youtube_video_id', 'canonical_asset_key', 'publication_key', 'author']) {
            assert.ok(Object.hasOwn(post, field), `${field} stays on every post`);
        }
        // origin_type says who wrote a post; a browser never receives it.
        assert.equal(Object.hasOwn(post, 'origin_type'), false, 'origin_type never leaves the server');
    }
    assert.deepEqual(Object.keys(res.body), ['posts', 'hasMore', 'nextOffset', 'partial', 'offset', 'limit', 'tab', 'ranked', 'carry']);
});

test('the select reads the four new columns and the filter is a containment on topics', () => {
    for (const column of ['topics', 'cover_frames', 'cover_frame_index', 'transcode_status']) {
        assert.match(FEED_SOURCE, new RegExp(`'${column}'`), `${column} is selected`);
    }
    assert.match(FEED_SOURCE, /params\.append\('topics', `cs\.\{\$\{facet\}\}`\)/);
    assert.match(FEED_SOURCE, /if \(tab === 'hands'\) facetFilters\.push\('hand'\);/);
    assert.match(FEED_SOURCE, /Unsupported feed tab/);
    assert.match(FEED_SOURCE, /Unsupported feed topic/);
    // The Phase 8 additions (the query contract and the window) carry no en
    // dash or em dash; older comments elsewhere in the file are not ours.
    const added = FEED_SOURCE.slice(
        FEED_SOURCE.indexOf('export function parseFeedQuery'),
        FEED_SOURCE.indexOf('export default async function handler'),
    );
    assert.doesNotMatch(added, DASH_RE, 'no en dash or em dash in the Phase 8 window');
    for (const message of ['Unsupported feed tab', 'Unsupported feed topic', 'Unsupported exclude list']) {
        assert.doesNotMatch(message, DASH_RE);
    }
});

test('horses are players: the window, the tab and the filter never read a horse marker', () => {
    const scan = FEED_SOURCE.slice(
        FEED_SOURCE.indexOf('export function parseFeedQuery'),
        FEED_SOURCE.indexOf('export default async function handler'),
    );
    assert.ok(scan.length > 0);
    assert.doesNotMatch(scan, /is_horse|origin_type|scheduler/);
});
