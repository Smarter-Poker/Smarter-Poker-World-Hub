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
    ownedPages: [], // All pages owned/managed by user
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
    const [ownedPages, setOwnedPages] = useState([]);

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

                let pagesFound = [];

                // ── Step 2: Try venue_id lookup (if commander_staff exists) ──
                try {
                    const stored = localStorage.getItem('commander_staff');
                    if (stored) {
                        const data = JSON.parse(stored);
                        if (data?.venue_id) {
                            const res = await fetch(`/api/social/pages?linked_venue_id=${data.venue_id}`);
                            if (mounted && res.ok) {
                                const json = await res.json();
                                if (json.success && json.data && json.data.length > 0) {
                                    pagesFound = [...json.data];
                                }
                            }
                        }
                    }
                } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

                // ── Step 3: Always fallback to owner_id lookup ──
                // This catches freshly registered Commanders who haven't logged into
                // Commander yet (so commander_staff isn't in localStorage), and also
                // gets ALL pages the user owns.
                try {
                    const res2 = await fetch(`/api/social/pages?owner_id=${userId}`);
                    if (mounted && res2.ok) {
                        const json2 = await res2.json();
                        if (json2.success && json2.data && json2.data.length > 0) {
                            // Merge without duplicates by ID
                            const existingIds = new Set(pagesFound.map(p => p.id));
                            for (const p of json2.data) {
                                if (!existingIds.has(p.id)) {
                                    pagesFound.push(p);
                                    existingIds.add(p.id);
                                }
                            }
                        }
                    }
                } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

                if (mounted && pagesFound.length > 0) {
                    setOwnedPages(pagesFound.map(page => ({
                        id: page.id,
                        name: page.name,
                        avatar_url: page.avatar_url,
                        page_type: page.page_type || 'club',
                    })));
                    console.debug('[ActiveIdentity] Club pages found:', pagesFound.length);
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
                    console.debug('[ActiveIdentity] Synced from another tab:', parsed.mode);
                }
            } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const switchToPersonal = useCallback(() => {
        console.debug('[ActiveIdentity] Switching to personal');
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
        // When called without an explicit page, auto-select the first available page
        const page = clubPage || (ownedPages.length > 0 ? ownedPages[0] : null);
        if (!page) {
            console.warn('[ActiveIdentity] No club page available to switch to');
            return;
        }
        // 100ms debounce to prevent rapid switching race conditions
        if (switchDebounceRef.current) clearTimeout(switchDebounceRef.current);
        switchDebounceRef.current = setTimeout(() => {
            console.debug('[ActiveIdentity] Switching to club:', page.name);
            setActiveIdentity({ mode: 'club', clubPage: page });
        }, 100);
    }, [ownedPages]);

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
                    setOwnedPages(prev => prev.filter(p => p.id !== activeIdentity.clubPage.id));
                    return;
                }
                const json = await res.json();
                if (!mounted) return; // Guard: component unmounted during parse
                // Pages API returns { success, data } — data is object for single lookup
                if (!json.success || !json.data) {
                    console.warn('[ActiveIdentity] Stale club page detected, resetting to personal');
                    setActiveIdentity({ mode: 'personal', clubPage: null });
                    setOwnedPages(prev => prev.filter(p => p.id !== activeIdentity.clubPage.id));
                }
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        };
        validateClubPage();
        return () => { mounted = false; }; // Cleanup: mark as unmounted
    }, []); // Only on mount

    // ── Club Avatar Live Sync ──
    // Refreshes club page data when tab regains focus or every 5 minutes.
    // Catches name/avatar changes made in Commander without requiring a page reload.
    useEffect(() => {
        if (ownedPages.length === 0) return;
        let mounted = true;

        const refreshClubData = async () => {
            try {
                // Fetch all owned pages to bulk-refresh
                const authUser = getAuthUser();
                if (!authUser?.id) return;
                
                const res = await fetch(`/api/social/pages?owner_id=${authUser.id}`);
                if (!mounted || !res.ok) return;
                const json = await res.json();
                if (!mounted || !json.success || !json.data) return;
                
                const freshPages = json.data;
                const newOwnedPages = freshPages.map(page => ({
                    id: page.id,
                    name: page.name,
                    avatar_url: page.avatar_url,
                    page_type: page.page_type || 'club',
                }));

                const isChanged = JSON.stringify(newOwnedPages) !== JSON.stringify(ownedPages);

                if (isChanged) {
                    setOwnedPages(newOwnedPages);
                    // Also update active identity if currently in club mode
                    setActiveIdentity(prev => {
                        if (prev.mode !== 'club' || !prev.clubPage?.id) return prev;
                        const freshActive = freshPages.find(p => p.id === prev.clubPage.id);
                        if (freshActive) {
                            return { 
                                ...prev, 
                                clubPage: { ...prev.clubPage, name: freshActive.name, avatar_url: freshActive.avatar_url } 
                            };
                        } else {
                            // The active club page was deleted
                            return { mode: 'personal', clubPage: null };
                        }
                    });
                    console.debug('[ActiveIdentity] Club data refreshed');
                }
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        };

        // Refresh on tab focus
        const handleVisibility = () => { if (document.visibilityState === 'visible') refreshClubData(); };
        document.addEventListener('visibilitychange', handleVisibility);

        // Periodic refresh every 5 minutes
        const interval = setInterval(refreshClubData, 5 * 60 * 1000);

        return () => {
            mounted = false;
            document.removeEventListener('visibilitychange', handleVisibility);
            clearInterval(interval);
        };
    }, [ownedPages.map(p => p.id).join(',')]);

    const value = {
        activeIdentity,
        switchToPersonal,
        switchToClub,
        isClubMode: activeIdentity.mode === 'club',
        clubPage: activeIdentity.clubPage || (ownedPages.length > 0 ? ownedPages[0] : null),
        hasClubPage: ownedPages.length > 0,
        ownedPages,
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
