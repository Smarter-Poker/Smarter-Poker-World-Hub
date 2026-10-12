/**
 * Video Library card copy, shared by the library page and the watch pages.
 */
import { VIDEO_LIBRARY_SOURCES as SOURCES } from '../data/videoLibraryCompatibility';

// YouTube-style card copy (owner update 2026-10-11). Creator uploads carry a
// UUID as their source id and the catalog falls back to that id when the row
// has no attribution name, which put raw database ids under every creator
// video. A channel line shows a real name or a plain fallback, never an id.
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getVideoChannel(video) {
    const sourceId = String(video?.source || '');
    const known = SOURCES.find(source => source?.id && source.id !== 'ALL'
        && source.id.toUpperCase() === sourceId.toUpperCase());
    const name = [known?.name, video?.attributionName, video?.sourceName, sourceId.replace(/_/g, ' ')]
        .map(value => String(value || '').trim())
        .find(value => value && !UUID_LIKE.test(value)) || 'Independent Creator';
    const initials = name.split(/\s+/).map(word => word[0] || '').join('').slice(0, 2).toUpperCase();
    return { name, logo: known?.logo || null, initials };
}

export function formatViewCount(views) {
    const raw = String(views ?? '').trim();
    if (!raw || raw === '0') return '';
    if (/^\d+$/.test(raw)) {
        const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(raw));
        return `${compact} Views`;
    }
    return /views?$/i.test(raw) ? raw.replace(/views?$/i, match => match[0].toUpperCase() + match.slice(1)) : `${raw} Views`;
}

export function formatVideoAge(value) {
    const time = new Date(value || 0).getTime();
    if (!Number.isFinite(time) || time <= 0) return '';
    const seconds = Math.max(0, (Date.now() - time) / 1000);
    const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [unit, size] of units) {
        const count = Math.floor(seconds / size);
        if (count >= 1) return `${count} ${unit[0].toUpperCase()}${unit.slice(1)}${count === 1 ? '' : 's'} Ago`;
    }
    return 'Just Now';
}

export function getVideoMetaLine(video) {
    return [getVideoChannel(video).name, formatViewCount(video?.views), formatVideoAge(video?.publishedAt || video?.scrapedAt)]
        .filter(Boolean)
        .join(' \u00b7 ');
}
