/**
 * TOKE TRACKER — Shift Tracker Page
 * Core gig/down/timer/expense tracking
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { useTokePrefs } from '../../../src/components/bankroll/toke/useTokePrefs';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { TokeWorkspace } from '../../../src/components/bankroll/toke/TokeWorkspace';
import TokeTracker from '../../../src/components/bankroll/TokeTracker';
import { HubErrorBoundary } from '../../../src/components/ui/HubErrorBoundary';

export default function ShiftTrackerPage() {
    const { user } = useAvatar();
    const userId = user?.id;
    const [mounted, setMounted] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    // SSR-safe: mount flag on client only (preferences: useTokePrefs)
    useEffect(() => {
        setMounted(true);
    }, []);

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
          title="Shift Tracker - Log Tokes & Downs"
          description="Clock in, track downs with 35-min timer, log tokes and expenses for each shift."
          canonical="/hub/toke-tracker/shift"
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

                <TokeWorkspace section="shift">
                    <HubErrorBoundary name="Shift Tracker">
                        <TokeTracker userId={userId} refreshTrigger={0} standalone tokePrefs={tokePrefs} />
                    </HubErrorBoundary>
                </TokeWorkspace>
            </div>
    </PageTransition>
    );
}
