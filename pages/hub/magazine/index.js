import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import NewsletterCaptureBar from '../../../src/components/news/NewsletterCaptureBar.js';
import SmarterAccountUnlockGate from '../../../src/components/seo/SmarterAccountUnlockGate';
import {
    FALLBACK_MAGAZINE_IMAGE,
    MagazinePageSheet,
    handleMagazineImageError,
} from '../../../src/components/magazine/MagazineSpreadRenderer.js';
import {
    MAGAZINE_MASTHEAD,
    MAGAZINE_SITE_URL,
    MAGAZINE_TAGLINE,
    MAGAZINE_TOC_GROUPS,
    currentIssuePeriod,
    formatPeriodLabel,
    normalizeIssueManifest,
    stripMagazineDashes,
} from '../../../src/lib/magazine/magazineSchema.mjs';

function summarizeIssueRow(row) {
    const manifest = normalizeIssueManifest(row?.manifest_json || {}, row || {});
    const departments = Array.from(
        new Set(
            [
                ...(manifest.pages || []).map((p) => p.tocGroup).filter(Boolean),
                ...(manifest.toc || []).map((t) => t?.tocGroup || t?.group).filter(Boolean),
            ].map(String)
        )
    );
    const headlines = [
        manifest.title,
        manifest.coverHeadline,
        manifest.coverSubheadline,
        ...(manifest.coverLines || []),
        ...(manifest.toc || []).map((t) => t?.headline || t?.title || ''),
        ...(manifest.pages || []).slice(0, 24).map((p) => `${p.headline || ''} ${p.department || ''}`),
    ]
        .map(stripMagazineDashes)
        .filter(Boolean);

    const frontPage =
        (manifest.pages || []).find((p) => p.kind === 'front_cover') || {
            pageNumber: 1,
            kind: 'front_cover',
            department: 'Cover Story',
            runningHeader: MAGAZINE_MASTHEAD,
            headline: manifest.coverHeadline,
            subheadline: manifest.coverSubheadline,
            imageUrl: manifest.coverImageUrl || FALLBACK_MAGAZINE_IMAGE,
            masterImageUrl: manifest.coverImageUrl || FALLBACK_MAGAZINE_IMAGE,
            ctaLabel: 'Open Digital Edition',
            ctaUrl: `/hub/magazine/${manifest.slug}`,
            qrUrl: `${MAGAZINE_SITE_URL}/hub/magazine/${manifest.slug}`,
            items: [],
            paragraphs: [],
            stats: [],
            standings: [],
            meta: { coverLines: manifest.coverLines || [] },
        };

    return {
        id: String(row?.id || manifest.slug),
        issueNumber: Number(manifest.issueNumber || 1),
        volumeNumber: Number(manifest.volumeNumber || 1),
        issuePeriod: String(manifest.issuePeriod),
        periodLabel: String(manifest.periodLabel),
        slug: String(manifest.slug),
        title: String(manifest.title),
        coverHeadline: String(manifest.coverHeadline),
        coverSubheadline: String(manifest.coverSubheadline),
        coverImageUrl: String(manifest.coverImageUrl || FALLBACK_MAGAZINE_IMAGE),
        coverLines: (manifest.coverLines || []).slice(0, 4).map(String),
        pageCount: Number(manifest.pageCount || 44),
        status: String(row?.status || 'published'),
        publishedAt: row?.published_at ? String(row.published_at) : null,
        departments: departments.length > 0 ? departments : ['features', 'departments', 'strategy'],
        searchText: headlines.join(' | ').toLowerCase().slice(0, 1400),
        frontPage: JSON.parse(JSON.stringify(frontPage)),
    };
}

