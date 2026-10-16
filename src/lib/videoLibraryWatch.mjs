/**
 * Video Library watch pages (owner plan 2026-10-12, Phase 2 of 8).
 *
 * Every video gets its own server-rendered page at
 *   /hub/video-library/watch/<youtube id>/<title-slug>
 * so search engines can list it and a shared link previews as that video.
 * The page, the library's share button, the library cards and the video
 * sitemap all build the address here, so they cannot disagree.
 *
 * Pure functions only: the page, the sitemap and the tests import this file.
 */

import {
    VIDEO_LIBRARY_POKER_TYPES,
    cleanVideoTitle,
    durationSeconds,
    isCuratedFeedVideo,
} from './videoLibraryCuration.mjs';

import { buildVideoLibraryBreadcrumbs } from './videoLibraryBreadcrumbs.mjs';

export const SITE_URL = 'https://smarter.poker';
export const WATCH_BASE_PATH = '/hub/video-library/watch';

/** Columns every server read of a catalog row asks for. */
export const VIDEO_ROW_FIELDS = 'youtube_video_id, source_id, source_name, type, title, thumbnail_url, views_text, views_count, duration, published_at, scraped_at, tags, availability_status, embeddable, availability_checked_at, attribution_name, attribution_url, disclosure_kind, sponsor_name, made_for_kids';

/** One catalog row in the shape the page and the APIs use. */
export function normaliseVideoRow(row) {
    return {
        id: row.youtube_video_id,
        videoId: row.youtube_video_id,
        source: row.source_id,
        sourceName: row.attribution_name || row.source_name || row.source_id,
        attributionName: row.attribution_name || row.source_name || row.source_id,
        attributionUrl: row.attribution_url || null,
        disclosureKind: row.disclosure_kind || 'organic',
        sponsorName: row.sponsor_name || null,
        madeForKids: row.made_for_kids ?? null,
        type: row.type || 'cash',
        title: cleanVideoTitle(row.title),
        rawTitle: row.title,
        views: row.views_text && row.views_text !== '0' ? row.views_text : String(row.views_count || ''),
        viewsCount: Number(row.views_count || 0),
        duration: row.duration || '',
        thumbnail: row.thumbnail_url || `https://i.ytimg.com/vi/${row.youtube_video_id}/hqdefault.jpg`,
        publishedAt: row.published_at,
        scrapedAt: row.scraped_at,
        tags: Array.isArray(row.tags) ? row.tags : [],
        availabilityStatus: row.availability_status,
        embeddable: row.embeddable === true,
        availabilityCheckedAt: row.availability_checked_at,
        _sortKey: row.published_at,
    };
}

