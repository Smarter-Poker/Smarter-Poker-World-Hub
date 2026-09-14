/**
 * TOKE TRACKER - Landing Page
 *
 * Mobile phase 11 (docs/mobile-standard/ROLLOUT-PLAN.md): rebuilt on
 * HubPageShell and the phase 0a foundation. The page owns no header, no
 * bottom pad and no 100vh; the shell and pages/_app.js own those. Preference
 * state moved to src/hooks/useTokePrefs (it was copied into all five pages).
 * Layout lives in src/styles/worlds/toke-tracker.css, scoped to .toke-page.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageShell from '../../../src/components/ui/HubPageShell';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { useHaptics } from '../../../src/hooks/useHaptics';
import { useTokePrefs } from '../../../src/hooks/useTokePrefs';

const UniversalHeader = dynamic(() => import('../../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../../src/components/ui/HamburgerMenu'), { ssr: false });

const CARDS = [
    {
        id: 'shift',
        title: 'Shift Tracker',
        subtitle: 'Clock In, Track Downs, Log Tokes',
        image: '/images/toke-shift.png',
        route: '/hub/toke-tracker/shift',
    },
    {
        id: 'analytics',
        title: 'Analytics',
        subtitle: 'Earnings, Hourly Rates, Trends',
        image: '/images/toke-analytics.png',
        route: '/hub/toke-tracker/analytics',
    },
    {
        id: 'vault',
        title: 'Dealer Vault',
        subtitle: 'Tax Docs, Licenses, W-2s',
        image: '/images/toke-vault.png',
        route: '/hub/toke-tracker/vault',
    },
    {
        id: 'venues',
        title: 'Venue Intel',
        subtitle: 'Venue Performance, Shift Calendar',
        image: '/images/toke-venues.png',
        route: '/hub/toke-tracker/venues',
    },
];

export default function TokeTrackerLanding() {
    const router = useRouter();
    const { user } = useAvatar();
    const [menuOpen, setMenuOpen] = useState(false);
    const haptic = useHaptics();
    const { tokePrefs, menuHandlers } = useTokePrefs(user?.id);

    const menuConfig = getMenuConfig('toke-tracker', user, tokePrefs, menuHandlers);

    const openCard = useCallback((route) => {
        haptic('light');
        router.push(route);
    }, [haptic, router]);

    return (
        <>
            <SEOHead
                title="Toke Tracker - Dealer Income Management"
                description="Track shifts, analyze earnings, store documents, and monitor venue performance."
                canonical="/hub/toke-tracker"
            />
            <HubPageShell
                className="toke"
                maxWidth={560}
                background="#18191a"
                header={<UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />}
            >
                <div className="toke-bg-grid" />
                <div className="toke-page">
                    <h1 className="toke-page-title" data-tutorial="title" style={{ textAlign: 'center', fontSize: 28 }}>Toke Tracker</h1>
                    <p className="toke-page-subtitle" style={{ textAlign: 'center', letterSpacing: '0.12em' }}>Your Complete Dealer Operating System</p>

                    <div className="toke-landing-grid" data-tutorial="cards">
                        {CARDS.map((card) => (
                            <button
                                key={card.id}
                                type="button"
                                onClick={() => openCard(card.route)}
                                style={s.card}
                                aria-label={`${card.title}: ${card.subtitle}`}
                            >
                                <span style={s.imageFrame}>
                                    <span style={s.imageGlow} />
                                    <img src={card.image} alt="" style={s.cardImage} loading="eager" />
                                </span>
                                <span style={s.cardTitle}>{card.title}</span>
                                <span style={s.cardSubtitle}>{card.subtitle}</span>
                                <span style={s.arrow} aria-hidden="true">&rarr;</span>
                            </button>
                        ))}
                    </div>
                </div>
            </HubPageShell>

            <HamburgerMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                direction="left"
                theme="dark"
                user={user}
                showProfile
                menuItems={menuConfig.menuItems}
                bottomLinks={menuConfig.bottomLinks}
            />
        </>
    );
}

const s = {
    card: {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 0 16px',
        background: 'linear-gradient(180deg, #242526 0%, #1c1d1e 100%)',
        border: '2px solid #3a3b3c',
        borderRadius: 16,
        cursor: 'pointer',
        overflow: 'hidden',
        WebkitTapHighlightColor: 'transparent',
    },
    imageFrame: {
        position: 'relative',
        display: 'block',
        width: '100%',
        aspectRatio: '1',
        maxWidth: '100%',
        overflow: 'hidden',
        borderRadius: '14px 14px 0 0',
    },
    imageGlow: {
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(circle at center, rgba(0,212,255,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 1,
    },
    cardImage: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
    cardTitle: {
        fontFamily: "'Rajdhani', 'Inter', sans-serif",
        fontSize: 16,
        fontWeight: 700,
        color: '#e4e6eb',
        letterSpacing: '0.06em',
        margin: '12px 0 2px',
        textTransform: 'uppercase',
    },
    cardSubtitle: {
        fontFamily: 'var(--font-inter), sans-serif',
        fontSize: 12,
        color: '#b0b3b8',
        lineHeight: 1.3,
        textAlign: 'center',
        padding: '0 10px',
    },
    arrow: {
        position: 'absolute',
        top: 12,
        right: 12,
        fontSize: 18,
        color: 'rgba(0,212,255,0.5)',
        fontWeight: 700,
    },
};
