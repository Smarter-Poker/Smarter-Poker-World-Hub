/**
 * TOKE TRACKER — Shift Tracker Page
 * Core gig/down/timer/expense tracking
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import TokeTracker from '../../../src/components/bankroll/TokeTracker';
import { HubErrorBoundary } from '../../../src/components/ui/HubErrorBoundary';
import { supabase } from '../../../src/lib/supabase';

export default function ShiftTrackerPage() {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;
    const [mounted, setMounted] = useState(false);
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

    const updatePref = useCallback(async (key, value) => {
        let newPrefs;
        setTokePrefs(prev => {
            newPrefs = { ...prev, [key]: value };
            return newPrefs;
        });
        // Wait for state to settle
        await new Promise(r => setTimeout(r, 0));
        if (!newPrefs) return;
        window.dispatchEvent(new CustomEvent('toke-settings-sync', { detail: newPrefs }));
        try { localStorage.setItem('toke-tracker-prefs', JSON.stringify(newPrefs)); } catch { }
        if (!userId) return;
        try {
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
                title="Shift Tracker — Log Tokes & Downs"
                description="Clock in, track downs with 35-min timer, log tokes and expenses for each shift."
                canonical="/hub/toke-tracker/shift"
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
                    <HubErrorBoundary name="Shift Tracker">
                        <TokeTracker userId={userId} refreshTrigger={0} standalone tokePrefs={tokePrefs} />
                    </HubErrorBoundary>
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
};
