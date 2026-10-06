/**
 * What a browser may know about a social post (2026-10-05).
 * ═══════════════════════════════════════════════════════════════════════════
 * Dan, 2026-09-02: "NOBODY SHOULD EVER EVER EVER BE ABLE TO LOOK AT OUR CODE
 * OR USE A DEVELOPER TOOL AND FIND THIS OUT."
 *
 * Two columns of public.social_posts say who, or what, wrote a post:
 *
 *   - origin_type: 'horse' on every clip a horse published;
 *   - metadata: the publishing pipeline's working notes (scheduler,
 *     publication_key, semantic_key, grounding, clip_source, phase6_mode, ...)
 *     sit only on posts a horse made, including the ones whose origin_type
 *     says 'user_upload'.
 *
 * Neither ever reaches a browser:
 *
 *   - the database grants anon and authenticated SELECT column by column, and
 *     those two columns are not granted (a column added later is not granted
 *     either until somebody decides it should be: see SOCIAL_POST_COLUMN_ACCESS);
 *   - every server route that hands a post to a browser passes it through
 *     toBrowserPost(), which drops origin_type and replaces metadata with
 *     displayMetadata(): only the keys the UI renders, and none of them is a
 *     key the pipeline writes. A horse's post and a human's post carry the
 *     same shape: `metadata` is always an object, usually `{}`.
 *
 * Pure: imported by pages/api routes and by the browser alike.
 * IF YOU NEED ANOTHER METADATA KEY IN THE UI, add it to
 * POST_DISPLAY_METADATA_KEYS and check that the publishing pipeline never
 * writes it. __tests__/a-post-never-says-who-wrote-it.law.test.mjs holds both.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Every metadata key the UI renders, and nothing else. Each one is read by a
 * browser file (the law test checks that, so this list cannot grow past what
 * the UI uses):
 *
 *   page_name, page_avatar_url, source_page_id   a club page's post
 *   puzzle                                       a puzzle post's options
 *   ended, stream_id, lives_id, source           a live post and its replay
 *   venue_name, game_type, stakes,
 *   current_profit, notes                        a live session post
 *   shared_reel_id, shared_reel_topic,
 *   shared_reel_channel_name                     a Reel shared to the feed
 */
export const POST_DISPLAY_METADATA_KEYS = Object.freeze([
    'page_name',
    'page_avatar_url',
    'source_page_id',
    'puzzle',
    'ended',
    'stream_id',
    'lives_id',
    'source',
    'venue_name',
    'game_type',
    'stakes',
    'current_profit',
    'notes',
    'shared_reel_id',
    'shared_reel_topic',
    'shared_reel_channel_name',
]);

/**
 * Who may read each column of public.social_posts with the public key.
 * 'browser': granted to anon and authenticated. 'server': never granted; only
 * the service role reads it. A new column is 'server' in the database until a
 * GRANT says otherwise, and a browser select that names a column missing here
 * fails the law test, so adding a column is always a decision.
 */
export const SOCIAL_POST_COLUMN_ACCESS = Object.freeze({
    id: 'browser',
    author_id: 'browser',
    content: 'browser',
    content_type: 'browser',
    media_urls: 'browser',
    like_count: 'browser',
    comment_count: 'browser',
    share_count: 'browser',
    view_count: 'browser',
    visibility: 'browser',
    is_pinned: 'browser',
    is_flagged: 'browser',
    is_deleted: 'browser',
    achievement_data: 'browser',
    created_at: 'browser',
    updated_at: 'browser',
    search_vector: 'browser',
    metadata: 'server',
    link_url: 'browser',
    link_title: 'browser',
    link_description: 'browser',
    link_image: 'browser',
    link_site_name: 'browser',
    thumbnail_url: 'browser',
    transcode_status: 'browser',
    original_media_url: 'browser',
    transcode_error: 'browser',
    transcoded_at: 'browser',
    cover_frames: 'browser',
    cover_frame_index: 'browser',
    ai_label: 'browser',
    audience_mode: 'browser',
    audience_list: 'browser',
    share_to_story: 'browser',
    metadata_location: 'browser',
    topics: 'browser',
    origin_type: 'server',
    playback_type: 'browser',
    topic: 'browser',
    rights_status: 'browser',
    source_asset_id: 'browser',
    youtube_video_id: 'browser',
    canonical_asset_key: 'browser',
    publication_key: 'browser',
    legacy_transition_expires_at: 'browser',
    attribution_name: 'browser',
    attribution_url: 'browser',
    disclosure_kind: 'browser',
    sponsor_name: 'browser',
    made_for_kids: 'browser',
    moderation_state: 'browser',
    takedown_case_id: 'browser',
    taken_down_at: 'browser',
});

/** The columns a browser read of a whole post asks for (no search_vector: nothing renders it). */
export const BROWSER_POST_COLUMNS = Object.freeze(
    Object.keys(SOCIAL_POST_COLUMN_ACCESS).filter(
        (column) => SOCIAL_POST_COLUMN_ACCESS[column] === 'browser' && column !== 'search_vector'
    )
);

/** `select(BROWSER_POST_SELECT)` in place of `select('*')` on social_posts in browser code. */
export const BROWSER_POST_SELECT = BROWSER_POST_COLUMNS.join(',');

const DISPLAY_KEYS = new Set(POST_DISPLAY_METADATA_KEYS);

/**
 * The part of a post's metadata the UI renders. Always a fresh plain object;
 * `{}` for anything that is not an object or carries none of the keys.
 */
export function displayMetadata(metadata) {
    const out = {};
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return out;
    for (const key of POST_DISPLAY_METADATA_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(metadata, key)) continue;
        const value = metadata[key];
        if (value === undefined || value === null) continue;
        out[key] = value;
    }
    return out;
}

/** True when `key` is one the UI may receive in a post's metadata. */
export function isDisplayMetadataKey(key) {
    return DISPLAY_KEYS.has(key);
}

/**
 * A social_posts row as a browser may receive it: no origin_type, and
 * metadata reduced to displayMetadata(). Every other field is kept as is.
 */
export function toBrowserPost(row) {
    if (!row || typeof row !== 'object') return row;
    const out = {};
    for (const [key, value] of Object.entries(row)) {
        if (key === 'origin_type' || key === 'metadata') continue;
        out[key] = value;
    }
    out.metadata = displayMetadata(row.metadata);
    return out;
}
