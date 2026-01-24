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

    useEffect(() => {
        let notifChannel = null;
        let messageChannel = null;

        const loadUser = async () => {
            try {
                // Use Supabase client directly for reliable auth
                const { data: { user: authUser } } = await supabase.auth.getUser();

                if (authUser) {
                    setUser(authUser);

                    // Fetch profile data (XP, avatar, name)
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('username, full_name, avatar_url, xp_total')
                        .eq('id', authUser.id)
                        .single();

                    // Fetch diamond balance from user_diamond_balance table
                    const { data: diamondData } = await supabase
                        .from('user_diamond_balance')
                        .select('balance')
                        .eq('user_id', authUser.id)
                        .single();

                    const diamondBalance = diamondData?.balance || 0;

                    if (profile) {
                        const xpTotal = profile.xp_total || 0;
                        // Level formula: Level 55 at 700k XP → level = floor(sqrt(xp / 231))
                        const level = Math.max(1, Math.floor(Math.sqrt(xpTotal / 231)));

                        setStats({
                            xp: xpTotal,
                            diamonds: diamondBalance,
                            level
                        });
                        setUser(prev => ({
                            ...prev,
                            avatar: profile.avatar_url,
                            name: profile.full_name || profile.username
                        }));
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
                    <span style={{ color: C.white, fontWeight: 600, fontSize: 14 }}>{stats.xp.toLocaleString()}</span>
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
                <OrbButton href="/hub/messenger" icon="✉️" badge={unreadMessages} />

                {/* Notifications */}
                <OrbButton href="/hub/notifications" icon="🔔" badge={notificationCount} />

                {/* Push Notification Bell */}
                <PushNotificationBell />

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
