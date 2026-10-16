import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
    buildVideoJsonLd,
    buildWatchDescription,
    isIndexableWatchVideo,
    isoDuration,
    normaliseVideoRow,
    readableDuration,
    videoSitemapEntry,
    videoSlug,
    watchPath,
    xmlEscape,
} from '../src/lib/videoLibraryWatch.mjs';

/*
 * Video Library Phase 2 (owner plan 2026-10-12): every video has its own
 * server-rendered page that search engines can list, a video sitemap names
 * them, and the library links and shares them.
 */

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE_PATH = '../pages/hub/video-library/watch/[videoId]/[[...slug]].js';
const WATCH_PAGE = read(PAGE_PATH);
const SITEMAP = read('../pages/sitemap-videos.xml.js');
const LIBRARY = read('../pages/hub/video-library.js');
const ROBOTS = read('../public/robots.txt');

const ROW = {
    youtube_video_id: 'dQw4w9WgXcQ', source_id: 'HCL', type: 'cash',
    title: 'HUGE POT vs NEGREANU!!! \u{1F525} #poker', duration: '18:42',
    published_at: '2026-10-01T12:00:00Z', views_count: 65000,
    availability_status: 'verified', embeddable: true,
};

test('addresses are stable, readable and never empty', () => {
    assert.equal(videoSlug('Huge Pot vs Negreanu!'), 'huge-pot-vs-negreanu');
    assert.equal(videoSlug('Houston TCH Live $1/2 NLH Cash Game'), 'houston-tch-live-1-2-nlh-cash-game');
    assert.equal(videoSlug(''), 'video');
    assert.ok(videoSlug('word '.repeat(40)).length <= 80);
    assert.equal(watchPath({ videoId: 'dQw4w9WgXcQ', title: 'Huge Pot vs Negreanu!' }), '/hub/video-library/watch/dQw4w9WgXcQ/huge-pot-vs-negreanu');
});

test('durations read the way Google and people expect', () => {
    assert.equal(isoDuration(3725), 'PT1H2M5S');
    assert.equal(isoDuration(45), 'PT45S');
    assert.equal(isoDuration(3600), 'PT1H');
    assert.equal(isoDuration(0), null);
    assert.equal(readableDuration(3725), '1 Hour 2 Minutes');
    assert.equal(readableDuration(45), '45 Seconds');
});

test('descriptions state only catalog facts, in Title Case, without doubled punctuation', () => {
    const video = normaliseVideoRow(ROW);
    const text = buildWatchDescription(video, 'Hustler Casino Live');
    assert.equal(text, 'Watch Huge Pot vs Negreanu! A Cash Game Video From Hustler Casino Live, Published October 1, 2026. Runs 18 Minutes. Free To Watch On Smarter.Poker, With Watch Later, Playlists And Training Drills Matched To The Video.');
    assert.doesNotMatch(text, /stakes|concept|topic/i);
});

