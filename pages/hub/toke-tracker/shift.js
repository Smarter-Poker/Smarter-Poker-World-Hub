/**
 * TOKE TRACKER - Shift Tracker Page
 *
 * Mobile phase 11: HubPageShell + the phase 0a foundation. A pull at the top
 * re-reads the shift (TokeTracker listens for `toke-data-updated`), an
 * offline pull says so instead of spinning, and the page owns no header, no
 * 100vh and no bottom pad.
 */

import { useCallback, useState } from 'react';
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
import TokeTracker from '../../../src/components/bankroll/TokeTracker';
import { HubErrorBoundary } from '../../../src/components/ui/HubErrorBoundary';
import toast from '../../../src/stores/toastStore';

const UniversalHeader = dynamic(() => import('../../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../../src/components/ui/HamburgerMenu'), { ssr: false });

export default function ShiftTrackerPage() {
    const { user } = useAvatar();
    const userId = user?.id;
    const [menuOpen, setMenuOpen] = useState(false);
    const haptic = useHaptics();
    const online = useOnlineStatus();
    const { tokePrefs, menuHandlers } = useTokePrefs(userId);

    const requireOnline = useCallback(() => {
        if (online) return true;
        toast.error(OFFLINE_TOAST);
        return false;
    }, [online]);

    const refreshShift = useCallback(async () => {
        if (!requireOnline()) return;
        haptic('light');
        window.dispatchEvent(new CustomEvent('toke-data-updated'));
        await new Promise((r) => setTimeout(r, 600));
    }, [requireOnline, haptic]);

    const menuConfig = getMenuConfig('toke-tracker', user, tokePrefs, menuHandlers);

    return (
        <>
            <SEOHead
                title="Shift Tracker - Log Tokes & Downs"
                description="Clock in, track downs with 35-min timer, log tokes and expenses for each shift."
                canonical="/hub/toke-tracker/shift"
            />
            <HubPageShell
                className="toke"
                maxWidth={640}
                background="#18191a"
                header={<UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />}
            >
                <div className="toke-bg-grid" />
                <PullToRefresh onRefresh={refreshShift} disabled={menuOpen}>
                    <div className="toke-page" data-tutorial="shift">
                        <Link href="/hub/toke-tracker" className="toke-back-link">&larr; Toke Tracker</Link>
                        <h1 className="toke-page-title" data-tutorial="title">Shift Tracker</h1>
                        <p className="toke-page-subtitle">Downs, Tokes, Expenses</p>
                        <div data-tutorial="event">
                            <HubErrorBoundary name="Shift Tracker">
                                <TokeTracker userId={userId} refreshTrigger={0} standalone tokePrefs={tokePrefs} />
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
