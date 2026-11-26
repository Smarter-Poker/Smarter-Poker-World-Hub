import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FALLBACK_MAGAZINE_IMAGE,
    MagazinePageSheet,
    handleMagazineImageError,
    toInternalMagazineHref,
} from '../../../src/components/magazine/MagazineSpreadRenderer.js';
import {
    MAGAZINE_MASTHEAD,
    MAGAZINE_SITE_URL,
    MAGAZINE_TOC_GROUPS,
    formatChipsOnly,
    isValidIssuePeriod,
    normalizeIssueManifest,
    stripMagazineDashes,
} from '../../../src/lib/magazine/magazineSchema.mjs';

const SLUG_SHAPE_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function buildBookSpreads(pages, singlePageMode) {
    const list = Array.isArray(pages) ? pages : [];
    if (list.length === 0) return [];
    if (singlePageMode || list.length === 1) {
        return list.map((p) => ({
            label: `Page ${p.pageNumber}`,
            pages: [p],
        }));
    }
    const spreads = [
        {
            label: `Cover (Page ${list[0].pageNumber})`,
            pages: [list[0]],
        },
    ];
    let idx = 1;
    while (idx < list.length) {
        if (idx === list.length - 1) {
            spreads.push({
                label: `Back Cover (Page ${list[idx].pageNumber})`,
                pages: [list[idx]],
            });
            idx += 1;
        } else {
            const left = list[idx];
            const right = list[idx + 1];
            spreads.push({
                label: `Pages ${left.pageNumber}-${right.pageNumber}`,
                pages: [left, right],
            });
            idx += 2;
        }
    }
    return spreads;
}

export async function getServerSideProps({ params, query, res }) {
    const rawParam = String(params?.issue || '').trim();
    const lowerParam = rawParam.toLowerCase();
    const allowPreview = query?.preview === '1' || query?.preview === 'true';
    const initialView = query?.view === 'reader' ? 'reader' : 'flipbook';

    if (!allowPreview) {
        res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    } else {
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    }

    const isLatest = lowerParam === 'latest' || lowerParam === 'current';
    const isNumeric = /^\d+$/.test(lowerParam);
    const isPeriod = isValidIssuePeriod(lowerParam);
    const isSlug = SLUG_SHAPE_RE.test(lowerParam);

    if (!isLatest && !isNumeric && !isPeriod && !isSlug) {
        return { notFound: true };
    }

    const allowedStatuses = allowPreview ? ['published', 'review', 'accumulating'] : ['published'];

    try {
        const { createClient } = await import('../../../src/lib/supabaseServerClient.js');
        const sb = createClient();

        let queryBuilder = sb
            .from('magazine_issues')
            .select(
                'id, issue_number, volume_number, issue_period, slug, title, cover_headline, cover_subheadline, editor_note, cover_image_url, status, page_count, published_at, manifest_json'
            )
            // in-list: bounded to at most 3 magazine issue statuses
            .in('status', allowedStatuses);

        if (isLatest) {
            queryBuilder = queryBuilder.order('issue_number', { ascending: false }).limit(1);
        } else if (isPeriod) {
            queryBuilder = queryBuilder.eq('issue_period', lowerParam).order('issue_number', { ascending: false }).limit(2);
        } else if (isNumeric) {
            const num = parseInt(lowerParam, 10);
            if (!Number.isFinite(num) || num <= 0) return { notFound: true };
            queryBuilder = queryBuilder.eq('issue_number', num).limit(1);
        } else {
            queryBuilder = queryBuilder.eq('slug', lowerParam).limit(1);
        }

        let { data: rows } = await queryBuilder;

        // Secondary fallback if slug differs from issue_period or vice versa
        if ((!rows || rows.length === 0) && isPeriod) {
            const alt = await sb
                .from('magazine_issues')
                .select(
                    'id, issue_number, volume_number, issue_period, slug, title, cover_headline, cover_subheadline, editor_note, cover_image_url, status, page_count, published_at, manifest_json'
                )
                // in-list: bounded to at most 3 magazine issue statuses
                .in('status', allowedStatuses)
                .eq('slug', lowerParam)
                .limit(1);
            rows = alt.data || [];
        }

        if (!Array.isArray(rows) || rows.length === 0) {
            return { notFound: true };
        }

        const chosen = rows.find((r) => r.status === 'published') || rows[0];
        const manifest = normalizeIssueManifest(chosen.manifest_json || {}, chosen);
        const safeManifest = JSON.parse(JSON.stringify(manifest));

        return {
            props: {
                issue: {
                    id: String(chosen.id || safeManifest.slug),
                    status: String(chosen.status || 'published'),
                    isPreview: chosen.status !== 'published',
                    publishedAt: chosen.published_at ? String(chosen.published_at) : null,
                    manifest: safeManifest,
                },
                initialView,
            },
        };
    } catch (err) {
        console.warn('[magazine/[issue]] SSR error:', err?.message || err);
        return { notFound: true };
    }
}

