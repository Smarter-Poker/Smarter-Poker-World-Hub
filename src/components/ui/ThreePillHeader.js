/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 3-PILL HEADER COMPONENT — User's Exact Image with Dynamic Overlays
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Uses the user's exact "Global Header v1.png" image as the header skin
 * with absolutely positioned interactive elements on each pill:
 * 
 * - Pill 1 (Left ~5%-22%): Hamburger Menu + Hub/Back Arrow
 * - Pill 2 (Center ~28%-72%): "Smarter.Poker" + Diamond Wallet  
 * - Pill 3 (Right ~78%-95%): Profile + Message + Notification + Settings + Help
 * 
 * Image: 1536×200px cropped header bar from user's 1536×1024 original
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
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
                /* HEADER CONTAINER - Uses user's exact image */
                .three-pill-header {
                    position: sticky;
                    top: 0;
                    z-index: 100;
                    width: 100%;
                    height: 70px;
                    background: url('/images/three-pill-header-bar.png') center/cover no-repeat;
                    background-color: #0a1628;
                }

                /* OVERLAY CONTAINER - positions interactive elements over the image */
                .header-overlay {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    padding: 0;
                }

                /* PILL ZONES - positioned exactly over image pills */
                .pill-zone {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    height: 50px;
                }

                /* LEFT PILL: 5% to 22% (17% width) */
                .pill-zone-left {
                    left: 5%;
                    width: 17%;
                }

                /* CENTER PILL: 28% to 72% (44% width) */
                .pill-zone-center {
                    left: 28%;
                    width: 44%;
                    gap: 16px;
                }

                /* RIGHT PILL: 78% to 95% (17% width) */
                .pill-zone-right {
                    left: 78%;
                    width: 17%;
                    gap: 4px;
                }

                /* HAMBURGER BUTTON */
                .hamburger-btn {
                    background: transparent;
                    border: none;
                    padding: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: #00d4ff;
                    transition: all 0.2s;
                }

                .hamburger-btn:hover {
                    color: white;
                    transform: scale(1.1);
                }

                /* NAV BUTTON (Back/Hub) */
                .nav-btn-pill {
                    background: rgba(0, 136, 255, 0.12);
                    border: 1px solid rgba(0, 180, 255, 0.25);
                    border-radius: 6px;
                    padding: 5px 10px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    color: white;
                    font-weight: 600;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-decoration: none;
                }

                .nav-btn-pill:hover {
                    background: rgba(0, 180, 255, 0.2);
                    box-shadow: 0 0 8px rgba(0, 180, 255, 0.3);
                }

                /* BRAND TEXT */
                .brand-text-pill {
                    color: white;
                    font-size: 16px;
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
                    background: rgba(0, 212, 255, 0.1);
                    border: 1px solid rgba(0, 212, 255, 0.35);
                    padding: 5px 12px;
                    border-radius: 18px;
                    text-decoration: none;
                    color: white;
                    font-weight: 700;
                    font-size: 13px;
                    transition: all 0.2s;
                }

                .diamond-wallet-pill:hover {
                    box-shadow: 0 0 12px rgba(0, 212, 255, 0.4);
                    border-color: rgba(0, 212, 255, 0.6);
                }

                .diamond-plus {
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: rgba(0, 212, 255, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: 700;
                    color: white;
                }

                /* ICON BUTTONS */
                .icon-btn-pill {
                    width: 28px;
                    height: 28px;
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
                    transform: scale(1.15);
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
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    border: 2px solid rgba(0, 245, 255, 0.4);
                    box-shadow: 0 0 6px rgba(0, 245, 255, 0.2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 11px;
                    background-size: cover;
                    background-position: center;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .profile-orb-pill:hover {
                    border-color: rgba(0, 245, 255, 0.7);
                    box-shadow: 0 0 10px rgba(0, 245, 255, 0.4);
                }

                /* BADGE */
                .pill-badge {
                    position: absolute;
                    top: -2px;
                    right: -2px;
                    background: #e41e3f;
                    color: white;
                    border-radius: 8px;
                    padding: 1px 4px;
                    font-size: 9px;
                    font-weight: 700;
                    min-width: 14px;
                    text-align: center;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                }

                /* MOBILE RESPONSIVE */
                @media (max-width: 600px) {
                    .three-pill-header {
                        height: 55px;
                    }

                    .brand-text-pill {
                        display: none;
                    }

                    .pill-zone-left {
                        left: 3%;
                        width: 20%;
                    }

                    .pill-zone-center {
                        left: 26%;
                        width: 38%;
                    }

                    .pill-zone-right {
                        left: 67%;
                        width: 30%;
                    }

                    .icon-btn-pill {
                        width: 24px;
                        height: 24px;
                    }

                    .icon-btn-pill svg {
                        width: 18px;
                        height: 18px;
                    }

                    .profile-orb-pill {
                        width: 24px;
                        height: 24px;
                    }

                    .nav-btn-pill {
                        padding: 4px 8px;
                        font-size: 11px;
                    }

                    .diamond-wallet-pill {
                        padding: 4px 8px;
                        font-size: 11px;
                    }
                }
            `}</style>

            <header className="three-pill-header">
                <div className="header-overlay">
                    {/* PILL 1: Navigation (Hamburger + Back/Hub) */}
                    <div className="pill-zone pill-zone-left">
                        {onMenuClick && (
                            <button
                                onClick={onMenuClick}
                                className="hamburger-btn"
                                aria-label="Open menu"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                    <div className="pill-zone pill-zone-center">
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
                    <div className="pill-zone pill-zone-right">
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
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.07.36-.09.53-.05.86.23 1.81.36 2.9.36 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm6.07 7.56l-2.96 4.69c-.47.75-1.48.93-2.18.38l-2.35-1.76a.75.75 0 00-.9 0l-3.17 2.41c-.42.32-.98-.18-.7-.63l2.96-4.69c.47-.75 1.48-.93 2.18-.38l2.35 1.76c.27.2.65.2.9 0l3.17-2.41c.42-.32.98.18.7.63z" />
                            </svg>
                            {unreadMessages > 0 && (
                                <span className="pill-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                            )}
                        </Link>

                        {/* Notifications */}
                        <Link href="/hub/notifications" className="icon-btn-pill">
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                            </svg>
                            {notificationCount > 0 && (
                                <span className="pill-badge">{notificationCount > 99 ? '99+' : notificationCount}</span>
                            )}
                        </Link>

                        {/* Settings */}
                        <Link href="/hub/settings" className="icon-btn-pill">
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                            </svg>
                        </Link>

                        {/* Help */}
                        <button
                            onClick={() => liveHelp.setIsOpen(true)}
                            className="icon-btn-pill"
                            aria-label="Live Help"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.85)" strokeWidth="2" fill="none" />
                                <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="bold" fill="rgba(255,255,255,0.85)">?</text>
                            </svg>
                        </button>
                    </div>
                </div>
            </header>
        </>
    );
}
