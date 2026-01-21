/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNIVERSAL HEADER COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Consistent header for all hub pages with:
 * - Hub button / Back navigation
 * - XP display
 * - Diamond wallet (+ links to store)
 * - Messages, Settings, Notifications
 * - Profile avatar
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

// Avatar component inline to avoid import issues
const Avatar = ({ src, name, size = 40 }) => {
    const initials = name ? name.charAt(0).toUpperCase() : '?';
    return src ? (
        <img
            src={src}
            alt={name || 'Avatar'}
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid #0088ff'
            }}
        />
    ) : (
        <div style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #0088ff 0%, #0066cc 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 700,
            fontSize: size * 0.4
        }}>
            {initials}
        </div>
    );
};

// Unread badge component
const UnreadBadge = ({ count, size = 'normal' }) => {
    if (!count || count <= 0) return null;
    const badgeSize = size === 'small' ? 16 : 20;
    return (
        <span style={{
            position: 'absolute',
            top: -2,
            right: -2,
            background: 'red',
            color: 'white',
            borderRadius: '50%',
            width: badgeSize,
            height: badgeSize,
            fontSize: size === 'small' ? 10 : 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid white'
        }}>
            {count > 99 ? '99+' : count}
        </span>
    );
};

export default function UniversalHeader({
    pageTitle,
    showBackButton = true,
    backHref = null, // null = use browser history, string = specific path
    user = null,
    xp = 0,
    diamonds = 0,
    unreadMessages = 0,
    unreadNotifications = 0
}) {
    const router = useRouter();
    const [userData, setUserData] = useState(user);
    const [stats, setStats] = useState({ xp, diamonds });
    const [notifications, setNotifications] = useState({ messages: unreadMessages, alerts: unreadNotifications });

    // Fetch user data if not provided
    useEffect(() => {
        if (!userData) {
            const fetchUser = async () => {
                try {
                    const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                    if (sbKeys.length > 0) {
                        const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
                        if (tokenData?.user) {
                            const { data: profile } = await supabase
                                .from('profiles')
                                .select('username, full_name, avatar_url, xp_total, diamond_balance')
                                .eq('id', tokenData.user.id)
                                .maybeSingle();

                            if (profile) {
                                setUserData({
                                    id: tokenData.user.id,
                                    name: profile.full_name || profile.username || 'Player',
                                    avatar: profile.avatar_url
                                });
                                setStats({
                                    xp: profile.xp_total || 0,
                                    diamonds: profile.diamond_balance || 0
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.error('[UniversalHeader] Error fetching user:', e);
                }
            };
            fetchUser();
        }
    }, [userData]);

    const handleBack = () => {
        if (backHref) {
            router.push(backHref);
        } else if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
        } else {
            router.push('/hub');
        }
    };

    const C = {
        bg: '#0a0a0f',
        card: '#1a1a24',
        border: '#2a2a3a',
        blue: '#0088ff',
        gold: '#ffd700',
        cyan: '#00d4ff'
    };

    return (
        <header style={{
            background: C.card,
            padding: '8px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `1px solid ${C.border}`,
            position: 'sticky',
            top: 0,
            zIndex: 100
        }}>
            {/* LEFT: Back/Hub Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {showBackButton && (
                    <button
                        onClick={handleBack}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 14px',
                            borderRadius: 8,
                            background: 'linear-gradient(135deg, #0088ff 0%, #0066cc 100%)',
                            color: 'white',
                            fontWeight: 600,
                            fontSize: 14,
                            border: 'none',
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,136,255,0.3)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <span style={{ fontSize: 16 }}>←</span>
                        {backHref === '/hub' || !backHref ? 'Hub' : 'Back'}
                    </button>
                )}
                {pageTitle && (
                    <span style={{ color: 'white', fontWeight: 600, fontSize: 16, marginLeft: 8 }}>
                        {pageTitle}
                    </span>
                )}
            </div>

            {/* CENTER: XP and Diamond Wallet */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* XP Display */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'linear-gradient(135deg, #ffd700 0%, #ffb800 100%)',
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontWeight: 700,
                    fontSize: 13,
                    color: '#1a1a1a'
                }}>
                    <span>⭐</span>
                    <span>{stats.xp.toLocaleString()}</span>
                </div>

                {/* Diamond Wallet */}
                <Link href="/hub/diamond-store" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontWeight: 700,
                    fontSize: 13,
                    color: 'white',
                    textDecoration: 'none'
                }}>
                    <span>💎</span>
                    <span>{stats.diamonds.toLocaleString()}</span>
                    <span style={{ fontSize: 12, opacity: 0.8, marginLeft: 2 }}>+</span>
                </Link>
            </div>

            {/* RIGHT: Messages, Settings, Notifications, Profile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Messages */}
                <Link href="/hub/messenger" style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: '#2a2a3a',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                    position: 'relative'
                }}>
                    💬
                    <UnreadBadge count={notifications.messages} size="small" />
                </Link>

                {/* Settings */}
                <Link href="/hub/settings" style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: '#2a2a3a',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none'
                }}>
                    ⚙️
                </Link>

                {/* Notifications */}
                <Link href="/hub/notifications" style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: '#2a2a3a',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                    position: 'relative'
                }}>
                    🔔
                    <UnreadBadge count={notifications.alerts} size="small" />
                </Link>

                {/* Profile */}
                <Link href="/hub/profile" style={{ display: 'block' }}>
                    <Avatar src={userData?.avatar} name={userData?.name} size={40} />
                </Link>
            </div>
        </header>
    );
}
