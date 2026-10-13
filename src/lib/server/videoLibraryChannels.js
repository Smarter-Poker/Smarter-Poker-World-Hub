import { createClient } from '../supabaseServerClient';
import { VIDEO_LIBRARY_ALLOWED_TYPES, isVideoLibraryVideoAllowed } from '../videoLibraryAvailability';
import { dedupeVideos, isCuratedFeedVideo } from '../videoLibraryCuration.mjs';
import { VIDEO_ROW_FIELDS, normaliseVideoRow } from '../videoLibraryWatch.mjs';
import { VIDEO_LIBRARY_SOURCES } from '../../data/videoLibraryCompatibility';
import { CHANNEL_ID_RE, CHANNEL_KEY_RE, publicVideoChannel } from '../videoLibraryChannels.mjs';

let connection;
export function channelServerClient() {
    if (!connection) {
        const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('Channel catalog configuration unavailable');
        connection = createClient(url, key);
    }
    return connection;
}
const SOURCE_FIELDS = 'id,name,handle,provider_source_id,attribution_url,ingest_topic,is_active,lifecycle_status';
export async function loadVideoLibraryChannels({ channelId = null, offset = 0, limit = 30 } = {}) {
    const key = String(channelId || '').trim();
    if (key && !CHANNEL_ID_RE.test(key) && !CHANNEL_KEY_RE.test(key)) return { channel: null, channels: [], data: [], pagination: { total: 0, hasMore: false } };
    const db = channelServerClient();
    const [sources, aliasResult] = await Promise.all([
        db.from('content_sources').select(SOURCE_FIELDS).eq('kind', 'youtube_channel').eq('provider', 'youtube').eq('ingestion_mode', 'creator_uploads').in('lifecycle_status', ['active', 'paused']).order('name').limit(500),
        db.from('video_library_channel_aliases').select('source_key,source_id').limit(2000),
    ]);
    if (sources.error || aliasResult.error) throw sources.error || aliasResult.error;
    const channels = (sources.data || []).map(row => publicVideoChannel(row, (aliasResult.data || []).filter(alias => alias.source_id === row.id).map(alias => alias.source_key), VIDEO_LIBRARY_SOURCES));
    const channel = key ? channels.find(item => item.id.toLowerCase() === key.toLowerCase() || item.aliases.some(alias => alias.toUpperCase() === key.toUpperCase())) || null : null;
    if (!key || !channel) return { channels, channel, data: [], pagination: { limit, offset, total: 0, nextOffset: offset, hasMore: false } };
    const safeLimit = Math.max(1, Math.min(60, Number.parseInt(limit, 10) || 30));
    const safeOffset = Math.max(0, Math.min(100000, Number.parseInt(offset, 10) || 0));
    const result = await db.from('video_library_public_catalog').select(VIDEO_ROW_FIELDS, { count: 'exact' })
        .in('source_id', [channel.id, ...channel.aliases]).in('type', VIDEO_LIBRARY_ALLOWED_TYPES)
        .order('published_at', { ascending: false, nullsFirst: false }).order('youtube_video_id')
        .range(safeOffset, safeOffset + safeLimit - 1);
    if (result.error) throw result.error;
    const data = dedupeVideos((result.data || []).map(normaliseVideoRow).filter(isVideoLibraryVideoAllowed).filter(isCuratedFeedVideo));
    const total = Number.isFinite(result.count) ? result.count : safeOffset + data.length;
    const nextOffset = safeOffset + (result.data || []).length;
    return { channels, channel, data, pagination: { limit: safeLimit, offset: safeOffset, total, nextOffset, hasMore: nextOffset < total } };
}
