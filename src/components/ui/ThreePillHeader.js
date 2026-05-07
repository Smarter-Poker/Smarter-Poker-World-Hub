/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 3-PILL HEADER COMPONENT — Dynamic Image with Overlay Buttons
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Uses the user's exact image as an <img> element (NOT background-image)
 * with interactive buttons absolutely positioned ON TOP of the image.
 * 
 * The header image has 3 metallic pill zones:
 * - Left Pill (~5%-20%): Hamburger + Hub/Back
 * - Center Pill (~25%-75%): Smarter.Poker + Diamond Wallet
 * - Right Pill (~78%-95%): Profile + Icons
 */

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { useLiveHelp, LiveHelpPanel } from '../../world/components/Geeves';

// ── PERF: Lazy-load DiamondWalletModal only when opened (saves ~95KB from initial bundle) ──
const DiamondWalletModal = dynamic(() => import('../store/DiamondWalletModal'), {
    ssr: false,
    loading: () => null,
});
import { useAvatar } from '../../contexts/AvatarContext';
import { useUnreadCount } from '../../hooks/useUnreadCount';
import { useDiamondBalance } from '../../hooks/useDiamondBalance';
import { listenBroadcast } from '../../lib/broadcastSync';
import { eventBus, EventType } from '../../engine/EventBus';

