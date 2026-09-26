/**
 * GET /api/social/feed
 * ─────────────────────────────────────────────────────────────────
 * Unified server-side feed endpoint — fully enriched posts in ONE
 * server-side round trip using raw HTTP fetch (no Supabase JS client).
 *
 * SECURITY/PERF NOTES:
 *   - Raw fetch avoids Supabase JS client cold-start overhead
 *   - Unsafe managed video rows are consumed server-side before pagination
 *   - Personalized results are private and explicitly non-cacheable
 *
 * Query params:
 *   offset   - pagination offset (default: 0)
 *   limit    - page size (default: 20, max: 50)
 * Viewer identity is resolved only from the Authorization bearer token.
 */

// NOTE: This handler uses Node.js Pages Router API (req.query, res.setHeader, res.status)
// and CANNOT run on Edge Runtime. Keep as Node.js runtime (no export const runtime = 'edge').
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import {
    VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS,
    VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS,
} from '../../../src/lib/videoLibraryAvailability';

const POST_SCAN_SIZE = 100;
const MAX_POST_SCAN_ROWS = 5_000;
const MAX_FEED_OFFSET = 100_000;
// Verification age and future skew come from the one shared freshness contract
// (src/lib/videoLibraryAvailability.js), which mirrors the installed SQL
// predicates. Do not redeclare them here. The legacy-transition window below
// is a separate, unrelated bound.
const VERIFY_MAX_AGE_MS = VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS;
const LEGACY_TRANSITION_MAX_REMAINING_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const POKER_TOPICS = new Set(['poker', 'cash', 'tournament']);
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const YOUTUBE_NOCOOKIE_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com']);
const POST_SELECT = [
    'id', 'content', 'content_type', 'media_urls', 'thumbnail_url',
    'like_count', 'comment_count', 'share_count', 'view_count', 'visibility',
    'audience_mode', 'audience_list',
    'created_at', 'author_id', 'link_url', 'link_title', 'link_description',
    'link_image', 'link_site_name', 'metadata', 'is_deleted', 'origin_type',
    'playback_type', 'topic', 'rights_status', 'source_asset_id',
    'youtube_video_id', 'canonical_asset_key', 'publication_key',
    'legacy_transition_eligible', 'legacy_transition_expires_at',
].join(',');

