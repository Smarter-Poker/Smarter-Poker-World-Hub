import { THUMBNAIL_SIZES, thumbnailCandidates, nextThumbnailFallback } from '../../lib/videoLibraryCuration.mjs';

// Missing YouTube sizes can return HTTP 200 with a 120px placeholder.
// Both load and error advance the same finite ladder; no retries or timers.
export default function VideoThumbnail({ video, size = THUMBNAIL_SIZES.card, priority = false, vertical = false }) {
    const candidates = thumbnailCandidates(video.videoId, { size, vertical, catalogThumbnail: video.thumbnail });
    const recover = event => {
        const image = event.currentTarget;
        if (event.type !== 'error' && image.naturalWidth > 120) {
            image.hidden = false;
            image.parentElement?.classList.remove('vl-media-failed');
            return;
        }
        const next = nextThumbnailFallback(image.getAttribute('src'), candidates);
        if (next) { image.src = next; return; }
        image.hidden = true;
        image.parentElement?.classList.add('vl-media-failed');
    };
    return <img key={`${video.videoId}:${size}:${vertical}`} src={candidates[0]} alt=""
        loading={priority ? 'eager' : 'lazy'} fetchpriority={priority ? 'high' : 'auto'} decoding="async"
        onLoad={recover} onError={recover} />;
}
