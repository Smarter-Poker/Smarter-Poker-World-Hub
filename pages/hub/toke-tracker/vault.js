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
import { useTokePrefs } from '../../../src/components/bankroll/toke/useTokePrefs';
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
    // Completed gigs, tagged with whose they are and whether the read failed.
    // A failed read used to leave an empty list, so the Tax Summary said "No
    // Completed Events" and the 1099 alerts vanished for a dealer who had
    // dozens: an empty state that lied. It now says it could not load.
    const [gigData, setGigData] = useState(null);
    const gigRead = useRef(0);
    const currentGigs = gigData?.owner === userId ? gigData : null;
    const completedGigs = currentGigs?.gigs || [];
    const gigStatus = !userId ? 'signed-out' : !currentGigs ? 'loading' : currentGigs.error ? 'error' : 'ready';
    const [menuOpen, setMenuOpen] = useState(false);
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

    // SSR-safe: mount flag on client only (preferences: useTokePrefs)
    useEffect(() => {
        setMounted(true);
    }, []);

    // Load completed gigs for 1099 threshold alerts
    const loadGigs = useCallback(async () => {
        const read = ++gigRead.current;
        if (!userId) return;
        try {
            const gigs = await fetchGigs(userId);
            if (gigRead.current === read) setGigData({ owner: userId, gigs: gigs.filter(g => g.status === 'completed') });
        } catch (err) {
            if (gigRead.current === read) setGigData(prev => ({ owner: userId, gigs: prev?.owner === userId ? prev.gigs : [], error: true }));
            console.warn('Error loading gigs for vault:', err);
        }
    }, [userId]);

    useEffect(() => { loadGigs(); return () => { gigRead.current++; }; }, [loadGigs]);

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

    const { prefs: tokePrefs, handlers: prefHandlers } = useTokePrefs(userId);
    const menuConfig = getMenuConfig('toke-tracker', user, tokePrefs, prefHandlers);

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
                            status={gigStatus}
                            onRetry={loadGigs}
                            onClose={closeTaxSummary}
                        />
                    )}
                </TokeWorkspace>
            </div>
    </PageTransition>
    );
}
