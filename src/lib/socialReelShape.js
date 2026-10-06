/**
 * What a browser may know about a Reel (2026-10-05).
 * ═══════════════════════════════════════════════════════════════════════════
 * Dan, 2026-09-02: "NOBODY SHOULD EVER EVER EVER BE ABLE TO LOOK AT OUR CODE
 * OR USE A DEVELOPER TOOL AND FIND THIS OUT."
 *
 * public.social_reels.origin_type is 'horse' on every Reel a horse published,
 * and on nothing else. It is the only column that says who made a Reel: a
 * player who pastes a YouTube link and shares it to Reels gets the same
 * playback, rights, source and identity columns a horse's clip has (see
 * publish_user_video_reel and fn_social_posts_video_to_reel_mirror).
 *
 * origin_type never reaches a browser:
 *
 *   - the database grants anon and authenticated SELECT column by column on
 *     social_reels, and origin_type is not granted (a column added later is
 *     not granted either until somebody decides it should be: see
 *     SOCIAL_REEL_COLUMN_ACCESS). Realtime drops an ungranted column from
 *     postgres_changes payloads, so the browser's live updates lose it too;
 *   - every Reel a server route hands a browser leaves src/lib/server/reelsFeed.js
 *     through toBrowserReel(), so the response has the same keys for a horse's
 *     Reel and a player's Reel, and none of them is origin_type;
 *   - a Reel's source name comes from the Reel's own attribution or the shared
 *     video library, never from the linked post's metadata, whose clip_source
 *     only the publishing pipeline writes.
 *
 * Pure: imported by the server reader and by the law test.
 * __tests__/a-reel-never-says-who-made-it.law.test.mjs holds all of this.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Who may read each column of public.social_reels with the public key.
 * 'browser': granted to anon and authenticated. 'server': never granted; only
 * the service role reads it. A new column is 'server' in the database until a
 * GRANT says otherwise, and the law test fails when a browser read names a
 * column missing here, so adding a column is always a decision.
 */
export const SOCIAL_REEL_COLUMN_ACCESS = Object.freeze({
    id: 'browser',
    author_id: 'browser',
    video_url: 'browser',
    thumbnail_url: 'browser',
    caption: 'browser',
    view_count: 'browser',
    like_count: 'browser',
    created_at: 'browser',
    source_story_id: 'browser',
    is_public: 'browser',
    source_post_id: 'browser',
    share_count: 'browser',
    comment_count: 'browser',
    updated_at: 'browser',
    source_type: 'browser',
    youtube_video_id: 'browser',
    media_status: 'browser',
    original_youtube_url: 'browser',
    origin_type: 'server',
    playback_type: 'browser',
    topic: 'browser',
    rights_status: 'browser',
    source_asset_id: 'browser',
    canonical_asset_key: 'browser',
    publication_key: 'browser',
    legacy_transition_expires_at: 'browser',
    is_deleted: 'browser',
    native_processing_requested: 'browser',
    attribution_name: 'browser',
    attribution_url: 'browser',
    disclosure_kind: 'browser',
    sponsor_name: 'browser',
    made_for_kids: 'browser',
    moderation_state: 'browser',
    takedown_case_id: 'browser',
    taken_down_at: 'browser',
});

/** Columns of social_reels a browser may never read. */
export const SERVER_ONLY_REEL_COLUMNS = Object.freeze(
    Object.keys(SOCIAL_REEL_COLUMN_ACCESS).filter(
        (column) => SOCIAL_REEL_COLUMN_ACCESS[column] === 'server'
    )
);

/** The columns a browser read of a whole Reel row may name. */
export const BROWSER_REEL_COLUMNS = Object.freeze(
    Object.keys(SOCIAL_REEL_COLUMN_ACCESS).filter(
        (column) => SOCIAL_REEL_COLUMN_ACCESS[column] === 'browser'
    )
);

/** `select(BROWSER_REEL_SELECT)` in place of `select('*')` on social_reels in browser code. */
export const BROWSER_REEL_SELECT = BROWSER_REEL_COLUMNS.join(',');

const SERVER_ONLY = new Set(SERVER_ONLY_REEL_COLUMNS);

/**
 * A Reel as a browser may receive it: no server-only column and no
 * underscore-prefixed working field of the server reader. Every other field is
 * kept as is.
 */
export function toBrowserReel(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const out = {};
    for (const [key, value] of Object.entries(row)) {
        if (SERVER_ONLY.has(key) || key.startsWith('_')) continue;
        out[key] = value;
    }
    return out;
}
