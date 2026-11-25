import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { deterministicUuid } from '../../../src/lib/promoCampaigns/welcomeBackOffer.mjs';
import { buildSignedEmailImageUrl } from '../../../src/lib/newsletter/emailImageProxy.mjs';
import * as emailImageProxy from '../../../src/lib/newsletter/emailImageProxy.mjs';
import * as wireCatalog from '../../../src/lib/newsletter/weeklyWireCatalog.mjs';
import * as wireEngine from '../../../src/lib/newsletter/weeklyWireEngine.mjs';
import { VIDEO_ROW_FIELDS, normaliseVideoRow, watchPath } from '../../../src/lib/videoLibraryWatch.mjs';
import { isVideoLibraryVideoAllowed } from '../../../src/lib/videoLibraryAvailability.js';
import {
    dedupeVideos,
    isCasinoGameFiledAsPoker,
    isDisplayableVideoTitle,
} from '../../../src/lib/videoLibraryCuration.mjs';

const UUID_SHAPE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALLBACK_THUMB_SRC = '/api/news/email-image?fallback=1&m=thumb';
const FALLBACK_HERO_SRC = '/api/news/email-image?fallback=1&m=hero';
// File-extension label: kept as a constant because ".ics" is a literal extension, not prose.
const CALENDAR_ICS_LABEL = 'Add To Calendar (.ics)';
const KINGS_CLUB_ID = 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4';

function isWeeklyWireCampaign(row) {
    return wireEngine.isWeeklyWireDigestCampaign(row);
}

function serializeSpot(spot) {
    if (!spot) return null;
    return {
        slug: String(spot.slug),
        category: cleanCopy(spot.category || 'GTO Decision Spot'),
        title: cleanCopy(spot.title),
        situation: cleanCopy(spot.situation),
        options: (spot.options || []).map((o) => ({
            key: String(o.key),
            label: cleanCopy(o.label),
        })),
        correctKey: String(spot.correctKey || 'A'),
        solverFrequency: cleanCopy(spot.solverFrequency || 'GTO Solver Preferred Line'),
        evSummary: cleanCopy(spot.evSummary || ''),
        targetUrl: String(spot.targetUrl || 'https://smarter.poker/hub/training/hand-lab'),
    };
}

function serializeVideo(video) {
    if (!video || !video.videoId) return null;
    const rawWatch = String(video.watchPath || '/hub/video-library');
    return {
        videoId: String(video.videoId),
        title: cleanCopy(video.title || 'Featured Poker Video'),
        sourceName: cleanCopy(video.sourceName || 'Smarter.Poker Video Library'),
        duration: cleanCopy(video.duration || ''),
        views: cleanCopy(video.views || ''),
        thumbnailUrl: buildSignedEmailImageUrl(video.thumbnailUrl || '', {
            relative: true,
            mode: 'thumb',
        }),
        watchPath: rawWatch.startsWith('/') ? rawWatch : '/hub/video-library',
    };
}

async function resolveMatchedHistoricalVideo(sb, idSet) {
    if (!idSet || idSet.size === 0 || typeof wireEngine.videoMarkerUuid !== 'function') return null;
    try {
        const { data } = await sb
            .from('video_library_public_catalog')
            .select(VIDEO_ROW_FIELDS)
            .in('type', ['cash', 'tournament'])
            .order('views_count', { ascending: false })
            .order('scraped_at', { ascending: false })
            .limit(80);
        const candidates = dedupeVideos(
            (data || [])
                .map((row) => normaliseVideoRow(row))
                .filter((v) => isVideoLibraryVideoAllowed(v) && isDisplayableVideoTitle(v.rawTitle ?? v.title) && !isCasinoGameFiledAsPoker(v))
        );
        const found = candidates.find((v) => idSet.has(wireEngine.videoMarkerUuid(v.videoId)));
        if (!found) return null;
        return serializeVideo({
            videoId: found.videoId,
            title: found.title,
            sourceName: found.sourceName,
            duration: found.duration,
            views: found.views,
            thumbnailUrl: found.thumbnail,
            watchPath: watchPath(found),
        });
    } catch {
        return null;
    }
}

