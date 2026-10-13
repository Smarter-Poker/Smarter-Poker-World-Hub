import { watchUrl } from './videoLibraryWatch.mjs';

export function videoLibrarySocialShareId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
}

export function videoLibrarySocialShareHref(video) {
    const id = videoLibrarySocialShareId(typeof video === 'string' ? video : video?.videoId || video?.id);
    return id ? `/hub/social-media?compose=1&shareVideo=${encodeURIComponent(id)}` : null;
}

// Only rows returned by the existing public catalog qualify for the composer.
// Handoff URLs carry an ID, never caller-authored titles or external URLs.
export function videoLibrarySocialPreview(payload, requestedId) {
    const id = videoLibrarySocialShareId(requestedId);
    const video = payload?.success === true && Array.isArray(payload.data)
        ? payload.data.find(row => (row?.videoId || row?.id) === id) : null;
    if (!id || !video || typeof video.title !== 'string' || !video.title.trim()) return null;
    return {
        url: watchUrl(video),
        title: video.title,
        description: video.sourceName || video.channelName || 'Video Library',
        image: video.thumbnail || video.thumbnailUrl || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        domain: 'Smarter.Poker Video Library',
        type: 'link',
        videoLibraryId: id,
    };
}
