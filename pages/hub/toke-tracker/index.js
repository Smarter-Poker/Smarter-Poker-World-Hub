/**
 * TOKE TRACKER — Landing Page
 * 4 clickable icon cards routing to dedicated sub-pages
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { useTokePrefs } from '../../../src/components/bankroll/toke/useTokePrefs';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { TokeDestinations, TokeWorkspace } from '../../../src/components/bankroll/toke/TokeWorkspace';

export default function TokeTrackerLanding() {
    const { user } = useAvatar();
    const userId = user?.id;
    const [mounted, setMounted] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => { setMounted(true); }, []);

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
          title="Toke Tracker - Dealer Income Management"
          description="Track shifts, analyze earnings, store documents, and monitor venue performance."
          canonical="/hub/toke-tracker"
          noindex
      />
    );

    if (!mounted) return pageHead;

    return (
        <PageTransition>
            {pageHead}
            <div>
                <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />

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

                <TokeWorkspace>
                    <TokeDestinations />
                </TokeWorkspace>
            </div>
        </PageTransition>
    );
}
