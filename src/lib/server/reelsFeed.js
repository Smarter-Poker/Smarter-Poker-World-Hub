/**
 * Canonical public Reels reader.
 *
 * This is the one server-side boundary for public Reel-backed surfaces. It
 * deliberately uses the service role, then reapplies the complete public,
 * category, playback and source-availability contract before returning a row.
 * Callers must not add a client-side Supabase fallback: doing so would bypass
 * the same safety checks this module centralises.
 */
import { createClient } from '../supabaseServerClient';
import { toBrowserReel } from '../socialReelShape';
import {
    BLOCKED_VIDEO_LIBRARY_IDS,
    VIDEO_LIBRARY_ALLOWED_TYPES,
    VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS,
    VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS,
} from '../videoLibraryAvailability';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 120;
const DEFAULT_COLLECTION_LIMIT = 50;
const MAX_COLLECTION_LIMIT = 100;
const MAX_SAVED_STATUS_IDS = 100;
const SCAN_CHUNK_SIZE = 240;
const COLLECTION_SCAN_CHUNK_SIZE = 120;
const MAX_SCAN_ROWS = 5_000;
const MAX_OWNED_SCAN_ROWS = 500;
const MAX_SAVED_SCAN_ROWS = 500;
const MAX_RELATED_SCAN_ROWS = 5_000;
const MAX_CURSOR_LENGTH = 1_024;
const IN_FILTER_CHUNK_SIZE = 180;
const IN_FILTER_PAGE_SIZE = 1_000;
const FOLLOWING_PAGE_SIZE = 1_000;
// Asset verification age and future skew come from the one shared freshness
// contract (src/lib/videoLibraryAvailability.js), which mirrors the installed
// SQL predicates. Do not redeclare them here. The legacy-transition window
// below is a separate, unrelated bound.
const LIBRARY_VERIFICATION_MAX_AGE_MS = VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS;
const LEGACY_TRANSITION_MAX_REMAINING_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Some maintained system and horse player profiles use historical, valid
// PostgreSQL UUIDs whose version nibble is zero. Keep the strict RFC-shaped
// expression above for caller-controlled identities, but do not drop a
// persisted author from public profile hydration merely because that legacy
// database identifier predates the versioned-id rule.
const PERSISTED_UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const CURSOR_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T[^\s]{1,40}$/;
const COLLECTION_CURSOR_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const REEL_CATEGORY_TOPICS = Object.freeze({
    poker: Object.freeze(['poker', 'cash', 'tournament']),
    'casino-slots': Object.freeze(['slots']),
    sports: Object.freeze(['sports']),
    'for-you': Object.freeze(['poker', 'cash', 'tournament', 'slots', 'sports']),
    following: Object.freeze(['poker', 'cash', 'tournament', 'slots', 'sports']),
});
const REEL_CATEGORIES = new Set(Object.keys(REEL_CATEGORY_TOPICS));
// Authenticated collections are category-neutral. A Reel that is eligible in
// any public category must not disappear from My Reels, Saved Reels, or the
// saved-status response merely because those legacy APIs predate category
// rails. This is an internal constant, never a client-controlled override.
const COLLECTION_CATEGORY = 'for-you';
const ALLOWED_LIBRARY_TYPES = new Set(VIDEO_LIBRARY_ALLOWED_TYPES);
const UNPLAYABLE_AVAILABILITY = new Set([
    'unavailable',
    'private',
    'restricted',
    'embed_disabled',
    'error',
]);
const ALLOWED_PLAYBACK_TYPES = new Set(['native', 'youtube_embed']);
const NATIVE_RIGHTS_STATUSES = new Set(['owned', 'licensed', 'user_authorized']);
const ALLOWED_ORIGIN_TYPES = new Set([
    'user_upload',
    'story',
    'social_post',
    'video_library',
    'horse',
    'pokernews',
    'generated',
    'legacy',
]);
const ALLOWED_RIGHTS_STATUSES = new Set([
    'unknown',
    'embed_only',
    'owned',
    'licensed',
    'user_authorized',
    'restricted',
]);
const BLOCKED_YOUTUBE_IDS = new Set(BLOCKED_VIDEO_LIBRARY_IDS);
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const YOUTUBE_NOCOOKIE_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com']);

function configuredStorageOrigin() {
    try {
        const parsed = new URL(
            process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
        );
        if (
            parsed.protocol !== 'https:'
            || parsed.username
            || parsed.password
            || parsed.port
            || (parsed.pathname && parsed.pathname !== '/')
            || parsed.search
            || parsed.hash
        ) return null;
        return parsed.origin.toLowerCase();
    } catch (_) {
        return null;
    }
}

const SUPABASE_STORAGE_ORIGIN = configuredStorageOrigin();

const REEL_SELECT = [
    'id',
    'author_id',
    'caption',
    'video_url',
    'thumbnail_url',
    'view_count',
    'like_count',
    'comment_count',
    'share_count',
    'created_at',
    'updated_at',
    'is_public',
    'is_deleted',
    'source_type',
    'source_post_id',
    'source_story_id',
    'youtube_video_id',
    'media_status',
    'original_youtube_url',
    'origin_type',
    'playback_type',
    'topic',
    'rights_status',
    'source_asset_id',
    'canonical_asset_key',
    'publication_key',
    'native_processing_requested',
    'attribution_name',
    'attribution_url',
    'disclosure_kind',
    'sponsor_name',
    'made_for_kids',
    'moderation_state',
    'takedown_case_id',
    'taken_down_at',
    'legacy_transition_eligible',
    'legacy_transition_expires_at',
].join(',');

const LIBRARY_SELECT = [
    'id',
    'youtube_video_id',
    'source_id',
    'source_name',
    'type',
    'availability_status',
    'embeddable',
    'availability_checked_at',
    'attribution_name',
    'attribution_url',
    'disclosure_kind',
    'sponsor_name',
    'made_for_kids',
    'moderation_state',
    'takedown_case_id',
    'taken_down_at',
].join(',');

let serviceClient = null;
const EMPTY_PROFILE_MAP = new Map();

export class ReelsFeedInputError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ReelsFeedInputError';
    }
}

function getServiceClient() {
    if (serviceClient) return serviceClient;
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Reels feed service-role configuration is unavailable');
    }
    serviceClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return serviceClient;
}

