/**
 * YouTube IDs that must never be offered by the video library.
 *
 * These records were verified against YouTube's embed player through 2026-09-06.
 * They are unavailable, age-restricted, or have third-party embedding disabled.
 * Keeping the gate centralized protects the live API, old bookmarks, and
 * stale catalog responses with the same rule. Static catalog objects are not
 * playable because a checked-in file cannot prove current embed availability.
 */
export const BLOCKED_VIDEO_LIBRARY_IDS = Object.freeze([
    '-rjQT0JOhGA',
    '185vMNh9ECc',
    '4441ee7htt0',
    '524_3UypGkU',
    '5wTToeCyu6I',
    '9PrLmIWU0mU',
    'CbXDixknmeM',
    'fzNt4SdBGuQ',
    'jdiDizWlIz0',
    'JVJrPh0s1JQ',
    'KQRZs6ytdWc',
    'LA4z0Hi0Jf8',
    'oINUSqHq_ck',
    'OYgw9TiNqZY',
    'pFbHkHhJO4Y',
    'pIZW-gmcKio',
    'slTxYV5S5n0',
    'TXarmUgk02Q',
    'RpU9bwH-2WI',
    'FqiS7LaQSsg',
    'vWVwhXeILoX',
    'c0RqYhgRxH0',
    'iDPJ3tHK6rA',
    'D1lPQFCDRLg',
    'bZqKGJz2HoE',
    'fQ9Lklp6AuA',
    'hA7c3HHFRUE',
    'n0fHHMfvWck',
    'GH5sEqf5p9Y',
    'aVGVP7Oj8Jg',
    'dbCLX6WbyJg',
    'kiAPXh4jRHo',
]);

const BLOCKED_VIDEO_LIBRARY_ID_SET = new Set(BLOCKED_VIDEO_LIBRARY_IDS);
export const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export const VIDEO_LIBRARY_ALLOWED_TYPES = Object.freeze(['cash', 'tournament']);
const VIDEO_LIBRARY_ALLOWED_TYPE_SET = new Set(VIDEO_LIBRARY_ALLOWED_TYPES);

/**
 * Shared availability-freshness contract: ONE value, everywhere.
 *
 * A persisted YouTube verification is accepted for at most 7 days, and its
 * timestamp may be at most 5 minutes in the future (clock skew). These two
 * numbers mirror the INSTALLED production SQL in
 * supabase/migrations/20260906235959_video_reels_integrity_foundation.sql:
 *   - fn_is_video_library_asset_eligible (also behind the
 *     video_library_public_catalog view and the public read policy)
 *   - fn_has_fresh_public_youtube_verification
 *   - publish_video_library_reel
 *   - fn_guard_youtube_native_transcode_job
 * each of which requires
 *   availability_checked_at >= now() - interval '7 days'
 *   availability_checked_at <= now() + interval '5 minutes'
 * (fn_queue_youtube_verification re-queues at 6 days, inside the bound).
 *
 * Why 7 days and not 24 hours: the single daily verifier run (limit 500,
 * 12-hour renewal target in scripts/video_library_to_reels.py) re-verifies
 * each of the ~1,417 poker rows about every 2.8 days. Seven days is therefore
 * a fail-closed expiry bound with margin. A 24-hour bound cannot be sustained
 * by one daily run and made the catalog API's JavaScript filter disagree with
 * the SQL view it paginates (total/hasMore counted rows the filter dropped).
 *
 * This is an expiry bound only. Unknown, NULL, unverified, non-embeddable and
 * confirmed-failed records still fail closed regardless of age.
 *
 * Consumers: this module, src/lib/server/reelsFeed.js and
 * pages/api/social/feed.js import these constants. src/lib/reelsFeedClient.js
 * keeps an import-free literal. All of them, the SQL, the Python renewal
 * target and the verifier capacity are pinned together by
 * __tests__/video-library-freshness-contract.test.mjs.
 *
 * Keep this module import-free: tests load it through a data: URL.
 */
export const VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export function isVideoLibraryVideoAllowed(videoOrId) {
    const videoId = typeof videoOrId === 'object' && videoOrId !== null
        ? videoOrId.videoId || videoOrId.id
        : videoOrId;
    if (!videoId) return false;
    const normalizedId = String(videoId);
    if (!YOUTUBE_VIDEO_ID_RE.test(normalizedId)) return false;
    if (normalizedId.startsWith('FAKE') || BLOCKED_VIDEO_LIBRARY_ID_SET.has(normalizedId)) return false;

    // ID-only checks protect old bookmarks before their catalog row resolves.
    // Once row metadata exists, keep the poker library limited to its supported
    // cash-game and tournament taxonomy. This rejects stale cached responses
    // containing slot/casino records without deleting those records at source.
    if (typeof videoOrId === 'object' && videoOrId !== null && videoOrId.type) {
        if (!VIDEO_LIBRARY_ALLOWED_TYPE_SET.has(String(videoOrId.type).toLowerCase())) return false;
    }

    // Every rendered object must carry a fresh persisted verification. A
    // checked-in fallback can age into a private, members-only, removed, or
    // embed-disabled video, so the ID blocklist alone is never sufficient.
    // ID-only strings remain valid preflight keys: the server must resolve
    // them to an audited object before playback.
    if (typeof videoOrId === 'object' && videoOrId !== null) {
        if (videoOrId.availabilityStatus !== 'verified' || videoOrId.embeddable !== true) return false;
        const checkedAt = Date.parse(videoOrId.availabilityCheckedAt || '');
        if (!Number.isFinite(checkedAt)) return false;
        const age = Date.now() - checkedAt;
        if (age > VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS || age < -VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS) return false;
    }
    return true;
}