export default function ThreePillHeader({
    pageDepth = 1,
    onMenuClick = null
}) {
    const router = useRouter();

    // 🛡️ INSTANT UI: Single-parse helper with 24h cache TTL
    // Matches UniversalHeader pattern — parses once, discards stale data.
    const _cachedHeader = (() => {
        if (typeof window === 'undefined') return null;
        try {
            const raw = localStorage.getItem('sp-cached-header-user');
            if (!raw) return null;
            const data = JSON.parse(raw);
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
    const [headerHeight, setHeaderHeight] = useState(80);
    const [isMounted, setIsMounted] = useState(false);
    const imgRef = useRef(null);

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
            // Use single-parse cache instead of re-parsing
            if (_cachedHeader?.username) return `/hub/user/${_cachedHeader.username}`;
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        return '/hub/profile';
    });

    // Global Avatar State (instant caching)
    const { user: contextUser, avatar: contextAvatar } = useAvatar();

    // Global Unread Messages State
    const { unreadCount } = useUnreadCount();

    // 🛡️ Hydration gate: mark mounted + seed diamond balance from cache
    useEffect(() => {
        setIsMounted(true);
        if (_cachedHeader?.diamonds !== undefined) {
            setDiamondBalance(_cachedHeader.diamonds);
        }
    }, []);

    // Derived values — gated behind isMounted for SSR hydration safety
    const displayAvatar = isMounted ? (user?.avatar || contextAvatar?.url || contextUser?.user_metadata?.avatar_url) : null;
    const safeUnreadCount = isMounted ? unreadCount : 0;
    const safeNotificationCount = isMounted ? notificationCount : 0;

    const liveHelp = useLiveHelp();

    // Measure image height when loaded
    const handleImageLoad = () => {
        if (imgRef.current) {
            setHeaderHeight(imgRef.current.offsetHeight);
        }
    };

    // ── PREFETCH: Eagerly load all header-linked page JS bundles ──
    useEffect(() => {
        if (profileHref !== '/hub/profile') {
            router.prefetch(profileHref);
        }
        router.prefetch('/hub/notifications');
        router.prefetch('/hub/settings');
        router.prefetch('/hub/messenger');
    }, [profileHref, router]);

    useEffect(() => {
        let mounted = true;
        let notifChannel = null;
        let cleanupNotifSync = null;

        const loadUser = async () => {
            try {
                let authUser = null;
                if (typeof window !== 'undefined') {
                    try {
                        const explicitAuth = localStorage.getItem('smarter-poker-auth');
                        if (explicitAuth) {
                            const tokenData = JSON.parse(explicitAuth);
                            authUser = tokenData?.user || null;
                        }
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
                        console.warn('[ThreePillHeader] Error reading localStorage:', e);
                    }
                }

                if (!mounted) return;

                if (authUser) {
                    setUser(authUser);

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

                    if (result.success && result.profile && mounted) {
                        const { diamonds, avatar_url, full_name, username } = result.profile;
                        setDiamondBalance(diamonds ?? 0);
                        setUser(prev => ({
                            ...prev,
                            avatar: avatar_url,
                            name: full_name || username
                        }));
                        if (typeof result.notificationCount === 'number') {
                            setNotificationCount(result.notificationCount);
                        }

                        // ── REAL-TIME SUPABASE SYNC ──
                        // NOTE: UPDATE listener removed — Supabase DEFAULT REPLICA IDENTITY sends
                        // empty payload.old, so payload.old.read is always undefined (never fires).
                        // Same-tab read decrements are handled by EventBus.NOTIFICATIONS_READ.
                        // BUG FIX (Bug #10): static channel name causes zombie subscription on
                        // React StrictMode double-invoke or hot-reload. Made unique per mount.
                        notifChannel = supabase
                            .channel(`threepill-notifs-${authUser.id}-${Date.now()}`)
                            .on('postgres_changes', {
                                event: 'INSERT',
                                schema: 'public',
                                table: 'notifications',
                                filter: `user_id=eq.${authUser.id}`
                            }, () => {
                                if (mounted) setNotificationCount(prev => prev + 1);
                            })
                            .on('postgres_changes', {
                                event: 'DELETE',
                                schema: 'public',
                                table: 'notifications',
                                filter: `user_id=eq.${authUser.id}`
                            }, (payload) => {
                                // payload.old.read may be undefined with DEFAULT REPLICA IDENTITY
                                // be optimistic: decrement if we can't confirm it was already read
                                if (!payload.old?.read && mounted) {
                                    setNotificationCount(prev => Math.max(0, prev - 1));
                                }
                            })
                            .subscribe();

                        // ── CROSS-TAB SYNC FOR THREE-PILL HEADER ──
                        // Use get-header-stats (not direct Supabase query) so poker/page
                        // notifications are included in the re-fetched count
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
                            } catch (e) { console.warn('[ThreePillHeader] fetchUnreadCount failed:', e); }
                        };

                        cleanupNotifSync = listenBroadcast('smarter_poker_notif_sync', (msg) => {
                            // Support both legacy string and new object payloads
                            const isRefresh = msg === 'refresh_notifications' || msg?.action === 'refresh_notifications';
                            if (isRefresh) {
                                console.debug('[ThreePillHeader] received refresh_notifications broadcast');
                                fetchUnreadCount();
                            }
                        });

                        // TIER 1: Diamond Balance Realtime Sync — handled by useDiamondBalance hook

                        // 🛡️ INSTANT UI: Cache user data for next page load (with TTL)
                        try {
                            localStorage.setItem('sp-cached-header-user', JSON.stringify({
                                avatar: avatar_url,
                                name: full_name || username,
                                username: username || null,
                                diamonds: diamonds ?? 0,
                                is_vip: !!result.profile.is_vip,
                                _ts: Date.now()
                            }));
                        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

                        // Update direct profile link if we got the username
                        if (result.profile.username) {
                            const directHref = `/hub/user/${result.profile.username}`;
                            setProfileHref(directHref);
                            router.prefetch(directHref);
                        }
                    }
                }
            } catch (e) {
                console.warn('[ThreePillHeader] Error:', e);
            }
        };

        loadUser();
        return () => {
            mounted = false;
            if (notifChannel) supabase.removeChannel(notifChannel);
            if (cleanupNotifSync) cleanupNotifSync();
        };
    }, []);

    // ── Diamond balance: All refresh/realtime/cross-tab logic handled by useDiamondBalance hook ──

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

    // ── VIP status bus listener — updates VIP badge in real time ──
    // Triggered by AvatarContext after successful signup
    // AbortController prevents redundant concurrent fetches when both
    // 'profile-updated' and 'vip-status-changed' fire simultaneously
    const profileFetchControllerRef = useRef(null);
    useEffect(() => {
        const handleProfileUpdate = async () => {
            // Re-fetch header stats to pick up all profile changes
            if (!user?.id) return;

            // Cancel any in-flight profile fetch to prevent races
            if (profileFetchControllerRef.current) {
                profileFetchControllerRef.current.abort();
            }
            const controller = new AbortController();
            profileFetchControllerRef.current = controller;

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
                    signal: controller.signal,
                });
                const result = await response.json();
                if (result.success && result.profile) {
                    setDiamondBalance(result.profile.diamonds ?? 0);
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
                    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                    // Update direct profile link if username changed
                    if (result.profile.username) {
                        const directHref = `/hub/user/${result.profile.username}`;
                        setProfileHref(directHref);
                    }
                    console.debug('[ThreePillHeader] 🚌 Profile refreshed via bus event');
                }
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        };

        window.addEventListener('profile-updated', handleProfileUpdate);

        // ── VIP status change listener ──
        // Matches UniversalHeader — triggered by premiumFeatureGate.js and AvatarContext
        // ThreePillHeader uses profile re-fetch to pick up VIP changes
        const handleVipChange = () => {
            handleProfileUpdate();
        };
        window.addEventListener('vip-status-changed', handleVipChange);

        return () => {
            window.removeEventListener('profile-updated', handleProfileUpdate);
            window.removeEventListener('vip-status-changed', handleVipChange);
            // Abort any in-flight fetch to prevent state updates after unmount
            if (profileFetchControllerRef.current) {
                profileFetchControllerRef.current.abort();
            }
        };
    }, [user?.id]);

    // ── TIER 2: Avatar Changes Cross-Tab Sync ──
    // Listen for avatar changes from AvatarContext and other tabs
    useEffect(() => {
        const cleanup = listenBroadcast('smarter_poker_avatar_sync', (msg) => {
            if (msg === 'refresh') {
                console.debug('[ThreePillHeader] Avatar refresh via BroadcastChannel');
                // Trigger a profile re-fetch so avatar + name update in the header
                window.dispatchEvent(new CustomEvent('profile-updated'));
            }
        });

        return cleanup;
    }, []);

    // ── TIER 2: Club Arena Chip Balance Cross-Tab Sync ──
    // Handled by useDiamondBalance hook

    // Guard against rapid double-click on back button
    const backInProgressRef = useRef(false);

    const handleBack = () => {
        if (typeof window === 'undefined') return;
        if (backInProgressRef.current) return;
        backInProgressRef.current = true;

        // CRITICAL: Use router.back() — NOT window.history.back().
        // window.history.back() updates the URL bar but does NOT trigger
        // Next.js re-renders. Do NOT gate on window.history.length — it
        // is unreliable in Mobile Chrome (can be 1 even after navigation).
        router.back();

        setTimeout(() => {
            backInProgressRef.current = false;
        }, 500);
    };

    // Shared icon button style
    const iconBtnStyle = {
        width: 44,
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        background: 'transparent',
        border: 'none',
        padding: 0,
        position: 'relative',
    };

    return (
        <>
            <Head>
                {/* 🛡️ PRELOAD avatar image so it stays in browser cache */}
                {displayAvatar && <link rel="preload" as="image" href={displayAvatar} />}
            </Head>
            <header style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 1000,
                background: 'linear-gradient(180deg, #0a0e1a 0%, #0c1424 100%)',
            }}>
                {/* CONTAINER - positions everything relative */}
                <div style={{
                    position: 'relative',
                    width: '100%',
                }}>

                    {/* THE HEADER IMAGE - defines height */}
                    <img
                        ref={imgRef}
                        src="/images/futuristic-3pill-header.png"
                        alt="Header"
                        onLoad={handleImageLoad}
                        style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                        }}
                    />

                    {/* ═══════════════════════════════════════════════════════════════
                        PILL 1: LEFT - Hamburger + Hub/Back
                        Positioned to center within left metallic pill (~5%-22%)
                        ═══════════════════════════════════════════════════════════════ */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: '22%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        paddingLeft: 16,
                    }}>
                        {onMenuClick && (
                            <button
                                onClick={onMenuClick}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    padding: 0,
                                    width: 56,
                                    height: 56,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    overflow: 'visible',
                                }}
                                aria-label="Open Menu"
                            >
                                <img src="/images/btn-hamburger.png" alt="Menu" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            </button>
                        )}
                        <button
                            onClick={pageDepth > 1 ? handleBack : () => router.push('/hub')}
                            style={{
                                background: 'rgba(0, 136, 255, 0.15)',
                                border: '1px solid rgba(0, 200, 255, 0.4)',
                                borderRadius: 8,
                                padding: '10px 18px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                color: 'white',
                                fontWeight: 700,
                                fontSize: 15,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <span style={{ fontSize: 18 }}>←</span>
                            <span>{pageDepth > 1 ? 'Back' : 'Hub'}</span>
                        </button>
                    </div>

                    {/* ═══════════════════════════════════════════════════════════════
                        PILL 2: CENTER - Smarter.Poker + Diamond Wallet
                        Positioned to center within the middle metallic pill
                        ═══════════════════════════════════════════════════════════════ */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: '22%',
                        right: '22%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 20,
                    }}>
                        <img src="/images/brand-text.png" alt="Smarter.Poker" style={{ height: 32, objectFit: 'contain' }} />
                    </div>

                    {/* ═══════════════════════════════════════════════════════════════
                        PILL 3: RIGHT - Profile + Icons
                        Positioned to center within the right metallic pill (~78%-95%)
                        ═══════════════════════════════════════════════════════════════ */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        right: 0,
                        width: '22%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingRight: 16,
                    }}>
                        {/* Diamond Wallet */}
                        <button
                            onClick={() => setIsWalletOpen(true)}
                            style={{ ...iconBtnStyle, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            title="Diamond Wallet"
                        >
                            <img src="/images/diamond-icon.png" alt="Diamond Wallet" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                        </button>

                        {/* Profile */}
                        <Link href={profileHref} style={{ textDecoration: 'none' }} prefetch={profileHref !== '/hub/profile'}>
                            <div style={{
                                width: 44,
                                height: 44,
                                borderRadius: '50%',
                                border: '2px solid rgba(0, 245, 255, 0.5)',
                                boxShadow: '0 0 10px rgba(0, 245, 255, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 16,
                                fontWeight: 700,
                                color: 'white',
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                cursor: 'pointer',
                                transition: 'transform 0.1s ease, opacity 0.15s ease',
                                background: displayAvatar
                                    ? `url(${displayAvatar}) center/cover`
                                    : (!isMounted
                                        ? 'linear-gradient(90deg, rgba(0,136,255,0.15) 25%, rgba(0,245,255,0.3) 50%, rgba(0,136,255,0.15) 75%)'
                                        : 'linear-gradient(135deg, rgba(0, 136, 255, 0.3) 0%, rgba(0, 245, 255, 0.15) 100%)'),
                                ...((!displayAvatar && !isMounted) ? {
                                    backgroundSize: '200% 100%',
                                    animation: 'shimmer-avatar 1.5s ease-in-out infinite',
                                } : {}),
                            }}>
                                {!displayAvatar && (isMounted ? (user?.name || '').charAt(0).toUpperCase() || '?' : '')}
                            </div>
                        </Link>

                        {/* Messages */}
                        <Link href="/hub/messenger" style={iconBtnStyle}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
                                <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.07.36-.09.53-.05.86.23 1.81.36 2.9.36 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm6.07 7.56l-2.96 4.69c-.47.75-1.48.93-2.18.38l-2.35-1.76a.75.75 0 00-.9 0l-3.17 2.41c-.42.32-.98-.18-.7-.63l2.96-4.69c.47-.75 1.48-.93 2.18-.38l2.35 1.76c.27.2.65.2.9 0l3.17-2.41c.42-.32.98.18.7.63z" />
                            </svg>
                            {safeUnreadCount > 0 && (
                                <span style={{
                                    position: 'absolute',
                                    top: 2,
                                    right: 2,
                                    background: '#e41e3f',
                                    color: 'white',
                                    borderRadius: 10,
                                    padding: '2px 6px',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    minWidth: 16,
                                    textAlign: 'center',
                                }}>{safeUnreadCount > 99 ? '99+' : safeUnreadCount}</span>
                            )}
                        </Link>

                        {/* Notifications */}
                        <Link href="/hub/notifications" style={iconBtnStyle}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
                                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                            </svg>
                            {safeNotificationCount > 0 && (
                                <span style={{
                                    position: 'absolute',
                                    top: 2,
                                    right: 2,
                                    background: '#e41e3f',
                                    color: 'white',
                                    borderRadius: 10,
                                    padding: '2px 6px',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    minWidth: 16,
                                    textAlign: 'center',
                                }}>{safeNotificationCount > 99 ? '99+' : safeNotificationCount}</span>
                            )}
                        </Link>

                        {/* Settings */}
                        <Link href="/hub/settings" style={iconBtnStyle}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
                                <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                            </svg>
                        </Link>

                        {/* Help */}
                        <button
                            onClick={() => liveHelp.setIsOpen(true)}
                            style={iconBtnStyle}
                            aria-label="Live Help"
                        >
                            <svg width="28" height="28" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.9)" strokeWidth="2" fill="none" />
                                <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="bold" fill="rgba(255,255,255,0.9)">?</text>
                            </svg>
                        </button>
                    </div>
                </div>
            </header>

            {/* Spacer to push content below fixed header */}
            <div style={{ height: headerHeight }} />

            <DiamondWalletModal
                isOpen={isWalletOpen}
                onClose={() => setIsWalletOpen(false)}
                onBuyClick={() => router.push('/hub/diamond-store')}
                initialBalance={diamondBalance}
            />

            {/* Live Help Panel — renders the full Geeves conversation interface */}
            <LiveHelpPanel {...liveHelp} />
        </>
    );
}
