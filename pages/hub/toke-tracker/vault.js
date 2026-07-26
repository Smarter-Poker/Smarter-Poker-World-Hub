/**
 * TOKE TRACKER — Dealer Vault Page
 * Tax documents, licenses, W-2s
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import DealerVault from '../../../src/components/bankroll/DealerVault';
import TaxSummaryModal from '../../../src/components/bankroll/TaxSummaryModal';
import { fetchGigs } from '../../../src/lib/bankroll/tokeSelectors';
import { HubErrorBoundary } from '../../../src/components/ui/HubErrorBoundary';
import { supabase } from '../../../src/lib/supabase';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

export default function DealerVaultPage() {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;
    const [mounted, setMounted] = useState(false);
    const [completedGigs, setCompletedGigs] = useState([]);
    const [menuOpen, setMenuOpen] = useState(false);
    const [tokePrefs, setTokePrefs] = useState({});
    const [showTaxSummary, setShowTaxSummary] = useState(false);

    // Handle ?tab=tax query param — auto-open Tax Summary modal
    useEffect(() => {
        if (router.query.tab === 'tax' && completedGigs.length > 0) {
            setShowTaxSummary(true);
        }
    }, [router.query.tab, completedGigs]);

    // SSR-safe: hydrate prefs + mount flag on client only
    useEffect(() => {
        setMounted(true);
        try {
            const stored = localStorage.getItem('toke-tracker-prefs');
            if (stored) setTokePrefs(JSON.parse(stored));
        } catch (e) { console.warn('[App] Handled exception:', e); }
    }, []);

    // Load completed gigs for 1099 threshold alerts
    const loadGigs = useCallback(async () => {
        if (!userId) return;
        try {
            const gigs = await fetchGigs(userId);
            setCompletedGigs(gigs.filter(g => g.status === 'completed'));
        } catch (err) {
            console.warn('Error loading gigs for vault:', err);
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
            .channel(`toke-vault-sync-${userId}`)
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
            const { error: err_profiles_ajgs9 } = await supabase.from('profiles').update({ settings }).eq('id', userId);
            if (err_profiles_ajgs9) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_ajgs9.message);
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
                title="Dealer Vault — Secure Document Storage"
                description="Store and manage your tax documents, gaming licenses, W-2s, and employment paperwork securely."
                canonical="/hub/toke-tracker/vault"
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
                    <button onClick={() => router.push('/hub/toke-tracker')} style={s.backBtn}>
                        ← Toke Tracker
                    </button>

                    <h1 style={s.title}>Dealer Vault</h1>
                    <p style={s.subtitle}>Secure Document Storage</p>

                    <HubErrorBoundary name="Dealer Vault">
                        <DealerVault userId={userId} completedGigs={completedGigs} />
                    </HubErrorBoundary>

                    {/* Tax Summary Button */}
                    {completedGigs.length > 0 && (
                        <button style={s.taxBtn} onClick={() => setShowTaxSummary(true)}>
                            📄 Annual Tax Summary & PDF Export
                        </button>
                    )}

                    {/* Tax Summary Modal */}
                    {showTaxSummary && (
                        <TaxSummaryModal
                            completedGigs={completedGigs}
                            onClose={() => setShowTaxSummary(false)}
                        />
                    )}
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
    taxBtn: {
        width: '100%',
        padding: '14px',
        marginTop: 20,
        background: 'rgba(54,187,106,0.08)',
        border: '1px dashed rgba(54,187,106,0.4)',
        borderRadius: 10,
        color: '#36bb6a',
        fontSize: 15,
        fontWeight: 700,
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'background 0.2s',
    },
};
