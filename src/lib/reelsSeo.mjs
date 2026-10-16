/** Public Reel watch metadata. Inputs must come from the canonical public reader. */
import { durationSeconds } from './videoLibraryCuration.mjs';
import { isoDuration, videoPublicationDate } from './videoLibraryWatch.mjs';

export const REELS_ORIGIN = 'https://smarter.poker';
export const REEL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function reelWatchPath(id) {
    return REEL_ID_RE.test(String(id || '')) ? `/hub/reels?id=${encodeURIComponent(id)}` : null;
}
function mediaUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch { return null; }
}
export function reelVideoSchema(reel) {
    const path = reelWatchPath(reel?.id);
    if (!path || reel?.is_public !== true || !reel?.caption) return null;
    const youtubeId = /^[A-Za-z0-9_-]{11}$/.test(reel.youtube_video_id || '') ? reel.youtube_video_id : null;
    const native = reel.playback_type === 'native';
    if (!youtubeId && !native) return null;
    const uploadDate = videoPublicationDate(youtubeId ? reel.source_published_at : reel.created_at);
    const thumbnail = mediaUrl(youtubeId ? reel.source_thumbnail_url || reel.thumbnail_url : reel.thumbnail_url);
    const contentUrl = native ? mediaUrl(reel.video_url) : null;
    if (!uploadDate || !thumbnail || (native && !contentUrl)) return null;
    const url = `${REELS_ORIGIN}${path}`;
    return {
        '@context': 'https://schema.org', '@type': 'VideoObject', '@id': `${url}#video`,
        name: String(reel.caption).split('\n')[0].slice(0, 200),
        description: String(reel.caption).slice(0, 1000), url,
        thumbnailUrl: [thumbnail], uploadDate,
        ...(youtubeId ? { embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}` } : { contentUrl }),
        ...(isoDuration(durationSeconds(reel.source_duration)) ? { duration: isoDuration(durationSeconds(reel.source_duration)) } : {}),
        publisher: { '@type': 'Organization', name: 'Smarter.Poker', url: REELS_ORIGIN },
    };
}
export function reelMetadata(reel) {
    return { canonical: reelWatchPath(reel?.id) || '/hub/reels', title: reel?.caption ? `${String(reel.caption).split('\n')[0].slice(0, 100)} | Reels` : 'Reels | Smarter.Poker', description: reel?.caption ? String(reel.caption).slice(0, 300) : 'Watch And Share Verified Video On Smarter.Poker Reels.', image: mediaUrl(reel?.source_thumbnail_url || reel?.thumbnail_url), schema: reelVideoSchema(reel) };
}
/** A stable initial player child, later adopted by the official YouTube API. */
export function reelYouTubeFrameHtml(videoId) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return '';
    return `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&amp;mute=1&amp;playsinline=1&amp;controls=0&amp;rel=0&amp;enablejsapi=1" title="Reel Video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>`;
}
