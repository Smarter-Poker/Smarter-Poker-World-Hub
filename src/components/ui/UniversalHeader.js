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

import React, { useState, useEffect } from 'react';
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

export default function UniversalHeader({
    pageDepth = 1,  // 1 = major page (show Hub button), 2+ = nested (show Back)
    showSearch = false,
    onSearchClick = null,
    onMenuClick = null  // Callback for hamburger menu click
}) {
    const router = useRouter();

    // 🛡️ INSTANT UI: Single-parse helper with 24h cache TTL
    // Parses localStorage once and returns the cached header object (or null if expired/missing).
    // This prevents double JSON.parse and ensures stale data (>24h) is discarded.
    const _cachedHeader = (() => {
        if (typeof window === 'undefined') return null;
        try {
            const raw = localStorage.getItem('sp-cached-header-user');
            if (!raw) return null;
            const data = JSON.parse(raw);
            // TTL check: discard cache older than 24 hours
            if (data?._ts && (Date.now() - data._ts > 24 * 60 * 60 * 1000)) return null;
            return data;
        } catch (_) { return null; }
    })();

    const [user, setUser] = useState(_cachedHeader);
    const [notificationCount, setNotificationCount] = useState(() => {
        if (typeof window === 'undefined') return 0;
        try { return parseInt(localStorage.getItem('sp-notif-count') || '0', 10); } catch (_) { return 0; }
    });
    const [isWalletOpen, setIsWalletOpen] = useState(false);

    // ── FULL-SCREEN OVERLAY STATES ──
    const [overlayPage, setOverlayPage] = useState(null); // null | 'profile' | 'messenger' | 'notifications' | 'settings' | 'diamond-store'
    const [isVip, setIsVip] = useState(() => {
        if (_cachedHeader) return !!_cachedHeader.is_vip;
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('sp-vip-status') === 'true';
    });
    const [isMounted, setIsMounted] = useState(false);

    // ── Diamond balance: shared hook handles caching, realtime, cross-tab sync ──
    const { balance: diamondBalance, setBalance: setDiamondBalance } = useDiamondBalance(user?.id);

    // ── INSTANT PROFILE LINK: Resolve cached username for direct navigation ──
    const [profileHref, setProfileHref] = useState(() => {
        if (typeof window === 'undefined') return '/hub/profile';
        try {
            const nameCache = localStorage.getItem('sp-profile-username');
            if (nameCache) {
                const { username } = JSON.parse(nameCache);
                if (username) return `/hub/user/${username}`;
            }
            // Fallback: extract username from header user cache
            const headerCache = localStorage.getItem('sp-cached-header-user');
            if (headerCache) {
                const { username } = JSON.parse(headerCache);
                if (username) return `/hub/user/${username}`;
            }
        } catch (_) {}
        return '/hub/profile';
    });

    // Global Avatar State (instant caching)
    const { user: contextUser, avatar: contextAvatar, isVip: contextVip } = useAvatar();

    // Global Unread Messages State (instant caching)
    const { unreadCount } = useUnreadCount();

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
    const displayAvatar = isMounted ? (user?.avatar || contextAvatar?.url || contextUser?.user_metadata?.avatar_url) : null;
    const isVipDisplay = isMounted ? (isVip || contextVip) : false;
    const safeUnreadCount = isMounted ? unreadCount : 0;
    const safeNotificationCount = isMounted ? notificationCount : 0;

    // Live Help state
    const liveHelp = useLiveHelp();

    // ── OVERLAY HELPERS ──
    const openOverlay = (page) => setOverlayPage(page);
    const closeOverlay = () => setOverlayPage(null);

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
        let notifChannel;
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
                            const sbKeys = Object.keys(localStorage).filter(
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
                    console.log('[UniversalHeader] User found in localStorage:', authUser.email);

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
                            } catch (e) { }

                            const response = await fetch('/api/user/get-header-stats', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
                                },
                                body: JSON.stringify({ userId: authUser.id }),
                            });

                            const result = await response.json();
                            console.log(`[UniversalHeader] API fetch attempt ${attempt}:`, result);

                            if (result.success && result.profile && mounted) {
                                const { diamonds, full_name, username, avatar_url, is_vip } = result.profile;
                                setDiamondBalance(diamonds ?? 0);
                                setUser(prev => ({
                                    ...prev,
                                    avatar: avatar_url,
                                    name: full_name || username
                                }));
                                setIsVip(!!is_vip);
                                if (typeof result.notificationCount === 'number') {
                                    setNotificationCount(result.notificationCount);
                                }
                                // 🛡️ INSTANT UI: Cache user data for next page load (with TTL timestamp)
                                try {
                                    localStorage.setItem('sp-cached-header-user', JSON.stringify({
                                        avatar: avatar_url,
                                        name: full_name || username,
                                        username: username || null,
                                        diamonds: diamonds ?? 0,
                                        is_vip: !!is_vip,
                                        _ts: Date.now()
                                    }));
                                } catch (_) { }

                                // Update direct profile link if we got the username
                                if (username) {
                                    const directHref = `/hub/user/${username}`;
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
                        console.log(`[UniversalHeader] Retrying in ${delay}ms...`);
                        await new Promise(r => setTimeout(r, delay));
                        success = await fetchProfileWithRetry(attempt);
                    }

                    // Final fallback: direct REST API call (not Supabase client)
                    if (!success && mounted) {
                        console.log('[UniversalHeader] All API retries failed, trying direct REST...');
                        try {
                            const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
                            const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

                            // Get access token for authenticated query
                            let accessToken = SUPABASE_ANON_KEY;
                            try {
                                const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
                                if (authData.access_token) accessToken = authData.access_token;
                            } catch (e) { }

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
                                setUser(prev => ({
                                    ...prev,
                                    avatar: profile.avatar_url,
                                    name: profile.full_name || profile.username
                                }));
                                // Cache the REST fallback data too
                                try {
                                    localStorage.setItem('sp-cached-header-user', JSON.stringify({
                                        avatar: profile.avatar_url,
                                        name: profile.full_name || profile.username,
                                        username: profile.username || null,
                                        diamonds: profile.diamonds ?? 0,
                                        is_vip: !!profile.is_vip,
                                        _ts: Date.now()
                                    }));
                                } catch (_) { }
                                // Update direct profile link
                                if (profile.username) {
                                    const directHref = `/hub/user/${profile.username}`;
                                    setProfileHref(directHref);
                                    router.prefetch(directHref);
                                }
                                console.log('[UniversalHeader] Direct REST fallback SUCCESS:', { diamonds: profile.diamonds });
                            }
                        } catch (e) {
                            console.error('[UniversalHeader] Direct REST fallback failed:', e);
                        }
                    }

                    // FETCH NOTIFICATION COUNT (unread)
                    const fetchUnreadCount = async () => {
                        const { count: notifCount } = await supabase
                            .from('notifications')
                            .select('*', { count: 'exact', head: true })
                            .eq('user_id', authUser.id)
                            .eq('read', false);
                        if (mounted) {
                            setNotificationCount(notifCount || 0);
                            try { localStorage.setItem('sp-notif-count', String(notifCount || 0)); } catch (_) {}
                        }
                    };
                    await fetchUnreadCount();

                    // ── CROSS-TAB SYNC: Listen for read notifications in other tabs ──
                    cleanupNotifSync = listenBroadcast('smarter_poker_notif_sync', (msg) => {
                        // Support both legacy string and new object payloads
                        const isRefresh = msg === 'refresh_notifications' || msg?.action === 'refresh_notifications';
                        if (isRefresh) {
                            console.log('[UniversalHeader] received refresh_notifications broadcast');
                            fetchUnreadCount();
                        }
                    });

                    // NOTE: Unread messages count is set from API response above (lines 160-165)
                    // No direct query needed - the get-header-stats API handles this correctly

                    // REAL-TIME: Subscribe to new notifications
                    notifChannel = supabase
                        .channel('header-notifications')
                        .on('postgres_changes', {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'notifications',
                            filter: `user_id=eq.${authUser.id}`
                        }, () => {
                            setNotificationCount(prev => prev + 1);
                        })
                        .on('postgres_changes', {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'notifications',
                            filter: `user_id=eq.${authUser.id}`
                        }, (payload) => {
                            // If marked as read, decrease count
                            if (payload.new.read && !payload.old.read) {
                                setNotificationCount(prev => Math.max(0, prev - 1));
                            }
                        })
                        .on('postgres_changes', {
                            event: 'DELETE',
                            schema: 'public',
                            table: 'notifications',
                            filter: `user_id=eq.${authUser.id}`
                        }, (payload) => {
                            // If an unread notification is deleted, decrease count
                            if (payload.old && !payload.old.read) {
                                setNotificationCount(prev => Math.max(0, prev - 1));
                            }
                        })
                        .subscribe();

                    // Global useUnreadCount handles social_messages naturally
                }
            } catch (e) {
                console.error('[UniversalHeader] Data fetch error:', e);
            } finally {
                // loadUser complete
            }
        };
        loadUser();

        return () => {
            mounted = false;
            if (notifChannel) supabase.removeChannel(notifChannel);
            if (cleanupNotifSync) cleanupNotifSync();
        };
    }, []);

    // ── EventBus: Instant badge update when notifications are read (same-tab) ──
    useEffect(() => {
        const unsub = eventBus.on(EventType.NOTIFICATIONS_READ, (payload) => {
            const count = payload?.count || 1;
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
                console.log('[UniversalHeader] Avatar refresh via BroadcastChannel');
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
            console.log('[UniversalHeader] 🚌 VIP status change event received:', e.detail);
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
                } catch (e) { }

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
                    setUser(prev => ({
                        ...prev,
                        avatar: result.profile.avatar_url || prev?.avatar,
                        name: result.profile.full_name || result.profile.username || prev?.name
                    }));
                    // Update localStorage cache with fresh profile data
                    try {
                        localStorage.setItem('sp-cached-header-user', JSON.stringify({
                            avatar: result.profile.avatar_url,
                            name: result.profile.full_name || result.profile.username,
                            username: result.profile.username || null,
                            diamonds: result.profile.diamonds ?? 0,
                            is_vip: !!result.profile.is_vip,
                            _ts: Date.now()
                        }));
                    } catch (_) { }
                    // Update direct profile link if username changed
                    if (result.profile.username) {
                        const directHref = `/hub/user/${result.profile.username}`;
                        setProfileHref(directHref);
                    }
                    console.log('[UniversalHeader] 🚌 Profile refreshed via bus event');
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

    const handleBack = () => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
        } else {
            router.push('/hub');
        }
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
            <style jsx global>{`
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
                    height: 28px;
                    overflow: visible;
                }

                .header-nav-btn img {
                    /* no filter - images are pre-processed */
                }

                .hamburger-btn {
                    width: 56px;
                    height: 56px;
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
                    overflow: hidden;
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
                    top: -2px;
                    right: -2px;
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
                        height: 22px;
                        width: auto;
                        max-width: 80px;
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
                        top: -3px;
                        right: -3px;
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
            `}</style>

            <header className="universal-header">
                {/* LEFT: Hamburger Menu + Back/Hub Button + "Smarter.Poker" */}
                <div className="header-left">
                    {/* Hamburger Menu - only shows when onMenuClick is provided */}
                    {onMenuClick && (
                        <button
                            onClick={onMenuClick}
                            className="hamburger-btn"
                            aria-label="Open Menu"
                        >
                            <img src="/images/btn-hamburger.png" alt="Menu" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </button>
                    )}
                    <button
                        onClick={pageDepth >= 2 ? handleBack : () => router.push('/hub')}
                        className="header-img-btn header-nav-btn"
                    >
                        <img
                            src={pageDepth >= 2 ? '/images/btn-back.png' : '/images/btn-hub.png'}
                            alt={pageDepth >= 2 ? 'Back' : 'Hub'}
                            style={{ height: '100%', width: '100%', objectFit: 'contain' }}
                        />
                    </button>
                </div>

                {/* CENTER: Brand Text — centered between nav and icons */}
                <div className="header-center">
                    <img src="/images/brand-text.png" alt="Smarter.Poker" className="brand-text-img hide-mobile" style={{ height: 32, objectFit: 'contain' }} />
                    {router.pathname.includes('/messenger') && (
                        <span className="hide-mobile" style={{ marginLeft: 8, fontSize: 16, display: 'flex', alignItems: 'center' }} title="Securely Encrypted">🔒</span>
                    )}
                </div>

                {/* RIGHT: Orb Icons */}
                <div className="header-right">
                    {/* Diamond Wallet Icon */}
                    <button
                        onClick={() => setIsWalletOpen(true)}
                        className="orb-btn"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        title="Diamond Wallet"
                    >
                        <img src="/images/diamond-icon.png" alt="Diamond Wallet" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </button>

                    {/* VIP Card Icon — only for VIP members */}
                    {isVipDisplay && (
                        <button
                            onClick={() => openOverlay('diamond-store')}
                            className="orb-btn"
                            style={{ borderRadius: 6, border: '2px solid rgba(200, 200, 200, 0.8)', boxShadow: '0 0 6px rgba(200, 200, 200, 0.4)', background: 'none', cursor: 'pointer', padding: 0 }}
                            title="VIP Member"
                        >
                                <img
                                    src="/images/vip-card.png"
                                    alt="VIP Member"
                                    style={{
                                        width: '220%',
                                        height: '220%',
                                        maxWidth: 'none',
                                        objectFit: 'contain',
                                        position: 'absolute',
                                        top: '50%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                    }}
                                />
                        </button>
                    )}

                    {/* Avatar/Profile */}
                    <div
                        className={`profile-orb${!displayAvatar && !isMounted ? ' profile-orb-shimmer' : ''}`}
                        onClick={() => openOverlay('profile')}
                        role="button"
                        tabIndex={0}
                        aria-label="My Profile"
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
                            {!displayAvatar && (isMounted ? (user?.name || '').charAt(0).toUpperCase() || '?' : '')}
                        </span>
                    </div>

                    {/* Messages - Custom Metallic Messenger icon — Sovereign Redirect (no popup) */}
                    <button onClick={() => { window.location.href = '/hub/messenger'; }} className="orb-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} title="Messages">
                            <img src="/images/header-messenger.png" alt="Messages" style={{ width: '200%', height: '200%', maxWidth: 'none', objectFit: 'contain', position: 'absolute', top: '55%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                            {safeUnreadCount > 0 && (
                                <span className="orb-badge">{safeUnreadCount > 99 ? '99+' : safeUnreadCount}</span>
                            )}
                    </button>

                    {/* Notifications - Custom Metallic Bell icon */}
                    <button onClick={() => openOverlay('notifications')} className="orb-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} title="Notifications">
                            <img src="/images/header-notifications.png" alt="Notifications" style={{ width: '200%', height: '200%', maxWidth: 'none', objectFit: 'contain', position: 'absolute', top: '60%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                            {safeNotificationCount > 0 && (
                                <span className="orb-badge">{safeNotificationCount > 99 ? '99+' : safeNotificationCount}</span>
                            )}
                    </button>

                    {/* Settings - Custom Metallic Gear icon */}
                    <button onClick={() => openOverlay('settings')} className="orb-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} title="Settings">
                            <img src="/images/header-settings.png" alt="Settings" style={{ width: '200%', height: '200%', maxWidth: 'none', objectFit: 'contain', position: 'absolute', top: '55%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                    </button>

                    {/* Live Help - Hidden on mobile */}
                    <button
                        onClick={() => {
                            console.log('[UniversalHeader] Live Help button clicked');
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
                        <img src="/images/header-help.png" alt="Live Help" style={{ width: '200%', height: '200%', maxWidth: 'none', objectFit: 'contain', position: 'absolute', top: '57%', left: '50%', transform: 'translate(-50%, -50%)' }} />
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
                    onClose={closeOverlay}
                    url={overlayUrlMap[overlayPage]}
                    title={overlayTitleMap[overlayPage]}
                />
            )}
        </>
    );
}


// GEEVES LIVE HELP PANEL EXPORT
export { LiveHelpPanel } from '../../world/components/Geeves';
// trigger deploy
