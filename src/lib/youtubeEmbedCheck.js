/**
 * YouTube oEmbed Embed-Ability Check
 * 
 * Called at ingest time (scrapers/crons) to proactively flag videos
 * that cannot be embedded BEFORE they enter the feed.
 * 
 * Usage:
 *   const { embeddable, errorCode } = await checkYouTubeEmbeddable('dQw4w9WgXcQ');
 *   if (!embeddable) markVideoAsNonEmbeddable(videoId, errorCode);
 */

/**
 * Check if a YouTube video is embeddable using the oEmbed endpoint.
 * This is a lightweight HEAD/GET check — no API key required.
 * 
 * @param {string} videoId — YouTube video ID
 * @param {number} [timeoutMs=5000] — Request timeout in milliseconds
 * @returns {Promise<{ embeddable: boolean, errorCode?: number, reason?: string }>}
 */
export async function checkYouTubeEmbeddable(videoId, timeoutMs = 5000) {
    if (!videoId || typeof videoId !== 'string') {
        return { embeddable: false, reason: 'invalid_id' };
    }

    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const resp = await fetch(oEmbedUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'User-Agent': 'SmarterPoker/1.0 (+https://smarter.poker)' },
        });

        clearTimeout(timeout);

        if (resp.ok) {
            // oEmbed returns 200 → video exists and is likely embeddable
            // (Note: oEmbed won't catch age-restricted videos — those fail at iframe render time)
            return { embeddable: true };
        }

        if (resp.status === 401 || resp.status === 403) {
            // Forbidden/Unauthorized — video is restricted or embedding is disabled
            return { embeddable: false, errorCode: 101, reason: 'embedding_disabled' };
        }

        if (resp.status === 404) {
            // Video not found or removed
            return { embeddable: false, errorCode: 100, reason: 'not_found' };
        }

        return { embeddable: false, errorCode: 0, reason: `http_${resp.status}` };
    } catch (err) {
        if (err.name === 'AbortError') {
            return { embeddable: true, reason: 'timeout_assumed_ok' }; // Optimistic on timeout
        }
        return { embeddable: true, reason: 'network_error_assumed_ok' }; // Optimistic on network failure
    }
}

/**
 * Batch-check multiple video IDs.
 * Returns a Map<videoId, { embeddable, errorCode?, reason? }>
 * 
 * @param {string[]} videoIds
 * @param {number} [concurrency=5]
 * @returns {Promise<Map<string, { embeddable: boolean, errorCode?: number, reason?: string }>>}
 */
export async function batchCheckEmbeddable(videoIds, concurrency = 5) {
    const results = new Map();
    const queue = [...videoIds];

    async function worker() {
        while (queue.length > 0) {
            const id = queue.shift();
            if (!id) break;
            results.set(id, await checkYouTubeEmbeddable(id));
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
    await Promise.all(workers);

    return results;
}

export default checkYouTubeEmbeddable;
