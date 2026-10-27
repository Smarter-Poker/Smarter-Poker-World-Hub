/**
 * VIDEO SITEMAP - /sitemap-videos.xml
 *
 * Owner plan 2026-10-12, Phase 2 of 8. Lists every poker video watch page
 * (/hub/video-library/watch/<id>/<slug>) with Google's video sitemap fields,
 * so search engines find each video without crawling the library app.
 * robots.txt names this file next to /sitemap.xml.
 *
 * Built from the same verified public catalog and the same curation rules as
 * the library feed: cash games and tournaments only, mixed-content channels
 * only for poker titles, unreadable titles and test streams left out. A page
 * this file lists is a page that renders (pages/hub/video-library/watch).
 *
 * lastmod is the video's publication date, real change evidence, never the
 * time the file was generated (AEO phase 1 rule in pages/sitemap.xml.js).
 */
import { BLOCKED_VIDEO_LIBRARY_IDS, isVideoLibraryVideoAllowed } from '../src/lib/videoLibraryAvailability';
import { VIDEO_LIBRARY_POKER_TYPES, isCuratedFeedVideo, mixedContentFilter } from '../src/lib/videoLibraryCuration.mjs';
import { VIDEO_ROW_FIELDS, normaliseVideoRow, videoSitemapEntry } from '../src/lib/videoLibraryWatch.mjs';
import { getVideoChannel } from '../src/lib/videoLibraryCards';
import { sendSitemapXmlResponse } from '../src/lib/seo/sitemapBuilders.mjs';

const PAGE_SIZE = 1000;
// Google accepts 50,000 entries per sitemap file; stop well before it.
const MAX_ENTRIES = 40000;

async function fetchPokerVideos() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Service role only: the public catalog view is not granted to the anon
    // role (checked 2026-10-12), so a public-key fallback would always fail.
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('catalog configuration unavailable');
    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const rows = [];
    for (let from = 0; from < MAX_ENTRIES; from += PAGE_SIZE) {
        const { data, error } = await db
            .from('video_library_public_catalog')
            .select(VIDEO_ROW_FIELDS)
            .in('type', VIDEO_LIBRARY_POKER_TYPES)
            .not('youtube_video_id', 'in', `(${BLOCKED_VIDEO_LIBRARY_IDS.join(',')})`)
            .or(mixedContentFilter())
            .order('youtube_video_id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        const page = Array.isArray(data) ? data : [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
    }
    return rows
        .map(normaliseVideoRow)
        .filter(video => isVideoLibraryVideoAllowed(video) && isCuratedFeedVideo(video));
}

function buildVideoSitemapXml(videos) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${videos.map(video => videoSitemapEntry(video, getVideoChannel(video).name)).join('\n')}
</urlset>`;
}

export async function getServerSideProps({ req, res }) {
    try {
        const videos = await fetchPokerVideos();
        res.setHeader('Content-Type', 'text/xml');
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=21600');
        sendSitemapXmlResponse(req, res, buildVideoSitemapXml(videos), {
            cacheControl: 'public, s-maxage=3600, stale-while-revalidate=21600',
        });
        return { props: {} };
    } catch (error) {
        // An empty sitemap would tell search engines every video page is gone.
        // A 503 tells them to come back.
        console.warn('[sitemap-videos] catalog read failed:', error?.message || error);
        res.statusCode = 503;
        res.setHeader('Retry-After', '600');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'text/plain');
        res.write('Video sitemap temporarily unavailable');
    }
    res.end();
    return { props: {} };
}

export default function VideoSitemap() {
    return null;
}
