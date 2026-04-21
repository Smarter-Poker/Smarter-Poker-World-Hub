/**
 * NOTIFICATIONS PAGE
 * Full-page view of all user notifications
 */

import SEOHead from '../../src/components/seo/SEOHead';
import { ThumbsUp, Heart, MessageCircle, AtSign, UserPlus, UserCheck, Eye, Radio, Spade, Bell, Share2, Star, Trophy, Banknote, ShieldCheck, Users, Megaphone, Gift, TrendingUp, Zap, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/router';
import toast from '../../src/stores/toastStore';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser } from '../../src/lib/authUtils';
import { eventBus, EventType, busEmit } from '../../src/engine/EventBus';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { broadcastSync, listenBroadcast, BROADCAST_TAB_ID } from '../../src/lib/broadcastSync';

// God-Mode Stack
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { HubErrorBoundary } from '../../src/components/ui/HubErrorBoundary';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getAccessToken } from '../../src/lib/authUtils';
import BottomNavBar from '../../src/components/ui/BottomNavBar';

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

function NotificationsPage() {
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const hasCacheRef = useRef(false);
    const [swipedId, setSwipedId] = useState(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [deletingIds, setDeletingIds] = useState(new Set());
    const touchStartRef = useRef({ x: 0, y: 0, id: null });
    // 🔲 Detect when rendered inside FullScreenPageOverlay iframe — hide chrome
    const [isInIframe, setIsInIframe] = useState(false);
    useEffect(() => {
        try { setIsInIframe(window.self !== window.top); } catch (_) { setIsInIframe(true); }
    }, []);

    // ── Delete notification ──────────────────────────────────────
    const handleDelete = useCallback(async (notifId, e) => {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        // [Audit#5] Skip synthetic poker-prefixed IDs — they have no DB row
        const isPokerNotif = typeof notifId === 'string' && notifId.startsWith('poker-');
        setConfirmDeleteId(null);
        setSwipedId(null);
        // [Audit#2] Snapshot state for rollback on API failure
        let snapshot;
        setNotifications(prev => { snapshot = prev; return prev; });
        // Optimistic removal with fade
        setDeletingIds(prev => new Set([...prev, notifId]));
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== notifId));
            setDeletingIds(prev => { const s = new Set(prev); s.delete(notifId); return s; });
            // [Audit#4] Sync localStorage cache on delete so deleted items don't reappear
            try {
                const cached = localStorage.getItem('sp-notif-cache');
                if (cached) {
                    const parsed = JSON.parse(cached).filter(n => n.id !== notifId);
                    localStorage.setItem('sp-notif-cache', JSON.stringify(parsed));
                }
            } catch (_) {}
        }, 300);
        // [Audit#11] Broadcast delete to other tabs so they remove it too
        broadcastSync('smarter_poker_notif_sync', { action: 'delete', id: notifId, tabId: BROADCAST_TAB_ID });
        if (isPokerNotif) return; // [Audit#5] Don't hit API for synthetic IDs
        try {
            // [Audit#1] getAccessToken() is async — was missing await
            const token = await getAccessToken();
            const resp = await fetch('/api/notifications/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ id: notifId })
            });
            // [Audit#2] Rollback optimistic remove on API failure
            if (!resp.ok && snapshot && mounted.current) {
                console.warn('[Delete Notif] API error, rolling back UI');
                setNotifications(snapshot);
                setDeletingIds(prev => { const s = new Set(prev); s.delete(notifId); return s; });
            }
        } catch (err) {
            // [Audit#2] Rollback on network error
            console.error('[Delete Notif]', err);
            if (snapshot && mounted.current) setNotifications(snapshot);
            setDeletingIds(prev => { const s = new Set(prev); s.delete(notifId); return s; });
        }
    }, []);

    // ── Swipe handlers (mobile) ──────────────────────────────────
    const onTouchStart = useCallback((notifId, e) => {
        const touch = e.touches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, id: notifId };
    }, []);
    const onTouchEnd = useCallback((e) => {
        const touch = e.changedTouches[0];
        const { x: startX, y: startY, id } = touchStartRef.current;
        const dx = touch.clientX - startX;
        const dy = Math.abs(touch.clientY - startY);
        // Require >60px horizontal, <30px vertical
        if (dx < -60 && dy < 30 && id) {
            setSwipedId(id);
        } else if (dx > 40 && id) {
            setSwipedId(null);
        }
        touchStartRef.current = { x: 0, y: 0, id: null };
    }, []);

    // 🛡️ INSTANT UI: Hydrate from localStorage AFTER mount (prevents SSR mismatch)
    useEffect(() => {
        try {
            const cached = localStorage.getItem('sp-notif-cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed && parsed.length > 0) {
                    setNotifications(parsed);
                    setLoading(false); // Skip shimmer — show cached data immediately
                    hasCacheRef.current = true;
                }
            }
        } catch (_) {}
    }, []);

    const mounted = useRef(true);
    useEffect(() => {
        return () => { mounted.current = false; };
    }, []);

    useTrainingBus('notifications');

    const menuConfig = getMenuConfig('notifications', user, {}, {});

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        const fetchNotifications = async () => {
            //  BULLETPROOF: Use authUtils to avoid AbortError
            const au = getAuthUser();
            if (au) {
                setUser(au);

                // Fetch social & poker notifications through API (service role, bypasses RLS)
                // [Audit#1] getAccessToken is async — was missing await here too
                const token = await getAccessToken();
                const headers = { 'Authorization': 'Bearer ' + token };

                const [socialRes, pokerRes] = await Promise.all([
                    fetch('/api/notifications/list?limit=50', { headers, signal })
                        .then(r => {
                            if (!r.ok) { console.warn('[Notifications] list API returned', r.status); return { success: false }; }
                            return r.json();
                        })
                        .catch(() => ({ success: false })),
                    fetch('/api/poker/notifications?user_id=' + encodeURIComponent(au.id) + '&limit=30', { headers, signal })
                        .then(r => {
                            if (!r.ok) { console.warn('[Notifications] poker API returned', r.status); return { success: false }; }
                            return r.json();
                        })
                        .catch(() => ({ success: false })),
                ]);

                // Merge poker page notifications into the stream
                const pokerNotifs = (pokerRes.success && pokerRes.notifications) ? pokerRes.notifications.map(pn => ({
                    id: 'poker-' + pn.id,
                    user_id: au.id,
                    title: pn.title || 'Page Update',
                    message: pn.message || pn.content || '',
                    type: pn.notification_type || 'page_update',
                    read: pn.read || false,
                    created_at: pn.created_at,
                    data: { page_type: pn.page_type, page_id: pn.page_id },
                    _source: 'poker',
                })) : [];

                const data = (socialRes.success && socialRes.notifications) ? socialRes.notifications : [];
                const combined = [...(data || []).map(n => ({ ...n, _source: 'social' })), ...pokerNotifs]
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                    .slice(0, 60);

                if (combined.length > 0) {
                    // Collect actor IDs from the data JSONB column
                    const actorIds = [...new Set(combined.map(n =>
                        n.data?.actor_id || n.data?.sender_id
                    ).filter(Boolean))];

                    // Also parse actor names from notification titles as fallback
                    const actorNames = [...new Set(combined.map(n => {
                        const match = n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
                        return match ? match[1] : null;
                    }).filter(Boolean))];

                    // Fetch profiles by ID AND by name IN PARALLEL (saves 100-300ms)
                    let profileById = {};
                    let profileByName = {};

                    const [profilesByIdResult, profilesByNameResult] = await Promise.all([
                        actorIds.length > 0
                            ? supabase.from('profiles')
                                .select('id, username, full_name, avatar_url')
                                .in('id', actorIds)
                                .limit(50)
                            : Promise.resolve({ data: null }),
                        actorNames.length > 0
                            ? supabase.from('profiles')
                                .select('id, username, full_name, avatar_url')
                                .in('full_name', actorNames)
                                .limit(50)
                            : Promise.resolve({ data: null }),
                    ]);

                    if (profilesByIdResult.data) {
                        profilesByIdResult.data.forEach(p => { profileById[p.id] = p; });
                    }
                    if (profilesByNameResult.data) {
                        profilesByNameResult.data.forEach(p => {
                            if (p.full_name) profileByName[p.full_name.toLowerCase()] = p;
                        });
                    }

                    // Merge actor data
                    const enriched = combined.map(n => {
                        // Get actor ID from the data JSONB column
                        const actorId = n.data?.actor_id || n.data?.sender_id;
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
                    if (mounted.current) {
                        setNotifications(enriched);
                        setLoading(false);
                        // Cache for instant load next time (keep last 30 for storage space)
                        try {
                            localStorage.setItem('sp-notif-cache', JSON.stringify(enriched.slice(0, 30)));
                        } catch (_) {}
                    }

                    // Auto-mark social notifications as read (only social ones use supabase table)
                    const unreadIds = enriched.filter(n => !n.read && n._source === 'social').map(n => n.id);
                    if (unreadIds.length > 0) {
                        await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
                        if (mounted.current) {
                            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                            // Update cache with read status
                            try {
                                const updated = enriched.map(n => ({ ...n, read: true }));
                                localStorage.setItem('sp-notif-cache', JSON.stringify(updated.slice(0, 30)));
                            } catch (_) {}
                        }
                        // Sync notification count to header badge cache
                        try { localStorage.setItem('sp-notif-count', '0'); } catch (_) {}
                    }
                } else if (mounted.current) {
                    // [Audit#14] No notifications — clear state
                    setNotifications([]);
                    setLoading(false);
                }
            } else {
                // [Audit#14] Not logged in — clear loading state to avoid infinite shimmer
                if (mounted.current) setLoading(false);
            }
        };
        // Note: setLoading(false) for logged-in path is called inside the if-block above
        // (after notifications are set), NOT here, to avoid a double-render.
        fetchNotifications();
        return () => controller.abort();
    }, []);
    // Realtime subscription — live updates
    useEffect(() => {
        if (!user?.id) return;
        const _ch = supabase
            .channel(`notifs:${user.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
                // Prepend new notification to the list in real-time
                if (payload.new) {
                    const n = payload.new;
                    if (mounted.current) {
                        setNotifications(prev => [{
                            ...n,
                            _source: 'social',
                            actor_name: n.title || 'New Notification',
                            actor_avatar_url: null,
                        }, ...prev]);
                    }
                }
            })
            // [Audit#3] Subscribe to DELETE events so other-device deletes sync to this tab
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
                if (payload.old?.id && mounted.current) {
                    setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
                    try {
                        const cached = localStorage.getItem('sp-notif-cache');
                        if (cached) {
                            const parsed = JSON.parse(cached).filter(n => n.id !== payload.old.id);
                            localStorage.setItem('sp-notif-cache', JSON.stringify(parsed));
                        }
                    } catch (_) {}
                }
            })
            .subscribe();

        // BroadcastChannel: cross-tab notif sync
        const cleanupNotifBc = listenBroadcast('smarter_poker_notif_sync', (msg) => {
            if (msg?.tabId === BROADCAST_TAB_ID) return;
            // [Audit#3] Another tab deleted a notif — sync it here too
            if (msg?.action === 'delete' && msg?.id && mounted.current) {
                setNotifications(prev => prev.filter(n => n.id !== msg.id));
            } else if (mounted.current) {
                // Another tab marked all as read
                setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            }
        });

        return () => {
            supabase.removeChannel(_ch);
            cleanupNotifBc();
        };
    }, [user?.id]);

    const markAsRead = async (id) => {
        // [Audit#12] Guard poker-prefixed IDs — they don't exist in DB
        const isPoker = typeof id === 'string' && id.startsWith('poker-');
        if (!isPoker) {
            await supabase.from('notifications').update({ read: true }).eq('id', id);
        }
        if (mounted.current) {
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        }
        broadcastSync('smarter_poker_notif_sync', { action: 'refresh_notifications', tabId: BROADCAST_TAB_ID });
        eventBus.emit(EventType.NOTIFICATIONS_READ, { count: 1 }, 'NotificationsPage');
        busEmit.dataMutated('notifications');
    };

    const markAllAsRead = async () => {
        if (!user) return;
        const unreadCount = notifications.filter(n => !n.read).length;
        await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
        if (mounted.current) {
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        }
        broadcastSync('smarter_poker_notif_sync', { action: 'refresh_notifications', tabId: BROADCAST_TAB_ID });
        eventBus.emit(EventType.NOTIFICATIONS_READ, { count: unreadCount }, 'NotificationsPage');
        busEmit.dataMutated('notifications');
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // FRIEND REQUEST HANDLERS (SmarterPoker-style: Decline = Auto-Follow)
    // ═══════════════════════════════════════════════════════════════════════════

    const handleAcceptFriendRequest = async (notification, e) => {
        e.stopPropagation(); // Prevent navigation

        // Get sender_id from notification data (stored by the trigger)
        const requesterId = notification.data?.sender_id || notification.data?.actor_id || notification.actor_id;
        const friendshipId = notification.data?.friendship_id;


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
                    .maybeSingle();
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
                    message: 'Is Now Your Friend!',
                    type: 'friend_accepted'
                }).eq('id', notification.id);

                // Update local state
                if (mounted.current) {
                    setNotifications(prev => prev.map(n =>
                        n.id === notification.id
                            ? { ...n, message: 'Is Now Your Friend!', type: 'friend_accepted', handled: true }
                            : n
                    ));
                    toast.success('Friend request accepted!');
                }

                // Sync friends page cross-tab + EventBus
                busEmit.dataMutated('friends');
                broadcastSync('smarter_poker_friends_sync', 'refresh');
            } else {
                console.error('Could not find friendship to accept');
                toast.error('Could not find friend request.');
            }
        } catch (err) {
            console.error('Error accepting friend request:', err);
            toast.error('Failed to accept friend request. Try again.');
        }
    };

    const handleDeclineFriendRequest = async (notification, e) => {
        e.stopPropagation(); // Prevent navigation

        // Get sender_id from notification data (stored by the trigger)
        const requesterId = notification.data?.sender_id || notification.data?.actor_id || notification.actor_id;
        const friendshipId = notification.data?.friendship_id;


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

            //  smarter-poker-style: Auto-convert to follower
            // The requester now FOLLOWS the person who declined
            await supabase.from('follows').upsert({
                follower_id: requesterId,     // Person who sent request
                following_id: user.id,        // Person who declined (me)
                source: 'declined_friend_request'
            }, { onConflict: 'follower_id,following_id' });

            // Update notification
            await supabase.from('notifications').update({
                message: 'Is Now Following You',
                type: 'new_follow'
            }).eq('id', notification.id);

            // Update local state
            if (mounted.current) {
                setNotifications(prev => prev.map(n =>
                    n.id === notification.id
                        ? { ...n, message: 'Is Now Following You', type: 'new_follow', handled: true }
                        : n
                ));
                toast.success('Request declined \u2014 they now follow you.');
            }

            // Sync friends page cross-tab + EventBus
            busEmit.dataMutated('friends');
            broadcastSync('smarter_poker_friends_sync', 'refresh');
        } catch (err) {
            console.error('Error declining friend request:', err);
            toast.error('Failed to decline request. Try again.');
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    if (loading) {
        return (
            <PageTransition>
                <SEOHead title="Notifications" description="Loading notifications..." canonical="/hub/notifications" noindex={true} />
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                    {!isInIframe && <UniversalHeader pageDepth={2} onMenuClick={() => {}} />}
                    <div style={{ maxWidth: 680, margin: '0 auto', padding: 16 }}>
                        {[1,2,3,4,5].map(i => (
                            <div key={i} style={{ display: 'flex', gap: 12, padding: 16, background: C.card, borderBottom: `1px solid ${C.border}` }}>
                                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E4E6EB', animation: 'shimmer 1.5s infinite' }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ width: '70%', height: 14, borderRadius: 7, background: '#E4E6EB', marginBottom: 8, animation: 'shimmer 1.5s infinite' }} />
                                    <div style={{ width: '40%', height: 10, borderRadius: 5, background: '#E4E6EB', animation: 'shimmer 1.5s infinite' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <style jsx>{`
                        @keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
                    `}</style>
                </div>
            </PageTransition>
        );
    }

    return (
        <PageTransition>
            <SEOHead
                title="Notifications"
                description="Stay Updated With Your Latest Activity, Friend Requests, Game Invitations, And Community Updates."
                canonical="/hub/notifications"
                noindex={true}
            />
            <div className="notifications-page" style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                {/* Header - Universal Header (hidden when inside overlay iframe) */}
                {!isInIframe && <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />}
                {!isInIframe && <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="right"
                    theme="light"
                    user={user}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />}
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
                        >Mark All As Read</button>
                    )}
                </header>

                {/* Notifications List — [Audit#17] tap anywhere to dismiss open swipes */}
                <div
                    style={{ maxWidth: 680, margin: '0 auto' }}
                    onClick={() => { if (swipedId) setSwipedId(null); }}
                >
                    {notifications.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center' }}>
                            <div style={{ fontSize: 48, display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                                <Bell size={48} color={C.textSec} />
                            </div>
                            <h3 style={{ color: C.text, marginTop: 8 }}>No Notifications Yet</h3>
                            <p style={{ color: C.textSec }}>When Someone Likes, Comments, Or Tags You, You'll See It Here.</p>
                        </div>
                    ) : (
                        notifications.map(n => {
                            // Comprehensive notification icon map — category-based + message parsing
                            const getNotifIcon = () => {
                                const s = 14; const clr = '#fff';
                                const t = n.type || '';
                                const msg = (n.message || '').toLowerCase();

                                // ── Settlement / Financial ──────────────────
                                if (t === 'settlement' || t === 'weekly_settlement' || t === 'settlement_hold')
                                    return { icon: <Banknote size={s} color={clr} />, bg: '#22C55E' };
                                if (t === 'payout' || t === 'rakeback' || t === 'refund' || t === 'bonus' || t === 'rakeback_sent' || t === 'rakeback_available')
                                    return { icon: <Banknote size={s} color={clr} />, bg: '#22C55E' };

                                // ── Home Games ──────────────────────────────
                                if (t === 'home_game_new' || t === 'home_game' || t === 'home_game_invite')
                                    return { icon: <Spade size={s} color={clr} />, bg: '#00d4ff' };
                                if (t === 'home_game_rsvp' || t === 'home_game_seat_request')
                                    return { icon: <UserCheck size={s} color={clr} />, bg: '#0096ff' };
                                if (t === 'home_game_rsvp_confirmed' || t === 'home_game_rsvp_approved')
                                    return { icon: <UserCheck size={s} color={clr} />, bg: '#22C55E' };
                                if (t === 'home_game_cancelled')
                                    return { icon: <Bell size={s} color={clr} />, bg: '#FA383E' };
                                if (t === 'home_game_host_broadcast' || t === 'home_game_reminder')
                                    return { icon: <Megaphone size={s} color={clr} />, bg: '#ffd60a' };

                                // ── Group / Club ────────────────────────────
                                if (t === 'home_group_announcement' || t === 'home_group_announcement_followed' || t === 'club_announcement' || t === 'venue_announcement') {
                                    if (msg.includes('seat')) return { icon: <UserCheck size={s} color={clr} />, bg: '#1877F2' };
                                    if (msg.includes('roster')) return { icon: <Users size={s} color={clr} />, bg: '#00d4ff' };
                                    return { icon: <Megaphone size={s} color={clr} />, bg: '#ffd60a' };
                                }
                                if (t === 'home_group_friend_joined' || t === 'member_joined') {
                                    if (msg.includes('seat')) return { icon: <UserCheck size={s} color={clr} />, bg: '#1877F2' };
                                    if (msg.includes('roster')) return { icon: <Users size={s} color={clr} />, bg: '#00d4ff' };
                                    if (msg.includes('rsvp') || msg.includes('late')) return { icon: <Bell size={s} color={clr} />, bg: '#ffd60a' };
                                    if (msg.includes('dm_')) return { icon: <MessageCircle size={s} color={clr} />, bg: '#1877F2' };
                                    return { icon: <UserPlus size={s} color={clr} />, bg: '#42B72A' };
                                }
                                if (t === 'home_group_approved' || t === 'home_group_pending_request')
                                    return { icon: <UserCheck size={s} color={clr} />, bg: '#42B72A' };
                                if (t === 'home_group_banned' || t === 'home_group_hidden')
                                    return { icon: <ShieldCheck size={s} color={clr} />, bg: '#FA383E' };

                                // ── Friends & Follows ───────────────────────
                                if (t === 'friend_request')
                                    return { icon: <UserPlus size={s} color={clr} />, bg: '#1877F2' };
                                if (t === 'friend_accepted' || t === 'friend_accept')
                                    return { icon: <UserCheck size={s} color={clr} />, bg: '#42B72A' };
                                if (t === 'new_follow' || t === 'follow' || t === 'follow_request' || t === 'page_new_follower')
                                    return { icon: <Eye size={s} color={clr} />, bg: '#0096ff' };

                                // ── Likes & Reactions ────────────────────────
                                if (t === 'like' || t === 'home_post_like' || t === 'page_like' || t === 'post_liked')
                                    return { icon: <ThumbsUp size={s} color={clr} />, bg: '#1877F2' };
                                if (t === 'love')
                                    return { icon: <Heart size={s} color={clr} />, bg: '#FA383E' };

                                // ── Comments & Messages ──────────────────────
                                if (t === 'comment' || t === 'home_post_comment' || t === 'page_comment' || t === 'post_commented' || t === 'strategy_comment')
                                    return { icon: <MessageCircle size={s} color={clr} />, bg: '#22C55E' };
                                if (t === 'mention' || t === 'page_mention')
                                    return { icon: <AtSign size={s} color={clr} />, bg: '#00d4ff' };
                                if (t === 'message' || t === 'messenger_message' || t === 'missed_call')
                                    return { icon: <MessageCircle size={s} color={clr} />, bg: '#1877F2' };
                                if (t === 'share')
                                    return { icon: <Share2 size={s} color={clr} />, bg: '#1877F2' };

                                // ── Tournaments ─────────────────────────────
                                if (t.startsWith('tournament'))
                                    return { icon: <Trophy size={s} color={clr} />, bg: '#ffd60a' };

                                // ── Achievements & Badges ───────────────────
                                if (t === 'achievement' || t === 'home_badges_earned' || t === 'level_up' || t === 'streak' || t === 'streak_reward')
                                    return { icon: <Star size={s} color={clr} />, bg: '#ffd60a' };

                                // ── Live / Venue ────────────────────────────
                                if (t === 'live' || t === 'live_game' || t === 'called_for_seat' || t === 'seat_ready' || t === 'waitlist_update')
                                    return { icon: <Radio size={s} color={clr} />, bg: '#FA383E' };
                                if (t === 'venue' || t === 'venue_claim_approved' || t === 'venue_review')
                                    return { icon: <Spade size={s} color={clr} />, bg: '#00d4ff' };

                                // ── System / Admin ──────────────────────────
                                if (t === 'system' || t === 'moderation_alert' || t === 'geofence_alert' || t === 'fraud_alert')
                                    return { icon: <Zap size={s} color={clr} />, bg: '#00d4ff' };

                                // ── Smart message-content fallback ──────────
                                if (msg.includes('settlement') || msg.includes('rake')) return { icon: <Banknote size={s} color={clr} />, bg: '#22C55E' };
                                if (msg.includes('friend')) return { icon: <UserPlus size={s} color={clr} />, bg: '#42B72A' };
                                if (msg.includes('tournament') || msg.includes('trophy')) return { icon: <Trophy size={s} color={clr} />, bg: '#ffd60a' };

                                // ── Default ─────────────────────────────────
                                return { icon: <Bell size={s} color={clr} />, bg: '#1877F2' };
                            };
                            const { icon: ActionIcon, bg: iconBg } = getNotifIcon();

                            // Navigate to page detail or user profile
                            const handleClick = () => {
                                // [Audit#18] Mark as read on click-through
                                if (!n.read) markAsRead(n.id);
                                // [Audit#17] Dismiss any open swipe
                                setSwipedId(null);
                                if (n.data?.page_type && n.data?.page_id) {
                                    const pt = n.data.page_type;
                                    const pid = n.data.page_id;
                                    if (pt === 'venue') router.push(`/hub/venues/${pid}`);
                                    else if (pt === 'tour') router.push(`/hub/tours/${pid}`);
                                    else if (pt === 'series') router.push(`/hub/series/${pid}`);
                                    else router.push('/hub/pages');
                                } else if (n.actor_username) {
                                    router.push(`/hub/user/${n.actor_username}`);
                                }
                            };
                            const isClickable = !!(n.data?.page_type && n.data?.page_id) || !!n.actor_username;

                            const isSwiped = swipedId === n.id;
                            const isDeleting = deletingIds.has(n.id);
                            const isConfirming = confirmDeleteId === n.id;

                            return (
                                <div
                                    key={n.id}
                                    style={{
                                        position: 'relative', overflow: 'hidden',
                                        borderBottom: `1px solid ${C.border}`,
                                        opacity: isDeleting ? 0 : 1,
                                        // [Audit#10] 800px to fit friend_request rows with Accept+Decline buttons
                                        maxHeight: isDeleting ? 0 : 800,
                                        transition: 'opacity 0.3s ease, max-height 0.3s ease',
                                    }}
                                >
                                    {/* Delete backdrop (mobile swipe reveal) */}
                                    <div style={{
                                        position: 'absolute', right: 0, top: 0, bottom: 0,
                                        width: 80, background: '#FA383E',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        zIndex: 1
                                    }}>
                                        <button
                                            onClick={(e) => handleDelete(n.id, e)}
                                            style={{
                                                background: 'none', border: 'none', color: '#fff',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                gap: 4, cursor: 'pointer', padding: 8
                                            }}
                                        >
                                            <Trash2 size={20} />
                                            <span style={{ fontSize: 11, fontWeight: 600 }}>Delete</span>
                                        </button>
                                    </div>

                                    {/* Main notification row (slides on swipe) */}
                                    <div
                                        onClick={handleClick}
                                        onTouchStart={(e) => onTouchStart(n.id, e)}
                                        onTouchEnd={onTouchEnd}
                                        style={{
                                            padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
                                            background: n.read ? C.card : 'rgba(24, 119, 242, 0.08)',
                                            cursor: isClickable ? 'pointer' : 'default',
                                            position: 'relative', zIndex: 2,
                                            transform: isSwiped ? 'translateX(-80px)' : 'translateX(0)',
                                            transition: 'transform 0.25s ease-out',
                                        }}
                                    >
                                        {/* Avatar with Lucide action badge */}
                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                            <img
                                                src={n.actor_avatar_url || '/default-avatar.png'}
                                                alt={n.actor_name || 'User'}
                                                style={{
                                                    width: 56, height: 56, borderRadius: '50%',
                                                    objectFit: 'cover', border: '2px solid #ddd'
                                                }}
                                                loading="lazy" />
                                            <div style={{
                                                position: 'absolute', bottom: -2, right: -2,
                                                width: 24, height: 24, borderRadius: '50%',
                                                background: iconBg, border: '2px solid white',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>{ActionIcon}</div>
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
                                                        title="They'll Become Your Follower"
                                                    >
                                                        Decline
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        {/* Unread dot + delete button */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 4 }}>
                                            {!n.read && (
                                                <div style={{ width: 12, height: 12, borderRadius: '50%', background: C.blue }} />
                                            )}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(isConfirming ? null : n.id); setSwipedId(null); }}
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    padding: 4, borderRadius: '50%', display: 'flex',
                                                    opacity: 0.4, transition: 'opacity 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.4'}
                                                title="Delete notification"
                                            >
                                                <X size={16} color={C.textSec} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Confirm delete overlay */}
                                    {isConfirming && (
                                        <div
                                            style={{
                                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                                background: 'rgba(0,0,0,0.75)', zIndex: 10,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12
                                            }}
                                            // [Audit#9] Use e.target check so backdrop click fires Cancel
                                            // but inner button clicks are NOT intercepted by backdrop
                                            onClick={(e) => {
                                                if (e.target === e.currentTarget) {
                                                    e.stopPropagation();
                                                    setConfirmDeleteId(null);
                                                }
                                            }}
                                        >
                                            <button
                                                onClick={(e) => handleDelete(n.id, e)}
                                                style={{
                                                    background: '#FA383E', color: '#fff', border: 'none',
                                                    padding: '10px 24px', borderRadius: 8, fontWeight: 700,
                                                    fontSize: 14, cursor: 'pointer', display: 'flex',
                                                    alignItems: 'center', gap: 6
                                                }}
                                            >
                                                <Trash2 size={16} /> Delete
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                                                style={{
                                                    background: '#E4E6EB', color: C.text, border: 'none',
                                                    padding: '10px 24px', borderRadius: 8, fontWeight: 700,
                                                    fontSize: 14, cursor: 'pointer'
                                                }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Bottom padding for mobile nav */}
                <div style={{ height: isInIframe ? 20 : 80 }} />
            </div>
              {!isInIframe && <BottomNavBar />}
    </PageTransition>
    );
}

export default function NotificationsPageWithBoundary() {
    return (
        <HubErrorBoundary name="Notifications">
            <NotificationsPage />
        </HubErrorBoundary>
    );
}
