/**
 * Dynamic OpenGraph Smarter.Poker Magazine Social Card Generator
 * GET /api/og/magazine-card?issue=2026-11&issueNum=1&vol=1&page=20&dept=POY+Standings&headline=...&sub=...
 *
 * Generates an authoritative, branded 1200x630 social card using @vercel/og (Satori)
 * for any Smarter.Poker Magazine issue or deep-linked page spread (1..44).
 * Every JSX element MUST have display:'flex' for Satori compatibility.
 */
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

// Built-in font covers Latin text. Keep ASCII/Latin-1 characters and strip
// em/en dashes, dollar signs on chip contexts, and unsupported glyphs so Satori
// never attempts runtime font downloads.
export function cardText(value, fallback = '') {
    const cleaned = String(value ?? '')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/&mdash;|&ndash;/gi, '-')
        .replace(/[^\u0020-\u007E]/g, ' ')
        .replace(/\$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || fallback;
}

function clampText(text, maxLen) {
    if (text.length <= maxLen) return text;
    return `${text.slice(0, Math.max(0, maxLen - 3)).trim()}...`;
}

function clampPage(raw, totalPages = 44) {
    const n = parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(Math.max(1, n), Math.max(1, totalPages));
}

export default async function handler(req) {
    try {
        const { searchParams } = new URL(req.url);
        const issue = cardText(searchParams.get('issue'), '2026-11').slice(0, 32);
        const rawVol = parseInt(String(searchParams.get('vol') || '1'), 10);
        const vol = Number.isFinite(rawVol) && rawVol > 0 ? Math.min(999, rawVol) : 1;
        const rawIssueNum = parseInt(String(searchParams.get('issueNum') || '1'), 10);
        const issueNum = Number.isFinite(rawIssueNum) && rawIssueNum > 0 ? Math.min(9999, rawIssueNum) : 1;
        const rawPages = parseInt(String(searchParams.get('pages') || '44'), 10);
        const totalPages = Number.isFinite(rawPages) && rawPages >= 36 ? Math.min(96, rawPages) : 44;
        const pageNum = clampPage(searchParams.get('page'), totalPages);

        const dept = clampText(
            cardText(
                searchParams.get('dept'),
                pageNum && pageNum > 1 ? 'Featured Magazine Spread' : 'Monthly Print & Digital Edition'
            ),
            44
        ).toUpperCase();

        const headline = clampText(
            cardText(
                searchParams.get('headline'),
                pageNum && pageNum > 1
                    ? `Smarter.Poker Magazine Page ${pageNum} Spread`
                    : `Smarter.Poker Magazine Issue #${issueNum}`
            ),
            92
        );

        const sub = clampText(
            cardText(
                searchParams.get('sub'),
                '44 Pages Of GTO Strategy Columns, Global POY Standings, Live Tour Radar & Kings Club 25450 Action'
            ),
            150
        );

        const folioLine = pageNum
            ? `PAGE ${pageNum} OF ${totalPages} - VOL. ${vol} ISSUE #${issueNum} (${issue.toUpperCase()})`
            : `44-PAGE EDITION - VOL. ${vol} ISSUE #${issueNum} (${issue.toUpperCase()})`;

        const sharePath = pageNum && pageNum > 1
            ? `smarter.poker/hub/magazine/${issue}?page=${pageNum}`
            : `smarter.poker/hub/magazine/${issue}`;

        const headlineFontSize = headline.length > 68 ? 40 : headline.length > 46 ? 46 : 52;

        return new ImageResponse(
            (
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        background: 'linear-gradient(135deg, #05070a 0%, #0b1520 52%, #102131 100%)',
                        fontFamily: 'sans-serif',
                        padding: '50px 60px',
                        position: 'relative',
                        color: '#ffffff',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: 8,
                            background: 'linear-gradient(90deg, #4fc1b3 0%, #60a5fa 100%)',
                        }}
                    />

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            width: '100%',
                            borderBottom: '2px solid #102131',
                            paddingBottom: 20,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    fontSize: 28,
                                    fontWeight: 900,
                                    color: '#ffffff',
                                    letterSpacing: 2,
                                }}
                            >
                                SMARTER.POKER
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    marginLeft: 14,
                                    background: '#4fc1b3',
                                    color: '#05070a',
                                    padding: '5px 12px',
                                    borderRadius: 6,
                                    fontSize: 15,
                                    fontWeight: 900,
                                    letterSpacing: 2.2,
                                }}
                            >
                                MAGAZINE
                            </div>
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                background: '#05070a',
                                border: '1px solid #4fc1b3',
                                color: '#4fc1b3',
                                padding: '7px 16px',
                                borderRadius: 999,
                                fontSize: 14,
                                fontWeight: 800,
                                letterSpacing: 1.4,
                            }}
                        >
                            {folioLine}
                        </div>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'stretch',
                            justifyContent: 'space-between',
                            width: '100%',
                            marginTop: 18,
                            marginBottom: 18,
                            flex: 1,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                flex: 1,
                                paddingRight: 36,
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    marginBottom: 14,
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        background: '#102131',
                                        border: '1px solid #60a5fa',
                                        color: '#60a5fa',
                                        fontSize: 14,
                                        fontWeight: 800,
                                        letterSpacing: 1.8,
                                        padding: '5px 12px',
                                        borderRadius: 6,
                                    }}
                                >
                                    {dept}
                                </div>
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    fontSize: headlineFontSize,
                                    fontWeight: 900,
                                    lineHeight: 1.14,
                                    color: '#ffffff',
                                    letterSpacing: -0.5,
                                    marginBottom: 16,
                                }}
                            >
                                {headline}
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    fontSize: 22,
                                    fontWeight: 600,
                                    lineHeight: 1.4,
                                    color: '#60a5fa',
                                }}
                            >
                                {sub}
                            </div>
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                width: 228,
                                background: '#05070a',
                                border: '2px solid #4fc1b3',
                                borderRadius: 14,
                                padding: '20px 20px',
                                flexShrink: 0,
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: 12,
                                        fontWeight: 800,
                                        letterSpacing: 1.6,
                                        color: '#4fc1b3',
                                        marginBottom: 6,
                                    }}
                                >
                                    {pageNum ? 'SPREAD CLIP' : 'PRINT & DIGITAL'}
                                </div>
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: 44,
                                        fontWeight: 900,
                                        color: '#ffffff',
                                        lineHeight: 1.05,
                                    }}
                                >
                                    {pageNum ? `P.${pageNum}` : `NO.${issueNum}`}
                                </div>
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: 14,
                                        fontWeight: 700,
                                        color: '#60a5fa',
                                        marginTop: 6,
                                    }}
                                >
                                    {pageNum ? `Of ${totalPages} Pages` : `${totalPages} Total Pages`}
                                </div>
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    borderTop: '1px solid #102131',
                                    paddingTop: 12,
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: 12,
                                        fontWeight: 800,
                                        color: '#4fc1b3',
                                        letterSpacing: 1.2,
                                        marginBottom: 4,
                                    }}
                                >
                                    8.375 X 10.875 SPEC
                                </div>
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: 13,
                                        fontWeight: 700,
                                        color: '#ffffff',
                                    }}
                                >
                                    Interactive Flipbook
                                </div>
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            width: '100%',
                            borderTop: '1px solid #102131',
                            paddingTop: 18,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                fontSize: 16,
                                fontWeight: 700,
                                color: '#4fc1b3',
                            }}
                        >
                            Read Two-Page Flipbook, GTO Solver Labs & Cardroom Print Editions
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                fontSize: 17,
                                fontWeight: 800,
                                color: '#ffffff',
                                letterSpacing: 0.4,
                            }}
                        >
                            {sharePath}
                        </div>
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
                headers: {
                    'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
                },
            }
        );
    } catch (err) {
        return new Response(`Failed to generate magazine card: ${cardText(err?.message, 'error')}`, {
            status: 500,
        });
    }
}
