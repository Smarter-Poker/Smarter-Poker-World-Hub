/**
 * Responsive URLs for a news story's photo (see pages/api/news/photo.js).
 *
 * Only a real poker_news row (a uuid id) with a photo gets the resized
 * route. Sample, empty and error boxes keep the URL they always used.
 */
export const NEWS_PHOTO_WIDTHS = Object.freeze([240, 640, 960, 1280]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isNewsPhotoId(id) {
    return typeof id === 'string' && UUID.test(id);
}

export function newsPhotoUrl(id, width) {
    return `/api/news/photo?id=${encodeURIComponent(id)}&w=${width}`;
}

/**
 * @param {object} article  a poker_news row as the feed APIs return it
 * @param {number[]} widths  candidate widths, a subset of NEWS_PHOTO_WIDTHS
 * @returns {{ src: string, srcSet: string } | null}
 */
export function newsPhotoSources(article, widths = [640, 960, 1280]) {
    if (!article || article.is_fallback || article._isEmpty || article._isError) return null;
    if (!isNewsPhotoId(article.id)) return null;
    if (typeof article.image_url !== 'string' || !article.image_url.trim()) return null;
    const list = widths.filter((w) => NEWS_PHOTO_WIDTHS.includes(w));
    if (!list.length) return null;
    return {
        src: newsPhotoUrl(article.id, list[Math.min(1, list.length - 1)]),
        srcSet: list.map((w) => `${newsPhotoUrl(article.id, w)} ${w}w`).join(', '),
    };
}
