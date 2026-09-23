/**
 * Videos API - Get canonical poker videos for the News video-card surface.
 *
 * The historic video-card response remains intact; eligibility, playable URL
 * selection and canonical deduplication now come from the shared Reels reader.
 */
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { readPokerReelsFeed } from '../../../src/lib/server/reelsFeed';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

function clampInt(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function safeQueryValue(value) {
    if (!value) return value;
    if (Array.isArray(value)) return String(value[0]);
    return typeof value === 'object' ? null : String(value);
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
        if (req.method !== 'GET') {
            res.setHeader('Allow', 'GET');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.read)) return;

        try {
            const limit = clampInt(safeQueryValue(req.query.limit), 20, 1, 100);
            const channel = safeQueryValue(req.query.channel);
            const fetchLimit = channel ? 100 : limit;
            const result = await readPokerReelsFeed({
                limit: fetchLimit,
                sort: 'recent',
                scope: 'all',
            });

            const videos = result.data.map(reel => ({
                id: reel.id,
                title: reel.title || 'Poker Video',
                youtube_id: reel.youtube_video_id || null,
                video_url: reel.video_url,
                thumbnail_url: reel.thumbnail_url,
                duration: '',
                views: reel.view_count || 0,
                channel: reel.channel_name || 'Smarter.Poker',
                published_at: reel.created_at,
                scraped_at: reel.created_at,
                origin_type: reel.origin_type,
                playback_type: reel.playback_type,
                topic: reel.topic,
                rights_status: reel.rights_status,
                source_asset_id: reel.source_asset_id,
                canonical_asset_key: reel.canonical_asset_key,
                source_post_id: reel.source_post_id,
                profiles: reel.profiles,
            }));

            const filtered = (channel
                ? videos.filter(video => video.channel?.toLowerCase().includes(channel.toLowerCase()))
                : videos
            ).slice(0, limit);

            return res.status(200).json({ success: true, data: filtered });
        } catch (error) {
            try { reportApiError(error, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
            console.warn('Videos API exception:', error?.message || error);
            return res.status(500).json({ success: false, error: 'Videos feed unavailable' });
        }
    } catch (error) {
        try { reportApiError(error, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
        console.warn('[API Error]', error?.message || error);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
