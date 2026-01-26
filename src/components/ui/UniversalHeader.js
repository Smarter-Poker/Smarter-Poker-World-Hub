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
 * - XP display with level (REAL data from profiles.xp_total)
 * - Profile picture (REAL avatar from profiles.avatar_url)
 * - Neon orb icons for profile, messages, notifications, settings
 * - Return to Hub button (for major pages) or Back button (for nested pages)
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import PushNotificationBell from '../notifications/PushNotificationBell';

// Dark theme colors matching hub
const C = {
    bg: '#0a0e1a',
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

export default function UniversalHeader({
    pageDepth = 1,  // 1 = major page (show Hub button), 2+ = nested (show Back)
    showSearch = false,
    onSearchClick = null
}) {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [stats, setStats] = useState({ xp: 0, diamonds: 0, level: 1 });
    const [isLoading, setIsLoading] = useState(true);
    const [notificationCount, setNotificationCount] = useState(0);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [showFullDiamonds, setShowFullDiamonds] = useState(false);
    const [showFullXP, setShowFullXP] = useState(false);

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
                    setUser(authUser);
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
                                const { xp, diamonds, level, full_name, username, avatar_url } = result.profile;
                                setStats({ xp, diamonds, level });
                                setUser(prev => ({
                                    ...prev,
                                    avatar: avatar_url,
                                    name: full_name || username
                                }));
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
                                `${SUPABASE_URL}/rest/v1/profiles?id=eq.${authUser.id}&select=username,full_name,avatar_url,xp_total,diamonds`,
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
                                const xpTotal = profile.xp_total || 0;
                                const level = Math.max(1, Math.floor(Math.sqrt(xpTotal / 231)));
                                setStats({ xp: xpTotal, diamonds: profile.diamonds || 0, level });
                                setUser(prev => ({
                                    ...prev,
                                    avatar: profile.avatar_url,
                                    name: profile.full_name || profile.username
                                }));
                                console.log('[UniversalHeader] Direct REST fallback SUCCESS:', { xpTotal, diamonds: profile.diamonds });
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

                    // FETCH UNREAD MESSAGES COUNT
                    const { count: msgCount } = await supabase
                        .from('messages')
                        .select('*', { count: 'exact', head: true })
                        .eq('recipient_id', authUser.id)
                        .eq('read', false);
                    setUnreadMessages(msgCount || 0);

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

                    // REAL-TIME: Subscribe to new messages
                    messageChannel = supabase
                        .channel('header-messages')
                        .on('postgres_changes', {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'messages',
                            filter: `recipient_id=eq.${authUser.id}`
                        }, () => {
                            setUnreadMessages(prev => prev + 1);
                        })
                        .on('postgres_changes', {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'messages',
                            filter: `recipient_id=eq.${authUser.id}`
                        }, (payload) => {
                            // If marked as read, decrease count
                            if (payload.new.read && !payload.old.read) {
                                setUnreadMessages(prev => Math.max(0, prev - 1));
                            }
                        })
                        .subscribe();
                }
            } catch (e) {
                console.error('[UniversalHeader] Data fetch error:', e);
            } finally {
                setIsLoading(false);
            }
        };
        loadUser();

        // Cleanup subscriptions
        return () => {
            mounted = false;
            if (notifChannel) supabase.removeChannel(notifChannel);
            if (messageChannel) supabase.removeChannel(messageChannel);
        };
    }, []);

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
                    border-bottom: 1px solid ${C.border};
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
                    gap: 10px;
                    flex-shrink: 1;
                    justify-content: center;
                }
                
                .header-right {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex-shrink: 0;
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
                
                .brand-text {
                    color: white;
                    font-size: 16px;
                    font-weight: 700;
                    letter-spacing: 0.3px;
                    white-space: nowrap;
                }
                
                .diamond-wallet {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    background: linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 100, 150, 0.2) 100%);
                    border: 1px solid rgba(0, 212, 255, 0.4);
                    padding: 6px 12px;
                    border-radius: 16px;
                    text-decoration: none;
                    color: white;
                    min-width: 70px;
                    height: 36px;
                    box-sizing: border-box;
                }
                
                .xp-display {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    padding: 4px 12px;
                    border-radius: 16px;
                    min-width: 70px;
                    height: 36px;
                    box-sizing: border-box;
                    line-height: 1.1;
                }
                
                .orb-btn {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, rgba(0, 136, 255, 0.15) 0%, rgba(0, 245, 255, 0.08) 100%);
                    border: 1px solid rgba(0, 245, 255, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    cursor: pointer;
                    position: relative;
                    box-shadow: 0 0 10px rgba(0, 245, 255, 0.15);
                    flex-shrink: 0;
                }
                
                .orb-badge {
                    position: absolute;
                    top: -4px;
                    right: -4px;
                    background: #ff3b3b;
                    color: white;
                    border-radius: 8px;
                    padding: 1px 5px;
                    font-size: 9px;
                    font-weight: 700;
                    min-width: 14px;
                    text-align: center;
                }
                
                .profile-orb {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border: 2px solid rgba(0, 245, 255, 0.5);
                    box-shadow: 0 0 12px rgba(0, 245, 255, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    flex-shrink: 0;
                    background-size: cover;
                    background-position: center;
                }
                
                /* MOBILE: ALL icons visible, just smaller and more compact */
                @media (max-width: 600px) {
                    .universal-header {
                        padding: 4px 6px;
                        gap: 2px;
                    }
                    
                    .header-left, .header-center, .header-right {
                        gap: 3px;
                    }
                    
                    .brand-text {
                        display: none; /* Hide brand text on mobile to save space */
                    }
                    
                    .nav-btn {
                        padding: 8px 12px;
                        font-size: 14px;
                        gap: 2px;
                    }
                    
                    .nav-btn span:last-child {
                        display: none; /* Hide "Hub"/"Back" text, just arrow */
                    }
                    
                    .diamond-wallet {
                        padding: 4px 8px;
                        font-size: 11px;
                        gap: 2px;
                        min-width: 60px;
                        height: 32px;
                    }
                    
                    .xp-display {
                        padding: 3px 8px;
                        font-size: 9px;
                        min-width: 50px;
                        height: 32px;
                    }
                    
                    .hide-mobile {
                        display: none !important;
                    }
                    
                    /* ALL orbs visible, just smaller */
                    .orb-btn, .profile-orb {
                        width: 26px;
                        height: 26px;
                        font-size: 12px;
                    }
                    
                    .orb-badge {
                        top: -3px;
                        right: -3px;
                        padding: 0 3px;
                        font-size: 8px;
                        min-width: 10px;
                    }
                }
                
                /* Larger tablets/desktops */
                @media (min-width: 601px) {
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
                {/* LEFT: Back/Hub Button + "Smarter.Poker" */}
                <div className="header-left">
                    <button
                        onClick={pageDepth > 1 ? handleBack : () => router.push('/hub')}
                        className="nav-btn"
                    >
                        <span>←</span>
                        <span>{pageDepth > 1 ? 'Back' : 'Hub'}</span>
                    </button>
                    <span className="brand-text">Smarter.Poker</span>
                </div>

                {/* CENTER: Diamond Wallet + XP */}
                <div className="header-center">
                    {/* Diamond Wallet - click to toggle full/compact */}
                    <Link href="/hub/diamond-store" className="diamond-wallet" onClick={(e) => {
                        if (stats.diamonds >= 1000) {
                            e.preventDefault();
                            setShowFullDiamonds(!showFullDiamonds);
                        }
                    }}>
                        <span>💎</span>
                        <span data-testid="header-diamonds" style={{ fontWeight: 700 }} title={stats.diamonds.toLocaleString() + ' diamonds'}>
                            {showFullDiamonds ? stats.diamonds.toLocaleString() : formatCompact(stats.diamonds)}
                        </span>
                        <span style={{
                            width: 16, height: 16, borderRadius: '50%',
                            background: 'rgba(0, 212, 255, 0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700
                        }}>+</span>
                    </Link>

                    {/* XP + Level - click to toggle full/compact - STACKED layout */}
                    <div className="xp-display" onClick={() => stats.xp >= 1000 && setShowFullXP(!showFullXP)} style={{ cursor: stats.xp >= 1000 ? 'pointer' : 'default' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ color: C.gold, fontWeight: 700, fontSize: 11 }}>XP</span>
                            <span data-testid="header-xp" style={{ color: C.white, fontWeight: 600, fontSize: 11 }} title={stats.xp.toLocaleString() + ' XP'}>
                                {showFullXP ? stats.xp.toLocaleString() : formatCompact(stats.xp)}
                            </span>
                        </div>
                        <span data-testid="header-level" style={{ color: C.cyan, fontWeight: 700, fontSize: 10 }}>LV {stats.level}</span>
                    </div>
                </div>

                {/* RIGHT: Orb Icons */}
                <div className="header-right">
                    {/* Avatar/Profile */}
                    <Link href="/hub/profile" style={{ textDecoration: 'none' }}>
                        <div
                            className="profile-orb"
                            style={{
                                background: user?.avatar
                                    ? `url(${user.avatar}) center/cover`
                                    : 'linear-gradient(135deg, rgba(0, 136, 255, 0.3) 0%, rgba(0, 245, 255, 0.15) 100%)'
                            }}
                        >
                            {!user?.avatar && '👤'}
                        </div>
                    </Link>

                    {/* Messages - Facebook Messenger style icon */}
                    <Link href="/hub/messenger" style={{ textDecoration: 'none' }}>
                        <div className="orb-btn">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#00d4ff' }}>
                                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                            </svg>
                            {unreadMessages > 0 && (
                                <span className="orb-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                            )}
                        </div>
                    </Link>

                    {/* Notifications */}
                    <Link href="/hub/notifications" style={{ background: 'none', border: 'none', padding: 0, textDecoration: 'none' }}>
                        <div className="orb-btn">
                            🔔
                            {notificationCount > 0 && (
                                <span className="orb-badge">{notificationCount > 99 ? '99+' : notificationCount}</span>
                            )}
                        </div>
                    </Link>

                    {/* Push Notification Bell */}
                    <PushNotificationBell />

                    {/* Search - HIDE on mobile */}
                    {showSearch && (
                        <button onClick={onSearchClick} className="hide-mobile" style={{ background: 'none', border: 'none', padding: 0 }}>
                            <div className="orb-btn">🔍</div>
                        </button>
                    )}

                    {/* Settings */}
                    <Link href="/hub/settings" style={{ textDecoration: 'none' }}>
                        <div className="orb-btn">⚙️</div>
                    </Link>
                </div>
            </header>
        </>
    );
}

