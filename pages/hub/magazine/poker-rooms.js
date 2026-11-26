import Head from 'next/head';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
    FALLBACK_MAGAZINE_IMAGE,
    handleMagazineImageError,
} from '../../../src/components/magazine/MagazineSpreadRenderer.js';
import {
    MAGAZINE_MASTHEAD,
    MAGAZINE_SITE_URL,
    formatPeriodLabel,
    stripMagazineDashes,
} from '../../../src/lib/magazine/magazineSchema.mjs';

const US_STATE_CODES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];

const BLOCKED_EMAIL_DOMAINS = new Set([
    'example.com',
    'example.org',
    'example.net',
    'test.com',
    'invalid',
    'localhost',
    'horse.ai',
    'hydra.bot',
    'mailinator.com',
    'tempmail.com',
]);

const US_ZIP_RE = /^\d{5}(-\d{4})?$/;

export async function getServerSideProps({ res }) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');

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
                id: String(r.id || r.slug || 'latest'),
                issueNumber: Math.max(1, Number(r.issue_number || 1)),
                volumeNumber: Math.max(1, Number(r.volume_number || 1)),
                issuePeriod: String(r.issue_period || ''),
                periodLabel: formatPeriodLabel(r.issue_period),
                slug: String(r.slug || r.issue_period || 'latest'),
                title: stripMagazineDashes(r.title || MAGAZINE_MASTHEAD),
                coverHeadline: stripMagazineDashes(r.cover_headline || ''),
                coverSubheadline: stripMagazineDashes(r.cover_subheadline || ''),
                coverImageUrl: String(r.cover_image_url || FALLBACK_MAGAZINE_IMAGE),
            };
        }
    } catch (err) {
        console.warn('[magazine/poker-rooms] SSR fallback:', err?.message || err);
    }

    return {
        props: {
            latestIssue,
        },
    };
}

function validateRoomRequest(form) {
    const roomName = form.roomName.trim();
    const contactName = form.contactName.trim();
    const contactEmail = form.contactEmail.trim().toLowerCase();
    const shippingAddress = form.shippingAddress.trim();
    const city = form.city.trim();
    const state = form.state.trim().toUpperCase();
    const postalCode = form.postalCode.trim();
    const copies = Number(form.requestedCopies);
    const tables = Number(form.tableCount);

    if (roomName.length < 2) return 'Please Enter Your Official Poker Room Or Casino Name.';
    if (contactName.length < 2) return 'Please Enter A Poker Room Manager Or Director Contact Name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        return 'Please Enter A Valid Business Or Cardroom Email Address.';
    }
    const domain = contactEmail.split('@')[1] || '';
    if (
        BLOCKED_EMAIL_DOMAINS.has(domain) ||
        domain.endsWith('.example.com') ||
        domain.endsWith('.invalid') ||
        domain.endsWith('.local') ||
        domain.endsWith('.test') ||
        domain.endsWith('.smarter.poker')
    ) {
        return 'Please Use A Real Poker Room Email Address Instead Of A Placeholder Domain.';
    }
    if (shippingAddress.length < 4) {
        return 'Please Enter A Complete Street Shipping Address For Bundle Delivery.';
    }
    if (city.length < 2) return 'Please Enter Your Poker Room City.';
    if (!US_STATE_CODES.includes(state)) return 'Please Select A Valid Two-Letter US State Or DC Code.';
    if (!US_ZIP_RE.test(postalCode)) {
        return 'Please Enter A Valid Five-Digit US ZIP Or ZIP+4 Postal Code.';
    }
    if (!Number.isFinite(tables) || tables < 1 || tables > 300) {
        return 'Please Enter Your Active Poker Table Count Between 1 And 300.';
    }
    if (!Number.isFinite(copies) || copies < 5 || copies > 1000) {
        return 'Requested Monthly Print Copies Must Be Between 5 And 1,000 Copies.';
    }
    return '';
}

