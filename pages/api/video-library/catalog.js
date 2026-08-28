import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 60;
const MAX_PERSONAL_IDS = 500;
const VIDEO_FIELDS = 'youtube_video_id, source_id, source_name, type, title, thumbnail_url, views_text, views_count, duration, published_at, scraped_at, tags';

let supabaseClient = null;

function getSupabase() {
    if (!supabaseClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
        .filter(id => /^[A-Za-z0-9_-]{3,32}$/.test(id)))]
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
        _sortKey: row.published_at,
    };
}

export default async function handler(req, res) {
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
    const ids = parseIds(req.query.ids);

    try {
        let query = getSupabase()
            .from('video_library_videos')
            .select(VIDEO_FIELDS, { count: 'exact' });

        if (source && source !== 'ALL') query = query.eq('source_id', source);
        if (type === 'cash' || type === 'tournament') query = query.eq('type', type);
        if (ids.length > 0) query = query.in('youtube_video_id', ids);
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

        const videos = (data || []).map(normaliseVideo);
        const total = Number.isFinite(count) ? count : offset + videos.length;
        res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
        return res.status(200).json({
            success: true,
            data: videos,
            pagination: {
                limit,
                offset,
                total,
                hasMore: offset + videos.length < total,
            },
        });
    } catch (error) {
        console.warn('[video-library/catalog] catalog fetch failed:', error?.message || error);
        try { reportApiError(error, req); } catch (_reportError) { /* telemetry must never mask the response */ }
        res.setHeader('Cache-Control', 'no-store');
        return res.status(503).json({ success: false, error: 'Video catalog is temporarily unavailable' });
    }
}
