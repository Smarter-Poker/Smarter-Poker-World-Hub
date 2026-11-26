/**
 * TOKE TRACKER — Landing Page
 * 4 clickable icon cards routing to dedicated sub-pages
 */

import { useState, useEffect, useCallback } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { TokeDestinations, TokeWorkspace } from '../../../src/components/bankroll/toke/TokeWorkspace';
import { supabase } from '../../../src/lib/supabase';

export default function TokeTrackerLanding() {
    const { user } = useAvatar();
    const userId = user?.id;
    const [mounted, setMounted] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [tokePrefs, setTokePrefs] = useState({
        shiftNotifications: true,
        autoSaveShifts: true,
        downTimerAlerts: true
    });

    useEffect(() => { setMounted(true); }, []);

    // Load preferences from Supabase
    useEffect(() => {
        if (!userId) return;
        supabase.from('profiles').select('settings').eq('id', userId).maybeSingle()
            .then(({ data }) => {
                if (data?.settings?.tokeTracker) {
                    setTokePrefs(prev => ({ ...prev, ...data.settings.tokeTracker }));
                }
            })
            .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    }, [userId]);

    // Save preference to Supabase + emit bus event
    const updatePref = useCallback(async (key, value) => {
        let newPrefs;
        setTokePrefs(prev => {
            newPrefs = { ...prev, [key]: value };
            return newPrefs;
        });
        await new Promise(r => setTimeout(r, 0));
        if (!newPrefs) return;
        // Cross-tab sync
        window.dispatchEvent(new CustomEvent('toke-settings-sync', { detail: newPrefs }));
        // Persist to localStorage
        try { localStorage.setItem('toke-tracker-prefs', JSON.stringify(newPrefs)); } catch (e) { console.warn('[App] Handled exception:', e); }
        // Persist to Supabase
        if (!userId) return;
        try {

            const { data: profile } = await supabase.from('profiles').select('settings').eq('id', userId).maybeSingle();
            const settings = profile?.settings || {};
            settings.tokeTracker = newPrefs;
            const { error: err_profiles_i27c1 } = await supabase.from('profiles').update({ settings }).eq('id', userId);
            if (err_profiles_i27c1) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_i27c1.message);
        } catch (err) {
            console.warn('[TokeTracker] Failed to save preference:', err);
        }
    }, [userId]);

    // Listen for cross-tab sync
    useEffect(() => {
        const handler = (e) => {
            if (e.detail) setTokePrefs(e.detail);
        };
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
