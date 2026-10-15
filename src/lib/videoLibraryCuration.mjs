/**
 * Video Library curation (owner update, 2026-10-12, Phase 1).
 *
 * Dan asked for the library to be poker first and cleaned up: the newest rows
 * in the catalog were sports and slot clips, a chess/lifestyle channel was
 * filed under cash games, a few videos were reposted two or three times, and
 * titles arrived stuffed with emoji, hashtags and ALL CAPS.
 *
 * This module is the one place those display rules live. The catalog API, the
 * search (discovery) API and the page all import it, so a rule cannot hold in
 * one place and silently fail in another.
 *
 * Nothing here deletes data. Rows stay in the database; these rules decide
 * what the default feed shows and how a title is written on screen.
 */

/** "All Videos" shows poker only. Sports and slots appear on their own chips. */
export const VIDEO_LIBRARY_POKER_TYPES = Object.freeze(['cash', 'tournament']);

/**
 * Channels that post a mix of poker and unrelated content. A video from one of
 * these shows only when its title is about poker. Measured 2026-10-12:
 * BotezLive had 49 rows filed as cash games and 46 were chess, cooking or
 * fitness videos.
 */
export const VIDEO_LIBRARY_MIXED_CONTENT_SOURCES = Object.freeze([
    '6bfb1441-98ed-41d6-929f-e147626dbffa', // BotezLive
]);

const MIXED_CONTENT_SOURCE_SET = new Set(VIDEO_LIBRARY_MIXED_CONTENT_SOURCES);
const POKER_TITLE_RE = /poker/i;

/** PostgREST `or` filter: mixed-content channels must mention poker. */
export function mixedContentFilter() {
    return [
        `source_id.not.in.(${VIDEO_LIBRARY_MIXED_CONTENT_SOURCES.join(',')})`,
        'title.ilike.*poker*',
    ].join(',');
}

export function isMixedContentAllowed(video) {
    if (!MIXED_CONTENT_SOURCE_SET.has(String(video?.source || ''))) return true;
    return POKER_TITLE_RE.test(String(video?.rawTitle || video?.title || ''));
}

// Emoji and their joiners/selectors. Written as escapes: no emoji in source.
const PICTOGRAPHIC_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{FE0E}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]/gu;
const HASHTAG_RE = /(^|\s)#[\p{L}\p{N}_]+/gu;
const EDGE_SEPARATORS_RE = /^[\s|:,.–—-]+|[\s|:,–—-]+$/g;

/** Abbreviations that stay upper case when an ALL CAPS title is recased. */
const KEEP_UPPER = new Set([
    'WSOP', 'WSOPE', 'WSOPC', 'WPT', 'EPT', 'APT', 'PCA', 'LAPC', 'MSPT', 'RGPS',
    'WCOOP', 'SCOOP', 'GG', 'TCH', 'HCL', 'DGAF', 'NLH', 'NL', 'PL', 'PLO',
    'PLO5', 'PLO8', 'HU', 'GTO', 'MTT', 'PKO', 'ICM', 'EV', 'ROI', 'VPIP', 'PFR',
    'AA', 'KK', 'QQ', 'JJ', 'AK', 'AKS', 'AQ', 'AJ', 'USA', 'UK', 'LA', 'NYC',
    'TV', 'VIP', 'POV', 'AI', 'CEO', 'NBA', 'NFL', 'UFC', 'MMA', 'II', 'III', 'IV',
    'TCHLIVE', 'POKERGO', 'WSOPC',
]);

const LOWER_WORDS = new Set(['vs', 'vs.']);

function capitalizeWord(word, shouting) {
    if (!word || /^[@#]/.test(word) || /^https?:/i.test(word)) return word;
    if (LOWER_WORDS.has(word.toLowerCase())) return word.toLowerCase();
    // One shouted word inside a normal title ("This Is A BRUTAL Cooler") is
    // recased too, unless it is a known abbreviation.
    const letters = word.replace(/[^\p{L}]/gu, '');
    const lowerFirst = shouting || (letters.length >= 3 && letters === letters.toUpperCase() && !/\p{N}/u.test(word));
    return word.split(/([-/])/).map(part => {
        if (part === '-' || part === '/') return part;
        const bare = part.replace(/[^\p{L}\p{N}]/gu, '');
        if (!bare) return part;
        let next = part;
        if (lowerFirst && !/\p{N}/u.test(bare) && !KEEP_UPPER.has(bare.toUpperCase())) {
            next = part.toLowerCase();
        } else if (lowerFirst && KEEP_UPPER.has(bare.toUpperCase())) {
            // A known abbreviation keeps its own casing ("PokerGO", "WSOP").
            return part === part.toLowerCase() ? part.toUpperCase() : part;
        }
        // Capitalize only when the word starts with a letter (leading quotes
        // and brackets allowed), so "2nd" and "$1/$2" keep their shape.
        return next.replace(/^([^\p{L}\p{N}]*)(\p{L})/u, (_match, lead, letter) => `${lead}${letter.toUpperCase()}`);
    }).join('');
}

/**
 * Display title: emoji, hashtags and repeated punctuation removed, then Title
 * Case (Dan, 2026-08-21: the first letter of every word is capitalized on
 * every forward-facing page). An ALL CAPS title is recased; known poker
 * abbreviations stay upper case.
 */
export function cleanVideoTitle(raw) {
    const original = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!original) return '';
    let text = original.replace(PICTOGRAPHIC_RE, '');
    const withoutTags = text.replace(HASHTAG_RE, ' ');
    if (/\p{L}/u.test(withoutTags)) text = withoutTags;
    text = text
        .replace(/!{2,}/g, '!')
        .replace(/\?{2,}/g, '?')
        .replace(/\.{4,}/g, '...')
        .replace(/\s+([!?,.])/g, '$1')
        .replace(/\(\s*\)/g, '')
        .replace(/\s+/g, ' ')
        .replace(EDGE_SEPARATORS_RE, '')
        .trim();
    if (!/\p{L}/u.test(text)) return original;

    const letters = text.replace(/[^\p{L}]/gu, '');
    const upper = letters.replace(/[^\p{Lu}]/gu, '').length;
    const shouting = letters.length >= 8 && upper / letters.length > 0.6;
    return text.split(' ').map(word => capitalizeWord(word, shouting)).join(' ');
}

export function durationSeconds(duration) {
    const parts = String(duration || '').split(':').map(Number);
    if (!parts.length || parts.some(part => !Number.isFinite(part))) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0);
}