const getSupaConfig = () => ({
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

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

function extractYouTubeId(value) {
    const raw = String(value || '').trim();
    if (YOUTUBE_ID_RE.test(raw)) return raw;
    try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null;
        const host = parsed.hostname.toLowerCase();
        let candidate = null;
        if (host === 'youtu.be') candidate = parsed.pathname.split('/').filter(Boolean)[0];
        if (YOUTUBE_HOSTS.has(host)) {
            if (parsed.pathname === '/watch') candidate = parsed.searchParams.get('v');
            else if (/^\/(shorts|embed|live)\//.test(parsed.pathname)) {
                candidate = parsed.pathname.split('/').filter(Boolean)[1];
            }
        }
        if (YOUTUBE_NOCOOKIE_HOSTS.has(host)) {
            if (/^\/embed\//.test(parsed.pathname)) {
                candidate = parsed.pathname.split('/').filter(Boolean)[1];
            }
        }
        return YOUTUBE_ID_RE.test(candidate || '') ? candidate : null;
    } catch (_) {
        return null;
    }
}

function isTrustedNativeUrl(value, authorId) {
    if (!UUID_RE.test(String(authorId || ''))) return false;
    try {
        const parsed = new URL(value);
        if (
            parsed.protocol !== 'https:'
            || !SUPABASE_STORAGE_ORIGIN
            || parsed.origin.toLowerCase() !== SUPABASE_STORAGE_ORIGIN
            || parsed.username
            || parsed.password
            || parsed.port
            || parsed.search
            || parsed.hash
            || !parsed.pathname.startsWith('/storage/v1/object/public/')
        ) return false;
        const objectRef = decodeURIComponent(
            parsed.pathname.slice('/storage/v1/object/public/'.length)
        );
        const escapedAuthor = String(authorId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(
            `^(?:social-media/(?:reels|videos)|stories/stories|live-recordings)/${escapedAuthor}/[^/]+$`
        ).test(objectRef);
    } catch (_) {
        return false;
    }
}

function nativeVerificationKey(value, authorId) {
    if (!UUID_RE.test(String(authorId || ''))) return null;
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
        return `${String(authorId).toLowerCase()}\n${parsed.toString()}`;
    } catch (_) {
        return null;
    }
}

function postYouTubeId(post) {
    return extractYouTubeId(post?.youtube_video_id)
        || extractYouTubeId(Array.isArray(post?.media_urls) ? post.media_urls[0] : null)
        || extractYouTubeId(post?.link_url);
}

function postPlaybackYouTubeId(post) {
    return extractYouTubeId(Array.isArray(post?.media_urls) ? post.media_urls[0] : null);
}

function isManagedVideoLibraryPost(post) {
    return post?.origin_type === 'video_library'
        || Boolean(post?.source_asset_id)
        || String(post?.publication_key || '').startsWith('video-library:')
        || Boolean(post?.metadata?.video_library_id);
}

function isPublicAudiencePost(post) {
    if (!post || post.is_deleted === true || post.visibility === 'private') return false;
    const effectiveAudience = post.audience_mode
        || (post.visibility !== 'public' ? post.visibility : null)
        || 'public';
    return effectiveAudience === 'public';
}


// Raw fetch wrapper — avoids Supabase JS client cold-start overhead (~300ms)
async function supaFetch(path, options = {}) {
    const { url, key } = getSupaConfig();
    if (!url || !key) throw new Error('Social feed service-role configuration is unavailable');
    const res = await fetch(`${url}/rest/v1${path}`, {
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...options.headers,
        },
        ...options,
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Supabase ${path}: HTTP ${res.status} - ${txt.slice(0, 200)}`);
    }
    return res.json();
}

async function readManagedEligibilityContext(posts) {
    const managed = posts.filter(isManagedVideoLibraryPost);
    const assetIds = [...new Set(managed
        .map(post => String(post.source_asset_id || ''))
        .filter(id => UUID_RE.test(id)))];
    // Confirmed playback failures apply to every public video, not just the
    // managed Video Library subset. This prevents a legacy/direct post from
    // replaying an embed that the canonical Reel endpoint already rejected.
    const youtubeIds = [...new Set(posts
        .filter(post => post?.content_type === 'video')
        .map(postYouTubeId)
        .filter(Boolean))];
    const nativeCandidatesByKey = new Map();
    for (const post of posts) {
        const playbackUrl = Array.isArray(post?.media_urls) ? post.media_urls[0] : null;
        const key = nativeVerificationKey(playbackUrl, post?.author_id);
        if (!key || !isTrustedNativeUrl(playbackUrl, post?.author_id)) continue;
        nativeCandidatesByKey.set(key, {
            playback_url: new URL(playbackUrl).toString(),
            author_id: String(post.author_id).toLowerCase(),
        });
    }

    const assetByIdParams = new URLSearchParams({
        select: 'id,youtube_video_id,type,availability_status,embeddable,availability_checked_at',
        id: `in.(${assetIds.join(',')})`,
    });
    const assetByYoutubeParams = new URLSearchParams({
        select: 'id,youtube_video_id,type,availability_status,embeddable,availability_checked_at',
        youtube_video_id: `in.(${youtubeIds.join(',')})`,
    });
    const failureParams = new URLSearchParams({
        select: 'video_id,resolved,verification_status,last_verified_at',
        video_id: `in.(${youtubeIds.join(',')})`,
    });

    const [assetsById, assetsByYoutube, failures, nativeObjectProof] = await Promise.all([
        assetIds.length
            ? supaFetch(`/video_library_videos?${assetByIdParams}`)
            : Promise.resolve([]),
        youtubeIds.length
            ? supaFetch(`/video_library_videos?${assetByYoutubeParams}`)
            : Promise.resolve([]),
        youtubeIds.length
            ? supaFetch(`/youtube_embed_failures?${failureParams}`)
            : Promise.resolve([]),
        nativeCandidatesByKey.size
            ? supaFetch('/rpc/fn_filter_valid_user_video_storage_urls', {
                method: 'POST',
                body: JSON.stringify({
                    p_candidates: [...nativeCandidatesByKey.values()],
                }),
            })
            : Promise.resolve([]),
    ]);
    const assets = [...(assetsById || []), ...(assetsByYoutube || [])];
    const verificationByYoutube = new Map(
        (failures || []).filter(row => row?.video_id).map(row => [row.video_id, row])
    );
    return {
        assetById: new Map((assets || []).map(asset => [asset.id, asset])),
        assetByYoutube: new Map((assets || []).map(asset => [asset.youtube_video_id, asset])),
        verificationByYoutube,
        failedYoutubeIds: new Set((failures || [])
            .filter(row => row.verification_status === 'confirmed' && row.resolved === false)
            .map(row => row.video_id)),
        verifiedNativeObjects: new Set((nativeObjectProof || [])
            .map(row => nativeVerificationKey(row?.playback_url, row?.author_id))
            .filter(Boolean)),
    };
}

function isFreshVerificationTimestamp(value, nowMs = Date.now()) {
    const checkedAt = Date.parse(value || '');
    return Number.isFinite(checkedAt)
        && nowMs - checkedAt <= VERIFY_MAX_AGE_MS
        && checkedAt <= nowMs + MAX_FUTURE_SKEW_MS;
}

function hasFreshPositiveYouTubeProof(youtubeId, context, nowMs = Date.now()) {
    if (!youtubeId || context.failedYoutubeIds.has(youtubeId)) return false;
    const asset = context.assetByYoutube.get(youtubeId);
    const assetVerified = asset?.availability_status === 'verified'
        && asset?.embeddable === true
        && isFreshVerificationTimestamp(asset?.availability_checked_at, nowMs);
    const verdict = context.verificationByYoutube.get(youtubeId);
    const verifierResolved = verdict?.verification_status === 'resolved'
        && verdict?.resolved === true
        && isFreshVerificationTimestamp(verdict?.last_verified_at, nowMs);
    return assetVerified || verifierResolved;
}

function hasActiveLegacyTransition(post, nowMs = Date.now()) {
    if (post?.legacy_transition_eligible !== true) return false;
    const expiresAt = Date.parse(post?.legacy_transition_expires_at || '');
    return Number.isFinite(expiresAt)
        && expiresAt > nowMs
        && expiresAt - nowMs <= LEGACY_TRANSITION_MAX_REMAINING_MS + MAX_FUTURE_SKEW_MS;
}

function managedVideoPostIsEligible(post, context, nowMs = Date.now()) {
    const managed = isManagedVideoLibraryPost(post);
    if (post?.content_type !== 'video') return !managed;

    const playbackUrl = Array.isArray(post?.media_urls) ? post.media_urls[0] : null;
    const youtubeId = postYouTubeId(post);
    const storedYoutubeId = extractYouTubeId(post?.youtube_video_id);
    const canonical = String(post?.canonical_asset_key || '');
    const legacyTransitionEligible = hasActiveLegacyTransition(post, nowMs);

    if (
        youtubeId
        && (
            context.failedYoutubeIds.has(youtubeId)
            || (
                !hasFreshPositiveYouTubeProof(youtubeId, context, nowMs)
                && !legacyTransitionEligible
            )
        )
    ) return false;

    if (post?.playback_type === 'youtube_embed') {
        const playbackYoutubeId = postPlaybackYouTubeId(post);
        if (!['embed_only', 'owned', 'licensed'].includes(post?.rights_status)) return false;
        if (!youtubeId || playbackYoutubeId !== youtubeId || storedYoutubeId !== youtubeId) return false;
        if (canonical !== `youtube:${youtubeId}`) return false;
        if (context.failedYoutubeIds.has(youtubeId)) return false;
    } else if (post?.playback_type === 'native') {
        if (!['owned', 'licensed', 'user_authorized'].includes(post?.rights_status)) return false;
        const nativeKey = nativeVerificationKey(playbackUrl, post?.author_id);
        if (
            !isTrustedNativeUrl(playbackUrl, post?.author_id)
            || !nativeKey
            || !context.verifiedNativeObjects?.has(nativeKey)
        ) return false;
        if (youtubeId) {
            if (!['owned', 'licensed'].includes(post?.rights_status)) return false;
            if (storedYoutubeId !== youtubeId || canonical !== `youtube:${youtubeId}`) return false;
            if (context.failedYoutubeIds.has(youtubeId)) return false;
        } else if (!canonical.startsWith('native:')) {
            return false;
        }
    } else {
        // Public social playback supports only the same two contracts as the
        // canonical Reel feed. Generic/external embeds fail closed.
        return false;
    }

    if (!managed) return true;
    if (!POKER_TOPICS.has(String(post?.topic || '').toLowerCase())) return false;
    // Managed library rows currently publish an embed. Owned/licensed native
    // renditions retain this lineage but are served by the Reel endpoint until
    // the social-post native mirror is fully reconciled.
    if (post?.playback_type !== 'youtube_embed') return false;
    if (!UUID_RE.test(String(post?.source_asset_id || ''))) return false;

    const asset = context.assetById.get(post.source_asset_id);
    if (!asset || !youtubeId) return false;
    if (!['cash', 'tournament'].includes(String(asset.type || '').toLowerCase())) return false;
    if (
        !legacyTransitionEligible
        && (asset.availability_status !== 'verified' || asset.embeddable !== true)
    ) return false;
    if (asset.youtube_video_id !== youtubeId) return false;
    if (postPlaybackYouTubeId(post) !== youtubeId) return false;
    if (post.youtube_video_id !== youtubeId) return false;
    if (post.canonical_asset_key !== `youtube:${youtubeId}`) return false;
    if (post.publication_key !== `video-library:${asset.id}`) return false;
    if (legacyTransitionEligible) return true;

    const checkedAt = Date.parse(asset.availability_checked_at || '');
    return Number.isFinite(checkedAt)
        && nowMs - checkedAt <= VERIFY_MAX_AGE_MS
        && checkedAt <= nowMs + MAX_FUTURE_SKEW_MS;
}

async function readSafePostWindow(offset, limit) {
    const posts = [];
    let rawOffset = offset;
    let scanned = 0;

    while (scanned < MAX_POST_SCAN_ROWS) {
        const scanLimit = Math.min(POST_SCAN_SIZE, MAX_POST_SCAN_ROWS - scanned);
        const params = new URLSearchParams({
            select: POST_SELECT,
            or: '(visibility.eq.public,visibility.is.null)',
            is_deleted: 'not.is.true',
            order: 'created_at.desc,id.desc',
            offset: String(rawOffset),
            limit: String(scanLimit),
        });
        const page = await supaFetch(`/social_posts?${params}`);
        if (!Array.isArray(page) || page.length === 0) {
            return { posts, hasMore: false, nextOffset: rawOffset, partial: false };
        }
        scanned += page.length;
        const context = await readManagedEligibilityContext(page);
        for (let index = 0; index < page.length; index += 1) {
            const post = page[index];
            // Raw service-role reads bypass RLS. Reapply the anonymous/public
            // audience contract so a stale visibility bit cannot disclose a
            // friends/specific/only-me post through this public feed.
            if (!isPublicAudiencePost(post)) continue;
            if (!managedVideoPostIsEligible(post, context)) continue;
            if (posts.length === limit) {
                // This row was inspected but not consumed. Returning its raw
                // position prevents filtered rows from creating skips/loops.
                return { posts, hasMore: true, nextOffset: rawOffset + index, partial: false };
            }
            posts.push(post);
        }
        rawOffset += page.length;
        if (page.length < scanLimit) {
            return { posts, hasMore: false, nextOffset: rawOffset, partial: false };
        }
    }

    // A feed dominated by ineligible rows must still terminate. The exact raw
    // continuation lets the next request resume without skipping any row.
    return { posts, hasMore: true, nextOffset: rawOffset, partial: true };
}

export default async function handler(req, res) {
    // Apply privacy headers before every early return, including method and
    // validation errors.
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Accept-Encoding, Authorization');
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    try {
        const parsedOffset = Number.parseInt(req.query.offset || '0', 10);
        const parsedLimit = Number.parseInt(req.query.limit || '20', 10);
        const offset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0;
        if (offset > MAX_FEED_OFFSET) {
            return res.status(400).json({ error: 'Feed offset exceeds the supported range' });
        }
        const limit = Number.isFinite(parsedLimit)
            ? Math.min(50, Math.max(1, parsedLimit))
            : 20;
        // 2026-08-15 audit: identity comes from the JWT, never from
        // ?user_id — the service-role enrichment below would otherwise leak
        // any user's like/bookmark state to any caller who passed their uuid.
        /*
         * 2026-09-08: this used to `await` the identity resolve BEFORE building
         * the posts query, and the posts query does not depend on it - only the
         * per-user enrichment in step 2 does. So every warm request paid for a
         * GoTrue round trip in series with the posts round trip.
         *
         * Measured on production before the change: first call 851ms (cold),
         * warm calls 230-379ms, median 360. Two sequential network hops plus
         * the parallel enrichment is exactly that shape. Started here and
         * awaited alongside the posts fetch below, the auth hop overlaps
         * instead of stacking.
         *
         * No behaviour change: identity still comes only from the JWT, never
         * from ?user_id, and a failed resolve still yields a null userId and an
         * anonymous response.
         */
        const authHeader = req.headers.authorization || '';
        const userIdPromise = authHeader.startsWith('Bearer ')
            ? (async () => {
                try {
                    const { getServerUserWithFallback } = await import('../../../src/lib/serverAuth');
                    const { createClient } = await import('../../../src/lib/supabaseServerClient');
                    const { url: au, key: ak } = getSupaConfig();
                    const authClient = createClient(au, ak);
                    const { user: authUser } = await getServerUserWithFallback(req, authClient);
                    return authUser?.id || null;
                } catch (e) {
                    console.warn('[API/feed] auth resolve failed:', e?.message);
                    return null;
                }
            })()
            : Promise.resolve(null);

        // Keep authentication concurrent with the canonical filtered window.
        // Raw continuation consumes hidden/deleted rows without skipping valid posts.
        const [{ posts, hasMore, nextOffset, partial }, userId] = await Promise.all([
            readSafePostWindow(offset, limit),
            userIdPromise,
        ]);

        if (!posts || posts.length === 0) {
            return res.status(200).json({ posts: [], hasMore, nextOffset, partial, offset, limit });
        }

        // ── 2. Parallel: profiles + likes for this page + bookmarks ──────────
        const postIds = posts.map(p => p.id);
        const authorIds = [...new Set(posts.map(p => p.author_id).filter(Boolean))];

        const [profilesData, likesData, ownLikesData, bookmarksData] = await Promise.all([
            // Profiles for all authors on this page
            authorIds.length > 0
                ? supaFetch(`/profiles?id=in.(${authorIds.join(',')})&select=id,username,full_name,display_name,avatar_url`)
                : Promise.resolve([]),

            // Reaction flavor for posts on this page (display only — capped)
            postIds.length > 0
                ? supaFetch(`/social_likes?post_id=in.(${postIds.join(',')})&select=post_id,user_id,reaction_type&limit=500`)
                : Promise.resolve([]),

            // The caller's OWN like rows — authoritative for isLiked. The
            // capped page above misses the caller's row on popular posts,
            // which rendered hearts un-liked and made the next tap UN-like.
            userId && postIds.length > 0
                ? supaFetch(`/social_likes?user_id=eq.${userId}&post_id=in.(${postIds.join(',')})&select=post_id`)
                    .catch(() => [])
                : Promise.resolve([]),

            // Bookmarks (only if user logged in)
            userId && postIds.length > 0
                ? supaFetch(`/social_interactions?user_id=eq.${userId}&interaction_type=eq.bookmark&post_id=in.(${postIds.join(',')})&select=post_id`)
                    .catch(() => []) // Non-critical — don't fail if this errors
                : Promise.resolve([]),
        ]);

        // ── 3. Build lookup maps ─────────────────────────────────────────────
        const profileMap = {};
        (profilesData || []).forEach(p => { profileMap[p.id] = p; });

        // Group likes by post_id
        const likesByPost = {};
        (likesData || []).forEach(l => {
            if (!likesByPost[l.post_id]) likesByPost[l.post_id] = [];
            likesByPost[l.post_id].push(l);
        });

        const bookmarkedIds = new Set((bookmarksData || []).map(b => b.post_id));
        const ownLikedIds = new Set((ownLikesData || []).map(l => l.post_id));

        // ── 4. Enrich posts ──────────────────────────────────────────────────
        const enrichedPosts = posts.map(p => {
            const likesArray = likesByPost[p.id] || [];
            const reactions = likesArray.map(l => l.reaction_type || 'like');
            const profile = profileMap[p.author_id];
            const meta = p.metadata || {};

            const safeMediaUrls = p.playback_type === 'youtube_embed'
                ? [`https://www.youtube.com/watch?v=${postYouTubeId(p)}`]
                : (p.media_urls || []);

            return {
                id: p.id,
                authorId: p.author_id,
                content: p.content,
                contentType: p.content_type,
                mediaUrls: safeMediaUrls,
                thumbnailUrl: p.thumbnail_url || null,
                thumbnail_url: p.thumbnail_url || null,
                likeCount: p.like_count || 0,  // Now accurate thanks to DB trigger
                commentCount: p.comment_count || 0,
                shareCount: p.share_count || 0,
                reactions,
                isLiked: ownLikedIds.has(p.id),
                isBookmarked: bookmarkedIds.has(p.id),
                viewCount: p.view_count || 0,
                visibility: p.visibility || 'public',
                createdAt: p.created_at,
                link_url: p.link_url || null,
                link_title: p.link_title || null,
                link_description: p.link_description || null,
                link_image: p.link_image || null,
                link_site_name: p.link_site_name || null,
                metadata: meta,
                origin_type: p.origin_type,
                playback_type: p.playback_type,
                topic: p.topic,
                rights_status: p.rights_status,
                source_asset_id: p.source_asset_id,
                youtube_video_id: p.youtube_video_id,
                canonical_asset_key: p.canonical_asset_key,
                publication_key: p.publication_key,
                author: {
                    name: meta.page_name || profile?.full_name || profile?.display_name || profile?.username || 'Player',
                    username: profile?.username || null,
                    avatar: meta.page_avatar_url || profile?.avatar_url || null,
                },
            };
        });

        // Availability and failure verification can change independently of a
        // post. Never let a CDN/browser replay an eligibility decision.
        return res.status(200).json({
            posts: enrichedPosts,
            hasMore,
            nextOffset,
            partial,
            offset,
            limit,
        });

    } catch (err) {
        console.warn('[API/feed] Unhandled error:', err.message);
        return res.status(503).json({ error: 'Feed temporarily unavailable' });
    }
}
