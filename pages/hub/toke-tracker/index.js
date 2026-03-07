/**
 * TOKE TRACKER — Landing Page
 * 4 clickable icon cards routing to dedicated sub-pages
 */

import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { supabase } from '../../../src/lib/supabase';

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
    const userId = user?.id;
    const [mounted, setMounted] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [tokePrefs, setTokePrefs] = useState({
        shiftNotifications: true,
        autoSaveShifts: true,
        downTimerAlerts: true
    });

    useEffect(() => { setMounted(true); }, []);

    // Load preferences from Supabase
    useEffect(() => {
        if (!userId) return;
        supabase.from('profiles').select('settings').eq('id', userId).single()
            .then(({ data }) => {
                if (data?.settings?.tokeTracker) {
                    setTokePrefs(prev => ({ ...prev, ...data.settings.tokeTracker }));
                }
            })
            .catch(() => { });
    }, [userId]);

    // Save preference to Supabase + emit bus event
    const updatePref = useCallback(async (key, value) => {
        let newPrefs;
        setTokePrefs(prev => {
            newPrefs = { ...prev, [key]: value };
            return newPrefs;
        });
        await new Promise(r => setTimeout(r, 0));
        if (!newPrefs) return;
        // Cross-tab sync
        window.dispatchEvent(new CustomEvent('toke-settings-sync', { detail: newPrefs }));
        // Persist to localStorage
        try { localStorage.setItem('toke-tracker-prefs', JSON.stringify(newPrefs)); } catch { }
        // Persist to Supabase
        if (!userId) return;
        try {

            const { data: profile } = await supabase.from('profiles').select('settings').eq('id', userId).single();
            const settings = profile?.settings || {};
            settings.tokeTracker = newPrefs;
            await supabase.from('profiles').update({ settings }).eq('id', userId);
        } catch (err) {
            console.error('[TokeTracker] Failed to save preference:', err);
        }
    }, [userId]);

    // Listen for cross-tab sync
    useEffect(() => {
        const handler = (e) => {
            if (e.detail) setTokePrefs(e.detail);
        };
        window.addEventListener('toke-settings-sync', handler);
        return () => window.removeEventListener('toke-settings-sync', handler);
    }, []);

    const menuConfig = getMenuConfig('toke-tracker', user, tokePrefs, {
        setShiftNotifications: (v) => updatePref('shiftNotifications', v),
        setAutoSaveShifts: (v) => updatePref('autoSaveShifts', v),
        setDownTimerAlerts: (v) => updatePref('downTimerAlerts', v)
    });

    if (!mounted) return null;

    return (
        <PageTransition>
            <SEOHead
                title="Toke Tracker — Dealer Income Management"
                description="Track shifts, analyze earnings, store documents, and monitor venue performance."
                canonical="/hub/toke-tracker"
            />
            <div style={s.page}>
                <div style={s.bgGrid} />
                <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />

                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={user}
                    showProfile={true}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

                <div style={s.content}>
                    <h1 style={s.pageTitle}>Toke Tracker</h1>
                    <p style={s.pageSubtitle}>Your Complete Dealer Operating System</p>

                    <div style={s.grid}>
                        {CARDS.map((card, i) => (
                            <button
                                key={card.id}
                                onClick={() => router.push(card.route)}
                                style={{
                                    ...s.card,
                                    animationDelay: `${i * 0.1}s`,
                                }}
                            >
                                {/* Image Frame */}
                                <div style={s.imageFrame}>
                                    <div style={s.imageGlow} />
                                    <img
                                        src={card.image}
                                        alt={card.title}
                                        style={s.cardImage}
                                        loading="eager"
                                    />
                                </div>

                                {/* Text */}
                                <h3 style={s.cardTitle}>{card.title}</h3>
                                <p style={s.cardSubtitle}>{card.subtitle}</p>

                                {/* Hover arrow */}
                                <span style={s.arrow}>→</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @keyframes cardFadeIn {
                    from { opacity: 0; transform: translateY(20px) scale(0.95); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                .toke-card-hover:hover { transform: translateY(-4px) scale(1.02) !important; }
            `}</style>
        </PageTransition>
    );
}

const s = {
    page: {
        minHeight: '100vh',
        background: '#18191a',
        position: 'relative',
    },
    bgGrid: {
        position: 'fixed',
        inset: 0,
        backgroundImage: `
            linear-gradient(rgba(0,212,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,212,255,0.015) 1px, transparent 1px)
        `,
        backgroundSize: '24px 24px',
        pointerEvents: 'none',
        zIndex: 0,
    },
    content: {
        position: 'relative',
        zIndex: 1,
        maxWidth: 560,
        margin: '0 auto',
        padding: '20px 16px 40px',
    },
    pageTitle: {
        fontFamily: "var(--font-orbitron), 'Inter', sans-serif",
        fontSize: 28,
        fontWeight: 800,
        letterSpacing: '0.08em',
        color: '#e4e6eb',
        margin: '16px 0 4px',
        textAlign: 'center',
    },
    pageSubtitle: {
        fontFamily: "'Rajdhani', 'Inter', sans-serif",
        fontSize: 14,
        color: '#b0b3b8',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        textAlign: 'center',
        margin: '0 0 28px',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 14,
    },
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
        transition: 'transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
        animation: 'cardFadeIn 0.5s ease-out both',
        WebkitTapHighlightColor: 'transparent',
    },
    imageFrame: {
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
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
    cardImage: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
    },
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
        fontFamily: "var(--font-inter), sans-serif",
        fontSize: 12,
        color: '#b0b3b8',
        margin: 0,
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
        transition: 'color 0.2s, transform 0.2s',
    },
};
