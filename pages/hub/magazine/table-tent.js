import Head from 'next/head';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
    FALLBACK_MAGAZINE_IMAGE,
    handleMagazineImageError,
} from '../../../src/components/magazine/MagazineSpreadRenderer.js';
import {
    MAGAZINE_MASTHEAD,
    MAGAZINE_SITE_URL,
    buildMagazineQrDataUri,
    formatPeriodLabel,
    normalizeMagazineUsState,
    stripMagazineDashes,
} from '../../../src/lib/magazine/magazineSchema.mjs';

const US_STATE_CODES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];

const VENUE_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,95}$/i;

function sanitizeVenueSlug(raw) {
    const cleaned = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/^\/+|\/+$/g, '')
        .replace(/^hub\/venues\//, '');
    return VENUE_SLUG_RE.test(cleaned) ? cleaned : '';
}

const safeQueryValue = (val) => (Array.isArray(val) ? String(val[0] || '') : val == null ? '' : String(val));

export async function getServerSideProps({ query, res }) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');

    const initialRoom = stripMagazineDashes(safeQueryValue(query?.room)).slice(0, 96);
    const initialCity = stripMagazineDashes(safeQueryValue(query?.city)).slice(0, 64);
    const initialState = normalizeMagazineUsState(safeQueryValue(query?.state)) || '';
    const initialSlug = sanitizeVenueSlug(safeQueryValue(query?.slug));
    const rawSize = safeQueryValue(query?.size).trim().toLowerCase();
    const initialSize = rawSize === '5x7' ? '5x7' : '4x6';

    let latestIssue = null;
    try {
        const { createClient } = await import('../../../src/lib/supabaseServerClient.js');
        const sb = createClient();
        const { data: rows } = await sb
            .from('magazine_issues')
            .select(
                'id, issue_number, volume_number, issue_period, slug, title, cover_headline, cover_subheadline, cover_image_url'
            )
            .eq('status', 'published')
            .order('issue_number', { ascending: false })
            .limit(1);

        if (Array.isArray(rows) && rows.length > 0 && rows[0]) {
            const r = rows[0];
            latestIssue = {
                issueNumber: Math.max(1, Number(r.issue_number || 1)),
                volumeNumber: Math.max(1, Number(r.volume_number || 1)),
                issuePeriod: String(r.issue_period || ''),
                periodLabel: formatPeriodLabel(r.issue_period),
                slug: String(r.slug || r.issue_period || 'latest'),
                title: stripMagazineDashes(r.title || MAGAZINE_MASTHEAD),
                coverHeadline: stripMagazineDashes(r.cover_headline || 'Inside The Month In Poker'),
                coverImageUrl: String(r.cover_image_url || FALLBACK_MAGAZINE_IMAGE),
            };
        }
    } catch (err) {
        console.warn('[magazine/table-tent] SSR fallback:', err?.message || err);
    }

    return {
        props: {
            initialRoom,
            initialCity,
            initialState,
            initialSlug,
            initialSize,
            latestIssue,
        },
    };
}

