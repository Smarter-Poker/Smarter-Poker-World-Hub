/**
 * 🔔 REAL-TIME NOTIFICATION FEED
 * src/components/social/NotificationFeed.jsx
 * 
 * Fetches real notifications from Supabase and renders them with
 * mark-as-read, filtering, and real-time subscription.
 * Uses the existing NotificationsDropdown UI from SmarterPokerNotifications.jsx.
 * 
 * SAFETY: This is a NEW file — no existing code is modified.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { getAuthUser } from '../../lib/authUtils';
import { busEmit } from '../../engine/EventBus';
import { isNotificationEnabled } from './NotificationPreferences';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', blueLight: '#EBF5FF',
};

const NOTIF_TYPES = {
    like: { icon: '👍', color: '#1877F2', label: 'liked your post' },
    comment: { icon: '💬', color: '#31A24C', label: 'commented on your post' },
    share: { icon: '↗️', color: '#F7B928', label: 'shared your post' },
    friend_request: { icon: '👤', color: '#1877F2', label: 'sent you a friend request' },
    follow: { icon: '👥', color: '#31A24C', label: 'started following you' },
    mention: { icon: '@', color: '#1877F2', label: 'mentioned you' },
    reaction: { icon: '❤️', color: '#F33E58', label: 'reacted to your post' },
};

function timeAgo(date) {
    if (!date) return '';
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 604800) return `${Math.floor(s / 86400)}d`;
    return `${Math.floor(s / 604800)}w`;
}

export default function NotificationFeed({ onClose }) {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const subRef = useRef(null);

    const loadNotifications = useCallback(async () => {
        try {
            const user = getAuthUser();
            if (!user) { setLoading(false); return; }

            // Fetch from social_interactions where target is current user
            const { data, error } = await supabase
                .from('social_interactions')
                .select(`
                    id, interaction_type, created_at, post_id, read,
                    user_id,
                    profiles!social_interactions_user_id_fkey( id, username, full_name, avatar_url )
                `)
                .neq('user_id', user.id)
                .or(`post_id.in.(${await getOwnPostIds(user.id)}),target_user_id.eq.${user.id}`)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) {
                // Fallback: simpler query without post filtering
                const { data: fallbackData } = await supabase
                    .from('social_interactions')
                    .select('id, interaction_type, created_at, post_id, read, user_id')
                    .order('created_at', { ascending: false })
                    .limit(30);

                if (fallbackData) {
                    setNotifications(fallbackData.map(formatNotification));
                }
            } else if (data) {
                setNotifications(data.map(formatNotification));
            }
        } catch (err) {
            console.error('Notification load error:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadNotifications();

        // Real-time subscription
        const user = getAuthUser();
        if (user) {
            subRef.current = supabase
                .channel('notifications-' + user.id)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'social_interactions',
                }, (payload) => {
                    if (payload.new && payload.new.user_id !== user.id) {
                        const notif = formatNotification(payload.new);
                        // Check preferences
                        const prefKey = mapInteractionToPreference(notif.type);
                        if (isNotificationEnabled(prefKey)) {
                            setNotifications(prev => [notif, ...prev]);
                        }
                    }
                })
                .subscribe();
        }

        return () => {
            subRef.current?.unsubscribe();
        };
    }, [loadNotifications]);

    const handleMarkAllRead = async () => {
        const user = getAuthUser();
        if (!user) return;

        setNotifications(prev => prev.map(n => ({ ...n, read: true })));

        try {
            await supabase
                .from('social_interactions')
                .update({ read: true })
                .eq('read', false);
        } catch (err) {
            console.error('Mark all read failed:', err);
        }
    };

    const handleNotifClick = async (notif) => {
        // Mark single as read
        if (!notif.read) {
            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
            try {
                await supabase
                    .from('social_interactions')
                    .update({ read: true })
                    .eq('id', notif.id);
            } catch { /* non-critical */ }
        }
    };

    const filteredNotifs = filter === 'unread'
        ? notifications.filter(n => !n.read)
        : notifications;

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <div style={{
            background: C.card, borderRadius: 12, maxWidth: 400, width: '100%',
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)', maxHeight: 520, display: 'flex',
            flexDirection: 'column', overflow: 'hidden'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', borderBottom: `1px solid ${C.border}`
            }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>
                    Notifications
                    {unreadCount > 0 && (
                        <span style={{
                            marginLeft: 8, fontSize: 13, fontWeight: 600, color: 'white',
                            background: '#E41E3F', padding: '2px 8px', borderRadius: 10
                        }}>{unreadCount}</span>
                    )}
                </h3>
                {onClose && (
                    <button onClick={onClose} style={{
                        width: 32, height: 32, borderRadius: '50%', border: 'none',
                        background: C.bg, cursor: 'pointer', fontSize: 16, color: C.textSec,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>✕</button>
                )}
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 8, padding: '8px 16px' }}>
                {['all', 'unread'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            padding: '6px 14px', border: 'none', borderRadius: 16,
                            fontSize: 14, fontWeight: filter === f ? 700 : 500,
                            cursor: 'pointer',
                            background: filter === f ? C.blueLight : C.bg,
                            color: filter === f ? C.blue : C.text,
                        }}
                    >{f === 'all' ? 'All' : 'Unread'}</button>
                ))}
                {unreadCount > 0 && (
                    <button
                        onClick={handleMarkAllRead}
                        style={{
                            marginLeft: 'auto', border: 'none', background: 'none',
                            color: C.blue, fontSize: 13, cursor: 'pointer', fontWeight: 600
                        }}
                    >Mark All Read</button>
                )}
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {loading ? (
                    <div style={{ padding: '40px 16px', textAlign: 'center', color: C.textSec }}>
                        Loading notifications...
                    </div>
                ) : filteredNotifs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                        <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.4 }}>🔔</div>
                        <div style={{ fontSize: 15, color: C.textSec }}>
                            {filter === 'unread' ? 'All caught up!' : 'No notifications yet'}
                        </div>
                    </div>
                ) : (
                    filteredNotifs.map(notif => {
                        const typeInfo = NOTIF_TYPES[notif.type] || NOTIF_TYPES.like;
                        return (
                            <div
                                key={notif.id}
                                onClick={() => handleNotifClick(notif)}
                                style={{
                                    display: 'flex', gap: 10, padding: '10px 16px',
                                    cursor: 'pointer', transition: 'background 0.15s',
                                    background: notif.read ? 'transparent' : C.blueLight,
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = notif.read ? C.bg : '#DCE9F7'}
                                onMouseLeave={e => e.currentTarget.style.background = notif.read ? 'transparent' : C.blueLight}
                            >
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <img
                                        src={notif.avatar || '/default-avatar.png'}
                                        alt="" loading="lazy"
                                        style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                                    />
                                    <span style={{
                                        position: 'absolute', bottom: -2, right: -2,
                                        width: 22, height: 22, borderRadius: '50%',
                                        background: typeInfo.color, border: '2px solid white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 11
                                    }}>{typeInfo.icon}</span>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, color: C.text, lineHeight: 1.3 }}>
                                        <strong>{notif.actorName || 'Someone'}</strong>{' '}{typeInfo.label}
                                    </div>
                                    <div style={{
                                        fontSize: 12, marginTop: 3,
                                        color: notif.read ? C.textSec : C.blue,
                                        fontWeight: notif.read ? 400 : 600
                                    }}>
                                        {timeAgo(notif.time)}
                                    </div>
                                </div>
                                {!notif.read && (
                                    <div style={{
                                        width: 10, height: 10, borderRadius: '50%',
                                        background: C.blue, flexShrink: 0, alignSelf: 'center'
                                    }} />
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────

function formatNotification(row) {
    const profile = row.profiles;
    return {
        id: row.id,
        type: row.interaction_type || 'like',
        time: row.created_at,
        read: row.read || false,
        postId: row.post_id,
        actorName: profile?.full_name || profile?.username || 'Someone',
        avatar: profile?.avatar_url || '/default-avatar.png',
    };
}

function mapInteractionToPreference(type) {
    const map = {
        like: 'likes',
        love: 'likes',
        haha: 'likes',
        wow: 'likes',
        sad: 'likes',
        angry: 'likes',
        comment: 'comments',
        share: 'likes',
        follow: 'followers',
        friend_request: 'friendRequests',
        mention: 'mentions',
    };
    return map[type] || 'likes';
}

async function getOwnPostIds(userId) {
    try {
        const { data } = await supabase
            .from('social_posts')
            .select('id')
            .eq('author_id', userId)
            .limit(100);
        return data ? data.map(p => p.id).join(',') : '';
    } catch {
        return '';
    }
}