export async function getServerSideProps({ res }) {
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

    let issues = [];
    let previewIssue = null;

    try {
        const { createClient } = await import('../../../src/lib/supabaseServerClient.js');
        const sb = createClient();

        const { data: publishedRows } = await sb
            .from('magazine_issues')
            .select(
                'id, issue_number, volume_number, issue_period, slug, title, cover_headline, cover_subheadline, cover_image_url, status, page_count, published_at, manifest_json'
            )
            .eq('status', 'published')
            .order('issue_number', { ascending: false })
            .limit(48);

        if (Array.isArray(publishedRows) && publishedRows.length > 0) {
            issues = publishedRows.map(summarizeIssueRow);
        } else {
            const { data: draftRows } = await sb
                .from('magazine_issues')
                .select(
                    'id, issue_number, volume_number, issue_period, slug, title, cover_headline, cover_subheadline, cover_image_url, status, page_count, published_at, manifest_json'
                )
                // in-list: bounded to 2 non-published preview statuses
                .in('status', ['review', 'accumulating'])
                .order('issue_number', { ascending: false })
                .limit(1);

            if (Array.isArray(draftRows) && draftRows.length > 0) {
                previewIssue = summarizeIssueRow(draftRows[0]);
            }
        }
    } catch (err) {
        console.warn('[magazine/index] SSR fallback:', err?.message || err);
    }

    const fallbackPeriod = currentIssuePeriod();

    return {
        props: {
            issues,
            previewIssue,
            fallbackPeriod,
            fallbackPeriodLabel: formatPeriodLabel(fallbackPeriod),
        },
    };
}

const DEPARTMENT_FILTERS = [
    { key: 'all', label: 'All Departments' },
    ...MAGAZINE_TOC_GROUPS,
];

