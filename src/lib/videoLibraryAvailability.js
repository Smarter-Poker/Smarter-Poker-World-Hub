/**
 * YouTube IDs that must never be offered by the video library.
 *
 * These records were verified against YouTube's embed player on 2026-08-27.
 * They are unavailable, age-restricted, or have third-party embedding disabled.
 * Keeping the gate centralized protects the live API, legacy fallback data, old
 * bookmarks, and stale catalog responses with the same rule.
 */
export const BLOCKED_VIDEO_LIBRARY_IDS = Object.freeze([
    '-rjQT0JOhGA',
    '185vMNh9ECc',
    '4441ee7htt0',
    '524_3UypGkU',
    '5wTToeCyu6I',
    '9PrLmIWU0mU',
    'CbXDixknmeM',
    'fzNt4SdBGuQ',
    'jdiDizWlIz0',
    'JVJrPh0s1JQ',
    'KQRZs6ytdWc',
    'LA4z0Hi0Jf8',
    'oINUSqHq_ck',
    'OYgw9TiNqZY',
    'pFbHkHhJO4Y',
    'pIZW-gmcKio',
    'slTxYV5S5n0',
    'TXarmUgk02Q',
    'RpU9bwH-2WI',
    'FqiS7LaQSsg',
    'vWVwhXeILoX',
    'c0RqYhgRxH0',
    'iDPJ3tHK6rA',
    'D1lPQFCDRLg',
    'bZqKGJz2HoE',
    'fQ9Lklp6AuA',
    'hA7c3HHFRUE',
    'n0fHHMfvWck',
    'GH5sEqf5p9Y',
    'aVGVP7Oj8Jg',
]);

const BLOCKED_VIDEO_LIBRARY_ID_SET = new Set(BLOCKED_VIDEO_LIBRARY_IDS);

export function isVideoLibraryVideoAllowed(videoOrId) {
    const videoId = typeof videoOrId === 'object' && videoOrId !== null
        ? videoOrId.videoId || videoOrId.id
        : videoOrId;
    if (!videoId) return false;
    const normalizedId = String(videoId);
    return !normalizedId.startsWith('FAKE') && !BLOCKED_VIDEO_LIBRARY_ID_SET.has(normalizedId);
}
