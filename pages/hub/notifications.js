/**
 * NOTIFICATIONS PAGE
 * Full-page view of all user notifications
 */

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { supabase } from '../../src/lib/supabase';

// God-Mode Stack
import { useNotificationsStore } from '../../src/stores/notificationsStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

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
    const router = useRouter();
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
                if (data && data.length > 0) {
                    // Collect actor IDs from the data JSONB column
                    const actorIds = [...new Set(data.map(n =>
                        n.data?.actor_id || n.data?.sender_id || n.actor_id
                    ).filter(Boolean))];

                    // Also parse actor names from notification titles as fallback
                    const actorNames = [...new Set(data.map(n => {
                        const match = n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
                        return match ? match[1] : null;
                    }).filter(Boolean))];

                    // Fetch profiles by ID first, then by name as fallback
                    let profileById = {};
                    let profileByName = {};

                    if (actorIds.length > 0) {
                        const { data: profilesById } = await supabase.from('profiles')
                            .select('id, username, full_name, avatar_url')
                            .in('id', actorIds);
                        (profilesById || []).forEach(p => {
                            profileById[p.id] = p;
                        });
                    }

                    if (actorNames.length > 0) {
                        const { data: profilesByName } = await supabase.from('profiles')
                            .select('id, username, full_name, avatar_url')
                            .in('full_name', actorNames);
                        (profilesByName || []).forEach(p => {
                            if (p.full_name) profileByName[p.full_name.toLowerCase()] = p;
                        });
                    }

                    // Merge actor data
                    const enriched = data.map(n => {
                        // Get actor ID from the data JSONB column
                        const actorId = n.data?.actor_id || n.data?.sender_id || n.actor_id;
                        let profile = actorId ? profileById[actorId] : null;

                        // Fallback to name matching
                        if (!profile) {
                            const match = n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
                            const actorName = match ? match[1] : null;
                            profile = actorName ? profileByName[actorName.toLowerCase()] : null;
                        }

                        const displayName = n.data?.actor_name || n.data?.sender_name || n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/)?.[1] || n.title;

                        return {
                            ...n,
                            actor_avatar_url: profile?.avatar_url || null,
                            actor_name: displayName,
                            actor_username: profile?.username || null
                        };
                    });
                    setNotifications(enriched);

                    // Auto-mark as read
                    const unreadIds = data.filter(n => !n.read).map(n => n.id);
                    if (unreadIds.length > 0) {
                        await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
                        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                    }
                }
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

    // ═══════════════════════════════════════════════════════════════════════════
    // FRIEND REQUEST HANDLERS (Facebook-style: Decline = Auto-Follow)
    // ═══════════════════════════════════════════════════════════════════════════

    const handleAcceptFriendRequest = async (notification, e) => {
        e.stopPropagation(); // Prevent navigation

        // Get sender_id from notification data (stored by the trigger)
        const requesterId = notification.data?.sender_id || notification.data?.actor_id || notification.actor_id;
        const friendshipId = notification.data?.friendship_id;

        console.log('Accept clicked:', { requesterId, friendshipId, notificationData: notification.data });

        if (!requesterId || !user) {
            console.error('Missing requesterId or user');
            return;
        }

        try {
            // Use friendship_id directly if available, otherwise find it
            let requestId = friendshipId;

            if (!requestId) {
                const { data: request } = await supabase
                    .from('friendships')
                    .select('id')
                    .eq('user_id', requesterId)
                    .eq('friend_id', user.id)
                    .eq('status', 'pending')
                    .single();
                requestId = request?.id;
            }

            if (requestId) {
                // Update request to accepted
                await supabase.from('friendships').update({ status: 'accepted' }).eq('id', requestId);

                // Create reverse friendship
                await supabase.from('friendships').upsert({
                    user_id: user.id,
                    friend_id: requesterId,
                    status: 'accepted'
                }, { onConflict: 'user_id,friend_id' });

                // Update notification to show accepted
                await supabase.from('notifications').update({
                    message: 'is now your friend!',
                    type: 'friend_accepted'
                }).eq('id', notification.id);

                // Update local state
                setNotifications(prev => prev.map(n =>
                    n.id === notification.id
                        ? { ...n, message: 'is now your friend!', type: 'friend_accepted', handled: true }
                        : n
                ));

                console.log('Friend request accepted successfully!');
            } else {
                console.error('Could not find friendship to accept');
            }
        } catch (err) {
            console.error('Error accepting friend request:', err);
        }
    };

    const handleDeclineFriendRequest = async (notification, e) => {
        e.stopPropagation(); // Prevent navigation

        // Get sender_id from notification data (stored by the trigger)
        const requesterId = notification.data?.sender_id || notification.data?.actor_id || notification.actor_id;
        const friendshipId = notification.data?.friendship_id;

        console.log('Decline clicked:', { requesterId, friendshipId, notificationData: notification.data });

        if (!requesterId || !user) {
            console.error('Missing requesterId or user');
            return;
        }

        try {
            // Delete the friend request using friendship_id if available
            if (friendshipId) {
                await supabase.from('friendships').delete().eq('id', friendshipId);
            } else {
                await supabase
                    .from('friendships')
                    .delete()
                    .eq('user_id', requesterId)
                    .eq('friend_id', user.id)
                    .eq('status', 'pending');
            }

            // 🔥 FACEBOOK-STYLE: Auto-convert to follower
            // The requester now FOLLOWS the person who declined
            await supabase.from('follows').upsert({
                follower_id: requesterId,     // Person who sent request
                following_id: user.id,        // Person who declined (me)
                source: 'declined_friend_request'
            }, { onConflict: 'follower_id,following_id' });

            // Update notification
            await supabase.from('notifications').update({
                message: 'is now following you',
                type: 'new_follow'
            }).eq('id', notification.id);

            // Update local state
            setNotifications(prev => prev.map(n =>
                n.id === notification.id
                    ? { ...n, message: 'is now following you', type: 'new_follow', handled: true }
                    : n
            ));

            console.log('Friend request declined, auto-followed!');
        } catch (err) {
            console.error('Error declining friend request:', err);
        }
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
        <PageTransition>
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
                {/* Header - Universal Header */}
                <UniversalHeader pageDepth={2} />
                <header style={{ background: C.card, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                        notifications.map(n => {
                            const actionIcon = n.type === 'like' ? '👍' : n.type === 'comment' ? '💬' : n.type === 'mention' ? '@' : n.type === 'friend_request' ? '👥' : n.type === 'friend_accepted' ? '✓' : n.type === 'new_follow' ? '💜' : n.type === 'live' ? '🔴' : '🔔';
                            const iconBg = n.type === 'like' ? '#1877F2' : n.type === 'comment' ? '#44BD32' : n.type === 'live' ? '#FA383E' : n.type === 'friend_request' || n.type === 'friend_accepted' ? '#42B72A' : '#65676B';

                            return (
                                <div
                                    key={n.id}
                                    onClick={() => {
                                        if (n.actor_username) {
                                            router.push(`/hub/user/${n.actor_username}`);
                                        }
                                    }}
                                    style={{
                                        padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
                                        background: n.read ? C.card : 'rgba(24, 119, 242, 0.08)',
                                        borderBottom: `1px solid ${C.border}`, cursor: n.actor_username ? 'pointer' : 'default'
                                    }}
                                >
                                    {/* Facebook-style avatar with action icon */}
                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                        <img
                                            src={n.actor_avatar_url || '/default-avatar.png'}
                                            style={{
                                                width: 56, height: 56, borderRadius: '50%',
                                                objectFit: 'cover', border: '2px solid #ddd'
                                            }}
                                        />
                                        <div style={{
                                            position: 'absolute', bottom: -2, right: -2,
                                            width: 24, height: 24, borderRadius: '50%',
                                            background: iconBg, border: '2px solid white',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 12
                                        }}>{actionIcon}</div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 15, color: C.text, lineHeight: 1.4 }}>
                                            <span style={{ fontWeight: 700 }}>{n.actor_name || n.title}</span>
                                            {' '}{n.message}
                                        </div>
                                        <div style={{ fontSize: 12, color: n.read ? C.textSec : C.blue, marginTop: 4, fontWeight: n.read ? 400 : 600 }}>
                                            {timeAgo(n.created_at)}
                                        </div>

                                        {/* Accept/Decline buttons for friend requests */}
                                        {n.type === 'friend_request' && !n.handled && (
                                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                                <button
                                                    onClick={(e) => handleAcceptFriendRequest(n, e)}
                                                    style={{
                                                        padding: '8px 20px',
                                                        borderRadius: 8,
                                                        border: 'none',
                                                        background: C.blue,
                                                        color: 'white',
                                                        fontWeight: 600,
                                                        fontSize: 14,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    Confirm
                                                </button>
                                                <button
                                                    onClick={(e) => handleDeclineFriendRequest(n, e)}
                                                    style={{
                                                        padding: '8px 20px',
                                                        borderRadius: 8,
                                                        border: 'none',
                                                        background: '#E4E6EB',
                                                        color: C.text,
                                                        fontWeight: 600,
                                                        fontSize: 14,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    title="They'll become your follower"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    {!n.read && (
                                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: C.blue, flexShrink: 0, marginTop: 8 }} />
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Bottom padding for mobile nav */}
                <div style={{ height: 80 }} />
            </div>
        </PageTransition>
    );
}