function TableTentFaceCard({
    roomDisplayName,
    locationLabel,
    issueBadgeLabel,
    coverHeadline,
    coverImageUrl,
    magazineQrDataUri,
    venueQrDataUri,
    venueShortPath,
    compact = false,
}) {
    return (
        <div
            style={{
                width: compact ? '4in' : '5in',
                height: compact ? '6in' : '7in',
                background: '#05070a',
                color: '#ffffff',
                border: '2px solid #4fc1b3',
                borderRadius: '12px',
                padding: compact ? '0.22in' : '0.28in',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Header Strip */}
            <div style={{ borderBottom: '1.5px solid #1b2c3d', paddingBottom: compact ? '8px' : '10px' }}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px',
                    }}
                >
                    <span
                        style={{
                            fontSize: compact ? '8.5px' : '9.5px',
                            fontWeight: 900,
                            letterSpacing: '1.6px',
                            textTransform: 'uppercase',
                            color: '#4fc1b3',
                        }}
                    >
                        Official Cardroom Partner
                    </span>
                    <span
                        style={{
                            fontSize: compact ? '8px' : '9px',
                            fontWeight: 800,
                            color: '#60a5fa',
                            background: '#102131',
                            padding: '2px 7px',
                            borderRadius: '999px',
                            border: '1px solid #1b2c3d',
                        }}
                    >
                        {issueBadgeLabel}
                    </span>
                </div>
                <div
                    style={{
                        fontSize: compact ? '17px' : '21px',
                        fontWeight: 900,
                        lineHeight: 1.15,
                        color: '#ffffff',
                        fontFamily: "Georgia, 'Times New Roman', serif",
                    }}
                >
                    {roomDisplayName}
                </div>
                {locationLabel && (
                    <div
                        style={{
                            fontSize: compact ? '10px' : '11.5px',
                            fontWeight: 700,
                            color: '#9fb3c8',
                            marginTop: '2px',
                        }}
                    >
                        {locationLabel}
                    </div>
                )}
            </div>

            {/* Cover Feature Strip */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: compact ? '10px' : '12px',
                    background: '#0b1520',
                    border: '1px solid #1b2c3d',
                    borderRadius: '10px',
                    padding: compact ? '8px 10px' : '10px 12px',
                }}
            >
                <img
                    src={coverImageUrl || FALLBACK_MAGAZINE_IMAGE}
                    alt="Current Smarter.Poker Magazine Cover"
                    onError={handleMagazineImageError}
                    style={{
                        width: compact ? '52px' : '64px',
                        height: compact ? '68px' : '84px',
                        objectFit: 'cover',
                        borderRadius: '6px',
                        border: '1px solid #4fc1b3',
                        background: '#102131',
                        flexShrink: 0,
                    }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                        style={{
                            fontSize: compact ? '8.5px' : '9.5px',
                            fontWeight: 900,
                            letterSpacing: '1.3px',
                            textTransform: 'uppercase',
                            color: '#4fc1b3',
                            marginBottom: '3px',
                        }}
                    >
                        While You Wait For Your Seat
                    </div>
                    <div
                        style={{
                            fontSize: compact ? '11.5px' : '13.5px',
                            fontWeight: 800,
                            lineHeight: 1.25,
                            color: '#ffffff',
                        }}
                    >
                        {coverHeadline}
                    </div>
                    <div
                        style={{
                            fontSize: compact ? '9px' : '10px',
                            color: '#9fb3c8',
                            marginTop: '4px',
                            lineHeight: 1.3,
                        }}
                    >
                        44 Pages Of GTO Strategy, Top 25 POY Standings, And Live Tour Schedules.
                    </div>
                </div>
            </div>

            {/* Dual High-Contrast ISO 18004 QR Codes */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: compact ? '8px' : '12px',
                }}
            >
                <div
                    style={{
                        background: '#0b1520',
                        border: '1.5px solid #4fc1b3',
                        borderRadius: '10px',
                        padding: compact ? '8px' : '11px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                    }}
                >
                    <div
                        style={{
                            background: '#ffffff',
                            padding: '5px',
                            borderRadius: '8px',
                            marginBottom: '6px',
                        }}
                    >
                        <img
                            src={magazineQrDataUri}
                            alt="Scan To Read Smarter.Poker Magazine Free"
                            onError={handleMagazineImageError}
                            style={{
                                width: compact ? '1.08in' : '1.36in',
                                height: compact ? '1.08in' : '1.36in',
                                display: 'block',
                            }}
                        />
                    </div>
                    <div
                        style={{
                            fontSize: compact ? '9.5px' : '11px',
                            fontWeight: 900,
                            lineHeight: 1.22,
                            color: '#ffffff',
                        }}
                    >
                        {"Read This Month's Smarter.Poker Magazine Free"}
                    </div>
                    <div
                        className="no-capitalize"
                        style={{
                            fontSize: compact ? '7.5px' : '8.5px',
                            color: '#4fc1b3',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            marginTop: '3px',
                        }}
                    >
                        {'smarter.poker/hub/magazine'}
                    </div>
                </div>

                <div
                    style={{
                        background: '#0b1520',
                        border: '1.5px solid #60a5fa',
                        borderRadius: '10px',
                        padding: compact ? '8px' : '11px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                    }}
                >
                    <div
                        style={{
                            background: '#ffffff',
                            padding: '5px',
                            borderRadius: '8px',
                            marginBottom: '6px',
                        }}
                    >
                        <img
                            src={venueQrDataUri}
                            alt="Scan For Live Action And Tournament Schedule"
                            onError={handleMagazineImageError}
                            style={{
                                width: compact ? '1.08in' : '1.36in',
                                height: compact ? '1.08in' : '1.36in',
                                display: 'block',
                            }}
                        />
                    </div>
                    <div
                        style={{
                            fontSize: compact ? '9.5px' : '11px',
                            fontWeight: 900,
                            lineHeight: 1.22,
                            color: '#ffffff',
                        }}
                    >
                        Live Action &amp; Tournament Schedule
                    </div>
                    <div
                        className="no-capitalize"
                        style={{
                            fontSize: compact ? '7.5px' : '8.5px',
                            color: '#60a5fa',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            marginTop: '3px',
                            wordBreak: 'break-all',
                        }}
                    >
                        {venueShortPath}
                    </div>
                </div>
            </div>

            {/* Footer Masthead Bar */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid #1b2c3d',
                    paddingTop: compact ? '6px' : '8px',
                    fontSize: compact ? '8px' : '9px',
                    fontWeight: 800,
                    color: '#9fb3c8',
                }}
            >
                <span style={{ color: '#4fc1b3', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                    {MAGAZINE_MASTHEAD}
                </span>
                <span>Scan With Any Phone Camera &bull; Free Instant Access</span>
            </div>
        </div>
    );
}

export default function CardroomTableTentKitPage({
    initialRoom = '',
    initialCity = '',
    initialState = '',
    initialSlug = '',
    initialSize = '4x6',
    latestIssue = null,
}) {
    const [roomName, setRoomName] = useState(initialRoom || '');
    const [city, setCity] = useState(initialCity || '');
    const [stateCode, setStateCode] = useState(initialState || '');
    const [venueSlugInput, setVenueSlugInput] = useState(initialSlug || '');
    const [signSize, setSignSize] = useState(initialSize === '5x7' ? '5x7' : '4x6');

    const pageTitle = 'Cardroom QR Table-Tent Kit | Smarter.Poker';
    const pageDesc =
        'Generate And Print 300-DPI 4x6 Waiting-List Table Tents And 5x7 Brush-Stand QR Signs For Your Poker Room Floor.';
    const canonicalUrl = `${MAGAZINE_SITE_URL}/hub/magazine/table-tent`;

    const cleanSlug = useMemo(() => sanitizeVenueSlug(venueSlugInput), [venueSlugInput]);
    const magazineQrUrl =
        `${MAGAZINE_SITE_URL}/hub/magazine?utm_source=table_tent&utm_medium=qr&utm_campaign=cardroom_kit`;
    const venueQrUrl = cleanSlug
        ? `${MAGAZINE_SITE_URL}/hub/venues/${encodeURIComponent(cleanSlug)}`
        : `${MAGAZINE_SITE_URL}/hub/poker-near-me`;
    const venueShortPath = cleanSlug
        ? `smarter.poker/hub/venues/${cleanSlug}`
        : 'smarter.poker/hub/poker-near-me';

    const magazineQrDataUri = useMemo(
        () => buildMagazineQrDataUri(magazineQrUrl, 240),
        [magazineQrUrl]
    );
    const venueQrDataUri = useMemo(
        () => buildMagazineQrDataUri(venueQrUrl, 240),
        [venueQrUrl]
    );

    const roomDisplayName =
        stripMagazineDashes(roomName.trim()) || 'Official Partner Poker Room';
    const locationLabel = [stripMagazineDashes(city.trim()), stateCode.trim().toUpperCase()]
        .filter(Boolean)
        .join(', ');
    const issueBadgeLabel = latestIssue?.issueNumber
        ? `Issue #${latestIssue.issueNumber} \u2022 ${latestIssue.periodLabel || 'Current Edition'}`
        : 'Monthly Print & Digital Edition';
    const coverHeadline =
        latestIssue?.coverHeadline ||
        'Championship Strategy, Solver Breakdowns & Live Tournament Radar';
    const coverImageUrl = latestIssue?.coverImageUrl || FALLBACK_MAGAZINE_IMAGE;

    const is4x6 = signSize === '4x6';

    const printCss = [
        is4x6
            ? '@page { size: 8.5in 6.5in; margin: 0.2in; }'
            : '@page { size: 5in 7in; margin: 0; }',
        '@media print {',
        '  html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }',
        '  .sp-tent-controls, .sp-tent-guide-note, .approved-global-header, .approved-global-header__clearance, .sp-world-command-trigger, .messenger-dock, .messenger-previews, [data-global-footer], [data-global-bottom-nav], [data-bottom-nav-clearance], [data-offline-bar], [data-startup-prompt], .sp-pwa-install-bar, aside[aria-label="Return To Your Poker Seat"], aside[aria-label="Smarter.Poker Weekly Wire Subscription"] { display: none !important; }',
        '  .sp-tent-root { min-height: 0 !important; padding: 0 !important; background: #ffffff !important; }',
        '  .sp-tent-stage { padding: 0 !important; margin: 0 !important; background: #ffffff !important; }',
        '  .sp-tent-sheet { box-shadow: none !important; margin: 0 auto !important; page-break-after: auto !important; break-after: auto !important; page-break-inside: avoid !important; break-inside: avoid !important; }',
        '}',
    ].join('\n');

    return (
        <>
            <Head>
                <title>{pageTitle}</title>
                <meta name="description" content={pageDesc} />
                <link rel="canonical" href={canonicalUrl} />
                <meta property="og:title" content={pageTitle} />
                <meta property="og:description" content={pageDesc} />
                <meta property="og:url" content={canonicalUrl} />
                <meta property="og:type" content="website" />
                <style dangerouslySetInnerHTML={{ __html: printCss }} />
            </Head>

            <div
                className="sp-tent-root"
                style={{
                    minHeight: '100vh',
                    background: '#05070a',
                    color: '#ffffff',
                    padding: '28px 16px 72px 16px',
                    fontFamily:
                        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                }}
            >
                <section
                    className="sp-tent-controls"
                    aria-label="Cardroom Table-Tent Customizer"
                    style={{
                        maxWidth: '980px',
                        margin: '0 auto 28px auto',
                        background: '#0b1520',
                        border: '1px solid #1b2c3d',
                        borderRadius: '14px',
                        padding: '22px',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            flexWrap: 'wrap',
                            gap: '14px',
                            marginBottom: '18px',
                        }}
                    >
                        <div>
                            <div
                                style={{
                                    fontSize: '11px',
                                    fontWeight: 900,
                                    letterSpacing: '1.6px',
                                    textTransform: 'uppercase',
                                    color: '#4fc1b3',
                                    marginBottom: '4px',
                                }}
                            >
                                Complimentary Cardroom Floor Signage
                            </div>
                            <h1
                                style={{
                                    margin: '0 0 6px 0',
                                    fontSize: 'clamp(22px, 3vw, 30px)',
                                    fontWeight: 900,
                                    color: '#ffffff',
                                }}
                            >
                                Printable Cardroom QR Table-Tent &amp; Brush-Stand Kit
                            </h1>
                            <p style={{ margin: 0, fontSize: '13.5px', color: '#9fb3c8', lineHeight: 1.5 }}>
                                Customize Your Poker Room Waiting-List Podium Sign Or Acrylic Brush-Stand Display With Instant Vector QR Codes For Players Waiting For Seats.
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <Link
                                href="/hub/magazine/poker-rooms"
                                style={{
                                    background: '#102131',
                                    border: '1px solid #60a5fa',
                                    color: '#60a5fa',
                                    borderRadius: '8px',
                                    padding: '9px 14px',
                                    fontSize: '12.5px',
                                    fontWeight: 800,
                                    textDecoration: 'none',
                                }}
                            >
                                Request Monthly Print Bundles
                            </Link>
                            <Link
                                href="/hub/magazine"
                                style={{
                                    background: '#05070a',
                                    border: '1px solid #1b2c3d',
                                    color: '#9fb3c8',
                                    borderRadius: '8px',
                                    padding: '9px 14px',
                                    fontSize: '12.5px',
                                    fontWeight: 800,
                                    textDecoration: 'none',
                                }}
                            >
                                Magazine Newsstand
                            </Link>
                        </div>
                    </div>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
                            gap: '12px',
                            marginBottom: '16px',
                        }}
                    >
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#9fb3c8' }}>
                            Poker Room Name
                            <input
                                type="text"
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                                placeholder="The Lodge Card Club"
                                aria-label="Poker Room Name"
                                style={{
                                    background: '#05070a',
                                    border: '1px solid #1b2c3d',
                                    borderRadius: '8px',
                                    padding: '10px 12px',
                                    color: '#ffffff',
                                    fontSize: '13.5px',
                                }}
                            />
                        </label>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#9fb3c8' }}>
                            City
                            <input
                                type="text"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="Round Rock"
                                aria-label="Poker Room City"
                                style={{
                                    background: '#05070a',
                                    border: '1px solid #1b2c3d',
                                    borderRadius: '8px',
                                    padding: '10px 12px',
                                    color: '#ffffff',
                                    fontSize: '13.5px',
                                }}
                            />
                        </label>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#9fb3c8' }}>
                            State
                            <select
                                value={stateCode}
                                onChange={(e) => setStateCode(e.target.value)}
                                aria-label="Poker Room State"
                                style={{
                                    background: '#05070a',
                                    border: '1px solid #1b2c3d',
                                    borderRadius: '8px',
                                    padding: '10px 12px',
                                    color: '#ffffff',
                                    fontSize: '13.5px',
                                }}
                            >
                                <option value="">Select State</option>
                                {US_STATE_CODES.map((st) => (
                                    <option key={st} value={st}>
                                        {st}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#9fb3c8' }}>
                            Poker Near Me Venue Slug (Optional)
                            <input
                                type="text"
                                value={venueSlugInput}
                                onChange={(e) => setVenueSlugInput(e.target.value)}
                                placeholder="/hub/venues/lodge-poker-club"
                                aria-label="Poker Near Me Venue Slug"
                                className="no-capitalize"
                                style={{
                                    background: '#05070a',
                                    border: '1px solid #1b2c3d',
                                    borderRadius: '8px',
                                    padding: '10px 12px',
                                    color: '#ffffff',
                                    fontSize: '13.5px',
                                }}
                            />
                        </label>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '12px',
                            paddingTop: '12px',
                            borderTop: '1px solid #1b2c3d',
                        }}
                    >
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }} role="group" aria-label="Table-Tent Print Size">
                            <button
                                type="button"
                                onClick={() => setSignSize('4x6')}
                                style={{
                                    background: is4x6 ? '#4fc1b3' : '#05070a',
                                    color: is4x6 ? '#05070a' : '#ffffff',
                                    border: '1px solid #4fc1b3',
                                    borderRadius: '8px',
                                    padding: '10px 14px',
                                    fontSize: '13px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    minHeight: '44px',
                                }}
                            >
                                4x6 Table Tent (2-Up Folded)
                            </button>
                            <button
                                type="button"
                                onClick={() => setSignSize('5x7')}
                                style={{
                                    background: !is4x6 ? '#4fc1b3' : '#05070a',
                                    color: !is4x6 ? '#05070a' : '#ffffff',
                                    border: '1px solid #4fc1b3',
                                    borderRadius: '8px',
                                    padding: '10px 14px',
                                    fontSize: '13px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    minHeight: '44px',
                                }}
                            >
                                5x7 Brush-Stand Sign
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                if (typeof window !== 'undefined') window.print();
                            }}
                            style={{
                                background: '#60a5fa',
                                color: '#05070a',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '11px 20px',
                                fontSize: '13.5px',
                                fontWeight: 900,
                                cursor: 'pointer',
                                minHeight: '44px',
                            }}
                        >
                            Print 300-DPI Table Tent
                        </button>
                    </div>
                </section>

                <main
                    className="sp-tent-stage"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        overflowX: 'auto',
                    }}
                >
                    <p
                        className="sp-tent-guide-note"
                        style={{
                            margin: '0 0 14px 0',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#9fb3c8',
                            textAlign: 'center',
                        }}
                    >
                        {is4x6
                            ? 'Live 4x6 Dual-Sided Table-Tent Proof (8.0" x 6.0" Side-By-Side Folded Tent Ready For Standard Cardstock)'
                            : 'Live 5x7 Brush-Stand Acrylic Sign Proof (Exact 5.0" x 7.0" Trim)'}
                    </p>

                    {is4x6 ? (
                        <div
                            className="sp-tent-sheet"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'stretch',
                                gap: '0',
                                padding: '0.12in',
                                background: '#102131',
                                borderRadius: '14px',
                                boxShadow: '0 18px 48px rgba(0, 0, 0, 0.75)',
                                position: 'relative',
                            }}
                        >
                            <TableTentFaceCard
                                roomDisplayName={roomDisplayName}
                                locationLabel={locationLabel}
                                issueBadgeLabel={issueBadgeLabel}
                                coverHeadline={coverHeadline}
                                coverImageUrl={coverImageUrl}
                                magazineQrDataUri={magazineQrDataUri}
                                venueQrDataUri={venueQrDataUri}
                                venueShortPath={venueShortPath}
                                compact
                            />
                            <div
                                aria-hidden="true"
                                style={{
                                    width: '0.14in',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderLeft: '1px dashed #60a5fa',
                                    borderRight: '1px dashed #60a5fa',
                                }}
                            />
                            <TableTentFaceCard
                                roomDisplayName={roomDisplayName}
                                locationLabel={locationLabel}
                                issueBadgeLabel={issueBadgeLabel}
                                coverHeadline={coverHeadline}
                                coverImageUrl={coverImageUrl}
                                magazineQrDataUri={magazineQrDataUri}
                                venueQrDataUri={venueQrDataUri}
                                venueShortPath={venueShortPath}
                                compact
                            />
                        </div>
                    ) : (
                        <div
                            className="sp-tent-sheet"
                            style={{
                                display: 'inline-block',
                                boxShadow: '0 18px 48px rgba(0, 0, 0, 0.75)',
                                borderRadius: '12px',
                            }}
                        >
                            <TableTentFaceCard
                                roomDisplayName={roomDisplayName}
                                locationLabel={locationLabel}
                                issueBadgeLabel={issueBadgeLabel}
                                coverHeadline={coverHeadline}
                                coverImageUrl={coverImageUrl}
                                magazineQrDataUri={magazineQrDataUri}
                                venueQrDataUri={venueQrDataUri}
                                venueShortPath={venueShortPath}
                                compact={false}
                            />
                        </div>
                    )}
                </main>
            </div>
        </>
    );
}
