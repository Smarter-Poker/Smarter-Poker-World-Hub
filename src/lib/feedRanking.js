/**
 * feedRanking.js
 * ─────────────────────────────────────────────────────────────────
 * The social feed page order for a signed-in viewer.
 *
 * rankFeedPage is a permutation of ONE page: band A holds the posts whose
 * author the viewer recently sat at a table with (the viewer's own hands
 * decide membership, nothing else), band B holds the rest, and each band
 * keeps the created_at desc, id desc order it arrived in. The result is a
 * new array with exactly the input posts: nothing is dropped, added or
 * pulled forward from another page. The caller computes nextOffset from the
 * raw scan BEFORE calling this, so pagination stays exact.
 *
 * Horses are players: a horse the viewer played with lands in band A exactly
 * like a human. Membership is the viewer's own hands and nothing else.
 */

function authorKey(post) {
    const id = post?.author_id ?? post?.authorId ?? '';
    return String(id).toLowerCase();
}

function toSet(playedWith) {
    if (playedWith instanceof Set) return playedWith;
    if (Array.isArray(playedWith)) return new Set(playedWith);
    return new Set();
}

/**
 * @param {Array<object>} posts page rows in arrival order
 * @param {{ playedWith?: Set<string>|string[] }} options author ids (lower-case uuids)
 * @returns {Array<object>} band A then band B, each in arrival order
 */
export function rankFeedPage(posts, { playedWith } = {}) {
    const rows = Array.isArray(posts) ? posts : [];
    const known = toSet(playedWith);
    if (known.size === 0) return rows.slice();
    const bandA = [];
    const bandB = [];
    for (const post of rows) {
        if (known.has(authorKey(post))) bandA.push(post);
        else bandB.push(post);
    }
    return bandA.concat(bandB);
}

export function isPlayedWithAuthor(post, playedWith) {
    return toSet(playedWith).has(authorKey(post));
}
