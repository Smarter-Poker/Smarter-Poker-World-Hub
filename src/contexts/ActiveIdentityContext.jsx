/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ACTIVE IDENTITY CONTEXT — Personal vs Club Page Identity Switcher
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Allows Club Commander users to switch between posting/messaging as
 * themselves (personal) or as their Club Page.
 * 
 * Similar to Facebook's "Switch to Page" feature.
 * 
 * Usage:
 *   const { activeIdentity, switchToPersonal, switchToClub, isClubMode } = useActiveIdentity();
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const ActiveIdentityContext = createContext({
    activeIdentity: { mode: 'personal', clubPage: null },
    switchToPersonal: () => { },
    switchToClub: () => { },
    isClubMode: false,
    clubPage: null,
    hasClubPage: false,
});

const STORAGE_KEY = 'active-identity';

export function ActiveIdentityProvider({ children }) {
    const [activeIdentity, setActiveIdentity] = useState({ mode: 'personal', clubPage: null });
    const [availableClubPage, setAvailableClubPage] = useState(null);

    // Load persisted identity on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && parsed.mode) {
                    setActiveIdentity(parsed);
                }
            }
        } catch (e) {
            console.warn('[ActiveIdentity] Failed to load stored identity:', e);
        }
    }, []);

    // Auto-detect club page for Commander users
    // HARDENED: Always checks by owner_id as fallback, even without commander_staff in localStorage.
    // This ensures freshly registered Commanders can see their Club Page immediately after registration.
    useEffect(() => {
        const detectClubPage = async () => {
            try {
                // ── Step 1: Get userId from auth data (required) ──
                let userId = null;
                try {
                    const authData = localStorage.getItem('smarter-poker-auth');
                    if (authData) {
                        const parsed = JSON.parse(authData);
                        userId = parsed?.user?.id;
                    }
                    // Fallback: try legacy sb-* keys
                    if (!userId) {
                        const sbKeys = Object.keys(localStorage).filter(
                            k => k.startsWith('sb-') && k.endsWith('-auth-token')
                        );
                        if (sbKeys.length > 0) {
                            const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
                            userId = tokenData?.user?.id;
                        }
                    }
                } catch (e) { /* ignore parse errors */ }

                if (!userId) return; // Not logged in, nothing to detect

                // ── Step 2: Try venue_id lookup (if commander_staff exists) ──
                try {
                    const stored = localStorage.getItem('commander_staff');
                    if (stored) {
                        const data = JSON.parse(stored);
                        if (data?.venue_id) {
                            const res = await fetch(`/api/social/pages?linked_venue_id=${data.venue_id}`);
                            const json = await res.json();
                            if (json.success && json.data && json.data.length > 0) {
                                const page = json.data[0];
                                setAvailableClubPage({
                                    id: page.id,
                                    name: page.name,
                                    avatar_url: page.avatar_url,
                                    page_type: page.page_type || 'club',
                                });
                                console.log('[ActiveIdentity] Club page found (by venue):', page.name);
                                return; // Found — done
                            }
                        }
                    }
                } catch (e) { /* commander_staff parse failed, try fallback */ }

                // ── Step 3: Always fallback to owner_id lookup ──
                // This catches freshly registered Commanders who haven't logged into
                // Commander yet (so commander_staff isn't in localStorage).
                const res2 = await fetch(`/api/social/pages?owner_id=${userId}`);
                const json2 = await res2.json();
                if (json2.success && json2.data && json2.data.length > 0) {
                    const page = json2.data[0];
                    setAvailableClubPage({
                        id: page.id,
                        name: page.name,
                        avatar_url: page.avatar_url,
                        page_type: page.page_type || 'club',
                    });
                    console.log('[ActiveIdentity] Club page found (by owner):', page.name);
                }
            } catch (e) {
                console.warn('[ActiveIdentity] Club page detection failed:', e);
            }
        };

        detectClubPage();
    }, []);

    // Persist to localStorage on change
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(activeIdentity));
        } catch (e) {
            console.warn('[ActiveIdentity] Failed to persist identity:', e);
        }
    }, [activeIdentity]);

    const switchToPersonal = useCallback(() => {
        console.log('[ActiveIdentity] Switching to personal');
        setActiveIdentity({ mode: 'personal', clubPage: null });
    }, []);

    // Debounce ref to prevent race conditions from rapid switching
    const switchDebounceRef = useRef(null);

    const switchToClub = useCallback((clubPage = null) => {
        const page = clubPage || availableClubPage;
        if (!page) {
            console.warn('[ActiveIdentity] No club page available to switch to');
            return;
        }
        // 500ms debounce
        if (switchDebounceRef.current) clearTimeout(switchDebounceRef.current);
        switchDebounceRef.current = setTimeout(() => {
            console.log('[ActiveIdentity] Switching to club:', page.name);
            setActiveIdentity({ mode: 'club', clubPage: page });
        }, 100);
    }, [availableClubPage]);

    // ── Stale Identity Guard ──
    // If the stored club page was deleted (admin action, etc.), auto-reset to personal
    useEffect(() => {
        if (activeIdentity.mode !== 'club' || !activeIdentity.clubPage?.id) return;
        const validateClubPage = async () => {
            try {
                const res = await fetch(`/api/social/pages?id=${activeIdentity.clubPage.id}`);
                const json = await res.json();
                if (!json.success || !json.data || (Array.isArray(json.data) && json.data.length === 0)) {
                    console.warn('[ActiveIdentity] Stale club page detected, resetting to personal');
                    setActiveIdentity({ mode: 'personal', clubPage: null });
                    setAvailableClubPage(null);
                }
            } catch (e) { /* network error — keep existing identity */ }
        };
        validateClubPage();
    }, []); // Only on mount

    const value = {
        activeIdentity,
        switchToPersonal,
        switchToClub,
        isClubMode: activeIdentity.mode === 'club',
        clubPage: activeIdentity.clubPage || availableClubPage,
        hasClubPage: !!availableClubPage,
        availableClubPage,
    };

    return (
        <ActiveIdentityContext.Provider value={value}>
            {children}
        </ActiveIdentityContext.Provider>
    );
}

export function useActiveIdentity() {
    return useContext(ActiveIdentityContext);
}

export default ActiveIdentityContext;
