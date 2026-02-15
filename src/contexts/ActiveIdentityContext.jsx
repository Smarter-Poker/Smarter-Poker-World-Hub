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

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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
    useEffect(() => {
        const detectClubPage = async () => {
            try {
                const stored = localStorage.getItem('commander_staff');
                if (!stored) return;

                const data = JSON.parse(stored);
                if (!data || !data.venue_id) return;

                // Get the current user ID
                let userId = null;
                const authData = localStorage.getItem('smarter-poker-auth');
                if (authData) {
                    const parsed = JSON.parse(authData);
                    userId = parsed?.user?.id;
                }

                // Fetch club page by venue_id
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
                    console.log('[ActiveIdentity] Club page found:', page.name);
                } else if (userId) {
                    // Fallback: check by owner_id
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

    const switchToClub = useCallback((clubPage = null) => {
        const page = clubPage || availableClubPage;
        if (!page) {
            console.warn('[ActiveIdentity] No club page available to switch to');
            return;
        }
        console.log('[ActiveIdentity] Switching to club:', page.name);
        setActiveIdentity({ mode: 'club', clubPage: page });
    }, [availableClubPage]);

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