/**
 * Two rows are the same clip when the same channel posted the same title at
 * the same short length (reposted clips: Phil Galfond's 9-10 second shorts
 * appeared three times each). Long sessions that share a series title, such
 * as "Houston TCH LIVE $1/2 NLH CASH GAME", are different streams and are
 * never merged.
 */
export function videoDuplicateKey(video) {
    const seconds = durationSeconds(video?.duration);
    if (!seconds || seconds > 600) return null;
    const title = String(video?.title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (!title) return null;
    return `${String(video?.source || '').toLowerCase()}|${title}|${Math.round(seconds / 10)}`;
}

/** Keeps the first row of each duplicate group, preserving order. */
export function dedupeVideos(list, seenKeys = new Set()) {
    return (Array.isArray(list) ? list : []).filter(video => {
        const key = videoDuplicateKey(video);
        if (!key) return true;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
    });
}

/**
 * Thumbnail ladder. Feed and live cards request the publisher's largest
 * YouTube preview first, with a bounded fallback for missing resolutions.
 * Smaller secondary shelves use 640px previews; Shorts keep original aspect.
 * A missing size falls down the ladder, then to a trusted catalog image.
 */
export const THUMBNAIL_SIZES = Object.freeze({ card: 'maxresdefault', small: 'sddefault', vertical: 'oar2' });
const THUMBNAIL_LADDER = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'];
const YOUTUBE_IMAGE_RE = /^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\//;

export function youtubeThumbnail(videoId, size = THUMBNAIL_SIZES.card) {
    return `https://i.ytimg.com/vi/${videoId}/${size}.jpg`;
}

/** Every image to try for one video, best first, no repeats. */
export function thumbnailCandidates(videoId, { size = THUMBNAIL_SIZES.card, vertical = false, catalogThumbnail = null } = {}) {
    const list = [];
    if (vertical) list.push(youtubeThumbnail(videoId, THUMBNAIL_SIZES.vertical));
    const start = THUMBNAIL_LADDER.indexOf(vertical ? 'hqdefault' : size);
    THUMBNAIL_LADDER.slice(Math.max(0, start)).forEach(step => list.push(youtubeThumbnail(videoId, step)));
    if (YOUTUBE_IMAGE_RE.test(String(catalogThumbnail || ''))) list.push(String(catalogThumbnail));
    return [...new Set(list)];
}

/** The next image after `currentSrc`, or null when every option failed. */
export function nextThumbnailFallback(currentSrc, candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    const index = list.indexOf(String(currentSrc || ''));
    return index >= 0 && index < list.length - 1 ? list[index + 1] : null;
}

/**
 * Rows a viewer should never see in a feed: uploads titled only with emoji
 * (nothing to read), and channel test streams ("Testing...Testing"). Measured
 * 2026-10-12: four such rows among the poker videos.
 */
export function isDisplayableVideoTitle(raw) {
    const text = String(raw ?? '').trim();
    if (!/[\p{L}\p{N}]/u.test(text.replace(PICTOGRAPHIC_RE, ''))) return false;
    return !/^(?:test(?:ing)?[\s.!,-]*){1,4}$/i.test(text);
}

/**
 * A video filed as a cash game or tournament whose title names a casino table
 * game is not poker. Measured 2026-10-12 on the live video sitemap: four
 * blackjack videos from one poker channel were filed as cash games and showed
 * as "A Cash Game Video". "Slots" is deliberately not on this list: it matched
 * only poker titles ("Top Set vs a Slots Player"). The Slots chip has its own
 * type and is never filtered by this rule.
 */
const CASINO_GAME_TITLE_RE = /black\s?jack|roulette|baccarat|\bcraps\b/i;

export function isCasinoGameFiledAsPoker(video) {
    if (!VIDEO_LIBRARY_POKER_TYPES.includes(video?.type)) return false;
    return CASINO_GAME_TITLE_RE.test(String(video?.rawTitle ?? video?.title ?? ''));
}

/** Every feed rule in one call: readable title, mixed-content channel rule, poker rows that are poker. */
export function isCuratedFeedVideo(video) {
    return isDisplayableVideoTitle(video?.rawTitle ?? video?.title)
        && isMixedContentAllowed(video)
        && !isCasinoGameFiledAsPoker(video);
}
