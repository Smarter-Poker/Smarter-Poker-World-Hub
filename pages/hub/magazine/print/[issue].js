import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { MagazinePageSheet } from '../../../../src/components/magazine/MagazineSpreadRenderer.js';
import {
    MAGAZINE_MASTHEAD,
    MAGAZINE_TRIM,
    isValidIssuePeriod,
    normalizeIssueManifest,
} from '../../../../src/lib/magazine/magazineSchema.mjs';

const SLUG_SHAPE_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export async function getServerSideProps({ params, query, res }) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');

    const rawParam = String(params?.issue || '').trim();
    const lowerParam = rawParam.toLowerCase();
    const initialBleed = query?.bleed === '1' || query?.bleed === 'true';

    const isLatest = lowerParam === 'latest' || lowerParam === 'current';
    const isNumeric = /^\d+$/.test(lowerParam);
    const isPeriod = isValidIssuePeriod(lowerParam);
    const isSlug = SLUG_SHAPE_RE.test(lowerParam);

    if (!isLatest && !isNumeric && !isPeriod && !isSlug) {
        return { notFound: true };
    }

    try {
        const { createClient } = await import('../../../../src/lib/supabaseServerClient.js');
        const sb = createClient();

        let queryBuilder = sb
            .from('magazine_issues')
            .select(
                'id, issue_number, volume_number, issue_period, slug, title, cover_headline, cover_subheadline, editor_note, cover_image_url, status, page_count, published_at, manifest_json'
            )
            // in-list: bounded to 3 magazine issue statuses for print proof and press export
            .in('status', ['published', 'review', 'accumulating']);

        if (isLatest) {
            queryBuilder = queryBuilder.order('issue_number', { ascending: false }).limit(4);
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

        if ((!rows || rows.length === 0) && isPeriod) {
            const alt = await sb
                .from('magazine_issues')
                .select(
                    'id, issue_number, volume_number, issue_period, slug, title, cover_headline, cover_subheadline, editor_note, cover_image_url, status, page_count, published_at, manifest_json'
                )
                // in-list: bounded to 3 magazine issue statuses
                .in('status', ['published', 'review', 'accumulating'])
                .eq('slug', lowerParam)
                .limit(1);
            rows = alt.data || [];
        }

        if (!Array.isArray(rows) || rows.length === 0) {
            return { notFound: true };
        }

        const chosen = rows.find((r) => r.status === 'published') || rows[0];
        const manifest = normalizeIssueManifest(chosen.manifest_json || {}, chosen);

        return {
            props: {
                issueStatus: String(chosen.status || 'published'),
                initialBleed,
                manifest: JSON.parse(JSON.stringify(manifest)),
            },
        };
    } catch (err) {
        console.warn('[magazine/print/[issue]] SSR error:', err?.message || err);
        return { notFound: true };
    }
}

