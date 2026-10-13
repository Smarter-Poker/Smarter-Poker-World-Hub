import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
    BLOCKED_VIDEO_LIBRARY_IDS,
    VIDEO_LIBRARY_ALLOWED_TYPES,
    isVideoLibraryVideoAllowed,
} from '../../../src/lib/videoLibraryAvailability';
import {
    VIDEO_LIBRARY_POKER_TYPES,
    dedupeVideos,
    isCasinoGameFiledAsPoker,
    isDisplayableVideoTitle,
    mixedContentFilter,
} from '../../../src/lib/videoLibraryCuration.mjs';
import { VIDEO_ROW_FIELDS, normaliseVideoRow } from '../../../src/lib/videoLibraryWatch.mjs';
import { applyBrowseQueryFilters, normalizeBrowseFilters, matchesBrowseFilters } from '../../../src/lib/videoLibraryBrowse.mjs';
import { getVideoLibraryPlayer, matchesVideoPlayer, playerCatalogFilter } from '../../../src/lib/videoLibraryPlayers.mjs';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 60;
const MAX_PERSONAL_IDS = 500;
const VIDEO_FIELDS = VIDEO_ROW_FIELDS;

let supabaseClient = null;

function getSupabase() {
    if (!supabaseClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('Video catalog service-role configuration is unavailable');
        supabaseClient = createClient(url, key);
    }
    return supabaseClient;
}

function firstQueryValue(value) {
    return Array.isArray(value) ? value[0] : value;
}

function boundedInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(firstQueryValue(value), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function cleanSearch(value) {
    return String(firstQueryValue(value) || '')
        .trim()
        .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 80);
}

function parseIds(value) {
    return [...new Set(String(firstQueryValue(value) || '')
        .split(',')
        .map(id => id.trim())
        .filter(id => /^[A-Za-z0-9_-]{11}$/.test(id)))]
        .slice(0, MAX_PERSONAL_IDS);
}

const normaliseVideo = normaliseVideoRow;

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Accept-Encoding');
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const limit = boundedInteger(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = boundedInteger(req.query.offset, 0, 0, 100_000);
    const source = String(firstQueryValue(req.query.source) || '').trim().toUpperCase().slice(0, 48);
    const type = String(firstQueryValue(req.query.type) || '').trim().toLowerCase();
    const sort = String(firstQueryValue(req.query.sort) || 'latest').trim().toLowerCase();
    const search = cleanSearch(req.query.q);
    const browseFilters = normalizeBrowseFilters(req.query);
    const playerRequested = firstQueryValue(req.query.playerId) !== undefined;
    const player = getVideoLibraryPlayer(firstQueryValue(req.query.playerId));
    if (playerRequested && !player) return res.status(400).json({ success: false, error: 'Unknown Poker Player' });
    const idsRequested = firstQueryValue(req.query.ids) !== undefined;
    const ids = parseIds(req.query.ids);
    if (idsRequested && ids.length === 0) {
        return res.status(400).json({ success: false, error: 'Invalid video ids filter' });
    }

    try {
        const client = getSupabase();
        let query = client
            .from('video_library_public_catalog')
            .select(VIDEO_FIELDS, { count: 'exact' });

        query = query.not('youtube_video_id', 'in', `(${BLOCKED_VIDEO_LIBRARY_IDS.join(',')})`);
        query = query.in('type', VIDEO_LIBRARY_ALLOWED_TYPES);
        if (player) query = query.in('type', VIDEO_LIBRARY_POKER_TYPES).or(playerCatalogFilter(player));

        if (source && source !== 'ALL') query = query.eq('source_id', source);
        // Poker first (owner update 2026-10-12): with no type chosen, the feed
        // is cash games and tournaments. Sports and slots show on their own
        // chips. Saved-library lookups (ids) keep every type the player saved.
        if (VIDEO_LIBRARY_ALLOWED_TYPES.includes(type)) query = query.eq('type', type);
        else if (!idsRequested) query = query.in('type', VIDEO_LIBRARY_POKER_TYPES);
        if (idsRequested) query = query.in('youtube_video_id', ids);
        else query = query.or(mixedContentFilter());
        if (search) {
            const pattern = `%${search.replace(/[%_]/g, '')}%`;
            query = query.or(`title.ilike.${pattern},source_name.ilike.${pattern},source_id.ilike.${pattern}`);
        }
        query = applyBrowseQueryFilters(query, browseFilters);

        if (sort === 'top_rated') {
            query = query
                .order('views_count', { ascending: false, nullsFirst: false })
                .order('scraped_at', { ascending: false, nullsFirst: false });
        } else if (sort === 'trending') {
            query = query
                .order('scraped_at', { ascending: false, nullsFirst: false })
                .order('views_count', { ascending: false, nullsFirst: false });
        } else {
            query = query.order('scraped_at', { ascending: false, nullsFirst: false });
        }
        query = query.order('youtube_video_id', { ascending: true });

        const { data, error, count } = await query.range(offset, offset + limit - 1);
        if (error) throw error;

        const rawRowCount = Array.isArray(data) ? data.length : 0;
        const normalised = (data || []).map(normaliseVideo).filter(isVideoLibraryVideoAllowed)
            .filter(video => matchesBrowseFilters(video, browseFilters))
            .filter(video => !player || matchesVideoPlayer(video, player));
        // Saved-library lookups return exactly what the player saved; the
        // feed hides unreadable titles, casino games filed as poker and
        // reposted duplicates.
        const videos = idsRequested
            ? normalised
            : dedupeVideos(normalised.filter(video => isDisplayableVideoTitle(video.rawTitle) && !isCasinoGameFiledAsPoker(video)));
        const total = Number.isFinite(count) ? count : offset + videos.length;
        const nextOffset = offset + rawRowCount;
        return res.status(200).json({
            success: true,
            data: videos,
            ...(player ? { player } : {}),
            pagination: {
                limit,
                offset,
                total,
                nextOffset,
                hasMore: nextOffset < total,
            },
        });
    } catch (error) {
        console.warn('[video-library/catalog] catalog fetch failed:', error?.message || error);
        try { reportApiError(error, req); } catch (_reportError) { /* telemetry must never mask the response */ }
        return res.status(503).json({ success: false, error: 'Video catalog is temporarily unavailable' });
    }
}
