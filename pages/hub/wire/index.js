import Head from 'next/head';
import Link from 'next/link';
import { createClient } from '../../../src/lib/supabaseServerClient';
import * as wireEngine from '../../../src/lib/newsletter/weeklyWireEngine.mjs';

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

function formatIssueDate(iso) {
    if (!iso) return 'Current Issue';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Current Issue';
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export async function getServerSideProps({ res }) {
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

    let editions = [];
    let livePreview = null;

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

        const numbered = wireRows.map((row, idx) => {
            const parsed = parseSubjectEditionNumber(row.subject);
            let editionNumber = parsed && !usedNumbers.has(parsed) ? parsed : idx + 1;
            while (usedNumbers.has(editionNumber)) {
                editionNumber += 1;
            }
            usedNumbers.add(editionNumber);
            const rawIds = Array.isArray(row.article_ids) ? row.article_ids : [];
            return {
                id: String(row.id),
                editionNumber,
                subject: String(row.subject || `Smarter.Poker Weekly Wire #${editionNumber}`).replace(/[—–]/g, '-'),
                sentAt: row.completed_at || row.created_at || null,
                sentCount: Number(row.sent_count || row.recipient_count || 0),
                itemCount: rawIds.length,
            };
        });

        editions = numbered.reverse();

        try {
            const curated = await wireEngine.curateWeeklyWireEdition(sb, {
                days: 7,
                articleLimit: 3,
                updateLimit: 2,
                enrichMetaDescriptions: false,
            });
            livePreview = {
                editionNumber: Number(curated?.editionNumber || (editions[0]?.editionNumber || 0) + 1),
                subject: String(curated?.subject || 'Smarter.Poker Weekly Wire').replace(/[—–]/g, '-'),
                leadUpdate: curated?.platformUpdates?.[0]
                    ? {
                          badge: String(curated.platformUpdates[0].badge || 'Platform Upgrade'),
                          title: String(curated.platformUpdates[0].title || ''),
                      }
                    : null,
                leadStory: curated?.articles?.[0]
                    ? {
                          title: String(curated.articles[0].title || ''),
                          sourceName: String(curated.articles[0].source_name || 'Poker Wire'),
                      }
                    : null,
                toolTitle: curated?.toolSpotlight?.title ? String(curated.toolSpotlight.title) : '',
            };
        } catch {
            livePreview = null;
        }
    } catch (err) {
        console.warn('[wire/index] SSR load warning:', err?.message || err);
    }

    return {
        props: {
            editions,
            livePreview,
        },
    };
}