export default function SmarterPokerMagazinePrintSheetPage({
    issueStatus = 'published',
    initialBleed = false,
    manifest,
}) {
    const [showBleed, setShowBleed] = useState(Boolean(initialBleed));
    const safeManifest = manifest || normalizeIssueManifest({});
    const pages = safeManifest.pages || [];

    const pageWidthIn = showBleed ? 8.625 : MAGAZINE_TRIM.widthIn;
    const pageHeightIn = showBleed ? 11.125 : MAGAZINE_TRIM.heightIn;

    const printCss = [
        showBleed
            ? '@page { size: 8.625in 11.125in; margin: 0; }'
            : '@page { size: 8.375in 10.875in; margin: 0; }',
        '@media print {',
        '  html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }',
        '  .sp-mag-print-toolbar, .approved-global-header, [data-global-footer] { display: none !important; }',
        '  .sp-mag-print-canvas { padding: 0 !important; gap: 0 !important; background: #ffffff !important; }',
        '  .sp-mag-print-sheet { box-shadow: none !important; margin: 0 !important; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }',
        '  .sp-mag-print-sheet:last-child { page-break-after: auto; break-after: auto; }',
        '}',
    ].join('\n');

    const flipbookHref = `/hub/magazine/${safeManifest.slug}${issueStatus !== 'published' ? '?preview=1' : ''}`;

    return (
        <>
            <Head>
                <title>{`Print Proof \u2022 ${safeManifest.title} | ${MAGAZINE_MASTHEAD}`}</title>
                <meta name="robots" content="noindex,nofollow" />
                <style dangerouslySetInnerHTML={{ __html: printCss }} />
            </Head>

            <div
                style={{
                    minHeight: '100vh',
                    background: '#05070a',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                }}
            >
                <header
                    className="sp-mag-print-toolbar"
                    style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 50,
                        background: '#0b1520',
                        borderBottom: '1px solid #1b2c3d',
                        padding: '12px 20px',
                        paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                        color: '#ffffff',
                    }}
                >
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: 900, color: '#ffffff' }}>
                            {`${MAGAZINE_MASTHEAD} \u2022 Commercial Saddle-Stitch Press Proof`}
                        </div>
                        <div style={{ fontSize: '12px', color: '#9fb3c8' }}>
                            {`Issue #${safeManifest.issueNumber} (${safeManifest.periodLabel}) \u2022 ${pages.length} Sheets \u2022 Trim 8.375" \u00d7 10.875"${showBleed ? ' + 0.125" Full Bleed (8.625" \u00d7 11.125")' : ''}`}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <Link
                            href={flipbookHref}
                            style={{
                                background: '#102131',
                                border: '1px solid #1b2c3d',
                                color: '#60a5fa',
                                borderRadius: '8px',
                                padding: '8px 14px',
                                fontSize: '13px',
                                fontWeight: 800,
                                textDecoration: 'none',
                            }}
                        >
                            &larr; Back To Flipbook
                        </Link>

                        <button
                            type="button"
                            onClick={() => setShowBleed((b) => !b)}
                            style={{
                                background: showBleed ? '#60a5fa' : '#05070a',
                                color: showBleed ? '#05070a' : '#ffffff',
                                border: '1px solid #60a5fa',
                                borderRadius: '8px',
                                padding: '8px 14px',
                                fontSize: '13px',
                                fontWeight: 800,
                                cursor: 'pointer',
                            }}
                        >
                            Toggle Crop Marks &amp; Bleed
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                if (typeof window !== 'undefined') window.print();
                            }}
                            style={{
                                background: '#4fc1b3',
                                color: '#05070a',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '9px 18px',
                                fontSize: '13px',
                                fontWeight: 900,
                                cursor: 'pointer',
                            }}
                        >
                            Print / Save Press PDF
                        </button>
                    </div>
                </header>

                <main
                    className="sp-mag-print-canvas"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '28px',
                        padding: '28px 16px 80px 16px',
                    }}
                >
                    {pages.map((page) => (
                        <section
                            key={page.pageNumber}
                            className="sp-mag-print-sheet"
                            style={{
                                width: `${pageWidthIn}in`,
                                height: `${pageHeightIn}in`,
                                padding: showBleed ? '0.125in' : '0',
                                boxSizing: 'border-box',
                                position: 'relative',
                                background: '#ffffff',
                                boxShadow: '0 18px 48px rgba(0, 0, 0, 0.75)',
                                pageBreakAfter: 'always',
                                breakAfter: 'page',
                            }}
                        >
                            {showBleed && (
                                <>
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            position: 'absolute',
                                            top: '0.04in',
                                            left: '0.04in',
                                            width: '0.08in',
                                            height: '0.08in',
                                            borderRight: '1px solid #05070a',
                                            borderBottom: '1px solid #05070a',
                                            zIndex: 20,
                                        }}
                                    />
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            position: 'absolute',
                                            top: '0.04in',
                                            right: '0.04in',
                                            width: '0.08in',
                                            height: '0.08in',
                                            borderLeft: '1px solid #05070a',
                                            borderBottom: '1px solid #05070a',
                                            zIndex: 20,
                                        }}
                                    />
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            position: 'absolute',
                                            bottom: '0.04in',
                                            left: '0.04in',
                                            width: '0.08in',
                                            height: '0.08in',
                                            borderRight: '1px solid #05070a',
                                            borderTop: '1px solid #05070a',
                                            zIndex: 20,
                                        }}
                                    />
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            position: 'absolute',
                                            bottom: '0.04in',
                                            right: '0.04in',
                                            width: '0.08in',
                                            height: '0.08in',
                                            borderLeft: '1px solid #05070a',
                                            borderTop: '1px solid #05070a',
                                            zIndex: 20,
                                        }}
                                    />
                                </>
                            )}

                            <MagazinePageSheet
                                page={page}
                                issueMeta={safeManifest}
                                mode="print"
                                style={{ width: '8.375in', height: '10.875in', aspectRatio: 'auto' }}
                            />
                        </section>
                    ))}
                </main>
            </div>
        </>
    );
}
