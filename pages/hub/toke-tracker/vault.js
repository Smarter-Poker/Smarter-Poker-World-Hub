/**
 * TOKE TRACKER - Dealer Vault Page
 *
 * Mobile phase 11: HubPageShell + the phase 0a foundation. DealerVault now
 * lists every document category stacked under its own heading (its four-tab
 * strip unmounted three of the four), and the Tax Summary is a bottom sheet
 * on a phone that the back gesture closes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageShell from '../../../src/components/ui/HubPageShell';
import PullToRefresh from '../../../src/components/ui/PullToRefresh';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { useHaptics } from '../../../src/hooks/useHaptics';
import { useLoadFailsafe, useInitialLoadRef } from '../../../src/hooks/useLoadFailsafe';
import { useModalHistory } from '../../../src/hooks/useModalHistory';
import { useOnlineStatus, OFFLINE_TOAST } from '../../../src/hooks/useOnlineStatus';
import { useTokePrefs } from '../../../src/hooks/useTokePrefs';
import DealerVault from '../../../src/components/bankroll/DealerVault';
import TaxSummaryModal from '../../../src/components/bankroll/TaxSummaryModal';
import { fetchGigs } from '../../../src/lib/bankroll/tokeSelectors';
import { HubErrorBoundary } from '../../../src/components/ui/HubErrorBoundary';
import { supabase } from '../../../src/lib/supabase';
import toast from '../../../src/stores/toastStore';

const UniversalHeader = dynamic(() => import('../../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../../src/components/ui/HamburgerMenu'), { ssr: false });

export default function DealerVaultPage() {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;
    const [completedGigs, setCompletedGigs] = useState([]);
    const [gigsLoading, setGigsLoading] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const [showTaxSummary, setShowTaxSummary] = useState(false);
    const haptic = useHaptics();
    const online = useOnlineStatus();
    const { tokePrefs, menuHandlers } = useTokePrefs(userId);
    const isInitialLoad = useInitialLoadRef();

    // A hung Supabase call clears the skeleton after eight seconds.
    useLoadFailsafe(gigsLoading, setGigsLoading);

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

    // The phone back gesture closes the sheet instead of leaving the page.
    useModalHistory(showTaxSummary, closeTaxSummary);

    const requireOnline = useCallback(() => {
        if (online) return true;
        toast.error(OFFLINE_TOAST);
        return false;
    }, [online]);

    // Load completed gigs for 1099 threshold alerts
    const loadGigs = useCallback(async () => {
        if (!userId) { setGigsLoading(false); return; }
        if (isInitialLoad.current) setGigsLoading(true);
        try {
            const gigs = await fetchGigs(userId);
            setCompletedGigs(gigs.filter((g) => g.status === 'completed'));
        } catch (err) {
            console.warn('Error loading gigs for vault:', err);
        } finally {
            isInitialLoad.current = false;
            setGigsLoading(false);
        }
    }, [userId, isInitialLoad]);

    useEffect(() => { loadGigs(); }, [loadGigs]);

    useEffect(() => {
        window.addEventListener('toke-gig-completed', loadGigs);
        window.addEventListener('toke-data-updated', loadGigs);
        return () => {
            window.removeEventListener('toke-gig-completed', loadGigs);
            window.removeEventListener('toke-data-updated', loadGigs);
        };
    }, [loadGigs]);

    // Debounced refresh for realtime - prevents flooding during multi-row ops
    const rtTimerRef = useRef(null);
    const debouncedLoadGigs = useCallback(() => {
        if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
        rtTimerRef.current = setTimeout(loadGigs, 500);
    }, [loadGigs]);
    useEffect(() => () => { if (rtTimerRef.current) clearTimeout(rtTimerRef.current); }, []);

    useEffect(() => {
        if (!userId) return undefined;
        const channel = supabase
            .channel(`toke-vault-sync-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toke_gigs', filter: `user_id=eq.${userId}` }, debouncedLoadGigs)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [userId, debouncedLoadGigs]);

    const refreshVault = useCallback(async () => {
        if (!requireOnline()) return;
        haptic('light');
        await loadGigs();
        window.dispatchEvent(new CustomEvent('bankroll-updated'));
    }, [requireOnline, haptic, loadGigs]);

    const menuConfig = getMenuConfig('toke-tracker', user, tokePrefs, menuHandlers);

    return (
        <>
            <SEOHead
                title="Dealer Vault - Secure Document Storage"
                description="Store and manage your tax documents, gaming licenses, W-2s, and employment paperwork securely."
                canonical="/hub/toke-tracker/vault"
            />
            <HubPageShell
                className="toke"
                maxWidth={640}
                background="#18191a"
                header={<UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />}
            >
                <div className="toke-bg-grid" />
                <PullToRefresh onRefresh={refreshVault} disabled={menuOpen || showTaxSummary}>
                    <div className="toke-page" data-tutorial="vault">
                        <Link href="/hub/toke-tracker" className="toke-back-link">&larr; Toke Tracker</Link>
                        <h1 className="toke-page-title" data-tutorial="title">Dealer Vault</h1>
                        <p className="toke-page-subtitle">Secure Document Storage</p>

                        <HubErrorBoundary name="Dealer Vault">
                            <DealerVault userId={userId} completedGigs={completedGigs} />
                        </HubErrorBoundary>

                        {/* Tax Summary Button */}
                        {completedGigs.length > 0 && (
                            <button
                                type="button"
                                style={s.taxBtn}
                                onClick={() => { haptic('light'); setShowTaxSummary(true); }}
                            >
                                Annual Tax Summary And PDF Export
                            </button>
                        )}
                    </div>
                </PullToRefresh>
            </HubPageShell>

            {/* Tax Summary Modal */}
            {showTaxSummary && (
                <TaxSummaryModal
                    completedGigs={completedGigs}
                    onClose={closeTaxSummary}
                />
            )}

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
    taxBtn: {
        width: '100%',
        minHeight: 44,
        marginTop: 16,
        padding: '13px 16px',
        background: 'rgba(54,187,106,0.08)',
        border: '1px dashed rgba(54,187,106,0.4)',
        borderRadius: 10,
        color: '#36bb6a',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        textAlign: 'center',
    },
};
