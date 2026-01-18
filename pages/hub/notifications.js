/**
 * NOTIFICATIONS PAGE
 * Full-page view of all user notifications
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { supabase } from '../../src/lib/supabase';

// God-Mode Stack
import { useNotificationsStore } from '../../src/stores/notificationsStore';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', green: '#42B72A', red: '#E4405F',
};

const timeAgo = (date) => {
    if (!date) return '';
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
};

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);

    useEffect(() => {
        const fetchNotifications = async () => {
            const { data: { user: au } } = await supabase.auth.getUser();
            if (au) {
                setUser(au);
                const { data } = await supabase
                    .from('notifications')
                    .select('*')
                    .eq('user_id', au.id)
                    .order('created_at', { ascending: false })
                    .limit(50);
                if (data) setNotifications(data);
            }
            setLoading(false);
        };
        fetchNotifications();
    }, []);

    const markAsRead = async (id) => {
        await supabase.from('notifications').update({ read: true }).eq('id', id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const markAllAsRead = async () => {
        if (!user) return;
        await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Loading...
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Notifications | Smarter.Poker</title>
                <meta name="viewport" content="width=800, user-scalable=no" />
                <style>{`
                    .notifications-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .notifications-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .notifications-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .notifications-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .notifications-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .notifications-page { zoom: 1.5; } }
                `}</style>
            </Head>
            <div className="notifications-page" style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                {/* Header */}
                <header style={{ background: C.card, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Link href="/hub/social-media" style={{ color: C.textSec, textDecoration: 'none', fontSize: 24 }}>←</Link>
                        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>Notifications</h1>
                        {unreadCount > 0 && (
                            <span style={{
                                background: C.red, color: 'white', borderRadius: 12,
                                padding: '2px 8px', fontSize: 12, fontWeight: 600
                            }}>{unreadCount}</span>
                        )}
                    </div>
                    {unreadCount > 0 && (
                        <button
                            onClick={markAllAsRead}
                            style={{
                                background: 'none', border: 'none', color: C.blue,
                                fontSize: 14, fontWeight: 600, cursor: 'pointer'
                            }}
                        >Mark all as read</button>
                    )}
                </header>

                {/* Notifications List */}
                <div style={{ maxWidth: 680, margin: '0 auto' }}>
                    {notifications.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center' }}>
                            <div style={{ fontSize: 48 }}>🔔</div>
                            <h3 style={{ color: C.text, marginTop: 16 }}>No notifications yet</h3>
                            <p style={{ color: C.textSec }}>When someone likes, comments, or tags you, you'll see it here.</p>
                        </div>
                    ) : (
                        notifications.map(n => (
                            <div
                                key={n.id}
                                onClick={() => !n.read && markAsRead(n.id)}
                                style={{
                                    padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
                                    background: n.read ? C.card : 'rgba(24, 119, 242, 0.05)',
                                    borderBottom: `1px solid ${C.border}`, cursor: 'pointer'
                                }}
                            >
                                <div style={{
                                    width: 56, height: 56, borderRadius: '50%',
                                    background: n.type === 'like' ? '#ff6b6b' : n.type === 'comment' ? C.blue : n.type === 'mention' ? '#7c3aed' : n.type === 'friend_request' ? C.green : n.type === 'new_follow' ? '#ec4899' : n.type === 'friend_accepted' ? C.green : C.textSec,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 24, flexShrink: 0
                                }}>
                                    {n.type === 'like' ? '👍' : n.type === 'comment' ? '💬' : n.type === 'mention' ? '@' : n.type === 'friend_request' ? '👥' : n.type === 'friend_accepted' ? '✓' : n.type === 'new_follow' ? '💜' : '🔔'}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: 15, color: C.text }}>{n.title}</div>
                                    <div style={{ fontSize: 14, color: C.textSec, marginTop: 4 }}>{n.message}</div>
                                    <div style={{ fontSize: 12, color: C.blue, marginTop: 6 }}>{timeAgo(n.created_at)}</div>
                                </div>
                                {!n.read && (
                                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: C.blue, flexShrink: 0, marginTop: 8 }} />
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Bottom padding for mobile nav */}
                <div style={{ height: 80 }} />
            </div>
        </>
    );
}
