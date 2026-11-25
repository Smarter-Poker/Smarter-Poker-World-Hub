import Head from 'next/head';
import Link from 'next/link';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { deterministicUuid } from '../../../src/lib/promoCampaigns/welcomeBackOffer.mjs';
import * as wireCatalog from '../../../src/lib/newsletter/weeklyWireCatalog.mjs';
import * as wireEngine from '../../../src/lib/newsletter/weeklyWireEngine.mjs';

const UUID_SHAPE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isWeeklyWireCampaign(row) {
    const subj = String(row?.subject || '').trim();
    if (!subj) return false;
    if (subj.startsWith('[Promo]') || subj.startsWith('[Lifecycle]')) return false;
    return true;
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

export async function getServerSideProps({ params, res }) {
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
                        imageUrl: r.image_url && /^https?:\/\//i.test(r.image_url) ? String(r.image_url) : '',
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

            return {
                props: {
                    issue: {
                        editionNumber,
                        subject: cleanCopy(matchedCampaign.subject || `Smarter.Poker Weekly Wire #${editionNumber}`),
                        publishedAt: matchedCampaign.completed_at || matchedCampaign.created_at || null,
                        isLivePreview: false,
                        platformUpdates,
                        articles: orderedNews,
                        spotOfTheWeek: matchedSpot
                            ? {
                                  slug: String(matchedSpot.slug),
                                  category: cleanCopy(matchedSpot.category || 'GTO Decision Spot'),
                                  title: cleanCopy(matchedSpot.title),
                                  situation: cleanCopy(matchedSpot.situation),
                                  options: (matchedSpot.options || []).map((o) => ({
                                      key: String(o.key),
                                      label: cleanCopy(o.label),
                                  })),
                                  targetUrl: String(matchedSpot.targetUrl || 'https://smarter.poker/hub/training/hand-lab'),
                              }
                            : null,
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
                        imageUrl: a.image_url && /^https?:\/\//i.test(a.image_url) ? String(a.image_url) : '',
                        category: cleanCopy(String(a.category || 'POKER NEWS')),
                    })),
                    spotOfTheWeek: liveSpot
                        ? {
                              slug: String(liveSpot.slug),
                              category: cleanCopy(liveSpot.category || 'GTO Decision Spot'),
                              title: cleanCopy(liveSpot.title),
                              situation: cleanCopy(liveSpot.situation),
                              options: (liveSpot.options || []).map((o) => ({
                                  key: String(o.key),
                                  label: cleanCopy(o.label),
                              })),
                              targetUrl: String(liveSpot.targetUrl || 'https://smarter.poker/hub/training/hand-lab'),
                          }
                        : null,
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
                    spotOfTheWeek: spot
                        ? {
                              slug: spot.slug,
                              category: cleanCopy(spot.category),
                              title: cleanCopy(spot.title),
                              situation: cleanCopy(spot.situation),
                              options: (spot.options || []).map((o) => ({ key: o.key, label: cleanCopy(o.label) })),
                              targetUrl: spot.targetUrl,
                          }
                        : null,
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

export default function WeeklyWireEditionPage({ issue }) {
    const editionNum = Number(issue?.editionNumber || 1);
    const canonicalUrl = `https://smarter.poker/hub/wire/${editionNum}`;
    const metaTitle = `${issue?.subject || `Smarter.Poker Weekly Wire #${editionNum}`} | Smarter.Poker`;
    const metaDesc = `Read Smarter.Poker Weekly Wire Edition #${editionNum}: Platform Upgrades, Solver Spot Of The Week, World Poker News, And Pro Calculator Spotlights.`;

    const spot = issue?.spotOfTheWeek || null;
    const tool = issue?.toolSpotlight || null;

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
                <meta key="twitter-title" name="twitter:title" content={metaTitle} />
                <meta key="twitter-description" name="twitter:description" content={metaDesc} />
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
                            <p style={{ margin: '0 0 16px 0', color: '#d0deec', fontSize: '14.5px', lineHeight: 1.6 }}>
                                {spot.situation}
                            </p>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {(spot.options || []).map((opt) => {
                                    const spotHref = `${toInternalHref(spot.targetUrl, '/hub/training/hand-lab')}?spot=${encodeURIComponent(spot.slug)}&pick=${encodeURIComponent(opt.key)}`;
                                    return (
                                        <Link
                                            key={opt.key}
                                            href={spotHref}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                background: '#0b1118',
                                                border: '1px solid #1b2c3d',
                                                borderRadius: '10px',
                                                padding: '12px 14px',
                                                textDecoration: 'none',
                                                color: '#ffffff',
                                                fontSize: '14px',
                                                fontWeight: 700,
                                            }}
                                        >
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
                                        </Link>
                                    );
                                })}
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
                                        {a.imageUrl && (
                                            <img
                                                src={a.imageUrl}
                                                alt=""
                                                width={112}
                                                height={78}
                                                loading="lazy"
                                                style={{
                                                    width: '112px',
                                                    height: '78px',
                                                    objectFit: 'cover',
                                                    borderRadius: '8px',
                                                    border: '1px solid #1b2c3d',
                                                    flexShrink: 0,
                                                }}
                                            />
                                        )}
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
