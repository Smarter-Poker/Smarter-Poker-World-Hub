import { channelServerClient } from './videoLibraryChannels';
import { isVideoLibraryVideoAllowed, BLOCKED_VIDEO_LIBRARY_IDS } from '../videoLibraryAvailability';
import { VIDEO_LIBRARY_POKER_TYPES, dedupeVideos, isCuratedFeedVideo, mixedContentFilter } from '../videoLibraryCuration.mjs';
import { VIDEO_ROW_FIELDS, normaliseVideoRow } from '../videoLibraryWatch.mjs';
import { getVideoLibraryPlayer, matchesVideoPlayer, playerCatalogFilter } from '../videoLibraryPlayers.mjs';

/** Read only the existing public eligible catalog, never member profiles. */
export async function loadVideoLibraryPlayer({ playerId, offset = 0, limit = 30 } = {}) {
    const player = getVideoLibraryPlayer(playerId);
    if (!player) return { player: null, data: [], pagination: { total: 0, hasMore: false } };
    const safeLimit = Math.max(1, Math.min(60, Number.parseInt(limit, 10) || 30));
    const safeOffset = Math.max(0, Math.min(100000, Number.parseInt(offset, 10) || 0));
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 15000);
    let result;
    try { result = await channelServerClient().from('video_library_public_catalog')
        .select(VIDEO_ROW_FIELDS, { count: 'exact' })
        .in('type', VIDEO_LIBRARY_POKER_TYPES)
        .not('youtube_video_id', 'in', `(${BLOCKED_VIDEO_LIBRARY_IDS.join(',')})`)
        .or(playerCatalogFilter(player))
        .or(mixedContentFilter())
        .order('scraped_at', { ascending: false, nullsFirst: false }).order('youtube_video_id', { ascending: true })
        .range(safeOffset, safeOffset + safeLimit - 1).abortSignal(controller.signal);
    } finally { clearTimeout(deadline); }
    if (result.error) throw result.error;
    const rows = result.data || [];
    const data = dedupeVideos(rows.map(normaliseVideoRow).filter(isVideoLibraryVideoAllowed)
        .filter(isCuratedFeedVideo).filter(video => matchesVideoPlayer(video, player)));
    const nextOffset = safeOffset + rows.length;
    const total = Number.isFinite(result.count) ? result.count : nextOffset;
    return { player, data, pagination: { limit: safeLimit, offset: safeOffset, nextOffset, hasMore: nextOffset < total } };
}
