/**
 * TOKE TRACKER — Venue Intelligence Page
 * Venue performance analytics + shift calendar
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { HubErrorBoundary } from '../../../src/components/ui/HubErrorBoundary';
import { supabase } from '../../../src/lib/supabase';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

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
        } catch (e) { console.warn('[App] Handled exception:', e); }
    }, []);

    // Load completed gigs for VenueIntelligence
    const loadGigs = useCallback(async () => {
        if (!userId) return;
        try {
            const gigs = await fetchGigs(userId);
            setCompletedGigs(gigs.filter(g => g.status === 'completed'));
        } catch (err) {
            console.warn('Error loading gigs:', err);
        }
    }, [userId]);

    useEffect(() => { loadGigs(); }, [loadGigs]);

    useEffect(() => {
        window.addEventListener('toke-gig-completed', loadGigs);
        window.addEventListener('toke-data-updated', loadGigs);
        return () => {
            window.removeEventListener('toke-gig-completed', loadGigs);
            window.removeEventListener('toke-data-updated', loadGigs);
        };
    }, [loadGigs]);

    // Debounced refresh for realtime — prevents flooding during multi-row ops
    const rtTimerRef = useRef(null);
    const debouncedLoadGigs = useCallback(() => {
        if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
        rtTimerRef.current = setTimeout(loadGigs, 500);
    }, [loadGigs]);
    useEffect(() => () => { if (rtTimerRef.current) clearTimeout(rtTimerRef.current); }, []);

    // Supabase Real-time Sync for Cross-Device Support
    useEffect(() => {
        if (!userId) return;
        const channel = supabase
            .channel(`toke-venues-sync-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toke_gigs', filter: `user_id=eq.${userId}` }, debouncedLoadGigs)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [userId, debouncedLoadGigs]);

    const updatePref = useCallback(async (key, value) => {
        let newPrefs;
        setTokePrefs(prev => {
            newPrefs = { ...prev, [key]: value };
            return newPrefs;
        });
        await new Promise(r => setTimeout(r, 0));
        if (!newPrefs) return;
        window.dispatchEvent(new CustomEvent('toke-settings-sync', { detail: newPrefs }));
        try { localStorage.setItem('toke-tracker-prefs', JSON.stringify(newPrefs)); } catch (e) { console.warn('[App] Handled exception:', e); }
        if (!userId) return;
        try {
            const { data: profile } = await supabase.from('profiles').select('settings').eq('id', userId).maybeSingle();
            const settings = profile?.settings || {};
            settings.tokeTracker = newPrefs;
            const { error: err_profiles_lbitw } = await supabase.from('profiles').update({ settings }).eq('id', userId);
            if (err_profiles_lbitw) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_lbitw.message);
        } catch (err) { console.warn('[TokeTracker] Pref save error:', err); }
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

                    <HubErrorBoundary name="Venue Intelligence">
                        <VenueIntelligence gigs={completedGigs} />
                    </HubErrorBoundary>

                    <div style={{ marginTop: 24 }}>
                        <HubErrorBoundary name="Shift Calendar">
                            <TokeCalendar userId={userId} />
                        </HubErrorBoundary>
                    </div>
                </div>
            </div>
              <BottomNavBar />
    </PageTransition>
    );
}

const s = {
    page: {
        minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
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
