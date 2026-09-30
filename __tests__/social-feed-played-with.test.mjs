/**
 * Phase 8: played-with ordering of the social feed page.
 *
 * After the viewer resolves, the handler asks fn_feed_played_with for the
 * players the viewer recently sat with (the viewer's own hands decide it)
 * and rankFeedPage puts their posts first: band A then band B, each in the
 * order it arrived. The merge is a permutation of ONE page applied after
 * nextOffset is computed. A failure or an anonymous viewer means the
 * chronological page with ranked: false, never an error.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rankFeedPage, isPlayedWithAuthor } from '../src/lib/feedRanking.js';
import {
    FEED_SOURCE,
    id,
    runFeed,
    textPost,
} from './social-feed-api-harness.mjs';

const RANKING_SOURCE = fs.readFileSync(new URL('../src/lib/feedRanking.js', import.meta.url), 'utf8');
const VIEWER = id(500);
const MATE_ONE = id(901);
const MATE_TWO = id(903);

function rows() {
    return [
        textPost(1, { author: id(900) }),
        textPost(2, { author: MATE_ONE }),
        textPost(3, { author: id(902) }),
        textPost(4, { author: MATE_TWO }),
        textPost(5, { author: MATE_ONE }),
        textPost(6, { author: id(904) }),
    ];
}

const tablemates = [{ user_id: MATE_ONE, shared_hands: 12, last_seen: '2026-09-30T01:00:00Z' }, { user_id: MATE_TWO, shared_hands: 3, last_seen: '2026-09-29T01:00:00Z' }];

test('rankFeedPage is pure and stable: band A then band B, each in arrival order, nothing dropped or added', () => {
    const page = rows();
    const before = JSON.stringify(page);
    const ranked = rankFeedPage(page, { playedWith: new Set([MATE_ONE, MATE_TWO]) });
    assert.deepEqual(ranked.map(post => post.id), [id(2), id(4), id(5), id(1), id(3), id(6)]);
    assert.equal(JSON.stringify(page), before, 'the input is untouched');
    assert.notEqual(ranked, page, 'a new array');
    assert.equal(ranked.length, page.length);
    assert.deepEqual([...ranked].sort((a, b) => a.id.localeCompare(b.id)), [...page].sort((a, b) => a.id.localeCompare(b.id)));
    assert.deepEqual(rankFeedPage(page, { playedWith: new Set() }).map(post => post.id), page.map(post => post.id), 'no tablemates, same order');
    assert.deepEqual(rankFeedPage(page, {}).map(post => post.id), page.map(post => post.id));
    assert.deepEqual(rankFeedPage(page, { playedWith: [MATE_TWO] }).map(post => post.id), [id(4), id(1), id(2), id(3), id(5), id(6)], 'an array works too');
    assert.deepEqual(rankFeedPage([], { playedWith: new Set([MATE_ONE]) }), []);
    assert.deepEqual(rankFeedPage(null, { playedWith: new Set([MATE_ONE]) }), []);
    assert.equal(isPlayedWithAuthor({ authorId: MATE_ONE.toUpperCase() }, new Set([MATE_ONE])), true, 'authorId and case are tolerated');
    assert.equal(isPlayedWithAuthor({ author_id: id(1) }, new Set([MATE_ONE])), false);
});

test('a signed-in viewer with tablemates gets band A first, ranked true and playedWith flags', async () => {
    const { res, calls } = await runFeed(rows(), { query: { limit: '6' }, auth: VIEWER, playedWith: tablemates });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ranked, true);
    assert.deepEqual(res.body.posts.map(post => post.id), [id(2), id(4), id(5), id(1), id(3), id(6)]);
    assert.deepEqual(res.body.posts.map(post => post.playedWith), [true, true, true, false, false, false]);
    assert.deepEqual(res.body.carry, [id(2), id(4), id(5), id(1), id(3), id(6)]);

    const rpc = calls.filter(call => call.path.endsWith('/rest/v1/rpc/fn_feed_played_with'));
    assert.equal(rpc.length, 1, 'one played-with call per request');
    assert.equal(rpc[0].method, 'POST');
    assert.deepEqual(JSON.parse(rpc[0].init.body), { p_viewer: VIEWER, p_hands: 200, p_cap: 100 });
    assert.equal(typeof rpc[0].init.headers.apikey, 'string', 'the service key header is present');
    assert.ok(rpc[0].init.signal === undefined || typeof rpc[0].init.signal === 'object', 'a timeout signal may ride along');
});

test('ranking never moves nextOffset: the raw continuation is the same as the anonymous page', async () => {
    const anonymous = await runFeed(rows(), { query: { limit: '4' } });
    const ranked = await runFeed(rows(), { query: { limit: '4' }, auth: VIEWER, playedWith: tablemates });
    assert.equal(ranked.res.body.nextOffset, anonymous.res.body.nextOffset);
    assert.equal(ranked.res.body.hasMore, anonymous.res.body.hasMore);
    assert.deepEqual(anonymous.res.body.posts.map(post => post.id), [id(1), id(2), id(3), id(4)]);
    assert.deepEqual(ranked.res.body.posts.map(post => post.id), [id(2), id(4), id(1), id(3)], 'row 5 stays on the next page');
    assert.deepEqual(new Set(ranked.res.body.carry), new Set(anonymous.res.body.carry), 'the same rows, permuted');
});

test('a played-with failure degrades to the chronological page with ranked false, never a 5xx', async () => {
    for (const playedWith of ['error', 'reject']) {
        const { res } = await runFeed(rows(), { query: { limit: '6' }, auth: VIEWER, playedWith });
        assert.equal(res.statusCode, 200, playedWith);
        assert.equal(res.body.ranked, false);
        assert.deepEqual(res.body.posts.map(post => post.id), [id(1), id(2), id(3), id(4), id(5), id(6)]);
        assert.ok(res.body.posts.every(post => post.playedWith === false));
    }
    const empty = await runFeed(rows(), { query: { limit: '6' }, auth: VIEWER, playedWith: [] });
    assert.equal(empty.res.body.ranked, true, 'a successful call with no tablemates is still a ranked page');
    assert.deepEqual(empty.res.body.posts.map(post => post.id), [id(1), id(2), id(3), id(4), id(5), id(6)]);
});

test('an anonymous viewer makes no played-with call and gets ranked false', async () => {
    const { res, calls } = await runFeed(rows(), { query: { limit: '6' }, playedWith: tablemates });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ranked, false);
    assert.equal(calls.filter(call => call.path.includes('fn_feed_played_with')).length, 0);
    assert.deepEqual(res.body.posts.map(post => post.id), [id(1), id(2), id(3), id(4), id(5), id(6)]);
    assert.ok(res.body.posts.every(post => post.playedWith === false));
});

test('the call rides in the same batch as the profiles read, carries a timeout, and the merge follows the window', () => {
    const batch = FEED_SOURCE.slice(
        FEED_SOURCE.indexOf('const [profilesData, likesData, ownLikesData, bookmarksData, playedWithResult] = await Promise.all(['),
        FEED_SOURCE.indexOf('const { playedWith, ranked } = playedWithResult;'),
    );
    assert.ok(batch.length > 0, 'the batch destructures the played-with result');
    assert.match(batch, /\/profiles\?id=in\./);
    assert.match(batch, /readPlayedWith\(userId\),/);
    assert.match(FEED_SOURCE, /supaFetch\('\/rpc\/fn_feed_played_with', options\)/);
    assert.match(FEED_SOURCE, /p_viewer: userId, p_hands: PLAYED_WITH_HANDS, p_cap: PLAYED_WITH_CAP/);
    assert.match(FEED_SOURCE, /AbortSignal\.timeout\(PLAYED_WITH_TIMEOUT_MS\)/);
    assert.match(FEED_SOURCE, /return \{ playedWith: new Set\(\), ranked: false \};/);
    assert.match(FEED_SOURCE, /if \(!userId\) return \{ playedWith: new Set\(\), ranked: false \};/);
    // The merge happens after readSafePostWindow returned nextOffset.
    const window = FEED_SOURCE.indexOf('readSafePostWindow(offset, limit, { tab, topic, excludeIds, authorCap: FEED_AUTHOR_CAP })');
    const merge = FEED_SOURCE.indexOf('const pagePosts = ranked ? rankFeedPage(posts, { playedWith }) : posts;');
    assert.ok(window > 0 && merge > window, 'ranking is applied after the window fixed nextOffset');
    assert.match(FEED_SOURCE, /playedWith: playedWith\.has\(String\(p\.author_id \|\| ''\)\.toLowerCase\(\)\),/);
});

test('horses are players: band membership is the viewer\'s own hands and nothing else', () => {
    assert.doesNotMatch(RANKING_SOURCE, /is_horse|origin_type|scheduler|metadata/);
    const handler = FEED_SOURCE.slice(FEED_SOURCE.indexOf('async function readPlayedWith'), FEED_SOURCE.indexOf('export async function readSafePostWindow'));
    assert.doesNotMatch(handler, /is_horse|origin_type|scheduler/);
});
