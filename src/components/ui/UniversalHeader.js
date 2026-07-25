/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNIVERSAL HEADER COMPONENT — Hub-Style Dark Theme
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL: This is the GLOBAL STANDARD header for ALL smarter.poker pages.
 * DO NOT MODIFY without running /social-feed-protection workflow.
 * 
 * Features:
 * - Dark background with neon blue accents
 * - "Smarter.Poker" in white text 
 * - Diamond wallet with + (REAL balance from user_diamond_balance)
 * - Profile picture (REAL avatar from profiles.avatar_url)
 * - Neon orb icons for profile, messages, notifications, settings
 * - Return to Hub button (for major pages) or Back button (for nested pages)
 */

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

import { useLiveHelp, LiveHelpPanel } from '../../world/components/Geeves';

import FullScreenPageOverlay from './FullScreenPageOverlay';

// ── PERF: Lazy-load DiamondWalletModal only when opened (saves ~95KB from initial bundle) ──
const DiamondWalletModal = dynamic(() => import('../store/DiamondWalletModal'), {
    ssr: false,
    loading: () => null, // No visible flash — modal has its own skeleton
});
import { useAvatar } from '../../contexts/AvatarContext';
import { useUnreadCount } from '../../hooks/useUnreadCount';
import { useDiamondBalance } from '../../hooks/useDiamondBalance';
import useCurrentUser from '../../hooks/useCurrentUser';
import { useActiveIdentity } from '../../contexts/ActiveIdentityContext';
import { eventBus, EventType } from '../../engine/EventBus';
import { listenBroadcast } from '../../lib/broadcastSync';

// Dark theme colors matching hub
const C = {
    bg: '#000000',
    border: 'rgba(0, 136, 255, 0.2)',
    cyan: '#00f5ff',
    blue: '#0088ff',
    gold: '#ffd700',
    white: '#ffffff',
    textSec: 'rgba(255,255,255,0.6)'
};

/**
 * @param {Object} props
 * @param {number} [props.pageDepth=1]
 * @param {boolean} [props.showSearch=false]
 * @param {Function} [props.onSearchClick]
 * @param {Function} [props.onMenuClick]
 * @param {Function} [props.onSettingsClick]
 * @param {Function} [props.onBackClick]
 * @param {boolean} [props.hideLeftIcon=false]
 */
