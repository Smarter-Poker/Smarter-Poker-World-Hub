/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 3-PILL HEADER COMPONENT — Futuristic Metallic Design
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Layout:
 * - Pill 1 (Left): Hamburger Menu + Hub/Back Arrow
 * - Pill 2 (Center): "Smarter.Poker" + Diamond Wallet
 * - Pill 3 (Right): Profile + Message + Notification + Settings + Help Icons
 * 
 * Design: Dark metallic frame with cyan glow accents
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import PushNotificationBell from '../notifications/PushNotificationBell';
import { useLiveHelp } from '../../world/components/Geeves';

// Format numbers compactly: 1.1k, 10.1k, 100.1k, 1.1M
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
    const [user, setUser] = useState(null);
    const [stats, setStats] = useState({ diamonds: 0 });
    const [notificationCount, setNotificationCount] = useState(0);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [showFullDiamonds, setShowFullDiamonds] = useState(false);

    const liveHelp = useLiveHelp();

    // Load user data
    useEffect(() => {
        let mounted = true;

        const loadUser = async () => {
            try {
                // Read user from localStorage (bulletproof approach)
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

                    // Fetch profile and stats
                    const response = await fetch('/api/user/get-header-stats', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
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
                        if (typeof result.unreadMessages === 'number') {
                            setUnreadMessages(result.unreadMessages);
                        }
                    }
                }
            } catch (e) {
                console.error('[ThreePillHeader] Error:', e);
            }
        };

        loadUser();
        return () => { mounted = false; };
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
            <style jsx global>{`
                .three-pill-header {
                    background: linear-gradient(180deg, #0a1628 0%, #0d1a2d 100%);
                    padding: 8px 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 8px;
                    position: sticky;
                    top: 0;
                    z-index: 100;
                    border-bottom: 1px solid rgba(0, 180, 255, 0.3);
                    box-shadow: 0 2px 20px rgba(0, 180, 255, 0.15);
                }

                /* PILL CONTAINER BASE */
                .pill-container {
                    background: linear-gradient(135deg, #0d1a2d 0%, #12243a 50%, #0d1a2d 100%);
                    border: 1px solid rgba(0, 180, 255, 0.4);
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px;
                    box-shadow: 
                        inset 0 1px 0 rgba(255, 255, 255, 0.05),
                        inset 0 -1px 0 rgba(0, 0, 0, 0.3),
                        0 0 15px rgba(0, 180, 255, 0.15),
                        0 2px 4px rgba(0, 0, 0, 0.4);
                    position: relative;
                    overflow: hidden;
                }

                .pill-container::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 1px;
                    background: linear-gradient(90deg, 
                        transparent 0%, 
                        rgba(0, 200, 255, 0.5) 20%, 
                        rgba(0, 200, 255, 0.8) 50%, 
                        rgba(0, 200, 255, 0.5) 80%, 
                        transparent 100%);
                }

                /* Corner glow accents */
                .pill-container::after {
                    content: '';
                    position: absolute;
                    bottom: -1px;
                    left: 10%;
                    right: 10%;
                    height: 2px;
                    background: linear-gradient(90deg, 
                        transparent 0%, 
                        rgba(0, 180, 255, 0.4) 30%, 
                        rgba(0, 180, 255, 0.4) 70%, 
                        transparent 100%);
                    filter: blur(1px);
                }

                /* PILL 1 - Left (Navigation) */
                .pill-left {
                    flex-shrink: 0;
                }

                /* PILL 2 - Center (Brand + Wallet) */
                .pill-center {
                    flex: 1;
                    max-width: 280px;
                    justify-content: center;
                }

                /* PILL 3 - Right (Icons) */
                .pill-right {
                    flex-shrink: 0;
                }

                /* NAV BUTTON */
                .nav-btn-pill {
                    background: linear-gradient(135deg, rgba(0, 136, 255, 0.2) 0%, rgba(0, 102, 204, 0.3) 100%);
                    border: 1px solid rgba(0, 180, 255, 0.4);
                    border-radius: 8px;
                    padding: 8px 12px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: white;
                    font-weight: 600;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .nav-btn-pill:hover {
                    background: linear-gradient(135deg, rgba(0, 180, 255, 0.3) 0%, rgba(0, 136, 255, 0.4) 100%);
                    box-shadow: 0 0 10px rgba(0, 180, 255, 0.3);
                }

                /* HAMBURGER BUTTON */
                .hamburger-btn {
                    background: transparent;
                    border: none;
                    padding: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: #00d4ff;
                    transition: all 0.2s;
                }

                .hamburger-btn:hover {
                    color: white;
                }

                /* BRAND TEXT */
                .brand-text-pill {
                    color: white;
                    font-size: 14px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    white-space: nowrap;
                    text-shadow: 0 0 10px rgba(0, 200, 255, 0.3);
                }

                /* DIAMOND WALLET */
                .diamond-wallet-pill {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 100, 150, 0.25) 100%);
                    border: 1px solid rgba(0, 212, 255, 0.5);
                    padding: 6px 12px;
                    border-radius: 20px;
                    text-decoration: none;
                    color: white;
                    font-weight: 700;
                    font-size: 13px;
                    box-shadow: 0 0 10px rgba(0, 212, 255, 0.2);
                    transition: all 0.2s;
                }

                .diamond-wallet-pill:hover {
                    box-shadow: 0 0 15px rgba(0, 212, 255, 0.4);
                    border-color: rgba(0, 212, 255, 0.8);
                }

                .diamond-plus {
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: rgba(0, 212, 255, 0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: 700;
                    color: white;
                }

                /* ICON BUTTONS */
                .icon-btn-pill {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    position: relative;
                    transition: all 0.2s;
                    background: transparent;
                    border: none;
                    padding: 0;
                }

                .icon-btn-pill:hover {
                    transform: scale(1.1);
                }

                .icon-btn-pill svg {
                    fill: rgba(255, 255, 255, 0.85);
                    transition: fill 0.2s;
                }

                .icon-btn-pill:hover svg {
                    fill: #00d4ff;
                }

                /* PROFILE ORB */
                .profile-orb-pill {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    border: 2px solid rgba(0, 245, 255, 0.5);
                    box-shadow: 0 0 10px rgba(0, 245, 255, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    background-size: cover;
                    background-position: center;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .profile-orb-pill:hover {
                    border-color: rgba(0, 245, 255, 0.8);
                    box-shadow: 0 0 15px rgba(0, 245, 255, 0.5);
                }

                /* BADGE */
                .pill-badge {
                    position: absolute;
                    top: -4px;
                    right: -4px;
                    background: #e41e3f;
                    color: white;
                    border-radius: 10px;
                    padding: 2px 5px;
                    font-size: 10px;
                    font-weight: 700;
                    min-width: 16px;
                    text-align: center;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    border: 1px solid #0d1a2d;
                }

                /* MOBILE RESPONSIVE */
                @media (max-width: 600px) {
                    .three-pill-header {
                        padding: 6px 8px;
                        gap: 6px;
                    }

                    .pill-container {
                        padding: 4px 8px;
                        border-radius: 10px;
                    }

                    .brand-text-pill {
                        display: none;
                    }

                    .pill-center {
                        flex: 0 1 auto;
                    }

                    .diamond-wallet-pill {
                        padding: 5px 10px;
                        font-size: 12px;
                    }

                    .icon-btn-pill {
                        width: 28px;
                        height: 28px;
                    }

                    .icon-btn-pill svg {
                        width: 22px;
                        height: 22px;
                    }

                    .profile-orb-pill {
                        width: 28px;
                        height: 28px;
                    }

                    .nav-btn-pill {
                        padding: 6px 10px;
                        font-size: 12px;
                    }
                }
            `}</style>

            <header className="three-pill-header">
                {/* PILL 1: Navigation (Hamburger + Back/Hub) */}
                <div className="pill-container pill-left">
                    {onMenuClick && (
                        <button
                            onClick={onMenuClick}
                            className="hamburger-btn"
                            aria-label="Open menu"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <line x1="3" y1="18" x2="21" y2="18" />
                            </svg>
                        </button>
                    )}
                    <button
                        onClick={pageDepth > 1 ? handleBack : () => router.push('/hub')}
                        className="nav-btn-pill"
                    >
                        <span>←</span>
                        <span>{pageDepth > 1 ? 'Back' : 'Hub'}</span>
                    </button>
                </div>

                {/* PILL 2: Brand + Diamond Wallet */}
                <div className="pill-container pill-center">
                    <span className="brand-text-pill">Smarter.Poker</span>
                    <Link href="/hub/diamond-store" className="diamond-wallet-pill" onClick={(e) => {
                        if (stats.diamonds >= 1000) {
                            e.preventDefault();
                            setShowFullDiamonds(!showFullDiamonds);
                        }
                    }}>
                        <span>💎</span>
                        <span title={stats.diamonds.toLocaleString() + ' diamonds'}>
                            {showFullDiamonds ? stats.diamonds.toLocaleString() : formatCompact(stats.diamonds)}
                        </span>
                        <span className="diamond-plus">+</span>
                    </Link>
                </div>

                {/* PILL 3: Icons (Profile, Messages, Notifications, Settings, Help) */}
                <div className="pill-container pill-right">
                    {/* Profile */}
                    <Link href="/hub/profile" style={{ textDecoration: 'none' }}>
                        <div
                            className="profile-orb-pill"
                            style={{
                                background: user?.avatar
                                    ? `url(${user.avatar}) center/cover`
                                    : 'linear-gradient(135deg, rgba(0, 136, 255, 0.3) 0%, rgba(0, 245, 255, 0.15) 100%)'
                            }}
                        >
                            {!user?.avatar && '👤'}
                        </div>
                    </Link>

                    {/* Messages */}
                    <Link href="/hub/messenger" className="icon-btn-pill">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.07.36-.09.53-.05.86.23 1.81.36 2.9.36 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm6.07 7.56l-2.96 4.69c-.47.75-1.48.93-2.18.38l-2.35-1.76a.75.75 0 00-.9 0l-3.17 2.41c-.42.32-.98-.18-.7-.63l2.96-4.69c.47-.75 1.48-.93 2.18-.38l2.35 1.76c.27.2.65.2.9 0l3.17-2.41c.42-.32.98.18.7.63z" />
                        </svg>
                        {unreadMessages > 0 && (
                            <span className="pill-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                        )}
                    </Link>

                    {/* Notifications */}
                    <Link href="/hub/notifications" className="icon-btn-pill">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                        </svg>
                        {notificationCount > 0 && (
                            <span className="pill-badge">{notificationCount > 99 ? '99+' : notificationCount}</span>
                        )}
                    </Link>

                    {/* Settings */}
                    <Link href="/hub/settings" className="icon-btn-pill">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                        </svg>
                    </Link>

                    {/* Help */}
                    <button
                        onClick={() => liveHelp.setIsOpen(true)}
                        className="icon-btn-pill"
                        aria-label="Live Help"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.85)" strokeWidth="2" fill="none" />
                            <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="bold" fill="rgba(255,255,255,0.85)">?</text>
                        </svg>
                    </button>
                </div>
            </header>
        </>
    );
}
