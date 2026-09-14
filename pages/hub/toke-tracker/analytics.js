/**
 * TOKE TRACKER - Analytics Page
 *
 * Mobile phase 11: HubPageShell + the phase 0a foundation. TokeDashboard now
 * renders every chart stacked under its own heading (the four-tab strip it
 * used to carry hid three of them behind a tap).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageShell from '../../../src/components/ui/HubPageShell';
import PullToRefresh from '../../../src/components/ui/PullToRefresh';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { useHaptics } from '../../../src/hooks/useHaptics';
import { useOnlineStatus, OFFLINE_TOAST } from '../../../src/hooks/useOnlineStatus';
import { useTokePrefs } from '../../../src/hooks/useTokePrefs';
import TokeDashboard from '../../../src/components/bankroll/TokeDashboard';
import { HubErrorBoundary } from '../../../src/components/ui/HubErrorBoundary';
import { supabase } from '../../../src/lib/supabase';
import toast from '../../../src/stores/toastStore';

const UniversalHeader = dynamic(() => import('../../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../../src/components/ui/HamburgerMenu'), { ssr: false });

export default function TokeAnalyticsPage() {
    const { user } = useAvatar();
    const userId = user?.id;
    const [menuOpen, setMenuOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const haptic = useHaptics();
    const online = useOnlineStatus();
    const { tokePrefs, menuHandlers } = useTokePrefs(userId);

    const refreshData = useCallback(() => setRefreshTrigger((t) => t + 1), []);

    const requireOnline = useCallback(() => {
        if (online) return true;
        toast.error(OFFLINE_TOAST);
        return false;
    }, [online]);

    const refreshAnalytics = useCallback(async () => {
        if (!requireOnline()) return;
        haptic('light');
        refreshData();
        await new Promise((r) => setTimeout(r, 600));
    }, [requireOnline, haptic, refreshData]);

    useEffect(() => {
        window.addEventListener('toke-gig-completed', refreshData);
        window.addEventListener('toke-data-updated', refreshData);
        return () => {
            window.removeEventListener('toke-gig-completed', refreshData);
            window.removeEventListener('toke-data-updated', refreshData);
        };
    }, [refreshData]);

    // Debounced refresh for realtime - prevents flooding during multi-row ops
    const rtTimerRef = useRef(null);
    const debouncedRefresh = useCallback(() => {
        if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
        rtTimerRef.current = setTimeout(refreshData, 500);
    }, [refreshData]);
    useEffect(() => () => { if (rtTimerRef.current) clearTimeout(rtTimerRef.current); }, []);

    useEffect(() => {
        if (!userId) return undefined;
        const channel = supabase
            .channel(`toke-analytics-sync-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toke_gigs', filter: `user_id=eq.${userId}` }, debouncedRefresh)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [userId, debouncedRefresh]);

    const menuConfig = getMenuConfig('toke-tracker', user, tokePrefs, menuHandlers);

    return (
        <>
            <SEOHead
                title="Toke Analytics - Earnings Dashboard"
                description="Analyze your dealing earnings with detailed breakdowns, hourly rates, and trend analysis."
                canonical="/hub/toke-tracker/analytics"
            />
            <HubPageShell
                className="toke"
                maxWidth={640}
                background="#18191a"
                header={<UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />}
            >
                <div className="toke-bg-grid" />
                <PullToRefresh onRefresh={refreshAnalytics} disabled={menuOpen}>
                    <div className="toke-page" data-tutorial="analytics">
                        <Link href="/hub/toke-tracker" className="toke-back-link">&larr; Toke Tracker</Link>
                        <h1 className="toke-page-title" data-tutorial="title">Analytics</h1>
                        <p className="toke-page-subtitle">Earnings Breakdown And Trends</p>

                        <HubErrorBoundary name="Toke Analytics">
                            <TokeDashboard userId={userId} refreshTrigger={refreshTrigger} />
                        </HubErrorBoundary>
                    </div>
                </PullToRefresh>
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