function parseSubjectEditionNumber(subject) {
    const match = String(subject || '').match(/wire\s*#(\d+)/i);
    if (!match) return null;
    const n = parseInt(match[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanCopy(str) {
    return String(str || '').replace(/[—–]/g, '-').trim();
}

function computeSpotUuid(slug) {
    if (typeof wireEngine.spotMarkerUuid === 'function') {
        return wireEngine.spotMarkerUuid(slug);
    }
    return deterministicUuid(`sp-spot:${String(slug || '').trim().toLowerCase()}`);
}

function formatPublishedDate(iso) {
    if (!iso) return 'Live Curated Edition';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Live Curated Edition';
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

function formatChips(n) {
    return Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-US');
}

function describeBuyIn(row) {
    const buyIn = Number(row?.buy_in_amount || 0);
    const fee = Number(row?.buy_in_fee || 0);
    if (buyIn <= 0 && fee <= 0) return 'Freeroll';
    return fee > 0 ? `${formatChips(buyIn)} + ${formatChips(fee)} Chips` : `${formatChips(buyIn)} Chips`;
}

async function loadKingsClubSchedule(sb) {
    try {
        const nowIso = new Date().toISOString();
        const { data } = await sb
            .from('tournaments')
            .select('id, name, game_type, buy_in_amount, buy_in_fee, guaranteed_prize, start_time, status')
            .eq('club_id', KINGS_CLUB_ID)
            .in('status', ['ANNOUNCED', 'RUNNING', 'SCHEDULED'])
            .gte('start_time', nowIso)
            .order('start_time', { ascending: true })
            .limit(3);
        return (data || [])
            .filter((t) => t && t.id && t.name && t.start_time)
            .slice(0, 3)
            .map((t) => ({
                id: String(t.id),
                name: cleanCopy(t.name),
                gameType: cleanCopy(String(t.game_type || 'Poker').replace(/_/g, ' ')),
                buyInLabel: describeBuyIn(t),
                guaranteeLabel: Number(t.guaranteed_prize || 0) > 0 ? `${formatChips(t.guaranteed_prize)} Chips GTD` : '',
                startTime: new Date(t.start_time).toISOString(),
                status: String(t.status || ''),
            }));
    } catch {
        return [];
    }
}

function formatTournamentStart(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })} CT`;
}

export async function getServerSideProps(ctx) {
    const result = await getWireIssueProps(ctx);
    if (result?.props?.issue) {
        let kingsSchedule = [];
        try {
            kingsSchedule = await loadKingsClubSchedule(createClient());
        } catch {
            kingsSchedule = [];
        }
        return { ...result, props: { ...result.props, kingsSchedule } };
    }
    return result;
}

async function getWireIssueProps({ params, res }) {
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

    const rawParam = String(params?.edition || '').trim().toLowerCase();
    const isLatestAlias = rawParam === 'latest' || rawParam === 'current';
    const parsedNum = /^\d+$/.test(rawParam) ? parseInt(rawParam, 10) : null;
    const isUuidParam = UUID_SHAPE_RE.test(rawParam);

    if (!isLatestAlias && !parsedNum && !isUuidParam) {
        return { notFound: true };
    }

    const updatesCatalog = wireCatalog.PLATFORM_UPDATES_CATALOG || [];
    const toolsCatalog = wireCatalog.TOOL_SPOTLIGHT_CATALOG || [];
    const spotsCatalog = wireCatalog.SPOT_OF_THE_WEEK_CATALOG || [];

    try {
        const sb = createClient();
        const { data: rows } = await sb
            .from('newsletter_campaigns')
            .select('id, subject, status, article_ids, recipient_count, sent_count, completed_at, created_at')
            .in('status', ['sent', 'partial'])
            .order('created_at', { ascending: true })
            .limit(200);

        const wireRows = (rows || []).filter(isWeeklyWireCampaign);
        const usedNumbers = new Set();
        const indexedCampaigns = wireRows.map((row, idx) => {
            const fromSubj = parseSubjectEditionNumber(row.subject);
            let num = fromSubj && !usedNumbers.has(fromSubj) ? fromSubj : idx + 1;
            while (usedNumbers.has(num)) num += 1;
            usedNumbers.add(num);
            return { ...row, editionNumber: num };
        });

        let matchedCampaign = null;
        if (isUuidParam) {
            matchedCampaign = indexedCampaigns.find((c) => String(c.id).toLowerCase() === rawParam) || null;
        } else if (parsedNum) {
            matchedCampaign = indexedCampaigns.find((c) => c.editionNumber === parsedNum) || null;
        }

        if (matchedCampaign) {
            const editionNumber = matchedCampaign.editionNumber;
            const rawIds = (Array.isArray(matchedCampaign.article_ids) ? matchedCampaign.article_ids : [])
                .map((x) => String(x || '').trim().toLowerCase())
                .filter((x) => UUID_SHAPE_RE.test(x));
            const idSet = new Set(rawIds);

            let newsRows = [];
            if (rawIds.length > 0) {
                // in-list: bounded by slice(0, 100)
                const { data: fetchedNews } = await sb
                    .from('poker_news')
                    .select('id, title, summary, excerpt, content, source_name, source_url, image_url, category, published_at')
                    .in('id', rawIds.slice(0, 100));
                newsRows = fetchedNews || [];
            }

            const newsById = new Map(newsRows.map((r) => [String(r.id).toLowerCase(), r]));
            const orderedNews = rawIds
                .map((id) => newsById.get(id))
                .filter((r) => r && r.category !== 'platform_update')
                .map((r) => {
                    const rawBlurb = r.summary || r.excerpt || r.content || '';
                    const cleanSummary = wireEngine.isEchoingOrEmptyBlurb(r.title, rawBlurb)
                        ? ''
                        : wireEngine.truncateText(cleanCopy(rawBlurb), 200);
                    return {
                        id: String(r.id),
                        title: cleanCopy(r.title),
                        summary: cleanSummary,
                        sourceName: cleanCopy(r.source_name || 'Poker Wire'),
                        imageUrl: buildSignedEmailImageUrl(r.image_url || '', {
                            relative: true,
                            mode: 'thumb',
                        }),
                        category: cleanCopy(String(r.category || 'Poker News').toUpperCase()),
                    };
                });

            const customUpdates = newsRows
                .filter((r) => r && r.category === 'platform_update')
                .map((r) => ({
                    slug: String(r.id),
                    badge: 'Platform Upgrade',
                    title: cleanCopy(r.title),
                    summary: cleanCopy(r.summary || r.excerpt || ''),
                    ctaLabel: 'Explore On Smarter.Poker',
                    ctaUrl: String(r.source_url || '/hub').replace(/^https:\/\/smarter\.poker/i, '') || '/hub',
                }));

            const matchedCatalogUpdates = updatesCatalog.filter((u) =>
                idSet.has(wireEngine.updateMarkerUuid(u.slug))
            );
            const fallbackUpdates = updatesCatalog.slice(
                ((editionNumber - 1) * 2) % Math.max(1, updatesCatalog.length),
                (((editionNumber - 1) * 2) % Math.max(1, updatesCatalog.length)) + 2
            );
            const platformUpdates = (
                customUpdates.length + matchedCatalogUpdates.length > 0
                    ? [...customUpdates, ...matchedCatalogUpdates]
                    : fallbackUpdates
            ).map((u) => ({
                slug: String(u.slug),
                badge: cleanCopy(u.badge || 'Platform Upgrade'),
                title: cleanCopy(u.title),
                summary: cleanCopy(u.summary),
                ctaLabel: cleanCopy(u.ctaLabel || 'Open On Smarter.Poker'),
                ctaUrl: cleanCopy(u.ctaUrl || 'https://smarter.poker/hub'),
            }));

            const matchedSpot =
                spotsCatalog.find((s) => idSet.has(computeSpotUuid(s.slug)) || idSet.has(deterministicUuid(`spot:${s.slug}`))) ||
                (spotsCatalog.length > 0 ? spotsCatalog[(editionNumber - 1) % spotsCatalog.length] : null);

            const matchedTool =
                toolsCatalog.find((t) => idSet.has(wireEngine.toolMarkerUuid(t.slug))) ||
                (toolsCatalog.length > 0 ? toolsCatalog[(editionNumber - 1) % toolsCatalog.length] : null);

            const matchedVideo = await resolveMatchedHistoricalVideo(sb, idSet);

            const leadRawHero =
                newsRows.find((r) => r && r.category !== 'platform_update' && r.image_url)?.image_url || '';

            return {
                props: {
                    issue: {
                        editionNumber,
                        subject: cleanCopy(matchedCampaign.subject || `Smarter.Poker Weekly Wire #${editionNumber}`),
                        publishedAt: matchedCampaign.completed_at || matchedCampaign.created_at || null,
                        isLivePreview: false,
                        ogImageUrl: buildSignedEmailImageUrl(leadRawHero, {
                            siteUrl: 'https://smarter.poker',
                            mode: 'hero',
                        }),
                        platformUpdates,
                        articles: orderedNews,
                        spotOfTheWeek: serializeSpot(matchedSpot),
                        videoOfTheWeek: matchedVideo,
                        toolSpotlight: matchedTool
                            ? {
                                  slug: String(matchedTool.slug),
                                  category: cleanCopy(matchedTool.category || 'Pro Poker Calculator'),
                                  title: cleanCopy(matchedTool.title),
                                  tip: cleanCopy(matchedTool.tip),
                                  url: String(matchedTool.url || 'https://smarter.poker/tools'),
                              }
                            : null,
                    },
                },
            };
        }

        // Fallback to live/current curated Weekly Wire edition when requesting 'latest'
        // or the active upcoming edition number (e.g. from a [TEST] email preview link).
        const maxHistorical = indexedCampaigns.reduce((m, c) => Math.max(m, c.editionNumber), 0);
        if (!isLatestAlias && parsedNum && parsedNum > maxHistorical + 3) {
            return { notFound: true };
        }

        const curated = await wireEngine.curateWeeklyWireEdition(sb, {
            days: 7,
            articleLimit: 5,
            updateLimit: 2,
            enrichMetaDescriptions: false,
        });

        const liveEditionNum = parsedNum || Number(curated?.editionNumber || maxHistorical + 1);
        const liveSpot =
            curated?.spotOfTheWeek ||
            (spotsCatalog.length > 0 ? spotsCatalog[(liveEditionNum - 1) % spotsCatalog.length] : null);
        const liveTool =
            curated?.toolSpotlight ||
            (toolsCatalog.length > 0 ? toolsCatalog[(liveEditionNum - 1) % toolsCatalog.length] : null);

        return {
            props: {
                issue: {
                    editionNumber: liveEditionNum,
                    subject: cleanCopy(curated?.subject || `Smarter.Poker Weekly Wire #${liveEditionNum}`),
                    publishedAt: null,
                    isLivePreview: true,
                    ogImageUrl: buildSignedEmailImageUrl(curated?.articles?.[0]?.image_url || '', {
                        siteUrl: 'https://smarter.poker',
                        mode: 'hero',
                    }),
                    platformUpdates: (curated?.platformUpdates || []).map((u) => ({
                        slug: String(u.slug || u.id || ''),
                        badge: cleanCopy(u.badge || 'Platform Upgrade'),
                        title: cleanCopy(u.title),
                        summary: cleanCopy(u.summary),
                        ctaLabel: cleanCopy(u.ctaLabel || 'Explore On Smarter.Poker'),
                        ctaUrl: cleanCopy(u.ctaUrl || 'https://smarter.poker/hub'),
                    })),
                    articles: (curated?.articles || []).map((a) => ({
                        id: String(a.id),
                        title: cleanCopy(a.title),
                        summary: cleanCopy(a.summary || ''),
                        sourceName: cleanCopy(a.source_name || 'Poker Wire'),
                        imageUrl: buildSignedEmailImageUrl(a.image_url || '', {
                            relative: true,
                            mode: 'thumb',
                        }),
                        category: cleanCopy(String(a.category || 'POKER NEWS')),
                    })),
                    spotOfTheWeek: serializeSpot(liveSpot),
                    videoOfTheWeek: serializeVideo(curated?.videoOfTheWeek || null),
                    toolSpotlight: liveTool
                        ? {
                              slug: String(liveTool.slug),
                              category: cleanCopy(liveTool.category || 'Pro Poker Calculator'),
                              title: cleanCopy(liveTool.title),
                              tip: cleanCopy(liveTool.tip),
                              url: String(liveTool.url || 'https://smarter.poker/tools'),
                          }
                        : null,
                },
            },
        };
    } catch (err) {
        console.warn('[wire/[edition]] SSR fallback:', err?.message || err);
        const fallbackNum = parsedNum || 1;
        const spot = spotsCatalog[0] || null;
        const tool = toolsCatalog[0] || null;
        return {
            props: {
                issue: {
                    editionNumber: fallbackNum,
                    subject: `Smarter.Poker Weekly Wire #${fallbackNum}`,
                    publishedAt: null,
                    isLivePreview: true,
                    platformUpdates: updatesCatalog.slice(0, 2).map((u) => ({
                        slug: u.slug,
                        badge: cleanCopy(u.badge),
                        title: cleanCopy(u.title),
                        summary: cleanCopy(u.summary),
                        ctaLabel: cleanCopy(u.ctaLabel),
                        ctaUrl: u.ctaUrl,
                    })),
                    articles: [],
                    spotOfTheWeek: serializeSpot(spot),
                    toolSpotlight: tool
                        ? {
                              slug: tool.slug,
                              category: cleanCopy(tool.category),
                              title: cleanCopy(tool.title),
                              tip: cleanCopy(tool.tip),
                              url: tool.url,
                          }
                        : null,
                },
            },
        };
    }
}

