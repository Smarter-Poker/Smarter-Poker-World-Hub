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
import PushNotificationBell from '../notifications/PushNotificationBell';
import { useLiveHelp, LiveHelpPanel } from '../../world/components/Geeves';
import DiamondWalletModal from '../store/DiamondWalletModal';

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

export default function UniversalHeader({
    pageDepth = 1,  // 1 = major page (show Hub button), 2+ = nested (show Back)
    showSearch = false,
    onSearchClick = null,
    onMenuClick = null  // Callback for hamburger menu click
}) {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [stats, setStats] = useState({ diamonds: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [notificationCount, setNotificationCount] = useState(0);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [showFullDiamonds, setShowFullDiamonds] = useState(false);
    const [isWalletOpen, setIsWalletOpen] = useState(false);

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
                                const { diamonds, full_name, username, avatar_url } = result.profile;
                                setStats({ diamonds });
                                setUser(prev => ({
                                    ...prev,
                                    avatar: avatar_url,
                                    name: full_name || username
                                }));
                                // Set notification and message counts from API
                                if (typeof result.notificationCount === 'number') {
                                    setNotificationCount(result.notificationCount);
                                }
                                if (typeof result.unreadMessages === 'number') {
                                    setUnreadMessages(result.unreadMessages);
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
                                `${SUPABASE_URL}/rest/v1/profiles?id=eq.${authUser.id}&select=username,full_name,avatar_url,diamonds`,
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

                    // REAL-TIME: Subscribe to new messages (using social_messages table)
                    messageChannel = supabase
                        .channel('header-messages')
                        .on('postgres_changes', {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'social_messages'
                        }, (payload) => {
                            // Only increment if message is not from current user
                            if (payload.new.sender_id !== authUser.id) {
                                setUnreadMessages(prev => prev + 1);
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
                    align-self: center;
                    gap: 6px;
                    flex-shrink: 0;
                    flex-grow: 1;
                    justify-content: flex-end;
                    margin-top: 2px;
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
                    height: 32px;
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
                
                /* MOBILE: Compact layout with all icons visible */
                @media (max-width: 600px) {
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
                {/* LEFT: Hamburger Menu + Back/Hub Button + "Smarter.Poker" */}
                <div className="header-left">
                    {/* Hamburger Menu - only shows when onMenuClick is provided */}
                    {onMenuClick && (
                        <button
                            onClick={onMenuClick}
                            className="header-img-btn"
                            aria-label="Open menu"
                        >
                            <img src="/images/btn-hamburger.png" alt="Menu" style={{ height: '100%', width: '100%', objectFit: 'contain' }} />
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
                    <span className="brand-text">Smarter.Poker</span>
                </div>

                {/* CENTER: Diamond Wallet */}
                <div className="header-center">
                    {/* Diamond balance — click to open wallet modal */}
                    <div className="diamond-wallet">
                        <button
                            onClick={() => setIsWalletOpen(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0 }}
                            title="View transaction history"
                        >
                            <span>💎</span>
                            <span data-testid="header-diamonds" style={{ fontWeight: 700 }} title={stats.diamonds.toLocaleString() + ' diamonds'}>
                                {showFullDiamonds ? stats.diamonds.toLocaleString() : formatCompact(stats.diamonds)}
                            </span>
                        </button>
                        <span onClick={() => router.push('/hub/diamond-store')} style={{
                            fontWeight: 700, cursor: 'pointer', color: 'white'
                        }}>+</span>
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

                    {/* Messages - Custom Metallic Messenger icon */}
                    <Link href="/hub/messenger" style={{ textDecoration: 'none' }}>
                        <div className="orb-btn">
                            <img src="/images/header-messenger.png" alt="Messages" style={{ width: '200%', height: '200%', maxWidth: 'none', objectFit: 'contain', position: 'absolute', top: '55%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                            {unreadMessages > 0 && (
                                <span className="orb-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>
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

                    {/* Live Help - Custom Metallic Question icon */}
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
                        <img src="/images/header-help.png" alt="Live Help" style={{ width: '120%', height: '120%', maxWidth: 'none', objectFit: 'contain', position: 'absolute', top: '36%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                    </button>

                    {/* Push Notification Bell - hidden on mobile to save space */}
                    <div className="hide-mobile">
                        <PushNotificationBell />
                    </div>

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