export default function WeeklyWireArchivePage({ editions = [], livePreview = null }) {
    const canonicalUrl = 'https://smarter.poker/hub/wire';
    const pageTitle = 'Smarter.Poker Weekly Wire Archive | Poker News, GTO Spots & Upgrades';
    const pageDesc =
        'Read Every Issue Of The Smarter.Poker Weekly Wire: Curated World Poker News, Solver Decision Spots, Pro Poker Calculators, And Platform Upgrades.';

    return (
        <>
            <Head>
                <title>{pageTitle}</title>
                <meta name="description" content={pageDesc} />
                <link key="canonical" rel="canonical" href={canonicalUrl} />
                <meta key="og-url" property="og:url" content={canonicalUrl} />
                <meta key="og-title" property="og:title" content={pageTitle} />
                <meta key="og-description" property="og:description" content={pageDesc} />
                <meta key="twitter-title" name="twitter:title" content={pageTitle} />
                <meta key="twitter-description" name="twitter:description" content={pageDesc} />
            </Head>

            <main
                style={{
                    minHeight: '100vh',
                    background: '#05070a',
                    color: '#ffffff',
                    padding: '44px 16px 120px 16px',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                }}
            >
                <div style={{ maxWidth: '880px', margin: '0 auto' }}>
                    <header
                        style={{
                            background: '#0b1118',
                            border: '1px solid #1b2c3d',
                            borderRadius: '18px',
                            padding: '32px 28px',
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
                                    letterSpacing: '2.8px',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Smarter.Poker Intelligence Dispatch
                            </span>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <Link
                                    href="/hub/news"
                                    style={{
                                        color: '#60a5fa',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        textDecoration: 'none',
                                    }}
                                >
                                    Live News Hub &rarr;
                                </Link>
                                <Link
                                    href="/hub/club-arena/"
                                    style={{
                                        color: '#4fc1b3',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        textDecoration: 'none',
                                    }}
                                >
                                    Enter Club Arena &rarr;
                                </Link>
                            </div>
                        </div>

                        <h1
                            style={{
                                margin: '0 0 10px 0',
                                fontSize: 'clamp(26px, 4.2vw, 36px)',
                                fontWeight: 800,
                                lineHeight: 1.2,
                                color: '#ffffff',
                            }}
                        >
                            Smarter.Poker Weekly Wire Archive
                        </h1>
                        <p style={{ margin: 0, color: '#b7cadc', fontSize: '15px', lineHeight: 1.6, maxWidth: '700px' }}>
                            Browse Every Published Weekly Wire Edition Featuring Curated World Poker Storylines, Solver Decision Spots, Pro Calculator Spotlights, And Smarter.Poker Platform Upgrades.
                        </p>
                    </header>

                    {livePreview && (
                        <section
                            aria-label="Current Curated Issue Preview"
                            style={{
                                background: '#101a24',
                                border: '1px solid #1b2c3d',
                                borderLeft: '4px solid #4fc1b3',
                                borderRadius: '16px',
                                padding: '24px 24px',
                                marginBottom: '28px',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '10px',
                                    marginBottom: '8px',
                                }}
                            >
                                <span
                                    style={{
                                        color: '#4fc1b3',
                                        fontSize: '11.5px',
                                        fontWeight: 800,
                                        letterSpacing: '1.8px',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    Next Curated Desk &middot; Edition #{livePreview.editionNumber}
                                </span>
                                <Link
                                    href={`/hub/wire/${livePreview.editionNumber}`}
                                    style={{
                                        display: 'inline-block',
                                        background: '#4fc1b3',
                                        color: '#05070a',
                                        textDecoration: 'none',
                                        fontSize: '13px',
                                        fontWeight: 800,
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                    }}
                                >
                                    Open Live Web Edition &rarr;
                                </Link>
                            </div>

                            <h2 style={{ margin: '6px 0 12px 0', fontSize: '20px', fontWeight: 800, color: '#ffffff', lineHeight: 1.3 }}>
                                {livePreview.subject}
                            </h2>

                            <div style={{ display: 'grid', gap: '8px', color: '#b7cadc', fontSize: '13.5px', lineHeight: 1.5 }}>
                                {livePreview.leadUpdate?.title && (
                                    <div>
                                        <strong style={{ color: '#60a5fa' }}>Platform Upgrade:</strong> {livePreview.leadUpdate.title}
                                    </div>
                                )}
                                {livePreview.leadStory?.title && (
                                    <div>
                                        <strong style={{ color: '#4fc1b3' }}>Top Poker Story:</strong> {livePreview.leadStory.title} ({livePreview.leadStory.sourceName})
                                    </div>
                                )}
                                {livePreview.toolTitle && (
                                    <div>
                                        <strong style={{ color: '#ffffff' }}>Featured Tool:</strong> {livePreview.toolTitle}
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    <section aria-label="Published Weekly Wire Editions">
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '14px',
                            }}
                        >
                            <h2
                                style={{
                                    margin: 0,
                                    fontSize: '15px',
                                    fontWeight: 800,
                                    letterSpacing: '1.6px',
                                    textTransform: 'uppercase',
                                    color: '#60a5fa',
                                }}
                            >
                                Published Editions
                            </h2>
                            <span style={{ color: '#8fa6bc', fontSize: '13px', fontWeight: 600 }}>
                                {editions.length} {editions.length === 1 ? 'Issue' : 'Issues'} Archived
                            </span>
                        </div>

                        {editions.length === 0 ? (
                            <div
                                style={{
                                    background: '#0b1118',
                                    border: '1px solid #1b2c3d',
                                    borderRadius: '14px',
                                    padding: '28px 24px',
                                    color: '#b7cadc',
                                    fontSize: '14.5px',
                                    lineHeight: 1.6,
                                }}
                            >
                                Past Dispatched Editions Appear Here Automatically As Each Weekly Issue Sends. Open The Current Live Desk Above Or Explore Our Free Poker Tools Below.
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '14px' }}>
                                {editions.map((ed) => (
                                    <Link
                                        key={ed.id}
                                        href={`/hub/wire/${ed.editionNumber}`}
                                        style={{
                                            display: 'block',
                                            background: '#0b1118',
                                            border: '1px solid #1b2c3d',
                                            borderRadius: '14px',
                                            padding: '20px 22px',
                                            textDecoration: 'none',
                                            color: '#ffffff',
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                flexWrap: 'wrap',
                                                gap: '8px',
                                                marginBottom: '6px',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    color: '#4fc1b3',
                                                    fontSize: '12px',
                                                    fontWeight: 800,
                                                    letterSpacing: '1.5px',
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                Edition #{ed.editionNumber}
                                            </span>
                                            <span style={{ color: '#8fa6bc', fontSize: '12.5px', fontWeight: 600 }}>
                                                {formatIssueDate(ed.sentAt)}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '18px', fontWeight: 800, lineHeight: 1.35, color: '#ffffff', marginBottom: '8px' }}>
                                            {ed.subject}
                                        </div>
                                        <div style={{ color: '#60a5fa', fontSize: '13px', fontWeight: 700 }}>
                                            Read Full Web Edition &rarr;
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </section>

                    <section
                        aria-label="Smarter.Poker Quick Destinations"
                        style={{
                            marginTop: '34px',
                            background: '#0b1118',
                            border: '1px solid #1b2c3d',
                            borderRadius: '16px',
                            padding: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '16px',
                        }}
                    >
                        <div>
                            <div style={{ color: '#4fc1b3', fontSize: '11.5px', fontWeight: 800, letterSpacing: '1.6px', textTransform: 'uppercase' }}>
                                Train &amp; Play Free On Smarter.Poker
                            </div>
                            <div style={{ color: '#ffffff', fontSize: '18px', fontWeight: 800, marginTop: '4px' }}>
                                42 Pro Poker Calculators, GTO Hand Lab &amp; Kings Club Action
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <Link
                                href="/tools"
                                style={{
                                    display: 'inline-block',
                                    background: '#101a24',
                                    border: '1px solid #1b2c3d',
                                    color: '#60a5fa',
                                    textDecoration: 'none',
                                    fontWeight: 800,
                                    fontSize: '13.5px',
                                    padding: '10px 16px',
                                    borderRadius: '8px',
                                }}
                            >
                                Explore All 42 Tools
                            </Link>
                            <Link
                                href="/hub/club-arena/"
                                style={{
                                    display: 'inline-block',
                                    background: '#4fc1b3',
                                    color: '#05070a',
                                    textDecoration: 'none',
                                    fontWeight: 800,
                                    fontSize: '13.5px',
                                    padding: '10px 18px',
                                    borderRadius: '8px',
                                }}
                            >
                                Play In Club Arena
                            </Link>
                        </div>
                    </section>
                </div>
            </main>
        </>
    );
}
