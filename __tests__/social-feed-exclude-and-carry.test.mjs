/**
 * Phase 8: seen-dedup without a table. The client sends exclude= the ids of
 * the last two pages it holds; the server consumes an excluded row the way
 * it consumes an ineligible row (counted in the raw continuation, not
 * returned) and echoes carry = the ids it returned, in order, so the client
 * builds the next exclude list from the last two carry arrays. A list over
 * FEED_EXCLUDE_MAX ids or with a malformed id is a 400.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FEED_SOURCE,
    id,
    installFakeSupabase,
    loadFeedRoute,
    runFeed,
    textPost,
} from './social-feed-api-harness.mjs';

const route = loadFeedRoute();

function rows() {
    return [1, 2, 3, 4, 5, 6].map(n => textPost(n, { author: id(900 + n) }));
}

test('FEED_EXCLUDE_MAX is 50', () => {
    assert.equal(route.FEED_EXCLUDE_MAX, 50);
    assert.match(FEED_SOURCE, /export const FEED_EXCLUDE_MAX = 50;/);
});

test('excluded ids are consumed and not returned, and the continuation stays exact', async () => {
    const { res } = await runFeed(rows(), { query: { limit: '2', exclude: `${id(2)},${id(3)}` } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.posts.map(post => post.id), [id(1), id(4)]);
    assert.equal(res.body.hasMore, true);
    assert.equal(res.body.nextOffset, 4, 'rows 2 and 3 were consumed; row 5 is the first uninspected row');
    assert.deepEqual(res.body.carry, [id(1), id(4)]);
});

test('carry equals the returned ids in returned order, also when the page is ranked', async () => {
    const plain = await runFeed(rows(), { query: { limit: '4' } });
    assert.deepEqual(plain.res.body.carry, plain.res.body.posts.map(post => post.id));
    assert.deepEqual(plain.res.body.carry, [id(1), id(2), id(3), id(4)]);

    const ranked = await runFeed(rows(), { query: { limit: '4' }, auth: id(500), playedWith: [{ user_id: id(903) }] });
    assert.equal(ranked.res.body.ranked, true);
    assert.deepEqual(ranked.res.body.posts.map(post => post.id), [id(3), id(1), id(2), id(4)]);
    assert.deepEqual(ranked.res.body.carry, [id(3), id(1), id(2), id(4)], 'carry follows the returned order');
});

test('the client can hand back the last two carry arrays and never sees a repeat', async () => {
    const page1 = await runFeed(rows(), { query: { limit: '2' } });
    const page2 = await runFeed(rows(), { query: { limit: '2', offset: String(page1.res.body.nextOffset), exclude: page1.res.body.carry.join(',') } });
    const seen = new Set([...page1.res.body.carry, ...page2.res.body.carry]);
    assert.equal(seen.size, 4, 'no id came back twice');
    // Offset drift: an insert above the reader shifts every row by one, so
    // the next raw page starts with the row the client already holds.
    const drifted = [textPost(0, { author: id(999) }), ...rows()];
    const page3 = await runFeed(drifted, {
        query: { limit: '2', offset: String(page2.res.body.nextOffset), exclude: [...page1.res.body.carry, ...page2.res.body.carry].join(',') },
    });
    for (const postId of page3.res.body.carry) assert.ok(!seen.has(postId), `${postId} was already delivered`);
    assert.deepEqual(page3.res.body.carry, [id(5), id(6)]);
});

test('more than 50 ids, a malformed id or a repeated parameter is a 400 with the contract message', async () => {
    const fifty = Array.from({ length: 50 }, (_, index) => id(1000 + index));
    const ok = await runFeed(rows(), { query: { limit: '2', exclude: fifty.join(',') } });
    assert.equal(ok.res.statusCode, 200, 'fifty ids are accepted');

    const fiftyOne = [...fifty, id(2000)];
    for (const exclude of [fiftyOne.join(','), 'not-a-uuid', `${id(1)},nope`, `${id(1)};${id(2)}`, [id(1), id(2)]]) {
        const { res, calls } = await runFeed(rows(), { query: { limit: '2', exclude } });
        assert.equal(res.statusCode, 400, JSON.stringify(exclude).slice(0, 60));
        assert.deepEqual(res.body, { error: 'Unsupported exclude list' });
        assert.equal(calls.length, 0, 'no read happens for a bad list');
    }
    const parsed = route.parseFeedQuery({ exclude: fiftyOne.join(',') });
    assert.deepEqual(parsed, { error: 'Unsupported exclude list' });
});

test('an empty list is no list, ids are matched case-insensitively and whitespace is tolerated', async () => {
    const empty = await runFeed(rows(), { query: { limit: '2', exclude: '' } });
    assert.deepEqual(empty.res.body.carry, [id(1), id(2)]);
    const upper = await runFeed(rows(), { query: { limit: '2', exclude: ` ${id(1).toUpperCase()} , ${id(2)} ,` } });
    assert.deepEqual(upper.res.body.carry, [id(3), id(4)]);
    assert.deepEqual([...route.parseFeedQuery({ exclude: id(7).toUpperCase() }).excludeIds], [id(7)]);
});

test('readSafePostWindow takes the exclude set directly and an empty page still answers the contract shape', async () => {
    const fake = installFakeSupabase(rows());
    try {
        const window = await route.readSafePostWindow(0, 10, { excludeIds: new Set([id(1), id(6)]) });
        assert.deepEqual(window.posts.map(post => post.id), [id(2), id(3), id(4), id(5)]);
        assert.deepEqual({ hasMore: window.hasMore, nextOffset: window.nextOffset, partial: window.partial }, { hasMore: false, nextOffset: 6, partial: false });
    } finally {
        fake.restore();
    }
    const everything = await runFeed(rows(), { query: { limit: '10', exclude: [1, 2, 3, 4, 5, 6].map(id).join(',') } });
    assert.equal(everything.res.statusCode, 200);
    assert.deepEqual(everything.res.body, {
        posts: [], hasMore: false, nextOffset: 6, partial: false, offset: 0, limit: 10, tab: 'all', ranked: false, carry: [],
    });
});

test('the exclude check is a set lookup on the consumed row and reads no horse marker', () => {
    const scan = FEED_SOURCE.slice(
        FEED_SOURCE.indexOf('async function readSafePostWindow'),
        FEED_SOURCE.indexOf('export default async function handler'),
    );
    assert.match(scan, /if \(excludeIds\.has\(String\(post\.id \|\| ''\)\.toLowerCase\(\)\)\) continue;/);
    assert.doesNotMatch(scan, /is_horse|origin_type|scheduler/);
    assert.match(FEED_SOURCE, /carry: enrichedPosts\.map\(post => post\.id\),/);
    assert.match(FEED_SOURCE, /if \(ids\.length > FEED_EXCLUDE_MAX\) return \{ error: 'Unsupported exclude list' \};/);
});
