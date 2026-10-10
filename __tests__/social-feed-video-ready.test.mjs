/**
 * Phase 8: the social feed shows a native upload only once it is ready.
 *
 * A content_type video row with playback_type native whose transcode_status
 * is not in READY_TRANSCODE_STATUSES (null or done) is consumed and not
 * returned, exactly like an unsafe row, so the raw continuation stays exact.
 * A done row, a row that predates transcoding (null) and every YouTube row
 * pass. Each returned post carries transcodeStatus and coverFrameUrl.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FEED_SOURCE,
    YOUTUBE_ID,
    id,
    installFakeSupabase,
    loadFeedRoute,
    nativeVideoPost,
    runFeed,
    textPost,
    youtubeVideoPost,
} from './social-feed-api-harness.mjs';

const route = loadFeedRoute();

function rows() {
    return [
        nativeVideoPost(1, { author: id(911), transcodeStatus: 'done' }),
        nativeVideoPost(2, { author: id(912), transcodeStatus: 'queued' }),
        nativeVideoPost(3, { author: id(913), transcodeStatus: 'running' }),
        nativeVideoPost(4, { author: id(914), transcodeStatus: 'failed' }),
        nativeVideoPost(5, { author: id(915), transcodeStatus: 'invalid' }),
        nativeVideoPost(6, { author: id(916), transcodeStatus: null }),
        youtubeVideoPost(7, { author: id(917) }),
        textPost(8, { author: id(918) }),
        youtubeVideoPost(9, { author: id(919), transcode_status: 'queued' }),
    ];
}

test('READY_TRANSCODE_STATUSES is exactly { null, done }', () => {
    assert.equal(route.READY_TRANSCODE_STATUSES.size, 2);
    assert.equal(route.READY_TRANSCODE_STATUSES.has(null), true);
    assert.equal(route.READY_TRANSCODE_STATUSES.has('done'), true);
    assert.equal(route.READY_TRANSCODE_STATUSES.has('queued'), false);
    assert.match(FEED_SOURCE, /export const READY_TRANSCODE_STATUSES = new Set\(\[null, 'done'\]\);/);
});

test('a queued, running, failed or invalid native video is dropped; done, legacy null, YouTube and text pass', async () => {
    const { res, calls } = await runFeed(rows(), { query: { limit: '20' } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.posts.map(post => post.id), [id(1), id(6), id(7), id(8), id(9)]);
    assert.equal(res.body.hasMore, false);
    assert.equal(res.body.nextOffset, 9, 'the dropped rows are consumed by position');
    const byId = new Map(res.body.posts.map(post => [post.id, post]));
    assert.equal(byId.get(id(1)).transcodeStatus, 'done');
    assert.equal(byId.get(id(6)).transcodeStatus, null);
    assert.equal(byId.get(id(9)).transcodeStatus, 'queued', 'a YouTube row never transcodes, so its status is informational');
    assert.equal(byId.get(id(7)).playback_type, 'youtube_embed');
    assert.deepEqual(byId.get(id(7)).mediaUrls, [`https://www.youtube.com/watch?v=${YOUTUBE_ID}`]);
    assert.equal(byId.get(id(1)).playback_type, 'native');
    assert.equal(byId.get(id(1)).coverFrameUrl, null);
    assert.ok(calls.some(call => call.path.endsWith('/rpc/fn_filter_valid_user_video_storage_urls')), 'native rows still go through the storage proof');
    assert.ok(calls.some(call => call.path.endsWith('/video_library_videos')), 'YouTube rows still go through the availability proof');
});

test('the drop keeps nextOffset exact when the page fills right before a not-ready row', async () => {
    const fake = installFakeSupabase(rows());
    try {
        const window = await route.readSafePostWindow(0, 1);
        assert.deepEqual(window.posts.map(post => post.id), [id(1)]);
        // rows 2..5 are consumed as not ready; row 6 (index 5) is the first
        // eligible row the scan inspected but did not consume.
        assert.deepEqual({ hasMore: window.hasMore, nextOffset: window.nextOffset, partial: window.partial }, { hasMore: true, nextOffset: 5, partial: false });
        const next = await route.readSafePostWindow(window.nextOffset, 1);
        assert.deepEqual(next.posts.map(post => post.id), [id(6)]);
        assert.equal(next.nextOffset, 6);
    } finally {
        fake.restore();
    }
});

test('a native cover frame reaches the client as coverFrameUrl', async () => {
    const page = [nativeVideoPost(1, {
        author: id(911),
        cover_frames: ['https://cdn.test/one.jpg', 'https://cdn.test/two.jpg'],
        cover_frame_index: 1,
        thumbnail_url: null,
    })];
    const { res } = await runFeed(page, { query: { limit: '5' } });
    assert.equal(res.body.posts[0].coverFrameUrl, 'https://cdn.test/two.jpg');
    assert.equal(res.body.posts[0].thumbnailUrl, null);
});

test('the ready check sits after the managed eligibility chain and before the limit check, and reads no horse marker', () => {
    const scan = FEED_SOURCE.slice(
        FEED_SOURCE.indexOf('async function readSafePostWindow'),
        FEED_SOURCE.indexOf('export default async function handler'),
    );
    const eligible = scan.indexOf('if (!managedVideoPostIsEligible(post, context)) continue;');
    const ready = scan.indexOf('if (!nativeVideoIsReady(post)) continue;');
    const limit = scan.indexOf('if (posts.length === limit) {');
    assert.ok(eligible > 0 && ready > eligible && limit > ready, 'audience, eligibility, ready, then the limit');
    assert.match(FEED_SOURCE, /if \(post\?\.content_type !== 'video' \|\| post\?\.playback_type !== 'native'\) return true;/);
    assert.match(FEED_SOURCE, /return READY_TRANSCODE_STATUSES\.has\(post\?\.transcode_status \?\? null\);/);
    assert.match(FEED_SOURCE, /transcodeStatus: p\.transcode_status \?\? null,/);
    assert.match(FEED_SOURCE, /coverFrameUrl: coverFrameUrlFor\(p\),/);
    assert.doesNotMatch(scan, /is_horse|scheduler/);
});

test('single-row authority rejects revoked or stale managed sources, confirmed failures, and unverified native objects', () => {
    const now = Date.now();
    const assetId = id(8001);
    const managed = youtubeVideoPost(21, {
        origin_type: 'video_library',
        source_asset_id: assetId,
        publication_key: `video-library:${assetId}`,
        topic: 'cash',
    });
    const baseContext = {
        assetById: new Map(),
        assetByYoutube: new Map(),
        verificationByYoutube: new Map(),
        failedYoutubeIds: new Set(),
        verifiedNativeObjects: new Set(),
    };
    const asset = {
        id: assetId,
        youtube_video_id: YOUTUBE_ID,
        type: 'cash',
        availability_status: 'verified',
        embeddable: true,
        availability_checked_at: new Date(now).toISOString(),
    };
    const good = {
        ...baseContext,
        assetById: new Map([[assetId, asset]]),
        assetByYoutube: new Map([[YOUTUBE_ID, asset]]),
    };
    assert.equal(route.managedVideoPostIsEligible(managed, good, now), true);
    assert.equal(route.managedVideoPostIsEligible(managed, {
        ...good,
        assetById: new Map([[assetId, { ...asset, availability_status: 'unavailable', embeddable: false }]]),
    }, now), false, 'revoked source asset');
    const stale = new Date(now - (8 * 24 * 60 * 60 * 1000)).toISOString();
    const staleAsset = { ...asset, availability_checked_at: stale };
    assert.equal(route.managedVideoPostIsEligible(managed, {
        ...good,
        assetById: new Map([[assetId, staleAsset]]),
        assetByYoutube: new Map([[YOUTUBE_ID, staleAsset]]),
    }, now), false, 'stale availability proof');
    assert.equal(route.managedVideoPostIsEligible(managed, {
        ...good,
        failedYoutubeIds: new Set([YOUTUBE_ID]),
    }, now), false, 'confirmed playback failure');

    const native = nativeVideoPost(22);
    assert.equal(route.managedVideoPostIsEligible(native, baseContext, now), false, 'native object lacks storage proof');
});