function clampLimit(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

function clampCollectionLimit(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_COLLECTION_LIMIT;
    return Math.min(MAX_COLLECTION_LIMIT, Math.max(1, parsed));
}

function normaliseSort(value) {
    const sort = String(value || 'recent').trim().toLowerCase();
    if (sort === 'popular' || sort === 'trending') return 'popular';
    if (sort === 'recent' || sort === 'latest' || sort === 'random') return 'recent';
    throw new ReelsFeedInputError('Invalid Reels sort');
}

function normaliseScope(value) {
    const scope = String(value || 'all').trim().toLowerCase();
    if (scope === 'all' || scope === 'library' || scope === 'following') return scope;
    throw new ReelsFeedInputError('Invalid Reels scope');
}

function normaliseCategory(value, scope = 'all') {
    const fallback = scope === 'following' ? 'following' : 'poker';
    const category = String(value || fallback).trim().toLowerCase();
    if (!REEL_CATEGORIES.has(category)) {
        throw new ReelsFeedInputError('Invalid Reels category');
    }
    if (scope === 'following' && category !== 'following') {
        throw new ReelsFeedInputError('Following scope requires the Following category');
    }
    if (scope !== 'following' && category === 'following') {
        throw new ReelsFeedInputError('Following category requires authentication');
    }
    return category;
}

function topicsForCategory(category) {
    return REEL_CATEGORY_TOPICS[category] || REEL_CATEGORY_TOPICS.poker;
}

function candidateTopicsForCategory(category, includeUnknownNativeUploads = false) {
    const topics = topicsForCategory(category);
    return includeUnknownNativeUploads && !topics.includes('unknown')
        ? [...topics, 'unknown']
        : topics;
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function isPublicAudiencePost(post) {
    if (!post || post.is_deleted !== false || post.visibility === 'private') return false;
    const effectiveAudience = post.audience_mode
        || (post.visibility !== 'public' ? post.visibility : null)
        || 'public';
    return effectiveAudience === 'public';
}

function chunks(values, size = IN_FILTER_CHUNK_SIZE) {
    const result = [];
    for (let index = 0; index < values.length; index += size) {
        result.push(values.slice(index, index + size));
    }
    return result;
}

function getYouTubeVideoId(value) {
    if (!value || typeof value !== 'string') return null;
    try {
        const parsed = new URL(value, 'https://smarter.poker');
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null;
        const host = parsed.hostname.toLowerCase();
        let candidate = null;
        if (host === 'youtu.be') candidate = parsed.pathname.split('/').filter(Boolean)[0];
        if (YOUTUBE_HOSTS.has(host)) {
            if (parsed.pathname === '/watch') candidate = parsed.searchParams.get('v');
            else if (/^\/(shorts|embed|live)\//.test(parsed.pathname)) {
                candidate = parsed.pathname.split('/').filter(Boolean)[1];
            }
        } else if (YOUTUBE_NOCOOKIE_HOSTS.has(host) && /^\/embed\//.test(parsed.pathname)) {
            candidate = parsed.pathname.split('/').filter(Boolean)[1];
        }
        return YOUTUBE_ID_RE.test(candidate || '') ? candidate : null;
    } catch (_) {
        return null;
    }
}

function rowYouTubeId(row) {
    const stored = String(row?.youtube_video_id || '').trim();
    const storedId = YOUTUBE_ID_RE.test(stored) ? stored : null;
    const originalId = getYouTubeVideoId(row?.original_youtube_url);
    const playableId = getYouTubeVideoId(row?.video_url);
    const identities = unique([storedId, originalId, playableId]);
    return identities.length <= 1 ? identities[0] || null : null;
}

function safeHttpUrl(value) {
    if (!value || typeof value !== 'string') return null;
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
        return parsed.toString();
    } catch (_) {
        return null;
    }
}

function boundedSourceName(value) {
    if (typeof value !== 'string') return null;
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact && compact.length <= 160 ? compact : null;
}

function isTrustedNativeUrl(value, authorId) {
    const author = String(authorId || '').trim();
    if (!UUID_RE.test(author)) return false;
    const safe = safeHttpUrl(value);
    if (!safe) return false;
    try {
        const parsed = new URL(safe);
        if (!(parsed.protocol === 'https:'
            && SUPABASE_STORAGE_ORIGIN
            && parsed.origin.toLowerCase() === SUPABASE_STORAGE_ORIGIN
            && !parsed.username
            && !parsed.password
            && !parsed.port
            && !parsed.search
            && !parsed.hash
            && parsed.pathname.startsWith('/storage/v1/object/public/'))) return false;
        const objectRef = decodeURIComponent(
            parsed.pathname.slice('/storage/v1/object/public/'.length)
        );
        const escapedAuthor = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(
            `^(?:social-media/(?:reels|videos)|stories/stories|live-recordings)/${escapedAuthor}/[^/]+$`
        ).test(objectRef);
    } catch (_) {
        return false;
    }
}

function nativeVerificationKey(value, authorId) {
    const safe = safeHttpUrl(value);
    const author = String(authorId || '').trim().toLowerCase();
    if (!safe || !UUID_RE.test(author)) return null;
    return `${author}\n${safe}`;
}

function normalisedUrlKey(value) {
    const safe = safeHttpUrl(value);
    if (!safe) return null;
    const parsed = new URL(safe);
    parsed.hash = '';
    for (const parameter of [...parsed.searchParams.keys()]) {
        if (/^(utm_|fbclid$|gclid$)/i.test(parameter)) parsed.searchParams.delete(parameter);
    }
    return `url:${parsed.toString()}`;
}

function canonicalKeyForRow(row) {
    const youtubeId = rowYouTubeId(row);
    if (youtubeId) return `youtube:${youtubeId}`;
    const stored = String(row?.canonical_asset_key || '').trim();
    if (stored && stored.length <= 512) return stored;
    return normalisedUrlKey(row?.video_url);
}

function isManagedLibraryRow(row) {
    return row?.origin_type === 'video_library'
        || row?.source_type === 'video_library'
        || Boolean(row?.source_asset_id)
        || String(row?.publication_key || '').startsWith('video-library:');
}

function inferOrigin(row, managedLibrary) {
    if (ALLOWED_ORIGIN_TYPES.has(row?.origin_type)) return row.origin_type;
    if (managedLibrary) return 'video_library';
    if (row?.source_story_id) return 'story';
    if (row?.source_post_id) return 'social_post';
    if (row?.source_type === 'horse') return 'horse';
    return 'legacy';
}

function inferPlayback(row, youtubeId) {
    if (ALLOWED_PLAYBACK_TYPES.has(row?.playback_type)) return row.playback_type;
    if (row?.playback_type) return null;
    return youtubeId ? 'youtube_embed' : 'native';
}

function inferRights(row, youtubeId, originType) {
    if (ALLOWED_RIGHTS_STATUSES.has(row?.rights_status)) return row.rights_status;
    if (youtubeId) return 'embed_only';
    return 'unknown';
}

function parseCursor(value, sort) {
    if (!value) return null;
    if (typeof value !== 'string' || value.length > MAX_CURSOR_LENGTH) {
        throw new ReelsFeedInputError('Invalid Reels cursor');
    }
    try {
        const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
        if (parsed?.v === 1 && parsed.sort === sort && parsed.start === true) {
            return { start: true };
        }
        if (
            parsed?.v !== 1
            || parsed.sort !== sort
            || !UUID_RE.test(String(parsed.id || ''))
            || !CURSOR_TIMESTAMP_RE.test(String(parsed.created_at || ''))
            || Number.isNaN(Date.parse(parsed.created_at))
        ) {
            throw new Error('invalid');
        }
        if (sort === 'popular' && !Number.isFinite(parsed.view_count)) throw new Error('invalid');
        return {
            id: String(parsed.id),
            created_at: String(parsed.created_at),
            view_count: Math.max(0, Number(parsed.view_count || 0)),
        };
    } catch (_) {
        throw new ReelsFeedInputError('Invalid Reels cursor');
    }
}

function cursorForRow(row, sort) {
    return {
        id: String(row.id),
        created_at: String(row.created_at),
        view_count: Math.max(0, Number(row.view_count || 0)),
        sort,
    };
}

function encodeCursor(position) {
    if (!position) return null;
    return Buffer.from(JSON.stringify({ v: 1, ...position }), 'utf8').toString('base64url');
}

function parseCollectionCursor(value, collection) {
    if (!value) return null;
    if (typeof value !== 'string' || value.length > MAX_CURSOR_LENGTH) {
        throw new ReelsFeedInputError('Invalid collection cursor');
    }
    try {
        const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
        if (
            parsed?.v !== 1
            || parsed.collection !== collection
            || !UUID_RE.test(String(parsed.id || ''))
            || !COLLECTION_CURSOR_TIMESTAMP_RE.test(String(parsed.at || ''))
            || Number.isNaN(Date.parse(parsed.at))
        ) {
            throw new Error('invalid');
        }
        return { id: String(parsed.id), at: String(parsed.at) };
    } catch (_) {
        throw new ReelsFeedInputError('Invalid collection cursor');
    }
}

function collectionCursorForRow(row, collection, timestampColumn) {
    return {
        collection,
        id: String(row.id),
        at: String(row[timestampColumn]),
    };
}

function applyCollectionCursorFilter(query, cursor, timestampColumn) {
    if (!cursor) return query;
    return query.or(
        `${timestampColumn}.lt.${cursor.at},and(${timestampColumn}.eq.${cursor.at},id.lt.${cursor.id})`
    );
}

function applyPublicReadyFilters(
    query,
    category = 'poker',
    includeUnknownNativeUploads = false,
) {
    return query
        .eq('is_public', true)
        .eq('is_deleted', false)
        .eq('media_status', 'ready')
        .not('created_at', 'is', null)
        .in('topic', candidateTopicsForCategory(category, includeUnknownNativeUploads));
}

function applyScopeFilter(query, scope) {
    if (scope !== 'library') return query;
    return query.or(
        'origin_type.eq.video_library,source_type.eq.video_library,source_asset_id.not.is.null,publication_key.like.video-library:*'
    );
}

function applyCursorFilter(query, cursor, sort) {
    if (!cursor || cursor.start === true) return query;
    if (sort === 'popular') {
        return query.or(
            `view_count.lt.${cursor.view_count},and(view_count.eq.${cursor.view_count},created_at.lt.${cursor.created_at}),and(view_count.eq.${cursor.view_count},created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
        );
    }
    return query.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
    );
}

async function readCandidateChunk(client, {
    cursor,
    sort,
    scope,
    category,
    limit,
    allowUnknownNativeUpload = false,
}) {
    let query = client.from('social_reels').select(REEL_SELECT);
    query = applyPublicReadyFilters(query, category, allowUnknownNativeUpload);
    query = applyScopeFilter(query, scope);
    query = applyCursorFilter(query, cursor, sort);
    if (sort === 'popular') {
        query = query
            .order('view_count', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .order('id', { ascending: false });
    } else {
        query = query
            .order('created_at', { ascending: false })
            .order('id', { ascending: false });
    }
    const { data, error } = await query.limit(limit);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
}

async function readAllByValues(client, {
    table,
    select,
    column,
    values,
    filter,
    maxRows = MAX_RELATED_SCAN_ROWS,
}) {
    const rows = [];
    for (const valueChunk of chunks(unique(values))) {
        if (rows.length >= maxRows) break;
        let offset = 0;
        while (rows.length < maxRows) {
            const pageSize = Math.min(IN_FILTER_PAGE_SIZE, maxRows - rows.length);
            let query = client.from(table).select(select).in(column, valueChunk);
            if (filter) query = filter(query);
            const { data, error } = await query.range(offset, offset + pageSize - 1);
            if (error) throw error;
            const page = Array.isArray(data) ? data : [];
            rows.push(...page);
            if (page.length < pageSize) break;
            offset += pageSize;
        }
    }
    return rows;
}

async function readAllFollowedAuthorIds(client, viewerId) {
    if (!UUID_RE.test(String(viewerId || ''))) {
        throw new ReelsFeedInputError('Authentication required for the Following feed');
    }
    const followedAuthorIds = new Set();
    let lastSeen = null;
    while (true) {
        let query = client
            .from('social_follows')
            .select('following_id')
            .eq('follower_id', viewerId)
            .order('following_id', { ascending: true });
        if (lastSeen) query = query.gt('following_id', lastSeen);
        const { data, error } = await query.limit(FOLLOWING_PAGE_SIZE);
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error('Invalid Following membership response');
        let pageLastSeen = lastSeen;
        for (const row of data) {
            const followingId = String(row?.following_id || '').toLowerCase();
            if (!PERSISTED_UUID_RE.test(followingId) || (pageLastSeen && followingId <= pageLastSeen)) {
                throw new Error('Invalid Following membership row');
            }
            followedAuthorIds.add(followingId);
            pageLastSeen = followingId;
        }
        if (data.length < FOLLOWING_PAGE_SIZE) return followedAuthorIds;
        if (!pageLastSeen || pageLastSeen === lastSeen) {
            throw new Error('Following membership pagination did not advance');
        }
        lastSeen = pageLastSeen;
    }
}

function isFollowedAuthor(followedAuthorIds, authorId) {
    return followedAuthorIds?.has(String(authorId || '').toLowerCase()) === true;
}

async function loadEligibilityContext(client, rows) {
    const sourceAssetIds = unique(rows.map(row => row?.source_asset_id).filter(id => UUID_RE.test(id)));
    const youtubeIds = unique(rows.map(rowYouTubeId));
    const sourcePostIds = unique(rows.map(row => row?.source_post_id).filter(id => UUID_RE.test(id)));
    const nativeCandidatesByKey = new Map();
    for (const row of rows) {
        const key = nativeVerificationKey(row?.video_url, row?.author_id);
        if (!key || !isTrustedNativeUrl(row?.video_url, row?.author_id)) continue;
        nativeCandidatesByKey.set(key, {
            playback_url: safeHttpUrl(row.video_url),
            author_id: String(row.author_id).toLowerCase(),
        });
    }
    const nativeCandidateChunks = chunks([...nativeCandidatesByKey.values()]);
    const nativeObjectProof = nativeCandidateChunks.length
        ? Promise.all(nativeCandidateChunks.map(async candidates => {
            const { data, error } = await client.rpc(
                'fn_filter_valid_user_video_storage_urls',
                { p_candidates: candidates }
            );
            if (error) throw error;
            return Array.isArray(data) ? data : [];
        }))
        : Promise.resolve([]);

    const [assetsByIdRows, assetsByYoutubeRows, failureRows, postRows, nativeProofPages] = await Promise.all([
        sourceAssetIds.length
            ? readAllByValues(client, {
                table: 'video_library_videos',
                select: LIBRARY_SELECT,
                column: 'id',
                values: sourceAssetIds,
            })
            : [],
        youtubeIds.length
            ? readAllByValues(client, {
                table: 'video_library_videos',
                select: LIBRARY_SELECT,
                column: 'youtube_video_id',
                values: youtubeIds,
            })
            : [],
        youtubeIds.length
            ? readAllByValues(client, {
                table: 'youtube_embed_failures',
                select: 'video_id,resolved,verification_status,last_verified_at',
                column: 'video_id',
                values: youtubeIds,
            })
            : [],
        sourcePostIds.length
            ? readAllByValues(client, {
                table: 'social_posts',
                select: [
                    'id',
                    'author_id',
                    'content_type',
                    'media_urls',
                    'visibility',
                    'audience_mode',
                    'audience_list',
                    'is_flagged',
                    'is_deleted',
                    // Never metadata or origin_type: a Reel is judged and
                    // named by what it is, not by who published it.
                    'playback_type',
                    'topic',
                    'rights_status',
                    'source_asset_id',
                    'youtube_video_id',
                    'canonical_asset_key',
                    'publication_key',
                ].join(','),
                column: 'id',
                values: sourcePostIds,
            })
            : [],
        nativeObjectProof,
    ]);

    const assets = [...assetsByIdRows, ...assetsByYoutubeRows];
    const assetById = new Map(assets.filter(row => row?.id).map(row => [row.id, row]));
    const assetByYoutube = new Map(
        assets.filter(row => row?.youtube_video_id).map(row => [row.youtube_video_id, row])
    );
    const failedYoutubeIds = new Set(failureRows.map(row => row.video_id));
    const verificationByYoutube = new Map(
        failureRows.filter(row => row?.video_id).map(row => [row.video_id, row])
    );
    for (const [videoId, verdict] of verificationByYoutube) {
        if (!(verdict.verification_status === 'confirmed' && verdict.resolved === false)) {
            failedYoutubeIds.delete(videoId);
        }
    }
    const livePostIds = new Set(
        postRows
            .filter(isPublicAudiencePost)
            .map(row => row.id)
    );
    const postById = new Map(postRows.filter(row => row?.id).map(row => [row.id, row]));
    const verifiedNativeObjects = new Set(
        nativeProofPages
            .flat()
            .map(row => nativeVerificationKey(row?.playback_url, row?.author_id))
            .filter(Boolean)
    );
    return {
        assetById,
        assetByYoutube,
        verificationByYoutube,
        failedYoutubeIds,
        livePostIds,
        postById,
        verifiedNativeObjects,
    };
}

function isFreshTimestamp(value, nowMs = Date.now()) {
    const checkedAt = Date.parse(value || '');
    return Number.isFinite(checkedAt)
        && nowMs - checkedAt <= LIBRARY_VERIFICATION_MAX_AGE_MS
        && checkedAt <= nowMs + MAX_FUTURE_SKEW_MS;
}

function hasFreshPositiveYouTubeProof(youtubeId, asset, context, nowMs = Date.now()) {
    if (!youtubeId || context.failedYoutubeIds.has(youtubeId)) return false;
    const assetVerified = asset?.youtube_video_id === youtubeId
        && asset?.availability_status === 'verified'
        && asset?.embeddable === true
        && isFreshTimestamp(asset?.availability_checked_at, nowMs);
    const verdict = context.verificationByYoutube.get(youtubeId);
    const verifierResolved = verdict?.verification_status === 'resolved'
        && verdict?.resolved === true
        && isFreshTimestamp(verdict?.last_verified_at, nowMs);
    return assetVerified || verifierResolved;
}

function hasActiveLegacyTransition(row, nowMs = Date.now()) {
    if (row?.legacy_transition_eligible !== true) return false;
    const expiresAt = Date.parse(row?.legacy_transition_expires_at || '');
    return Number.isFinite(expiresAt)
        && expiresAt > nowMs
        && expiresAt - nowMs <= LEGACY_TRANSITION_MAX_REMAINING_MS + MAX_FUTURE_SKEW_MS;
}

function isUnknownNativeUploadShape(row, explicitTopic, youtubeId) {
    return explicitTopic === 'unknown'
        && row?.origin_type === 'social_post'
        && row?.source_type === 'native'
        && row?.playback_type === 'native'
        && row?.rights_status === 'user_authorized'
        && row?.native_processing_requested === false
        && !row?.source_asset_id
        && !row?.publication_key
        && !row?.source_story_id
        && !youtubeId
        && UUID_RE.test(String(row?.source_post_id || ''))
        && String(row?.canonical_asset_key || '').startsWith('native:');
}

function sourcePostOwnsUnknownNativeUpload(row, sourcePost, videoUrl) {
    if (
        !isPublicAudiencePost(sourcePost)
        || sourcePost.is_flagged === true
        || sourcePost.author_id !== row.author_id
        || sourcePost.content_type !== 'video'
        || sourcePost.playback_type !== 'native'
        || sourcePost.rights_status !== 'user_authorized'
        || sourcePost.topic !== 'unknown'
        || sourcePost.source_asset_id != null
        || sourcePost.youtube_video_id != null
        || sourcePost.publication_key != null
        || sourcePost.canonical_asset_key !== row.canonical_asset_key
        || !Array.isArray(sourcePost.media_urls)
    ) return false;
    const expectedUrl = safeHttpUrl(videoUrl);
    return Boolean(expectedUrl) && sourcePost.media_urls.some(url => safeHttpUrl(url) === expectedUrl);
}

function normalizeEligibleRow(row, context, scope, options = {}) {
    if (!row || row.is_deleted === true || row.media_status !== 'ready'
        || row.moderation_state === 'taken_down' || row.taken_down_at) return null;
    const ownerId = String(options.ownerId || '').trim();
    const isOwnerPrivate = options.allowOwnerPrivate === true
        && UUID_RE.test(ownerId)
        && row.author_id === ownerId;
    if (row.is_public !== true && !isOwnerPrivate) return null;
    let effectiveIsPublic = row.is_public === true;

    const explicitTopic = String(row.topic || '').trim().toLowerCase();
    const category = options.category || 'poker';
    const youtubeId = rowYouTubeId(row);
    const unknownNativeUpload = options.allowUnknownNativeUpload === true
        && isUnknownNativeUploadShape(row, explicitTopic, youtubeId);
    if (!topicsForCategory(category).includes(explicitTopic) && !unknownNativeUpload) return null;
    const explicitRights = String(row.rights_status || '').trim().toLowerCase();
    if (explicitRights === 'blocked' || explicitRights === 'restricted') return null;
    const declaredPlayback = inferPlayback(row, youtubeId);
    if (!declaredPlayback) return null;
    const asset = context.assetById.get(row.source_asset_id)
        || (youtubeId ? context.assetByYoutube.get(youtubeId) : null);
    const legacyTransitionEligible = youtubeId
        && !context.failedYoutubeIds.has(youtubeId)
        && hasActiveLegacyTransition(row);
    if (
        youtubeId
        && (
            BLOCKED_YOUTUBE_IDS.has(youtubeId)
            || context.failedYoutubeIds.has(youtubeId)
            || (!hasFreshPositiveYouTubeProof(youtubeId, asset, context) && !legacyTransitionEligible)
        )
    ) return null;
    if (asset?.type && !ALLOWED_LIBRARY_TYPES.has(String(asset.type).toLowerCase())) return null;

    const managedLibrary = isManagedLibraryRow(row);
    if (managedLibrary && (!asset || !ALLOWED_LIBRARY_TYPES.has(String(asset.type || '').toLowerCase()))) {
        return null;
    }
    if (managedLibrary) {
        if (asset.moderation_state === 'taken_down' || asset.taken_down_at) return null;
        const expectedCanonicalKey = asset?.youtube_video_id
            ? `youtube:${asset.youtube_video_id}`
            : null;
        const expectedPublicationKey = asset?.id ? `video-library:${asset.id}` : null;
        if (
            !row.source_asset_id
            || row.source_asset_id !== asset?.id
            || !youtubeId
            || youtubeId !== asset?.youtube_video_id
            || row.canonical_asset_key !== expectedCanonicalKey
            || row.publication_key !== expectedPublicationKey
        ) {
            return null;
        }
        if (
            !legacyTransitionEligible
            && (
                asset?.availability_status !== 'verified'
                || asset?.embeddable !== true
                || !isFreshTimestamp(asset?.availability_checked_at)
            )
        ) {
            return null;
        }
    } else if (
        declaredPlayback === 'youtube_embed'
        && (
        asset?.embeddable === false
        || UNPLAYABLE_AVAILABILITY.has(String(asset?.availability_status || '').toLowerCase())
        )
    ) {
        return null;
    }
    if (scope === 'library' && !managedLibrary) return null;
    if (row.source_post_id) {
        const sourcePost = context.postById.get(row.source_post_id);
        const publicSourceIsLive = isPublicAudiencePost(sourcePost);
        const ownerSourceIsLive = isOwnerPrivate
            && sourcePost?.is_deleted === false
            && sourcePost.author_id === ownerId;
        if (!publicSourceIsLive && !ownerSourceIsLive) return null;
        if (!publicSourceIsLive) effectiveIsPublic = false;
        if (unknownNativeUpload && !sourcePostOwnsUnknownNativeUpload(
            row,
            sourcePost,
            row.video_url,
        )) return null;
    }

    const originType = inferOrigin(row, managedLibrary);
    const rightsStatus = inferRights(row, youtubeId, originType);
    if (rightsStatus === 'restricted') return null;

    let playbackType = declaredPlayback;
    let videoUrl = safeHttpUrl(row.video_url);
    if (managedLibrary && rightsStatus === 'embed_only' && youtubeId) {
        playbackType = 'youtube_embed';
        videoUrl = safeHttpUrl(row.original_youtube_url)
            || `https://www.youtube.com/watch?v=${youtubeId}`;
    } else if (playbackType === 'youtube_embed') {
        if (!youtubeId) return null;
        // The identity, not a caller-controlled companion URL, owns playback.
        // This prevents a row with a forged youtube_video_id from making the
        // feed return and render arbitrary external media.
        const playableYouTubeId = getYouTubeVideoId(row.video_url);
        const originalYouTubeId = getYouTubeVideoId(row.original_youtube_url);
        if (playableYouTubeId !== youtubeId && originalYouTubeId !== youtubeId) return null;
        videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    }
    if (!videoUrl) return null;
    if (!ALLOWED_PLAYBACK_TYPES.has(playbackType)) return null;
    if (playbackType === 'youtube_embed') {
        if (!youtubeId || !['embed_only', 'owned', 'licensed'].includes(rightsStatus)) return null;
    } else {
        const nativeKey = nativeVerificationKey(videoUrl, row.author_id);
        if (
            !NATIVE_RIGHTS_STATUSES.has(rightsStatus)
            || !isTrustedNativeUrl(videoUrl, row.author_id)
            || !nativeKey
            || !context.verifiedNativeObjects?.has(nativeKey)
        ) {
            return null;
        }
        // A rights-cleared transcode retains its YouTube source identity for
        // canonical deduplication. User-authorized uploads may not borrow one.
        if (youtubeId && !['owned', 'licensed'].includes(rightsStatus)) return null;
        if (!youtubeId && !String(row.canonical_asset_key || '').startsWith('native:')) return null;
    }

    const canonicalAssetKey = canonicalKeyForRow({ ...row, video_url: videoUrl });
    if (!canonicalAssetKey) return null;
    const topic = explicitTopic;
    // The source is a property of the video (its own attribution or the shared
    // library's record of it), never of the linked post's metadata: only the
    // publishing pipeline writes a clip_source there, so a name read from it
    // would appear on a horse's Reel and on no player's.
    const sourceName = boundedSourceName(row.attribution_name)
        || boundedSourceName(asset?.attribution_name)
        || boundedSourceName(asset?.source_name)
        || boundedSourceName(asset?.source_id);
    const sourceAttributionUrl = safeHttpUrl(row.attribution_url)
        || safeHttpUrl(asset?.attribution_url)
        || (youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : null);
    // The immutable, time-bounded legacy transition predates persisted creator
    // attribution. Preserve that already-installed bridge while fresh catalog
    // proof is established; every non-transition managed row fails closed.
    if (managedLibrary && youtubeId && !legacyTransitionEligible && (!sourceName || !sourceAttributionUrl)) return null;

    return {
        id: row.id,
        author_id: row.author_id,
        caption: row.caption || '',
        video_url: videoUrl,
        playback_url: videoUrl,
        thumbnail_url: row.thumbnail_url || (youtubeId
            ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
            : null),
        view_count: Math.max(0, Number(row.view_count || 0)),
        like_count: Math.max(0, Number(row.like_count || 0)),
        comment_count: Math.max(0, Number(row.comment_count || 0)),
        share_count: Math.max(0, Number(row.share_count || 0)),
        created_at: row.created_at,
        updated_at: row.updated_at || null,
        is_public: effectiveIsPublic,
        source_type: row.source_type || (youtubeId ? 'youtube' : 'native'),
        source_post_id: row.source_post_id || null,
        source_story_id: row.source_story_id || null,
        youtube_video_id: youtubeId,
        media_status: 'ready',
        original_youtube_url: youtubeId
            ? `https://www.youtube.com/watch?v=${youtubeId}`
            : null,
        source_id: boundedSourceName(asset?.source_id),
        source_name: sourceName,
        source_url: sourceAttributionUrl,
        source_attribution_url: sourceAttributionUrl,
        disclosure_kind: row.disclosure_kind || asset?.disclosure_kind || 'organic',
        sponsor_name: boundedSourceName(row.sponsor_name || asset?.sponsor_name),
        made_for_kids: row.made_for_kids ?? asset?.made_for_kids ?? null,
        moderation_state: row.moderation_state || asset?.moderation_state || 'active',
        takedown_case_id: row.takedown_case_id || asset?.takedown_case_id || null,
        taken_down_at: row.taken_down_at || asset?.taken_down_at || null,
        playback_type: playbackType,
        topic,
        rights_status: rightsStatus,
        source_asset_id: row.source_asset_id || (managedLibrary ? asset?.id || null : null),
        canonical_asset_key: canonicalAssetKey,
        publication_key: row.publication_key || null,
        native_processing_requested: row.native_processing_requested === true,
        availability_status: asset?.availability_status || null,
        embeddable: asset?.embeddable ?? null,
        availability_checked_at: asset?.availability_checked_at || null,
        verification_status: context.verificationByYoutube.get(youtubeId)?.verification_status || null,
        last_verified_at: context.verificationByYoutube.get(youtubeId)?.last_verified_at || null,
        legacy_transition_eligible: legacyTransitionEligible === true,
        legacy_transition_expires_at: legacyTransitionEligible
            ? new Date(row.legacy_transition_expires_at).toISOString()
            : null,
        title: row.caption?.split('\n')[0]?.replace(/^\u{1F3AC}\s*/u, '')
            || (topic === 'slots'
                ? 'Casino And Slots Reel'
                : topic === 'sports'
                    ? 'Sports Reel'
                    : topic === 'unknown'
                        ? 'Community Reel'
                        : 'Poker Reel'),
        profiles: null,
        _hasLivePost: Boolean(row.source_post_id && context.livePostIds.has(row.source_post_id)),
        _managedLibrary: managedLibrary,
        _cursor: cursorForRow(row, 'recent'),
        _rawVideoUrl: row.video_url,
    };
}

async function eligibleRows(client, rows, scope, options = {}) {
    if (!rows.length) return [];
    const context = await loadEligibilityContext(client, rows);
    return rows.map(row => normalizeEligibleRow(row, context, scope, options)).filter(Boolean);
}

function canonicalWinner(a, b) {
    if (a._hasLivePost !== b._hasLivePost) return a._hasLivePost ? a : b;
    if (a._managedLibrary !== b._managedLibrary) return a._managedLibrary ? a : b;
    const dateOrder = String(a.created_at || '').localeCompare(String(b.created_at || ''));
    if (dateOrder !== 0) return dateOrder < 0 ? a : b;
    return String(a.id).localeCompare(String(b.id)) <= 0 ? a : b;
}

async function fetchCanonicalGroupRows(client, rows, options = {}) {
    const storedKeys = unique(rows.map(row => row?.canonical_asset_key));
    const youtubeIds = unique(rows.map(rowYouTubeId));
    const exactUrls = unique(rows
        .filter(row => !row?.canonical_asset_key && !rowYouTubeId(row))
        .map(row => row?.video_url));

    const ownerId = String(options.ownerId || '').trim();
    const baseFilter = query => {
        if (!UUID_RE.test(ownerId)) {
            return applyPublicReadyFilters(
                query,
                options.category,
                options.allowUnknownNativeUpload === true,
            );
        }
        return query
            .eq('author_id', ownerId)
            .eq('is_deleted', false)
            .eq('media_status', 'ready')
            .not('created_at', 'is', null)
            .in('topic', candidateTopicsForCategory(
                options.category,
                options.allowUnknownNativeUpload === true,
            ));
    };
    const [byKey, byYoutube, byUrl] = await Promise.all([
        storedKeys.length
            ? readAllByValues(client, {
                table: 'social_reels',
                select: REEL_SELECT,
                column: 'canonical_asset_key',
                values: storedKeys,
                filter: baseFilter,
            })
            : [],
        youtubeIds.length
            ? readAllByValues(client, {
                table: 'social_reels',
                select: REEL_SELECT,
                column: 'youtube_video_id',
                values: youtubeIds,
                filter: baseFilter,
            })
            : [],
        exactUrls.length
            ? readAllByValues(client, {
                table: 'social_reels',
                select: REEL_SELECT,
                column: 'video_url',
                values: exactUrls,
                filter: baseFilter,
            })
            : [],
    ]);

    const allById = new Map();
    for (const row of [...rows, ...byKey, ...byYoutube, ...byUrl]) {
        if (row?.id) allById.set(row.id, row);
    }
    return [...allById.values()];
}

async function canonicalWinners(client, candidateRawRows, scope, options = {}) {
    if (!candidateRawRows.length) return new Map();
    const allRawRows = await fetchCanonicalGroupRows(client, candidateRawRows, options);
    const allEligibleRows = await eligibleRows(client, allRawRows, scope, options);
    const winnerByKey = new Map();
    for (const row of allEligibleRows) {
        const current = winnerByKey.get(row.canonical_asset_key);
        winnerByKey.set(row.canonical_asset_key, current ? canonicalWinner(current, row) : row);
    }
    return winnerByKey;
}

async function canonicalOwnerWinners(client, candidateRawRows, ownerId) {
    if (!candidateRawRows.length) return new Map();
    const allRawRows = await fetchCanonicalGroupRows(client, candidateRawRows, {
        ownerId,
        category: COLLECTION_CATEGORY,
        allowUnknownNativeUpload: true,
    });
    const allEligibleRows = await eligibleRows(client, allRawRows, 'all', {
        allowOwnerPrivate: true,
        allowUnknownNativeUpload: true,
        ownerId,
        category: COLLECTION_CATEGORY,
    });
    const winnerByKey = new Map();
    for (const row of allEligibleRows) {
        const current = winnerByKey.get(row.canonical_asset_key);
        winnerByKey.set(
            row.canonical_asset_key,
            current ? canonicalWinner(current, row) : row
        );
    }
    return winnerByKey;
}

function publicRow(row, profileMap) {
    const profile = profileMap.get(row.author_id) || null;
    const channelName = row.source_name
        || (row.playback_type === 'youtube_embed' ? 'Original YouTube Source' : null)
        || profile?.full_name
        || profile?.username
        || 'Creator Unavailable';
    const {
        _hasLivePost,
        _managedLibrary,
        _cursor,
        _rawVideoUrl,
        ...safe
    } = row;
    return toBrowserReel({
        ...safe,
        channel_name: channelName,
        profiles: profile ? {
            id: profile.id,
            username: profile.username || null,
            full_name: profile.full_name || null,
            avatar_url: profile.avatar_url || null,
        } : null,
    });
}

async function attachProfiles(client, rows) {
    const authorIds = unique(rows
        .map(row => row.author_id)
        .filter(id => PERSISTED_UUID_RE.test(String(id || ''))));
    const profiles = authorIds.length
        ? await readAllByValues(client, {
            table: 'profiles',
            select: 'id,username,full_name,avatar_url',
            column: 'id',
            values: authorIds,
        })
        : [];
    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    return rows.map(row => publicRow(row, profileMap));
}

async function readPage(client, { limit, cursor, sort, scope, category, followedAuthorIds = null }) {
    const selected = [];
    const selectedKeys = new Set();
    let scanCursor = cursor;
    let lastScannedCursor = cursor;
    let scanned = 0;
    let exhausted = false;

    if (scope === 'following' && !followedAuthorIds?.size) {
        return { rows: [], hasMore: false, nextCursor: null, partial: false };
    }

    while (selected.length < limit + 1 && scanned < MAX_SCAN_ROWS) {
        const remainingBudget = MAX_SCAN_ROWS - scanned;
        const chunkSize = Math.min(SCAN_CHUNK_SIZE, remainingBudget);
        const allowUnknownNativeUpload = category === 'for-you';
        const rawRows = await readCandidateChunk(client, {
            cursor: scanCursor,
            sort,
            scope,
            category,
            limit: chunkSize,
            allowUnknownNativeUpload,
        });
        if (!rawRows.length) {
            exhausted = true;
            break;
        }
        scanned += rawRows.length;
        const lastRawRow = rawRows[rawRows.length - 1];
        lastScannedCursor = cursorForRow(lastRawRow, sort);
        scanCursor = lastScannedCursor;

        // Following can be sparse across the global chronology. Resolve the
        // bounded candidate membership first so an account following only a
        // few authors does not hydrate availability, rights, posts, native
        // objects, and canonical groups for thousands of unrelated Reels.
        // Keep the keyset scan itself global and uncapped so continuation and
        // completeness do not depend on an arbitrary following-list limit.
        const scopedRawRows = followedAuthorIds
            ? rawRows.filter(row => isFollowedAuthor(followedAuthorIds, row.author_id))
            : rawRows;
        const eligibilityOptions = { category, allowUnknownNativeUpload };
        const candidateEligible = await eligibleRows(client, scopedRawRows, scope, eligibilityOptions);
        const winnerByKey = await canonicalWinners(client, scopedRawRows, scope, eligibilityOptions);
        for (const row of candidateEligible) {
            const winner = winnerByKey.get(row.canonical_asset_key);
            if (
                winner?.id !== row.id
                || (followedAuthorIds && !isFollowedAuthor(followedAuthorIds, winner.author_id))
                || selectedKeys.has(row.canonical_asset_key)
            ) continue;
            row._cursor = cursorForRow(row, sort);
            selected.push(row);
            selectedKeys.add(row.canonical_asset_key);
            if (selected.length >= limit + 1) break;
        }
        if (rawRows.length < chunkSize) {
            exhausted = true;
            break;
        }
    }

    const hasBufferedRow = selected.length > limit;
    const pageRows = selected.slice(0, limit);
    const scanBudgetReached = scanned >= MAX_SCAN_ROWS && !exhausted && !hasBufferedRow;
    const hasMore = hasBufferedRow || !exhausted;
    const nextPosition = hasMore
        ? (scanBudgetReached ? lastScannedCursor : pageRows[pageRows.length - 1]?._cursor || lastScannedCursor)
        : null;
    return {
        rows: pageRows,
        hasMore,
        nextCursor: encodeCursor(nextPosition),
        partial: scanBudgetReached,
    };
}

async function readDetail(client, id, scope, sort, category, followedAuthorIds = null) {
    if (!id) return { status: 'none', row: null };
    if (!UUID_RE.test(id)) throw new ReelsFeedInputError('Invalid Reel reference');
    if (scope === 'following' && !followedAuthorIds?.size) {
        return { status: 'unavailable', row: null };
    }

    // Phase 2 gives every retired Reel and linked source-post identifier a
    // durable database-owned winner. Resolve before reading eligibility so a
    // hidden tombstone can keep an old bookmark working without ever becoming
    // public again. The winner still passes every ordinary rights, audience,
    // topic, storage and availability gate below.
    const { data: resolutionRows, error: resolutionError } = await client.rpc(
        'resolve_social_reel_reference',
        { p_reference_id: id },
    );
    if (resolutionError) throw resolutionError;
    const resolution = Array.isArray(resolutionRows) ? resolutionRows[0] : resolutionRows;
    const resolvedId = String(resolution?.canonical_reel_id || id).trim();
    if (!UUID_RE.test(resolvedId)) return { status: 'not_found', row: null };

    const { data, error } = await client
        .from('social_reels')
        .select(REEL_SELECT)
        .or(`id.eq.${resolvedId},source_post_id.eq.${resolvedId}`)
        .limit(20);
    if (error) throw error;
    const directRows = Array.isArray(data) ? data : [];
    if (!directRows.length) return { status: 'not_found', row: null };

    // A direct Reel/post bookmark may resolve an otherwise unclassified native
    // user upload. Following remains topic-strict even for direct references.
    const eligibilityOptions = {
        category,
        allowUnknownNativeUpload: scope !== 'following',
    };
    const directEligible = await eligibleRows(client, directRows, scope, eligibilityOptions);
    if (!directEligible.length) return { status: 'unavailable', row: null };
    const winnerByKey = await canonicalWinners(client, directRows, scope, eligibilityOptions);
    const requested = directEligible.find(row => row.id === resolvedId || row.source_post_id === resolvedId)
        || directEligible[0];
    const winner = winnerByKey.get(requested.canonical_asset_key) || requested;
    if (scope === 'following' && !isFollowedAuthor(followedAuthorIds, winner.author_id)) {
        return { status: 'unavailable', row: null };
    }
    winner._cursor = cursorForRow(winner, sort);
    return {
        status: 'found',
        row: winner,
        redirectedFrom: resolvedId === id ? null : id,
    };
}

async function readOwnedCollectionChunk(client, { ownerId, cursor, limit }) {
    let query = client
        .from('social_reels')
        .select(REEL_SELECT)
        .eq('author_id', ownerId)
        .eq('is_deleted', false)
        .not('created_at', 'is', null);
    query = applyCollectionCursorFilter(query, cursor, 'created_at');
    const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
}

async function readPublicProfileCollectionChunk(client, { authorId, cursor, limit }) {
    let query = client
        .from('social_reels')
        .select(REEL_SELECT)
        .eq('author_id', authorId)
        .eq('is_public', true)
        .eq('is_deleted', false)
        .eq('media_status', 'ready')
        .not('created_at', 'is', null);
    query = applyCollectionCursorFilter(query, cursor, 'created_at');
    const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
}

async function readSavedCollectionChunk(client, { userId, cursor, limit }) {
    let query = client
        .from('saved_reels')
        .select('id,user_id,reel_id,saved_at,source_type')
        .eq('user_id', userId)
        .not('saved_at', 'is', null);
    query = applyCollectionCursorFilter(query, cursor, 'saved_at');
    const { data, error } = await query
        .order('saved_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
}

function isValidSavedRow(row, userId) {
    return UUID_RE.test(String(row?.id || ''))
        && UUID_RE.test(String(row?.reel_id || ''))
        && row.user_id === userId
        && COLLECTION_CURSOR_TIMESTAMP_RE.test(String(row?.saved_at || ''))
        && !Number.isNaN(Date.parse(row.saved_at))
        && (row.source_type === 'post' || row.source_type === 'reel' || row.source_type == null);
}

function addTargetKey(targetMap, targetId, canonicalKey) {
    if (!UUID_RE.test(String(targetId || '')) || !canonicalKey) return;
    const keys = targetMap.get(targetId) || new Set();
    keys.add(canonicalKey);
    targetMap.set(targetId, keys);
}

function oneTargetKey(targetMap, targetId) {
    const keys = targetMap.get(targetId);
    return keys?.size === 1 ? [...keys][0] : null;
}

function canonicalKeyForSavedTarget(saved, directTargetKeys, postTargetKeys) {
    const preferred = saved.source_type === 'post' ? postTargetKeys : directTargetKeys;
    const fallback = saved.source_type === 'post' ? directTargetKeys : postTargetKeys;
    const preferredKeys = preferred.get(saved.reel_id);
    if (preferredKeys?.size) return preferredKeys.size === 1 ? [...preferredKeys][0] : null;
    return oneTargetKey(fallback, saved.reel_id);
}

function compareSavedRows(left, right) {
    const dateOrder = String(right.saved_at).localeCompare(String(left.saved_at));
    if (dateOrder !== 0) return dateOrder;
    return String(right.id).localeCompare(String(left.id));
}

async function loadSavedTargetContext(client, savedRows, userId) {
    const targetIds = unique(savedRows.map(row => row.reel_id));
    if (!targetIds.length) return null;

    // Read both shapes for every target. Old clients saved a source-post UUID
    // while newer clients save the canonical Reel UUID, and some historical
    // rows have a stale/default source_type value.
    const [directRows, postBackedRows] = await Promise.all([
        readAllByValues(client, {
            table: 'social_reels',
            select: REEL_SELECT,
            column: 'id',
            values: targetIds,
            maxRows: MAX_RELATED_SCAN_ROWS,
        }),
        readAllByValues(client, {
            table: 'social_reels',
            select: REEL_SELECT,
            column: 'source_post_id',
            values: targetIds,
            maxRows: MAX_RELATED_SCAN_ROWS,
        }),
    ]);
    const candidateById = new Map();
    for (const row of [...directRows, ...postBackedRows]) {
        if (row?.id) candidateById.set(row.id, row);
    }
    const candidateRawRows = [...candidateById.values()];
    if (!candidateRawRows.length) return null;

    const canonicalRawRows = await fetchCanonicalGroupRows(client, candidateRawRows, {
        category: COLLECTION_CATEGORY,
        allowUnknownNativeUpload: true,
    });
    const canonicalEligibleRows = await eligibleRows(client, canonicalRawRows, 'all', {
        category: COLLECTION_CATEGORY,
        allowUnknownNativeUpload: true,
    });
    const winnerByKey = new Map();
    const directTargetKeys = new Map();
    const postTargetKeys = new Map();
    for (const row of canonicalEligibleRows) {
        const current = winnerByKey.get(row.canonical_asset_key);
        winnerByKey.set(
            row.canonical_asset_key,
            current ? canonicalWinner(current, row) : row
        );
        addTargetKey(directTargetKeys, row.id, row.canonical_asset_key);
        addTargetKey(postTargetKeys, row.source_post_id, row.canonical_asset_key);
    }

    const aliasTargetIds = unique([
        ...directTargetKeys.keys(),
        ...postTargetKeys.keys(),
    ]);
    const aliasRows = aliasTargetIds.length
        ? await readAllByValues(client, {
            table: 'saved_reels',
            select: 'id,user_id,reel_id,saved_at,source_type',
            column: 'reel_id',
            values: aliasTargetIds,
            filter: query => query
                .eq('user_id', userId)
                .not('saved_at', 'is', null),
            // saved_reels is unique on (user_id, reel_id), so the number of
            // possible matches cannot exceed the number of requested aliases.
            maxRows: aliasTargetIds.length,
        })
        : [];
    const aliasesByKey = new Map();
    for (const alias of aliasRows.filter(row => isValidSavedRow(row, userId))) {
        const key = canonicalKeyForSavedTarget(alias, directTargetKeys, postTargetKeys);
        if (!key || !winnerByKey.has(key)) continue;
        const aliases = aliasesByKey.get(key) || [];
        aliases.push(alias);
        aliasesByKey.set(key, aliases);
    }

    return { winnerByKey, directTargetKeys, postTargetKeys, aliasesByKey };
}

async function resolveSavedCollectionChunk(client, savedRows, userId) {
    const context = await loadSavedTargetContext(client, savedRows, userId);
    if (!context) return [];
    const {
        winnerByKey,
        directTargetKeys,
        postTargetKeys,
        aliasesByKey,
    } = context;

    const resolved = [];
    const selectedKeys = new Set();
    for (const saved of savedRows) {
        const key = canonicalKeyForSavedTarget(saved, directTargetKeys, postTargetKeys);
        const winner = key ? winnerByKey.get(key) : null;
        const aliases = key ? aliasesByKey.get(key) || [] : [];
        aliases.sort(compareSavedRows);
        const representative = aliases[0];
        if (!winner || representative?.id !== saved.id || selectedKeys.has(key)) continue;
        selectedKeys.add(key);
        resolved.push({
            saved: representative,
            winner,
            savedTargetIds: unique(aliases.map(alias => alias.reel_id)),
        });
    }
    return resolved;
}

async function attachSavedReelItems(client, items) {
    const profiledRows = await attachProfiles(client, items.map(item => item.winner));
    const profileById = new Map(profiledRows.map(row => [row.id, row]));
    return items.map(({ saved, winner, savedTargetIds }) => ({
        id: saved.id,
        user_id: saved.user_id,
        // Always expose the canonical actionable Reel identity. Historical
        // post-backed target(s) stay explicit so clients can delete every
        // alias instead of recreating an apparently missing save.
        reel_id: winner.id,
        saved_target_id: saved.reel_id,
        saved_target_ids: savedTargetIds,
        saved_at: saved.saved_at,
        source_type: 'reel',
        saved_source_type: saved.source_type || 'reel',
        reel: profileById.get(winner.id),
    })).filter(item => item.reel);
}

/**
 * Return bookmark truth for only the canonical Reel IDs currently displayed.
 * Every historical direct-Reel and source-post alias is still discovered, but
 * the request never walks unrelated pages from the user's saved collection.
 */
export async function readSavedPokerReelsForIds(options = {}) {
    const client = options.client || getServiceClient();
    const userId = String(options.userId || '').trim();
    if (!UUID_RE.test(userId)) throw new ReelsFeedInputError('Invalid saved-Reels owner');
    if (!Array.isArray(options.reelIds) || options.reelIds.length > MAX_SAVED_STATUS_IDS) {
        throw new ReelsFeedInputError('Invalid saved-Reels status request');
    }
    const reelIds = unique(options.reelIds.map(value => String(value || '').trim()));
    if (reelIds.some(id => !UUID_RE.test(id))) {
        throw new ReelsFeedInputError('Invalid saved-Reels status request');
    }
    if (!reelIds.length) return [];

    const requestedTargets = reelIds.map(reelId => ({
        reel_id: reelId,
        source_type: 'reel',
    }));
    const context = await loadSavedTargetContext(client, requestedTargets, userId);
    if (!context) return [];
    const {
        winnerByKey,
        directTargetKeys,
        postTargetKeys,
        aliasesByKey,
    } = context;
    const selectedKeys = new Set();
    const selected = [];
    for (const target of requestedTargets) {
        const key = canonicalKeyForSavedTarget(target, directTargetKeys, postTargetKeys);
        const winner = key ? winnerByKey.get(key) : null;
        const aliases = key ? aliasesByKey.get(key) || [] : [];
        aliases.sort(compareSavedRows);
        if (!winner || !aliases.length || selectedKeys.has(key)) continue;
        selectedKeys.add(key);
        selected.push({
            saved: aliases[0],
            winner,
            savedTargetIds: unique(aliases.map(alias => alias.reel_id)),
        });
    }
    return attachSavedReelItems(client, selected);
}

/**
 * Read the authenticated creator's own playable Reels across every supported
 * category. This is the only
 * collection reader that may return a non-public Reel, and then only when the
 * verified caller owns both the Reel and any linked source post.
 */
export async function readOwnedPokerReels(options = {}) {
    const client = options.client || getServiceClient();
    const ownerId = String(options.userId || '').trim();
    if (!UUID_RE.test(ownerId)) throw new ReelsFeedInputError('Invalid Reel owner');
    const limit = clampCollectionLimit(options.limit);
    const cursor = parseCollectionCursor(options.cursor, 'owned');
    const selected = [];
    const selectedKeys = new Set();
    let scanCursor = cursor;
    let lastScannedCursor = cursor;
    let scanned = 0;
    let exhausted = false;

    while (selected.length < limit + 1 && scanned < MAX_OWNED_SCAN_ROWS) {
        const chunkSize = Math.min(
            COLLECTION_SCAN_CHUNK_SIZE,
            MAX_OWNED_SCAN_ROWS - scanned
        );
        const rawRows = await readOwnedCollectionChunk(client, {
            ownerId,
            cursor: scanCursor,
            limit: chunkSize,
        });
        if (!rawRows.length) {
            exhausted = true;
            break;
        }
        scanned += rawRows.length;
        lastScannedCursor = collectionCursorForRow(
            rawRows[rawRows.length - 1],
            'owned',
            'created_at'
        );
        scanCursor = lastScannedCursor;

        const eligible = await eligibleRows(client, rawRows, 'all', {
            allowOwnerPrivate: true,
            allowUnknownNativeUpload: true,
            ownerId,
            category: COLLECTION_CATEGORY,
        });
        const winnerByKey = await canonicalOwnerWinners(client, rawRows, ownerId);
        for (const row of eligible) {
            if (
                winnerByKey.get(row.canonical_asset_key)?.id !== row.id
                || selectedKeys.has(row.canonical_asset_key)
            ) continue;
            selectedKeys.add(row.canonical_asset_key);
            selected.push(row);
            if (selected.length >= limit + 1) break;
        }
        if (rawRows.length < chunkSize) {
            exhausted = true;
            break;
        }
    }

    const hasBufferedRow = selected.length > limit;
    const pageRows = selected.slice(0, limit);
    const scanBudgetReached = scanned >= MAX_OWNED_SCAN_ROWS
        && !exhausted
        && !hasBufferedRow;
    const hasMore = hasBufferedRow || !exhausted;
    const nextPosition = hasMore
        ? (pageRows.length
            ? collectionCursorForRow(pageRows[pageRows.length - 1], 'owned', 'created_at')
            : lastScannedCursor)
        : null;

    return {
        data: await attachProfiles(client, pageRows),
        hasMore,
        nextCursor: encodeCursor(nextPosition),
        partial: scanBudgetReached,
        scanned,
    };
}

/**
 * Read the public Reels shown on a player profile through the same fail-closed
 * eligibility boundary as the main feed. Profiles previously queried
 * social_reels directly, which allowed a stale rights or availability verdict
 * to survive after the canonical feed had removed the Reel.
 */
export async function readPublicProfileReels(options = {}) {
    const client = options.client || getServiceClient();
    const authorId = String(options.authorId || '').trim();
    if (!PERSISTED_UUID_RE.test(authorId)) {
        throw new ReelsFeedInputError('Invalid Reel profile');
    }
    const limit = clampCollectionLimit(options.limit);
    const cursor = parseCollectionCursor(options.cursor, 'profile');
    const selected = [];
    const selectedKeys = new Set();
    let scanCursor = cursor;
    let lastScannedCursor = cursor;
    let scanned = 0;
    let exhausted = false;

    while (selected.length < limit + 1 && scanned < MAX_OWNED_SCAN_ROWS) {
        const chunkSize = Math.min(COLLECTION_SCAN_CHUNK_SIZE, MAX_OWNED_SCAN_ROWS - scanned);
        const rawRows = await readPublicProfileCollectionChunk(client, {
            authorId,
            cursor: scanCursor,
            limit: chunkSize,
        });
        if (!rawRows.length) {
            exhausted = true;
            break;
        }
        scanned += rawRows.length;
        lastScannedCursor = collectionCursorForRow(
            rawRows[rawRows.length - 1],
            'profile',
            'created_at',
        );
        scanCursor = lastScannedCursor;

        const eligible = await eligibleRows(client, rawRows, 'all', {
            allowUnknownNativeUpload: true,
            category: COLLECTION_CATEGORY,
        });
        const winnerByKey = await canonicalWinners(client, rawRows, 'all', {
            allowUnknownNativeUpload: true,
            category: COLLECTION_CATEGORY,
        });
        for (const row of eligible) {
            if (
                winnerByKey.get(row.canonical_asset_key)?.id !== row.id
                || selectedKeys.has(row.canonical_asset_key)
            ) continue;
            selectedKeys.add(row.canonical_asset_key);
            selected.push(row);
            if (selected.length >= limit + 1) break;
        }
        if (rawRows.length < chunkSize) {
            exhausted = true;
            break;
        }
    }

    const hasBufferedRow = selected.length > limit;
    const pageRows = selected.slice(0, limit);
    const scanBudgetReached = scanned >= MAX_OWNED_SCAN_ROWS && !exhausted && !hasBufferedRow;
    const hasMore = hasBufferedRow || !exhausted;
    const nextPosition = hasMore
        ? (pageRows.length
            ? collectionCursorForRow(pageRows[pageRows.length - 1], 'profile', 'created_at')
            : lastScannedCursor)
        : null;

    return {
        data: await attachProfiles(client, pageRows),
        hasMore,
        nextCursor: encodeCursor(nextPosition),
        partial: scanBudgetReached,
        scanned,
    };
}

/**
 * Read a user's saved collection without trusting historical saved targets.
 * Target Reel rows are loaded in bounded batches and passed through the same
 * public eligibility and canonical-winner checks as the public feed.
 */
export async function readSavedPokerReels(options = {}) {
    const client = options.client || getServiceClient();
    const userId = String(options.userId || '').trim();
    if (!UUID_RE.test(userId)) throw new ReelsFeedInputError('Invalid saved-Reels owner');
    const limit = clampCollectionLimit(options.limit);
    const cursor = parseCollectionCursor(options.cursor, 'saved');
    const selected = [];
    const selectedKeys = new Set();
    let scanCursor = cursor;
    let lastScannedCursor = cursor;
    let scanned = 0;
    let exhausted = false;

    while (selected.length < limit + 1 && scanned < MAX_SAVED_SCAN_ROWS) {
        const chunkSize = Math.min(
            COLLECTION_SCAN_CHUNK_SIZE,
            MAX_SAVED_SCAN_ROWS - scanned
        );
        const rawRows = await readSavedCollectionChunk(client, {
            userId,
            cursor: scanCursor,
            limit: chunkSize,
        });
        if (!rawRows.length) {
            exhausted = true;
            break;
        }
        scanned += rawRows.length;
        lastScannedCursor = collectionCursorForRow(
            rawRows[rawRows.length - 1],
            'saved',
            'saved_at'
        );
        scanCursor = lastScannedCursor;

        const validRows = rawRows.filter(row => isValidSavedRow(row, userId));
        const resolved = await resolveSavedCollectionChunk(client, validRows, userId);
        for (const item of resolved) {
            const key = item.winner.canonical_asset_key;
            if (selectedKeys.has(key)) continue;
            selectedKeys.add(key);
            selected.push(item);
            if (selected.length >= limit + 1) break;
        }
        if (rawRows.length < chunkSize) {
            exhausted = true;
            break;
        }
    }

    const hasBufferedRow = selected.length > limit;
    const page = selected.slice(0, limit);
    const scanBudgetReached = scanned >= MAX_SAVED_SCAN_ROWS
        && !exhausted
        && !hasBufferedRow;
    const hasMore = hasBufferedRow || !exhausted;
    const nextPosition = hasMore
        ? (page.length
            ? collectionCursorForRow(page[page.length - 1].saved, 'saved', 'saved_at')
            : lastScannedCursor)
        : null;
    return {
        data: await attachSavedReelItems(client, page),
        hasMore,
        nextCursor: encodeCursor(nextPosition),
        partial: scanBudgetReached,
        scanned,
    };
}

/**
 * Read one canonical, public Reel through the same availability, rights,
 * category, and canonical-winner gates as the public feed. This is the
 * authoritative detail reader for server-side consumers such as sharing.
 */
export async function readPublicReelById(options = {}) {
    const client = options.client || getServiceClient();
    const category = normaliseCategory(options.category || 'for-you', 'all');
    const detail = await readDetail(
        client,
        String(options.id || '').trim(),
        'all',
        'recent',
        category,
    );
    return {
        data: detail.row ? toBrowserReel(detail.row) : null,
        category,
        detailStatus: detail.status,
        redirectedFrom: detail.redirectedFrom || null,
    };
}

/**
 * Read one canonical, public Reel page. When `id` is supplied it may be
 * either a social_reels.id or the linked social_posts.id; the resolved target
 * is moved to index zero without duplicating its canonical asset in the page.
 */
export async function readPokerReelsFeed(options = {}) {
    const client = options.client || getServiceClient();
    const limit = clampLimit(options.limit);
    const sort = normaliseSort(options.sort);
    const scope = normaliseScope(options.scope);
    const category = normaliseCategory(options.category, scope);
    const cursor = parseCursor(options.cursor, sort);
    const id = String(options.id || '').trim();
    const viewerId = String(options.viewerId || '').trim();
    if (scope === 'following' && !UUID_RE.test(viewerId)) {
        throw new ReelsFeedInputError('Authentication required for the Following feed');
    }
    const followedAuthorIds = scope === 'following'
        ? await readAllFollowedAuthorIds(client, viewerId)
        : null;

    const [page, detail] = await Promise.all([
        readPage(client, { limit, cursor, sort, scope, category, followedAuthorIds }),
        // A cursor always denotes continuation. In particular the explicit
        // start sentinel lets a pinned limit=1 response continue from the
        // first natural feed row without pinning the detail again.
        readDetail(client, cursor ? '' : id, scope, sort, category, followedAuthorIds),
    ]);

    if (detail.status === 'not_found' || detail.status === 'unavailable') {
        return {
            data: [],
            detailStatus: detail.status,
            hasMore: false,
            nextCursor: null,
            partial: page.partial,
        };
    }

    let rows = page.rows;
    let nextCursor = page.nextCursor;
    let hasMore = page.hasMore;
    if (detail.row) {
        const inPage = rows.some(row => row.canonical_asset_key === detail.row.canonical_asset_key);
        if (inPage) {
            rows = [
                detail.row,
                ...rows.filter(row => row.canonical_asset_key !== detail.row.canonical_asset_key),
            ];
        } else {
            const pageCapacity = Math.max(0, limit - 1);
            const paginatedRows = rows.slice(0, pageCapacity);
            const displacedRows = rows.length - paginatedRows.length;
            rows = [detail.row, ...paginatedRows];
            if (displacedRows > 0) {
                // The detail row is pinned outside the ordinary sort order.
                // Advance only through rows actually returned from that order;
                // for limit=1 emit an explicit start sentinel so the first
                // natural feed row is still reachable on the next request.
                nextCursor = paginatedRows.length
                    ? encodeCursor(paginatedRows[paginatedRows.length - 1]._cursor)
                    : encodeCursor({ sort, start: true });
                hasMore = true;
            }
        }
    }

    // Server-rendered crawlable listings project every row down to public
    // caption/date/link fields and have no use for profile records. Let those
    // callers skip the otherwise unnecessary person-data lookup; the default
    // remains unchanged for interactive clients that render creator chrome.
    const data = options.includeProfiles === false
        ? rows.map(row => publicRow(row, EMPTY_PROFILE_MAP))
        : await attachProfiles(client, rows);
    return {
        data,
        category,
        detailStatus: detail.status,
        redirectedFrom: detail.redirectedFrom || null,
        hasMore,
        nextCursor,
        partial: page.partial,
    };
}