test('Google gets a VideoObject and breadcrumbs for each page', () => {
    const video = normaliseVideoRow(ROW);
    const [object, crumbs] = buildVideoJsonLd(video, { channelName: 'Hustler Casino Live', description: 'D' });
    assert.equal(object['@type'], 'VideoObject');
    assert.equal(object.duration, 'PT18M42S');
    assert.equal(object.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    assert.equal(object.contentUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(object.url, 'https://smarter.poker/hub/video-library/watch/dQw4w9WgXcQ/huge-pot-vs-negreanu');
    assert.equal(object.interactionStatistic.userInteractionCount, 65000);
    assert.equal(crumbs['@type'], 'BreadcrumbList');
    assert.equal(crumbs.itemListElement.length, 3);
});

test('only poker videos are offered to search engines', () => {
    assert.equal(isIndexableWatchVideo(normaliseVideoRow(ROW)), true);
    assert.equal(isIndexableWatchVideo(normaliseVideoRow({ ...ROW, type: 'sports' })), false);
    assert.equal(isIndexableWatchVideo(normaliseVideoRow({ ...ROW, source_id: '6bfb1441-98ed-41d6-929f-e147626dbffa', title: 'Botez Glute Day' })), false);
    assert.match(WATCH_PAGE, /noindex=\{!indexable\}/);
});

test('the video sitemap entry is valid, escaped XML', () => {
    const entry = videoSitemapEntry(normaliseVideoRow(ROW), 'Hustler & Co');
    assert.match(entry, /<loc>https:\/\/smarter\.poker\/hub\/video-library\/watch\/dQw4w9WgXcQ\/huge-pot-vs-negreanu<\/loc>/);
    assert.match(entry, /<video:duration>1122<\/video:duration>/);
    assert.match(entry, /<video:uploader>Hustler &amp; Co<\/video:uploader>/);
    assert.equal(xmlEscape(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
});

test('the watch page renders on the server from the gated catalog and 404s anything else', () => {
    assert.ok(existsSync(new URL(PAGE_PATH, import.meta.url)));
    assert.match(WATCH_PAGE, /export async function getServerSideProps/);
    assert.match(WATCH_PAGE, /from\('video_library_public_catalog'\)/);
    assert.match(WATCH_PAGE, /YOUTUBE_VIDEO_ID_RE\.test\(videoId\) \|\| BLOCKED_VIDEO_LIBRARY_IDS\.includes\(videoId\)/);
    assert.match(WATCH_PAGE, /!isVideoLibraryVideoAllowed\(video\) \|\| !isCuratedFeedVideo\(video\)/);
    assert.match(WATCH_PAGE, /return \{ notFound: true \}/);
    // A catalog outage is a 503 that says "come back", never a cached 404.
    assert.match(WATCH_PAGE, /res\.statusCode = 503/);
    // The head is not behind a client-only wrapper, and the YouTube player
    // loads only when the viewer presses play.
    assert.doesNotMatch(WATCH_PAGE, /PageTransition/);
    assert.match(WATCH_PAGE, /canonical=\{canonical\}/);
    assert.match(WATCH_PAGE, /className="vl-play-facade"/);
    assert.match(WATCH_PAGE, /\{playing \? \(\s*<iframe/);
});

test('the library links, shares and lists the watch pages', () => {
    assert.match(LIBRARY, /href=\{watchPath\(video\)\}/);
    assert.match(LIBRARY, /event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey\) return;/);
    assert.match(LIBRARY, /\$\{watchPath\(video\)\}`;/);
    assert.match(SITEMAP, /\.in\('type', VIDEO_LIBRARY_POKER_TYPES\)/);
    assert.match(SITEMAP, /\.or\(mixedContentFilter\(\)\)/);
    assert.match(SITEMAP, /res\.statusCode = 503/);
    assert.match(ROBOTS, /^Sitemap: https:\/\/smarter\.poker\/sitemap-videos\.xml$/m);
});

test('the About section channel link is a 44px phone tap target', () => {
    const css = readFileSync(new URL('../src/styles/worlds/video-library.css', import.meta.url), 'utf8');
    const rule = css.match(/\.vl-watch-about a \{([^}]*)\}/);
    assert.ok(rule, 'About link rule exists');
    assert.match(rule[1], /min-height: 44px/);
});

test('the watch page thumbnail fills the player with no black band', () => {
    const css = readFileSync(new URL('../src/styles/worlds/video-library.css', import.meta.url), 'utf8');
    const rule = css.match(/\.vl-watch-page \.vl-player-stage > \.vl-play-facade > img:not\(\[hidden\]\) \{([^}]*)\}/);
    assert.ok(rule, 'facade image rule outranks the site-wide img height reset');
    assert.match(rule[1], /position: absolute;/);
    assert.match(rule[1], /inset: 0;/);
    assert.match(rule[1], /object-fit: cover;/);
});

test('channel and player detail pages provide VideoObject ItemList structured data', async () => {
    const { buildChannelJsonLd } = await import('../src/lib/videoLibraryChannels.mjs');
    const { buildPlayerJsonLd } = await import('../src/lib/videoLibraryPlayers.mjs');

    const channel = { id: 'HCL', name: 'Hustler Casino Live', description: 'Verified Videos', path: '/hub/video-library/channels/HCL', logo: '/hcl.webp', externalUrl: 'https://youtube.com/@Hustler' };
    const videos = [{ videoId: 'abc12345678', title: 'Epic Hand', thumbnail: 'https://img.youtube.com/vi/abc12345678/hqdefault.jpg' }];

    const [org, cBreadcrumbs, cItemList] = buildChannelJsonLd(channel, videos);
    assert.equal(org['@type'], 'Organization');
    assert.equal(org.name, 'Hustler Casino Live');
    assert.equal(cBreadcrumbs['@type'], 'BreadcrumbList');
    assert.equal(cItemList['@type'], 'ItemList');
    assert.equal(cItemList.itemListElement[0].item['@type'], 'VideoObject');
    assert.equal(cItemList.itemListElement[0].item.name, 'Epic Hand');

    const player = { id: 'phil-ivey', name: 'Phil Ivey', path: '/hub/video-library/players/phil-ivey' };
    const [person, pBreadcrumbs, pItemList] = buildPlayerJsonLd(player, videos);
    assert.equal(person['@type'], 'Person');
    assert.equal(person.name, 'Phil Ivey');
    assert.equal(pBreadcrumbs['@type'], 'BreadcrumbList');
    assert.equal(pItemList['@type'], 'ItemList');
    assert.equal(pItemList.itemListElement[0].item['@type'], 'VideoObject');
});