export default function UniversalHeader({
    pageDepth = 1,  // 1 = major page (show Hub button), 2+ = nested (show Back)
    showSearch = false,
    onSearchClick = null,
    onMenuClick = null,  // Callback for hamburger menu click
    onSettingsClick = null,  // Override for settings gear — opens page-specific settings instead of global
    onBackClick = null, // Override for back navigation
    hideLeftIcon = false // Allows hiding the left icon (e.g. when page has an in-page back button)
}) {
    const router = useRouter();

    // 🛡️ INSTANT UI: Single-parse helper with 24h cache TTL
    // Parses localStorage once and returns the cached header object (or null if expired/missing).
    // This prevents double JSON.parse and ensures stale data (>24h) is discarded.
    const _cachedHeader = (() => {
        if (typeof window === 'undefined') return null;
        try {
            // Get current user ID to prevent cross-session cache bleed
            let currentUserId = null;
            const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
            currentUserId = authData?.user?.id;
            if (!currentUserId) {
                const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                if (sbKeys.length > 0) currentUserId = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.user?.id;
            }

            const raw = localStorage.getItem('sp-cached-header-user');
            if (!raw) return null;
            const data = JSON.parse(raw);
            
            // TTL check: discard cache older than 24 hours, OR if it belongs to a different user
            if (data?._ts && (Date.now() - data._ts > 24 * 60 * 60 * 1000)) return null;
            if (data?.userId && data.userId !== currentUserId) return null;
            
            return data;
        } catch (_) { return null; }
    })();

    const [user, setUser] = useState(_cachedHeader);
    const [notificationCount, setNotificationCount] = useState(() => {
        if (typeof window === 'undefined') return 0;
        try {
            const n = parseInt(localStorage.getItem('sp-notif-count') || '0', 10);
            return isNaN(n) ? 0 : Math.max(0, n); // NaN-safe + clamp to 0
        } catch (_) { return 0; }
    });

    const [isWalletOpen, setIsWalletOpen] = useState(false);

    // ── FULL-SCREEN OVERLAY STATES ──
    const [overlayPage, setOverlayPage] = useState(null); // null | 'profile' | 'messenger' | 'notifications' | 'settings' | 'diamond-store'
    const [isVip, setIsVip] = useState(() => {
        if (typeof window === 'undefined') return false;
        try { return localStorage.getItem('sp-profile-vip') === 'true'; } catch (_) { return false; }
    });
    const [isAdmin, setIsAdmin] = useState(() => {
        if (typeof window === 'undefined') return false;
        try { return localStorage.getItem('sp-profile-admin') === 'true'; } catch (_) { return false; }
    });
    const [isMounted, setIsMounted] = useState(false);

    // ── Diamond balance: shared hook handles caching, realtime, cross-tab sync ──
    const { balance: diamondBalance, setBalance: setDiamondBalance } = useDiamondBalance(user?.id);

    // ── INSTANT PROFILE LINK: Resolve cached username for direct navigation ──
    const [profileHref, setProfileHref] = useState(() => {
        if (typeof window === 'undefined') return '/hub/profile';
        try {
            // Get current user ID to prevent cross-session cache bleed
            let currentUserId = null;
            const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
            currentUserId = authData?.user?.id;
            if (!currentUserId) {
                const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                if (sbKeys.length > 0) currentUserId = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.user?.id;
            }

            const nameCache = localStorage.getItem('sp-profile-username');
            if (nameCache) {
                const { userId, username } = JSON.parse(nameCache);
                if (username && (!userId || userId === currentUserId)) return `/hub/user/${username}`;
            }
            // Fallback: extract username from header user cache
            const headerCache = localStorage.getItem('sp-cached-header-user');
            if (headerCache) {
                const { userId, username } = JSON.parse(headerCache);
                if (username && (!userId || userId === currentUserId)) return `/hub/user/${username}`;
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        return '/hub/profile';
    });

    // Global Avatar State (instant caching)
    const { user: contextUser, avatar: contextAvatar, isVip: contextVip } = useAvatar();
    
    // Global Active Identity State (for Commander/Page Owners)
    const { isClubMode, clubPage } = useActiveIdentity();

    // Global Unread Messages State (instant caching)
    // BUG-FIX-LIVE-6: useUnreadCount is now the single source of truth for
    // BOTH unread DM count AND unread notification count, with a Realtime
    // subscription. Header badges now mirror the bottom-nav badges in
    // real time — no more "header shows old count until you open the
    // overlay and close it" lag.
    const { unreadCount, notificationCount: liveNotificationCount } = useUnreadCount();

    // Header keeps a localStorage-cached `notificationCount` for first-paint
    // (avoids a 0→N flicker on hard reload). Once the realtime hook reports
    // a non-null number, we trust it as the source of truth. setNotificationCount
    // remains for the overlay-close path which still re-fetches via API to
    // capture both social + poker counts the bare `notifications` table query
    // does not include.
    useEffect(() => {
        if (typeof liveNotificationCount === 'number') {
            setNotificationCount(liveNotificationCount);
            try { localStorage.setItem('sp-notif-count', String(liveNotificationCount)); }
            catch (_) { /* private browsing — ignore */ }
        }
    }, [liveNotificationCount]);

    // ── BACKGROUND MLB ALERT SYNC (ADMIN ONLY) ──
    useEffect(() => {
        if (!isAdmin) return;
        const syncAlerts = () => {
            try {
                const lastSync = parseInt(localStorage.getItem('sp-mlb-sync-ts') || '0', 10);
                const now = Date.now();
                // Debounce across tabs (wait at least 55 seconds before allowing another sync)
                if (now - lastSync > 55000) {
                    localStorage.setItem('sp-mlb-sync-ts', String(now));
                    fetch('/api/mlb/sync-alerts', { method: 'POST' }).catch(() => {});
                }
            } catch (_) {}
        };
        syncAlerts(); // Sync immediately on mount
        const interval = setInterval(syncAlerts, 60000); // Polling every minute
        return () => clearInterval(interval);
    }, [isAdmin]);

    // 🛡️ INSTANT UI: Mark mounted for hydration-safe gates.
    // Cache read is now synchronous in _cachedHeader above — no extra effect needed.
    useEffect(() => {
        setIsMounted(true);
        // Seed diamond balance from cache (hook needs explicit init)
        if (_cachedHeader?.diamonds !== undefined) {
            setDiamondBalance(_cachedHeader.diamonds);
        }
    }, []);

    // Derived values — gated behind isMounted for SSR hydration safety.
    // Because user/isVip are initialized synchronously from localStorage,
    // the FIRST post-mount render (when isMounted flips true) already has
    // cached data — so there is zero visual flash despite the gate.
    
    // Override with Club Identity if active
    const activeAvatarUrl = isClubMode && clubPage ? (clubPage.avatar_url || contextAvatar?.imageUrl || user?.avatar) : (contextAvatar?.imageUrl || user?.avatar);
    const activeName = isClubMode && clubPage ? clubPage.name : (user?.name || '');
    
    const displayAvatar = isMounted ? (activeAvatarUrl || '/default-avatar.png') : null;
    const isVipDisplay = isMounted ? (!isClubMode && (isVip || contextVip)) : false; // VIP badge is for personal profiles only
    const safeUnreadCount = isMounted ? unreadCount : 0;
    const safeNotificationCount = isMounted ? notificationCount : 0;

    // Live Help state
    const liveHelp = useLiveHelp();

    // ── OVERLAY HELPERS ──
    const openOverlay = (page) => setOverlayPage(page);

    // Re-fetch real notification count after overlay closes so the badge reflects DB truth.
    // BroadcastChannel cannot bridge an iframe → parent in the same tab, so we poll on close.
    const isMountedRef = useRef(true);
    useEffect(() => { return () => { isMountedRef.current = false; }; }, []);

    const closeOverlay = (closedPage) => {
        setOverlayPage(null);
        if (closedPage === 'notifications') {
            // Give the iframe a moment to finish marking rows read, then re-query via API
            // (API counts both social + poker notifications — direct supabase query only gets social)
            // BUG FIX (Bug #9): capture isMountedRef so the async callback is a no-op if the
            // component unmounts before the 800ms timer fires.
            setTimeout(async () => {
                if (!isMountedRef.current) return; // Component gone — skip all setState calls
                try {
                    let accessToken = null;
                    try {
                        const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
                        accessToken = authData?.access_token || null;
                        if (!accessToken) {
                            const sbKeys = Object.keys(localStorage || {}).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                            if (sbKeys.length > 0) accessToken = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.access_token || null;
                        }
                    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

                    // We need userId for the API call — get from stored auth
                    let userId = null;
                    try {
                        const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
                        userId = authData?.user?.id || null;
                        if (!userId) {
                            const sbKeys = Object.keys(localStorage || {}).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                            if (sbKeys.length > 0) userId = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.user?.id || null;
                        }
                    } catch (_) {}
                    if (!userId) return;

                    const res = await fetch('/api/user/get-header-stats', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                        },
                        body: JSON.stringify({ userId }),
                    });
                    const result = await res.json();
                    if (result.success && typeof result.notificationCount === 'number' && isMountedRef.current) {
                        const freshCount = result.notificationCount;
                        setNotificationCount(freshCount);
                        try { localStorage.setItem('sp-notif-count', String(freshCount)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                    }
                } catch (e) {
                    console.warn('[UniversalHeader] Post-overlay notif re-fetch failed:', e);
                }
            }, 800); // 800ms: enough for the iframe's DB update to land
        }
    };


    const overlayUrlMap = {
        profile: profileHref,
        messenger: '/hub/messenger',
        notifications: '/hub/notifications',
        settings: '/hub/settings',
        'diamond-store': '/hub/diamond-store',
    };

    const overlayTitleMap = {
        profile: 'My Profile',
        messenger: 'Messenger',
        notifications: 'Notifications',
        settings: 'Settings',
        'diamond-store': 'Diamond Store',
    };

    useEffect(() => {
        let mounted = true; // Prevent state updates after unmount
        let cleanupNotifSync = null;

        const loadUser = async () => {
            try {
                // 🛡️ BULLETPROOF: Bypass Supabase client entirely to avoid AbortError
                // Read user directly from localStorage instead of calling getUser()
                let authUser = null;
                if (typeof window !== 'undefined') {
                    try {
                        // Check explicit storage key first
                        const explicitAuth = localStorage.getItem('smarter-poker-auth');
                        if (explicitAuth) {
                            const tokenData = JSON.parse(explicitAuth);
                            authUser = tokenData?.user || null;
                        }
                        // Fallback to legacy sb-* keys
                        if (!authUser) {
                            const sbKeys = Object.keys(localStorage || {}).filter(
                                k => k.startsWith('sb-') && k.endsWith('-auth-token')
                            );
                            if (sbKeys.length > 0) {
                                const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
                                authUser = tokenData?.user || null;
                            }
                        }
                    } catch (e) {
                        console.warn('[UniversalHeader] Error reading localStorage:', e);
                    }
                }

                if (!mounted) return;

                if (authUser) {
                    setUser(authUser);
                    console.debug('[UniversalHeader] User found in localStorage:', authUser.email);

                    // 🛡️ BULLETPROOF: Retry logic with exponential backoff
                    const MAX_RETRIES = 3;
                    const fetchProfileWithRetry = async (attempt = 1) => {
                        if (!mounted) return false;
                        try {
                            // Get access token for JWT auth
                            let accessToken = null;
                            try {
                                const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
                                accessToken = authData?.access_token || null;
                            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

                            const response = await fetch('/api/user/get-header-stats', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
                                },
                                body: JSON.stringify({ userId: authUser.id }),
                            });

                            const result = await response.json();
                            console.debug(`[UniversalHeader] API fetch attempt ${attempt}:`, result);

                            if (result.success && result.profile && mounted) {
                                const { diamonds, full_name, username, avatar_url, is_vip, is_admin } = result.profile;
                                setDiamondBalance(diamonds ?? 0);
                                setIsVip(!!is_vip);
                                setIsAdmin(!!is_admin);
                                try { localStorage.setItem('sp-profile-diamonds', String(diamonds ?? 0)); } catch (_) {}
                                try { localStorage.setItem('sp-profile-vip', String(!!is_vip)); } catch (_) {}
                                try { localStorage.setItem('sp-profile-admin', String(!!is_admin)); } catch (_) {}
                                setUser(prev => ({
                                    ...prev,
                                    avatar: avatar_url,
                                    name: username || full_name
                                }));
                                setIsVip(!!is_vip);
                                if (typeof result.notificationCount === 'number') {
                                    setNotificationCount(result.notificationCount);
                                }
                                // 🛡️ INSTANT UI: Cache user data for next page load (with TTL timestamp)
                                // Lowercase username before caching — prevents stale mixed-case
                                // values propagating into profileHref via the cache init path.
                                const normalizedUsername = username ? username.toLowerCase() : null;
                                try {
                                    localStorage.setItem('sp-cached-header-user', JSON.stringify({
                                        userId: authUser.id,
                                        avatar: avatar_url,
                                        name: normalizedUsername || full_name,
                                        username: normalizedUsername,
                                        diamonds: diamonds ?? 0,
                                        is_vip: !!is_vip,
                                        _ts: Date.now()
                                    }));
                                } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

                                // Update direct profile link if we got the username
                                // ALWAYS lowercase — DB trigger enforces this, but
                                // the API response may return a mixed-case value
                                // if the profile was created before the trigger.
                                if (username) {
                                    const directHref = `/hub/user/${username.toLowerCase()}`;
                                    setProfileHref(directHref);
                                    router.prefetch(directHref);
                                }
                                return true; // Success
                            }
                            return false; // API returned error
                        } catch (e) {
                            console.warn(`[UniversalHeader] Attempt ${attempt} failed:`, e.message);
                            return false;
                        }
                    };

                    // Try up to MAX_RETRIES times with exponential backoff
                    let success = await fetchProfileWithRetry(1);
                    for (let attempt = 2; attempt <= MAX_RETRIES && !success && mounted; attempt++) {
                        const delay = Math.pow(2, attempt - 1) * 500; // 500ms, 1000ms, 2000ms
                        console.debug(`[UniversalHeader] Retrying in ${delay}ms...`);
                        await new Promise(r => setTimeout(r, delay));
                        success = await fetchProfileWithRetry(attempt);
                    }

                    // Final fallback: direct REST API call (not Supabase client)
                    if (!success && mounted) {
                        console.debug('[UniversalHeader] All API retries failed, trying direct REST...');
                        try {
                            const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
                            const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

                            // Get access token for authenticated query
                            let accessToken = SUPABASE_ANON_KEY;
                            try {
                                const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
                                if (authData.access_token) accessToken = authData.access_token;
                            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

                            const response = await fetch(
                                `${SUPABASE_URL}/rest/v1/profiles?id=eq.${authUser.id}&select=username,full_name,avatar_url,diamonds,is_vip`,
                                {
                                    headers: {
                                        'apikey': SUPABASE_ANON_KEY,
                                        'Authorization': `Bearer ${accessToken}`,
                                        'Content-Type': 'application/json'
                                    }
                                }
                            );
                            const profiles = await response.json();
                            const profile = profiles?.[0];

                            if (profile && mounted) {
                                setDiamondBalance(profile.diamonds ?? 0);
                                setIsVip(!!profile.is_vip);
                                setIsAdmin(!!profile.is_admin);
                                setUser(prev => ({
                                    ...prev,
                                    avatar: profile.avatar_url,
                                    name: profile.username || profile.full_name
                                }));
                                // Cache the REST fallback data too — lowercase username
                                const normalizedFallbackUsername = profile.username ? profile.username.toLowerCase() : null;
                                try {
                                    localStorage.setItem('sp-cached-header-user', JSON.stringify({
                                        userId: authUser.id,
                                        avatar: profile.avatar_url,
                                        name: normalizedFallbackUsername || profile.full_name,
                                        username: normalizedFallbackUsername,
                                        diamonds: profile.diamonds ?? 0,
                                        is_vip: !!profile.is_vip,
                                        _ts: Date.now()
                                    }));
                                } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                                // Update direct profile link — lowercase username
                                if (normalizedFallbackUsername) {
                                    const directHref = `/hub/user/${normalizedFallbackUsername}`;
                                    setProfileHref(directHref);
                                    router.prefetch(directHref);
                                }
                                console.debug('[UniversalHeader] Direct REST fallback SUCCESS:', { diamonds: profile.diamonds });
                            }
                        } catch (e) {
                            console.warn('[UniversalHeader] Direct REST fallback failed:', e);
                        }
                    }

                    // BUG-11 FIX: fetchProfileWithRetry already sets notificationCount (line 291-292)
                    // above. The separate fetchUnreadCount() call here was a duplicate 3s API hit.
                    // fetchUnreadCount is now only used by the BroadcastChannel refresh listener below.
                    const fetchUnreadCount = async () => {
                        try {
                            let accessToken = null;
                            try {
                                const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
                                accessToken = authData?.access_token || null;
                            } catch (_) {}
                            const res = await fetch('/api/user/get-header-stats', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                                },
                                body: JSON.stringify({ userId: authUser.id }),
                            });
                            const result = await res.json();
                            if (result.success && typeof result.notificationCount === 'number' && mounted) {
                                setNotificationCount(result.notificationCount);
                                try { localStorage.setItem('sp-notif-count', String(result.notificationCount)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                            }
                        } catch (e) { console.warn('[UniversalHeader] fetchUnreadCount failed:', e); }
                    };
                    // NOTE: Do NOT call fetchUnreadCount() here — count already set by fetchProfileWithRetry above.

                    // ── CROSS-TAB SYNC: Listen for read notifications in other tabs ──
                    cleanupNotifSync = listenBroadcast('smarter_poker_notif_sync', (msg) => {
                        // Support both legacy string and new object payloads
                        const isRefresh = msg === 'refresh_notifications' || msg?.action === 'refresh_notifications';
                        if (isRefresh) {
                            console.debug('[UniversalHeader] received refresh_notifications broadcast');
                            fetchUnreadCount();
                        }
                    });

                    // NOTE: Removed redundant Supabase Realtime channel for notifications.
                    // useUnreadCount hook (line 150) already maintains a Realtime subscription
                    // to the notifications table and feeds liveNotificationCount into this
                    // component via the useEffect on line 158. Having TWO channels for the
                    // same INSERT event caused a transient +2 flash before the reconciliation
                    // useEffect corrected the count, and wasted a Supabase connection.

                    // Global useUnreadCount handles social_messages naturally
                }
            } catch (e) {
                console.warn('[UniversalHeader] Data fetch error:', e);
            } finally {
                // loadUser complete
            }
        };
        loadUser();

        return () => {
            mounted = false;
            if (cleanupNotifSync) cleanupNotifSync();
        };
    }, []);

    // ── EventBus: Instant badge update when notifications are read (same-tab) ──
    // NOTE: eventBus.on() callback receives the full event object: { type, payload, timestamp, source }
    // The actual count lives at event.payload.count
    useEffect(() => {
        const unsub = eventBus.on(EventType.NOTIFICATIONS_READ, (event) => {
            const count = event?.payload?.count || 1;
            setNotificationCount(prev => Math.max(0, prev - count));
        });
        return () => unsub();
    }, []);

    // ── Diamond balance: All refresh/realtime/cross-tab logic handled by useDiamondBalance hook ──

    // ── TIER 2: Avatar Changes Cross-Tab Sync ──
    // Listen for avatar changes from AvatarContext and other tabs
    useEffect(() => {
        if (!user?.id) return;

        const cleanup = listenBroadcast('smarter_poker_avatar_sync', (msg) => {
            if (msg === 'refresh') {
                console.debug('[UniversalHeader] Avatar refresh via BroadcastChannel');
                // Trigger a profile re-fetch so avatar + name update in the header
                window.dispatchEvent(new CustomEvent('profile-updated'));
            }
        });

        return cleanup;
    }, [user?.id]);

    // ── TIER 2: Club Arena Chip Balance Cross-Tab Sync ──
    // Now handled by useDiamondBalance hook

    // ── VIP status bus listener — updates VIP badge in real time ──
    // Triggered by PhoneVerifyVIPModal after successful phone verification
    useEffect(() => {
        const handleVipChange = (e) => {
            console.debug('[UniversalHeader] 🚌 VIP status change event received:', e.detail);
            if (e.detail?.vipGranted) {
                setIsVip(true);
            }
        };

        const handleProfileUpdate = async () => {
            // Re-fetch header stats to pick up all profile changes
            if (!user?.id) return;
            try {
                // Get access token for JWT auth
                let accessToken = null;
                try {
                    const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
                    accessToken = authData?.access_token || null;
                } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

                const response = await fetch('/api/user/get-header-stats', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
                    },
                    body: JSON.stringify({ userId: user.id }),
                });
                const result = await response.json();
                if (result.success && result.profile) {
                    setDiamondBalance(result.profile.diamonds ?? 0);
                    setIsVip(!!result.profile.is_vip);
                    setIsAdmin(!!result.profile.is_admin);
                    setUser(prev => ({
                        ...prev,
                        avatar: result.profile.avatar_url || prev?.avatar,
                        name: result.profile.username || result.profile.full_name || prev?.name
                    }));
                    // Update localStorage cache with fresh profile data — lowercase username
                    const refreshedUsername = result.profile.username ? result.profile.username.toLowerCase() : null;
                    try {
                        localStorage.setItem('sp-cached-header-user', JSON.stringify({
                            userId: user.id,
                            avatar: result.profile.avatar_url,
                            name: refreshedUsername || result.profile.full_name,
                            username: refreshedUsername,
                            diamonds: result.profile.diamonds ?? 0,
                            is_vip: !!result.profile.is_vip,
                            _ts: Date.now()
                        }));
                    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                    // Update direct profile link if username changed — always lowercase
                    if (refreshedUsername) {
                        const directHref = `/hub/user/${refreshedUsername}`;
                        setProfileHref(directHref);
                    }
                    console.debug('[UniversalHeader] 🚌 Profile refreshed via bus event');
                }
            } catch (e) {
                console.warn('[UniversalHeader] Profile refresh failed:', e.message);
            }
        };

        window.addEventListener('vip-status-changed', handleVipChange);
        window.addEventListener('profile-updated', handleProfileUpdate);
        return () => {
            window.removeEventListener('vip-status-changed', handleVipChange);
            window.removeEventListener('profile-updated', handleProfileUpdate);
        };
    }, [user?.id]);

    // ── useCurrentUser: keep profileHref in sync with fresh DB username ──────
    // This runs after AvatarContext resolves and gives us a guaranteed
    // lowercase username straight from the profiles table, overriding any
    // stale cache value that was used for the initial render.
    const { user: currentUserProfile } = useCurrentUser();
    useEffect(() => {
        if (!currentUserProfile?.username) return;
        const freshHref = `/hub/user/${currentUserProfile.username}`; // username is lowercased by DB trigger + hook
        setProfileHref(prev => (prev !== freshHref ? freshHref : prev));
    }, [currentUserProfile?.username]);
    // Guard against rapid double-click on back button
    const backInProgressRef = useRef(false);

    const handleBack = () => {
        if (typeof window === 'undefined') return;
        // Block re-entrant clicks while a back navigation is in flight
        if (backInProgressRef.current) return;
        backInProgressRef.current = true;

        // CRITICAL: Use router.back() — NOT window.history.back().
        // window.history.back() updates the URL bar but does NOT trigger
        // Next.js re-renders, so the user sees the old page content.
        // router.back() is always correct for SPA navigation. Do NOT gate
        // on window.history.length — it is unreliable in Mobile Chrome
        // and across SPA sessions (can be 1 even after several pushes).
        router.back();

        // Release the guard after a short delay to prevent double-clicks
        setTimeout(() => {
            backInProgressRef.current = false;
        }, 500);
    };

    return (
        <>
            <Head>
                {/* Aggressive background cache of the Club Arena integration. This downloads the HTML document and triggers sub-resource fetching before the user clicks. */}
                <link rel="prefetch" href="/hub/club-arena" as="document" />
                {/* 🛡️ PRELOAD avatar image so it stays in browser cache across page navigations */}
                {displayAvatar && <link rel="preload" as="image" href={displayAvatar} />}
            </Head>

            {/* Mobile-responsive CSS */}
            <style dangerouslySetInnerHTML={{ __html: `
                .universal-header {
                    background: ${C.bg};
                    padding: 8px 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 3px solid rgba(200, 200, 200, 0.8);
                    position: sticky;
                    top: 0;
                    z-index: 100;
                    gap: 8px;
                    flex-wrap: nowrap;
                }
                
                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-shrink: 0;
                }
                
                .header-center {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex: 1;
                    min-width: 0;
                }
                
                .header-right {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex-shrink: 0;
                    justify-content: flex-end;
                }

                /* Force all children (Links render as inline <a>) to be flex items */
                .header-right > * {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    height: 40px;
                }
                
                .nav-btn {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 6px 10px;
                    border-radius: 6px;
                    background: linear-gradient(135deg, rgba(0, 136, 255, 0.2) 0%, rgba(0, 102, 204, 0.3) 100%);
                    border: 1px solid rgba(0, 136, 255, 0.4);
                    color: white;
                    font-weight: 600;
                    font-size: 13px;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0,136,255,0.2);
                }
                
                .header-img-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: none;
                    border: none;
                    padding: 0;
                    cursor: pointer;
                    height: 36px;
                    width: 36px;
                    flex-shrink: 0;
                    transition: transform 0.1s ease, opacity 0.15s ease;
                }

                .header-img-btn:hover {
                    opacity: 0.85;
                    transform: scale(1.05);
                }

                .header-img-btn:active {
                    transform: scale(0.95);
                }

                .header-nav-btn {
                    width: auto;
                    height: 32px; /* 4x visual size of old un-trimmed hub arrow */
                    overflow: visible;
                }

                .header-nav-btn img {
                    /* no filter - images are pre-processed */
                }

                .hamburger-btn {
                    width: 60px;
                    height: 60px;
                    background: transparent;
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    position: relative;
                    flex-shrink: 0;
                    overflow: visible;
                    padding: 0;
                    transition: transform 0.1s ease, opacity 0.15s ease;
                }

                .hamburger-btn:hover {
                    opacity: 0.8;
                    transform: scale(1.1);
                }

                .hamburger-btn:active {
                    transform: scale(0.95);
                }
                
                .brand-text {
                    color: white;
                    font-size: 16px;
                    font-weight: 700;
                    letter-spacing: 0.3px;
                    white-space: nowrap;
                }

                .brand-text-img {
                    flex-shrink: 0;
                    height: 32px;
                    object-fit: contain;
                }
                
                .diamond-wallet {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    background: transparent;
                    border: none;
                    padding: 0 10px;
                    border-radius: 0;
                    text-decoration: none;
                    color: white;
                    width: auto;
                    height: 40px;
                    box-sizing: border-box;
                }
                

                
                .orb-btn {
                    width: 40px;
                    height: 40px;
                    background: transparent;
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    position: relative;
                    flex-shrink: 0;
                    overflow: visible;
                    transition: transform 0.1s ease, opacity 0.15s ease;
                }

                .orb-btn:hover {
                    opacity: 0.8;
                    transform: scale(1.1);
                }

                .orb-btn:active {
                    transform: scale(0.95);
                }
                
                .orb-badge {
                    position: absolute;
                    top: 0;
                    right: 0;
                    background: #e41e3f;
                    color: white;
                    border-radius: 10px;
                    padding: 2px 6px;
                    font-size: 11px;
                    font-weight: 700;
                    min-width: 18px;
                    text-align: center;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    border: 2px solid #000000;
                }
                
                .profile-orb {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    border: 2px solid rgba(0, 245, 255, 0.5);
                    box-shadow: 0 0 12px rgba(0, 245, 255, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    flex-shrink: 0;
                    background-size: cover;
                    background-position: center;
                    transition: transform 0.1s ease, opacity 0.15s ease;
                    cursor: pointer;
                    animation: pulse-orb 2s ease-in-out infinite;
                }

                .profile-orb[style*="url("] {
                    animation: none;
                }

                @keyframes pulse-orb {
                    0%, 100% { box-shadow: 0 0 12px rgba(0, 245, 255, 0.3); }
                    50% { box-shadow: 0 0 18px rgba(0, 245, 255, 0.6), 0 0 4px rgba(0, 245, 255, 0.2); }
                }

                /* Shimmer skeleton for first-time users with no cached avatar */
                @keyframes shimmer-avatar {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                .profile-orb-shimmer {
                    background: linear-gradient(90deg,
                        rgba(0, 136, 255, 0.15) 25%,
                        rgba(0, 245, 255, 0.3) 50%,
                        rgba(0, 136, 255, 0.15) 75%) !important;
                    background-size: 200% 100% !important;
                    animation: shimmer-avatar 1.5s ease-in-out infinite !important;
                }

                .profile-orb:hover {
                    opacity: 0.85;
                    transform: scale(1.08);
                }

                .profile-orb:active {
                    transform: scale(0.92);
                }
                
                /* MOBILE + TABLET: Compact layout with all icons visible */
                @media (max-width: 1024px) {
                    .universal-header {
                        padding: 6px 6px;
                        gap: 2px;
                    }
                    
                    .header-left {
                        gap: 2px;
                        flex-shrink: 1;
                        min-width: 0;
                    }
                    
                    .header-center {
                        gap: 2px;
                        flex-shrink: 1;
                        min-width: 0;
                    }
                    
                    .header-right {
                        gap: 2px;
                        flex-shrink: 0;
                        flex-grow: 0;
                        justify-content: flex-end;
                    }

                    .header-right > * {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 26px;
                    }
                    
                    .brand-text {
                        display: none; /* Hide brand text on mobile */
                    }
                    
                    /* Hamburger button - mobile sizing */
                    .header-img-btn {
                        height: 26px;
                        width: 26px;
                    }

                    /* CRITICAL: Cap BACK/HUB nav button width on mobile */
                    .header-nav-btn {
                        height: 25px;
                        width: auto;
                        max-width: 96px;
                    }
                    
                    .hamburger-btn {
                        width: 40px;
                        height: 40px;
                    }
                    
                    /* Diamond wallet - mobile sizing */
                    .diamond-wallet {
                        width: auto;
                        min-width: 50px;
                        height: 30px;
                        padding: 0 4px;
                        font-size: 10px;
                    }
                    
                    .hide-mobile {
                        display: none !important;
                    }
                    
                    /* Shrink all orb icons to fit on mobile */
                    .orb-btn, .profile-orb {
                        width: 26px;
                        height: 26px;
                        font-size: 11px;
                    }
                    
                    .orb-badge {
                        top: 1px;
                        right: 1px;
                        padding: 0 3px;
                        font-size: 7px;
                        min-width: 10px;
                    }
                }
                
                /* Large desktops only */
                @media (min-width: 1025px) {
                    .universal-header {
                        padding: 8px 16px;
                        gap: 12px;
                    }
                    
                    .orb-btn, .profile-orb {
                        width: 40px;
                        height: 40px;
                        font-size: 18px;
                    }
                }
            `}} />

            <header className="universal-header">
                {/* LEFT: Hamburger Menu + Back/Hub Button + "Smarter.Poker" */}
                <div className="header-left">
                    {onMenuClick && (
                        <button
                            onClick={onMenuClick}
                            className="hamburger-btn"
                            aria-label="Open Menu"
                            style={{ padding: 0, width: 40, height: 40 }}
                        >
                            <img src="/images/btn-hamburger-v4.png" alt="Menu" style={{ width: 'auto', height: '100%', objectFit: 'contain' }} />
                        </button>
                    )}
                    {!hideLeftIcon && (
                        <button
                            onClick={onBackClick ? onBackClick : (pageDepth >= 2 ? handleBack : () => { window.location.href = '/hub'; })}
                            className="header-img-btn header-nav-btn"
                        >
                            <img
                                src={pageDepth >= 2 ? '/images/btn-back.png' : '/images/btn-hub-v4.png'}
                                alt={pageDepth >= 2 ? 'Back' : 'Hub'}
                                style={{ height: '100%', width: 'auto', objectFit: 'contain' }}
                            />
                        </button>
                    )}
                </div>

                {/* CENTER: Brand Text — centered between nav and icons */}
                <div className="header-center">
                    <img src="/images/brand-text-clean.png" alt="Smarter.Poker" className="brand-text-img hide-mobile" style={{ height: 40, objectFit: 'contain' }} />
                    {router.pathname.includes('/messenger') && (
                        <span className="hide-mobile" style={{ marginLeft: 8, fontSize: 16, display: 'flex', alignItems: 'center' }} title="Securely Encrypted">🔒</span>
                    )}
                </div>

                {/* RIGHT: Orb Icons */}
                <div className="header-right">
                    {/* Avatar/Profile */}
                    <div
                        className={`profile-orb${!displayAvatar && !isMounted ? ' profile-orb-shimmer' : ''}`}
                        onClick={() => router.push(isClubMode && clubPage ? `/hub/social-pages/${clubPage.id}` : profileHref)}
                        role="button"
                        tabIndex={0}
                        aria-label={isClubMode && clubPage ? clubPage.name : "My Profile"}
                        style={{
                            background: displayAvatar
                                ? `url(${displayAvatar}) center/cover`
                                : 'linear-gradient(135deg, rgba(0, 136, 255, 0.3) 0%, rgba(0, 245, 255, 0.15) 100%)',
                            ...(isVipDisplay ? {
                                border: '2px solid #00E0FF',
                                boxShadow: '0 0 8px rgba(0, 224, 255, 0.6), 0 0 16px rgba(0, 224, 255, 0.3)',
                            } : {})
                        }}
                    >
                        <span style={{ textDecoration: 'none', display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 16 }}>
                            {!displayAvatar && (isMounted ? activeName.charAt(0).toUpperCase() || '?' : '')}
                        </span>
                    </div>

                    {/* Diamond Wallet Icon */}
                    <button
                        onClick={() => setIsWalletOpen(true)}
                        className="orb-btn"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        title="Diamond Wallet"
                    >
                        <img src="/images/header-wallet-v4.png" alt="Wallet" style={{ width: 'auto', height: '100%', maxHeight: 40, objectFit: 'contain' }} />
                    </button>

                    {/* VIP Card Icon — only for VIP members */}
                    {isVipDisplay && (
                        <button
                            onClick={() => openOverlay('diamond-store')}
                            className="orb-btn"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            title="VIP Member"
                        >
                                <img
                                    src="/images/vip-card-v5.png"
                                    alt="VIP Member"
                                    style={{ width: 'auto', height: '100%', maxHeight: 40, objectFit: 'contain' }}
                                />
                        </button>
                    )}

                    {/* Messages - Custom Metallic Messenger icon — Sovereign Redirect (no popup) */}
                    <button onClick={() => { window.location.href = '/hub/messenger'; }} className="orb-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} title="Messages">
                            <img src="/images/header-messenger-v4.png" alt="Messages" style={{ width: 'auto', height: '100%', maxHeight: 40, objectFit: 'contain' }} />
                            {safeUnreadCount > 0 && (
                                <span className="orb-badge">{safeUnreadCount > 99 ? '99+' : safeUnreadCount}</span>
                            )}
                    </button>

                    {/* Notifications - Custom Metallic Bell icon */}
                    <button onClick={() => {
                        setNotificationCount(0);
                        try { localStorage.setItem('sp-notif-count', '0'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                        openOverlay('notifications');
                    }} className="orb-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} title="Notifications">
                            <img src="/images/notification-bell-trimmed.png" alt="Notifications" style={{ width: 'auto', height: '100%', maxHeight: 40, objectFit: 'contain' }} />
                            {safeNotificationCount > 0 && (
                                <span className="orb-badge">{safeNotificationCount > 99 ? '99+' : safeNotificationCount}</span>
                            )}
                    </button>

                    {/* Settings - Custom Metallic Gear icon */}
                    <button onClick={() => onSettingsClick ? onSettingsClick() : openOverlay('settings')} className="orb-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} title="Settings">
                            <img src="/images/header-settings-v4.png" alt="Settings" style={{ width: 'auto', height: '100%', maxHeight: 40, objectFit: 'contain' }} />
                    </button>

                    {/* Live Help - Hidden on mobile */}
                    <button
                        onClick={() => {
                            console.debug('[UniversalHeader] Live Help button clicked');
                            liveHelp.setIsOpen(true);
                        }}
                        className="orb-btn"
                        aria-label="Live Help"
                        style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            zIndex: 10,
                            overflow: 'hidden'
                        }}
                    >
                        <img src="/images/header-help-v4.png" alt="Live Help" style={{ width: 'auto', height: '100%', maxHeight: 40, objectFit: 'contain' }} />
                    </button>



                    {/* Search - HIDE on mobile */}
                    {showSearch && (
                        <button onClick={onSearchClick} className="hide-mobile" style={{ background: 'none', border: 'none', padding: 0 }}>
                            <div className="orb-btn">🔍</div>
                        </button>
                    )}
                </div>
            </header>

            {/* Live Help Panel */}
            <LiveHelpPanel {...liveHelp} />

            <DiamondWalletModal
                isOpen={isWalletOpen}
                onClose={() => setIsWalletOpen(false)}
                onBuyClick={() => openOverlay('diamond-store')}
                initialBalance={diamondBalance}
            />

            {/* Full-Screen Page Overlay — opens pages as popup instead of redirect */}
            {overlayPage && (
                <FullScreenPageOverlay
                    isOpen={true}
                    onClose={() => closeOverlay(overlayPage)}
                    url={overlayUrlMap[overlayPage]}
                    title={overlayTitleMap[overlayPage]}
                    onNotifCleared={(count) => {
                        setNotificationCount(count);
                        try { localStorage.setItem('sp-notif-count', String(count)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                    }}
                />
            )}
        </>
    );
}


// GEEVES LIVE HELP PANEL EXPORT
export { LiveHelpPanel } from '../../world/components/Geeves';
// trigger deploy
