import Head from 'next/head';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { MagazinePageSheet } from '../../../../src/components/magazine/MagazineSpreadRenderer.js';
import {
    computeSaddleStitchSpreads,
    padPagesToSignature,
} from '../../../../src/lib/magazine/magazineImposition.mjs';
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
    const initialImposition =
        String(query?.imposition || '').trim().toLowerCase() === 'booklet' ? 'booklet' : 'reader';

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
                initialImposition,
                manifest: JSON.parse(JSON.stringify(manifest)),
            },
        };
    } catch (err) {
        console.warn('[magazine/print/[issue]] SSR error:', err?.message || err);
        return { notFound: true };
    }
}

const DARK_BLEED_PAGE_KINDS = new Set([
    'front_cover',
    'back_cover',
    'capture_the_moment_left',
    'capture_the_moment_right',
    'house_promo_spread',
]);

function RegistrationBullseye({ color = '#05070a', style = {} }) {
    return (
        <svg
            aria-hidden="true"
            width="10"
            height="10"
            viewBox="0 0 12 12"
            style={{ position: 'absolute', zIndex: 24, pointerEvents: 'none', ...style }}
        >
            <circle cx="6" cy="6" r="4" fill="none" stroke={color} strokeWidth="0.9" />
            <circle cx="6" cy="6" r="1.6" fill={color} />
            <line x1="0" y1="6" x2="12" y2="6" stroke={color} strokeWidth="0.8" />
            <line x1="6" y1="0" x2="6" y2="12" stroke={color} strokeWidth="0.8" />
        </svg>
    );
}

function VanguardColorBars({ style = {} }) {
    const swatches = ['#05070a', '#0b1520', '#102131', '#2563eb', '#60a5fa', '#0d9488', '#4fc1b3', '#9fb3c8'];
    return (
        <div
            aria-hidden="true"
            style={{
                position: 'absolute',
                display: 'flex',
                gap: '1px',
                zIndex: 24,
                pointerEvents: 'none',
                border: '0.5px solid #9fb3c8',
                background: '#ffffff',
                padding: '0.5px',
                ...style,
            }}
        >
            {swatches.map((hex) => (
                <span
                    key={hex}
                    style={{
                        display: 'block',
                        width: '7px',
                        height: '5px',
                        background: hex,
                    }}
                />
            ))}
        </div>
    );
}

function CornerCropMarks({ cropMarkColor = '#05070a' }) {
    return (
        <>
            {/* Top-Left Outer Bleed Crop Marks (0.02in..0.095in aligned to exact 0.125in trim) */}
            <span
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    top: '0.02in',
                    left: '0.125in',
                    width: '1px',
                    height: '0.075in',
                    background: cropMarkColor,
                    zIndex: 20,
                }}
            />
            <span
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    top: '0.125in',
                    left: '0.02in',
                    width: '0.075in',
                    height: '1px',
                    background: cropMarkColor,
                    zIndex: 20,
                }}
            />
            {/* Top-Right Outer Bleed Crop Marks */}
            <span
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    top: '0.02in',
                    right: '0.125in',
                    width: '1px',
                    height: '0.075in',
                    background: cropMarkColor,
                    zIndex: 20,
                }}
            />
            <span
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    top: '0.125in',
                    right: '0.02in',
                    width: '0.075in',
                    height: '1px',
                    background: cropMarkColor,
                    zIndex: 20,
                }}
            />
            {/* Bottom-Left Outer Bleed Crop Marks */}
            <span
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    bottom: '0.02in',
                    left: '0.125in',
                    width: '1px',
                    height: '0.075in',
                    background: cropMarkColor,
                    zIndex: 20,
                }}
            />
            <span
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    bottom: '0.125in',
                    left: '0.02in',
                    width: '0.075in',
                    height: '1px',
                    background: cropMarkColor,
                    zIndex: 20,
                }}
            />
            {/* Bottom-Right Outer Bleed Crop Marks */}
            <span
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    bottom: '0.02in',
                    right: '0.125in',
                    width: '1px',
                    height: '0.075in',
                    background: cropMarkColor,
                    zIndex: 20,
                }}
            />
            <span
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    bottom: '0.125in',
                    right: '0.02in',
                    width: '0.075in',
                    height: '1px',
                    background: cropMarkColor,
                    zIndex: 20,
                }}
            />
        </>
    );
}

