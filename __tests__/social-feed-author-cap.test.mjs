/**
 * Phase 8: the per-author cap of the social feed page.
 *
 * While readSafePostWindow consumes eligible rows in raw order it keeps a
 * count per author_id for THIS page; a row whose author already has
 * FEED_AUTHOR_CAP returned rows is consumed (it counts in the raw
 * continuation) but not returned, exactly like an ineligible row. Dropped
 * rows stay reachable on the author page and the Reels or News surfaces.
 * The counter keys on author_id only: a horse and a human get the same cap.
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
const A = id(901);
const B = id(902);
const C = id(903);

function rows() {
    return [
        textPost(1, { author: A }),
        textPost(2, { author: A }),
        textPost(3, { author: A }), // third A: dropped
        textPost(4, { author: B }),
        textPost(5, { author: A }), // fourth A: dropped
        textPost(6, { author: C }),
        textPost(7, { author: C }),
        textPost(8, { author: A }), // A again on a later page
    ];
}

test('FEED_AUTHOR_CAP is 2 and the window accepts it as an option', () => {
    assert.equal(route.FEED_AUTHOR_CAP, 2);
    assert.match(FEED_SOURCE, /export const FEED_AUTHOR_CAP = 2;/);
    assert.match(FEED_SOURCE, /readSafePostWindow\(offset, limit, \{ tab, topic, excludeIds, authorCap: FEED_AUTHOR_CAP \}\)/);
});

test('the third row of an author on a page is dropped and nextOffset is the raw position of the first uninspected row', async () => {
    const { res } = await runFeed(rows(), { query: { limit: '3' } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.posts.map(post => post.id), [id(1), id(2), id(4)], 'row 3 is consumed, not returned');
    assert.equal(res.body.hasMore, true);
    // rows 0..3 fill the page; row 4 (A, over the cap) is consumed; row 5 (C)
    // is the first eligible row the scan inspected but did not consume.
    assert.equal(res.body.nextOffset, 5);
    assert.equal(res.body.partial, false);
    assert.deepEqual(res.body.carry, [id(1), id(2), id(4)]);
});

test('the next page resumes at the raw continuation and the counter restarts per page', async () => {
    const first = await runFeed(rows(), { query: { limit: '3' } });
    const second = await runFeed(rows(), { query: { limit: '3', offset: String(first.res.body.nextOffset) } });
    assert.deepEqual(second.res.body.posts.map(post => post.id), [id(6), id(7), id(8)], 'A starts at zero on the new page');
    assert.equal(second.res.body.hasMore, false);
    assert.equal(second.res.body.nextOffset, 8);
    assert.equal(second.postQueries[0].searchParams.get('offset'), '5', 'the scan starts at the raw continuation');
});

test('readSafePostWindow: capped rows are consumed like ineligible rows and the cap is an option', async () => {
    const fake = installFakeSupabase(rows());
    try {
        const capped = await route.readSafePostWindow(0, 3, { tab: 'all', topic: null, excludeIds: new Set(), authorCap: 2 });
        assert.deepEqual(capped.posts.map(post => post.id), [id(1), id(2), id(4)]);
        assert.deepEqual({ hasMore: capped.hasMore, nextOffset: capped.nextOffset, partial: capped.partial }, { hasMore: true, nextOffset: 5, partial: false });

        const wide = await route.readSafePostWindow(0, 3, { authorCap: 3 });
        assert.deepEqual(wide.posts.map(post => post.id), [id(1), id(2), id(3)], 'a wider cap keeps the third row');
        assert.equal(wide.nextOffset, 3, 'row 4 is the first uninspected row');

        const whole = await route.readSafePostWindow(0, 20, { authorCap: 2 });
        assert.deepEqual(whole.posts.map(post => post.id), [id(1), id(2), id(4), id(6), id(7)], 'A gets two rows on the page, C gets two, the rest are dropped');
        assert.deepEqual({ hasMore: whole.hasMore, nextOffset: whole.nextOffset }, { hasMore: false, nextOffset: 8 });

        const defaults = await route.readSafePostWindow(0, 20);
        assert.deepEqual(defaults.posts.map(post => post.id), whole.posts.map(post => post.id), 'no options means the contract cap');
    } finally {
        fake.restore();
    }
});

test('the cap keys on author_id only: a page of one author yields exactly two posts, whoever the author is', async () => {
    for (const author of [A, id(777)]) {
        const page = [1, 2, 3, 4, 5].map(n => textPost(n, { author }));
        const { res } = await runFeed(page, { query: { limit: '20' } });
        assert.deepEqual(res.body.posts.map(post => post.id), [id(1), id(2)]);
        assert.equal(res.body.nextOffset, 5, 'the dropped rows are consumed');
        assert.equal(res.body.hasMore, false);
    }
});

test('the window counts by author_id and reads no horse marker; the continuation lines are byte-for-byte', () => {
    const scan = FEED_SOURCE.slice(
        FEED_SOURCE.indexOf('async function readSafePostWindow'),
        FEED_SOURCE.indexOf('export default async function handler'),
    );
    assert.match(scan, /const countByAuthor = new Map\(\);/);
    assert.match(scan, /const authorKey = String\(post\.author_id \|\| ''\);/);
    assert.match(scan, /if \(\(countByAuthor\.get\(authorKey\) \|\| 0\) >= authorCap\) continue;/);
    assert.match(scan, /countByAuthor\.set\(authorKey, \(countByAuthor\.get\(authorKey\) \|\| 0\) \+ 1\);/);
    assert.doesNotMatch(scan, /is_horse|origin_type|scheduler|metadata\?\.\w*horse/);
    // The drop happens before the limit check, so a capped row can never be
    // the "first uninspected" row.
    const cap = scan.indexOf('>= authorCap) continue;');
    const limit = scan.indexOf('if (posts.length === limit) {');
    assert.ok(cap > 0 && limit > cap, 'cap check precedes the limit check');
    assert.match(scan, /return \{ posts, hasMore: true, nextOffset: rawOffset \+ index, partial: false \};/);
    assert.match(scan, /return \{ posts, hasMore: true, nextOffset: rawOffset, partial: true \};/);
    assert.match(scan, /scanned\s*<\s*MAX_POST_SCAN_ROWS/);
});
