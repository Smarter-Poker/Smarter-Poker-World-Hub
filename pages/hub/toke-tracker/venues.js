/**
 * TOKE TRACKER — Venue Intelligence Page
 * Venue performance analytics + shift calendar
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { useTokePrefs } from '../../../src/components/bankroll/toke/useTokePrefs';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { TokeWorkspace } from '../../../src/components/bankroll/toke/TokeWorkspace';
import VenueIntelligence from '../../../src/components/bankroll/VenueIntelligence';
import TokeCalendar from '../../../src/components/bankroll/TokeCalendar';
import { fetchGigs } from '../../../src/lib/bankroll/tokeSelectors';
import { HubErrorBoundary } from '../../../src/components/ui/HubErrorBoundary';
import { supabase } from '../../../src/lib/supabase';

export default function VenueIntelPage() {
    const { user } = useAvatar();
    const userId = user?.id;
    const [mounted, setMounted] = useState(false);
    const [venueData, setVenueData] = useState(null);
    const venueRead = useRef(0);
    const currentData = venueData?.owner === userId ? venueData : null;
    const [menuOpen, setMenuOpen] = useState(false);

    // SSR-safe: mount flag on client only (preferences: useTokePrefs)
    useEffect(() => {
        setMounted(true);
    }, []);

    // Load completed gigs for VenueIntelligence
    const loadGigs = useCallback(async () => {
        const read = ++venueRead.current;
        if (!userId) return;
        try {
            const gigs = await fetchGigs(userId);
            if (venueRead.current === read) setVenueData({owner:userId,gigs:gigs.filter(g => g.status === 'completed')});
        } catch (err) {
            if (venueRead.current === read) setVenueData({owner:userId,error:true});
            console.warn('Error loading gigs:', err);
        }
    }, [userId]);

    useEffect(() => { loadGigs(); return () => { venueRead.current++; }; }, [loadGigs]);

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
          title="Venue Intelligence - Performance Analytics"
          description="Analyze your performance across different venues with earning comparisons and shift calendar."
          canonical="/hub/toke-tracker/venues"
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

                <TokeWorkspace section="venues">

                    <HubErrorBoundary name="Venue Intelligence">
                        <VenueIntelligence gigs={currentData?.gigs} signedIn={Boolean(userId)}
                            loading={Boolean(userId && !currentData)} error={Boolean(currentData?.error)} onRetry={loadGigs} />
                    </HubErrorBoundary>

                    <div>
                        <HubErrorBoundary name="Shift Calendar">
                            <TokeCalendar key={userId || 'guest'} userId={userId} headerAction />
                        </HubErrorBoundary>
                    </div>
                </TokeWorkspace>
            </div>
    </PageTransition>
    );
}
