/**
 * fetchBrowserPost(id) -> the post as a browser may see it, or null.
 *
 * A browser never reads a whole social_posts row itself: origin_type and the
 * pipeline's metadata are not granted to it. GET /api/social/post reads the
 * row as the caller (so row-level security still decides who sees it) and
 * hands back metadata reduced to the keys the UI renders. See
 * src/lib/socialPostShape.js.
 */
import { authedFetch } from './authUtils';

export async function fetchBrowserPost(id) {
    if (typeof id !== 'string' || !id) return null;
    const res = await authedFetch(`/api/social/post?id=${encodeURIComponent(id)}`);
    if (!res || res.status === 404) return null;
    if (!res.ok) throw new Error(`Post request failed (${res.status})`);
    const body = await res.json().catch(() => null);
    return body && body.success === true && body.post && typeof body.post === 'object' ? body.post : null;
}

export default fetchBrowserPost;