/** "Huge Pot vs Negreanu!" -> "huge-pot-vs-negreanu". Never empty. */
export function videoSlug(title) {
    let slug = String(title || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (slug.length > 80) {
        slug = slug.slice(0, 81);
        slug = slug.includes('-') ? slug.slice(0, slug.lastIndexOf('-')) : slug.slice(0, 80);
    }
    return slug || 'video';
}

export function watchPath(video) {
    const id = String(video?.videoId || video?.id || '');
    return `${WATCH_BASE_PATH}/${encodeURIComponent(id)}/${videoSlug(video?.title || video?.rawTitle)}`;
}

export function watchUrl(video) {
    return `${SITE_URL}${watchPath(video)}`;
}

/** 3725 -> "PT1H2M5S" (ISO 8601, what Google reads for a video). */
export function isoDuration(seconds) {
    const number = Number(seconds);
    if (!Number.isFinite(number) || number <= 0) return null;
    const total = Math.round(number);
    if (!total) return null;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${secs || (!hours && !minutes) ? `${secs}S` : ''}`;
}

/** 3725 -> "1 Hour 2 Minutes", 45 -> "45 Seconds". */
export function readableDuration(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (!total) return '';
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (!hours && !minutes) return `${total} Second${total === 1 ? '' : 's'}`;
    return [
        hours ? `${hours} Hour${hours === 1 ? '' : 's'}` : '',
        minutes ? `${minutes} Minute${minutes === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(' ');
}

export const VIDEO_TYPE_LABELS = Object.freeze({
    cash: 'Cash Game',
    tournament: 'Tournament',
    slots: 'Casino And Slots',
    sports: 'Sports',
});

export function readableDate(value) {
    const time = new Date(value || 0).getTime();
    if (!Number.isFinite(time) || time <= 0) return '';
    return new Date(time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Only facts the catalog holds: title, channel, type, date, length. No topic
 * or stakes claims, because the enrichment that would supply them is still an
 * unreviewed machine "candidate" for almost every row (measured 2026-10-12:
 * 2,483 of 2,548 poker rows). Written in Title Case (owner rule 2026-08-21).
 */
export function buildWatchDescription(video, channelName) {
    const label = VIDEO_TYPE_LABELS[video?.type] || 'Poker';
    const parts = [`Watch ${video?.title || 'This Video'}`];
    const by = channelName ? ` From ${channelName}` : '';
    const date = readableDate(video?.publishedAt);
    parts.push(`A ${label} Video${by}${date ? `, Published ${date}` : ''}`);
    const length = readableDuration(durationSeconds(video?.duration));
    if (length) parts.push(`Runs ${length}`);
    parts.push('Free To Watch On Smarter.Poker, With Watch Later, Playlists And Training Drills Matched To The Video');
    // Join as sentences without doubling a title's own "!" or "?".
    return parts
        .map(part => (/[.!?]$/.test(part) ? part : `${part}.`))
        .join(' ')
        .slice(0, 300);
}

/** Sports and slots videos get a page (shared links work) but are not indexed. */
export function isIndexableWatchVideo(video) {
    return VIDEO_LIBRARY_POKER_TYPES.includes(video?.type) && isCuratedFeedVideo(video);
}

/** Provider publication time only; a scrape timestamp is not an upload date. */
export function videoPublicationDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
    const date = new Date(value);
    const day = value.slice(0, 10);
    const calendar = new Date(`${day}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= 0 || !Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day) return null;
    return date.toISOString();
}

/** One factual image URL shared by watch-page metadata and the video sitemap. */
export function videoThumbnailUrl(video) {
    const image = String(video?.thumbnail || '');
    return /^https:\/\/(?:i\.ytimg\.com|img\.youtube\.com)\//.test(image)
        ? image : `https://i.ytimg.com/vi/${video?.videoId}/hqdefault.jpg`;
}

/** Only emit Google's video entity when its required publication fact exists. */
export function buildVideoObject(video, { channelName, description } = {}) {
    const uploadDate = videoPublicationDate(video?.publishedAt);
    if (!uploadDate || !video?.title || !/^[A-Za-z0-9_-]{11}$/.test(video?.videoId || '')) return null;
    const seconds = durationSeconds(video.duration);
    const url = watchUrl(video);
    const thumbnail = videoThumbnailUrl(video);
    const videoObject = {
        '@type': 'VideoObject',
        '@id': `${url}#video`,
        name: video.title,
        description,
        thumbnailUrl: [thumbnail],
        uploadDate,
        duration: isoDuration(seconds) || undefined,
        embedUrl: `https://www.youtube-nocookie.com/embed/${video.videoId}`,
        url,
        ...(channelName ? { author: { '@type': 'Organization', name: channelName, ...(video.attributionUrl ? { url: video.attributionUrl } : {}) } } : {}),
        ...(Number.isSafeInteger(video.viewsCount) && video.viewsCount > 0 ? {
            interactionStatistic: {
                '@type': 'InteractionCounter',
                interactionType: { '@type': 'WatchAction' },
                userInteractionCount: video.viewsCount,
            },
        } : {}),
        publisher: { '@type': 'Organization', name: 'Smarter.Poker', url: SITE_URL },
    };
    return videoObject;
}

export function buildVideoJsonLd(video, options = {}) {
    const videoObject = buildVideoObject(video, options);
    const breadcrumbs = buildVideoLibraryBreadcrumbs([
        ['World Hub', '/hub'],
        ['Video Library', '/hub/video-library'],
        [video.title, watchUrl(video)],
    ]);
    return [videoObject, breadcrumbs].filter(Boolean);
}

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
export function xmlEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => XML_ESCAPES[char]);
}

/** One <url> entry of the video sitemap (Google video sitemap extension). */
export function videoSitemapEntry(video, channelName) {
    const seconds = durationSeconds(video.duration);
    const published = videoPublicationDate(video.publishedAt);
    const lines = [
        '  <url>',
        `    <loc>${xmlEscape(watchUrl(video))}</loc>`,
        '    <video:video>',
        `      <video:thumbnail_loc>${xmlEscape(videoThumbnailUrl(video))}</video:thumbnail_loc>`,
        `      <video:title>${xmlEscape(video.title)}</video:title>`,
        `      <video:description>${xmlEscape(buildWatchDescription(video, channelName))}</video:description>`,
        `      <video:player_loc>${xmlEscape(`https://www.youtube-nocookie.com/embed/${video.videoId}`)}</video:player_loc>`,
        ...(seconds > 0 && seconds <= 28800 ? [`      <video:duration>${seconds}</video:duration>`] : []),
        ...(published ? [`      <video:publication_date>${published}</video:publication_date>`] : []),
        ...(channelName ? [`      <video:uploader>${xmlEscape(channelName)}</video:uploader>`] : []),
        '    </video:video>',
        '  </url>',
    ];
    return lines.join('\n');
}
