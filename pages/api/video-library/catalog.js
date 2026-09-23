import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
    BLOCKED_VIDEO_LIBRARY_IDS,
    VIDEO_LIBRARY_ALLOWED_TYPES,
    isVideoLibraryVideoAllowed,
} from '../../../src/lib/videoLibraryAvailability';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 60;
const MAX_PERSONAL_IDS = 500;
const VIDEO_FIELDS = 'youtube_video_id, source_id, source_name, type, title, thumbnail_url, views_text, views_count, duration, published_at, scraped_at, tags, availability_status, embeddable, availability_checked_at';

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

function normaliseVideo(row) {
    return {
        id: row.youtube_video_id,
        videoId: row.youtube_video_id,
        source: row.source_id,
        sourceName: row.source_name || row.source_id,
        type: row.type || 'cash',
        title: row.title,
        views: row.views_text && row.views_text !== '0' ? row.views_text : String(row.views_count || ''),
        viewsCount: Number(row.views_count || 0),
        duration: row.duration || '',
        thumbnail: row.thumbnail_url || `https://img.youtube.com/vi/${row.youtube_video_id}/maxresdefault.jpg`,
        publishedAt: row.published_at,
        scrapedAt: row.scraped_at,
        tags: Array.isArray(row.tags) ? row.tags : [],
        availabilityStatus: row.availability_status,
        embeddable: row.embeddable === true,
        availabilityCheckedAt: row.availability_checked_at,
        _sortKey: row.published_at,
    };
}

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

        if (source && source !== 'ALL') query = query.eq('source_id', source);
        if (type === 'cash' || type === 'tournament') query = query.eq('type', type);
        if (idsRequested) query = query.in('youtube_video_id', ids);
        if (search) {
            const pattern = `%${search.replace(/[%_]/g, '')}%`;
            query = query.or(`title.ilike.${pattern},source_name.ilike.${pattern},source_id.ilike.${pattern}`);
        }

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
        const videos = (data || []).map(normaliseVideo).filter(isVideoLibraryVideoAllowed);
        const total = Number.isFinite(count) ? count : offset + videos.length;
        const nextOffset = offset + rawRowCount;
        return res.status(200).json({
            success: true,
            data: videos,
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
