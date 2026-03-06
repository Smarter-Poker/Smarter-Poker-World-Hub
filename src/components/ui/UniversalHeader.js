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
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

import { useLiveHelp, LiveHelpPanel } from '../../world/components/Geeves';
import DiamondWalletModal from '../store/DiamondWalletModal';
import { useAvatar } from '../../contexts/AvatarContext';
import { useUnreadCount } from '../../hooks/useUnreadCount';

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

// Format numbers compactly: 1.1k, 10.1k, 100.1k, 1.1M
const formatCompact = (num) => {
    if (num < 1000) return num.toString();
    if (num < 10000) return (num / 1000).toFixed(1) + 'k';   // 1.1k - 9.9k
    if (num < 100000) return (num / 1000).toFixed(1) + 'k'; // 10.1k - 99.9k
    if (num < 1000000) return (num / 1000).toFixed(0) + 'k'; // 100k - 999k
    return (num / 1000000).toFixed(1) + 'M'; // 1.1M+
};

// Neon orb icon button
const OrbButton = ({ href, icon, badge = 0, onClick }) => {
    const content = (
        <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(0, 136, 255, 0.15) 0%, rgba(0, 245, 255, 0.08) 100%)',
            border: '1px solid rgba(0, 245, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            cursor: 'pointer',
            position: 'relative',
            boxShadow: '0 0 15px rgba(0, 245, 255, 0.15), inset 0 0 10px rgba(0, 245, 255, 0.05)',
            transition: 'all 0.2s'
        }}>
            {icon}
            {badge > 0 && (
                <span style={{
                    position: 'absolute', top: -4, right: -4,
                    background: '#ff3b3b', color: 'white',
                    borderRadius: 10, padding: '2px 6px',
                    fontSize: 10, fontWeight: 700, minWidth: 16, textAlign: 'center'
                }}>{badge > 99 ? '99+' : badge}</span>
            )}
        </div>
    );

    if (onClick) {
        return <button onClick={onClick} style={{ background: 'none', border: 'none', padding: 0 }}>{content}</button>;
    }

    return href ? (
        <Link href={href} style={{ textDecoration: 'none' }}>{content}</Link>
    ) : content;
};

// ── Pass Countdown Timer ──
const PassCountdown = ({ pass }) => {
    const [timeLeft, setTimeLeft] = useState('');
    useEffect(() => {
        if (!pass?.expires_at) return;
        const update = () => {
            const diff = new Date(pass.expires_at) - new Date();
            if (diff <= 0) { setTimeLeft('Expired'); return; }
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            // Show seconds if under 5 min to build urgency, else hours/mins
            if (h === 0 && m < 5) {
                setTimeLeft(`${m}m ${s}s`);
            } else {
                setTimeLeft(`${h}h ${m}m`);
            }
        };
        update();
        const int = setInterval(update, 1000);
        return () => clearInterval(int);
    }, [pass]);
    if (!timeLeft || timeLeft === 'Expired') return null;
    return (
        <div className="hide-mobile" style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px',
            background: 'rgba(0, 245, 255, 0.1)',
            border: '1px solid rgba(0, 245, 255, 0.4)',
            borderRadius: 8,
            color: '#00f5ff',
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 0 10px rgba(0, 245, 255, 0.15)',
            whiteSpace: 'nowrap'
        }} title="Active Pass Remaining Time">
            ⏳ {timeLeft}
        </div>
    );
};

