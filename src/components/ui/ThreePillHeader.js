/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 3-PILL HEADER COMPONENT — Dynamic Image with Overlay Buttons
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Uses the user's exact image as an <img> element (NOT background-image)
 * with interactive buttons absolutely positioned ON TOP of the image.
 * 
 * Layout (percentage-based for responsive positioning):
 * - Pill 1 (Left ~5%-22%): Hamburger Menu + Hub/Back Arrow
 * - Pill 2 (Center ~28%-72%): "Smarter.Poker" + Diamond Wallet  
 * - Pill 3 (Right ~78%-95%): Profile + Message + Notification + Settings + Help
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useLiveHelp } from '../../world/components/Geeves';

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
        <header style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            width: '100%'
        }}>
            {/* CONTAINER - positions everything relative to the image */}
            <div style={{ position: 'relative', width: '100%' }}>

                {/* THE ACTUAL IMAGE - not a background */}
                <img
                    src="/images/three-pill-header-bar.png"
                    alt="Header"
                    style={{
                        width: '100%',
                        height: 'auto',
                        display: 'block'
                    }}
                />

                {/* ═══════════════════════════════════════════════════════════════
                    PILL 1: LEFT (Navigation) - Positioned over left pill
                    ═══════════════════════════════════════════════════════════════ */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '5%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    {onMenuClick && (
                        <button
                            onClick={onMenuClick}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                padding: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#00d4ff'
                            }}
                            aria-label="Open menu"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <line x1="3" y1="18" x2="21" y2="18" />
                            </svg>
                        </button>
                    )}
                    <button
                        onClick={pageDepth > 1 ? handleBack : () => router.push('/hub')}
                        style={{
                            background: 'rgba(0, 136, 255, 0.12)',
                            border: '1px solid rgba(0, 180, 255, 0.25)',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: 'white',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer'
                        }}
                    >
                        <span>←</span>
                        <span>{pageDepth > 1 ? 'Back' : 'Hub'}</span>
                    </button>
                </div>

                {/* ═══════════════════════════════════════════════════════════════
                    PILL 2: CENTER (Brand + Wallet) - Positioned over center pill
                    ═══════════════════════════════════════════════════════════════ */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px'
                }}>
                    <span style={{
                        color: 'white',
                        fontSize: '17px',
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                        whiteSpace: 'nowrap',
                        textShadow: '0 0 10px rgba(0, 200, 255, 0.3)'
                    }}>
                        Smarter.Poker
                    </span>
                    <Link href="/hub/diamond-store" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'rgba(0, 212, 255, 0.1)',
                        border: '1px solid rgba(0, 212, 255, 0.35)',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        textDecoration: 'none',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '14px'
                    }} onClick={(e) => {
                        if (stats.diamonds >= 1000) {
                            e.preventDefault();
                            setShowFullDiamonds(!showFullDiamonds);
                        }
                    }}>
                        <span>💎</span>
                        <span title={stats.diamonds.toLocaleString() + ' diamonds'}>
                            {showFullDiamonds ? stats.diamonds.toLocaleString() : formatCompact(stats.diamonds)}
                        </span>
                        <span style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            background: 'rgba(0, 212, 255, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 700
                        }}>+</span>
                    </Link>
                </div>

                {/* ═══════════════════════════════════════════════════════════════
                    PILL 3: RIGHT (Icons) - Positioned over right pill
                    ═══════════════════════════════════════════════════════════════ */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    right: '5%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}>
                    {/* Profile */}
                    <Link href="/hub/profile" style={{ textDecoration: 'none' }}>
                        <div style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            border: '2px solid rgba(0, 245, 255, 0.4)',
                            boxShadow: '0 0 6px rgba(0, 245, 255, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            cursor: 'pointer',
                            background: user?.avatar
                                ? `url(${user.avatar}) center/cover`
                                : 'linear-gradient(135deg, rgba(0, 136, 255, 0.3) 0%, rgba(0, 245, 255, 0.15) 100%)'
                        }}>
                            {!user?.avatar && '👤'}
                        </div>
                    </Link>

                    {/* Messages */}
                    <Link href="/hub/messenger" style={{
                        width: '30px',
                        height: '30px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        position: 'relative',
                        background: 'transparent',
                        border: 'none'
                    }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,0.85)">
                            <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.07.36-.09.53-.05.86.23 1.81.36 2.9.36 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm6.07 7.56l-2.96 4.69c-.47.75-1.48.93-2.18.38l-2.35-1.76a.75.75 0 00-.9 0l-3.17 2.41c-.42.32-.98-.18-.7-.63l2.96-4.69c.47-.75 1.48-.93 2.18-.38l2.35 1.76c.27.2.65.2.9 0l3.17-2.41c.42-.32.98.18.7.63z" />
                        </svg>
                        {unreadMessages > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: '-2px',
                                right: '-2px',
                                background: '#e41e3f',
                                color: 'white',
                                borderRadius: '8px',
                                padding: '1px 4px',
                                fontSize: '9px',
                                fontWeight: 700,
                                minWidth: '14px',
                                textAlign: 'center'
                            }}>{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                        )}
                    </Link>

                    {/* Notifications */}
                    <Link href="/hub/notifications" style={{
                        width: '30px',
                        height: '30px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        position: 'relative',
                        background: 'transparent',
                        border: 'none'
                    }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,0.85)">
                            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                        </svg>
                        {notificationCount > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: '-2px',
                                right: '-2px',
                                background: '#e41e3f',
                                color: 'white',
                                borderRadius: '8px',
                                padding: '1px 4px',
                                fontSize: '9px',
                                fontWeight: 700,
                                minWidth: '14px',
                                textAlign: 'center'
                            }}>{notificationCount > 99 ? '99+' : notificationCount}</span>
                        )}
                    </Link>

                    {/* Settings */}
                    <Link href="/hub/settings" style={{
                        width: '30px',
                        height: '30px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        background: 'transparent',
                        border: 'none'
                    }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,0.85)">
                            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                        </svg>
                    </Link>

                    {/* Help */}
                    <button
                        onClick={() => liveHelp.setIsOpen(true)}
                        style={{
                            width: '30px',
                            height: '30px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            background: 'transparent',
                            border: 'none',
                            padding: 0
                        }}
                        aria-label="Live Help"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.85)" strokeWidth="2" fill="none" />
                            <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="bold" fill="rgba(255,255,255,0.85)">?</text>
                        </svg>
                    </button>
                </div>
            </div>
        </header>
    );
}