export default function SmarterPokerMagazineNewsstandPage({
    issues = [],
    previewIssue = null,
    fallbackPeriod = '2026-11',
    fallbackPeriodLabel = 'November 2026',
}) {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeDepartment, setActiveDepartment] = useState('all');
    const [savedProgressMap, setSavedProgressMap] = useState({});

    const isPreviewOnly = issues.length === 0 && Boolean(previewIssue);
    const currentHero = issues[0] || previewIssue || null;
    const allDisplayIssues = issues.length > 0 ? issues : previewIssue ? [previewIssue] : [];
    const leadIssue = currentHero;

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const nextMap = {};
            const candidateIssues = leadIssue ? [leadIssue, ...allDisplayIssues] : allDisplayIssues;
            for (const iss of candidateIssues) {
                if (!iss?.slug) continue;
                const raw = window.localStorage.getItem(`sp_mag_progress_v1:${iss.slug}`);
                const maxPage = Number(iss.pageCount || 44);
                let parsedPage = parseInt(String(raw || ''), 10);
                if (!Number.isFinite(parsedPage) && raw && raw.startsWith('{')) {
                    try {
                        const obj = JSON.parse(raw);
                        parsedPage = parseInt(String(obj?.page || ''), 10);
                    } catch {
                        parsedPage = NaN;
                    }
                }
                if (Number.isFinite(parsedPage) && parsedPage > 1 && parsedPage <= maxPage) {
                    nextMap[iss.slug] = parsedPage;
                }
            }
            setSavedProgressMap(nextMap);
        } catch {
            // Ignore private-browsing storage restrictions
        }
    }, [leadIssue, allDisplayIssues]);

    const leadSavedPage = leadIssue?.slug ? Number(savedProgressMap[leadIssue.slug] || 0) : 0;

    const filteredIssues = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return allDisplayIssues.filter((item) => {
            if (activeDepartment !== 'all' && !(item.departments || []).includes(activeDepartment)) {
                return false;
            }
            if (!q) return true;
            const hay = `issue ${item.issueNumber} #${item.issueNumber} ${item.issuePeriod} ${item.periodLabel} ${item.title} ${item.searchText}`.toLowerCase();
            return q
                .split(/\s+/)
                .filter(Boolean)
                .every((tok) => hay.includes(tok));
        });
    }, [allDisplayIssues, searchQuery, activeDepartment]);

    const canonicalUrl = `${MAGAZINE_SITE_URL}/hub/magazine`;
    const pageTitle = 'Monthly Poker Magazine & Strategy | Smarter.Poker';
    const pageDesc =
        'Read Every 44-Page Monthly Issue Of Smarter.Poker Magazine: Major Circuit Coverage, Global POY Standings, GTO Solver Columns, Kings Club 25450 Champions, And Cardroom Print Editions.';
    const ogImageUrl =
        currentHero?.coverImageUrl?.startsWith('http')
            ? currentHero.coverImageUrl
            : `${MAGAZINE_SITE_URL}${currentHero?.coverImageUrl || FALLBACK_MAGAZINE_IMAGE}`;

    const robotsDirective = isPreviewOnly ? ['noindex', 'follow'].join(',') : 'index,follow';

    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Periodical',
                '@id': `${canonicalUrl}#periodical`,
                name: MAGAZINE_MASTHEAD,
                url: canonicalUrl,
                description: pageDesc,
                inLanguage: 'en-US',
                image: ogImageUrl,
                publisher: {
                    '@type': 'Organization',
                    name: 'Smarter.Poker',
                    url: MAGAZINE_SITE_URL,
                },
                hasPart: issues.slice(0, 24).map((iss) => ({
                    '@type': 'PublicationIssue',
                    issueNumber: String(iss.issueNumber),
                    name: iss.title,
                    url: `${MAGAZINE_SITE_URL}/hub/magazine/${iss.slug}`,
                    ...(iss.publishedAt ? { datePublished: iss.publishedAt } : {}),
                })),
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: `${MAGAZINE_SITE_URL}/` },
                    { '@type': 'ListItem', position: 2, name: 'Hub', item: `${MAGAZINE_SITE_URL}/hub` },
                    { '@type': 'ListItem', position: 3, name: 'Monthly Magazine', item: canonicalUrl },
                ],
            },
        ],
    };

    const previewSuffix = isPreviewOnly ? '?preview=1' : '';
    const readerSuffix = isPreviewOnly ? '?view=reader&preview=1' : '?view=reader';

    const showcaseFrontPage = {
        pageNumber: 1,
        kind: 'front_cover',
        department: 'Cover Story',
        runningHeader: MAGAZINE_MASTHEAD,
        headline: 'Inaugural Monthly Issue Compiling Live From The Vault',
        subheadline: 'Major Tour Storylines, Global POY Top 25, GTO Solver Columns & Kings Club 25450 Champions',
        imageUrl: FALLBACK_MAGAZINE_IMAGE,
        masterImageUrl: FALLBACK_MAGAZINE_IMAGE,
        ctaLabel: 'Read Weekly Wire Dispatch',
        ctaUrl: '/hub/wire',
        qrUrl: `${MAGAZINE_SITE_URL}/hub/magazine`,
        items: [],
        paragraphs: [],
        stats: [],
        standings: [],
        meta: {
            coverLines: [
                '44-Page Commercial Print & Interactive Digital Format',
                'NLH, ICM, PLO5 & AI Leak-Busting Strategy Columns',
                'Free Monthly Print Bundles For Partner Cardrooms',
            ],
        },
    };

    return (
        <>
            <Head>
                <title>{pageTitle}</title>
                <meta name="description" content={pageDesc} />
                <meta name="robots" content={robotsDirective} />
                <link key="canonical" rel="canonical" href={canonicalUrl} />
                <meta key="og-url" property="og:url" content={canonicalUrl} />
                <meta key="og-title" property="og:title" content={pageTitle} />
                <meta key="og-description" property="og:description" content={pageDesc} />
                <meta key="og-image" property="og:image" content={ogImageUrl} />
                <meta key="twitter-card" name="twitter:card" content="summary_large_image" />
                <meta key="twitter-title" name="twitter:title" content={pageTitle} />
                <meta key="twitter-description" property="twitter:description" content={pageDesc} />
                <meta key="twitter-image" name="twitter:image" content={ogImageUrl} />
                <link
                    key="magazine-rss"
                    rel="alternate"
                    type="application/rss+xml"
                    title="Smarter.Poker Magazine RSS"
                    href={`${MAGAZINE_SITE_URL}/hub/magazine/rss.xml`}
                />
                <script
                    key="magazine-jsonld"
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
                <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
                    <header
                        style={{
                            background: '#0b1520',
                            border: '1px solid #1b2c3d',
                            borderRadius: 0,
                            padding: '26px 28px',
                            marginBottom: '26px',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '12px',
                                marginBottom: '10px',
                            }}
                        >
                            <span
                                style={{
                                    color: '#4fc1b3',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    letterSpacing: '2.6px',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Official Print &amp; Digital Newsstand
                            </span>

                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <Link
                                    href="/hub/wire"
                                    style={{
                                        background: '#102131',
                                        border: '1px solid #1b2c3d',
                                        color: '#60a5fa',
                                        borderRadius: 0,
                                        padding: '5px 14px',
                                        fontSize: '12.5px',
                                        fontWeight: 800,
                                        textDecoration: 'none',
                                    }}
                                >
                                    Read Weekly Wire &rarr;
                                </Link>
                                <Link
                                    href="/hub/magazine/poker-rooms"
                                    style={{
                                        background: '#102131',
                                        border: '1px solid #4fc1b3',
                                        color: '#4fc1b3',
                                        borderRadius: 0,
                                        padding: '5px 14px',
                                        fontSize: '12.5px',
                                        fontWeight: 800,
                                        textDecoration: 'none',
                                    }}
                                >
                                    Stock In Your Poker Room
                                </Link>
                                <a
                                    href="/hub/magazine/rss.xml"
                                    type="application/rss+xml"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        color: '#ffffff',
                                        background: '#05070a',
                                        border: '1px solid #1b2c3d',
                                        borderRadius: 0,
                                        padding: '5px 13px',
                                        fontSize: '12.5px',
                                        fontWeight: 700,
                                        textDecoration: 'none',
                                    }}
                                >
                                    <span aria-hidden="true" style={{ color: '#4fc1b3' }}>&#9679;</span>
                                    Magazine RSS
                                </a>
                            </div>
                        </div>

                        <h1
                            style={{
                                margin: '0 0 8px 0',
                                fontSize: 'clamp(28px, 4.2vw, 40px)',
                                fontWeight: 900,
                                lineHeight: 1.15,
                                color: '#ffffff',
                                fontFamily: "Georgia, 'Times New Roman', serif",
                            }}
                        >
                            Smarter.Poker Magazine
                        </h1>
                        <p style={{ margin: 0, color: '#9fb3c8', fontSize: '15px', lineHeight: 1.6, maxWidth: '780px' }}>
                            {MAGAZINE_TAGLINE}. Flip Through Full 44-Page Two-Page Spreads Online, Switch To Clean Mobile Reading, Or Export Commercial 8.375&quot; &times; 10.875&quot; Print Sheets With Scannable Table QR Codes.
                        </p>
                    </header>

                    <section
                        aria-label="Current Magazine Issue Showcase"
                        style={{
                            background: 'linear-gradient(135deg, #0b1520 0%, #102131 100%)',
                            border: '1px solid #1b2c3d',
                            borderRadius: 0,
                            padding: '28px',
                            marginBottom: '28px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                            gap: '32px',
                            alignItems: 'center',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <div
                                style={{
                                    width: '100%',
                                    maxWidth: '330px',
                                    transform: 'perspective(1200px) rotateY(-6deg)',
                                    boxShadow: '-14px 18px 38px rgba(0, 0, 0, 0.72), -4px 0 0 #4fc1b3',
                                    borderRadius: 0,
                                    overflow: 'hidden',
                                    border: '1px solid #1b2c3d',
                                }}
                            >
                                <MagazinePageSheet
                                    page={currentHero ? currentHero.frontPage : showcaseFrontPage}
                                    issueMeta={{
                                        issueNumber: currentHero?.issueNumber || 1,
                                        volumeNumber: currentHero?.volumeNumber || 1,
                                        issuePeriod: currentHero?.issuePeriod || fallbackPeriod,
                                        periodLabel: currentHero?.periodLabel || fallbackPeriodLabel,
                                        slug: currentHero?.slug || fallbackPeriod,
                                        coverHeadline: currentHero?.coverHeadline,
                                        coverSubheadline: currentHero?.coverSubheadline,
                                        coverLines: currentHero?.coverLines,
                                        coverImageUrl: currentHero?.coverImageUrl || FALLBACK_MAGAZINE_IMAGE,
                                    }}
                                    mode="screen"
                                />
                            </div>
                        </div>

                        <div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                <span
                                    style={{
                                        background: '#4fc1b3',
                                        color: '#05070a',
                                        fontSize: '11px',
                                        fontWeight: 900,
                                        letterSpacing: '1.5px',
                                        textTransform: 'uppercase',
                                        padding: '4px 10px',
                                        borderRadius: 0,
                                    }}
                                >
                                    {currentHero
                                        ? isPreviewOnly
                                            ? `Preview Staging \u2022 Issue #${currentHero.issueNumber}`
                                            : `Current Issue #${currentHero.issueNumber} \u2022 ${currentHero.periodLabel}`
                                        : `Inaugural Issue Compiling \u2022 ${fallbackPeriodLabel}`}
                                </span>
                                <span
                                    style={{
                                        background: '#05070a',
                                        border: '1px solid #1b2c3d',
                                        color: '#60a5fa',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        padding: '4px 10px',
                                        borderRadius: 0,
                                    }}
                                >
                                    {`${currentHero?.pageCount || 44} Pages \u2022 Saddle-Stitch Print Spec`}
                                </span>
                            </div>

                            <h2
                                style={{
                                    margin: '0 0 10px 0',
                                    fontSize: 'clamp(22px, 3.2vw, 32px)',
                                    fontWeight: 900,
                                    lineHeight: 1.18,
                                    color: '#ffffff',
                                    fontFamily: "Georgia, 'Times New Roman', serif",
                                }}
                            >
                                {currentHero
                                    ? currentHero.coverHeadline
                                    : 'Inaugural Monthly Issue Compiling From The Smarter.Poker Vault'}
                            </h2>

                            <p style={{ margin: '0 0 16px 0', fontSize: '15px', lineHeight: 1.6, color: '#9fb3c8' }}>
                                {currentHero
                                    ? currentHero.coverSubheadline
                                    : 'Our Continuous Vault Harvester Is Banking High-Resolution Championship Photography, Global POY Standings, Kings Club 25450 Results, And GTO Solver Columns For This Month.'}
                            </p>

                            {currentHero?.coverLines?.length > 0 && (
                                <ul
                                    style={{
                                        margin: '0 0 20px 0',
                                        padding: '0 0 0 18px',
                                        color: '#ffffff',
                                        fontSize: '14px',
                                        lineHeight: 1.65,
                                    }}
                                >
                                    {currentHero.coverLines.slice(0, 3).map((line, idx) => (
                                        <li key={idx}>{line}</li>
                                    ))}
                                </ul>
                            )}

                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {currentHero ? (
                                    <>
                                        {leadSavedPage > 1 && (
                                            <Link
                                                href={`/hub/magazine/${currentHero.slug}?page=${leadSavedPage}${isPreviewOnly ? '&preview=1' : ''}`}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    minHeight: '44px',
                                                    background: '#102131',
                                                    border: '2px solid #4fc1b3',
                                                    color: '#4fc1b3',
                                                    textDecoration: 'none',
                                                    fontWeight: 900,
                                                    fontSize: '14px',
                                                    padding: '10px 18px',
                                                    borderRadius: 0,
                                                }}
                                            >
                                                {`Continue Reading Issue #${currentHero.issueNumber} (Page ${leadSavedPage})`} &rarr;
                                            </Link>
                                        )}
                                        <Link
                                            href={`/hub/magazine/${currentHero.slug}${previewSuffix}`}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                minHeight: '44px',
                                                background: '#4fc1b3',
                                                color: '#05070a',
                                                textDecoration: 'none',
                                                fontWeight: 900,
                                                fontSize: '14px',
                                                padding: '10px 20px',
                                                borderRadius: 0,
                                            }}
                                        >
                                            Open Two-Page Flipbook &rarr;
                                        </Link>
                                        <Link
                                            href={`/hub/magazine/${currentHero.slug}${readerSuffix}`}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                minHeight: '44px',
                                                background: '#05070a',
                                                border: '1px solid #60a5fa',
                                                color: '#60a5fa',
                                                textDecoration: 'none',
                                                fontWeight: 800,
                                                fontSize: '14px',
                                                padding: '10px 18px',
                                                borderRadius: 0,
                                            }}
                                        >
                                            Clean Mobile Reader
                                        </Link>
                                        <a
                                            href={`/api/news/magazine-pdf?issue=${encodeURIComponent(currentHero.slug)}&download=1${isPreviewOnly ? '&preview=1' : ''}`}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                minHeight: '44px',
                                                background: '#05070a',
                                                border: '1px solid #4fc1b3',
                                                color: '#ffffff',
                                                textDecoration: 'none',
                                                fontWeight: 800,
                                                fontSize: '14px',
                                                padding: '10px 18px',
                                                borderRadius: 0,
                                            }}
                                        >
                                            Download 44-Page PDF
                                        </a>
                                        <Link
                                            href={`/hub/magazine/print/${currentHero.slug}${previewSuffix}`}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                minHeight: '44px',
                                                background: '#05070a',
                                                border: '1px solid #1b2c3d',
                                                color: '#ffffff',
                                                textDecoration: 'none',
                                                fontWeight: 800,
                                                fontSize: '14px',
                                                padding: '10px 18px',
                                                borderRadius: 0,
                                            }}
                                        >
                                            Print-Ready Sheet View
                                        </Link>
                                    </>
                                ) : (
                                    <Link
                                        href="/hub/wire"
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            minHeight: '44px',
                                            background: '#4fc1b3',
                                            color: '#05070a',
                                            textDecoration: 'none',
                                            fontWeight: 900,
                                            fontSize: '14px',
                                            padding: '10px 20px',
                                            borderRadius: 0,
                                        }}
                                    >
                                        Read Weekly Wire Editions &rarr;
                                    </Link>
                                )}

                                <Link
                                    href="/hub/magazine/poker-rooms"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        minHeight: '44px',
                                        background: '#102131',
                                        border: '1px solid #4fc1b3',
                                        color: '#4fc1b3',
                                        textDecoration: 'none',
                                        fontWeight: 800,
                                        fontSize: '14px',
                                        padding: '10px 18px',
                                        borderRadius: 0,
                                    }}
                                >
                                    Stock In Your Poker Room
                                </Link>

                                <Link
                                    href="/hub/magazine/table-tent"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        minHeight: '44px',
                                        background: '#05070a',
                                        border: '1px solid #60a5fa',
                                        color: '#60a5fa',
                                        textDecoration: 'none',
                                        fontWeight: 800,
                                        fontSize: '14px',
                                        padding: '10px 18px',
                                        borderRadius: 0,
                                    }}
                                >
                                    Table-Tent QR Kit
                                </Link>
                            </div>
                        </div>
                    </section>

                    <div style={{ marginBottom: '28px' }}>
                        <NewsletterCaptureBar variant="inline" alwaysVisible pathname="/hub/magazine" source="capture:magazine" />
                    </div>

                    <section aria-label="Magazine Back-Issue Rack">
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '12px',
                                marginBottom: '14px',
                            }}
                        >
                            <h2
                                style={{
                                    margin: 0,
                                    fontSize: '16px',
                                    fontWeight: 900,
                                    letterSpacing: '1.6px',
                                    textTransform: 'uppercase',
                                    color: '#60a5fa',
                                }}
                            >
                                Magazine Archive &amp; Department Index
                            </h2>
                            <span style={{ color: '#9fb3c8', fontSize: '13px', fontWeight: 700 }}>
                                {`${filteredIssues.length} Of ${allDisplayIssues.length} ${allDisplayIssues.length === 1 ? 'Issue' : 'Issues'}`}
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search Issues, Cover Stories, Strategy Columns Or POY"
                                aria-label="Search Magazine Issues And Departments"
                                style={{
                                    flex: '1 1 260px',
                                    background: '#0b1520',
                                    border: '1px solid #1b2c3d',
                                    borderRadius: 0,
                                    padding: '11px 16px',
                                    color: '#ffffff',
                                    fontSize: '16px',
                                    outline: 'none',
                                }}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    style={{
                                        background: '#102131',
                                        border: '1px solid #1b2c3d',
                                        color: '#4fc1b3',
                                        borderRadius: 0,
                                        padding: '11px 16px',
                                        fontSize: '13.5px',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Clear Search
                                </button>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                            {DEPARTMENT_FILTERS.map((dept) => {
                                const selected = activeDepartment === dept.key;
                                return (
                                    <button
                                        key={dept.key}
                                        type="button"
                                        onClick={() => setActiveDepartment(dept.key)}
                                        style={{
                                            background: selected ? '#4fc1b3' : '#0b1520',
                                            color: selected ? '#05070a' : '#9fb3c8',
                                            border: `1px solid ${selected ? '#4fc1b3' : '#1b2c3d'}`,
                                            borderRadius: 0,
                                            padding: '7px 14px',
                                            fontSize: '12.5px',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {dept.label}
                                    </button>
                                );
                            })}
                        </div>

                        {filteredIssues.length === 0 ? (
                            <div
                                style={{
                                    background: '#0b1520',
                                    border: '1px solid #1b2c3d',
                                    borderRadius: 0,
                                    padding: '32px 24px',
                                    textAlign: 'center',
                                }}
                            >
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '19px', fontWeight: 800, color: '#ffffff' }}>
                                    {allDisplayIssues.length === 0
                                        ? 'Inaugural Issue Compiling In The Monthly Vault'
                                        : 'No Matching Magazine Issues Found'}
                                </h3>
                                <p style={{ margin: '0 auto 18px auto', maxWidth: '580px', color: '#9fb3c8', fontSize: '14.5px', lineHeight: 1.6 }}>
                                    {allDisplayIssues.length === 0
                                        ? 'While Our First 44-Page Monthly Issue Completes Compilation, Read Every Weekly Wire Dispatch Or Request Complimentary Print Copies For Your Cardroom.'
                                        : 'Try Clearing Your Search Query Or Selecting All Departments Above.'}
                                </p>
                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                    {allDisplayIssues.length === 0 ? (
                                        <>
                                            <Link
                                                href="/hub/wire"
                                                style={{
                                                    background: '#4fc1b3',
                                                    color: '#05070a',
                                                    borderRadius: 0,
                                                    padding: '10px 18px',
                                                    fontSize: '13.5px',
                                                    fontWeight: 800,
                                                    textDecoration: 'none',
                                                }}
                                            >
                                                Read Weekly Wire
                                            </Link>
                                            <Link
                                                href="/hub/magazine/poker-rooms"
                                                style={{
                                                    background: '#102131',
                                                    border: '1px solid #60a5fa',
                                                    color: '#60a5fa',
                                                    borderRadius: 0,
                                                    padding: '10px 18px',
                                                    fontSize: '13.5px',
                                                    fontWeight: 800,
                                                    textDecoration: 'none',
                                                }}
                                            >
                                                Stock In Your Poker Room
                                            </Link>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearchQuery('');
                                                setActiveDepartment('all');
                                            }}
                                            style={{
                                                background: '#4fc1b3',
                                                border: 'none',
                                                color: '#05070a',
                                                borderRadius: 0,
                                                padding: '10px 18px',
                                                fontSize: '13.5px',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Reset Filters
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                                    gap: '20px',
                                }}
                            >
                                {filteredIssues.map((iss) => (
                                    <article
                                        key={iss.id}
                                        style={{
                                            background: '#0b1520',
                                            border: '1px solid #1b2c3d',
                                            borderRadius: 0,
                                            overflow: 'hidden',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                        }}
                                    >
                                        <div>
                                            <Link
                                                href={`/hub/magazine/${iss.slug}${iss.status !== 'published' ? '?preview=1' : ''}`}
                                                style={{ display: 'block', position: 'relative', background: '#05070a' }}
                                            >
                                                <img
                                                    src={iss.coverImageUrl || FALLBACK_MAGAZINE_IMAGE}
                                                    alt={iss.title}
                                                    loading="lazy"
                                                    onError={handleMagazineImageError}
                                                    style={{
                                                        width: '100%',
                                                        aspectRatio: '8.375 / 10.875',
                                                        objectFit: 'cover',
                                                        display: 'block',
                                                    }}
                                                />
                                            </Link>

                                            <div style={{ padding: '16px' }}>
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        fontSize: '11.5px',
                                                        fontWeight: 800,
                                                        color: '#4fc1b3',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '1.2px',
                                                        marginBottom: '6px',
                                                    }}
                                                >
                                                    <span>{`Issue #${iss.issueNumber}`}</span>
                                                    <span style={{ color: '#9fb3c8' }}>{iss.periodLabel}</span>
                                                </div>
                                                <h3
                                                    style={{
                                                        margin: '0 0 6px 0',
                                                        fontSize: '17px',
                                                        fontWeight: 800,
                                                        lineHeight: 1.3,
                                                        color: '#ffffff',
                                                    }}
                                                >
                                                    {iss.coverHeadline}
                                                </h3>
                                                <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.48, color: '#9fb3c8' }}>
                                                    {iss.coverSubheadline}
                                                </p>
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                padding: '12px 16px 16px 16px',
                                                borderTop: '1px solid #1b2c3d',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                gap: '8px',
                                                flexWrap: 'wrap',
                                            }}
                                        >
                                            <Link
                                                href={
                                                    savedProgressMap[iss.slug] > 1
                                                        ? `/hub/magazine/${iss.slug}?page=${savedProgressMap[iss.slug]}${iss.status !== 'published' ? '&preview=1' : ''}`
                                                        : `/hub/magazine/${iss.slug}${iss.status !== 'published' ? '?preview=1' : ''}`
                                                }
                                                style={{
                                                    color: '#4fc1b3',
                                                    fontSize: '13px',
                                                    fontWeight: 800,
                                                    textDecoration: 'none',
                                                }}
                                            >
                                                {savedProgressMap[iss.slug] > 1
                                                    ? `Continue Page ${savedProgressMap[iss.slug]}`
                                                    : 'Flip Open'}{' '}
                                                &rarr;
                                            </Link>
                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                <a
                                                    href={`/api/news/magazine-pdf?issue=${encodeURIComponent(iss.slug)}&download=1`}
                                                    style={{
                                                        color: '#9fb3c8',
                                                        fontSize: '12.5px',
                                                        fontWeight: 700,
                                                        textDecoration: 'none',
                                                    }}
                                                >
                                                    PDF
                                                </a>
                                                <Link
                                                    href={`/hub/magazine/print/${iss.slug}${iss.status !== 'published' ? '?preview=1' : ''}`}
                                                    style={{
                                                        color: '#60a5fa',
                                                        fontSize: '12.5px',
                                                        fontWeight: 700,
                                                        textDecoration: 'none',
                                                    }}
                                                >
                                                    Print Sheet
                                                </Link>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                    <div style={{ marginTop: 28 }}>
                        <SmarterAccountUnlockGate
                            variant="editorial-wire"
                            context="magazine-index"
                            redirectPath="/hub/magazine"
                        />
                    </div>
                </div>
            </main>
        </>
    );
}
