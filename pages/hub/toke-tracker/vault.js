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
import { TokeWorkspace } from '../../../src/components/bankroll/toke/TokeWorkspace';
import DealerVault from '../../../src/components/bankroll/DealerVault';
import TaxSummaryModal from '../../../src/components/bankroll/TaxSummaryModal';
import { fetchGigs } from '../../../src/lib/bankroll/tokeSelectors';
import { HubErrorBoundary } from '../../../src/components/ui/HubErrorBoundary';
import { supabase } from '../../../src/lib/supabase';

export default function DealerVaultPage() {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;
    const [mounted, setMounted] = useState(false);
    const [completedGigs, setCompletedGigs] = useState([]);
    const [menuOpen, setMenuOpen] = useState(false);
    const [tokePrefs, setTokePrefs] = useState({});
    const [showTaxSummary, setShowTaxSummary] = useState(false);

    // The Taxes command remains useful for a new dealer with no completed
    // gigs: TaxSummaryModal owns the empty state and guidance.
    useEffect(() => {
        setShowTaxSummary(router.query.tab === 'tax');
    }, [router.query.tab]);

    const closeTaxSummary = useCallback(() => {
        setShowTaxSummary(false);
        if (router.query.tab !== 'tax') return;
        const nextQuery = { ...router.query };
        delete nextQuery.tab;
        void router.replace(
            { pathname: router.pathname, query: nextQuery },
            undefined,
            { shallow: true, scroll: false },
        );
    }, [router]);

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

    // AEO phase 3 (2026-09-18): the head used to sit below this guard.
    // The guard is true on the server, so the branch a crawler always
    // takes returned nothing and the page served a 200 with no title and
    // zero words. The head is hoisted above it and returned from it, so
    // the page says what it is before it says it is still loading.
    // Toke Tracker is a dealer's own income record, kept behind an account.
    // There is no public half of it: with the head hoisted it still serves
    // eight words to a crawler. A named page that asks not to be indexed is
    // the honest description of that; an indexable eight word page is not.
    // A public Toke Tracker page, if there is ever a reason for one, is a
    // page with content on it, not this one.
    const pageHead = (
      <SEOHead
          title="Dealer Vault - Secure Document Storage"
          description="Store and manage your tax documents, gaming licenses, W-2s, and employment paperwork securely."
          canonical="/hub/toke-tracker/vault"
          noindex
      />
    );

    if (!mounted) return pageHead;

    return (
        <PageTransition>
            {pageHead}
            <div>
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

                <TokeWorkspace section="vault">

                    <HubErrorBoundary name="Dealer Vault">
                        <DealerVault userId={userId} completedGigs={completedGigs} />
                    </HubErrorBoundary>

                    {/* Tax Summary Button */}
                    {completedGigs.length > 0 && (
                        <button className="sd-button" onClick={() => setShowTaxSummary(true)}>
                            Annual Tax Summary &amp; PDF Export
                        </button>
                    )}

                    {/* Tax Summary Modal */}
                    {showTaxSummary && (
                        <TaxSummaryModal
                            completedGigs={completedGigs}
                            onClose={closeTaxSummary}
                        />
                    )}
                </TokeWorkspace>
            </div>
    </PageTransition>
    );
}