export default function UniversalHeader({
    pageDepth = 1,  // 1 = major page (show Hub button), 2+ = nested (show Back)
    showSearch = false,
    onSearchClick = null,
    onMenuClick = null  // Callback for hamburger menu click
}) {
    const router = useRouter();
    const [user, setUser] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const cachedUser = localStorage.getItem('sp-cached-header-user');
                if (cachedUser) return JSON.parse(cachedUser);
            } catch (e) { }
        }
        return null;
    });
    const [stats, setStats] = useState({ diamonds: 0 });
    const [activePass, setActivePass] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notificationCount, setNotificationCount] = useState(0);
    const [showFullDiamonds, setShowFullDiamonds] = useState(false);
    const [isWalletOpen, setIsWalletOpen] = useState(false);
    const [isVip, setIsVip] = useState(() => {
        if (typeof window !== 'undefined') {
            try { return localStorage.getItem('sp-vip-status') === 'true'; } catch (e) { return false; }
        }
        return false;
    });

    // Global Avatar State (instant caching)
    const { user: contextUser, avatar: contextAvatar, isVip: contextVip } = useAvatar();

    // Global Unread Messages State (instant caching)
    const { unreadCount } = useUnreadCount();

    // Derived values to prevent "flash of missing data" on mount
    const displayAvatar = contextAvatar?.imageUrl || user?.avatar || contextUser?.user_metadata?.avatar_url;
    const isVipDisplay = isVip || contextVip;

    // Live Help state
    const liveHelp = useLiveHelp();

    useEffect(() => {
        let notifChannel = null;
        let messageChannel = null;
        let mounted = true; // Prevent state updates after unmount

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
                    setUser(prev => ({ ...prev, ...authUser }));
                    console.log('[UniversalHeader] User found in localStorage:', authUser.email);

                    // 🛡️ BULLETPROOF: Retry logic with exponential backoff
                    const MAX_RETRIES = 3;
                    const fetchProfileWithRetry = async (attempt = 1) => {
                        if (!mounted) return false;
                        try {
                            const response = await fetch('/api/user/get-header-stats', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: authUser.id }),
                            });

                            const result = await response.json();
                            console.log(`[UniversalHeader] API fetch attempt ${attempt}:`, result);

                            if (result.success && result.profile && mounted) {
                                const { diamonds, full_name, username, avatar_url, is_vip } = result.profile;
                                setStats({ diamonds });
                                setActivePass(result.activePass || null);
                                setUser(prev => {
                                    const nextUser = {
                                        ...prev,
                                        avatar: avatar_url,
                                        name: full_name || username
                                    };
                                    try {
                                        localStorage.setItem('sp-cached-header-user', JSON.stringify({ avatar: avatar_url, name: full_name || username }));
                                    } catch (e) { }
                                    return nextUser;
                                });
                                setIsVip(!!is_vip);
                                try { localStorage.setItem('sp-vip-status', String(!!is_vip)); } catch (e) { }
                                if (typeof result.notificationCount === 'number') {
                                    setNotificationCount(result.notificationCount);
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
                            const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
                            const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

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
                                setStats({ diamonds: profile.diamonds || 0 });
                                setUser(prev => {
                                    const nextUser = {
                                        ...prev,
                                        avatar: profile.avatar_url,
                                        name: profile.full_name || profile.username
                                    };
                                    try {
                                        localStorage.setItem('sp-cached-header-user', JSON.stringify({ avatar: profile.avatar_url, name: profile.full_name || profile.username }));
                                    } catch (e) { }
                                    return nextUser;
                                });
                                setIsVip(!!profile.is_vip);
                                try { localStorage.setItem('sp-vip-status', String(!!profile.is_vip)); } catch (e) { }
                                console.log('[UniversalHeader] Direct REST fallback SUCCESS:', { diamonds: profile.diamonds, is_vip: profile.is_vip });
                            }
                        } catch (e) {
                            console.error('[UniversalHeader] Direct REST fallback failed:', e);
                        }
                    }

                    // FETCH NOTIFICATION COUNT (unread)
                    const { count: notifCount } = await supabase
                        .from('notifications')
                        .select('*', { count: 'exact', head: true })
                        .eq('user_id', authUser.id)
                        .eq('read', false);
                    setNotificationCount(notifCount || 0);

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
                        .subscribe();

                    // Global useUnreadCount handles social_messages naturally
                }
            } catch (e) {
                console.error('[UniversalHeader] Data fetch error:', e);
            } finally {
                setIsLoading(false);
            }
        };
        loadUser();

        return () => {
            mounted = false;
            if (notifChannel) supabase.removeChannel(notifChannel);
        };
    }, []);

    // ── Diamond balance auto-refresh when rewards are earned ──
    useEffect(() => {
        const refreshBalance = async () => {
            if (!user?.id) return;
            try {
                const response = await fetch('/api/user/get-header-stats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: user.id }),
                });
                const result = await response.json();
                if (result.success && result.profile) {
                    setStats({ diamonds: result.profile.diamonds });
                    setActivePass(result.activePass || null);
                    console.log('[UniversalHeader] 💎 Balance refreshed:', result.profile.diamonds);
                }
            } catch (e) {
                console.warn('[UniversalHeader] Balance refresh failed:', e.message);
            }
        };

        window.addEventListener('diamond-balance-refresh', refreshBalance);
        return () => window.removeEventListener('diamond-balance-refresh', refreshBalance);
    }, [user?.id]);

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
                const response = await fetch('/api/user/get-header-stats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: user.id }),
                });
                const result = await response.json();
                if (result.success && result.profile) {
                    setStats({ diamonds: result.profile.diamonds });
                    setIsVip(!!result.profile.is_vip);
                    setActivePass(result.activePass || null);
                    try { localStorage.setItem('sp-vip-status', String(!!result.profile.is_vip)); } catch (e) { }
                    setUser(prev => {
                        const nextUser = {
                            ...prev,
                            avatar: result.profile.avatar_url || prev?.avatar,
                            name: result.profile.full_name || result.profile.username || prev?.name
                        };
                        try {
                            localStorage.setItem('sp-cached-header-user', JSON.stringify({ avatar: nextUser.avatar, name: nextUser.name }));
                        } catch (e) { }
                        return nextUser;
                    });
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
                </div>

                {/* RIGHT: Orb Icons */}
                <div className="header-right">
                    {/* Active Pass Countdown */}
                    {!isVipDisplay && activePass && <PassCountdown pass={activePass} />}

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
                        <Link href="/hub/diamond-store" style={{ textDecoration: 'none' }}>
                            <div className="orb-btn" style={{ borderRadius: 6, border: '2px solid rgba(200, 200, 200, 0.8)', boxShadow: '0 0 6px rgba(200, 200, 200, 0.4)' }}>
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
                            </div>
                        </Link>
                    )}

                    {/* Avatar/Profile */}
                    <Link href="/hub/profile" style={{ textDecoration: 'none' }}>
                        <div
                            className="profile-orb"
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
                            {!displayAvatar && '👤'}
                        </div>
                    </Link>

                    {/* Messages - Custom Metallic Messenger icon */}
                    <Link href="/hub/messenger" style={{ textDecoration: 'none' }}>
                        <div className="orb-btn">
                            <img src="/images/header-messenger.png" alt="Messages" style={{ width: '200%', height: '200%', maxWidth: 'none', objectFit: 'contain', position: 'absolute', top: '55%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                            {unreadCount > 0 && (
                                <span className="orb-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                            )}
                        </div>
                    </Link>

                    {/* Notifications - Custom Metallic Bell icon */}
                    <Link href="/hub/notifications" style={{ textDecoration: 'none' }}>
                        <div className="orb-btn">
                            <img src="/images/header-notifications.png" alt="Notifications" style={{ width: '200%', height: '200%', maxWidth: 'none', objectFit: 'contain', position: 'absolute', top: '60%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                            {notificationCount > 0 && (
                                <span className="orb-badge">{notificationCount > 99 ? '99+' : notificationCount}</span>
                            )}
                        </div>
                    </Link>

                    {/* Settings - Custom Metallic Gear icon */}
                    <Link href="/hub/settings" style={{ textDecoration: 'none' }}>
                        <div className="orb-btn">
                            <img src="/images/header-settings.png" alt="Settings" style={{ width: '200%', height: '200%', maxWidth: 'none', objectFit: 'contain', position: 'absolute', top: '55%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                        </div>
                    </Link>

                    {/* Live Help - Hidden on mobile */}
                    <button
                        onClick={() => {
                            console.log('[UniversalHeader] Live Help button clicked');
                            liveHelp.setIsOpen(true);
                        }}
                        className="orb-btn hide-mobile"
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

            {/* Diamond Wallet Modal */}
            <DiamondWalletModal
                isOpen={isWalletOpen}
                onClose={() => setIsWalletOpen(false)}
                onBuyClick={() => router.push('/hub/diamond-store')}
            />
        </>
    );
}


// GEEVES LIVE HELP PANEL EXPORT
export { LiveHelpPanel } from '../../world/components/Geeves';
