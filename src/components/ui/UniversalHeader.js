/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNIVERSAL HEADER COMPONENT — Hub-Style Dark Theme
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Matches the Hub page header style:
 * - Dark background with neon blue accents
 * - "Smarter.Poker" in white text 
 * - Diamond wallet with +
 * - XP display with level
 * - Neon orb icons for profile, messages, notifications, search, settings
 * - Return to Hub button (for major pages) or Back button (for nested pages)
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getAuthUser, queryProfiles } from '../../lib/authUtils';

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

    useEffect(() => {
        const loadUser = async () => {
            const authUser = getAuthUser();
            if (authUser) {
                setUser(authUser);
                try {
                    const profile = await queryProfiles(authUser.id, 'username,full_name,avatar_url,xp_total,diamond_balance');
                    if (profile) {
                        const xp = profile.xp_total || 0;
                        const level = Math.floor(xp / 100) + 1;
                        setStats({
                            xp: xp % 100,
                            diamonds: profile.diamond_balance || 0,
                            level
                        });
                        setUser(prev => ({ ...prev, avatar: profile.avatar_url, name: profile.full_name || profile.username }));
                    }
                } catch (e) {
                    console.error('[Header] Profile fetch error:', e);
                }
            }
        };
        loadUser();
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
            background: C.bg,
            padding: '8px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `1px solid ${C.border}`,
            position: 'sticky',
            top: 0,
            zIndex: 100
        }}>
            {/* LEFT: Back/Hub Button + "Smarter.Poker" */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Navigation Button */}
                <button
                    onClick={pageDepth > 1 ? handleBack : () => router.push('/hub')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 14px',
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, rgba(0, 136, 255, 0.2) 0%, rgba(0, 102, 204, 0.3) 100%)',
                        border: '1px solid rgba(0, 136, 255, 0.4)',
                        color: C.white,
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,136,255,0.2)',
                        transition: 'all 0.2s'
                    }}
                >
                    <span style={{ fontSize: 16 }}>←</span>
                    {pageDepth > 1 ? 'Back' : 'Hub'}
                </button>

                {/* Smarter.Poker text */}
                <span style={{
                    color: C.white,
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: 0.5
                }}>
                    Smarter.Poker
                </span>
            </div>

            {/* CENTER: Diamond Wallet + XP */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Diamond Wallet */}
                <Link href="/hub/diamond-store" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 100, 150, 0.2) 100%)',
                    border: '1px solid rgba(0, 212, 255, 0.4)',
                    padding: '6px 14px',
                    borderRadius: 20,
                    textDecoration: 'none',
                    color: C.white
                }}>
                    <span style={{ fontSize: 16 }}>💎</span>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{stats.diamonds.toLocaleString()}</span>
                    <span style={{
                        width: 18, height: 18, borderRadius: '50%',
                        background: 'rgba(0, 212, 255, 0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, marginLeft: 4
                    }}>+</span>
                </Link>

                {/* XP + Level */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '6px 14px',
                    borderRadius: 20
                }}>
                    <span style={{ color: C.gold, fontWeight: 700, fontSize: 14 }}>XP</span>
                    <span style={{ color: C.white, fontWeight: 600, fontSize: 14 }}>{stats.xp}</span>
                    <span style={{ color: C.textSec, fontSize: 12 }}>•</span>
                    <span style={{ color: C.cyan, fontWeight: 700, fontSize: 14 }}>LV {stats.level}</span>
                </div>
            </div>

            {/* RIGHT: Orb Icons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Avatar/Profile */}
                <Link href="/hub/profile" style={{ textDecoration: 'none' }}>
                    <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: user?.avatar
                            ? `url(${user.avatar}) center/cover`
                            : 'linear-gradient(135deg, rgba(0, 136, 255, 0.3) 0%, rgba(0, 245, 255, 0.15) 100%)',
                        border: '2px solid rgba(0, 245, 255, 0.5)',
                        boxShadow: '0 0 15px rgba(0, 245, 255, 0.3), inset 0 0 10px rgba(0, 245, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20
                    }}>
                        {!user?.avatar && '👤'}
                    </div>
                </Link>

                {/* Messages */}
                <OrbButton href="/hub/messenger" icon="✉️" />

                {/* Notifications */}
                <OrbButton href="/hub/notifications" icon="🔔" />

                {/* Search */}
                {showSearch && (
                    <OrbButton onClick={onSearchClick} icon="🔍" />
                )}

                {/* Settings */}
                <OrbButton href="/hub/settings" icon="⚙️" />
            </div>
        </header>
    );
}