function ArticleReaderSectionCard({ page, onJumpFlipbookPage }) {
    const [quizPick, setQuizPick] = useState({});
    const spot = page?.spot || null;
    const rows =
        Array.isArray(page?.standings) && page.standings.length > 0
            ? page.standings
            : [];
    const isKings = page?.kind === 'kings_club_champions';
    const isPoy = page?.kind === 'poy_standings';
    const isQuiz = page?.kind === 'the_test_quiz';

    return (
        <article
            id={`reader-page-${page.pageNumber}`}
            style={{
                background: '#0b1520',
                border: '1px solid #1b2c3d',
                borderRadius: '16px',
                padding: '22px',
                marginBottom: '18px',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '8px',
                }}
            >
                <span
                    style={{
                        color: '#4fc1b3',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        letterSpacing: '1.6px',
                        textTransform: 'uppercase',
                    }}
                >
                    {`${page.department || MAGAZINE_MASTHEAD} \u2022 Page ${page.pageNumber}`}
                </span>
                <button
                    type="button"
                    onClick={() => onJumpFlipbookPage(page.pageNumber)}
                    style={{
                        background: '#102131',
                        border: '1px solid #1b2c3d',
                        color: '#60a5fa',
                        borderRadius: '999px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                    }}
                >
                    View In Flipbook &rarr;
                </button>
            </div>

            {page.headline && (
                <h3
                    style={{
                        margin: '0 0 8px 0',
                        fontSize: 'clamp(20px, 3vw, 25px)',
                        fontWeight: 900,
                        lineHeight: 1.22,
                        color: '#ffffff',
                        fontFamily: "Georgia, 'Times New Roman', serif",
                    }}
                >
                    {page.headline}
                </h3>
            )}

            {page.subheadline && (
                <p style={{ margin: '0 0 14px 0', fontSize: '15px', lineHeight: 1.55, color: '#9fb3c8' }}>
                    {page.subheadline}
                </p>
            )}

            {(spot?.cardImageUrl || page.imageUrl) && page.kind !== 'toc_left' && page.kind !== 'toc_right' && (
                <div style={{ marginBottom: '14px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #1b2c3d' }}>
                    <img
                        src={spot?.cardImageUrl || page.imageUrl || FALLBACK_MAGAZINE_IMAGE}
                        alt={page.headline || `Magazine Page ${page.pageNumber}`}
                        loading="lazy"
                        onError={handleMagazineImageError}
                        style={{
                            width: '100%',
                            maxHeight: '320px',
                            objectFit: 'cover',
                            display: 'block',
                            background: '#05070a',
                        }}
                    />
                </div>
            )}

            {Array.isArray(page.paragraphs) && page.paragraphs.length > 0 && (
                <div style={{ display: 'grid', gap: '12px', marginBottom: '14px' }}>
                    {page.paragraphs.map((p, idx) => (
                        <p key={idx} style={{ margin: 0, fontSize: '15.5px', lineHeight: 1.68, color: '#e2e8f0' }}>
                            {p}
                        </p>
                    ))}
                </div>
            )}

            {page.pullQuote && (
                <blockquote
                    style={{
                        margin: '0 0 14px 0',
                        padding: '12px 16px',
                        borderLeft: '4px solid #4fc1b3',
                        background: '#05070a',
                        borderRadius: '0 10px 10px 0',
                        fontSize: '16px',
                        fontWeight: 800,
                        fontStyle: 'italic',
                        color: '#ffffff',
                    }}
                >
                    {`"${page.pullQuote}"`}
                </blockquote>
            )}

            {spot && (
                <div
                    style={{
                        background: '#05070a',
                        border: '1px solid #1b2c3d',
                        borderRadius: '12px',
                        padding: '14px',
                        marginBottom: '14px',
                    }}
                >
                    {spot.situation && (
                        <p style={{ margin: '0 0 10px 0', fontSize: '14.5px', lineHeight: 1.55, color: '#ffffff' }}>
                            {stripMagazineDashes(spot.situation)}
                        </p>
                    )}
                    {spot.evSummary && (
                        <p style={{ margin: '0 0 10px 0', fontSize: '13.5px', lineHeight: 1.5, color: '#4fc1b3' }}>
                            {stripMagazineDashes(spot.evSummary)}
                        </p>
                    )}
                    <Link
                        href={
                            spot.slug
                                ? `/hub/training/hand-lab?spot=${encodeURIComponent(spot.slug)}`
                                : toInternalMagazineHref(page.ctaUrl, '/hub/training/hand-lab')
                        }
                        style={{
                            display: 'inline-block',
                            background: '#4fc1b3',
                            color: '#05070a',
                            borderRadius: '8px',
                            padding: '9px 16px',
                            fontSize: '13px',
                            fontWeight: 900,
                            textDecoration: 'none',
                        }}
                    >
                        Open Spot In GTO Hand Lab &rarr;
                    </Link>
                </div>
            )}

            {isQuiz && Array.isArray(page.items) && page.items.length > 0 && (
                <div style={{ display: 'grid', gap: '12px', marginBottom: '14px' }}>
                    {page.items.map((q, qIdx) => {
                        const qKey = String(q?.slug || qIdx);
                        const picked = quizPick[qKey] || '';
                        const correct = String(q?.answerKey || q?.correctKey || 'A');
                        return (
                            <div
                                key={qKey}
                                style={{
                                    background: '#05070a',
                                    border: '1px solid #1b2c3d',
                                    borderRadius: '10px',
                                    padding: '14px',
                                }}
                            >
                                <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', marginBottom: '10px' }}>
                                    {`${qIdx + 1}. ${stripMagazineDashes(q?.question || q?.title || '')}`}
                                </div>
                                <div style={{ display: 'grid', gap: '8px' }}>
                                    {(q?.options || []).map((opt) => {
                                        const k = String(opt?.key || 'A');
                                        const isRight = k === correct;
                                        return (
                                            <button
                                                key={k}
                                                type="button"
                                                onClick={() => setQuizPick((prev) => ({ ...prev, [qKey]: k }))}
                                                style={{
                                                    textAlign: 'left',
                                                    padding: '10px 12px',
                                                    borderRadius: '8px',
                                                    background: picked && isRight ? '#102131' : '#0b1520',
                                                    color: picked && isRight ? '#4fc1b3' : '#ffffff',
                                                    border: `1px solid ${picked && isRight ? '#4fc1b3' : '#1b2c3d'}`,
                                                    fontSize: '14px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {`${k}. ${stripMagazineDashes(opt?.label || '')}`}
                                            </button>
                                        );
                                    })}
                                </div>
                                {picked && (
                                    <div style={{ marginTop: '8px', fontSize: '13.5px', color: '#4fc1b3' }}>
                                        {`Answer: ${correct}. ${stripMagazineDashes(q?.explanation || '')}`}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {!isQuiz && Array.isArray(page.items) && page.items.length > 0 && page.kind !== 'toc_left' && page.kind !== 'toc_right' && (
                <div style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
                    {page.items.slice(0, 8).map((item, idx) => (
                        <div
                            key={idx}
                            style={{
                                background: '#05070a',
                                border: '1px solid #1b2c3d',
                                borderRadius: '10px',
                                padding: '12px 14px',
                            }}
                        >
                            <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', marginBottom: '4px' }}>
                                {stripMagazineDashes(item?.headline || item?.title || item?.name || item?.room_name || '')}
                            </div>
                            {(item?.summary || item?.excerpt || item?.tip || item?.description) && (
                                <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: '#9fb3c8' }}>
                                    {stripMagazineDashes(item?.summary || item?.excerpt || item?.tip || item?.description)}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {rows.length > 0 && (
                <div
                    style={{
                        border: '1px solid #1b2c3d',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        marginBottom: '12px',
                    }}
                >
                    {rows.slice(0, 15).map((r, idx) => {
                        const rank = Number(r?.rank || r?.place || idx + 1);
                        const name = stripMagazineDashes(
                            r?.playerName || r?.player_name || r?.username || r?.winner || r?.name || `Contender #${rank}`
                        );
                        const metric = isPoy
                            ? `${Number(r?.points || r?.poy_points || 0).toLocaleString('en-US')} Pts`
                            : formatChipsOnly(
                                  Number(r?.prizeChips ?? r?.prize_chips ?? r?.prize_pool ?? r?.chips ?? 0)
                              );
                        return (
                            <div
                                key={idx}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                    padding: '10px 14px',
                                    background: idx % 2 === 0 ? '#05070a' : '#0b1520',
                                    borderBottom: idx < rows.slice(0, 15).length - 1 ? '1px solid #1b2c3d' : 'none',
                                    fontSize: '14px',
                                }}
                            >
                                <span style={{ color: '#ffffff', fontWeight: 700 }}>{`#${rank} ${name}`}</span>
                                <strong style={{ color: isKings ? '#4fc1b3' : '#60a5fa' }}>{metric}</strong>
                            </div>
                        );
                    })}
                </div>
            )}

            {page.ctaUrl && (
                <Link
                    href={toInternalMagazineHref(page.ctaUrl, '/hub/magazine')}
                    style={{
                        color: '#60a5fa',
                        fontSize: '13.5px',
                        fontWeight: 800,
                        textDecoration: 'none',
                    }}
                >
                    {page.ctaLabel || 'Explore On Smarter.Poker'} &rarr;
                </Link>
            )}
        </article>
    );
}

export default function SmarterPokerMagazineIssueReaderPage({ issue, initialView = 'flipbook' }) {
    const router = useRouter();
    const manifest = issue?.manifest || normalizeIssueManifest({});
    const pages = manifest.pages || [];

    const [viewMode, setViewMode] = useState(initialView === 'reader' ? 'reader' : 'flipbook');
    const [singlePageViewport, setSinglePageViewport] = useState(false);
    const [spreadIndex, setSpreadIndex] = useState(0);
    const [zoomed, setZoomed] = useState(false);
    const [tocOpen, setTocOpen] = useState(false);

    useEffect(() => {
        if (router?.query?.view === 'reader') {
            setViewMode('reader');
        } else if (router?.query?.view === 'flipbook') {
            setViewMode('flipbook');
        }
    }, [router?.query?.view]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const syncViewport = () => {
            setSinglePageViewport(window.innerWidth < 900);
        };
        syncViewport();
        window.addEventListener('resize', syncViewport);
        return () => window.removeEventListener('resize', syncViewport);
    }, []);

    const spreads = useMemo(() => buildBookSpreads(pages, singlePageViewport), [pages, singlePageViewport]);
    const boundedSpreadIndex = Math.min(Math.max(0, spreadIndex), Math.max(0, spreads.length - 1));
    const currentSpread = spreads[boundedSpreadIndex] || { label: 'Page 1', pages: pages.slice(0, 1) };

    const goPrevSpread = useCallback(() => {
        setSpreadIndex((prev) => Math.max(0, prev - 1));
    }, []);

    const goNextSpread = useCallback(() => {
        setSpreadIndex((prev) => Math.min(Math.max(0, spreads.length - 1), prev + 1));
    }, [spreads.length]);

    const jumpToPageNumber = useCallback(
        (pageNum) => {
            const target = Number(pageNum || 1);
            const foundIdx = spreads.findIndex((sp) => sp.pages.some((p) => Number(p.pageNumber) === target));
            if (foundIdx >= 0) {
                setSpreadIndex(foundIdx);
            }
            setViewMode('flipbook');
            setTocOpen(false);
        },
        [spreads]
    );

    useEffect(() => {
        if (typeof window === 'undefined' || viewMode !== 'flipbook') return undefined;
        const onKeyDown = (e) => {
            const tag = String(e.target?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                goPrevSpread();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                goNextSpread();
            } else if (e.key === 'Escape') {
                setTocOpen(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [viewMode, goPrevSpread, goNextSpread]);

    const canonicalUrl = `${MAGAZINE_SITE_URL}/hub/magazine/${manifest.slug}`;
    const pageTitle = `${manifest.title} | ${MAGAZINE_MASTHEAD}`;
    const pageDesc = `${manifest.coverHeadline}: ${manifest.coverSubheadline}`;
    const ogImageUrl = manifest.coverImageUrl?.startsWith('http')
        ? manifest.coverImageUrl
        : `${MAGAZINE_SITE_URL}${manifest.coverImageUrl || FALLBACK_MAGAZINE_IMAGE}`;
    const robotsDirective = issue?.isPreview ? ['noindex', 'follow'].join(',') : 'index,follow';
    const printHref = `/hub/magazine/print/${manifest.slug}${issue?.isPreview ? '?preview=1' : ''}`;

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'PublicationIssue',
        '@id': `${canonicalUrl}#issue`,
        url: canonicalUrl,
        issueNumber: String(manifest.issueNumber),
        name: manifest.title,
        description: pageDesc,
        image: ogImageUrl,
        pageStart: 1,
        pageEnd: manifest.pageCount || pages.length || 44,
        ...(issue?.publishedAt ? { datePublished: issue.publishedAt } : {}),
        isPartOf: {
            '@type': 'Periodical',
            name: MAGAZINE_MASTHEAD,
            url: `${MAGAZINE_SITE_URL}/hub/magazine`,
        },
    };

    const tocEntries = useMemo(() => {
        if (Array.isArray(manifest.toc) && manifest.toc.length > 0) {
            return manifest.toc;
        }
        return pages
            .filter((p) => p.headline)
            .map((p) => ({
                pageNumber: p.pageNumber,
                headline: p.headline,
                department: p.department,
                tocGroup: p.tocGroup || 'departments',
            }));
    }, [manifest.toc, pages]);

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
                <script
                    key="magazine-issue-jsonld"
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
                />
            </Head>

            <div
                style={{
                    minHeight: '100vh',
                    background: '#05070a',
                    color: '#ffffff',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                }}
            >
                <header
                    style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 40,
                        background: 'rgba(11, 21, 32, 0.96)',
                        borderBottom: '1px solid #1b2c3d',
                        padding: '12px 18px',
                        paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <Link
                            href="/hub/magazine"
                            style={{
                                color: '#4fc1b3',
                                fontSize: '13px',
                                fontWeight: 800,
                                textDecoration: 'none',
                            }}
                        >
                            &larr; All Issues
                        </Link>
                        <div>
                            <div style={{ fontSize: '14px', fontWeight: 900, color: '#ffffff' }}>
                                {`${MAGAZINE_MASTHEAD} \u2022 Issue #${manifest.issueNumber}`}
                            </div>
                            <div style={{ fontSize: '11.5px', color: '#9fb3c8' }}>
                                {`${manifest.periodLabel} \u2022 ${currentSpread.label}`}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => setViewMode('flipbook')}
                            style={{
                                background: viewMode === 'flipbook' ? '#4fc1b3' : '#102131',
                                color: viewMode === 'flipbook' ? '#05070a' : '#ffffff',
                                border: '1px solid #1b2c3d',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '12.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                            }}
                        >
                            Two-Page Flipbook
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('reader')}
                            style={{
                                background: viewMode === 'reader' ? '#4fc1b3' : '#102131',
                                color: viewMode === 'reader' ? '#05070a' : '#ffffff',
                                border: '1px solid #1b2c3d',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '12.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                            }}
                        >
                            Article Reader View
                        </button>

                        {viewMode === 'flipbook' && (
                            <button
                                type="button"
                                onClick={() => setZoomed((z) => !z)}
                                style={{
                                    background: zoomed ? '#60a5fa' : '#05070a',
                                    color: zoomed ? '#05070a' : '#9fb3c8',
                                    border: '1px solid #1b2c3d',
                                    borderRadius: '8px',
                                    padding: '7px 11px',
                                    fontSize: '12.5px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                }}
                            >
                                {zoomed ? 'Zoom: 135%' : 'Zoom: 100%'}
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => setTocOpen((o) => !o)}
                            style={{
                                background: '#05070a',
                                color: '#60a5fa',
                                border: '1px solid #60a5fa',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '12.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                            }}
                        >
                            Table Of Contents
                        </button>

                        <Link
                            href={printHref}
                            style={{
                                background: '#102131',
                                color: '#4fc1b3',
                                border: '1px solid #4fc1b3',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '12.5px',
                                fontWeight: 800,
                                textDecoration: 'none',
                            }}
                        >
                            Print / Save PDF
                        </Link>
                    </div>
                </header>

                {tocOpen && (
                    <aside
                        aria-label="Magazine Table Of Contents Drawer"
                        style={{
                            position: 'fixed',
                            top: 'calc(62px + env(safe-area-inset-top, 0px))',
                            right: 0,
                            bottom: 0,
                            width: 'min(380px, 92vw)',
                            zIndex: 50,
                            background: '#0b1520',
                            borderLeft: '1px solid #1b2c3d',
                            boxShadow: '-12px 0 36px rgba(0, 0, 0, 0.7)',
                            padding: '20px',
                            overflowY: 'auto',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#4fc1b3' }}>
                                Table Of Contents
                            </h2>
                            <button
                                type="button"
                                onClick={() => setTocOpen(false)}
                                style={{
                                    background: '#102131',
                                    border: '1px solid #1b2c3d',
                                    color: '#ffffff',
                                    borderRadius: '6px',
                                    padding: '4px 10px',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                }}
                            >
                                Close
                            </button>
                        </div>

                        <div style={{ display: 'grid', gap: '8px' }}>
                            {tocEntries.map((entry, idx) => {
                                const pNum = Number(entry?.pageNumber || entry?.page || idx + 1);
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => jumpToPageNumber(pNum)}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'baseline',
                                            gap: '10px',
                                            textAlign: 'left',
                                            background: '#05070a',
                                            border: '1px solid #1b2c3d',
                                            borderRadius: '8px',
                                            padding: '9px 12px',
                                            color: '#ffffff',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <span style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.35 }}>
                                            {stripMagazineDashes(entry?.headline || entry?.title || `Page ${pNum}`)}
                                        </span>
                                        <strong style={{ color: '#4fc1b3', fontSize: '12.5px', flexShrink: 0 }}>
                                            {`P. ${pNum}`}
                                        </strong>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>
                )}

                {viewMode === 'flipbook' ? (
                    <main style={{ padding: '24px 16px 96px 16px', overflowX: zoomed ? 'auto' : 'hidden' }}>
                        <div
                            style={{
                                maxWidth: zoomed
                                    ? '1540px'
                                    : currentSpread.pages.length === 2
                                      ? '1140px'
                                      : '570px',
                                width: zoomed ? '135%' : '100%',
                                margin: '0 auto',
                                transition: 'max-width 0.22s ease, transform 0.22s ease',
                            }}
                        >
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: currentSpread.pages.length === 2 ? '1fr 1fr' : '1fr',
                                    gap: '0px',
                                    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)',
                                    borderRadius: '10px',
                                    overflow: 'hidden',
                                    border: '1px solid #1b2c3d',
                                    position: 'relative',
                                }}
                            >
                                {currentSpread.pages.map((p, idx) => (
                                    <div
                                        key={p.pageNumber}
                                        style={{
                                            position: 'relative',
                                            borderRight:
                                                currentSpread.pages.length === 2 && idx === 0
                                                    ? '2px solid #05070a'
                                                    : 'none',
                                        }}
                                    >
                                        <MagazinePageSheet
                                            page={p}
                                            issueMeta={manifest}
                                            mode="screen"
                                            onSelectPage={jumpToPageNumber}
                                        />
                                    </div>
                                ))}
                            </div>

                            <div
                                style={{
                                    marginTop: '20px',
                                    background: '#0b1520',
                                    border: '1px solid #1b2c3d',
                                    borderRadius: '14px',
                                    padding: '14px 18px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '12px',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '12px',
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={goPrevSpread}
                                        disabled={boundedSpreadIndex === 0}
                                        style={{
                                            background: boundedSpreadIndex === 0 ? '#05070a' : '#102131',
                                            color: boundedSpreadIndex === 0 ? '#9fb3c8' : '#ffffff',
                                            border: '1px solid #1b2c3d',
                                            borderRadius: '8px',
                                            padding: '9px 16px',
                                            fontSize: '13px',
                                            fontWeight: 800,
                                            cursor: boundedSpreadIndex === 0 ? 'default' : 'pointer',
                                            opacity: boundedSpreadIndex === 0 ? 0.5 : 1,
                                        }}
                                    >
                                        &larr; Previous Spread
                                    </button>

                                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#4fc1b3' }}>
                                        {`${currentSpread.label} Of ${manifest.pageCount || pages.length} Pages`}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={goNextSpread}
                                        disabled={boundedSpreadIndex >= spreads.length - 1}
                                        style={{
                                            background: boundedSpreadIndex >= spreads.length - 1 ? '#05070a' : '#4fc1b3',
                                            color: boundedSpreadIndex >= spreads.length - 1 ? '#9fb3c8' : '#05070a',
                                            border: '1px solid #1b2c3d',
                                            borderRadius: '8px',
                                            padding: '9px 16px',
                                            fontSize: '13px',
                                            fontWeight: 900,
                                            cursor: boundedSpreadIndex >= spreads.length - 1 ? 'default' : 'pointer',
                                            opacity: boundedSpreadIndex >= spreads.length - 1 ? 0.5 : 1,
                                        }}
                                    >
                                        Next Spread &rarr;
                                    </button>
                                </div>

                                {spreads.length > 1 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#9fb3c8' }}>Cover</span>
                                        <input
                                            type="range"
                                            min={0}
                                            max={spreads.length - 1}
                                            value={boundedSpreadIndex}
                                            onChange={(e) => setSpreadIndex(Number(e.target.value))}
                                            aria-label="Scrub Magazine Spreads"
                                            style={{ flex: 1, accentColor: '#4fc1b3', cursor: 'pointer' }}
                                        />
                                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#9fb3c8' }}>Back Cover</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </main>
                ) : (
                    <main style={{ maxWidth: '820px', margin: '0 auto', padding: '28px 16px 110px 16px' }}>
                        <section
                            style={{
                                background: '#0b1520',
                                border: '1px solid #1b2c3d',
                                borderLeft: '4px solid #4fc1b3',
                                borderRadius: '16px',
                                padding: '24px',
                                marginBottom: '26px',
                            }}
                        >
                            <div
                                style={{
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    letterSpacing: '2px',
                                    textTransform: 'uppercase',
                                    color: '#4fc1b3',
                                    marginBottom: '6px',
                                }}
                            >
                                {`Clean Mobile Reader \u2022 Volume ${manifest.volumeNumber} Issue ${manifest.issueNumber}`}
                            </div>
                            <h1
                                style={{
                                    margin: '0 0 8px 0',
                                    fontSize: 'clamp(24px, 4vw, 34px)',
                                    fontWeight: 900,
                                    color: '#ffffff',
                                    fontFamily: "Georgia, 'Times New Roman', serif",
                                }}
                            >
                                {manifest.coverHeadline}
                            </h1>
                            <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.6, color: '#9fb3c8' }}>
                                {manifest.coverSubheadline}
                            </p>
                        </section>

                        {MAGAZINE_TOC_GROUPS.map((grp) => {
                            const sectionPages = pages.filter(
                                (p) =>
                                    p.kind !== 'front_cover' &&
                                    p.kind !== 'toc_left' &&
                                    p.kind !== 'toc_right' &&
                                    (p.tocGroup || 'departments') === grp.key
                            );
                            if (sectionPages.length === 0) return null;
                            return (
                                <section key={grp.key} style={{ marginBottom: '30px' }}>
                                    <h2
                                        style={{
                                            margin: '0 0 14px 0',
                                            fontSize: '15px',
                                            fontWeight: 900,
                                            letterSpacing: '1.8px',
                                            textTransform: 'uppercase',
                                            color: '#60a5fa',
                                            borderBottom: '1px solid #1b2c3d',
                                            paddingBottom: '8px',
                                        }}
                                    >
                                        {grp.label}
                                    </h2>
                                    {sectionPages.map((page) => (
                                        <ArticleReaderSectionCard
                                            key={page.pageNumber}
                                            page={page}
                                            onJumpFlipbookPage={jumpToPageNumber}
                                        />
                                    ))}
                                </section>
                            );
                        })}
                    </main>
                )}
            </div>
        </>
    );
}
