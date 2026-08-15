/**
 * 🔔 REAL-TIME NOTIFICATION FEED
 * src/components/social/NotificationFeed.jsx
 * 
 * Fetches real notifications from Supabase and renders them with
 * mark-as-read, filtering, and real-time subscription.
 * 
 * BUG FIXES:
 * - Replaced risky SQL string interpolation with safe separate queries
 * - Removed broken FK join (profiles! syntax) — uses separate profiles fetch
 * - Removed dependency on non-existent `read` column — uses local state
 * 
 * SAFETY: This is a NEW file — no existing code is modified.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { getAuthUser } from '../../lib/authUtils';
import { eventBus, EventType, busEmit } from '../../engine/EventBus';
import { isNotificationEnabled } from './NotificationPreferences';
import toast from '../../stores/toastStore';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', blueLight: '#EBF5FF',
};

const NOTIF_TYPES = {
    like: { icon: '👍', color: '#1877F2', label: 'liked your post' },
    love: { icon: '❤️', color: '#F33E58', label: 'loved your post' },
    haha: { icon: '😂', color: '#F7B928', label: 'reacted to your post' },
    wow: { icon: '😮', color: '#F7B928', label: 'reacted to your post' },
    sad: { icon: '😢', color: '#F7B928', label: 'reacted to your post' },
    angry: { icon: '😡', color: '#E9710F', label: 'reacted to your post' },
    comment: { icon: '💬', color: '#31A24C', label: 'commented on your post' },
    share: { icon: '↗️', color: '#F7B928', label: 'shared your post' },
    bookmark: { icon: '🔖', color: '#7C3AED', label: 'saved your post' },
    friend_request: { icon: '👤', color: '#1877F2', label: 'sent you a friend request' },
    follow: { icon: '👥', color: '#31A24C', label: 'started following you' },
    mention: { icon: '@', color: '#1877F2', label: 'mentioned you' },
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

export default function NotificationFeed({ onClose, onNavigate }) {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [readIds, setReadIds] = useState(new Set());
    const subRef = useRef(null);
    const ownPostIdsRef = useRef(new Set());

    const loadNotifications = useCallback(async () => {
        try {
            const user = getAuthUser();
            if (!user) { setLoading(false); return; }

            // Step 1: Get own post IDs
            const { data: ownPosts } = await supabase
                .from('social_posts')
                .select('id')
                .eq('author_id', user.id)
                .limit(200);

            const ownPostIds = ownPosts ? ownPosts.map(p => p.id) : [];
            ownPostIdsRef.current = new Set(ownPostIds);

            if (ownPostIds.length === 0) {
                setNotifications([]);
                setLoading(false);
                return;
            }

            // Step 2: Fetch interactions on OWN posts (not by self)
            const { data: interactions, error } = await supabase
                .from('social_interactions')
                .select('id, interaction_type, created_at, post_id, user_id')
                .in('post_id', ownPostIds)
                .neq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error || !interactions?.length) {
                setNotifications([]);
                setLoading(false);
                return;
            }

            // Step 3: Fetch actor profiles
            const actorIds = [...new Set(interactions.map(i => i.user_id).filter(Boolean))];
            let profileMap = {};
            if (actorIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .in('id', actorIds);
                if (profiles) {
                    profiles.forEach(p => { profileMap[p.id] = p; });
                }
            }

            // Step 4: Format notifications
            const notifs = interactions.map(row => {
                const profile = profileMap[row.user_id];
                return {
                    id: row.id,
                    type: row.interaction_type || 'like',
                    time: row.created_at,
                    postId: row.post_id,
                    actorName: profile?.full_name || profile?.username || 'Someone',
                    avatar: profile?.avatar_url || '/default-avatar.png',
                };
            });

            setNotifications(notifs);

            // Emit count for badge
            busEmit.notificationCountUpdated?.(notifs.length);
        } catch (err) {
            console.warn('Notification load error:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadNotifications();

        // Real-time subscription for new interactions
        const user = getAuthUser();
        if (user) {
            subRef.current = supabase
                .channel('notif-feed-' + user.id)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'social_interactions',
                }, (payload) => {
                    // 2026-08-15 audit: scope realtime to MY posts — the raw
                    // subscription notified users about strangers liking
                    // strangers' posts platform-wide.
                    if (payload.new && !ownPostIdsRef.current.has(payload.new.post_id)) return;
                    if (payload.new && payload.new.user_id !== user.id) {
                        const newNotif = {
                            id: payload.new.id,
                            type: payload.new.interaction_type || 'like',
                            time: payload.new.created_at,
                            postId: payload.new.post_id,
                            actorName: 'Someone',
                            avatar: '/default-avatar.png',
                        };
                        // Check user preferences before adding
                        const prefKey = mapInteractionToPreference(newNotif.type);
                        if (isNotificationEnabled(prefKey)) {
                            setNotifications(prev => [newNotif, ...prev]);

                            // Async enrich: fetch actor profile and update name/avatar
                            if (payload.new.user_id) {
                                supabase
                                    .from('profiles')
                                    .select('id, username, full_name, avatar_url')
                                    .eq('id', payload.new.user_id)
                                    .maybeSingle()
                                    .then(({ data: profile }) => {
                                        if (profile) {
                                            setNotifications(prev => prev.map(n =>
                                                n.id === newNotif.id
                                                    ? { ...n, actorName: profile.full_name || profile.username || 'Someone', avatar: profile.avatar_url || '/default-avatar.png' }
                                                    : n
                                            ));
                                        }
                                    })
                                    .catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
                            }
                        }
                    }
                })
                .subscribe();
        }

        // Listen for EventBus events
        let likeDebounce = null;
        const unsubPost = eventBus.on(EventType.SOCIAL_POST_LIKED, () => {
            // Debounced reload
            if (likeDebounce) clearTimeout(likeDebounce);
            likeDebounce = setTimeout(() => {
                loadNotifications();
                likeDebounce = null;
            }, 2000);
        });

        return () => {
            if (subRef.current) {
                supabase.removeChannel(subRef.current);
                subRef.current = null;
            }
            unsubPost?.();
            if (likeDebounce) clearTimeout(likeDebounce);
        };
    }, [loadNotifications]);

    const handleMarkAllRead = () => {
        const count = notifications.filter(n => !readIds.has(n.id)).length;
        setReadIds(new Set(notifications.map(n => n.id)));
        busEmit.notificationsRead?.(count);
        if (count > 0) toast.success(`${count} notification${count === 1 ? '' : 's'} marked as read`);
    };

    const handleNotifClick = (notif) => {
        if (!readIds.has(notif.id)) {
            setReadIds(prev => new Set([...prev, notif.id]));
        }
        // Navigate to the post if a handler is provided
        if (onNavigate && notif.postId) {
            onNavigate(notif.postId);
        }
    };

    const isRead = (id) => readIds.has(id);

    const filteredNotifs = filter === 'unread'
        ? notifications.filter(n => !isRead(n.id))
        : notifications;

    const unreadCount = notifications.filter(n => !isRead(n.id)).length;

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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 16px' }}>
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#E4E6EB', flexShrink: 0, animation: 'notifShimmer 1.5s infinite' }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ width: `${55 + i * 10}%`, height: 12, borderRadius: 6, background: '#E4E6EB', marginBottom: 6, animation: 'notifShimmer 1.5s infinite' }} />
                                    <div style={{ width: `${25 + i * 5}%`, height: 10, borderRadius: 5, background: '#E4E6EB', animation: 'notifShimmer 1.5s infinite' }} />
                                </div>
                            </div>
                        ))}
                        <style>{`@keyframes notifShimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
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
                        const read = isRead(notif.id);
                        return (
                            <div
                                key={notif.id}
                                onClick={() => handleNotifClick(notif)}
                                style={{
                                    display: 'flex', gap: 10, padding: '10px 16px',
                                    cursor: 'pointer', transition: 'background 0.15s',
                                    background: read ? 'transparent' : C.blueLight,
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = read ? C.bg : '#DCE9F7'}
                                onMouseLeave={e => e.currentTarget.style.background = read ? 'transparent' : C.blueLight}
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
                                        color: read ? C.textSec : C.blue,
                                        fontWeight: read ? 400 : 600
                                    }}>
                                        {timeAgo(notif.time)}
                                    </div>
                                </div>
                                {!read && (
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

function mapInteractionToPreference(type) {
    const map = {
        like: 'likes', love: 'likes', haha: 'likes', wow: 'likes',
        sad: 'likes', angry: 'likes', comment: 'comments',
        share: 'likes', follow: 'followers', friend_request: 'friendRequests',
        mention: 'mentions',
    };
    return map[type] || 'likes';
}
