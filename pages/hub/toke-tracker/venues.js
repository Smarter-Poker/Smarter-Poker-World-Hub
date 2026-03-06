/**
 * TOKE TRACKER — Venue Intelligence Page
 * Venue performance analytics + shift calendar
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import VenueIntelligence from '../../../src/components/bankroll/VenueIntelligence';
import TokeCalendar from '../../../src/components/bankroll/TokeCalendar';
import { fetchGigs } from '../../../src/lib/bankroll/tokeSelectors';
import { createClient } from '@supabase/supabase-js';

export default function VenueIntelPage() {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;
    const [mounted, setMounted] = useState(false);
    const [completedGigs, setCompletedGigs] = useState([]);
    const [menuOpen, setMenuOpen] = useState(false);
    const [tokePrefs, setTokePrefs] = useState({});

    // SSR-safe: hydrate prefs + mount flag on client only
    useEffect(() => {
        setMounted(true);
        try {
            const stored = localStorage.getItem('toke-tracker-prefs');
            if (stored) setTokePrefs(JSON.parse(stored));
        } catch { }
    }, []);

    // Load completed gigs for VenueIntelligence
    const loadGigs = useCallback(async () => {
        if (!userId) return;
        try {
            const gigs = await fetchGigs(userId);
            setCompletedGigs(gigs.filter(g => g.status === 'completed'));
        } catch (err) {
            console.error('Error loading gigs:', err);
        }
    }, [userId]);

    useEffect(() => { loadGigs(); }, [loadGigs]);

    useEffect(() => {
        window.addEventListener('toke-gig-completed', loadGigs);
        return () => window.removeEventListener('toke-gig-completed', loadGigs);
    }, [loadGigs]);

    // Supabase Real-time Sync for Cross-Device Support
    useEffect(() => {
        if (!userId) return;
        const channel = supabase
            .channel(`toke-venues-sync-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toke_gigs', filter: `user_id=eq.${userId}` }, loadGigs)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [userId, loadGigs]);

    const updatePref = useCallback(async (key, value) => {
        let newPrefs;
        setTokePrefs(prev => {
            newPrefs = { ...prev, [key]: value };
            return newPrefs;
        });
        await new Promise(r => setTimeout(r, 0));
        if (!newPrefs) return;
        window.dispatchEvent(new CustomEvent('toke-settings-sync', { detail: newPrefs }));
        try { localStorage.setItem('toke-tracker-prefs', JSON.stringify(newPrefs)); } catch { }
        if (!userId) return;
        try {
            const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
            const { data: profile } = await supabase.from('profiles').select('settings').eq('id', userId).single();
            const settings = profile?.settings || {};
            settings.tokeTracker = newPrefs;
            await supabase.from('profiles').update({ settings }).eq('id', userId);
        } catch (err) { console.error('[TokeTracker] Pref save error:', err); }
    }, [userId]);

    useEffect(() => {
        const handler = (e) => { if (e.detail) setTokePrefs(e.detail); };
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
                title="Venue Intelligence — Performance Analytics"
                description="Analyze your performance across different venues with earning comparisons and shift calendar."
                canonical="/hub/toke-tracker/venues"
            />
            <div style={s.page}>
                <div style={s.bgGrid} />
                <UniversalHeader pageDepth={3} onMenuClick={() => setMenuOpen(true)} />

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
                    <button onClick={() => router.push('/hub/toke-tracker')} style={s.backBtn}>
                        ← Toke Tracker
                    </button>

                    <h1 style={s.title}>Venue Intel</h1>
                    <p style={s.subtitle}>Performance By Venue + Shift Calendar</p>

                    <VenueIntelligence gigs={completedGigs} />

                    <div style={{ marginTop: 24 }}>
                        <TokeCalendar userId={userId} />
                    </div>
                </div>
            </div>
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
        maxWidth: 640,
        margin: '0 auto',
        padding: '12px 16px 40px',
    },
    backBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        color: '#b0b3b8',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        marginBottom: 16,
        transition: 'background 0.2s',
    },
    title: {
        fontFamily: "var(--font-orbitron), 'Inter', sans-serif",
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: '#e4e6eb',
        margin: '0 0 4px',
    },
    subtitle: {
        fontFamily: "'Rajdhani', 'Inter', sans-serif",
        fontSize: 14,
        color: '#b0b3b8',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        margin: '0 0 20px',
    },
};
