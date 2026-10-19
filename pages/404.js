import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '../src/components/seo/SEOHead';

const RECOVERY_ROUTES = [
    {
        title: 'Poker Odds Calculator',
        subtitle: 'Instant Holdem & Omaha Equity Engine',
        href: '/tools/poker-odds-calculator',
        badge: 'Free Tool',
    },
    {
        title: 'Preflop Range Matrix',
        subtitle: 'Interactive 169-Hand GTO Preflop Charts',
        href: '/tools/preflop-ranges',
        badge: 'GTO Matrix',
    },
    {
        title: 'Live Poker Rooms Directory',
        subtitle: 'Verified Poker Rooms, Cash Games & Daily Schedules',
        href: '/hub/poker-near-me/lobby',
        badge: 'Live Directory',
    },
    {
        title: 'Club Arena Free Games',
        subtitle: 'Play Online Club Poker, Tournaments & Ring Games',
        href: '/hub/club-arena',
        badge: 'Play Live',
    },
];

export default function Custom404() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        const trimmed = searchQuery.trim();
        if (trimmed) {
            router.push(`/hub/poker-near-me/lobby?q=${encodeURIComponent(trimmed)}`);
        } else {
            router.push('/hub/poker-near-me/lobby');
        }
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'radial-gradient(circle at 50% 20%, #111827 0%, #0a0a12 70%)',
                color: '#fff',
                fontFamily: 'var(--font-inter), Inter, sans-serif',
                padding: '32px 16px',
            }}
        >
            <SEOHead
                title="Page Not Found"
                description="The Requested Page Could Not Be Found. Search Live Poker Rooms Or Jump Directly To Our Free GTO Poker Calculators And Directories."
                noindex={true}
            />
            <div style={{ maxWidth: 680, width: '100%', textAlign: 'center' }}>
                <div
                    style={{
                        display: 'inline-block',
                        padding: '6px 14px',
                        borderRadius: 999,
                        background: 'rgba(0, 212, 255, 0.12)',
                        border: '1px solid rgba(0, 212, 255, 0.35)',
                        color: '#00D4FF',
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: 1.2,
                        textTransform: 'uppercase',
                        marginBottom: 16,
                    }}
                >
                    HTTP 404 Error
                </div>
                <h1
                    style={{
                        fontSize: 56,
                        fontWeight: 800,
                        margin: '0 0 12px',
                        color: '#00D4FF',
                        letterSpacing: '-0.02em',
                    }}
                >
                    Page Not Found
                </h1>
                <p
                    style={{
                        fontSize: 16,
                        lineHeight: 1.6,
                        color: 'rgba(255, 255, 255, 0.72)',
                        maxWidth: 520,
                        margin: '0 auto 28px',
                    }}
                >
                    The Table Or Tournament Page You Requested Has Moved Or Ended. Search Live Poker Rooms Below Or Explore Our Top Destinations.
                </p>

                <form
                    onSubmit={handleSearchSubmit}
                    role="search"
                    aria-label="Search Live Poker Rooms And Tools"
                    style={{
                        display: 'flex',
                        gap: 10,
                        maxWidth: 540,
                        margin: '0 auto 32px',
                    }}
                >
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search Poker Rooms, Cities, Or States..."
                        aria-label="Search Poker Rooms, Cities, Or States"
                        style={{
                            flex: 1,
                            padding: '13px 16px',
                            borderRadius: 10,
                            border: '1px solid rgba(255, 255, 255, 0.18)',
                            background: 'rgba(15, 23, 42, 0.85)',
                            color: '#fff',
                            fontSize: 15,
                            outline: 'none',
                        }}
                    />
                    <button
                        type="submit"
                        style={{
                            padding: '13px 22px',
                            borderRadius: 10,
                            border: 'none',
                            background: '#00D4FF',
                            color: '#000',
                            fontWeight: 700,
                            fontSize: 15,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Search Rooms
                    </button>
                </form>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: 14,
                        textAlign: 'left',
                        marginBottom: 28,
                    }}
                >
                    {RECOVERY_ROUTES.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            style={{
                                display: 'block',
                                padding: '16px 18px',
                                borderRadius: 12,
                                background: 'rgba(255, 255, 255, 0.04)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                textDecoration: 'none',
                                color: '#fff',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: 6,
                                }}
                            >
                                <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>
                                    {item.title}
                                </span>
                                <span
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        padding: '3px 8px',
                                        borderRadius: 6,
                                        background: 'rgba(0, 212, 255, 0.14)',
                                        color: '#00D4FF',
                                    }}
                                >
                                    {item.badge}
                                </span>
                            </div>
                            <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.65)' }}>
                                {item.subtitle}
                            </div>
                        </Link>
                    ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <Link
                        href="/hub"
                        style={{
                            display: 'inline-block',
                            padding: '12px 28px',
                            background: '#00D4FF',
                            color: '#000',
                            textDecoration: 'none',
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 15,
                        }}
                    >
                        Go To World Hub
                    </Link>
                    <Link
                        href="/tools/icm-calculator"
                        style={{
                            display: 'inline-block',
                            padding: '12px 24px',
                            background: 'rgba(255, 255, 255, 0.07)',
                            border: '1px solid rgba(255, 255, 255, 0.16)',
                            color: '#fff',
                            textDecoration: 'none',
                            borderRadius: 8,
                            fontWeight: 600,
                            fontSize: 15,
                        }}
                    >
                        ICM Calculator
                    </Link>
                </div>
            </div>
        </div>
    );
}
