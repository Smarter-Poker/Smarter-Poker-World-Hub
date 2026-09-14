/**
 * TOKE TRACKER - Venue Intel Page
 *
 * Mobile phase 11: HubPageShell + the phase 0a foundation. The year calendar
 * is one month per row on a phone with 44px day buttons (it was three months
 * across, which made every day a 15px target), and its two modals are bottom
 * sheets the back gesture closes.
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
import { useLoadFailsafe, useInitialLoadRef } from '../../../src/hooks/useLoadFailsafe';
import { useOnlineStatus, OFFLINE_TOAST } from '../../../src/hooks/useOnlineStatus';
import { useTokePrefs } from '../../../src/hooks/useTokePrefs';
import VenueIntelligence from '../../../src/components/bankroll/VenueIntelligence';
import TokeCalendar from '../../../src/components/bankroll/TokeCalendar';
import { fetchGigs } from '../../../src/lib/bankroll/tokeSelectors';
import { HubErrorBoundary } from '../../../src/components/ui/HubErrorBoundary';
import { supabase } from '../../../src/lib/supabase';
import toast from '../../../src/stores/toastStore';

const UniversalHeader = dynamic(() => import('../../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../../src/components/ui/HamburgerMenu'), { ssr: false });

export default function VenueIntelPage() {
    const { user } = useAvatar();
    const userId = user?.id;
    const [completedGigs, setCompletedGigs] = useState([]);
    const [gigsLoading, setGigsLoading] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const [calendarSheetOpen, setCalendarSheetOpen] = useState(false);
    const haptic = useHaptics();
    const online = useOnlineStatus();
    const { tokePrefs, menuHandlers } = useTokePrefs(userId);
    const isInitialLoad = useInitialLoadRef();

    useLoadFailsafe(gigsLoading, setGigsLoading);

    const requireOnline = useCallback(() => {
        if (online) return true;
        toast.error(OFFLINE_TOAST);
        return false;
    }, [online]);

    const loadGigs = useCallback(async () => {
        if (!userId) { setGigsLoading(false); return; }
        if (isInitialLoad.current) setGigsLoading(true);
        try {
            const gigs = await fetchGigs(userId);
            setCompletedGigs(gigs.filter((g) => g.status === 'completed'));
        } catch (err) {
            console.warn('Error loading gigs:', err);
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
            .channel(`toke-venues-sync-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toke_gigs', filter: `user_id=eq.${userId}` }, debouncedLoadGigs)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [userId, debouncedLoadGigs]);

    const refreshVenues = useCallback(async () => {
        if (!requireOnline()) return;
        haptic('light');
        await loadGigs();
        window.dispatchEvent(new CustomEvent('toke-calendar-updated'));
    }, [requireOnline, haptic, loadGigs]);

    const menuConfig = getMenuConfig('toke-tracker', user, tokePrefs, menuHandlers);

    return (
        <>
            <SEOHead
                title="Venue Intelligence - Performance Analytics"
                description="Analyze your performance across different venues with earning comparisons and shift calendar."
                canonical="/hub/toke-tracker/venues"
            />
            <HubPageShell
                className="toke"
                /* The year calendar needs the width: two month cards at 44px
                   a day is 700px of grid (mobile phase 11). */
                maxWidth={960}
                background="#18191a"
                header={<UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />}
            >
                <div className="toke-bg-grid" />
                <PullToRefresh onRefresh={refreshVenues} disabled={menuOpen || calendarSheetOpen}>
                    <div className="toke-page" data-tutorial="venues">
                        <Link href="/hub/toke-tracker" className="toke-back-link">&larr; Toke Tracker</Link>
                        <h1 className="toke-page-title" data-tutorial="title">Venue Intel</h1>
                        <p className="toke-page-subtitle">Performance By Venue And Shift Calendar</p>

                        <HubErrorBoundary name="Venue Intelligence">
                            <VenueIntelligence gigs={completedGigs} />
                        </HubErrorBoundary>

                        <div style={{ marginTop: 24 }} data-tutorial="calendar">
                            <HubErrorBoundary name="Shift Calendar">
                                <TokeCalendar userId={userId} onSheetOpenChange={setCalendarSheetOpen} />
                            </HubErrorBoundary>
                        </div>
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