export default function SmarterPokerMagazinePrintSheetPage({
    issueStatus = 'published',
    initialBleed = false,
    initialImposition = 'reader',
    manifest,
}) {
    const [showBleed, setShowBleed] = useState(Boolean(initialBleed));
    const [imposition, setImposition] = useState(
        initialImposition === 'booklet' ? 'booklet' : 'reader'
    );
    const isBooklet = imposition === 'booklet';

    const safeManifest = manifest || normalizeIssueManifest({});
    const pages = safeManifest.pages || [];

    const bookletSpreads = useMemo(() => {
        if (!pages.length) return [];
        const signatureAligned =
            pages.length >= 4 && pages.length % 4 === 0 ? pages : padPagesToSignature(pages);
        return computeSaddleStitchSpreads(signatureAligned);
    }, [pages]);

    const pageWidthIn = showBleed ? 8.625 : MAGAZINE_TRIM.widthIn;
    const pageHeightIn = showBleed ? 11.125 : MAGAZINE_TRIM.heightIn;
    const bookletWidthIn = showBleed ? 17.0 : 16.75;
    const bookletHeightIn = showBleed ? 11.125 : 10.875;

    const atPageRule = isBooklet
        ? showBleed
            ? '@page { size: 17.0in 11.125in; margin: 0; }'
            : '@page { size: 16.75in 10.875in; margin: 0; }'
        : showBleed
          ? '@page { size: 8.625in 11.125in; margin: 0; }'
          : '@page { size: 8.375in 10.875in; margin: 0; }';

    const printCss = [
        atPageRule,
        '@media print {',
        '  html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }',
        '  .sp-mag-print-toolbar, .sp-mag-screen-sig-banner, .approved-global-header, .approved-global-header__clearance, .sp-world-command-trigger, .messenger-dock, .messenger-previews, [data-global-footer], [data-global-bottom-nav], [data-bottom-nav-clearance], [data-offline-bar], [data-startup-prompt], .sp-pwa-install-bar, aside[aria-label="Return To Your Poker Seat"], aside[aria-label="Smarter.Poker Weekly Wire Subscription"] { display: none !important; }',
        '  .sp-mag-print-root { min-height: 0 !important; background: #ffffff !important; }',
        '  .sp-mag-print-canvas { padding: 0 !important; gap: 0 !important; background: #ffffff !important; }',
        '  .sp-mag-print-sheet { box-shadow: none !important; margin: 0 !important; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }',
        '  .sp-mag-print-sheet:last-child { page-break-after: auto !important; break-after: auto !important; }',
        '}',
    ].join('\n');

    const flipbookHref = `/hub/magazine/${safeManifest.slug}${issueStatus !== 'published' ? '?preview=1' : ''}`;
    const pdfDownloadHref = `/api/news/magazine-pdf?issue=${encodeURIComponent(safeManifest.slug)}&download=1${issueStatus !== 'published' ? '&preview=1' : ''}`;

    return (
        <>
            <Head>
                <title>{`Print Proof \u2022 ${safeManifest.title} | ${MAGAZINE_MASTHEAD}`}</title>
                <meta name="robots" content="noindex,nofollow" />
                <style dangerouslySetInnerHTML={{ __html: printCss }} />
            </Head>

            <div
                className="sp-mag-print-root"
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
                            {isBooklet
                                ? `Issue #${safeManifest.issueNumber} (${safeManifest.periodLabel}) \u2022 ${bookletSpreads.length} Printer's Spreads (${Math.max(1, bookletSpreads.length / 2)} Physical 17x11 Sheets) \u2022 Trim 16.75" \u00d7 10.875"${showBleed ? ' + 0.125" Full Bleed (17.0" \u00d7 11.125")' : ''}`
                                : `Issue #${safeManifest.issueNumber} (${safeManifest.periodLabel}) \u2022 ${pages.length} Sheets \u2022 Trim 8.375" \u00d7 10.875"${showBleed ? ' + 0.125" Full Bleed (8.625" \u00d7 11.125")' : ''}`}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <Link
                            href={flipbookHref}
                            style={{
                                background: '#102131',
                                border: '1px solid #1b2c3d',
                                color: '#60a5fa',
                                borderRadius: '8px',
                                padding: '8px 13px',
                                fontSize: '12.5px',
                                fontWeight: 800,
                                textDecoration: 'none',
                            }}
                        >
                            &larr; Back To Flipbook
                        </Link>

                        <div
                            role="group"
                            aria-label="Press Imposition Layout Mode"
                            style={{
                                display: 'inline-flex',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                border: '1px solid #1b2c3d',
                                background: '#05070a',
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setImposition('reader')}
                                style={{
                                    background: !isBooklet ? '#4fc1b3' : '#05070a',
                                    color: !isBooklet ? '#05070a' : '#9fb3c8',
                                    border: 'none',
                                    padding: '8px 12px',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                }}
                            >
                                {"Reader's Spreads"} ({pages.length || 44} Pages)
                            </button>
                            <button
                                type="button"
                                onClick={() => setImposition('booklet')}
                                style={{
                                    background: isBooklet ? '#4fc1b3' : '#05070a',
                                    color: isBooklet ? '#05070a' : '#9fb3c8',
                                    border: 'none',
                                    borderLeft: '1px solid #1b2c3d',
                                    padding: '8px 12px',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                }}
                            >
                                {"Saddle-Stitch Printer's Spreads"} ({bookletSpreads.length || 22} Sheets, 17x11)
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowBleed((b) => !b)}
                            style={{
                                background: showBleed ? '#60a5fa' : '#05070a',
                                color: showBleed ? '#05070a' : '#ffffff',
                                border: '1px solid #60a5fa',
                                borderRadius: '8px',
                                padding: '8px 13px',
                                fontSize: '12.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                            }}
                        >
                            Toggle Crop Marks &amp; Bleed
                        </button>

                        <a
                            href={pdfDownloadHref}
                            style={{
                                background: '#102131',
                                border: '1px solid #4fc1b3',
                                color: '#4fc1b3',
                                borderRadius: '8px',
                                padding: '8px 14px',
                                fontSize: '12.5px',
                                fontWeight: 800,
                                textDecoration: 'none',
                            }}
                        >
                            Download 44-Page PDF
                        </a>

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
                                padding: '9px 16px',
                                fontSize: '12.5px',
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
                        overflowX: 'auto',
                    }}
                >
                    {isBooklet
                        ? bookletSpreads.map((spread, idx) => {
                              const leftDark = DARK_BLEED_PAGE_KINDS.has(String(spread.leftPage?.kind || ''));
                              const rightDark = DARK_BLEED_PAGE_KINDS.has(String(spread.rightPage?.kind || ''));
                              const isOuterDark = leftDark && rightDark;
                              const cropMarkColor = isOuterDark ? '#9fb3c8' : '#05070a';
                              const isLastSheet = idx >= bookletSpreads.length - 1;
                              const sigLabel =
                                  spread.label ||
                                  `Sig ${spread.signatureNumber} ${spread.side === 'front' ? 'Front' : 'Back'} [P.${spread.leftPageNumber} | P.${spread.rightPageNumber}]`;

                              return (
                                  <section
                                      key={`booklet-${spread.spreadIndex}`}
                                      className="sp-mag-print-sheet"
                                      data-signature={spread.signatureNumber}
                                      data-signature-side={spread.side}
                                      style={{
                                          width: `${bookletWidthIn}in`,
                                          height: `${bookletHeightIn}in`,
                                          padding: showBleed ? '0.125in' : '0',
                                          boxSizing: 'border-box',
                                          position: 'relative',
                                          background: showBleed && isOuterDark ? '#05070a' : '#ffffff',
                                          boxShadow: '0 18px 48px rgba(0, 0, 0, 0.75)',
                                          pageBreakAfter: isLastSheet ? 'auto' : 'always',
                                          breakAfter: isLastSheet ? 'auto' : 'page',
                                      }}
                                  >
                                      {/* Screen-only Signature Identifier Tab above spread */}
                                      <div
                                          className="sp-mag-screen-sig-banner"
                                          style={{
                                              position: 'absolute',
                                              top: '-22px',
                                              left: '0',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '10px',
                                              fontSize: '11px',
                                              fontWeight: 800,
                                              color: '#4fc1b3',
                                              letterSpacing: '0.6px',
                                          }}
                                      >
                                          <span>{sigLabel}</span>
                                          <span style={{ color: '#9fb3c8', fontWeight: 600 }}>
                                              {`Sheet ${spread.signatureNumber} Of ${bookletSpreads.length / 2} \u2022 Saddle-Stitch Center Spine`}
                                          </span>
                                      </div>

                                      {/* Center Spine Fold Marks & Slug Metadata */}
                                      <span
                                          aria-hidden="true"
                                          style={{
                                              position: 'absolute',
                                              top: 0,
                                              bottom: 0,
                                              left: '50%',
                                              width: '0',
                                              borderLeft: '1px dashed rgba(15, 23, 42, 0.28)',
                                              zIndex: 22,
                                              pointerEvents: 'none',
                                          }}
                                      />

                                      {showBleed && (
                                          <>
                                              <CornerCropMarks cropMarkColor={cropMarkColor} />
                                              {/* Center Spine Fold Tick Marks in Top & Bottom Bleed Slug */}
                                              <span
                                                  aria-hidden="true"
                                                  style={{
                                                      position: 'absolute',
                                                      top: '0.015in',
                                                      left: '50%',
                                                      width: '1px',
                                                      height: '0.09in',
                                                      background: cropMarkColor,
                                                      zIndex: 24,
                                                  }}
                                              />
                                              <span
                                                  aria-hidden="true"
                                                  style={{
                                                      position: 'absolute',
                                                      bottom: '0.015in',
                                                      left: '50%',
                                                      width: '1px',
                                                      height: '0.09in',
                                                      background: cropMarkColor,
                                                      zIndex: 24,
                                                  }}
                                              />
                                              <RegistrationBullseye
                                                  color={cropMarkColor}
                                                  style={{ top: '0.01in', left: '25%' }}
                                              />
                                              <RegistrationBullseye
                                                  color={cropMarkColor}
                                                  style={{ top: '0.01in', right: '25%' }}
                                              />
                                              <RegistrationBullseye
                                                  color={cropMarkColor}
                                                  style={{ bottom: '0.01in', left: '25%' }}
                                              />
                                              <VanguardColorBars style={{ bottom: '0.02in', right: '0.35in' }} />
                                              <span
                                                  aria-hidden="true"
                                                  style={{
                                                      position: 'absolute',
                                                      top: '0.018in',
                                                      left: '0.32in',
                                                      fontSize: '6.5px',
                                                      fontWeight: 800,
                                                      letterSpacing: '0.5px',
                                                      color: cropMarkColor,
                                                      zIndex: 24,
                                                  }}
                                              >
                                                  {`${MAGAZINE_MASTHEAD} \u2022 Issue #${safeManifest.issueNumber} \u2022 ${sigLabel}`}
                                              </span>
                                          </>
                                      )}

                                      <div
                                          style={{
                                              display: 'flex',
                                              width: '16.75in',
                                              height: '10.875in',
                                          }}
                                      >
                                          <MagazinePageSheet
                                              page={spread.leftPage}
                                              issueMeta={safeManifest}
                                              mode="print"
                                              style={{ width: '8.375in', height: '10.875in', aspectRatio: 'auto' }}
                                          />
                                          <MagazinePageSheet
                                              page={spread.rightPage}
                                              issueMeta={safeManifest}
                                              mode="print"
                                              style={{ width: '8.375in', height: '10.875in', aspectRatio: 'auto' }}
                                          />
                                      </div>
                                  </section>
                              );
                          })
                        : pages.map((page, idx) => {
                              const isDarkBleed = DARK_BLEED_PAGE_KINDS.has(String(page?.kind || ''));
                              const cropMarkColor = isDarkBleed ? '#9fb3c8' : '#05070a';
                              const isLastSheet = idx >= pages.length - 1;
                              return (
                                  <section
                                      key={page.pageNumber}
                                      className="sp-mag-print-sheet"
                                      style={{
                                          width: `${pageWidthIn}in`,
                                          height: `${pageHeightIn}in`,
                                          padding: showBleed ? '0.125in' : '0',
                                          boxSizing: 'border-box',
                                          position: 'relative',
                                          background: showBleed && isDarkBleed ? '#05070a' : '#ffffff',
                                          boxShadow: '0 18px 48px rgba(0, 0, 0, 0.75)',
                                          pageBreakAfter: isLastSheet ? 'auto' : 'always',
                                          breakAfter: isLastSheet ? 'auto' : 'page',
                                      }}
                                  >
                                      {showBleed && (
                                          <>
                                              <CornerCropMarks cropMarkColor={cropMarkColor} />
                                              <RegistrationBullseye
                                                  color={cropMarkColor}
                                                  style={{ top: '0.01in', left: '50%', transform: 'translateX(-50%)' }}
                                              />
                                              <VanguardColorBars style={{ bottom: '0.02in', right: '0.32in' }} />
                                          </>
                                      )}

                                      <MagazinePageSheet
                                          page={page}
                                          issueMeta={safeManifest}
                                          mode="print"
                                          style={{ width: '8.375in', height: '10.875in', aspectRatio: 'auto' }}
                                      />
                                  </section>
                              );
                          })}
                </main>
            </div>
        </>
    );
}
