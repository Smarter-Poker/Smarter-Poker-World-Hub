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
                // gets ALL pages the user owns or is a member of.
                try {
                    const res2 = await fetch(`/api/social/pages?owner_id=${userId}&include_memberships=true`);
                    if (mounted && res2.ok) {
                        const json2 = await res2.json();
                        if (json2.success && json2.data && json2.data.length > 0) {
                            // Merge by id, FIELD-WISE. Skipping duplicates
                            // outright meant the step-2 venue lookup won, and
                            // that endpoint does not return unread_count --
                            // only this owner_id + include_memberships call
                            // does (it runs fn_get_all_identity_unread_counts).
                            // So for anyone with commander_staff in
                            // localStorage the enriched copy was discarded and
                            // every club badge read 0 until the 5-minute live
                            // sync happened to fire. Later fields win only
                            // where the earlier record has nothing.
                            const byId = new Map(pagesFound.map(p => [p.id, p]));
                            for (const p of json2.data) {
                                const existing = byId.get(p.id);
                                if (!existing) {
                                    pagesFound.push(p);
                                    byId.set(p.id, p);
                                    continue;
                                }
                                for (const [k, v] of Object.entries(p)) {
                                    if (v !== null && v !== undefined &&
                                        (existing[k] === null || existing[k] === undefined)) {
                                        existing[k] = v;
                                    }
                                }
                                // unread_count is the whole point of the second
                                // call, so it always wins when present.
                                if (p.unread_count !== null && p.unread_count !== undefined) {
                                    existing.unread_count = p.unread_count;
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
                        unread_count: page.unread_count || 0,
                        // A club's social page has its OWN id; the club id lives in
                        // linked_entity_id. Club Arena forces identity by CLUB id, so
                        // this field is required for the forceIdentity match below.
                        linked_entity_id: page.linked_entity_id || null,
                        linked_entity_type: page.linked_entity_type || null,
                        slug: page.slug || null,
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

    // ── Force Identity via URL ──
    // Allows embedding apps (like Club Arena) to force a specific identity.
    // A ref gate ensures this only fires once per page load — prevents a flip-flop
    // loop where: parent sets clubId → context updates → storage listener fires →
    // context updates again → forceIdentity fires again → repeat.
    const forceAppliedRef = useRef(false);
    // Which forceId the ref above was set FOR. The provider sits above
    // <PageErrorBoundary key={router.asPath}> in _app.js, so it survives every
    // client-side navigation — and this effect depended only on [ownedPages]
    // while reading the URL imperatively. Result: navigating in-app to
    // ?clubId=<uuid> never re-ran it. The club drawer opened (messenger.js
    // watches router.query) while the identity stayed personal, so outgoing
    // messages carried contextEntityId: null and the user silently messaged as
    // themselves inside the club inbox. Only a full document load worked, which
    // is why the iframe looked fine and in-app links did not.
    const lastForceIdRef = useRef(null);
    const router = useRouter();
    useEffect(() => {
        if (typeof window === 'undefined' || ownedPages.length === 0) return;

        const params = new URLSearchParams(window.location.search);
        const forceId = params.get('forceIdentity') || params.get('clubId');

        // Apply once per DISTINCT forceId. Re-running for the same one would
        // undo a manual switch the user made after arriving.
        if (forceAppliedRef.current && lastForceIdRef.current === forceId) return;

        if (forceId) {
            lastForceIdRef.current = forceId;
            if (forceId === 'personal') {
                setActiveIdentity({ mode: 'personal', clubPage: null });
                forceAppliedRef.current = true;
            } else {
                // Club Arena passes the CLUB id (clubId=<uuid>), which equals a
                // page linked_entity_id, NOT its social-page id. Also accept a direct
                // page id or slug so the switcher works regardless of the identifier.
                const page = ownedPages.find(p =>
                    p.id === forceId ||
                    p.linked_entity_id === forceId ||
                    p.slug === forceId
                );
                if (page) {
                    console.debug('[ActiveIdentity] Force switching to:', page.name);
                    setActiveIdentity({ mode: 'club', clubPage: page });
                    forceAppliedRef.current = true;
                }
            }
        }
    // ownedPages: the pages have to exist before we can match one.
    // router.asPath: the URL is an input to this effect, so it belongs here.
    // activeIdentity is deliberately absent — that is the flip-flop loop.
    }, [ownedPages, router.asPath]);

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
                    // ONLY a 404 means "this page is gone". Treating every
                    // non-2xx as deletion meant one transient 5xx from Supabase
                    // or the edge silently dropped the user back to their
                    // personal identity and stripped the page from ownedPages --
                    // and in the Club Arena iframe the forceApplied gate then
                    // blocked re-application, so it never came back without a
                    // reload.
                    if (res.status === 404) {
                        console.warn('[ActiveIdentity] Club page 404 — page deleted, resetting to personal');
                        setActiveIdentity({ mode: 'personal', clubPage: null });
                        setOwnedPages(prev => prev.filter(p => p.id !== activeIdentity.clubPage.id));
                    } else {
                        console.warn('[ActiveIdentity] Club page check failed (HTTP', res.status, ') — keeping identity, this is not evidence of deletion');
                    }
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
                
                const res = await fetch(`/api/social/pages?owner_id=${authUser.id}&include_memberships=true`);
                if (!mounted || !res.ok) return;
                const json = await res.json();
                if (!mounted || !json.success || !json.data) return;
                
                const freshPages = json.data;
                const newOwnedPages = freshPages.map(page => ({
                    id: page.id,
                    name: page.name,
                    avatar_url: page.avatar_url,
                    page_type: page.page_type || 'club',
                    unread_count: page.unread_count || 0,
                    linked_entity_id: page.linked_entity_id || null,
                    linked_entity_type: page.linked_entity_type || null,
                    slug: page.slug || null,
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
