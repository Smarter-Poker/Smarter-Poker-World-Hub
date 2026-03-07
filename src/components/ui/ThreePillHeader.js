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
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useLiveHelp } from '../../world/components/Geeves';
import DiamondWalletModal from '../store/DiamondWalletModal';
import { useAvatar } from '../../contexts/AvatarContext';
import { useUnreadCount } from '../../hooks/useUnreadCount';

const formatCompact = (num) => {
    if (num < 1000) return num.toString();
    if (num < 10000) return (num / 1000).toFixed(1) + 'k';
    if (num < 100000) return (num / 1000).toFixed(1) + 'k';
    if (num < 1000000) return (num / 1000).toFixed(0) + 'k';
    return (num / 1000000).toFixed(1) + 'M';
};

export default function ThreePillHeader({
    pageDepth = 1,
    onMenuClick = null
}) {
    const router = useRouter();

    // 🛡️ INSTANT UI: Read cached header user from localStorage on mount
    const [user, setUser] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const cached = localStorage.getItem('sp-cached-header-user');
                if (cached) return JSON.parse(cached);
            } catch (e) { }
        }
        return null;
    });
    const [stats, setStats] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const cached = localStorage.getItem('sp-cached-header-user');
                if (cached) {
                    const data = JSON.parse(cached);
                    return { diamonds: data.diamonds || 0 };
                }
            } catch (e) { }
        }
        return { diamonds: 0 };
    });
    const [notificationCount, setNotificationCount] = useState(0);
    const [showFullDiamonds, setShowFullDiamonds] = useState(false);
    const [isWalletOpen, setIsWalletOpen] = useState(false);
    const [headerHeight, setHeaderHeight] = useState(80);
    const imgRef = useRef(null);

    // Global Avatar State (instant caching)
    const { user: contextUser, avatar: contextAvatar } = useAvatar();

    // Global Unread Messages State
    const { unreadCount } = useUnreadCount();

    // Derived values to prevent "flash of missing data" on mount
    const displayAvatar = user?.avatar || contextAvatar?.url || contextUser?.user_metadata?.avatar_url;

    const liveHelp = useLiveHelp();

    // Measure image height when loaded
    const handleImageLoad = () => {
        if (imgRef.current) {
            setHeaderHeight(imgRef.current.offsetHeight);
        }
    };

    useEffect(() => {
        let mounted = true;
        let notifSyncChannel = null;
        let diamondChannel = null;
        let diamondBc = null;

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
                            const sbKeys = Object.keys(localStorage).filter(
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

                    if (result.success && result.profile && mounted) {
                        const { diamonds, avatar_url, full_name, username } = result.profile;
                        setStats({ diamonds });
                        setUser(prev => ({
                            ...prev,
                            avatar: avatar_url,
                            name: full_name || username
                        }));
                        if (typeof result.notificationCount === 'number') {
                            setNotificationCount(result.notificationCount);
                        }

                        // ── REAL-TIME SUPABASE SYNC (matches UniversalHeader) ──
                        let notifChannel = supabase
                            .channel('threepill-notifications')
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
                                if (!payload.old.read) {
                                    setNotificationCount(prev => Math.max(0, prev - 1));
                                }
                            })
                            .subscribe();

                        // ── CROSS-TAB SYNC FOR THREE-PILL HEADER ──
                        const fetchUnreadCount = async () => {
                            const { count: notifCount } = await supabase
                                .from('notifications')
                                .select('*', { count: 'exact', head: true })
                                .eq('user_id', authUser.id)
                                .eq('read', false);
                            if (mounted) setNotificationCount(notifCount || 0);
                        };

                        notifSyncChannel = new BroadcastChannel('smarter_poker_notif_sync');
                        notifSyncChannel.onmessage = (event) => {
                            if (event.data === 'refresh_notifications') {
                                console.log('[ThreePillHeader] received refresh_notifications broadcast');
                                fetchUnreadCount();
                            }
                        };

                        // TIER 1: Diamond Balance Realtime Sync
                        const refreshDiamondBalance = async () => {
                            try {
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
                                    setStats({ diamonds: result.profile.diamonds });
                                    try {
                                        const cached = JSON.parse(localStorage.getItem('sp-cached-header-user') || '{}');
                                        cached.diamonds = result.profile.diamonds;
                                        localStorage.setItem('sp-cached-header-user', JSON.stringify(cached));
                                    } catch (_) { }
                                }
                            } catch (e) {
                                console.warn('[ThreePillHeader] Diamond sync refresh failed:', e.message);
                            }
                        };

                        diamondChannel = supabase
                            .channel(`diamonds:${authUser.id}`)
                            .on('postgres_changes', {
                                event: 'UPDATE',
                                schema: 'public',
                                table: 'profiles',
                                filter: `id=eq.${authUser.id}`
                            }, (payload) => {
                                if (payload.new.diamonds !== undefined && mounted) {
                                    setStats({ diamonds: payload.new.diamonds });
                                    try {
                                        const cached = JSON.parse(localStorage.getItem('sp-cached-header-user') || '{}');
                                        cached.diamonds = payload.new.diamonds;
                                        localStorage.setItem('sp-cached-header-user', JSON.stringify(cached));
                                    } catch (_) { }
                                }
                            })
                            .subscribe();

                        try {
                            diamondBc = new BroadcastChannel('smarter_poker_diamond_sync');
                            diamondBc.onmessage = () => {
                                refreshDiamondBalance();
                            };
                        } catch (e) { }

                        // 🛡️ INSTANT UI: Cache user data for next page load
                        try {
                            localStorage.setItem('sp-cached-header-user', JSON.stringify({
                                avatar: avatar_url,
                                name: full_name || username,
                                diamonds: diamonds || 0,
                                is_vip: !!result.profile.is_vip
                            }));
                        } catch (_) { }
                    }
                }
            } catch (e) {
                console.error('[ThreePillHeader] Error:', e);
            }
        };

        loadUser();
        return () => {
            mounted = false;
            if (notifSyncChannel) {
                try {
                    notifSyncChannel.close();
                } catch (e) { }
            }
            if (diamondChannel) {
                supabase.removeChannel(diamondChannel);
            }
            try { diamondBc?.close(); } catch (e) { }
            try {
                // Must search for and remove the active channel listener
                const activeChannel = supabase.getChannels().find(c => c.topic === 'realtime:threepill-notifications');
                if (activeChannel) {
                    supabase.removeChannel(activeChannel);
                }
            } catch (e) { }
        };
    }, []);

    // ── TIER 2: Avatar Changes Cross-Tab Sync ──
    // Listen for avatar changes from AvatarContext and other tabs
    useEffect(() => {
        let avatarBc = null;

        try {
            avatarBc = new BroadcastChannel('smarter_poker_avatar_sync');
            avatarBc.onmessage = (event) => {
                if (event.data === 'refresh') {
                    console.log('[ThreePillHeader] Avatar refresh via BroadcastChannel');
                    // Avatar is managed by AvatarContext which handles the refresh
                }
            };
        } catch (e) { }

        return () => {
            if (avatarBc) {
                try { avatarBc.close(); } catch (e) { }
            }
        };
    }, []);

    // ── TIER 2: Club Arena Chip Balance Cross-Tab Sync ──
    // Listen for chip balance changes from other Club Arena tabs
    useEffect(() => {
        let chipsBc = null;

        try {
            chipsBc = new BroadcastChannel('smarter_poker_chips_sync');
            chipsBc.onmessage = (event) => {
                if (event.data === 'refresh') {
                    console.log('[ThreePillHeader] Chip balance refresh via BroadcastChannel');
                }
            };
        } catch (e) { }

        return () => {
            if (chipsBc) {
                try { chipsBc.close(); } catch (e) { }
            }
        };
    }, []);

    const handleBack = () => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
        } else {
            router.push('/hub');
        }
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
            {/* Fixed header container - height driven by image */}
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
                        <Link href="/hub/profile" style={{ textDecoration: 'none' }}>
                            <div style={{
                                width: 44,
                                height: 44,
                                borderRadius: '50%',
                                border: '2px solid rgba(0, 245, 255, 0.5)',
                                boxShadow: '0 0 10px rgba(0, 245, 255, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 20,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                cursor: 'pointer',
                                background: displayAvatar
                                    ? `url(${displayAvatar}) center/cover`
                                    : 'linear-gradient(135deg, rgba(0, 136, 255, 0.3) 0%, rgba(0, 245, 255, 0.15) 100%)',
                            }}>
                                {!displayAvatar && '👤'}
                            </div>
                        </Link>

                        {/* Messages */}
                        <Link href="/hub/messenger" style={iconBtnStyle}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
                                <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.07.36-.09.53-.05.86.23 1.81.36 2.9.36 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm6.07 7.56l-2.96 4.69c-.47.75-1.48.93-2.18.38l-2.35-1.76a.75.75 0 00-.9 0l-3.17 2.41c-.42.32-.98-.18-.7-.63l2.96-4.69c.47-.75 1.48-.93 2.18-.38l2.35 1.76c.27.2.65.2.9 0l3.17-2.41c.42-.32.98.18.7.63z" />
                            </svg>
                            {unreadCount > 0 && (
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
                                }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
                            )}
                        </Link>

                        {/* Notifications */}
                        <Link href="/hub/notifications" style={iconBtnStyle}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
                                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                            </svg>
                            {notificationCount > 0 && (
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
                                }}>{notificationCount > 99 ? '99+' : notificationCount}</span>
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
            />
        </>
    );
}