export default function SmarterPokerMagazinePokerRoomsPage({ latestIssue = null }) {
    const [form, setForm] = useState({
        roomName: '',
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        shippingAddress: '',
        city: '',
        state: 'NV',
        postalCode: '',
        tableCount: '12',
        requestedCopies: '50',
        notes: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [submittedRecord, setSubmittedRecord] = useState(null);

    const canonicalUrl = `${MAGAZINE_SITE_URL}/hub/magazine/poker-rooms`;
    const pageTitle = 'Cardroom Poker Magazine Bundles | Smarter.Poker';
    const pageDesc =
        'Request Monthly Commercial Print Bundles Of Smarter.Poker Magazine For Your Poker Room Lobby, Waiting List Podium, And Tournament Desk.';
    const rawCoverImg = latestIssue?.coverImageUrl || FALLBACK_MAGAZINE_IMAGE;
    const ogImageUrl = rawCoverImg.startsWith('http')
        ? rawCoverImg
        : `${MAGAZINE_SITE_URL}${rawCoverImg.startsWith('/') ? rawCoverImg : `/${rawCoverImg}`}`;

    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebPage',
                '@id': `${canonicalUrl}#webpage`,
                name: pageTitle,
                url: canonicalUrl,
                description: pageDesc,
                inLanguage: 'en-US',
                primaryImageOfPage: {
                    '@type': 'ImageObject',
                    url: ogImageUrl,
                },
                isPartOf: {
                    '@type': 'WebSite',
                    name: 'Smarter.Poker',
                    url: MAGAZINE_SITE_URL,
                },
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: `${MAGAZINE_SITE_URL}/` },
                    { '@type': 'ListItem', position: 2, name: 'Hub', item: `${MAGAZINE_SITE_URL}/hub` },
                    { '@type': 'ListItem', position: 3, name: 'Monthly Magazine', item: `${MAGAZINE_SITE_URL}/hub/magazine` },
                    { '@type': 'ListItem', position: 4, name: 'Cardroom Print Bundles', item: canonicalUrl },
                ],
            },
        ],
    };

    const handleFieldChange = (field) => (e) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submittingRef.current) return;
        const validationError = validateRoomRequest(form);
        if (validationError) {
            setErrorMessage(validationError);
            return;
        }

        submittingRef.current = true;
        setSubmitting(true);
        setErrorMessage('');
        try {
            const payload = {
                roomName: form.roomName.trim(),
                room_name: form.roomName.trim(),
                contactName: form.contactName.trim(),
                contact_name: form.contactName.trim(),
                contactEmail: form.contactEmail.trim().toLowerCase(),
                contact_email: form.contactEmail.trim().toLowerCase(),
                contactPhone: form.contactPhone.trim(),
                contact_phone: form.contactPhone.trim(),
                shippingAddress: form.shippingAddress.trim(),
                shipping_address: form.shippingAddress.trim(),
                address_line1: form.shippingAddress.trim(),
                city: form.city.trim(),
                state: form.state.trim().toUpperCase(),
                postalCode: form.postalCode.trim(),
                postal_code: form.postalCode.trim(),
                tableCount: Math.round(Number(form.tableCount)),
                table_count: Math.round(Number(form.tableCount)),
                requestedCopies: Math.round(Number(form.requestedCopies)),
                requested_copies: Math.round(Number(form.requestedCopies)),
                notes: form.notes.trim(),
            };

            const res = await fetch('/api/news/magazine-rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok || !body?.success) {
                setErrorMessage(
                    String(body?.error || 'Unable To Submit Cardroom Bundle Request Right Now. Please Try Again.')
                );
                return;
            }
            setSubmittedRecord({
                roomName: payload.roomName,
                requestedCopies: payload.requestedCopies,
                city: payload.city,
                state: payload.state,
            });
        } catch {
            setErrorMessage('Network Error Submitting Your Request. Please Check Your Connection And Try Again.');
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    };

    const inputStyle = {
        width: '100%',
        boxSizing: 'border-box',
        background: '#05070a',
        border: '1px solid #1b2c3d',
        borderRadius: '10px',
        padding: '12px 14px',
        color: '#ffffff',
        fontSize: '16px',
        outline: 'none',
    };

    const labelStyle = {
        display: 'block',
        fontSize: '12.5px',
        fontWeight: 800,
        color: '#9fb3c8',
        marginBottom: '6px',
        letterSpacing: '0.5px',
    };

    return (
        <>
            <Head>
                <title>{pageTitle}</title>
                <meta name="description" content={pageDesc} />
                <link key="canonical" rel="canonical" href={canonicalUrl} />
                <meta key="og-url" property="og:url" content={canonicalUrl} />
                <meta key="og-title" property="og:title" content={pageTitle} />
                <meta key="og-description" property="og:description" content={pageDesc} />
                <meta key="og-image" property="og:image" content={ogImageUrl} />
                <meta key="twitter-card" name="twitter:card" content="summary_large_image" />
                <meta key="twitter-title" name="twitter:title" content={pageTitle} />
                <meta key="twitter-description" name="twitter:description" content={pageDesc} />
                <meta key="twitter-image" name="twitter:image" content={ogImageUrl} />
                <link
                    key="magazine-rss"
                    rel="alternate"
                    type="application/rss+xml"
                    title="Smarter.Poker Magazine RSS"
                    href={`${MAGAZINE_SITE_URL}/hub/magazine/rss.xml`}
                />
                <script
                    key="magazine-rooms-jsonld"
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
                <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '18px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                        <Link
                            href="/hub/magazine"
                            style={{ color: '#4fc1b3', fontSize: '13.5px', fontWeight: 800, textDecoration: 'none' }}
                        >
                            &larr; Back To Magazine Newsstand
                        </Link>
                        <Link
                            href="/hub/poker-near-me"
                            style={{ color: '#60a5fa', fontSize: '13.5px', fontWeight: 800, textDecoration: 'none' }}
                        >
                            Explore Poker Near Me Directory &rarr;
                        </Link>
                    </div>

                    <header
                        style={{
                            background: 'linear-gradient(135deg, #0b1520 0%, #102131 100%)',
                            border: '1px solid #1b2c3d',
                            borderRadius: '20px',
                            padding: '32px',
                            marginBottom: '28px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '28px',
                            alignItems: 'center',
                        }}
                    >
                        <div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                <span
                                    style={{
                                        display: 'inline-block',
                                        background: '#4fc1b3',
                                        color: '#05070a',
                                        fontSize: '11px',
                                        fontWeight: 900,
                                        letterSpacing: '1.6px',
                                        textTransform: 'uppercase',
                                        padding: '4px 12px',
                                        borderRadius: '999px',
                                    }}
                                >
                                    Official Cardroom Print Program
                                </span>
                                {latestIssue && (
                                    <Link
                                        href={`/hub/magazine/${latestIssue.slug}`}
                                        style={{
                                            display: 'inline-block',
                                            background: '#05070a',
                                            border: '1px solid #60a5fa',
                                            color: '#60a5fa',
                                            fontSize: '11px',
                                            fontWeight: 800,
                                            padding: '4px 12px',
                                            borderRadius: '999px',
                                            textDecoration: 'none',
                                        }}
                                    >
                                        {`Vol. ${latestIssue.volumeNumber} \u2022 Issue #${latestIssue.issueNumber} (${latestIssue.periodLabel})`}
                                    </Link>
                                )}
                            </div>
                            <h1
                                style={{
                                    margin: '0 0 12px 0',
                                    fontSize: 'clamp(26px, 4vw, 38px)',
                                    fontWeight: 900,
                                    lineHeight: 1.15,
                                    fontFamily: "Georgia, 'Times New Roman', serif",
                                    color: '#ffffff',
                                }}
                            >
                                Stock Smarter.Poker Magazine In Your Poker Room
                            </h1>
                            <p style={{ margin: 0, fontSize: '15.5px', lineHeight: 1.62, color: '#9fb3c8' }}>
                                Give Players Waiting For A Seat A Full 44-Page Commercial Glossy Poker Magazine Packed With GTO Strategy Columns, Global POY Standings, Coast-To-Coast Series Calendars, And Scannable Table QR Codes.
                            </p>
                        </div>

                        <div
                            style={{
                                borderRadius: '14px',
                                overflow: 'hidden',
                                border: '1px solid #1b2c3d',
                                background: '#05070a',
                            }}
                        >
                            <img
                                src={latestIssue?.coverImageUrl || FALLBACK_MAGAZINE_IMAGE}
                                alt={
                                    latestIssue?.title
                                        ? `${latestIssue.title} Cardroom Bundle Preview`
                                        : 'Smarter.Poker Magazine Cardroom Bundle Preview'
                                }
                                onError={handleMagazineImageError}
                                style={{ width: '100%', height: '220px', objectFit: 'cover', display: 'block' }}
                            />
                        </div>
                    </header>

                    <section
                        aria-label="Cardroom Distribution Benefits"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
                            gap: '18px',
                            marginBottom: '30px',
                        }}
                    >
                        {[
                            {
                                badge: '8.375" \u00d7 10.875" Print Spec',
                                title: '44-Page Monthly Strategy & Tour Guide',
                                body: 'Saddle-Stitched Commercial Magazine Sized For Waiting-List Podiums, Bravo Brush Desks, And VIP Player Lounges.',
                            },
                            {
                                badge: 'Interactive Table Play',
                                title: 'Complimentary QR Table-Tent Kit',
                                body: 'Every Strategy Column And Quiz Spot Includes Pure-Vector QR Codes Players Scan Between Hands With Their Phone Camera.',
                            },
                            {
                                badge: 'National Discovery',
                                title: 'Featured Room Listing In Poker Near Me',
                                body: 'Verified Distribution Partners Receive Priority Cardroom Spotlight Coverage Inside Both The Print Directory And Weekly Wire.',
                            },
                        ].map((card, idx) => (
                            <div
                                key={idx}
                                style={{
                                    background: '#0b1520',
                                    border: '1px solid #1b2c3d',
                                    borderTop: `3px solid ${idx % 2 === 0 ? '#4fc1b3' : '#60a5fa'}`,
                                    borderRadius: '14px',
                                    padding: '22px',
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 900,
                                        letterSpacing: '1.4px',
                                        textTransform: 'uppercase',
                                        color: idx % 2 === 0 ? '#4fc1b3' : '#60a5fa',
                                        marginBottom: '6px',
                                    }}
                                >
                                    {card.badge}
                                </div>
                                <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                                    {card.title}
                                </h2>
                                <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: '#9fb3c8' }}>
                                    {card.body}
                                </p>
                            </div>
                        ))}
                    </section>

                    <section
                        aria-label="Request Cardroom Print Copies"
                        style={{
                            background: '#0b1520',
                            border: '1px solid #1b2c3d',
                            borderRadius: '18px',
                            padding: '28px',
                        }}
                    >
                        {submittedRecord ? (
                            <div style={{ textAlign: 'center', padding: '24px 12px' }} role="status">
                                <div
                                    style={{
                                        display: 'inline-block',
                                        background: '#4fc1b3',
                                        color: '#05070a',
                                        fontSize: '11.5px',
                                        fontWeight: 900,
                                        letterSpacing: '1.6px',
                                        textTransform: 'uppercase',
                                        padding: '5px 14px',
                                        borderRadius: '999px',
                                        marginBottom: '12px',
                                    }}
                                >
                                    Print Distribution Request Recorded
                                </div>
                                <h2 style={{ margin: '0 0 10px 0', fontSize: '24px', fontWeight: 900, color: '#ffffff' }}>
                                    {`Thank You - ${submittedRecord.roomName} Is Queued For Verification`}
                                </h2>
                                <p style={{ margin: '0 auto 20px auto', maxWidth: '620px', fontSize: '15px', lineHeight: 1.6, color: '#9fb3c8' }}>
                                    {`Our Distribution Desk Received Your Request For ${submittedRecord.requestedCopies} Monthly Print Copies In ${submittedRecord.city}, ${submittedRecord.state}. Once Verified, Your Room Will Ship On The First Of Each Month.`}
                                </p>
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                    <Link
                                        href="/hub/magazine"
                                        style={{
                                            background: '#4fc1b3',
                                            color: '#05070a',
                                            borderRadius: '10px',
                                            padding: '11px 20px',
                                            fontSize: '14px',
                                            fontWeight: 900,
                                            textDecoration: 'none',
                                        }}
                                    >
                                        Browse Digital Magazine Issues
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => setSubmittedRecord(null)}
                                        style={{
                                            background: '#102131',
                                            border: '1px solid #1b2c3d',
                                            color: '#60a5fa',
                                            borderRadius: '10px',
                                            padding: '11px 18px',
                                            fontSize: '14px',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Submit Another Location
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 900, color: '#ffffff' }}>
                                    Request Monthly Cardroom Print Bundles
                                </h2>
                                <p style={{ margin: '0 0 22px 0', fontSize: '14.5px', color: '#9fb3c8', lineHeight: 1.55 }}>
                                    Complete Your Poker Room Shipping Details Below. Available For Licensed US Cardrooms, Charity Poker Rooms, And Major Tournament Stops (5 To 1,000 Copies Per Month).
                                </p>

                                <form onSubmit={handleSubmit} noValidate>
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                            gap: '16px',
                                            marginBottom: '16px',
                                        }}
                                    >
                                        <div>
                                            <label htmlFor="mag-room-name" style={labelStyle}>
                                                Poker Room Or Casino Name *
                                            </label>
                                            <input
                                                id="mag-room-name"
                                                type="text"
                                                value={form.roomName}
                                                onChange={handleFieldChange('roomName')}
                                                placeholder="Enter Official Cardroom Name"
                                                style={inputStyle}
                                                disabled={submitting}
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="mag-contact-name" style={labelStyle}>
                                                Poker Room Manager / Director Name *
                                            </label>
                                            <input
                                                id="mag-contact-name"
                                                type="text"
                                                value={form.contactName}
                                                onChange={handleFieldChange('contactName')}
                                                placeholder="Enter Contact Full Name"
                                                style={inputStyle}
                                                disabled={submitting}
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="mag-contact-email" style={labelStyle}>
                                                Business Email Address *
                                            </label>
                                            <input
                                                id="mag-contact-email"
                                                type="email"
                                                value={form.contactEmail}
                                                onChange={handleFieldChange('contactEmail')}
                                                placeholder="Enter Cardroom Email Address"
                                                className="no-capitalize"
                                                style={inputStyle}
                                                disabled={submitting}
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="mag-contact-phone" style={labelStyle}>
                                                Poker Desk Phone Number
                                            </label>
                                            <input
                                                id="mag-contact-phone"
                                                type="tel"
                                                value={form.contactPhone}
                                                onChange={handleFieldChange('contactPhone')}
                                                placeholder="Enter Room Phone Number"
                                                style={inputStyle}
                                                disabled={submitting}
                                            />
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                            gap: '16px',
                                            marginBottom: '16px',
                                        }}
                                    >
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <label htmlFor="mag-shipping-address" style={labelStyle}>
                                                Street Shipping Address (Attention: Poker Room) *
                                            </label>
                                            <input
                                                id="mag-shipping-address"
                                                type="text"
                                                required
                                                value={form.shippingAddress}
                                                onChange={handleFieldChange('shippingAddress')}
                                                placeholder="Enter Street Address For Bundle Delivery"
                                                style={inputStyle}
                                                disabled={submitting}
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="mag-city" style={labelStyle}>
                                                City *
                                            </label>
                                            <input
                                                id="mag-city"
                                                type="text"
                                                required
                                                value={form.city}
                                                onChange={handleFieldChange('city')}
                                                placeholder="Enter City"
                                                style={inputStyle}
                                                disabled={submitting}
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="mag-state" style={labelStyle}>
                                                US State *
                                            </label>
                                            <select
                                                id="mag-state"
                                                value={form.state}
                                                onChange={handleFieldChange('state')}
                                                style={inputStyle}
                                                disabled={submitting}
                                            >
                                                {US_STATE_CODES.map((st) => (
                                                    <option key={st} value={st}>
                                                        {st}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label htmlFor="mag-postal" style={labelStyle}>
                                                ZIP / Postal Code *
                                            </label>
                                            <input
                                                id="mag-postal"
                                                type="text"
                                                required
                                                value={form.postalCode}
                                                onChange={handleFieldChange('postalCode')}
                                                placeholder="Enter Five-Digit ZIP Code"
                                                style={inputStyle}
                                                disabled={submitting}
                                            />
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                            gap: '16px',
                                            marginBottom: '16px',
                                        }}
                                    >
                                        <div>
                                            <label htmlFor="mag-table-count" style={labelStyle}>
                                                Active Poker Tables *
                                            </label>
                                            <input
                                                id="mag-table-count"
                                                type="number"
                                                min={1}
                                                max={300}
                                                value={form.tableCount}
                                                onChange={handleFieldChange('tableCount')}
                                                style={inputStyle}
                                                disabled={submitting}
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="mag-copies" style={labelStyle}>
                                                Requested Monthly Copies (5-1,000) *
                                            </label>
                                            <input
                                                id="mag-copies"
                                                type="number"
                                                min={5}
                                                max={1000}
                                                value={form.requestedCopies}
                                                onChange={handleFieldChange('requestedCopies')}
                                                style={inputStyle}
                                                disabled={submitting}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '18px' }}>
                                        <label htmlFor="mag-notes" style={labelStyle}>
                                            Delivery Instructions Or Upcoming Series Dates
                                        </label>
                                        <textarea
                                            id="mag-notes"
                                            rows={3}
                                            value={form.notes}
                                            onChange={handleFieldChange('notes')}
                                            placeholder="Optional Receiving Dock Hours, Brush Desk Instructions, Or Upcoming Tournament Series"
                                            style={{ ...inputStyle, resize: 'vertical' }}
                                            disabled={submitting}
                                        />
                                    </div>

                                    {errorMessage && (
                                        <div
                                            role="alert"
                                            style={{
                                                background: '#102131',
                                                border: '1px solid #60a5fa',
                                                color: '#ffffff',
                                                borderRadius: '10px',
                                                padding: '12px 14px',
                                                fontSize: '14px',
                                                fontWeight: 700,
                                                marginBottom: '16px',
                                            }}
                                        >
                                            {errorMessage}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        style={{
                                            background: '#4fc1b3',
                                            color: '#05070a',
                                            border: 'none',
                                            borderRadius: '10px',
                                            padding: '14px 26px',
                                            fontSize: '15px',
                                            fontWeight: 900,
                                            cursor: submitting ? 'default' : 'pointer',
                                            opacity: submitting ? 0.7 : 1,
                                        }}
                                    >
                                        {submitting ? 'Submitting Cardroom Request...' : 'Request Monthly Print Bundle'}
                                    </button>
                                </form>
                            </>
                        )}
                    </section>
                </div>
            </main>
        </>
    );
}
