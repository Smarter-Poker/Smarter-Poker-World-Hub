/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ACTIVE IDENTITY CONTEXT — Personal vs Club Page Identity Switcher
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Allows Club Commander users to switch between posting/messaging as
 * themselves (personal) or as their Club Page.
 * 
 * Similar to SmarterPoker's "Switch to Page" feature.
 * 
 * Usage:
 *   const { activeIdentity, switchToPersonal, switchToClub, isClubMode } = useActiveIdentity();
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getAuthUser } from '../lib/authUtils';

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
    // Initialize from localStorage SYNCHRONOUSLY to prevent persist/load race condition.
    // Without this, the persist effect (which fires on [activeIdentity] changes) would
    // overwrite localStorage with the default 'personal' state before the load effect
    // could read and restore the stored 'club' identity.
    const [activeIdentity, setActiveIdentity] = useState(() => {
        if (typeof window === 'undefined') return { mode: 'personal', clubPage: null };
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && parsed.mode) return parsed;
            }
        } catch (e) {
            console.warn('[ActiveIdentity] Failed to load stored identity:', e);
        }
        return { mode: 'personal', clubPage: null };
    });
    const [availableClubPage, setAvailableClubPage] = useState(null);

    // Auto-detect club page for Commander users
    // HARDENED: Always checks by owner_id as fallback, even without commander_staff in localStorage.
    // This ensures freshly registered Commanders can see their Club Page immediately after registration.
    useEffect(() => {
        let mounted = true; // Unmount guard — prevents state update on unmounted component

        const detectClubPage = async () => {
            try {
                // ── Step 1: Get userId from localStorage (AbortError-immune) ──
                // Uses the proven getAuthUser() utility which reads smarter-poker-auth
                // with 3-level fallback (explicit key → legacy sb-* keys → cached header user)
                const authUser = getAuthUser();
                const userId = authUser?.id || null;

                if (!userId) return; // Not logged in, nothing to detect

                // ── Step 2: Try venue_id lookup (if commander_staff exists) ──
                try {
                    const stored = localStorage.getItem('commander_staff');
                    if (stored) {
                        const data = JSON.parse(stored);
                        if (data?.venue_id) {
                            const res = await fetch(`/api/social/pages?linked_venue_id=${data.venue_id}`);
                            if (!mounted) return; // Guard: component unmounted during fetch
                            const json = await res.json();
                            if (json.success && json.data && json.data.length > 0) {
                                const page = json.data[0];
                                if (mounted) {
                                    setAvailableClubPage({
                                        id: page.id,
                                        name: page.name,
                                        avatar_url: page.avatar_url,
                                        page_type: page.page_type || 'club',
                                    });
                                }
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
                if (!mounted) return; // Guard: component unmounted during fetch
                const json2 = await res2.json();
                if (json2.success && json2.data && json2.data.length > 0) {
                    const page = json2.data[0];
                    if (mounted) {
                        setAvailableClubPage({
                            id: page.id,
                            name: page.name,
                            avatar_url: page.avatar_url,
                            page_type: page.page_type || 'club',
                        });
                    }
                    console.log('[ActiveIdentity] Club page found (by owner):', page.name);
                }
            } catch (e) {
                console.warn('[ActiveIdentity] Club page detection failed:', e);
            }
        };

        detectClubPage();
        return () => { mounted = false; }; // Cleanup: mark as unmounted
    }, []);

    // Persist to localStorage on change
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(activeIdentity));
        } catch (e) {
            console.warn('[ActiveIdentity] Failed to persist identity:', e);
        }
    }, [activeIdentity]);

    // ── Cross-Tab Identity Sync ──
    // When identity changes in another tab via localStorage, update this tab
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key !== STORAGE_KEY || !e.newValue) return;
            try {
                const parsed = JSON.parse(e.newValue);
                if (parsed && parsed.mode) {
                    setActiveIdentity(parsed);
                    console.log('[ActiveIdentity] Synced from another tab:', parsed.mode);
                }
            } catch (_) { /* ignore parse errors */ }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const switchToPersonal = useCallback(() => {
        console.log('[ActiveIdentity] Switching to personal');
        setActiveIdentity({ mode: 'personal', clubPage: null });
    }, []);

    // Debounce ref to prevent race conditions from rapid switching
    const switchDebounceRef = useRef(null);

    // Cleanup debounce timer on unmount — prevents zombie timeout
    useEffect(() => {
        return () => {
            if (switchDebounceRef.current) clearTimeout(switchDebounceRef.current);
        };
    }, []);

    const switchToClub = useCallback((clubPage = null) => {
        const page = clubPage || availableClubPage;
        if (!page) {
            console.warn('[ActiveIdentity] No club page available to switch to');
            return;
        }
        // 100ms debounce to prevent rapid switching race conditions
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
        let mounted = true; // Unmount guard — prevents state update after unmount
        const validateClubPage = async () => {
            try {
                const res = await fetch(`/api/social/pages?id=${activeIdentity.clubPage.id}`);
                if (!mounted) return; // Guard: component unmounted during fetch
                if (!res.ok) {
                    // 404 or server error — page likely deleted
                    console.warn('[ActiveIdentity] Stale club page detected (HTTP', res.status, '), resetting');
                    setActiveIdentity({ mode: 'personal', clubPage: null });
                    setAvailableClubPage(null);
                    return;
                }
                const json = await res.json();
                if (!mounted) return; // Guard: component unmounted during parse
                // Pages API returns { success, data } — data is object for single lookup
                if (!json.success || !json.data) {
                    console.warn('[ActiveIdentity] Stale club page detected, resetting to personal');
                    setActiveIdentity({ mode: 'personal', clubPage: null });
                    setAvailableClubPage(null);
                }
            } catch (e) { /* network error — keep existing identity */ }
        };
        validateClubPage();
        return () => { mounted = false; }; // Cleanup: mark as unmounted
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