function toInternalHref(url, fallback = '/hub') {
    const raw = String(url || '').trim();
    if (!raw) return fallback;
    if (raw.startsWith('/')) return raw;
    if (raw.startsWith('https://smarter.poker')) {
        return raw.slice('https://smarter.poker'.length) || '/';
    }
    return fallback;
}

export default function WeeklyWireEditionPage({ issue, kingsSchedule = [] }) {
    const editionNum = Number(issue?.editionNumber || 1);
    const canonicalUrl = `https://smarter.poker/hub/wire/${editionNum}`;
    const metaTitle = `${issue?.subject || `Smarter.Poker Weekly Wire #${editionNum}`} | Smarter.Poker`;
    const metaDesc = `Read Smarter.Poker Weekly Wire Edition #${editionNum}: Platform Upgrades, Solver Spot Of The Week, World Poker News, And Pro Calculator Spotlights.`;
    const ogImageUrl = issue?.ogImageUrl || 'https://smarter.poker/api/news/email-image?fallback=1&m=hero';
    const publishedIso = issue?.publishedAt || null;
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
        url: canonicalUrl,
        headline: String(issue?.subject || `Smarter.Poker Weekly Wire #${editionNum}`).slice(0, 110),
        description: metaDesc,
        image: ogImageUrl,
        ...(publishedIso ? { datePublished: publishedIso, dateModified: publishedIso } : {}),
        author: { '@type': 'Organization', name: 'Smarter.Poker' },
        publisher: { '@type': 'Organization', name: 'Smarter.Poker' },
        isPartOf: {
            '@type': 'CreativeWorkSeries',
            name: 'Smarter.Poker Weekly Wire',
            url: 'https://smarter.poker/hub/wire',
        },
    };

    const spot = issue?.spotOfTheWeek || null;
    const spotImgSrc = spot
        ? emailImageProxy.buildSpotCardImageUrl
            ? emailImageProxy.buildSpotCardImageUrl(spot.slug, { relative: true })
            : FALLBACK_HERO_SRC
        : FALLBACK_HERO_SRC;
    const video = issue?.videoOfTheWeek || null;
    const tool = issue?.toolSpotlight || null;
    const [selectedSpotPick, setSelectedSpotPick] = useState('');

    return (
        <>
            <Head>
                <title>{metaTitle}</title>
                <meta name="description" content={metaDesc} />
                <link key="canonical" rel="canonical" href={canonicalUrl} />
                <meta key="og-type" property="og:type" content="article" />
                <meta key="og-url" property="og:url" content={canonicalUrl} />
                <meta key="og-title" property="og:title" content={metaTitle} />
                <meta key="og-description" property="og:description" content={metaDesc} />
                <meta key="og-image" property="og:image" content={ogImageUrl} />
                <meta key="twitter-card" name="twitter:card" content="summary_large_image" />
                <meta key="twitter-title" name="twitter:title" content={metaTitle} />
                <meta key="twitter-description" name="twitter:description" content={metaDesc} />
                <meta key="twitter-image" name="twitter:image" content={ogImageUrl} />
                <link
                    key="wire-rss"
                    rel="alternate"
                    type="application/rss+xml"
                    title="Smarter.Poker Weekly Wire RSS"
                    href="https://smarter.poker/api/news/wire-rss"
                />
                <script
                    key="wire-jsonld"
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
                />
            </Head>

            <main
                style={{
                    minHeight: '100vh',
                    background: '#05070a',
                    color: '#ffffff',
                    padding: '40px 16px 120px 16px',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                }}
            >
                <article style={{ maxWidth: '760px', margin: '0 auto' }}>
                    <nav
                        aria-label="Weekly Wire Breadcrumb"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px',
                            marginBottom: '18px',
                            fontSize: '13.5px',
                        }}
                    >
                        <Link href="/hub/wire" style={{ color: '#4fc1b3', textDecoration: 'none', fontWeight: 700 }}>
                            &larr; All Weekly Wire Editions
                        </Link>
                        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                            <Link href="/tools" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 700 }}>
                                42 Poker Tools
                            </Link>
                            <Link href="/hub/club-arena/" style={{ color: '#ffffff', textDecoration: 'none', fontWeight: 700 }}>
                                Club Arena
                            </Link>
                        </div>
                    </nav>

                    <header
                        style={{
                            background: '#0b1118',
                            border: '1px solid #1b2c3d',
                            borderRadius: '18px',
                            padding: '30px 26px',
                            marginBottom: '26px',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '10px',
                                marginBottom: '10px',
                            }}
                        >
                            <span
                                style={{
                                    color: '#4fc1b3',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    letterSpacing: '2.8px',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Smarter.Poker Weekly Wire &middot; Edition #{editionNum}
                            </span>
                            <span
                                style={{
                                    background: '#101a24',
                                    border: '1px solid #1b2c3d',
                                    color: '#60a5fa',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    padding: '4px 10px',
                                    borderRadius: '999px',
                                }}
                            >
                                {formatPublishedDate(issue?.publishedAt)}
                            </span>
                        </div>

                        <h1
                            style={{
                                margin: '0 0 12px 0',
                                fontSize: 'clamp(24px, 4vw, 32px)',
                                lineHeight: 1.25,
                                fontWeight: 800,
                                color: '#ffffff',
                            }}
                        >
                            {issue?.subject}
                        </h1>
                        <p style={{ margin: 0, color: '#b7cadc', fontSize: '14.5px', lineHeight: 1.6 }}>
                            Upgrades, Solver Strategy Spots, Storyline-Deduplicated World Poker News, And Pro Calculator Spotlights From Smarter.Poker.
                        </p>
                    </header>

                    {issue?.platformUpdates?.length > 0 && (
                        <section aria-label="Smarter.Poker Platform Upgrades" style={{ marginBottom: '28px' }}>
                            <h2
                                style={{
                                    margin: '0 0 12px 0',
                                    color: '#60a5fa',
                                    fontSize: '13px',
                                    fontWeight: 800,
                                    letterSpacing: '1.8px',
                                    textTransform: 'uppercase',
                                }}
                            >
                                New On Smarter.Poker &middot; Upgrades &amp; Enhancements
                            </h2>
                            <div style={{ display: 'grid', gap: '12px' }}>
                                {issue.platformUpdates.map((u) => (
                                    <div
                                        key={u.slug}
                                        style={{
                                            background: '#0b1118',
                                            border: '1px solid #1b2c3d',
                                            borderRadius: '14px',
                                            padding: '20px 22px',
                                        }}
                                    >
                                        <span
                                            style={{
                                                display: 'inline-block',
                                                background: '#101a24',
                                                border: '1px solid #1b2c3d',
                                                color: '#60a5fa',
                                                fontSize: '11px',
                                                fontWeight: 800,
                                                letterSpacing: '1px',
                                                textTransform: 'uppercase',
                                                padding: '3px 10px',
                                                borderRadius: '999px',
                                            }}
                                        >
                                            {u.badge}
                                        </span>
                                        <h3 style={{ margin: '10px 0 6px 0', fontSize: '18px', fontWeight: 800, color: '#ffffff', lineHeight: 1.3 }}>
                                            {u.title}
                                        </h3>
                                        <p style={{ margin: '0 0 12px 0', color: '#b7cadc', fontSize: '14px', lineHeight: 1.55 }}>
                                            {u.summary}
                                        </p>
                                        <Link
                                            href={toInternalHref(u.ctaUrl, '/hub')}
                                            style={{ color: '#4fc1b3', fontSize: '13.5px', fontWeight: 800, textDecoration: 'none' }}
                                        >
                                            {u.ctaLabel} &rarr;
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {spot && (
                        <section
                            aria-label="Solver Spot Of The Week"
                            style={{
                                background: '#101a24',
                                border: '1px solid #1b2c3d',
                                borderLeft: '4px solid #4fc1b3',
                                borderRadius: '16px',
                                padding: '24px 22px',
                                marginBottom: '28px',
                            }}
                        >
                            <div
                                style={{
                                    color: '#4fc1b3',
                                    fontSize: '11.5px',
                                    fontWeight: 800,
                                    letterSpacing: '1.8px',
                                    textTransform: 'uppercase',
                                    marginBottom: '6px',
                                }}
                            >
                                Spot Of The Week &middot; {spot.category}
                            </div>
                            <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 800, color: '#ffffff', lineHeight: 1.3 }}>
                                {spot.title}
                            </h2>
                            <img
                                src={spotImgSrc}
                                alt={`Spot Of The Week Card: ${spot.title}`}
                                width={600}
                                height={240}
                                loading="lazy"
                                onError={(e) => {
                                    if (!e.currentTarget.dataset.fb) {
                                        e.currentTarget.dataset.fb = '1';
                                        e.currentTarget.src = FALLBACK_HERO_SRC;
                                    }
                                }}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    maxWidth: '600px',
                                    height: 'auto',
                                    aspectRatio: '600 / 240',
                                    objectFit: 'cover',
                                    borderRadius: '12px',
                                    border: '1px solid #1b2c3d',
                                    background: '#0b1520',
                                    margin: '0 0 14px 0',
                                }}
                            />
                            <p style={{ margin: '0 0 16px 0', color: '#d0deec', fontSize: '14.5px', lineHeight: 1.6 }}>
                                {spot.situation}
                            </p>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {(spot.options || []).map((opt) => {
                                    const isChosen = selectedSpotPick === opt.key;
                                    const isCorrectOption = Boolean(selectedSpotPick) && opt.key === spot.correctKey;
                                    return (
                                        <button
                                            key={opt.key}
                                            type="button"
                                            aria-pressed={isChosen}
                                            onClick={() => setSelectedSpotPick(opt.key)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '12px',
                                                width: '100%',
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                background: isCorrectOption
                                                    ? 'rgba(79, 193, 179, 0.14)'
                                                    : isChosen
                                                      ? 'rgba(96, 165, 250, 0.14)'
                                                      : '#0b1118',
                                                border: isCorrectOption
                                                    ? '1px solid #4fc1b3'
                                                    : isChosen
                                                      ? '1px solid #60a5fa'
                                                      : '1px solid #1b2c3d',
                                                borderRadius: '10px',
                                                padding: '12px 14px',
                                                color: '#ffffff',
                                                fontSize: '14px',
                                                fontWeight: 700,
                                            }}
                                        >
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        width: '26px',
                                                        height: '26px',
                                                        borderRadius: '999px',
                                                        background: '#4fc1b3',
                                                        color: '#05070a',
                                                        fontSize: '12.5px',
                                                        fontWeight: 800,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {opt.key}
                                                </span>
                                                <span>{opt.label}</span>
                                            </span>
                                            {isCorrectOption && (
                                                <span style={{ color: '#4fc1b3', fontSize: '12px', fontWeight: 800 }}>
                                                    Solver Line
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            {selectedSpotPick && spot.evSummary && (
                                <div
                                    role="status"
                                    style={{
                                        marginTop: '14px',
                                        padding: '14px 16px',
                                        background: '#0b1118',
                                        border: '1px solid #255c56',
                                        borderRadius: '12px',
                                    }}
                                >
                                    <div style={{ color: '#4fc1b3', fontSize: '12.5px', fontWeight: 800, marginBottom: '4px' }}>
                                        {selectedSpotPick === spot.correctKey
                                            ? `Exact Solver Match (${spot.solverFrequency || 'Highest-EV Line'})`
                                            : `Solver Prefers Option ${spot.correctKey} (${spot.solverFrequency || 'Highest-EV Line'})`}
                                    </div>
                                    <p style={{ margin: '0 0 10px 0', color: '#c8d8e8', fontSize: '13.5px', lineHeight: 1.55 }}>
                                        {spot.evSummary}
                                    </p>
                                </div>
                            )}
                            <div style={{ marginTop: '14px' }}>
                                <Link
                                    href={`${toInternalHref(spot.targetUrl, '/hub/training/hand-lab')}?spot=${encodeURIComponent(spot.slug)}&pick=${encodeURIComponent(selectedSpotPick || spot.correctKey || 'A')}`}
                                    style={{
                                        color: '#60a5fa',
                                        fontSize: '13.5px',
                                        fontWeight: 800,
                                        textDecoration: 'none',
                                    }}
                                >
                                    Simulate &amp; Run Equity In GTO Hand Lab &rarr;
                                </Link>
                            </div>
                        </section>
                    )}

                    {issue?.articles?.length > 0 && (
                        <section aria-label="This Week In Poker Stories" style={{ marginBottom: '28px' }}>
                            <h2
                                style={{
                                    margin: '0 0 12px 0',
                                    color: '#4fc1b3',
                                    fontSize: '13px',
                                    fontWeight: 800,
                                    letterSpacing: '1.8px',
                                    textTransform: 'uppercase',
                                }}
                            >
                                This Week In Poker
                            </h2>
                            <div style={{ display: 'grid', gap: '14px' }}>
                                {issue.articles.map((a) => (
                                    <Link
                                        key={a.id}
                                        href={`/hub/article?id=${encodeURIComponent(a.id)}`}
                                        style={{
                                            display: 'flex',
                                            gap: '16px',
                                            alignItems: 'flex-start',
                                            background: '#0b1118',
                                            border: '1px solid #1b2c3d',
                                            borderRadius: '14px',
                                            padding: '16px 18px',
                                            textDecoration: 'none',
                                            color: '#ffffff',
                                        }}
                                    >
                                        <img
                                            src={a.imageUrl || FALLBACK_THUMB_SRC}
                                            alt={a.title || 'Smarter.Poker News Story'}
                                            width={112}
                                            height={78}
                                            loading="lazy"
                                            onError={(ev) => {
                                                if (!ev.currentTarget.dataset.fb) {
                                                    ev.currentTarget.dataset.fb = '1';
                                                    ev.currentTarget.src = FALLBACK_THUMB_SRC;
                                                }
                                            }}
                                            style={{
                                                width: '112px',
                                                height: '78px',
                                                objectFit: 'cover',
                                                borderRadius: '8px',
                                                border: '1px solid #1b2c3d',
                                                background: '#0b1520',
                                                flexShrink: 0,
                                            }}
                                        />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div
                                                style={{
                                                    color: '#4fc1b3',
                                                    fontSize: '11px',
                                                    fontWeight: 800,
                                                    letterSpacing: '1px',
                                                    textTransform: 'uppercase',
                                                    marginBottom: '4px',
                                                }}
                                            >
                                                {a.category} &middot; <span style={{ color: '#8fa6bc' }}>{a.sourceName}</span>
                                            </div>
                                            <h3 style={{ margin: '0 0 6px 0', fontSize: '16.5px', fontWeight: 800, lineHeight: 1.35, color: '#ffffff' }}>
                                                {a.title}
                                            </h3>
                                            {a.summary && (
                                                <p style={{ margin: 0, color: '#b7cadc', fontSize: '13.5px', lineHeight: 1.5 }}>
                                                    {a.summary}
                                                </p>
                                            )}
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}

                    {video && (
                        <section
                            aria-label="Video Of The Week"
                            style={{
                                background: '#0b1118',
                                border: '1px solid #1b2c3d',
                                borderRadius: '16px',
                                padding: '20px 22px',
                                marginBottom: '28px',
                            }}
                        >
                            <div
                                style={{
                                    color: '#60a5fa',
                                    fontSize: '11.5px',
                                    fontWeight: 800,
                                    letterSpacing: '1.6px',
                                    textTransform: 'uppercase',
                                    marginBottom: '10px',
                                }}
                            >
                                Video Of The Week
                            </div>
                            <Link
                                href={video.watchPath || '/hub/video-library'}
                                style={{
                                    display: 'flex',
                                    gap: '16px',
                                    alignItems: 'flex-start',
                                    textDecoration: 'none',
                                    color: '#ffffff',
                                }}
                            >
                                <img
                                    src={video.thumbnailUrl || FALLBACK_THUMB_SRC}
                                    alt={video.title || 'Video Of The Week'}
                                    width={112}
                                    height={78}
                                    loading="lazy"
                                    onError={(ev) => {
                                        if (!ev.currentTarget.dataset.fb) {
                                            ev.currentTarget.dataset.fb = '1';
                                            ev.currentTarget.src = FALLBACK_THUMB_SRC;
                                        }
                                    }}
                                    style={{
                                        width: '112px',
                                        height: '78px',
                                        objectFit: 'cover',
                                        borderRadius: '8px',
                                        border: '1px solid #1b2c3d',
                                        background: '#0b1520',
                                        flexShrink: 0,
                                    }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h2 style={{ margin: '0 0 6px 0', fontSize: '17.5px', fontWeight: 800, lineHeight: 1.35, color: '#ffffff' }}>
                                        {video.title}
                                    </h2>
                                    <div style={{ color: '#9fb3c8', fontSize: '13px', marginBottom: '8px' }}>
                                        {[video.sourceName, video.duration].filter(Boolean).join(' - ')}
                                    </div>
                                    <span style={{ color: '#4fc1b3', fontSize: '13.5px', fontWeight: 800 }}>
                                        Watch In Video Library &rarr;
                                    </span>
                                </div>
                            </Link>
                        </section>
                    )}

                    {tool && (
                        <section
                            aria-label="Tool Spotlight Of The Week"
                            style={{
                                background: '#0b1118',
                                border: '1px solid #1b2c3d',
                                borderRadius: '16px',
                                padding: '22px 22px',
                                marginBottom: '28px',
                            }}
                        >
                            <div
                                style={{
                                    color: '#60a5fa',
                                    fontSize: '11.5px',
                                    fontWeight: 800,
                                    letterSpacing: '1.6px',
                                    textTransform: 'uppercase',
                                    marginBottom: '6px',
                                }}
                            >
                                Tool Spotlight Of The Week &middot; {tool.category}
                            </div>
                            <h2 style={{ margin: '0 0 8px 0', fontSize: '19px', fontWeight: 800, color: '#ffffff' }}>
                                {tool.title}
                            </h2>
                            <p style={{ margin: '0 0 14px 0', color: '#b7cadc', fontSize: '14px', lineHeight: 1.55 }}>
                                {tool.tip}
                            </p>
                            <Link
                                href={toInternalHref(tool.url, '/tools')}
                                style={{
                                    display: 'inline-block',
                                    background: '#101a24',
                                    border: '1px solid #1b2c3d',
                                    color: '#60a5fa',
                                    textDecoration: 'none',
                                    fontWeight: 800,
                                    fontSize: '13.5px',
                                    padding: '10px 18px',
                                    borderRadius: '8px',
                                }}
                            >
                                Open Free Calculator &rarr;
                            </Link>
                        </section>
                    )}

                    {kingsSchedule.length > 0 && (
                        <section
                            aria-label="Kings Club Upcoming Schedule"
                            style={{
                                background: '#0b1118',
                                border: '1px solid #1b2c3d',
                                borderRadius: '16px',
                                padding: '22px',
                                marginBottom: '28px',
                            }}
                        >
                            <h2
                                style={{
                                    margin: '0 0 12px 0',
                                    color: '#4fc1b3',
                                    fontSize: '13px',
                                    fontWeight: 800,
                                    letterSpacing: '1.8px',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Kings Club Upcoming Schedule
                            </h2>
                            <div style={{ display: 'grid', gap: '12px' }}>
                                {kingsSchedule.map((t) => (
                                    <div
                                        key={t.id}
                                        style={{
                                            background: '#101a24',
                                            border: '1px solid #1b2c3d',
                                            borderRadius: '12px',
                                            padding: '16px 18px',
                                        }}
                                    >
                                        <div style={{ color: '#ffffff', fontSize: '16.5px', fontWeight: 800, lineHeight: 1.35 }}>{t.name}</div>
                                        <div style={{ color: '#b7cadc', fontSize: '13.5px', margin: '4px 0 12px 0', lineHeight: 1.5 }}>
                                            {formatTournamentStart(t.startTime)} &middot; {t.gameType} &middot; {t.buyInLabel}
                                            {t.guaranteeLabel ? ` - ${t.guaranteeLabel}` : ''}
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                            <Link
                                                href="/hub/club-arena/?join=25450"
                                                style={{
                                                    display: 'inline-block',
                                                    background: '#4fc1b3',
                                                    color: '#05070a',
                                                    textDecoration: 'none',
                                                    fontWeight: 800,
                                                    fontSize: '13px',
                                                    padding: '9px 16px',
                                                    borderRadius: '8px',
                                                }}
                                            >
                                                Join Club 25450
                                            </Link>
                                            <a
                                                href={`/api/news/calendar-ics?tid=${encodeURIComponent(t.id)}`}
                                                style={{
                                                    display: 'inline-block',
                                                    background: '#0b1118',
                                                    border: '1px solid #1b2c3d',
                                                    color: '#60a5fa',
                                                    textDecoration: 'none',
                                                    fontWeight: 800,
                                                    fontSize: '13px',
                                                    padding: '9px 16px',
                                                    borderRadius: '8px',
                                                }}
                                            >
                                                {CALENDAR_ICS_LABEL}
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <section
                        aria-label="Kings Club And Poker Tools Callout"
                        style={{
                            background: '#101a24',
                            border: '1px solid #1b2c3d',
                            borderRadius: '16px',
                            padding: '24px 22px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '16px',
                        }}
                    >
                        <div style={{ flex: '1 1 280px' }}>
                            <div style={{ color: '#4fc1b3', fontSize: '11.5px', fontWeight: 800, letterSpacing: '1.6px', textTransform: 'uppercase' }}>
                                Take A Seat Tonight
                            </div>
                            <div style={{ color: '#ffffff', fontSize: '19px', fontWeight: 800, margin: '4px 0 6px 0' }}>
                                Play In Kings Club (Code 25450) Or Run Live Table Math
                            </div>
                            <div style={{ color: '#b7cadc', fontSize: '13.5px', lineHeight: 1.5 }}>
                                Cash Games, Spin Matches, Tournaments, And 42 Free Pro Calculators Ready In Your Browser.
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <Link
                                href="/tools/icm-calculator"
                                style={{
                                    display: 'inline-block',
                                    background: '#0b1118',
                                    border: '1px solid #1b2c3d',
                                    color: '#60a5fa',
                                    textDecoration: 'none',
                                    fontWeight: 800,
                                    fontSize: '13.5px',
                                    padding: '11px 16px',
                                    borderRadius: '8px',
                                }}
                            >
                                Launch ICM Tool
                            </Link>
                            <Link
                                href="/hub/club-arena/?join=25450"
                                style={{
                                    display: 'inline-block',
                                    background: '#4fc1b3',
                                    color: '#05070a',
                                    textDecoration: 'none',
                                    fontWeight: 800,
                                    fontSize: '13.5px',
                                    padding: '11px 18px',
                                    borderRadius: '8px',
                                }}
                            >
                                Enter Club Arena
                            </Link>
                        </div>
                    </section>
                </article>
            </main>
        </>
    );
}
